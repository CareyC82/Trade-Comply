#!/usr/bin/env node
/**
 * Combined Post-Entry tax coverage check.
 *
 * Import-side duty rates live in data/duty-rates.json. Export-side tax/rebate
 * coverage is tracked separately so the product does not imply official export
 * duty or rebate calculations where only filing-value review is maintained.
 */
const fs = require('fs');
const path = require('path');

const {
    runDutyRateHealthCheck
} = require('./check-duty-rates');

const ROOT = path.join(__dirname, '..');
const EXPORT_TAX_RATES_PATH = path.join(ROOT, 'data', 'export-tax-rates.json');
const COUNTRY_REGISTRY_PATH = path.join(ROOT, 'data', 'country-registry.json');
const EXPORT_TAX_PRIORITY_HS_PREFIXES = [
    '847130',
    '850440',
    '850760',
    '8517',
    '8525',
    '8528',
    '8541',
    '8542',
    '8543'
];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPostEntryRouteCountries(registry = readJson(COUNTRY_REGISTRY_PATH)) {
    const rows = Array.isArray(registry.route_options) ? registry.route_options : [];
    return rows
        .map((row) => String(row?.value || '').toUpperCase())
        .filter((code) => code && code !== 'GLOBAL');
}

function normalizeExportRule(raw = {}) {
    return {
        id: raw.id || '',
        origin_country: String(raw.origin_country || raw.originCountry || '').toUpperCase(),
        destination_country: String(raw.destination_country || raw.destinationCountry || '*').toUpperCase(),
        coverage_type: raw.coverage_type || '',
        rate_status: raw.rate_status || '',
        source_status: raw.source_status || '',
        hs_prefixes: Array.isArray(raw.hs_prefixes) ? raw.hs_prefixes.map(String) : [],
        source_name: raw.source_name || '',
        source_url: raw.source_url || '',
        source_note: raw.source_note || '',
        calculation_note: raw.calculation_note || ''
    };
}

function ruleCoversPrefix(rule, prefix) {
    return rule.hs_prefixes.includes(prefix);
}

function summarizeExportTaxCoverage(exportPayload, {
    countries = getPostEntryRouteCountries(),
    prefixes = EXPORT_TAX_PRIORITY_HS_PREFIXES
} = {}) {
    const rules = (Array.isArray(exportPayload?.rules) ? exportPayload.rules : []).map(normalizeExportRule);
    const byOrigin = new Map();
    rules.forEach((rule) => {
        if (!rule.origin_country) return;
        if (!byOrigin.has(rule.origin_country)) {
            byOrigin.set(rule.origin_country, []);
        }
        byOrigin.get(rule.origin_country).push(rule);
    });

    const rows = countries.map((country) => {
        const countryRules = byOrigin.get(country) || [];
        const covered = prefixes.filter((prefix) => countryRules.some((rule) => ruleCoversPrefix(rule, prefix)));
        const missing = prefixes.filter((prefix) => !covered.includes(prefix));
        const rateStatuses = Array.from(new Set(countryRules.map((rule) => rule.rate_status).filter(Boolean))).sort();
        const sourceStatuses = Array.from(new Set(countryRules.map((rule) => rule.source_status).filter(Boolean))).sort();
        return {
            origin_country: country,
            status: countryRules.length === 0 ? 'missing' : missing.length === 0 ? 'covered' : 'partial',
            rule_count: countryRules.length,
            covered,
            missing,
            rate_statuses: rateStatuses,
            source_statuses: sourceStatuses,
            rules: countryRules.map((rule) => rule.id)
        };
    });

    const statusCounts = rows.reduce((counts, row) => {
        counts[row.status] = (counts[row.status] || 0) + 1;
        return counts;
    }, {});
    const rateStatusCounts = rules.reduce((counts, rule) => {
        counts[rule.rate_status] = (counts[rule.rate_status] || 0) + 1;
        return counts;
    }, {});
    const falseOfficialRateClaims = rules
        .filter((rule) => rule.origin_country !== 'CN')
        .filter((rule) => !['not_rate_based', 'regional_route_not_exact_rate', 'sanctions_scope_separate'].includes(rule.rate_status))
        .map((rule) => rule.id);
    const cnRules = rules.filter((rule) => rule.origin_country === 'CN');
    const cnHasExactHsWarning = cnRules.some((rule) => (
        rule.coverage_type === 'export_rebate_basis'
        && rule.rate_status === 'exact_hs_required'
        && /10-digit/i.test(rule.source_note)
    ));

    return {
        updated_at: exportPayload?.updated_at || null,
        country_count: rows.length,
        rule_count: rules.length,
        status_counts: statusCounts,
        rate_status_counts: rateStatusCounts,
        missing_countries: rows.filter((row) => row.status === 'missing').map((row) => row.origin_country),
        partial_countries: rows.filter((row) => row.status === 'partial').map((row) => row.origin_country),
        missing_total: rows.reduce((sum, row) => sum + row.missing.length, 0),
        false_official_rate_claims: falseOfficialRateClaims,
        cn_has_exact_hs_warning: cnHasExactHsWarning,
        rows
    };
}

function runPostEntryTaxCoverageCheck() {
    const importDuty = runDutyRateHealthCheck();
    const exportPayload = readJson(EXPORT_TAX_RATES_PATH);
    const exportTax = summarizeExportTaxCoverage(exportPayload);
    const failures = [];

    (importDuty.failures || []).forEach((failure) => {
        failures.push({
            scope: 'import_duty',
            id: failure.id || 'import-duty',
            failures: failure.failures || [String(failure)]
        });
    });
    if (exportTax.missing_countries.length) {
        failures.push({
            scope: 'export_tax',
            id: 'missing-export-country-coverage',
            failures: [`missing export-side coverage for: ${exportTax.missing_countries.join(', ')}`]
        });
    }
    if (exportTax.missing_total > 0) {
        failures.push({
            scope: 'export_tax',
            id: 'missing-export-hs-prefix-coverage',
            failures: [`missing ${exportTax.missing_total} export-side priority HS prefix cells`]
        });
    }
    if (exportTax.false_official_rate_claims.length) {
        failures.push({
            scope: 'export_tax',
            id: 'false-official-export-rate-claims',
            failures: [`non-China export rules must not claim exact official tax/rebate rates: ${exportTax.false_official_rate_claims.join(', ')}`]
        });
    }
    if (!exportTax.cn_has_exact_hs_warning) {
        failures.push({
            scope: 'export_tax',
            id: 'china-export-rebate-exact-hs-warning',
            failures: ['China export rebate coverage must warn that exact 10-digit HS/CN code is required.']
        });
    }

    return {
        ok: Boolean(importDuty.ok) && failures.length === 0,
        generated_at: new Date().toISOString(),
        import_duty: importDuty,
        export_tax: exportTax,
        failures
    };
}

function main() {
    const result = runPostEntryTaxCoverageCheck();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    EXPORT_TAX_RATES_PATH,
    EXPORT_TAX_PRIORITY_HS_PREFIXES,
    getPostEntryRouteCountries,
    normalizeExportRule,
    runPostEntryTaxCoverageCheck,
    summarizeExportTaxCoverage
};
