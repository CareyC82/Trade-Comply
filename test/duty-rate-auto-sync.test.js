const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MATERIAL_RATE_CHANGE_THRESHOLD,
    isMaterialRateChange,
    buildRunSummary,
    buildExceptionsForRun,
    buildSyncStatusPayload
} = require('../scripts/auto-sync-duty-rates');

test('material duty-rate changes are detected by percentage-point threshold', () => {
    assert.equal(isMaterialRateChange({
        old_base_rate: 0.025,
        new_base_rate: 0.055
    }), true);
    assert.equal(isMaterialRateChange({
        old_base_rate: 0.025,
        new_base_rate: 0.035
    }), false);
    assert.equal(MATERIAL_RATE_CHANGE_THRESHOLD, 0.03);
});

test('auto sync status treats safe updates as auto-applied without manual review', () => {
    const run = buildRunSummary('Singapore Customs benchmark', {
        ok: true,
        changes: [
            { rule: 'SG-IMPORT-ELECTRONICS', changes: [{ field: 'last_checked_at' }] }
        ],
        errors: []
    }, {
        applied: true,
        mode: 'benchmark'
    });
    const payload = buildSyncStatusPayload({
        startedAt: '2026-06-09T00:00:00.000Z',
        finishedAt: '2026-06-09T00:01:00.000Z',
        runs: [run],
        health: { ok: true, sample_count: 1, failed_sample_count: 0, failures: [] }
    });

    assert.equal(payload.status, 'ok');
    assert.equal(payload.policy.manual_review_required, false);
    assert.equal(payload.counts.sources_auto_applied, 1);
    assert.equal(payload.counts.exceptions, 0);
});

test('source failures and material rate changes become admin-visible exceptions', () => {
    const failedRun = buildRunSummary('USITC', {
        ok: false,
        changes: [],
        errors: [{ rule: 'US-TEST', prefix: '850760', error: 'HTTP 500' }]
    }, {
        applied: false,
        mode: 'official-dry-run'
    });
    const changedRun = buildRunSummary('USITC', {
        ok: true,
        changes: [{ rule: 'US-TEST', old_base_rate: 0.01, new_base_rate: 0.08 }],
        errors: []
    }, {
        applied: true,
        mode: 'official'
    });

    assert.equal(buildExceptionsForRun(failedRun).length, 1);
    assert.equal(buildExceptionsForRun(changedRun).length, 1);

    const payload = buildSyncStatusPayload({
        runs: [failedRun, changedRun],
        health: { ok: true, sample_count: 1, failed_sample_count: 0, failures: [] }
    });
    assert.equal(payload.status, 'exceptions');
    assert.equal(payload.counts.exceptions, 2);
    assert.equal(payload.exceptions.some(item => item.type === 'material_rate_change' && item.auto_applied), true);
});
