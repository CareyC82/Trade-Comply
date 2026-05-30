#!/usr/bin/env node
/**
 * Orchestrate policy tracking: fetch -> LLM relevance filter -> inbox -> DeepSeek parse -> merge tags.
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
    console.log('=== CRON JOB START: 凌晨2点政策公告抓取与解析 (GitHub Actions policy-tracker) ===');
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
        console.log('=== CRON JOB SUCCESS: 政策追踪离线模式完成 ===');
        return;
    }

    runNodeScript('scripts/fetch-global-pipeline.js', []);
    console.log('=== CRON JOB SUCCESS: global crawl engine finished (policy-tracker) ===');
}

try {
    main();
} catch (error) {
    console.error('=== CRON JOB FAILED: policy-tracker ===');
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
