'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExactTariffHealth } = require('../scripts/check-exact-tariff-sync-health');

function fixture({ checkedAt = '2026-09-02T00:00:00.000Z', au = 100, nz = 150 } = {}) {
    return {
        last_exact_national_tariff_sync: {
            checked_at: checkedAt,
            results: [
                { country: 'AU', ok: true, skipped: false, row_count: au },
                { country: 'NZ', ok: true, skipped: false, row_count: nz }
            ]
        },
        rules: [
            { import_country: 'AU', exact_code_overrides: Array.from({ length: au }, (_, index) => ({ hs_code: String(84000000 + index) })) },
            { import_country: 'NZ', exact_code_overrides: Array.from({ length: nz }, (_, index) => ({ hs_code: String(85000000 + index) })) }
        ]
    };
}

test('ANZ exact tariff health accepts fresh complete last-good data', () => {
    const health = buildExactTariffHealth(fixture(), { now: new Date('2026-09-03T00:00:00.000Z') });
    assert.equal(health.ok, true, JSON.stringify(health.issues));
});

test('ANZ exact tariff health fails on stale or truncated market data', () => {
    const health = buildExactTariffHealth(fixture({ checkedAt: '2026-08-01T00:00:00.000Z', au: 20 }), { now: new Date('2026-09-03T00:00:00.000Z') });
    assert.equal(health.ok, false);
    assert.ok(health.issues.some((item) => /AU: only 20/.test(item)));
    assert.ok(health.issues.some((item) => /stale/.test(item)));
});
