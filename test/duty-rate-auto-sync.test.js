const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    MATERIAL_RATE_CHANGE_THRESHOLD,
    isMaterialRateChange,
    buildRunSummary,
    buildExceptionsForRun,
    findMultiPrefixRateConflicts,
    appendMultiPrefixConflicts,
    buildSyncStatusPayload,
    runAutoDutyRateSync
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
    assert.equal(payload.health.priority_rate_matrix, null);
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

test('conflicting official rates inside one multi-prefix rule block auto-apply', () => {
    const run = buildRunSummary('USITC', {
        ok: true,
        changes: [
            { rule: 'US-CN-ELECTRONICS-INDICATIVE', prefix: '8517', old_base_rate: 0.019, new_base_rate: 0 },
            { rule: 'US-CN-ELECTRONICS-INDICATIVE', prefix: '8543', old_base_rate: 0, new_base_rate: 0.019 }
        ],
        errors: []
    }, {
        applied: false,
        mode: 'official-dry-run'
    });
    const conflicts = findMultiPrefixRateConflicts(run);
    const wrapped = appendMultiPrefixConflicts(run).run;

    assert.equal(conflicts.length, 1);
    assert.equal(wrapped.ok, false);
    assert.equal(wrapped.errors[0].rule, 'US-CN-ELECTRONICS-INDICATIVE');

    const payload = buildSyncStatusPayload({
        runs: [wrapped],
        health: { ok: true, sample_count: 1, failed_sample_count: 0, failures: [] }
    });
    assert.equal(payload.status, 'exceptions');
    assert.match(payload.exceptions[0].reason, /USITC duty-rate updater reported/);
});

test('GitHub duty-rate workflow runs tests before committing sync output', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'duty-rate-sync.yml'), 'utf8');

    assert.match(workflow, /cron:\s*"12 18 \* \* \*"/);
    assert.match(workflow, /npm run sync:duty-rates:auto/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /data\/duty-rate-sources\.json/);
    assert.match(workflow, /git pull --ff-only/);
});

test('auto duty-rate sync includes static official-link benchmark countries', async () => {
    const emptyOfficialFetcher = async () => ({
        status_code: 200,
        body: '<html><body>No table in fixture</body></html>'
    });
    const payload = await runAutoDutyRateSync({
        dryRun: true,
        skipOfficialUs: true,
        koreaOfficialFetcher: emptyOfficialFetcher,
        indiaOfficialFetcher: emptyOfficialFetcher
    });
    const staticRun = payload.runs.find(run => run.source === 'Static official-link benchmarks');
    const koreaRun = payload.runs.find(run => run.source === 'Korea Customs official-live');
    const indiaRun = payload.runs.find(run => run.source === 'India Customs official-live');

    assert.ok(staticRun, 'static official-link benchmark run should be included');
    assert.equal(staticRun.mode, 'benchmark');
    assert.equal(staticRun.applied, false);
    assert.equal(staticRun.ok, true, JSON.stringify(staticRun.errors, null, 2));
    assert.equal(staticRun.writes_official_machine_rates, false);
    assert.ok(koreaRun, 'Korea official-live run should be included');
    assert.equal(koreaRun.mode, 'official-live');
    assert.ok(indiaRun, 'India official-live run should be included');
    assert.equal(indiaRun.mode, 'official-live');
    assert.ok(payload.health.priority_rate_matrix, 'auto sync health should expose priority rate matrix summary');
    assert.equal(payload.health.priority_rate_matrix.ok, true, JSON.stringify(payload.health.priority_rate_matrix.failures, null, 2));
    assert.ok(payload.health.priority_rate_matrix.route_count >= 50);
    ['CN', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
        assert.equal(staticRun.countries.includes(country), true, `${country} should be refreshed by static benchmark sync`);
        assert.equal(staticRun.readiness[country].ok, true, `${country} readiness should be OK`);
    });
    assert.equal(staticRun.countries.includes('IN'), false, 'India should run through the official-live updater, not static benchmark batch');
});
