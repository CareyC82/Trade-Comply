#!/usr/bin/env node
/**
 * One-shot publish: commit tags + catalog + pending queue, push, optional repository_dispatch.
 *
 * Usage:
 *   node scripts/publish-reviewed-data.js
 *   node scripts/publish-reviewed-data.js --dispatch
 */

const { publishReviewedDataToGit } = require('../lib/publish-sync');

function parseArgs(argv) {
    const options = { dispatch: false, message: '' };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--dispatch') {
            options.dispatch = true;
        } else if (argv[i] === '--message' && argv[i + 1]) {
            options.message = argv[i + 1];
            i += 1;
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = await publishReviewedDataToGit({
        message: options.message || 'chore: publish reviewed compliance data [admin-publish]',
        dispatch: options.dispatch
    });

    console.log(result.message);
    if (result.paths?.length) {
        console.log('Paths:', result.paths.join(', '));
    }

    if (!result.ok) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
