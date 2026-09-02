const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    buildAutomationLaunchStatus,
    dutyAutomationStage,
    buildWeeklyRoutePriorities,
    buildEuUsSpecialProgramHealth,
    sourceHealthStatus,
    summarizeRegulatoryHealth
} = require('../scripts/build-automation-launch-status');

test('stale regulatory fetches are not reported as healthy', () => {
    const status = sourceHealthStatus({ id: 'source' }, {
        byId: new Map([['source', { ok: true, fetched_at: '2026-01-01T00:00:00.000Z' }]]),
        inboxSources: {}
    });
    assert.equal(status.health_status, 'stale');
    assert.equal(summarizeRegulatoryHealth([status]).grade, 'blocked');
});
const {
    buildDutyRateStatusPayload
} = require('../scripts/admin-server');

test('automation launch status exposes only safe public launch modes', () => {
    const payload = buildAutomationLaunchStatus();

    assert.equal(payload.summary.regulatory_sources, 14);
    assert.deepEqual(payload.regulatory.map(row => row.country), ['CN', 'DE', 'EU', 'IN', 'JP', 'KR', 'MX', 'MY', 'NL', 'RU', 'SG', 'TW', 'US', 'VN']);
    assert.equal(Object.values(payload.summary.regulatory_modes).reduce((sum, count) => sum + count, 0), 14);
    assert.equal(Object.values(payload.summary.regulatory_health).reduce((sum, count) => sum + count, 0), 14);
    assert.equal(Object.values(payload.summary.regulatory_marketing).reduce((sum, count) => sum + count, 0), 14);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(payload.regulatory.every(row => row.source_health_grade), true);
    assert.equal(payload.regulatory.every(row => typeof row.source_health_counts === 'object'), true);
    assert.equal(payload.regulatory.every(row => row.sources.every(source => source.health_status)), true);
    const staleRows = payload.regulatory.filter(row => row.sources.some(source => source.health_status === 'stale'));
    assert.equal(staleRows.every(row => row.source_health_grade === 'blocked' || row.source_health_grade === 'partial'), true);
    assert.equal(staleRows.every(row => row.marketing_recommendation !== 'Ready to market'), true);
    const regulatoryByCountry = Object.fromEntries(payload.regulatory.map(row => [row.country, row]));
    assert.equal(regulatoryByCountry.MX.launch_mode, 'live_monitor');
    assert.equal(regulatoryByCountry.MX.source_health_grade, 'monitor');
    assert.equal(regulatoryByCountry.MX.marketing_recommendation, 'Use with source caveat');
    assert.equal(regulatoryByCountry.MX.public_launch, true);
    ['DE', 'NL', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
        assert.equal(regulatoryByCountry[country].launch_mode, 'live_monitor');
        assert.equal(regulatoryByCountry[country].source_health_grade, 'monitor');
        assert.equal(regulatoryByCountry[country].public_launch, true);
    });

    assert.equal(payload.summary.duty_rate_markets, 16);
    assert.equal(payload.summary.duty_rate_modes.live_auto, 8);
    assert.equal(payload.summary.duty_rate_modes.live_hybrid, 6);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 2);
    assert.deepEqual(payload.summary.duty_rate_automation_stages, {
        official_machine_sync: 8,
        official_probe_candidate: 6,
        official_link_monitor: 2
    });
    assert.deepEqual(payload.summary.duty_rate_launch_levels.official_exact, ['CN', 'DE', 'EU', 'JP', 'MX', 'NL', 'SG', 'US']);
    assert.equal(payload.summary.duty_rate_launch_levels.hybrid_official.length, 6);
    assert.equal(payload.summary.duty_rate_launch_levels.maintained_benchmark.length, 0);
    assert.equal(payload.summary.duty_rate_launch_levels.parser_gap.length, 8);
    assert.deepEqual(payload.summary.filing_grade_auto_countries, ['CN', 'DE', 'EU', 'JP', 'MX', 'NL', 'SG', 'US']);
    assert.deepEqual(payload.summary.parser_gap_countries, ['IN', 'KR', 'MY', 'RU', 'TW', 'VN', 'AU', 'NZ']);

    const byCountry = Object.fromEntries(payload.duty_rates.map(row => [row.country, row]));
    assert.equal(byCountry.AU.launch_mode, 'live_monitor');
    assert.equal(byCountry.NZ.launch_mode, 'live_monitor');
    assert.equal(byCountry.US.launch_mode, 'live_auto');
    assert.equal(byCountry.US.rate_automation_stage, 'official_machine_sync');
    assert.equal(byCountry.US.parser_gap, false);
    assert.equal(byCountry.EU.launch_mode, 'live_auto');
    assert.equal(byCountry.EU.rate_automation_stage, 'official_machine_sync');
    assert.equal(byCountry.DE.launch_mode, 'live_auto');
    assert.equal(byCountry.NL.launch_mode, 'live_auto');
    assert.ok(byCountry.EU.source_use_cases.includes('EU-bound direct and transit route pricing'));
    assert.ok(byCountry.EU.parser_subtasks.some(task => /TARIC code input/.test(task)));
    assert.ok(byCountry.DE.source_use_cases.includes('EU-bound direct and transit route pricing'));
    assert.ok(byCountry.DE.rate_change_drivers.some(driver => /Germany VAT/.test(driver)));
    assert.ok(byCountry.NL.parser_subtasks.some(task => /Netherlands-specific VAT/.test(task)));
    assert.ok(byCountry.NL.rate_change_drivers.some(driver => /Netherlands VAT/.test(driver)));
    assert.equal(byCountry.KR.rate_automation_stage, 'official_probe_candidate');
    assert.equal(byCountry.IN.rate_automation_stage, 'official_probe_candidate');
    assert.equal(byCountry.SG.rate_automation_stage, 'official_machine_sync');
    assert.equal(byCountry.MX.rate_automation_stage, 'official_machine_sync');
    assert.ok(byCountry.CN.parser_subtasks.some(task => /China Customs tariff rows/.test(task)));
    assert.ok(byCountry.MX.parser_subtasks.some(task => /TIGIE\/NICO/.test(task)));
    assert.ok(byCountry.JP.parser_subtasks.some(task => /statistical code/.test(task)));
    assert.ok(byCountry.CN.rate_change_drivers.some(driver => /import VAT/.test(driver)));
    assert.ok(byCountry.MY.official_probe_urls.length >= 2);
    assert.equal(byCountry.MY.transit_route_priority, true);
    assert.equal(byCountry.RU.launch_mode, 'live_hybrid');
    assert.equal(byCountry.RU.rate_automation_stage, 'official_probe_candidate');
    assert.equal(byCountry.RU.filing_grade_auto, false);
    assert.equal(payload.duty_rate_priority_queue.length, 8);
    assert.deepEqual(payload.duty_rate_priority_queue.slice(0, 2).map(row => row.country), ['IN', 'KR']);
    assert.ok(payload.duty_rate_priority_queue.some(row => row.country === 'AU'));
    assert.ok(payload.duty_rate_priority_queue.some(row => row.country === 'NZ'));
    assert.equal(payload.duty_rate_priority_queue.some(row => row.country === 'CN'), false);
    assert.equal(payload.duty_rate_priority_queue.some(row => row.country === 'EU'), false);
    assert.equal(payload.duty_rate_priority_queue.some(row => row.country === 'MX'), false);
    assert.ok(payload.duty_rate_priority_queue.some(row => row.country === 'MY' && row.parser_gap_task?.source_use_cases?.includes('two-leg transit comparison')));
    assert.equal(payload.summary.weekly_route_priority_count, 5);
    assert.equal(payload.weekly_route_priorities.length, 5);
    assert.ok(payload.weekly_route_priorities.every(row => row.route && row.product_label && row.hs_code && row.next_action));
    assert.equal(payload.duty_rates.every(row => row.public_launch), true);
    assert.equal(typeof payload.duty_rate_health_board, 'object');
    assert.match(payload.duty_rate_health_board.headline, /official exact/);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'official_exact' && card.countries.includes('US')), true);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'p0_p1' && card.countries.includes('CN') && card.countries.includes('MX')), true);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'parser_gap' && card.count === 8), true);
    assert.equal(payload.eu_us_special_program_health.id, 'EU-US-2026-1455');
    assert.equal(payload.eu_us_special_program_health.annex_total, 242);
    assert.equal(payload.eu_us_special_program_health.quota_expected, 20);
});

