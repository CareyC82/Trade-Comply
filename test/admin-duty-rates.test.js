const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildDutyRateStatusPayload,
    buildConsumerRegulatoryStatusPayload,
    buildExactTariffFeedStatus,
    buildQualityStatusPayload,
    buildUnmetSearchBacklogPayload
} = require('../scripts/admin-server');

test('admin exposes consumer regulatory lifecycle, last-good status and manual review queue', () => {
    const payload = buildConsumerRegulatoryStatusPayload();
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.equal(payload.source_count, 32);
    assert.ok(payload.sources.every((source) => source.content_hash && source.last_good_at));
    assert.match(html, /Consumer regulatory change review/);
    assert.match(html, /No automatic rule changes/);
    assert.match(html, /Using last-good/);
    assert.match(html, /Automatic capture current/);
    assert.match(html, /Manual review current/);
    assert.match(html, /Current user conclusions/);
    assert.equal(payload.counts.current + payload.counts.manual_review_current + (payload.counts.last_good_degraded || 0), payload.source_count);
    assert.match(html, /Approve evidence/);
    assert.match(html, /Review and rollback history/);
    assert.match(html, /Affected questions/);
});

test('admin page includes duty-rate automation health queue', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

    assert.match(html, /Duty-rate automation health queue/);
    assert.match(html, /No watched source issues/);
    assert.match(html, /exact HS query match/);
    assert.match(html, /Diagnosis:/);
    assert.match(html, /Fix:/);
    assert.match(html, /Priority:/);
    assert.match(html, /<strong>Run:<\/strong>/);
    assert.match(html, /Official exact tariff feeds/);
    assert.match(html, /Official tariff artifact workbench/);
    assert.match(html, /Preview import/);
    assert.match(html, /Confirm import/);
    assert.match(html, /accept="[^"]*\.pdf/);
    assert.match(html, /Hybrid → official exact promotion queue/);
    assert.match(html, /Filing-grade regression matrix/);
    assert.match(html, /Unmet Search Workbench/);
    assert.match(html, /Only real captured searches are shown/);
});

test('admin exact tariff feed status covers the four P1 connector groups without exposing URLs', () => {
    const payload = buildExactTariffFeedStatus({
        rules: [],
        last_exact_national_tariff_sync: {
            checked_at: '2026-07-25T00:00:00.000Z',
            ok: true,
            results: [{ country: 'EU', ok: true, row_count: 12, changed_rules: ['rule-1'] }]
        }
    });

    assert.deepEqual(payload.markets.map((row) => row.country), ['EU', 'CN', 'SG', 'MX']);
    assert.deepEqual(payload.markets[0].target_markets, ['EU', 'DE', 'NL']);
    assert.equal(payload.markets[0].status, 'current');
    assert.equal(payload.markets[0].row_count, 12);
    assert.equal(payload.markets[0].changed_rule_count, 1);
    assert.ok(payload.markets.every((row) => !Object.hasOwn(row, 'url')));
    assert.equal(payload.markets[0].connector_type, 'direct_official');
    assert.equal(payload.markets[1].connector_type, 'direct_official');
});

test('admin unmet-search payload has an honest empty Top 10 state', () => {
    const payload = buildUnmetSearchBacklogPayload();

    assert.equal(payload.summary.total, payload.items.length);
    assert.deepEqual(payload.top_10, payload.items.slice(0, 10));
    assert.ok(payload.top_10.length <= 10);
});

