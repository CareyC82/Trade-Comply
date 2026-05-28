#!/usr/bin/env node
/**
 * Approve or reject a pending review item from the CLI.
 *
 * Usage:
 *   node scripts/apply-review-action.js --approve pend_123_abc
 *   node scripts/apply-review-action.js --reject pend_123_abc
 *   node scripts/apply-review-action.js --list
 */

const {
    listPendingItems,
    approvePendingItem,
    rejectPendingItem
} = require('../lib/data-review');

function printHelp() {
    console.log(`Usage:
  node scripts/apply-review-action.js --list
  node scripts/apply-review-action.js --approve <pending_id>
  node scripts/apply-review-action.js --reject <pending_id>
`);
}

function parseArgs(argv) {
    const options = { list: false, approve: null, reject: null, help: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--list') {
            options.list = true;
        } else if (arg === '--approve') {
            options.approve = argv[index + 1];
            index += 1;
        } else if (arg === '--reject') {
            options.reject = argv[index + 1];
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    if (options.list) {
        const items = listPendingItems();
        if (items.length === 0) {
            console.log('No pending items.');
            return;
        }
        items.forEach(item => {
            const label = item.kind === 'case'
                ? item.payload?.case_id
                : item.payload?.tag_id;
            console.log(`${item.pending_id} [${item.kind}] ${label} — ${item.payload?.short_description || item.payload?.title || ''}`);
        });
        return;
    }

    if (options.approve) {
        const result = approvePendingItem(options.approve);
        if (!result.ok) {
            console.error(`ERROR: ${result.error}`);
            process.exit(1);
        }
        console.log(result.message);
        console.log(JSON.stringify(result.published, null, 2));
        console.log('\nNext: commit and push data/tags.json, data/catalog.json (and cases.json if applicable).');
        return;
    }

    if (options.reject) {
        const result = rejectPendingItem(options.reject);
        if (!result.ok) {
            console.error(`ERROR: ${result.error}`);
            process.exit(1);
        }
        console.log(result.message);
        return;
    }

    printHelp();
    process.exit(1);
}

try {
    main();
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
