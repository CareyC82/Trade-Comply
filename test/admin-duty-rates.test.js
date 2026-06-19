const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDutyRateStatusPayload,
    buildQualityStatusPayload
} = require('../scripts/admin-server');

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
    assert.equal(Array.isArray(payload.duty_rate_sync_status.exceptions), true);
    assert.equal(typeof payload.business_summary, 'object');
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
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'KR' && row.status === 'exact_ready'));
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'IN' && row.status === 'exact_ready'));
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'MY' && row.status === 'exact_ready'));
    assert.ok(payload.exact_rate_progress.rows.some(row => row.market === 'TW' && row.status === 'exact_ready'));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.length > 0);
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => Number.isFinite(row.impact_score)));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => row.why_priority));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.every(row => Array.isArray(row.rate_change_drivers) && row.rate_change_drivers.length > 0));
    assert.ok(payload.exact_rate_progress.top_backlog_rows.some(row => (
        `${row.why_priority} ${(row.rate_change_drivers || []).join(' ')}`.includes('Section 301')
    )));
    assert.ok(payload.exact_rate_progress.totals.backlog_routes > 0);
    assert.ok(payload.action_details.some(item => item.type === 'exact_rate_backlog'));
    assert.ok(payload.action_details.some(item => item.type === 'exact_rate_backlog' && item.details?.why_priority));
    assert.equal(payload.sources.some(source => source.country === 'US' && source.source_status === 'auto_updatable'), true);
    assert.equal(payload.source_roadmap_summary.auto_updatable.includes('US'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('EU'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('JP'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('KR'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('IN'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('MY'), true);
    assert.equal(payload.source_roadmap_summary.hybrid_official_candidate.includes('TW'), true);
    assert.equal(payload.source_roadmap_summary.missing_coverage.length, 0);
    assert.equal(payload.source_roadmap_summary.missing_roadmap.length, 0);
});

test('admin quality payload exposes search and post-entry coverage gates', () => {
    const payload = buildQualityStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(payload.search.failed, 0);
    assert.equal(payload.search.warned, 0);
    assert.equal(payload.duty.gap_matrix.missing_total, 0);
    assert.equal(payload.duty.gap_matrix.full_count, payload.duty.gap_matrix.rows.length);
    assert.equal(payload.post_entry_tax.export_missing_countries.length, 0);
    assert.equal(payload.post_entry_tax.false_official_rate_claims.length, 0);
    assert.equal(payload.opportunity.ok, true);
    assert.ok(payload.opportunity.row_count > 0);
    assert.ok(payload.opportunity.quote_ready_count > 0);
    assert.ok(payload.opportunity.rows.some(row => row.to === 'IN' || row.to === 'MY' || row.to === 'VN'));
    assert.ok(payload.opportunity.rows.every(row => Number.isFinite(row.priority_score)));
    assert.equal(Array.isArray(payload.search.failing_samples), true);
    assert.equal(Array.isArray(payload.duty.markets_missing_priority_hs), true);
});
