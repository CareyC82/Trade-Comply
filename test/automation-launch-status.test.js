const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    buildAutomationLaunchStatus,
    dutyAutomationStage,
    buildWeeklyRoutePriorities
} = require('../scripts/build-automation-launch-status');
const {
    buildDutyRateStatusPayload
} = require('../scripts/admin-server');

test('automation launch status exposes only safe public launch modes', () => {
    const payload = buildAutomationLaunchStatus();

    assert.equal(payload.summary.regulatory_sources, 14);
    assert.deepEqual(payload.regulatory.map(row => row.country), ['CN', 'DE', 'EU', 'IN', 'JP', 'KR', 'MX', 'MY', 'NL', 'RU', 'SG', 'TW', 'US', 'VN']);
    assert.equal(payload.summary.regulatory_modes.live_auto, 7);
    assert.equal(payload.summary.regulatory_modes.live_monitor, 7);
    assert.equal(payload.summary.regulatory_modes.not_live || 0, 0);
    assert.equal(payload.summary.regulatory_health.healthy, 7);
    assert.equal(payload.summary.regulatory_health.monitor, 7);
    assert.equal(payload.summary.regulatory_health.partial || 0, 0);
    assert.equal(payload.summary.regulatory_health.blocked || 0, 0);
    assert.equal(payload.summary.regulatory_marketing.ready_to_market, 7);
    assert.equal(payload.summary.regulatory_marketing.source_caveat, 7);
    assert.equal(payload.summary.regulatory_marketing.do_not_market, 0);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(payload.regulatory.every(row => row.source_health_grade), true);
    assert.equal(payload.regulatory.every(row => typeof row.source_health_counts === 'object'), true);
    assert.equal(payload.regulatory.every(row => row.sources.every(source => source.health_status)), true);
    const regulatoryByCountry = Object.fromEntries(payload.regulatory.map(row => [row.country, row]));
    assert.equal(regulatoryByCountry.US.launch_mode, 'live_auto');
    assert.equal(regulatoryByCountry.US.source_health_grade, 'healthy');
    assert.equal(regulatoryByCountry.US.marketing_recommendation, 'Ready to market');
    assert.equal(regulatoryByCountry.MX.launch_mode, 'live_monitor');
    assert.equal(regulatoryByCountry.MX.source_health_grade, 'monitor');
    assert.equal(regulatoryByCountry.MX.marketing_recommendation, 'Use with source caveat');
    assert.equal(regulatoryByCountry.MX.public_launch, true);
    ['DE', 'NL', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
        assert.equal(regulatoryByCountry[country].launch_mode, 'live_monitor');
        assert.equal(regulatoryByCountry[country].source_health_grade, 'monitor');
        assert.equal(regulatoryByCountry[country].public_launch, true);
    });

    assert.equal(payload.summary.duty_rate_markets, 14);
    assert.equal(payload.summary.duty_rate_modes.live_auto, 1);
    assert.equal(payload.summary.duty_rate_modes.live_hybrid, 12);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 1);
    assert.deepEqual(payload.summary.duty_rate_automation_stages, {
        official_machine_sync: 1,
        official_hybrid_parser: 3,
        official_probe_candidate: 3,
        maintained_exact_map: 6,
        official_link_monitor: 1
    });
    assert.deepEqual(payload.summary.duty_rate_launch_levels.official_exact, ['US']);
    assert.equal(payload.summary.duty_rate_launch_levels.hybrid_official.length, 6);
    assert.equal(payload.summary.duty_rate_launch_levels.maintained_benchmark.length, 6);
    assert.equal(payload.summary.duty_rate_launch_levels.parser_gap.length, 13);
    assert.deepEqual(payload.summary.filing_grade_auto_countries, ['US']);
    assert.deepEqual(payload.summary.parser_gap_countries, ['CN', 'DE', 'EU', 'IN', 'JP', 'KR', 'MX', 'MY', 'NL', 'SG', 'TW', 'VN', 'RU']);

    const byCountry = Object.fromEntries(payload.duty_rates.map(row => [row.country, row]));
    assert.equal(byCountry.US.launch_mode, 'live_auto');
    assert.equal(byCountry.US.rate_automation_stage, 'official_machine_sync');
    assert.equal(byCountry.US.parser_gap, false);
    assert.equal(byCountry.EU.launch_mode, 'live_hybrid');
    assert.equal(byCountry.EU.rate_automation_stage, 'official_hybrid_parser');
    assert.equal(byCountry.DE.launch_mode, 'live_hybrid');
    assert.equal(byCountry.NL.launch_mode, 'live_hybrid');
    assert.ok(byCountry.EU.source_use_cases.includes('EU-bound direct and transit route pricing'));
    assert.ok(byCountry.EU.parser_subtasks.some(task => /TARIC code input/.test(task)));
    assert.ok(byCountry.DE.source_use_cases.includes('EU-bound direct and transit route pricing'));
    assert.ok(byCountry.DE.rate_change_drivers.some(driver => /Germany VAT/.test(driver)));
    assert.ok(byCountry.NL.parser_subtasks.some(task => /Netherlands-specific VAT/.test(task)));
    assert.ok(byCountry.NL.rate_change_drivers.some(driver => /Netherlands VAT/.test(driver)));
    assert.equal(byCountry.KR.rate_automation_stage, 'official_probe_candidate');
    assert.equal(byCountry.IN.rate_automation_stage, 'official_probe_candidate');
    assert.equal(byCountry.SG.rate_automation_stage, 'maintained_exact_map');
    assert.ok(byCountry.CN.parser_subtasks.some(task => /China Customs tariff rows/.test(task)));
    assert.ok(byCountry.MX.parser_subtasks.some(task => /TIGIE\/NICO/.test(task)));
    assert.ok(byCountry.JP.parser_subtasks.some(task => /statistical code/.test(task)));
    assert.ok(byCountry.CN.rate_change_drivers.some(driver => /import VAT/.test(driver)));
    assert.ok(byCountry.MY.official_probe_urls.length >= 2);
    assert.equal(byCountry.MY.transit_route_priority, true);
    assert.equal(byCountry.RU.launch_mode, 'live_monitor');
    assert.equal(byCountry.RU.rate_automation_stage, 'official_link_monitor');
    assert.equal(byCountry.RU.filing_grade_auto, false);
    assert.equal(payload.duty_rate_priority_queue.length, 13);
    assert.deepEqual(payload.duty_rate_priority_queue.slice(0, 3).map(row => row.country), ['DE', 'EU', 'NL']);
    assert.ok(payload.duty_rate_priority_queue.some(row => (
        row.country === 'CN'
        && row.parser_gap_task?.parser_subtasks?.some(task => /8\/10-digit/.test(task))
    )));
    assert.ok(payload.duty_rate_priority_queue.some(row => (
        row.country === 'EU'
        && row.parser_gap_task?.source_use_cases?.includes('EU-bound direct and transit route pricing')
        && row.parser_gap_task?.parser_subtasks?.some(task => /TARIC code input/.test(task))
    )));
    assert.ok(payload.duty_rate_priority_queue.some(row => (
        row.country === 'MX'
        && row.parser_gap_task?.rate_change_drivers?.some(driver => /TIGIE\/NICO/.test(driver))
    )));
    assert.ok(payload.duty_rate_priority_queue.some(row => row.country === 'MY' && row.parser_gap_task?.source_use_cases?.includes('two-leg transit comparison')));
    assert.equal(payload.summary.weekly_route_priority_count, 5);
    assert.equal(payload.weekly_route_priorities.length, 5);
    assert.ok(payload.weekly_route_priorities.every(row => row.route && row.product_label && row.hs_code && row.next_action));
    assert.equal(payload.duty_rates.every(row => row.public_launch), true);
    assert.equal(typeof payload.duty_rate_health_board, 'object');
    assert.match(payload.duty_rate_health_board.headline, /official exact/);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'official_exact' && card.countries.includes('US')), true);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'p0_p1' && card.countries.includes('CN') && card.countries.includes('MX')), true);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'parser_gap' && card.count === 13), true);
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
    assert.equal(payload.summary.duty_rate_markets, 14);
    assert.equal(payload.summary.regulatory_sources, 14);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(payload.summary.regulatory_health.healthy, 7);
    assert.equal(payload.summary.regulatory_health.monitor, 7);
    assert.equal(payload.summary.regulatory_marketing.ready_to_market, 7);
    assert.equal(payload.summary.regulatory_marketing.source_caveat, 7);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 1);
    assert.equal(payload.summary.duty_rate_automation_stages.official_machine_sync, 1);
    assert.equal(payload.summary.duty_rate_automation_stages.official_hybrid_parser, 3);
    assert.equal(payload.summary.duty_rate_automation_stages.official_probe_candidate, 3);
    assert.equal(payload.summary.duty_rate_automation_stages.maintained_exact_map, 6);
    assert.equal(payload.summary.duty_rate_automation_stages.official_link_monitor, 1);
    assert.equal(payload.duty_rate_priority_queue.length, 13);
    assert.equal(
        payload.duty_rate_priority_queue.some(row => row.country === 'JP' && row.parser_gap_task?.parser_subtasks?.some(task => /statistical code/.test(task))),
        true
    );
    assert.equal(payload.weekly_route_priorities.length, 5);
    assert.equal(payload.duty_rate_health_board.cards.some(card => card.key === 'p0_p1' && card.countries.includes('CN')), true);
});

test('admin duty-rate status includes automation launch board payload', () => {
    const payload = buildDutyRateStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload.failures, null, 2));
    assert.equal(payload.automation_launch_status.summary.duty_rate_markets, 14);
    assert.equal(payload.automation_launch_status.summary.regulatory_sources, 14);
    assert.equal(typeof payload.automation_launch_status.summary.regulatory_health, 'object');
    assert.equal(payload.automation_launch_status.summary.duty_rate_automation_stages.official_machine_sync, 1);
    assert.equal(
        payload.automation_launch_status.duty_rates.some(row => row.country === 'US' && row.launch_mode === 'live_auto'),
        true
    );
    assert.equal(
        payload.automation_launch_status.duty_rate_priority_queue.some(row => row.country === 'RU' && row.rate_automation_stage === 'official_link_monitor'),
        true
    );
    assert.equal(payload.automation_launch_status.weekly_route_priorities.length, 5);
});
