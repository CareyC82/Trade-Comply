'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEuExactCoverageHealth } = require('../scripts/check-eu-exact-tariff-coverage');

function fixture({ checkedAt = '2026-10-20T00:00:00.000Z', includeServer = true } = {}) {
    const exact = [{ hs_code: '8471300000', confidence: 'Official exact tariff line' }];
    if (includeServer) exact.push({ hs_code: '8471500000', confidence: 'Official exact tariff line' });
    return {
        last_eu_taric_benchmark_sync_at: checkedAt,
        last_eu_taric_benchmark_sync: { ok: true },
        rules: [{ import_country: 'EU', hs_prefixes: ['847130', '847150'], exact_code_overrides: exact }]
    };
}

test('EU exact tariff health accepts fresh complete maintained-prefix coverage', () => {
    const health = buildEuExactCoverageHealth(fixture(), { now: new Date('2026-10-21T00:00:00.000Z') });
    assert.equal(health.ok, true, JSON.stringify(health.issues));
    assert.equal(health.covered_prefix_count, 2);
    assert.equal(health.exact_code_count, 2);
});

test('EU exact tariff health blocks a missing maintained prefix', () => {
    const health = buildEuExactCoverageHealth(fixture({ includeServer: false }), { now: new Date('2026-10-21T00:00:00.000Z') });
    assert.equal(health.ok, false);
    assert.deepEqual(health.missing_prefixes, ['847150']);
    assert.match(health.issues[0], /847150/);
});

test('EU exact tariff health blocks stale official evidence', () => {
    const health = buildEuExactCoverageHealth(fixture({ checkedAt: '2026-10-01T00:00:00.000Z' }), { now: new Date('2026-10-21T00:00:00.000Z') });
    assert.equal(health.ok, false);
    assert.ok(health.issues.some((issue) => /stale/.test(issue)));
});
