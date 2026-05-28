#!/usr/bin/env node
/**
 * Validate data/pending_data/queue.json structure.
 */

const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'pending_data', 'queue.json');

function main() {
    if (!fs.existsSync(QUEUE_PATH)) {
        console.error('ERROR: missing data/pending_data/queue.json');
        process.exit(1);
    }

    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const errors = [];

    if (!queue.version) {
        errors.push('queue.version is required');
    }
    if (!Array.isArray(queue.items)) {
        errors.push('queue.items must be an array');
    } else {
        queue.items.forEach((item, index) => {
            if (!item.pending_id) {
                errors.push(`items[${index}].pending_id is required`);
            }
            if (!item.kind) {
                errors.push(`items[${index}].kind is required`);
            }
            if (!item.payload || typeof item.payload !== 'object') {
                errors.push(`items[${index}].payload is required`);
            }
        });
    }

    if (errors.length) {
        errors.forEach(message => console.error(`ERROR: ${message}`));
        process.exit(1);
    }

    const pending = queue.items.filter(item => !item.status || item.status === 'pending');
    console.log(`Pending queue valid. ${pending.length} pending item(s).`);
}

main();
