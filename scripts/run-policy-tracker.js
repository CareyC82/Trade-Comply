#!/usr/bin/env node
/**
 * Orchestrate policy tracking: fetch announcements -> DeepSeek parse -> merge tags -> rebuild catalog.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/run-policy-tracker.js
 *   node scripts/run-policy-tracker.js --offline
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INBOX_PATH = path.join(ROOT, 'data', 'inbox', 'latest_announcement.txt');
const NODE = process.execPath;

function parseArgs(argv) {
    const options = { offline: false };
    for (const arg of argv) {
        if (arg === '--offline') {
            options.offline = true;
        }
    }
    return options;
}

function runNodeScript(scriptRelativePath, args = [], { allowExitCodes = [] } = {}) {
    const scriptPath = path.join(ROOT, scriptRelativePath);
    const result = spawnSync(NODE, [scriptPath, ...args], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0 && !allowExitCodes.includes(result.status)) {
        throw new Error(`${scriptRelativePath} exited with code ${result.status}`);
    }

    return result.status ?? 0;
}

function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.offline) {
        console.log('Offline mode: using fixture announcement.');
        const status = runNodeScript('scripts/auto-parse-announcement.js', [
            '--offline',
            '--apply',
            '--input',
            'scripts/fixtures/mock_news.txt'
        ]);
        if (status !== 0) {
            process.exit(status);
        }
        console.log('Policy tracker completed in offline mode.');
        return;
    }

    const fetchStatus = runNodeScript('scripts/fetch-policy-news.js', [], {
        allowExitCodes: [10]
    });

    if (fetchStatus === 10) {
        console.log('Policy tracker finished: no new relevant announcements.');
        return;
    }

    const parseArgsList = [
        '--apply',
        '--input',
        path.relative(ROOT, INBOX_PATH)
    ];

    runNodeScript('scripts/auto-parse-announcement.js', parseArgsList);
    console.log('Policy tracker completed successfully.');
}

try {
    main();
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
