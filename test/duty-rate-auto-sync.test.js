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
    buildSourceRunPlan,
    buildAutomationDigest,
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

test('source run plan maps roadmap sources to daily updater runs', () => {
    const plan = buildSourceRunPlan({
        sourcesPayload: {
            sources: [
                {
                    country: 'US',
                    source_status: 'auto_updatable',
                    machine_readable: true,
                    maintenance_priority: 'P0',
                    update_command: 'npm run update:duty-rates:us',
                    next_action: 'Keep USITC sync running.'
                },
                {
                    country: 'IN',
                    source_status: 'hybrid_official_candidate',
                    machine_readable: 'candidate',
                    maintenance_priority: 'P2',
                    update_command: 'npm run update:duty-rates:in:official',
                    next_action: 'Use official-live parser.'
                },
                {
                    country: 'VN',
                    source_status: 'hybrid_official_candidate',
                    machine_readable: 'local_exact_map',
                    maintenance_priority: 'P2',
                    update_command: 'npm run update:duty-rates:static -- --countries=VN',
                    next_action: 'Refresh official-link benchmark.'
                }
            ]
        },
        runs: [
            buildRunSummary('USITC', { ok: true, changes: [], errors: [] }, { applied: true, mode: 'official' }),
            buildRunSummary('India Customs official-live', { ok: false, changes: [], errors: [{ error: 'fixture' }] }, { applied: false, mode: 'official-live' }),
            buildRunSummary('Static official-link benchmarks', { ok: true, changes: [], errors: [], countries: ['VN'] }, { applied: true, mode: 'benchmark' })
        ]
    });

    assert.deepEqual(plan.map(row => row.country), ['US', 'IN', 'VN']);
    assert.equal(plan.find(row => row.country === 'US').run_source, 'USITC');
    assert.equal(plan.find(row => row.country === 'US').run_status, 'ok');
    assert.equal(plan.find(row => row.country === 'US').rate_automation_stage, 'official_machine_sync');
    assert.equal(plan.find(row => row.country === 'US').parser_gap, false);
    assert.equal(plan.find(row => row.country === 'IN').run_source, 'India Customs official-live');
    assert.equal(plan.find(row => row.country === 'IN').run_status, 'exception');
    assert.equal(plan.find(row => row.country === 'IN').rate_automation_stage, 'official_probe_candidate');
    assert.match(plan.find(row => row.country === 'IN').run_plan_action, /Fix updater exception/);
    assert.equal(plan.find(row => row.country === 'VN').run_source, 'Static official-link benchmarks');
    assert.equal(plan.find(row => row.country === 'VN').applied, true);
    assert.equal(plan.find(row => row.country === 'VN').rate_automation_stage, 'maintained_exact_map');
    assert.equal(plan.find(row => row.country === 'VN').parser_gap, true);
});

test('auto sync builds an automation digest for parser and probe gaps', () => {
    const runs = [
        buildRunSummary('EU TARIC benchmark', { ok: true, changes: [], errors: [] }, { applied: true, mode: 'benchmark' }),
        buildRunSummary('India Customs official-live', { ok: false, changes: [], errors: [{ error: 'fixture' }] }, { applied: false, mode: 'official-live' })
    ];
    const sourceRunPlan = buildSourceRunPlan({
        sourcesPayload: {
            sources: [
                {
                    country: 'US',
                    source_status: 'auto_updatable',
                    machine_readable: true,
                    maintenance_priority: 'P0'
                },
                {
                    country: 'EU',
                    source_status: 'hybrid_official_candidate',
                    machine_readable: 'partial',
                    maintenance_priority: 'P1',
                    update_command: 'npm run update:duty-rates:eu'
                },
                {
                    country: 'IN',
                    source_status: 'hybrid_official_candidate',
                    machine_readable: 'candidate',
                    maintenance_priority: 'P2',
                    update_command: 'npm run update:duty-rates:in:official'
                }
            ]
        },
        runs
    });
    const digest = buildAutomationDigest({ runs, sourceRunPlan, health: { ok: true } });

    assert.match(digest.headline, /source exception|parser gap|filing-grade/);
    assert.deepEqual(digest.filing_grade_countries, ['US']);
    assert.deepEqual(digest.exact_code_gate_countries, ['EU']);
    assert.deepEqual(digest.official_probe_countries, ['IN']);
    assert.ok(digest.priority_queue.some(row => row.country === 'EU' && row.workstream === 'exact-code parser'));

    const payload = buildSyncStatusPayload({ runs, sourceRunPlan, health: { ok: true } });
    assert.ok(payload.automation_digest);
    assert.equal(payload.automation_digest.health_ok, true);
});

