#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function main() {
    const payload = readJson(STATUS_PATH);
    if (!payload) {
        console.log('Duty-rate sync diagnostics: no data/duty-rate-sync-status.json file found yet.');
        return;
    }

    const diagnostics = payload.ci_diagnostics || {};
    const counts = payload.counts || {};
    const digest = payload.automation_digest || {};
    const exceptions = Array.isArray(payload.exceptions) ? payload.exceptions : [];

    console.log('Duty-rate sync diagnostics');
    console.log(`- Outcome: ${diagnostics.outcome || payload.status || 'unknown'}`);
    console.log(`- Summary: ${diagnostics.summary || digest.headline || 'No diagnostic summary available.'}`);
    if (diagnostics.failed_step_hint) {
        console.log(`- Likely failing step: ${diagnostics.failed_step_hint}`);
    }
    console.log(`- Next action: ${diagnostics.next_action || digest.next_best_action || 'Review duty-rate sync status JSON.'}`);
    console.log(`- Sources checked: ${counts.sources_checked ?? 0}; exceptions: ${counts.exceptions ?? exceptions.length}; parser gaps: ${counts.parser_gap_sources ?? 0}; degraded: ${counts.degraded_sources ?? 0}`);

    if (exceptions.length) {
        console.log('- First exceptions:');
        exceptions.slice(0, 5).forEach((exception, index) => {
            console.log(`  ${index + 1}. ${exception.source || 'source'}: ${exception.reason || exception.type || 'unknown issue'}`);
        });
    }
}

if (require.main === module) {
    main();
}
