#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function summarizeOfficialFetch(summary = null) {
    if (!summary) return 'no official fetch summary';
    const attempted = Number(summary.exact_query_attempted || 0);
    const matched = Number(summary.exact_query_matched || 0);
    const rows = Number(summary.row_count || 0);
    const exact = attempted ? `${matched}/${attempted} exact HS matched` : `${rows} row(s) parsed`;
    const status = summary.status_label || (summary.degraded ? 'Official fetch degraded' : 'Official source checked');
    const detail = summary.degraded_reason
        ? `; ${summary.degraded_reason}${summary.degraded_detail ? ` (${summary.degraded_detail})` : ''}`
        : '';
    return `${status}; ${exact}${detail}`;
}

function buildDiagnosticLines(payload) {
    if (!payload) {
        return ['Duty-rate sync diagnostics: no data/duty-rate-sync-status.json file found yet.'];
    }

    const diagnostics = payload.ci_diagnostics || {};
    const counts = payload.counts || {};
    const digest = payload.automation_digest || {};
    const exceptions = Array.isArray(payload.exceptions) ? payload.exceptions : [];
    const sourceRunPlan = Array.isArray(payload.source_run_plan) ? payload.source_run_plan : [];
    const priorityQueue = Array.isArray(digest.priority_queue) ? digest.priority_queue : [];
    const lines = [];

    lines.push('Duty-rate sync diagnostics');
    lines.push(`- Outcome: ${diagnostics.outcome || payload.status || 'unknown'}`);
    lines.push(`- Summary: ${diagnostics.summary || digest.headline || 'No diagnostic summary available.'}`);
    if (diagnostics.failed_step_hint) {
        lines.push(`- Likely failing step: ${diagnostics.failed_step_hint}`);
    }
    lines.push(`- Next action: ${diagnostics.next_action || digest.next_best_action || 'Review duty-rate sync status JSON.'}`);
    lines.push(`- Sources checked: ${counts.sources_checked ?? 0}; exceptions: ${counts.exceptions ?? exceptions.length}; parser gaps: ${counts.parser_gap_sources ?? 0}; degraded: ${counts.degraded_sources ?? 0}`);

    const degradedDetails = Array.isArray(diagnostics.degraded_details) && diagnostics.degraded_details.length
        ? diagnostics.degraded_details
        : sourceRunPlan
            .filter(row => row.run_status === 'degraded' || row.degraded_label || row.degraded_category || row.degraded_action)
            .map(row => ({
                country: row.country,
                source: row.run_source || '',
                category: row.degraded_category || row.official_fetch_summary?.degraded_category || '',
                label: row.degraded_label || '',
                reason: row.degraded_reason || row.official_fetch_summary?.degraded_reason || '',
                action: row.degraded_action || row.official_fetch_summary?.degraded_action || row.run_plan_action || '',
                recovery_command: row.recovery_command || '',
                recovery_hint: row.recovery_hint || ''
            }));
    const parserGapDetails = Array.isArray(diagnostics.parser_gap_details) && diagnostics.parser_gap_details.length
        ? diagnostics.parser_gap_details
        : sourceRunPlan
            .filter(row => row.parser_gap)
            .map(row => ({
                country: row.country,
                stage: row.rate_automation_stage || '',
                priority: row.maintenance_priority || '',
                action: row.parser_gap_task?.task || row.run_plan_action || row.next_action || '',
                recovery_command: row.recovery_command || '',
                recovery_hint: row.recovery_hint || ''
            }));

    if (degradedDetails.length) {
        lines.push('- Degraded source repair hints:');
        degradedDetails.slice(0, 8).forEach((row, index) => {
            lines.push(`  ${index + 1}. ${row.country || 'market'}${row.source ? ` (${row.source})` : ''}: ${row.label || row.category || row.reason || 'official probe degraded'}`);
            if (row.action) {
                lines.push(`     fix: ${row.action}`);
            }
            if (row.recovery_command) {
                lines.push(`     rerun: ${row.recovery_command}`);
            }
            if (row.recovery_hint) {
                lines.push(`     hint: ${row.recovery_hint}`);
            }
        });
    }

    if (parserGapDetails.length) {
        lines.push('- Parser gap repair hints:');
        parserGapDetails.slice(0, 8).forEach((row, index) => {
            lines.push(`  ${index + 1}. ${row.country || 'market'}: ${row.priority || 'priority'} · ${row.stage || 'stage'}`);
            if (row.action) {
                lines.push(`     next: ${row.action}`);
            }
            if (row.recovery_command) {
                lines.push(`     rerun: ${row.recovery_command}`);
            }
            if (row.recovery_hint) {
                lines.push(`     hint: ${row.recovery_hint}`);
            }
        });
    }

    if (exceptions.length) {
        lines.push('- First exceptions:');
        exceptions.slice(0, 5).forEach((exception, index) => {
            lines.push(`  ${index + 1}. ${exception.source || 'source'}: ${exception.reason || exception.type || 'unknown issue'}`);
        });
    }

    if (sourceRunPlan.length) {
        const watchedRows = sourceRunPlan
            .filter(row => (
                row.run_status !== 'ok'
                || row.parser_gap
                || row.official_fetch_summary?.degraded
                || row.official_fetch_summary?.exact_query_matched === 0
            ))
            .slice(0, 12);
        lines.push('- Source run plan watchlist:');
        (watchedRows.length ? watchedRows : sourceRunPlan.slice(0, 6)).forEach((row, index) => {
            lines.push(`  ${index + 1}. ${row.country || 'market'}: ${row.run_status || 'unknown'} · ${row.run_source || 'no run source'} · ${row.rate_automation_stage || 'unknown stage'}`);
            lines.push(`     official: ${summarizeOfficialFetch(row.official_fetch_summary)}`);
            if (row.degraded_reason || row.degraded_detail) {
                lines.push(`     degraded: ${row.degraded_reason || 'degraded'}${row.degraded_detail ? ` (${row.degraded_detail})` : ''}`);
            }
            if (row.degraded_label || row.degraded_category) {
                lines.push(`     diagnosis: ${row.degraded_label || row.degraded_category}`);
            }
            if (row.degraded_action) {
                lines.push(`     fix: ${row.degraded_action}`);
            }
            if (row.recovery_command) {
                lines.push(`     rerun: ${row.recovery_command}`);
            }
            if (row.recovery_hint) {
                lines.push(`     hint: ${row.recovery_hint}`);
            }
            lines.push(`     next: ${row.run_plan_action || row.next_action || 'Review source roadmap.'}`);
        });
    }

    if (priorityQueue.length) {
        lines.push('- Automation priority queue:');
        priorityQueue.slice(0, 8).forEach((row, index) => {
            lines.push(`  ${index + 1}. ${row.country || 'market'}: ${row.workstream || 'workstream'} · ${row.next_action || row.rate_automation_stage || 'review'}`);
        });
    }

    return lines;
}

function main() {
    buildDiagnosticLines(readJson(STATUS_PATH)).forEach(line => console.log(line));
}

module.exports = {
    buildDiagnosticLines,
    summarizeOfficialFetch
};

if (require.main === module) {
    main();
}
