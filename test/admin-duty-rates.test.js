const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDutyRateStatusPayload
} = require('../scripts/admin-server');

test('admin duty-rate payload exposes source roadmap status', () => {
    const payload = buildDutyRateStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload.failures, null, 2));
    assert.equal(payload.duty_rate_summary.rule_count > 0, true);
    assert.equal(payload.duty_rate_summary.country_count > 0, true);
    assert.equal(Array.isArray(payload.sources), true);
    assert.equal(payload.sources.some(source => source.country === 'US' && source.source_status === 'auto_updatable'), true);
    assert.equal(payload.source_roadmap_summary.auto_updatable.includes('US'), true);
    assert.equal(payload.source_roadmap_summary.missing_coverage.length, 0);
    assert.equal(payload.source_roadmap_summary.missing_roadmap.length, 0);
});
