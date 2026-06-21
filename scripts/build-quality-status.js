#!/usr/bin/env node
'use strict';

const {
    runQualityAudit,
    formatAuditReport
} = require('./audit-search-quality');
const {
    runDutyRateHealthCheck
} = require('./check-duty-rates');
const {
    runPostEntryTaxCoverageCheck
} = require('./check-post-entry-tax-coverage');
const {
    buildOpportunityPriorityList
} = require('../lib/trade-opportunity');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(relativePath, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function summarizeSearchAudit(searchAudit) {
    const results = Array.isArray(searchAudit?.results) ? searchAudit.results : [];
    const failuresByType = {};
    const warningsByType = {};

    results.forEach((item) => {
        (item.issues?.failures || []).forEach((code) => {
            failuresByType[code] = (failuresByType[code] || 0) + 1;
        });
        (item.issues?.warnings || []).forEach((code) => {
            warningsByType[code] = (warningsByType[code] || 0) + 1;
        });
    });

    return {
        ok: Boolean(searchAudit?.ok),
        samples: searchAudit?.summary?.samples || results.length,
        failed: searchAudit?.summary?.failed || 0,
        warned: searchAudit?.summary?.warned || 0,
        failures_by_type: failuresByType,
        warnings_by_type: warningsByType,
        failing_samples: results
            .filter((item) => (item.issues?.failures || []).length > 0)
            .map((item) => ({
                id: item.id,
                query: item.query,
                route: item.route,
                failures: item.issues.failures,
                top_rules: item.topRules
            })),
        warning_samples: results
            .filter((item) => (item.issues?.warnings || []).length > 0)
            .map((item) => ({
                id: item.id,
                query: item.query,
                route: item.route,
                warnings: item.issues.warnings,
                top_rules: item.topRules
            }))
    };
}

function summarizeDutyHealth(dutyHealth) {
    const gapMatrix = dutyHealth?.duty_rate_gap_matrix || {};
    const rows = Array.isArray(gapMatrix.rows) ? gapMatrix.rows : [];
    return {
        ok: Boolean(dutyHealth?.ok) && Number(gapMatrix.missing_total || 0) === 0,
        sample_count: dutyHealth?.sample_count || 0,
        failed_sample_count: dutyHealth?.failed_sample_count || 0,
        rule_count: dutyHealth?.duty_rate_summary?.rule_count || 0,
        country_count: dutyHealth?.duty_rate_summary?.country_count || 0,
        source_count: dutyHealth?.source_roadmap_summary?.source_count || 0,
        source_quality_summary: dutyHealth?.source_quality_summary || [],
        priority_rate_matrix: dutyHealth?.priority_rate_matrix || null,
        gap_matrix: gapMatrix,
        markets_missing_priority_hs: rows
            .filter((row) => (row.missing || []).length > 0)
            .map((row) => ({
                market: row.market,
                missing: row.missing,
                covered: row.covered
            })),
        failures: dutyHealth?.failures || []
    };
}

function summarizePostEntryTaxCoverage(taxHealth) {
    const exportTax = taxHealth?.export_tax || {};
    return {
        ok: Boolean(taxHealth?.ok),
        import_ok: Boolean(taxHealth?.import_duty?.ok),
        export_ok: Number(exportTax.missing_total || 0) === 0
            && (exportTax.false_official_rate_claims || []).length === 0
            && Boolean(exportTax.cn_has_exact_hs_warning),
        export_rule_count: exportTax.rule_count || 0,
        export_country_count: exportTax.country_count || 0,
        export_missing_countries: exportTax.missing_countries || [],
        export_partial_countries: exportTax.partial_countries || [],
        export_rate_status_counts: exportTax.rate_status_counts || {},
        false_official_rate_claims: exportTax.false_official_rate_claims || [],
        failures: taxHealth?.failures || []
    };
}

function summarizeOpportunityPriority() {
    const dutyRates = readJson('data/duty-rates.json', { rules: [] });
    const priorityMatrix = readJson('data/post-entry-rate-priority-matrix.json', { routes: [] });
    const rows = buildOpportunityPriorityList({ dutyRates, priorityMatrix, limit: 24 });
    const quoteReady = rows.filter((row) => row.quote_readiness === 'Quote-ready').length;
    const selective = rows.filter((row) => row.quote_readiness === 'Selective quote').length;
    const highRisk = rows.filter((row) => row.landed_cost_risk === 'High').length;
    const compareFirst = rows.filter((row) => !row.best_is_selected).length;
    const bucketCounts = rows.reduce((acc, row) => {
        const bucket = row.workbench_bucket || 'data_gap';
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
    }, {
        top_opportunity: 0,
        data_gap: 0,
        need_tariff_upgrade: 0,
        need_rule_upgrade: 0
    });
    const bucketRows = (bucket) => rows
        .filter((row) => row.workbench_bucket === bucket)
        .slice(0, 8);
    const sourceTrustCounts = rows.reduce((acc, row) => {
        const key = row.selected_source_trust || 'not_covered';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const quoteReadinessCounts = rows.reduce((acc, row) => {
        const key = row.quote_readiness || 'Research only';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const officialEnough = new Set(['official_exact_rate', 'official_duty_tax_estimate', 'mixed_official_estimate']);
    const tariffCoveragePriorities = rows
        .filter((row) => !officialEnough.has(row.selected_source_trust) || row.workbench_bucket === 'need_tariff_upgrade')
        .slice(0, 12)
        .map((row) => ({
            route: row.route,
            product_id: row.product_id,
            hs_code: row.hs_code,
            source_trust: row.selected_source_trust,
            coverage_label: row.coverage_label,
            parser_priority: row.parser_priority,
            next_action: row.next_action,
            priority_score: row.priority_score
        }));

    return {
        ok: rows.length > 0,
        row_count: rows.length,
        quote_ready_count: quoteReady,
        selective_quote_count: selective,
        high_landed_cost_risk_count: highRisk,
        compare_first_count: compareFirst,
        bucket_counts: bucketCounts,
        source_trust_counts: sourceTrustCounts,
        quote_readiness_counts: quoteReadinessCounts,
        official_or_hybrid_count: rows.filter((row) => officialEnough.has(row.selected_source_trust)).length,
        tariff_coverage_priorities: tariffCoveragePriorities,
        top_opportunities: bucketRows('top_opportunity'),
        data_gaps: bucketRows('data_gap'),
        tariff_upgrades: bucketRows('need_tariff_upgrade'),
        rule_upgrades: bucketRows('need_rule_upgrade'),
        rows
    };
}

function buildQualityStatus() {
    const searchAudit = runQualityAudit();
    const dutyHealth = runDutyRateHealthCheck();
    const taxHealth = runPostEntryTaxCoverageCheck();
    const search = summarizeSearchAudit(searchAudit);
    const duty = summarizeDutyHealth(dutyHealth);
    const postEntryTax = summarizePostEntryTaxCoverage(taxHealth);
    const opportunity = summarizeOpportunityPriority();
    return {
        ok: search.ok && duty.ok && postEntryTax.ok && opportunity.ok,
        generated_at: new Date().toISOString(),
        search,
        duty,
        post_entry_tax: postEntryTax,
        opportunity,
        compact_report: formatAuditReport(searchAudit)
    };
}

function main() {
    const status = buildQualityStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    buildQualityStatus,
    summarizeSearchAudit,
    summarizeDutyHealth,
    summarizePostEntryTaxCoverage,
    summarizeOpportunityPriority
};
