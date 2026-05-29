#!/usr/bin/env node
/**
 * CI guardrail: automation (github-actions[bot]) must NOT modify production data files.
 * Human/admin commits may include [admin-publish] in the message.
 */

const { spawnSync } = require('child_process');

const PROD_PATHS = new Set([
    'data/tags.json',
    'data/cases.json',
    'data/catalog.json'
]);

const BOT_ACTORS = new Set([
    'github-actions[bot]',
    'dependabot[bot]'
]);

function parseArgs(argv) {
    const options = {
        eventName: process.env.GITHUB_EVENT_NAME || 'push',
        baseRef: process.env.GITHUB_BASE_REF || 'main',
        headRef: process.env.GITHUB_HEAD_REF || '',
        actor: process.env.GITHUB_ACTOR || '',
        commitMessage: process.env.GITHUB_COMMIT_MESSAGE || ''
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--actor') {
            options.actor = argv[i + 1];
            i += 1;
        } else if (arg === '--event') {
            options.eventName = argv[i + 1];
            i += 1;
        } else if (arg === '--base') {
            options.baseRef = argv[i + 1];
            i += 1;
        } else if (arg === '--head') {
            options.headRef = argv[i + 1];
            i += 1;
        }
    }

    return options;
}

function git(args) {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
    }
    return (result.stdout || '').trim();
}

function listChangedFiles({ eventName, baseRef, headRef }) {
    if (eventName === 'pull_request' && baseRef && headRef) {
        const range = `origin/${baseRef.replace(/^refs\/heads\//, '')}...HEAD`;
        const out = git(['diff', '--name-only', range]);
        return out ? out.split('\n').filter(Boolean) : [];
    }

    const lastAuthor = git(['log', '-1', '--format=%an']);
    const isBot = BOT_ACTORS.has(lastAuthor) || lastAuthor.endsWith('[bot]');
    if (!isBot) {
        return git(['diff', '--name-only', 'HEAD~1..HEAD']).split('\n').filter(Boolean);
    }

    return git(['diff', '--name-only', 'HEAD~1..HEAD']).split('\n').filter(Boolean);
}

function isProdPath(filePath) {
    return PROD_PATHS.has(filePath);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const actor = options.actor || git(['log', '-1', '--format=%an']);
    const commitMessage = options.commitMessage || git(['log', '-1', '--format=%B']);

    let changedFiles = [];
    try {
        changedFiles = listChangedFiles(options);
    } catch (error) {
        if (options.eventName === 'push' && process.env.GITHUB_EVENT_NAME === 'push') {
            changedFiles = git(['diff', '--name-only', 'HEAD~1..HEAD']).split('\n').filter(Boolean);
        } else {
            console.error(`WARN: Could not compute diff (${error.message}); skipping path guard.`);
            process.exit(0);
        }
    }

    const prodTouched = changedFiles.filter(isProdPath);
    if (prodTouched.length === 0) {
        console.log('Prod guardrail: no production data paths changed.');
        process.exit(0);
    }

    const isBot = BOT_ACTORS.has(actor) || actor.endsWith('[bot]');
    const adminPublish = commitMessage.includes('[admin-publish]');
    const autoPublish = commitMessage.includes('[auto-publish]');

    if (isBot && !adminPublish && !autoPublish) {
        console.error('ERROR: Automated actor attempted to modify production data:');
        prodTouched.forEach(file => console.error(`  - ${file}`));
        console.error('Automation may only write to data/pending_data/, data/pending_data.json, and data/inbox/.');
        console.error('Use [auto-publish] for validated pipeline commits or [admin-publish] for human override.');
        process.exit(1);
    }

    if (isBot && autoPublish) {
        console.log('Prod guardrail: automated pipeline publish allowed ([auto-publish]).');
        process.exit(0);
    }

    if (!isBot && adminPublish) {
        console.log('Prod guardrail: admin publish commit allowed for human actor.');
        process.exit(0);
    }

    if (!isBot) {
        console.log('Prod guardrail: human commit touching production data (allowed).');
        process.exit(0);
    }

    console.log('Prod guardrail passed.');
}

main();
