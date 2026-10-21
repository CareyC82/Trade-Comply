const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExactTariffCoverageReport } = require('../lib/exact-tariff-coverage');

function fixture() {
    return {
        dutyPayload: { rules: [{
            import_country: 'EU', hs_prefixes: ['847130', '850760'], last_checked_at: '2026-10-20T00:00:00.000Z',
            exact_code_overrides: [
                { hs_code: '8471300000', base_rate: 0, source_status: 'official_source_checked', confidence: 'Official exact tariff line' },
                { hs_code: '8507600010', base_rate: 0, source_status: 'official_source_checked', confidence: 'Official exact tariff line' },
                { hs_code: '8507600090', base_rate: 0.027, source_status: 'official_source_checked', confidence: 'Official exact tariff line' }
            ]
        }] },
        priorityMatrix: { rows: [{ product_id: 'tablet', import_country: 'EU', route: 'CN->EU', hs_code: '847130', source_trust: 'official_exact', exact_base_rate_covered: true }] }
    };
}

test('exact tariff coverage reports prefix, product and mixed-rate scope separately', () => {
    const report = buildExactTariffCoverageReport({ ...fixture(), markets: ['EU'], now: new Date('2026-10-21T00:00:00.000Z') });
    assert.equal(report.ok, true);
    assert.equal(report.summary.covered_prefix_count, 2);
    assert.equal(report.summary.product_route_gap_count, 0);
    assert.deepEqual(report.markets[0].mixed_rate_prefixes, ['850760']);
    assert.equal(report.markets[0].status, 'exact_with_scope_gates');
});

test('coverage report fails closed for stale or missing exact prefixes', () => {
    const input = fixture();
    input.dutyPayload.rules[0].exact_code_overrides = input.dutyPayload.rules[0].exact_code_overrides.slice(0, 1);
    const report = buildExactTariffCoverageReport({ ...input, markets: ['EU'], now: new Date('2026-11-01T00:00:00.000Z') });
    assert.equal(report.ok, false);
    assert.deepEqual(report.markets[0].missing_prefixes, ['850760']);
    assert.equal(report.markets[0].stale, true);
});
