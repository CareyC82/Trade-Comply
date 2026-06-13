#!/usr/bin/env node
/**
 * Daily Post-Entry duty-rate sync.
 *
 * Safe updates are written automatically. Exceptions are recorded for admin
 * visibility, but they do not become a manual approval queue.
 */
const fs = require('fs');
const path = require('path');

const { updateUsRules } = require('./update-us-duty-rates');
const { updateEuRules } = require('./update-eu-duty-rates');
const { updateSingaporeRules } = require('./update-sg-duty-rates');
const { updateMexicoRules } = require('./update-mx-duty-rates');
const { updateJapanRules } = require('./update-jp-duty-rates');
const { updateKoreaRules } = require('./update-kr-duty-rates');
const { DEFAULT_COUNTRIES: STATIC_BENCHMARK_COUNTRIES, updateStaticBenchmarkRules } = require('./update-static-duty-rates');
const { runDutyRateHealthCheck } = require('./check-duty-rates');

const ROOT = path.join(__dirname, '..');
const SYNC_STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
const MATERIAL_RATE_CHANGE_THRESHOLD = 0.03;

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function isMaterialRateChange(change, threshold = MATERIAL_RATE_CHANGE_THRESHOLD) {
    const oldRate = Number(change?.old_base_rate);
    const newRate = Number(change?.new_base_rate);
    if (!Number.isFinite(oldRate) || !Number.isFinite(newRate)) {
        return false;
    }
    return Math.abs(newRate - oldRate) >= threshold;
}

function countRateChanges(changes = []) {
    return changes.filter(change => (
        Object.prototype.hasOwnProperty.call(change, 'old_base_rate')
        || (Array.isArray(change.changes) && change.changes.some(row => row.field === 'base_rate'))
    )).length;
}

function buildRunSummary(source, result = {}, { applied = true, mode = 'official' } = {}) {
    const changes = Array.isArray(result.changes) ? result.changes : [];
    const errors = Array.isArray(result.errors) ? result.errors : [];
    return {
        source,
        ok: result.ok !== false && errors.length === 0,
        applied,
        mode,
        change_count: changes.length,
        rate_change_count: countRateChanges(changes),
        error_count: errors.length,
        countries: Array.isArray(result.countries) ? result.countries : [],
        writes_official_machine_rates: Boolean(result.writes_official_machine_rates),
        readiness: result.readiness || null,
        changes,
        errors
    };
}

function buildExceptionsForRun(run, { threshold = MATERIAL_RATE_CHANGE_THRESHOLD } = {}) {
    const exceptions = [];
    if (!run.ok || run.error_count > 0) {
        exceptions.push({
            source: run.source,
            severity: 'high',
            type: 'source_or_parse_error',
            reason: `${run.source} duty-rate updater reported ${run.error_count || 1} error(s).`,
            details: run.errors || []
        });
    }

    (run.changes || [])
        .filter(change => isMaterialRateChange(change, threshold))
        .forEach(change => {
            exceptions.push({
                source: run.source,
                severity: 'medium',
                type: 'material_rate_change',
                reason: `${run.source} base duty changed by at least ${(threshold * 100).toFixed(1)} percentage points.`,
                details: change,
                auto_applied: Boolean(run.applied)
            });
        });

    return exceptions;
}

function findMultiPrefixRateConflicts(run) {
    const changes = Array.isArray(run?.changes) ? run.changes : [];
    const grouped = changes.reduce((map, change) => {
        if (!change?.rule || !Object.prototype.hasOwnProperty.call(change, 'new_base_rate')) {
            return map;
        }
        const row = map.get(change.rule) || [];
        row.push(change);
        map.set(change.rule, row);
        return map;
    }, new Map());
    return Array.from(grouped.entries())
        .map(([rule, rows]) => {
            const rates = Array.from(new Set(rows.map(row => Number(row.new_base_rate)).filter(Number.isFinite)));
            return rates.length > 1 ? { rule, rates, changes: rows } : null;
        })
        .filter(Boolean);
}

function appendMultiPrefixConflicts(run) {
    const conflicts = findMultiPrefixRateConflicts(run);
    if (!conflicts.length) {
        return { run, conflicts };
    }
    const errors = [
        ...(run.errors || []),
        ...conflicts.map(conflict => ({
            rule: conflict.rule,
            error: 'Multiple HS prefixes in one duty rule returned different official base rates. Split this rule before auto-applying official rates.',
            rates: conflict.rates,
            prefixes: conflict.changes.map(change => change.prefix)
        }))
    ];
    return {
        conflicts,
        run: {
            ...run,
            ok: false,
            error_count: errors.length,
            errors
        }
    };
}