test('admin duty-rate payload exposes source roadmap status', () => {
    const payload = buildDutyRateStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload.failures, null, 2));
    assert.equal(payload.duty_rate_summary.rule_count > 0, true);
    assert.equal(payload.duty_rate_summary.country_count > 0, true);
    assert.equal(Array.isArray(payload.sources), true);
    assert.equal(payload.post_entry_tax_coverage.ok, true, JSON.stringify(payload.post_entry_tax_coverage.failures, null, 2));
    assert.equal(payload.post_entry_tax_coverage.export_tax.missing_total, 0);
    assert.equal(payload.post_entry_tax_coverage.export_tax.false_official_rate_claims.length, 0);
    assert.equal(typeof payload.duty_rate_sync_status, 'object');
    assert.equal(payload.duty_rate_sync_status.policy.manual_review_required, false);
    assert.equal(typeof payload.duty_rate_sync_status.automation_digest, 'object');
    assert.ok(Array.isArray(payload.duty_rate_sync_status.automation_digest.parser_gap_countries));
    assert.equal(Array.isArray(payload.duty_rate_sync_status.exceptions), true);
    assert.equal(Array.isArray(payload.duty_rate_sync_status.source_run_plan), true);
    assert.ok(payload.duty_rate_sync_status.source_run_plan.some(row => row.country === 'US' && row.run_source === 'USITC'));
    assert.ok(payload.duty_rate_sync_status.source_run_plan.some(row => row.country === 'IN' && row.run_source === 'India Customs official-live'));
    assert.equal(typeof payload.duty_rate_sync_status.updated_at, 'string');
    assert.ok(payload.duty_rate_sync_status.source_run_plan.every(row => typeof row.change_count === 'number'));
    assert.ok(payload.sources.some(source => source.country === 'KR' && /CustomsTariffList\.do/.test(source.official_url || '')));
    assert.equal(typeof payload.business_summary, 'object');
    assert.equal(payload.filing_grade_regression.ok, true, JSON.stringify(payload.filing_grade_regression.failures));
    assert.equal(payload.filing_grade_regression.market_count, 14);
    assert.equal(payload.hybrid_promotion_queue.length, 5);
    assert.ok(payload.business_summary.sync_conclusion);
    assert.ok(payload.business_summary.priority_conclusion);
    assert.ok(Array.isArray(payload.business_summary.next_actions));
    assert.ok(payload.business_summary.next_actions.length > 0);
    assert.ok(Array.isArray(payload.business_summary.top_priorities));
    assert.ok(payload.business_summary.top_priorities.length > 0);
    assert.ok(Array.isArray(payload.business_summary.us_backlog));
    assert.ok(payload.business_summary.us_backlog.some(row => row.product_id === 'solar' && /AD\/CVD|Section 301/.test(row.us_backlog_focus)));
    assert.equal(Array.isArray(payload.action_details), true);
    assert.equal(Array.isArray(payload.exact_rate_progress.rows), true);
    assert.equal(Array.isArray(payload.exact_rate_progress.top_backlog_rows), true);
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'MX' && row.status === 'exact_ready'));
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'JP' && row.status === 'exact_ready'));
    ['KR', 'IN', 'MY', 'TW'].forEach((market) => {
        assert.ok(payload.exact_rate_progress.rows.some(row => (
            row.market === market
            && row.status === 'hybrid_in_progress'
            && row.backlog_routes > 0
        )), `${market} should expose its exact-rate verification backlog`);
    });
    assert.ok(payload.exact_rate_progress.top_backlog_rows.length > 0);
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => Number.isFinite(row.impact_score)));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => row.why_priority));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => Array.isArray(row.rate_change_drivers) && row.rate_change_drivers.length > 0));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => Array.isArray(row.parser_subtasks) && row.parser_subtasks.length > 0));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.some(row => (
        `${row.why_priority} ${(row.rate_change_drivers || []).join(' ')}`.includes('Section 301')
    )));
    assert.ok(payload.exact_rate_progress.totals.backlog_routes > 0);
    assert.ok(payload.action_details.some(item => item.type === 'exact_rate_backlog'));
    assert.ok(payload.action_details.some(item => item.type === 'exact_rate_backlog' && item.details?.why_priority));
    assert.equal(payload.sources.some(source => source.country === 'US' && source.source_status === 'auto_updatable'), true);
    assert.equal(payload.source_roadmap_summary.auto_updatable.includes('US'), true);
    assert.equal(payload.sources.some(source => source.country === 'EU' && source.source_status === 'official_machine_synced'), true);
    assert.equal(payload.sources.some(source => source.country === 'JP' && source.source_status === 'official_machine_synced'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('KR'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('IN'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('MY'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('TW'), true);
    assert.ok(Array.isArray(payload.source_roadmap_summary.next_source_priorities));
    assert.ok(Array.isArray(payload.source_roadmap_summary.automation_backlog));
    assert.ok(payload.source_roadmap_summary.automation_backlog_summary.parser_gap_count > 0);
    assert.deepEqual(payload.source_roadmap_summary.automation_backlog.slice(0, 3).map(row => row.country), ['IN', 'KR', 'MY']);
    assert.equal(payload.source_roadmap_summary.automation_backlog.some(row => row.country === 'EU'), false);
    assert.ok(payload.source_roadmap_summary.automation_backlog.some(row => (
        row.country === 'IN'
        && row.rate_automation_stage === 'official_probe_candidate'
        && row.workstream === 'official probe promotion'
    )));
    assert.equal(payload.source_roadmap_summary.automation_backlog.some(row => row.country === 'SG'), false);
    assert.equal(payload.source_roadmap_summary.automation_backlog.some(row => row.country === 'MX'), false);
    assert.equal(payload.source_roadmap_summary.automation_backlog.some(row => row.country === 'JP'), false);
    assert.ok(payload.source_roadmap_summary.next_source_priorities.some(row => (
        row.country === 'US'
        && row.maintenance_priority === 'P0'
        && /USITC/.test(row.next_action)
    )));
    assert.equal(payload.sources.some(row => (
        row.country === 'JP'
        && row.maintenance_priority === 'P1'
        && row.source_status === 'official_machine_synced'
    )), true);
    assert.ok(payload.source_roadmap_summary.maintenance_priority_groups.P1.some(row => row.country === 'SG'));
    assert.ok(payload.source_roadmap_summary.maintenance_priority_groups.P1.some(row => row.country === 'MX'));
    assert.ok(payload.source_roadmap_summary.maintenance_priority_groups.P1.some(row => row.country === 'CN'));
    assert.equal(payload.source_roadmap_summary.missing_coverage.length, 0);
    assert.equal(payload.source_roadmap_summary.missing_roadmap.length, 0);
});

test('admin quality payload exposes search and post-entry coverage gates', () => {
    const payload = buildQualityStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(payload.search.failed, 0);
    assert.equal(payload.search.warned, 0);
    assert.equal(payload.route_coverage_matrix.ok, true);
    assert.equal(payload.route_coverage_matrix.failed_sample_count, 0);
    assert.equal(payload.route_coverage_matrix.market_count >= 14, true);
    assert.equal(payload.route_coverage_matrix.product_count >= 14, true);
    assert.ok(payload.route_coverage_matrix.focus_summary.some(row => row.market === 'US' && row.focus === 'import'));
    assert.ok(payload.route_coverage_matrix.focus_summary.some(row => row.market === 'IN' && row.focus === 'export'));
    assert.equal(payload.duty.gap_matrix.missing_total, 0);
    assert.equal(payload.duty.gap_matrix.full_count, payload.duty.gap_matrix.rows.length);
    assert.equal(Array.isArray(payload.duty.exact_tariff_parser_queue.priorities), true);
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.length > 0);
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.some(row => row.id === 'solar-cn-us'));
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.every(row => row.parser_target && row.next_action && row.why_priority));
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.every(row => row.priority_band && Array.isArray(row.rate_change_drivers)));
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.every(row => Array.isArray(row.parser_subtasks) && row.parser_subtasks.length > 0));
    assert.equal(typeof payload.duty.rate_trust_tiers, 'object');
    assert.ok(payload.duty.rate_trust_tiers.official_exact.count > 0);
    assert.ok(payload.duty.rate_trust_tiers.hybrid_scope_check.count > 0);
    assert.equal(Array.isArray(payload.duty.rate_trust_tiers.official_exact.samples), true);
    assert.equal(Array.isArray(payload.duty.rate_trust_tiers.hybrid_scope_check.samples), true);
    assert.equal(typeof payload.duty.parser_priority_bands, 'object');
    assert.ok((payload.duty.parser_priority_bands.P2 || []).length > 0);
    assert.ok((payload.duty.parser_priority_bands.P2 || []).every(row => row.parser_target && row.next_action));
    assert.ok((payload.duty.parser_priority_bands.P2 || []).every(row => (
        Array.isArray(row.scope_components)
        && row.scope_components.length > 0
    )));
    assert.ok((payload.duty.parser_priority_bands.P2 || []).some(row => (
        row.route === 'CN->US'
        && row.scope_components.includes('official_base_duty')
        && row.scope_components.includes('chapter_99_section_301')
    )));
    assert.ok((payload.duty.parser_priority_bands.P2 || []).every(row => (
        Array.isArray(row.rate_change_drivers)
        && row.rate_change_drivers.length > 0
    )));
    assert.ok((payload.duty.parser_priority_bands.P2 || []).every(row => (
        Array.isArray(row.parser_subtasks)
        && row.parser_subtasks.length > 0
    )));
    assert.ok(payload.duty.exact_tariff_parser_queue.priorities.some(row => (
        row.rate_change_drivers.join(' ').includes('Section 301')
    )));
    assert.equal(Array.isArray(payload.duty.exact_tariff_parser_queue.rule_scope_priorities), true);
    assert.ok(payload.duty.exact_tariff_parser_queue.rule_scope_priorities.length > 0);
    assert.ok(payload.duty.exact_tariff_parser_queue.rule_scope_priorities.every(row => row.rule_id && row.parser_target && row.next_action && row.why_priority));
    assert.ok(payload.duty.exact_tariff_parser_queue.rule_scope_priorities.every(row => Array.isArray(row.parser_subtasks) && row.parser_subtasks.length > 0));
    assert.ok(payload.duty.exact_tariff_parser_queue.rule_scope_priorities.some(row => row.rule_id === 'EU-GLOBAL-8525-CAMERA-IMPORT-SCOPE'));
    assert.equal(payload.post_entry_tax.export_missing_countries.length, 0);
    assert.equal(payload.post_entry_tax.false_official_rate_claims.length, 0);
    assert.equal(payload.opportunity.ok, true);
    assert.ok(payload.opportunity.row_count > 0);
    assert.ok(payload.opportunity.quote_ready_count > 0);
    assert.ok(payload.opportunity.bucket_counts.top_opportunity >= 0);
    assert.ok(payload.opportunity.bucket_counts.data_gap >= 0);
    assert.ok(payload.opportunity.bucket_counts.need_tariff_upgrade >= 0);
    assert.ok(payload.opportunity.bucket_counts.need_rule_upgrade >= 0);
    assert.ok(payload.opportunity.bucket_counts.top_opportunity > 0);
    assert.ok(payload.opportunity.official_or_hybrid_count > 0);
    assert.equal(typeof payload.opportunity.source_trust_counts, 'object');
    assert.equal(typeof payload.opportunity.quote_readiness_counts, 'object');
    assert.equal(Array.isArray(payload.opportunity.tariff_coverage_priorities), true);
    assert.ok(payload.opportunity.tariff_coverage_priorities.every(row => row.route && row.product_id && row.next_action));
    assert.equal(Array.isArray(payload.opportunity.top_opportunities), true);
    assert.equal(Array.isArray(payload.opportunity.data_gaps), true);
    assert.equal(Array.isArray(payload.opportunity.tariff_upgrades), true);
    assert.equal(Array.isArray(payload.opportunity.rule_upgrades), true);
    assert.ok(payload.opportunity.rows.some(row => row.to === 'IN' || row.to === 'MY' || row.to === 'VN'));
    assert.ok(payload.opportunity.rows.every(row => Number.isFinite(row.priority_score)));
    assert.ok(payload.opportunity.rows.every(row => row.workbench_bucket && row.workbench_bucket_label));
    assert.equal(Array.isArray(payload.search.failing_samples), true);
    assert.equal(Array.isArray(payload.duty.markets_missing_priority_hs), true);
});
