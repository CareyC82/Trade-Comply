'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { maintainedProductFamilies, buildExactTariffHealth } = require('../scripts/check-exact-tariff-sync-health');

function exactRows(count, seed) {
    const families = [...new Set(maintainedProductFamilies().flatMap((row) => row.families))];
    const familyRows = families.map((family) => ({ hs_code: family.padEnd(8, '0') }));
    const padding = Array.from({ length: Math.max(0, count - familyRows.length) }, (_, index) => ({ hs_code: String(seed + index) }));
    return [...familyRows, ...padding].slice(0, count);
}

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
            { import_country: 'AU', exact_code_overrides: exactRows(au, 70000000) },
            { import_country: 'NZ', exact_code_overrides: exactRows(nz, 71000000) }
        ]
    };
}

test('ANZ exact tariff health accepts fresh complete last-good data', () => {
    const health = buildExactTariffHealth(fixture(), { now: new Date('2026-09-03T00:00:00.000Z') });
    assert.equal(health.ok, true, JSON.stringify(health.issues));
});

test('ANZ exact tariff health fails when one maintained electronics family disappears', () => {
    const payload = fixture();
    payload.rules[0].exact_code_overrides = payload.rules[0].exact_code_overrides
        .filter((row) => !String(row.hs_code).startsWith('851821'));
    while (payload.rules[0].exact_code_overrides.length < 100) {
        payload.rules[0].exact_code_overrides.push({ hs_code: String(72000000 + payload.rules[0].exact_code_overrides.length) });
    }
    const health = buildExactTariffHealth(payload, { now: new Date('2026-09-03T00:00:00.000Z') });
    assert.equal(health.ok, false);
    assert.ok(health.issues.some((item) => /bluetooth_speaker/.test(item)));
});

test('ANZ exact tariff health fails on stale or truncated market data', () => {
    const health = buildExactTariffHealth(fixture({ checkedAt: '2026-08-01T00:00:00.000Z', au: 20 }), { now: new Date('2026-09-03T00:00:00.000Z') });
    assert.equal(health.ok, false);
    assert.ok(health.issues.some((item) => /AU: only 20/.test(item)));
    assert.ok(health.issues.some((item) => /stale/.test(item)));
});