test('EU-US special-program health distinguishes complete and degraded syncs', () => {
    const healthy = buildEuUsSpecialProgramHealth({ special_programs: [{
        id: 'EU-US-2026-1455',
        annex_counts: { annex_i: 150, annex_ii: 21, annex_iii: 71, quotas: 20 },
        quota_status: { rows: Array.from({ length: 20 }, () => ({ status: 'available' })), errors: [] },
        specific_duty_status: { matched_rows: 64, exact_goods_codes: 27, simple_auto_rows: 3, conditional_rows: 61, errors: [] }
    }] });
    assert.equal(healthy.status, 'healthy');
    assert.equal(healthy.annex_total, 242);
    assert.equal(healthy.quota_checked, 20);
    assert.equal(healthy.specific_duty_rows, 64);

    const degraded = buildEuUsSpecialProgramHealth({ special_programs: [{
        id: 'EU-US-2026-1455',
        annex_counts: { annex_i: 150, annex_ii: 21, annex_iii: 71, quotas: 20 },
        quota_status: { rows: [], errors: [{ error: 'network' }] },
        specific_duty_status: { rows: [], errors: [] }
    }] });
    assert.equal(degraded.status, 'degraded');
});

test('weekly route priorities expose concrete product and HS route backlog', () => {
    const rows = buildWeeklyRoutePriorities();

    assert.equal(rows.length, 5);
    assert.deepEqual(rows.map(row => row.rank), [1, 2, 3, 4, 5]);
    assert.ok(rows.every(row => row.parser_gap));
    assert.ok(rows.every(row => row.route.includes('->')));
    assert.ok(rows.every(row => row.product_label));
    assert.ok(rows.every(row => row.hs_code));
});

