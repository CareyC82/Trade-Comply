#!/usr/bin/env node
/**
 * Create a GitHub Issue when pending_data has items awaiting review.
 * Used by policy-tracker workflow after staging commit.
 */

const fs = require('fs');
const path = require('path');
const { listPendingItems } = require('../lib/data-review');

const ROOT = path.join(__dirname, '..');

function summarizeCategories(items) {
    const categories = new Map();
    for (const item of items) {
        const category = item.payload?.category
            || item.payload?.category_label
            || item.kind
            || 'UNKNOWN';
        categories.set(category, (categories.get(category) || 0) + 1);
    }
    return Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `- **${name}**: ${count} item(s)`);
}

function buildIssueBody(items) {
    const adminPort = process.env.ADMIN_REVIEW_PORT || '8787';
    const lines = [
        '## Daily regulatory staging summary',
        '',
        `**Pending items:** ${items.length}`,
        `**Queue updated:** ${new Date().toISOString()}`,
        '',
        '### Categories / kinds',
        ...summarizeCategories(items),
        '',
        '### Items',
        ...items.map((item) => {
            const id = item.kind === 'case' ? item.payload?.case_id : item.payload?.tag_id;
            const title = item.payload?.short_description || item.payload?.title || '(no title)';
            return `- \`${item.pending_id}\` — **${id || 'n/a'}** (${item.kind}): ${title}`;
        }),
        '',
        '### Review steps (required)',
        '',
        '1. `git pull origin main`',
        `2. Start admin: \`ADMIN_REVIEW_PASSWORD=*** node scripts/admin-server.js\``,
        `3. Open **http://127.0.0.1:${adminPort}/admin.html** (password = \`ADMIN_REVIEW_PASSWORD\`, not in URL)`,
        '4. Approve or reject each item',
        '5. Publish in one shot:',
        '   ```bash',
        '   node scripts/publish-reviewed-data.js --dispatch',
        '   ```',
        '',
        '> Production paths (`data/tags.json`, `data/catalog.json`, `data/pending_data/queue.json`) must be pushed together. See README **Developer Workflow & Data Review SOP**.',
        ''
    ];
    return lines.join('\n');
}

async function findOpenIssueForToday(token, owner, repo, dateLabel) {
    const q = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open "Daily Regulatory Update Pending Review - ${dateLabel}" in:title`);
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
        body: JSON.stringify({ title, body })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create issue (${response.status}): ${text.slice(0, 400)}`);
    }

    return response.json();
}

async function main() {
    const items = listPendingItems();
    if (items.length === 0) {
        console.log('No pending items; skipping issue creation.');
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.log('GITHUB_TOKEN not set; skipping issue creation.');
        return;
    }

    const slug = process.env.GITHUB_REPOSITORY || 'CareyC82/Trade-Comply';
    const [owner, repo] = slug.split('/');
    const dateLabel = new Date().toISOString().slice(0, 10);
    const title = `🚨 [Action Required] Daily Regulatory Update Pending Review - ${dateLabel}`;

    const existing = await findOpenIssueForToday(token, owner, repo, dateLabel);
    if (existing) {
        console.log(`Issue already open for today: ${existing.html_url}`);
        return;
    }

    const body = buildIssueBody(items);
    const issue = await createIssue({ token, owner, repo, title, body });
    console.log(`Created review issue: ${issue.html_url}`);
}

main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
