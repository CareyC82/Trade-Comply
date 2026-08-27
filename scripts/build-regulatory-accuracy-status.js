#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const models = require('../lib/wearable-product-models');
const { buildLifecycleAudit } = require('../lib/regulatory-lifecycle-audit');
const { buildReport } = require('./build-consumer-regulatory-coverage');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'regulatory-accuracy-status.json');
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); } catch { return fallback; } }

function buildAccuracyStatus(now = new Date()) {
    const coverage = buildReport();
    const lifecycle = buildLifecycleAudit(models.sources);
    const health = read('data/consumer-regulatory-source-health.json', { sources: [] });
    const changes = read('data/consumer-regulatory-changes.json', { changes: [] });
    const launch = read('data/automation-launch-status.json', { summary: {}, duty_rates: [] });
    const reviewCounts = (changes.changes || []).reduce((result, row) => {
        const status = row.review_status || 'pending_review';
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {});
    const parserGaps = launch.summary?.duty_rate_launch_levels?.parser_gap || [];
    const baselineCells = coverage.cells.filter((cell) => cell.evidence_depth !== 'product_and_attribute_specific');
    return {
        schema_version: 1,
        generated_at: now.toISOString(),
        ok: lifecycle.issue_count === 0 && coverage.attribute_scenario_audit.issue_count === 0,
        source_control: {
            source_count: lifecycle.source_count,
            lifecycle_issue_count: lifecycle.issue_count,
            automatic_monitoring_ready_count: health.automatic_monitoring_ready_count || 0,
            automatic_monitoring_blocked_count: health.automatic_monitoring_blocked_count || lifecycle.source_count,
            failed_link_count: health.failed_link_count || 0,
            pending_effective_date_sources: (health.sources || []).filter((row) => row.alerts?.includes('effective_date_pending')).map((row) => row.id)
        },
        product_market_depth: {
            product_count: coverage.product_count,
            market_count: coverage.markets.length,
            matrix_cell_count: coverage.matrix_cell_count,
            attribute_scenario_cell_count: coverage.attribute_scenario_audit.matrix_cell_count,
            attribute_issue_count: coverage.attribute_scenario_audit.issue_count,
            baseline_only_cells: baselineCells.map((cell) => ({ market: cell.market, product_id: cell.product_id, limitation: cell.coverage_limitation }))
        },
        reviewed_change_pipeline: {
            status_counts: reviewCounts,
            automatic_rule_publication: false,
            required_release_states: ['pending_review', 'evidence_approved', 'rule_tests_passed', 'rule_published']
        },
        tariff_parser_gaps: {
            markets: parserGaps,
            filing_grade_markets: launch.summary?.filing_grade_auto_countries || [],
            malaysia_priority_hs: '847130',
            malaysia_artifact_gate: 'complete official 10-digit artifact required',
            russia_artifact_gate: 'complete official 10-digit XLSX/CSV artifact required; sanctions remain separate'
        }
    };
}

if (require.main === module) {
    const payload = buildAccuracyStatus();
    fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${payload.ok ? 'ok' : 'blocked'})`);
    if (!payload.ok) process.exitCode = 1;
}

module.exports = { buildAccuracyStatus };