test('duty automation stage distinguishes machine sync, parser candidates, maps, and monitors', () => {
    assert.equal(dutyAutomationStage({
        source_status: 'auto_updatable',
        machine_readable: true
    }).rate_automation_stage, 'official_machine_sync');
    assert.equal(dutyAutomationStage({
        source_status: 'hybrid_official_candidate',
        machine_readable: 'partial'
    }).rate_automation_stage, 'official_hybrid_parser');
    assert.equal(dutyAutomationStage({
        source_status: 'hybrid_official_candidate',
        machine_readable: 'candidate'
    }).rate_automation_stage, 'official_probe_candidate');
    assert.equal(dutyAutomationStage({
        source_status: 'hybrid_official_candidate',
        machine_readable: 'local_exact_map'
    }).rate_automation_stage, 'maintained_exact_map');
    assert.equal(dutyAutomationStage({
        source_status: 'official_link',
        machine_readable: false
    }).rate_automation_stage, 'official_link_monitor');
});

test('checked-in automation launch status is fresh enough for admin display', () => {
    const filePath = path.join(__dirname, '..', 'data', 'automation-launch-status.json');
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.equal(payload.schema_version, 1);
    assert.equal(payload.summary.duty_rate_markets, 16);
    assert.equal(payload.summary.regulatory_sources, 14);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(Object.values(payload.summary.regulatory_health).reduce((sum, count) => sum + count, 0), 14);
    assert.equal(Object.values(payload.summary.regulatory_marketing).reduce((sum, count) => sum + count, 0), 14);
    assert.equal(payload.regulatory.filter(row => row.sources.some(source => source.health_status === 'stale')).every(row => row.marketing_recommendation !== 'Ready to market'), true);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 2);
    assert.equal(payload.summary.duty_rate_automation_stages.official_machine_sync, 8);
    assert.equal(payload.summary.duty_rate_automation_stages.official_hybrid_parser || 0, 0);
    assert.equal(payload.summary.duty_rate_automation_stages.official_probe_candidate, 6);
    assert.equal(payload.summary.duty_rate_automation_stages.maintained_exact_map || 0, 0);
    assert.equal(payload.summary.duty_rate_automation_stages.official_link_monitor, 2);
    assert.equal(payload.duty_rate_priority_queue.length, 8);
    assert.equal(payload.duty_rate_priority_queue.some(row => row.country === 'JP'), false);
    assert.equal(payload.weekly_route_priorities.length, 5);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'p0_p1' && card.countries.includes('CN')), true);
});

test('admin duty-rate status includes automation launch board payload', () => {
    const payload = buildDutyRateStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload.failures, null, 2));
    assert.equal(payload.automation_launch_status.summary.duty_rate_markets, 16);
    assert.equal(payload.automation_launch_status.summary.regulatory_sources, 14);
    assert.equal(typeof payload.automation_launch_status.summary.regulatory_health, 'object');
    assert.equal(payload.automation_launch_status.summary.duty_rate_automation_stages.official_machine_sync, 8);
    assert.equal(
        payload.automation_launch_status.duty_rates.some(row => row.country === 'US' && row.launch_mode === 'live_auto'),
        true
    );
    assert.equal(
        payload.automation_launch_status.duty_rate_priority_queue.some(row => row.country === 'RU' && row.rate_automation_stage === 'official_probe_candidate'),
        true
    );
    assert.equal(payload.automation_launch_status.weekly_route_priorities.length, 5);
});
