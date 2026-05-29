#!/usr/bin/env node
/**
 * Open a GitHub Issue when guardrail intercepted rows in data/pending_data.json.
 */

const { loadInterceptedStore } = require('../lib/auto-publish');

function buildIssueBody(items) {
    const lines = [
        '## Guardrail interception summary',
        '',
        `**Intercepted rows:** ${items.length}`,
        `**Generated at:** ${new Date().toISOString()}`,
        '',
        'These rows failed automated validation and were **not** published to production.',
        'Review `data/pending_data.json`, fix or discard, then optionally merge manually.',
        '',
        '### Rows',
        ...items.slice(0, 30).map((item, index) => {
            const raw = item.raw || {};
            const id = raw.signal_id || raw.tag_id || raw.case_id || raw.hs_code || `row-${index + 1}`;
            const reasons = (item.reasons || []).join('; ');
            const preview = (raw.content_en || raw.short_description || raw.description || '').slice(0, 120);
            return `${index + 1}. **${id}** (${item.kind || 'unknown'})\n   - Reasons: ${reasons || 'n/a'}\n   - Preview: ${preview || '(empty)'}`;
        })
    ];

    if (items.length > 30) {
        lines.push('', `_…and ${items.length - 30} more row(s) in pending_data.json._`);
    }

    return lines.join('\n');
}

async function findOpenGuardrailIssue(token, owner, repo, count) {
    const titleFragment = `${count} rows intercepted by Guardrail`;
    const q = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open "${titleFragment}" in:title`);
    const response = await fetch(`https://api.github.com/search/issues?q=${q}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (!response.ok) {
        return null;
    }
    const data = await response.json();
    return data.items?.[0] || null;
}

async function createIssue({ token, owner, repo, title, body }) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, body, labels: ['guardrail', 'data-review'] })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create issue (${response.status}): ${text.slice(0, 400)}`);
    }

    return response.json();
}

async function main() {
    const store = loadInterceptedStore();
    const recent = (store.items || []).filter((item) => {
        if (!item.intercepted_at) {
            return true;
        }
        const ageMs = Date.now() - new Date(item.intercepted_at).getTime();
        return ageMs < 48 * 60 * 60 * 1000;
    });

    if (recent.length === 0) {
        console.log('No recent guardrail intercepts; skipping issue.');
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.log('GITHUB_TOKEN not set; skipping guardrail issue.');
        return;
    }

    const slug = process.env.GITHUB_REPOSITORY || 'CareyC82/Trade-Comply';
    const [owner, repo] = slug.split('/');
    const count = recent.length;
    const title = `🚨 [Action Required] Clean-up Needed: ${count} rows intercepted by Guardrail`;

    const existing = await findOpenGuardrailIssue(token, owner, repo, count);
    if (existing) {
        console.log(`Guardrail issue already open: ${existing.html_url}`);
        return;
    }

    const issue = await createIssue({
        token,
        owner,
        repo,
        title,
        body: buildIssueBody(recent)
    });
    console.log(`Created guardrail issue: ${issue.html_url}`);
}

main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
