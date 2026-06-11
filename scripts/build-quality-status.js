#!/usr/bin/env node
'use strict';

const {
    runQualityAudit,
    formatAuditReport
} = require('./audit-search-quality');
const {
    runDutyRateHealthCheck
} = require('./check-duty-rates');

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

function buildQualityStatus() {
    const searchAudit = runQualityAudit();
    const dutyHealth = runDutyRateHealthCheck();
    const search = summarizeSearchAudit(searchAudit);
    const duty = summarizeDutyHealth(dutyHealth);
    return {
        ok: search.ok && duty.ok,
        generated_at: new Date().toISOString(),
        search,
        duty,
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
    summarizeDutyHealth
};
