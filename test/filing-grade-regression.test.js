'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFilingGradeRegression } = require('../lib/filing-grade-regression');

test('filing-grade matrix keeps historical and future rates separated by market, origin and entry date', () => {
    const base = { confidence: 'Official exact tariff line', source_status: 'official_source_checked' };
    const payload = { rules: [{ id: 'my-test', import_country: 'MY', origin_country: 'CN', hs_prefixes: ['851762'], base_rate: 0.01, additional_rate: 0.02, exact_code_overrides: [
        { ...base, hs_code: '8517620000', base_rate: 0.05, effective_from: '2026-01-01', effective_to: '2026-08-31' },
        { ...base, hs_code: '8517620000', base_rate: 0.08, effective_from: '2026-09-01' }
    ] }] };
    const result = buildFilingGradeRegression(payload, { asOfDate: '2026-08-25' });
    assert.equal(result.ok, true);
    assert.equal(result.checked_rows, 2);
    assert.equal(result.historical_rows, 0);
    assert.equal(result.current_rows, 1);
    assert.equal(result.future_rows, 1);
    assert.deepEqual(result.rows.map((row) => row.resolved_rate), [0.05, 0.08]);
});

test('filing-grade matrix blocks overlapping official periods', () => {
    const payload = { rules: [{ id: 'overlap', import_country: 'KR', origin_country: '*', hs_prefixes: ['851762'], exact_code_overrides: [
        { hs_code: '8517620000', base_rate: 0.05, effective_from: '2026-01-01', effective_to: '2026-12-31' },
        { hs_code: '8517620000', base_rate: 0.08, effective_from: '2026-09-01' }
    ] }] };
    const result = buildFilingGradeRegression(payload, { asOfDate: '2026-10-01' });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((row) => row.type === 'overlapping_effective_periods'));
});

test('filing-grade matrix verifies an official special-program effective-date boundary', () => {
    const result = buildFilingGradeRegression({
        rules: [],
        special_programs: [{
            id: 'EU-US-TEST', import_markets: ['EU'], origin_countries: ['US'],
            effective_from: '2026-07-01', official_url: 'https://eur-lex.europa.eu/example'
        }]
    }, { asOfDate: '2026-08-26' });
    assert.equal(result.ok, true);
    assert.equal(result.special_program_count, 1);
    assert.equal(result.special_program_rows[0].active_before, false);
    assert.equal(result.special_program_rows[0].active_on_start, true);
});