test('auto duty-rate sync includes static maintained countries', async () => {
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

    assert.ok(staticRun, 'static maintained-country run should be included');
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
    assert.ok(Array.isArray(payload.source_run_plan));
    assert.ok(payload.source_run_plan_summary);
    assert.ok(Array.isArray(payload.automation_upgrade_queue));
    assert.ok(payload.automation_digest);
    assert.ok(Array.isArray(payload.automation_digest.parser_gap_countries));
    assert.ok(payload.source_run_plan_summary.parser_gap_count >= 1);
    assert.ok(payload.automation_upgrade_queue.some(row => row.country === 'KR' && row.rate_automation_stage === 'official_probe_candidate'));
    assert.ok(payload.source_run_plan.some(row => row.country === 'US' && row.run_status === 'not_run'));
    assert.ok(payload.source_run_plan.some(row => row.country === 'IN' && row.run_source === 'India Customs official-live'));
    assert.ok(payload.source_run_plan.some(row => row.country === 'KR' && row.run_source === 'Korea Customs official-live'));
    assert.ok(payload.source_run_plan.some(row => row.country === 'VN' && row.run_source === 'Static official-link benchmarks'));
    ['CN', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
        assert.equal(staticRun.countries.includes(country), true, `${country} should be refreshed by static benchmark sync`);
        assert.equal(staticRun.readiness[country].ok, true, `${country} readiness should be OK`);
    });
    assert.equal(staticRun.countries.includes('IN'), false, 'India should run through the official-live updater, not static benchmark batch');
});

test('auto duty-rate sync downgrades official-live transport failures without blocking daily sync', async () => {
    const failingOfficialFetcher = async () => {
        throw new Error('fetch failed');
    };
    const payload = await runAutoDutyRateSync({
        dryRun: true,
        skipOfficialUs: true,
        koreaOfficialFetcher: failingOfficialFetcher,
        indiaOfficialFetcher: failingOfficialFetcher
    });
    const koreaRun = payload.runs.find(run => run.source === 'Korea Customs official-live');
    const indiaRun = payload.runs.find(run => run.source === 'India Customs official-live');

    assert.equal(koreaRun.ok, true);
    assert.equal(indiaRun.ok, true);
    assert.equal(koreaRun.writes_official_machine_rates, false);
    assert.equal(indiaRun.writes_official_machine_rates, false);
    assert.equal(koreaRun.official_fetch_degraded, true);
    assert.equal(indiaRun.official_fetch_degraded, true);
    assert.equal(koreaRun.official_fetch_degraded_reason, 'official_fetch_failed');
    assert.equal(indiaRun.official_fetch_degraded_reason, 'official_fetch_failed');
    assert.equal(koreaRun.errors.length, 0);
    assert.equal(indiaRun.errors.length, 0);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.exceptions.length, 0);
    assert.equal(payload.source_run_plan.find(row => row.country === 'KR').run_status, 'degraded');
    assert.equal(payload.source_run_plan.find(row => row.country === 'IN').run_status, 'degraded');
    assert.equal(payload.source_run_plan.find(row => row.country === 'KR').degraded_reason, 'official_fetch_failed');
    assert.equal(payload.source_run_plan.find(row => row.country === 'IN').degraded_reason, 'official_fetch_failed');
    assert.ok(payload.automation_digest.official_probe_countries.includes('KR'));
    assert.ok(payload.automation_digest.official_probe_countries.includes('IN'));
    assert.ok(payload.automation_digest.official_probe_degraded_sources.includes('Korea Customs official-live'));
    assert.ok(payload.automation_digest.official_probe_degraded_sources.includes('India Customs official-live'));
    assert.ok(payload.automation_digest.official_probe_degraded_reasons.some(row => row.source === 'Korea Customs official-live' && row.reason === 'official_fetch_failed'));
    assert.ok(payload.automation_digest.official_probe_degraded_reasons.some(row => row.source === 'India Customs official-live' && row.reason === 'official_fetch_failed'));
    assert.ok(payload.automation_digest.degraded_countries.includes('KR'));
    assert.ok(payload.automation_digest.degraded_countries.includes('IN'));
    assert.equal(payload.counts.degraded_sources, 2);
    assert.equal(payload.source_run_plan_summary.degraded_count, 2);
});
