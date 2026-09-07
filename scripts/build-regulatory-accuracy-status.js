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
function freshness(timestamp, now, maxAgeDays) {
    const parsed = Date.parse(timestamp || '');
    const ageDays = Number.isFinite(parsed) ? Math.max(0, (now.getTime() - parsed) / 86400000) : null;
    return {
        timestamp: timestamp || null,
        age_days: ageDays === null ? null : Number(ageDays.toFixed(2)),
        current: ageDays !== null && ageDays <= maxAgeDays,
        max_age_days: maxAgeDays
    };
}

function buildAccuracyStatus(now = new Date()) {
    const coverage = buildReport();
    const lifecycle = buildLifecycleAudit(models.sources);
    const health = read('data/consumer-regulatory-source-health.json', { sources: [] });
    const changes = read('data/consumer-regulatory-changes.json', { changes: [] });
    const launch = read('data/automation-launch-status.json', { summary: {}, duty_rates: [] });
    const globalHealth = read('data/global-crawl-source-health.json', {});
    const p2Imports = read('data/p2-duty-rate-import-status.json', { markets: {} });
    const malaysiaImport = read('data/my-duty-rate-import-status.json', {});
    const reviewCounts = (changes.changes || []).reduce((result, row) => {
        const status = row.review_status || 'pending_review';
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {});
    const parserGaps = launch.summary?.duty_rate_launch_levels?.parser_gap || [];
    const importPriority = ['IN', 'KR', 'MY', 'VN', 'TW', 'RU'];
    const artifactReadiness = Object.fromEntries(importPriority.filter((market) => parserGaps.includes(market)).map((market, index) => {
        const status = market === 'MY' ? malaysiaImport : p2Imports.markets?.[market] || {};
        const ready = status.ok === true && status.trust_gate === 'passed';
        return [market, {
            trust_gate: status.trust_gate || 'not_run',
            last_good_at: status.last_good_at || null,
            checked_at: status.checked_at || null,
            exact_row_count: Number(status.artifact?.parsed_row_count || 0),
            ready,
            priority: index + 1,
            workbench_market: market,
            next_action: ready
                ? 'Keep the official artifact current and monitor its effective date.'
                : `Provide a complete official ${market} tariff artifact and manifest; preview it before publication.`
        }];
    }));
    const baselineCells = coverage.cells.filter((cell) => cell.evidence_depth !== 'product_and_attribute_specific');
    const degradedSources = (globalHealth.sources || []).filter((row) => !row.ok && !row.monitor_only).map((row) => ({
        id: row.id,
        country: row.country,
        optional: Boolean(row.optional),
        error: row.error || 'Official source fetch failed',
        last_checked_at: globalHealth.generated_at || null,
        next_action: row.id === 'zh-gac'
            ? 'Retry the Chinese notice list; use the official English GACC newsroom fallback when the Chinese WAF remains unavailable.'
            : row.id === 'us-ustr'
                ? 'Retry the Section 301 page and its official investigations-index fallback; verify the content fingerprint before accepting it.'
                : row.id === 'us-fcc'
                    ? 'Retry FCC headlines and the official OET KDB fallback; keep the source optional when FCC blocks automated access.'
                    : 'Retry the official source and inspect its identity fingerprint before changing any rule.'
    }));
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
            degraded_sources: degradedSources,
            pending_effective_date_sources: (health.sources || []).filter((row) => row.alerts?.includes('effective_date_pending')).map((row) => row.id),
            global_transport_health: {
                freshness: freshness(globalHealth.generated_at, now, 2),
                source_count: Number(globalHealth.source_count || 0),
                ok_count: Number(globalHealth.ok_count || 0),
                error_count: Number(globalHealth.errors || 0),
                regulatory_market_grades: launch.summary?.regulatory_health || {}
            },
            automation_launch_freshness: freshness(launch.updated_at, now, 2)
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
            official_artifact_import_priority: importPriority,
            filing_grade_markets: launch.summary?.filing_grade_auto_countries || [],
            artifact_readiness: artifactReadiness,
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
    if (!payload.ok && !process.argv.includes('--allow-blocked')) process.exitCode = 1;
}

module.exports = { buildAccuracyStatus, freshness };
