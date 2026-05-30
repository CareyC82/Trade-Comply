#!/usr/bin/env node
/**
 * Fetch policy announcement pages and write a combined inbox file when content changes.
 *
 * Usage:
 *   node scripts/fetch-policy-news.js
 *   node scripts/fetch-policy-news.js --config data/policy-sources.json
 */

const path = require('path');
const { runPolicyCrawl } = require('../lib/policy-crawl');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
    const options = { configDir: path.join(ROOT, 'data') };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--config') {
            options.configDir = path.dirname(path.resolve(argv[index + 1]));
            index += 1;
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = await runPolicyCrawl({
        dataDir: options.configDir,
        persist: true,
        label: 'fetch-policy-news'
    });

    if (!result.ok) {
        process.exitCode = 1;
        return;
    }

    if (result.changed_count === 0) {
        process.exitCode = result.fetch_errors > 0 ? 1 : 10;
    }
}

main().catch((error) => {
    console.error('=== CRON JOB FAILED: fetch-policy-news ===');
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
