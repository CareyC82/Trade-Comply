const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    EXPORT_TAX_PRIORITY_HS_PREFIXES,
    getPostEntryRouteCountries,
    runPostEntryTaxCoverageCheck,
    summarizeExportTaxCoverage
} = require('../scripts/check-post-entry-tax-coverage');

const exportTaxRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'export-tax-rates.json'), 'utf8'));

test('export-side Post-Entry coverage covers every maintained route country', () => {
    const countries = getPostEntryRouteCountries();
    const summary = summarizeExportTaxCoverage(exportTaxRates, { countries });

    assert.equal(summary.missing_countries.length, 0, `Missing countries: ${summary.missing_countries.join(', ')}`);
    assert.equal(summary.partial_countries.length, 0, `Partial countries: ${summary.partial_countries.join(', ')}`);
    assert.equal(summary.missing_total, 0);
    assert.equal(summary.rows.length, countries.length);
    summary.rows.forEach((row) => {
        assert.deepEqual(row.covered, EXPORT_TAX_PRIORITY_HS_PREFIXES, `${row.origin_country} should cover every export-side priority HS prefix`);
    });
});

test('China export rebate coverage stays exact-HS guarded', () => {
    const summary = summarizeExportTaxCoverage(exportTaxRates);
    const china = summary.rows.find((row) => row.origin_country === 'CN');

    assert.ok(china, 'China export-side coverage should exist');
    assert.ok(china.rate_statuses.includes('exact_hs_required'));
    assert.equal(summary.cn_has_exact_hs_warning, true);
});

test('non-China export-side rules do not pretend official export tax rates are maintained', () => {
    const summary = summarizeExportTaxCoverage(exportTaxRates);

    assert.deepEqual(summary.false_official_rate_claims, []);
    summary.rows
        .filter((row) => row.origin_country !== 'CN')
        .forEach((row) => {
            assert.equal(row.rate_statuses.includes('exact_hs_required'), false, `${row.origin_country} should not claim exact rebate-rate coverage`);
        });
});

test('combined Post-Entry tax coverage check separates import duty from export-side review', () => {
    const result = runPostEntryTaxCoverageCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.import_duty.duty_rate_gap_matrix.missing_total, 0);
    assert.equal(result.export_tax.missing_total, 0);
    assert.ok(result.export_tax.rate_status_counts.exact_hs_required >= 1);
    assert.ok(result.export_tax.rate_status_counts.not_rate_based >= 1);
});
