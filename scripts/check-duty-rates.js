#!/usr/bin/env node
/**
 * Local health check for Post-Entry duty-rate coverage.
 *
 * This script does not fetch the internet. It verifies that the maintainable
 * duty-rate table covers the high-frequency Post-Entry sample set and prints a
 * compact coverage summary for the admin/operator workflow.
 */
const fs = require('fs');
const path = require('path');

const {
    calculatePostEntryValue,
    calculateDutyImpact,
    classifyRateSourceTrust
} = require('../lib/post-entry-value');
const {
    summarizeDutyRateCoverage
} = require('./update-us-duty-rates');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const SAMPLES_PATH = path.join(ROOT, 'data', 'post-entry-samples.json');
const PRIORITY_IMPORT_MARKETS = ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'VN', 'MY', 'TW', 'RU'];
const PRIORITY_HS_PREFIXES = ['847130', '850440', '850760', '8517', '8525', '8528', '8541', '8542', '8543'];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runSample(sample) {
    const value = calculatePostEntryValue({
        incoterm: sample.incoterm,
        declaredAmount: sample.declared_amount,
        freight: sample.freight,
        insurance: sample.insurance,
        otherCharges: sample.other_charges
    });
    const duty = calculateDutyImpact(value, {
        importCountryCode: sample.import_country,
        originCountryCode: sample.origin_country,
        hsCode: sample.hs_code,
        entryDate: sample.entry_date || '06 / 07 / 26'
    }, {
        declaredDuty: sample.declared_duty
    });
    const sourceStatuses = Array.from(new Set((duty.sourceBreakdown || []).map(item => item.status)));
    const sourceTrust = classifyRateSourceTrust(duty.sourceBreakdown || []);
    const failures = [];

    if (Boolean(duty.covered) !== Boolean(sample.expect_covered)) {
        failures.push(`coverage expected ${sample.expect_covered} but got ${duty.covered}`);
    }
    if (duty.covered && typeof sample.expect_min_total_rate === 'number' && duty.totalRate < sample.expect_min_total_rate) {
        failures.push(`total rate ${duty.totalRate} is below expected minimum ${sample.expect_min_total_rate}`);
    }
    (sample.expect_source_statuses || []).forEach((status) => {
        if (!sourceStatuses.includes(status)) {
            failures.push(`missing source status ${status}`);
        }
    });
    if (sample.expect_source_trust && sourceTrust.level !== sample.expect_source_trust) {
        failures.push(`source trust expected ${sample.expect_source_trust} but got ${sourceTrust.level}`);
    }

    return {
        id: sample.id,
        product: sample.product,
        route: `${sample.origin_country}->${sample.import_country}`,
        hs_code: sample.hs_code,
        covered: duty.covered,
        total_rate: duty.totalRate,
        source_statuses: sourceStatuses,
        source_trust: sourceTrust.level,
        failures
    };
}

function summarizeSourceRoadmap(sourcesPayload, dutySummary) {
    const coveredCountries = new Set((dutySummary.countries || []).map(item => item.import_country));
    const rows = sourcesPayload.sources || [];
    const missingCoverage = rows
        .filter(source => !coveredCountries.has(source.country))
        .map(source => source.country);
    const missingRoadmap = (dutySummary.countries || [])
        .filter(country => !rows.some(source => source.country === country.import_country))
        .map(country => country.import_country);
    const statusCounts = rows.reduce((counts, source) => {
        counts[source.source_status] = (counts[source.source_status] || 0) + 1;
        return counts;
    }, {});

    return {
        source_count: rows.length,
        status_counts: statusCounts,
        auto_updatable: rows.filter(source => source.source_status === 'auto_updatable').map(source => source.country),
        hybrid_official_candidate: rows.filter(source => source.source_status === 'hybrid_official_candidate').map(source => source.country),
        benchmark_updatable: rows.filter(source => source.source_status === 'benchmark_updatable').map(source => source.country),
        updater_candidates: rows.filter(source => source.source_status === 'updater_candidate').map(source => source.country),
        official_link_only: rows.filter(source => source.source_status === 'official_link').map(source => source.country),
        benchmark_only: rows.filter(source => source.source_status === 'benchmark').map(source => source.country),
        missing_coverage: missingCoverage,
        missing_roadmap: missingRoadmap
    };
}