function buildSyncStatusPayload({ runs = [], health = null, startedAt, finishedAt } = {}) {
    const autoApplied = runs.filter(run => run.applied);
    const exceptions = runs.flatMap(run => buildExceptionsForRun(run));
    if (health && health.ok === false) {
        exceptions.push({
            source: 'coverage-health',
            severity: 'medium',
            type: 'health_check_failed',
            reason: 'Post-Entry duty-rate regression health check found an issue.',
            details: health.failures || []
        });
    }

    return {
        schema_version: 1,
        updated_at: finishedAt || new Date().toISOString(),
        started_at: startedAt || null,
        finished_at: finishedAt || null,
        status: exceptions.length ? 'exceptions' : 'ok',
        policy: {
            safe_updates_auto_applied: true,
            manual_review_required: false,
            exception_only_admin_visibility: true,
            material_rate_change_threshold: MATERIAL_RATE_CHANGE_THRESHOLD
        },
        counts: {
            sources_checked: runs.length,
            sources_auto_applied: autoApplied.length,
            total_changes: runs.reduce((sum, run) => sum + Number(run.change_count || 0), 0),
            total_rate_changes: runs.reduce((sum, run) => sum + Number(run.rate_change_count || 0), 0),
            exceptions: exceptions.length
        },
        auto_applied: autoApplied.map(run => ({
            source: run.source,
            mode: run.mode,
            change_count: run.change_count,
            rate_change_count: run.rate_change_count
        })),
        exceptions,
        runs,
        health: health ? {
            ok: health.ok,
            sample_count: health.sample_count,
            failed_sample_count: health.failed_sample_count,
            priority_rate_matrix: health.priority_rate_matrix ? {
                ok: health.priority_rate_matrix.ok,
                route_count: health.priority_rate_matrix.route_count,
                covered_route_count: health.priority_rate_matrix.covered_route_count,
                trust_counts: health.priority_rate_matrix.trust_counts,
                automation_counts: health.priority_rate_matrix.automation_counts,
                parser_priority_count: health.priority_rate_matrix.parser_priority_count || 0,
                priority_upgrade_queue: (health.priority_rate_matrix.priority_upgrade_queue || []).slice(0, 20),
                failures: health.priority_rate_matrix.failures || []
            } : null,
            failures: health.failures || []
        } : null
    };
}

async function runAutoDutyRateSync({ dryRun = false, skipOfficialUs = false } = {}) {
    const startedAt = new Date().toISOString();
    const runs = [];

    if (!skipOfficialUs) {
        const usDryRun = await updateUsRules({ dryRun: true });
        const rawUsDrySummary = buildRunSummary('USITC', usDryRun, {
            applied: false,
            mode: 'official-dry-run'
        });
        const { run: usDrySummary } = appendMultiPrefixConflicts(rawUsDrySummary);
        if (usDrySummary.ok && !dryRun) {
            const usApplied = await updateUsRules({ dryRun: false });
            runs.push(buildRunSummary('USITC', usApplied, {
                applied: true,
                mode: 'official'
            }));
        } else {
            runs.push(usDrySummary);
        }
    }

    const euResult = updateEuRules({ dryRun });
    runs.push(buildRunSummary('EU TARIC benchmark', euResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    const sgResult = updateSingaporeRules({ dryRun });
    runs.push(buildRunSummary('Singapore Customs benchmark', sgResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    const mxResult = updateMexicoRules({ dryRun });
    runs.push(buildRunSummary('Mexico SNICE benchmark', mxResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    const jpResult = updateJapanRules({ dryRun });
    runs.push(buildRunSummary('Japan Customs benchmark', jpResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    const krResult = updateKoreaRules({ dryRun });
    runs.push(buildRunSummary('Korea Customs benchmark', krResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    const staticResult = updateStaticBenchmarkRules({
        countries: STATIC_BENCHMARK_COUNTRIES,
        dryRun
    });
    runs.push(buildRunSummary('Static official-link benchmarks', staticResult, {
        applied: !dryRun,
        mode: 'benchmark'
    }));

    let health = null;
    try {
        health = runDutyRateHealthCheck();
    } catch (error) {
        health = {
            ok: false,
            sample_count: 0,
            failed_sample_count: 1,
            failures: [{ id: 'health-check', failures: [error.message] }]
        };
    }

    const finishedAt = new Date().toISOString();
    const payload = buildSyncStatusPayload({ runs, health, startedAt, finishedAt });

    if (!dryRun) {
        writeJson(SYNC_STATUS_PATH, payload);
    }

    return payload;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const skipOfficialUs = process.argv.includes('--skip-official-us');
    const result = await runAutoDutyRateSync({ dryRun, skipOfficialUs });
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    MATERIAL_RATE_CHANGE_THRESHOLD,
    isMaterialRateChange,
    buildRunSummary,
    buildExceptionsForRun,
    findMultiPrefixRateConflicts,
    appendMultiPrefixConflicts,
    buildSyncStatusPayload,
    runAutoDutyRateSync
};
