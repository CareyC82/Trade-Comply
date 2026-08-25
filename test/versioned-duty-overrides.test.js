'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeEffectiveOverrides, activeOn } = require('../lib/versioned-duty-overrides');
const { buildTariffRows, buildUpcomingTariffRows } = require('../lib/tariff-watch');

test('new official rate closes the prior period and remains queryable by date', () => {
    const oldRow = { hs_code: '85176200', base_rate: 0.05, confidence: 'Official exact tariff line', source_status: 'official_source_checked', effective_from: '2026-01-01' };
    const rows = mergeEffectiveOverrides([oldRow], [{ ...oldRow, base_rate: 0.08 }], '2026-09-01');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].effective_to, '2026-08-31');
    assert.equal(rows.filter((row) => activeOn(row, '2026-08-31'))[0].base_rate, 0.05);
    assert.equal(rows.filter((row) => activeOn(row, '2026-09-01'))[0].base_rate, 0.08);
});

test('Tariff Watch isolates current and future effective rates', () => {
    const dutyRates = { rules: [{ id: 'rate', import_country: 'MY', origin_country: '*', hs_prefixes: ['851762'], exact_code_overrides: [
        { hs_code: '85176200', base_rate: 0.05, confidence: 'Official exact tariff line', source_status: 'official_source_checked', effective_from: '2026-01-01', effective_to: '2026-08-31' },
        { hs_code: '85176200', base_rate: 0.08, confidence: 'Official exact tariff line', source_status: 'official_source_checked', effective_from: '2026-09-01' }
    ] }] };
    assert.equal(buildTariffRows(dutyRates, { asOfDate: '2026-08-25' })[0].baseRate, '5.0%');
    assert.equal(buildUpcomingTariffRows(dutyRates, '2026-08-25')[0].baseRate, '8.0%');
    assert.equal(buildTariffRows(dutyRates, { asOfDate: '2026-09-01' })[0].baseRate, '8.0%');
});

test('an unchanged official rate keeps its original effective start', () => {
    const row = { hs_code: '85176200', base_rate: 0.05, confidence: 'Official exact tariff line', source_status: 'official_source_checked', effective_from: '2026-01-01' };
    const merged = mergeEffectiveOverrides([row], [{ ...row, source_note: 'refreshed' }], '2026-09-01');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].effective_from, '2026-01-01');
    assert.equal(merged[0].source_note, 'refreshed');
});
