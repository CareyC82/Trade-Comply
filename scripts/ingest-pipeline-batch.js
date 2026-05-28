#!/usr/bin/env node
/**
 * Ingest pipeline/pipeline_batch.json risk signals into pending_data queue.
 */

const fs = require('fs');
const path = require('path');
const { stagePendingItems } = require('../lib/data-review');

const ROOT = path.join(__dirname, '..');
const BATCH_PATH = path.join(ROOT, 'data', 'pending_data', 'pipeline_batch.json');

function main() {
    if (!fs.existsSync(BATCH_PATH)) {
        console.log('No pipeline batch file; nothing to ingest.');
        return;
    }

    const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
    const signals = Array.isArray(batch.signals) ? batch.signals : [];

    if (signals.length === 0) {
        console.log('Pipeline batch is empty.');
        return;
    }

    const { staged, skipped } = stagePendingItems({
        risk_signals: signals,
        meta: {
            pipeline_run: new Date().toISOString(),
            source: 'global-compliance-pipeline'
        },
        source: 'global-compliance-pipeline'
    });

    console.log(`Staged ${staged.length} risk signal(s) into pending_data.`);
    if (skipped.length) {
        console.log(`Skipped ${skipped.length}:`);
        skipped.forEach((entry) => console.log(`  - ${entry.reason || entry.signal_id || 'unknown'}`));
    }

    if (staged.length === 0) {
        process.exit(1);
    }
}

try {
    main();
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
