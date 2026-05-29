/**
 * Git publish + repository_dispatch for Pages/FC sync after admin approve.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROD_PUBLISH_PATHS = [
    'data/tags.json',
    'data/cases.json',
    'data/catalog.json',
    'data/pending_data/queue.json'
];

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        ...options
    });
    return result;
}

function gitOutput(args) {
    const result = run('git', args);
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
    }
    return (result.stdout || '').trim();
}

function validateCatalogFresh() {
    const result = run(process.execPath, ['scripts/build-catalog.js', '--check']);
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || 'catalog check failed').trim());
    }
}

function getChangedPublishPaths() {
    const status = gitOutput(['status', '--porcelain', '--', ...PROD_PUBLISH_PATHS]);
    if (!status) {
        return [];
    }
    return status
        .split('\n')
        .map(line => line.slice(3).trim())
        .filter(Boolean);
}

function getUnpushedPublishCommits() {
    let range = 'origin/main..HEAD';
    const check = run('git', ['rev-parse', '--verify', 'origin/main']);
    if (check.status !== 0) {
        range = 'HEAD~5..HEAD';
    }
    const result = run('git', ['log', range, '--oneline', '--', ...PROD_PUBLISH_PATHS]);
    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }
    return result.stdout.trim().split('\n').filter(Boolean);
}

function hasUnpushedAdminPublishCommit() {
    let range = 'origin/main..HEAD';
    const check = run('git', ['rev-parse', '--verify', 'origin/main']);
    if (check.status !== 0) {
        return false;
    }
    const result = run('git', ['log', range, '--grep=[admin-publish]', '--oneline']);
    return Boolean(result.stdout?.trim());
}

function pushHeadToOrigin() {
    const push = run('git', ['push', 'origin', 'HEAD']);
    if (push.status !== 0) {
        throw new Error(push.stderr?.trim() || 'git push failed');
    }
}

async function dispatchRepositoryEvent({
    token,
    owner,
    repo,
    eventType = 'prod-data-published',
    clientPayload = {}
}) {
    if (!token) {
        throw new Error('GITHUB_TOKEN is required for repository_dispatch.');
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_type: eventType,
            client_payload: clientPayload
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`repository_dispatch failed (${response.status}): ${body.slice(0, 300)}`);
    }
}

function resolveRepoFromEnv() {
    const slug = process.env.GITHUB_REPOSITORY || '';
    if (slug.includes('/')) {
        const [owner, repo] = slug.split('/');
        return { owner, repo };
    }
    return {
        owner: process.env.GITHUB_REPOSITORY_OWNER || 'CareyC82',
        repo: process.env.GITHUB_REPOSITORY_NAME || 'Trade-Comply'
    };
}

/**
 * Stage, commit, and push the three core publish paths. Commit message must include [admin-publish].
 */
async function publishReviewedDataToGit({
    message = 'chore: publish reviewed compliance data [admin-publish]',
    dispatch = false
} = {}) {
    validateCatalogFresh();

    const changed = getChangedPublishPaths();
    if (changed.length === 0) {
        if (hasUnpushedAdminPublishCommit()) {
            const unpushed = getUnpushedPublishCommits();
            const push = run('git', ['push', 'origin', 'HEAD']);
            if (push.status !== 0) {
                throw new Error(push.stderr?.trim() || 'git push failed');
            }

            let dispatched = false;
            if (dispatch) {
                const token = process.env.GITHUB_TOKEN || process.env.ADMIN_PUBLISH_TOKEN;
                const { owner, repo } = resolveRepoFromEnv();
                await dispatchRepositoryEvent({
                    token,
                    owner,
                    repo,
                    clientPayload: {
                        source: 'admin-publish',
                        committed_at: new Date().toISOString(),
                        paths: PROD_PUBLISH_PATHS,
                        note: 'pushed existing local [admin-publish] commit'
                    }
                });
                dispatched = true;
            }

            return {
                ok: true,
                pushed: true,
                dispatched,
                paths: PROD_PUBLISH_PATHS,
                message: dispatched
                    ? `Pushed existing reviewed commit to GitHub (${unpushed[0] || 'admin-publish'}).`
                    : `Pushed existing reviewed commit to GitHub. Pages will update shortly.`
            };
        }

        return {
            ok: true,
            pushed: false,
            dispatched: false,
            message: 'No publish-path changes to commit. If you already approved, run: git push origin main'
        };
    }

    run('git', ['add', ...PROD_PUBLISH_PATHS]);
    const staged = gitOutput(['diff', '--cached', '--name-only']);
    if (!staged) {
        return {
            ok: true,
            pushed: false,
            dispatched: false,
            message: 'Nothing staged after git add.'
        };
    }

    const commitMsg = message.includes('[admin-publish]') ? message : `${message} [admin-publish]`;
    const commit = run('git', ['commit', '-m', commitMsg]);
    if (commit.status !== 0) {
        throw new Error(commit.stderr?.trim() || 'git commit failed');
    }

    const push = run('git', ['push', 'origin', 'HEAD']);
    if (push.status !== 0) {
        throw new Error(push.stderr?.trim() || 'git push failed');
    }

    let dispatched = false;
    if (dispatch) {
        const token = process.env.GITHUB_TOKEN || process.env.ADMIN_PUBLISH_TOKEN;
        const { owner, repo } = resolveRepoFromEnv();
        await dispatchRepositoryEvent({
            token,
            owner,
            repo,
            clientPayload: {
                source: 'admin-publish',
                committed_at: new Date().toISOString(),
                paths: staged.split('\n').filter(Boolean)
            }
        });
        dispatched = true;
    }

    return {
        ok: true,
        pushed: true,
        dispatched,
        paths: staged.split('\n').filter(Boolean),
        message: dispatched
            ? 'Published to GitHub and dispatched prod-data-published sync.'
            : 'Published to GitHub. Pages will update from push; run with --dispatch to redeploy FC.'
    };
}

async function maybeTriggerPublishSyncAfterApprove({ pendingId } = {}) {
    if (process.env.AUTO_PUBLISH_SYNC !== '1') {
        return { skipped: true, reason: 'AUTO_PUBLISH_SYNC is not enabled' };
    }

    try {
        return await publishReviewedDataToGit({
            message: `chore: publish reviewed item ${pendingId || ''} [admin-publish]`.trim(),
            dispatch: process.env.PUBLISH_DISPATCH === '1'
        });
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = {
    PROD_PUBLISH_PATHS,
    publishReviewedDataToGit,
    maybeTriggerPublishSyncAfterApprove,
    dispatchRepositoryEvent,
    validateCatalogFresh
};