function summarizeRuleSourceQuality(dutyPayload) {
    const rows = Array.isArray(dutyPayload?.rules) ? dutyPayload.rules : [];
    const byCountry = {};
    rows.forEach((rule) => {
        const country = String(rule.import_country || '').toUpperCase();
        if (!country) return;
        byCountry[country] ||= {
            country,
            rule_count: 0,
            official_source_checked: 0,
            scope_check_required: 0,
            benchmark_source_checked: 0,
            indicative: 0,
            source_statuses: {}
        };
        const bucket = byCountry[country];
        const status = rule.source_status || 'indicative';
        bucket.rule_count += 1;
        bucket.source_statuses[status] = (bucket.source_statuses[status] || 0) + 1;
        if (status in bucket) {
            bucket[status] += 1;
        } else {
            bucket.indicative += 1;
        }
    });
    return Object.values(byCountry).map((row) => {
        const officialOrScope = row.official_source_checked + row.scope_check_required;
        const coverage_level = row.official_source_checked === row.rule_count
            ? 'official_all'
            : officialOrScope === row.rule_count
                ? 'official_or_scope_all'
                : row.benchmark_source_checked === row.rule_count
                    ? 'benchmark_all'
                    : 'mixed';
        return {
            ...row,
            coverage_level
        };
    }).sort((a, b) => a.country.localeCompare(b.country));
}

function ruleMatchesPriority(rule, market, prefix) {
    const importCountry = String(rule.import_country || '').toUpperCase();
    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes.map(String) : [];
    return importCountry === market && prefixes.includes(prefix);
}

function buildDutyRateGapMatrix(dutyPayload, {
    markets = PRIORITY_IMPORT_MARKETS,
    prefixes = PRIORITY_HS_PREFIXES
} = {}) {
    const rules = Array.isArray(dutyPayload?.rules) ? dutyPayload.rules : [];
    const rows = markets.map((market) => {
        const covered = prefixes.filter((prefix) => rules.some((rule) => ruleMatchesPriority(rule, market, prefix)));
        const missing = prefixes.filter((prefix) => !covered.includes(prefix));
        const status = missing.length === 0 ? 'full' : covered.length > 0 ? 'partial' : 'missing';
        return {
            market,
            status,
            covered,
            missing
        };
    });
    return {
        markets,
        prefixes,
        full_count: rows.filter((row) => row.status === 'full').length,
        partial_count: rows.filter((row) => row.status === 'partial').length,
        missing_count: rows.filter((row) => row.status === 'missing').length,
        missing_total: rows.reduce((sum, row) => sum + row.missing.length, 0),
        rows
    };
}

function runDutyRateHealthCheck() {
    const dutyPayload = readJson(DUTY_RATES_PATH);
    const sourcesPayload = readJson(DUTY_RATE_SOURCES_PATH);
    const samplesPayload = readJson(SAMPLES_PATH);
    const samples = samplesPayload.samples || [];
    const sampleResults = samples.map(runSample);
    const failures = sampleResults.filter(result => result.failures.length);
    const dutySummary = summarizeDutyRateCoverage(dutyPayload);
    const dutyGapMatrix = buildDutyRateGapMatrix(dutyPayload);
    const sourceRoadmap = summarizeSourceRoadmap(sourcesPayload, dutySummary);
    const sourceFailures = [];
    if (sourceRoadmap.missing_coverage.length) {
        sourceFailures.push(`source roadmap includes countries without duty rules: ${sourceRoadmap.missing_coverage.join(', ')}`);
    }
    if (sourceRoadmap.missing_roadmap.length) {
        sourceFailures.push(`duty rules include countries missing source roadmap: ${sourceRoadmap.missing_roadmap.join(', ')}`);
    }

    return {
        ok: failures.length === 0 && sourceFailures.length === 0,
        duty_rate_summary: dutySummary,
        duty_rate_gap_matrix: dutyGapMatrix,
        source_roadmap_summary: sourceRoadmap,
        source_quality_summary: summarizeRuleSourceQuality(dutyPayload),
        sample_count: samples.length,
        failed_sample_count: failures.length,
        failures: failures.concat(sourceFailures.map(error => ({ id: 'source-roadmap', failures: [error] }))),
        samples: sampleResults
    };
}

function main() {
    const result = runDutyRateHealthCheck();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    PRIORITY_IMPORT_MARKETS,
    PRIORITY_HS_PREFIXES,
    buildDutyRateGapMatrix,
    runDutyRateHealthCheck,
    runSample,
    summarizeRuleSourceQuality,
    summarizeSourceRoadmap
};
