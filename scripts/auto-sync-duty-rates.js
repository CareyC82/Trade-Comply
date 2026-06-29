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
const { updateKoreaRules, updateKoreaRulesFromOfficialSource } = require('./update-kr-duty-rates');
const {
    DEFAULT_COUNTRIES: STATIC_BENCHMARK_COUNTRIES,
    updateIndiaRulesFromOfficialSource,
    updateStaticBenchmarkRules
} = require('./update-static-duty-rates');
const { runDutyRateHealthCheck } = require('./check-duty-rates');
const { dutyAutomationStage } = require('./build-automation-launch-status');

const ROOT = path.join(__dirname, '..');
const SYNC_STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const MATERIAL_RATE_CHANGE_THRESHOLD = 0.03;

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
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
        official_fetch: result.official_fetch || null,
        official_fetch_degraded: Boolean(result.official_fetch_degraded),
        official_fetch_degraded_reason: result.official_fetch_degraded_reason || '',
        official_fetch_degraded_detail: result.official_fetch_degraded_detail || '',
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

function getSourceRunName(source = {}) {
    const country = String(source.country || '').toUpperCase();
    if (country === 'US') return 'USITC';
    if (['EU', 'DE', 'NL'].includes(country)) return 'EU TARIC benchmark';
    if (country === 'SG') return 'Singapore Customs benchmark';
    if (country === 'MX') return 'Mexico SNICE benchmark';
    if (country === 'JP') return 'Japan Customs benchmark';
    if (country === 'KR') return 'Korea Customs official-live';
    if (country === 'IN') return 'India Customs official-live';
    if (['CN', 'VN', 'MY', 'TW', 'RU'].includes(country)) return 'Static official-link benchmarks';
    return source.name || country || 'Unknown source';
}

function buildSourceRunPlan({ sourcesPayload = {}, runs = [] } = {}) {
    const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const runsBySource = new Map(runs.map(run => [run.source, run]));
    const sources = Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : [];
    return sources
        .map((source) => {
            const runSource = getSourceRunName(source);
            const run = runsBySource.get(runSource);
            const stage = dutyAutomationStage(source);
            const runStatus = run
                ? run.official_fetch_degraded
                    ? 'degraded'
                    : run.ok ? 'ok' : 'exception'
                : 'not_run';
            const runPlanAction = runStatus === 'exception'
                ? 'Fix updater exception before relying on this source.'
                : runStatus === 'degraded'
                    ? 'Official source probe degraded; keep maintained exact candidates and promote parser when rows are machine-readable.'
                : stage.parser_gap
                    ? stage.next_upgrade
                    : 'Keep official machine-readable sync running.';
            return {
                country: source.country || '',
                maintenance_priority: source.maintenance_priority || 'Unassigned',
                source_status: source.source_status || '',
                machine_readable: source.machine_readable,
                rate_automation_stage: stage.rate_automation_stage,
                automation_claim: stage.automation_claim,
                public_claim: stage.public_claim,
                parser_gap: stage.parser_gap,
                update_command: source.update_command || '',
                probe_command: source.probe_command || '',
                run_source: runSource,
                run_status: runStatus,
                applied: run ? Boolean(run.applied) : false,
                mode: run?.mode || '',
                change_count: run?.change_count || 0,
                rate_change_count: run?.rate_change_count || 0,
                degraded_reason: run?.official_fetch_degraded_reason || '',
                degraded_detail: run?.official_fetch_degraded_detail || run?.official_fetch?.error || '',
                next_action: source.next_action || '',
                run_plan_action: runPlanAction
            };
        })
        .sort((a, b) => (
            (priorityRank[a.maintenance_priority] ?? 9) - (priorityRank[b.maintenance_priority] ?? 9)
            || String(a.country || '').localeCompare(String(b.country || ''))
        ));
}

function buildAutomationDigest({ runs = [], sourceRunPlan = [], health = null } = {}) {
    const parserGaps = sourceRunPlan.filter(row => row.parser_gap);
    const probeCandidates = sourceRunPlan.filter(row => row.rate_automation_stage === 'official_probe_candidate');
    const exactCodeGates = sourceRunPlan.filter(row => row.rate_automation_stage === 'official_hybrid_parser');
    const filingGrade = sourceRunPlan.filter(row => row.rate_automation_stage === 'official_machine_sync');
    const exceptions = sourceRunPlan.filter(row => row.run_status === 'exception');
    const degraded = sourceRunPlan.filter(row => row.run_status === 'degraded');
    const officialProbeDegradedSources = runs
        .filter(run => run.official_fetch_degraded)
        .map(run => run.source);
    const officialProbeDegradedReasons = runs
        .filter(run => run.official_fetch_degraded)
        .map(run => ({
            source: run.source,
            reason: run.official_fetch_degraded_reason || 'official_probe_degraded',
            detail: run.official_fetch_degraded_detail || run.official_fetch?.error || ''
        }));
    const rateChanges = runs.reduce((sum, run) => sum + Number(run.rate_change_count || 0), 0);
    const priorityQueue = parserGaps
        .map(row => ({
            country: row.country,
            workstream: row.rate_automation_stage === 'official_hybrid_parser'
                ? 'exact-code parser'
                : row.rate_automation_stage === 'official_probe_candidate'
                    ? 'official probe promotion'
                    : row.rate_automation_stage === 'maintained_exact_map'
                        ? 'machine-readable source connector'
                        : 'official-link parser discovery',
            rate_automation_stage: row.rate_automation_stage,
            run_status: row.run_status,
            update_command: row.update_command,
            next_action: row.run_plan_action || row.next_action || ''
        }))
        .slice(0, 8);

    const headline = exceptions.length
        ? `${exceptions.length} source exception(s) need parser/source attention; safe updates remain exception-only.`
        : rateChanges > 0
            ? `${rateChanges} rate change(s) were detected by daily duty-rate sync.`
            : `${filingGrade.length} filing-grade source(s) and ${parserGaps.length} parser gap(s) tracked by daily duty-rate sync.`;

    return {
        headline,
        filing_grade_countries: filingGrade.map(row => row.country),
        exact_code_gate_countries: exactCodeGates.map(row => row.country),
        official_probe_countries: probeCandidates.map(row => row.country),
        official_probe_degraded_sources: officialProbeDegradedSources,
        official_probe_degraded_reasons: officialProbeDegradedReasons,
        degraded_countries: degraded.map(row => row.country),
        parser_gap_countries: parserGaps.map(row => row.country),
        exception_countries: exceptions.map(row => row.country),
        rate_change_count: rateChanges,
        health_ok: health ? Boolean(health.ok) : null,
        priority_queue: priorityQueue,
        next_best_action: priorityQueue[0]?.next_action || 'Keep daily duty-rate sync running and monitor material rate changes.'
    };
}

function buildSyncStatusPayload({ runs = [], health = null, startedAt, finishedAt, sourceRunPlan = [] } = {}) {
    const autoApplied = runs.filter(run => run.applied);
    const exceptions = runs.flatMap(run => buildExceptionsForRun(run));
    const stageCounts = sourceRunPlan.reduce((acc, row) => {
        const key = row.rate_automation_stage || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const upgradeQueue = sourceRunPlan
        .filter(row => row.parser_gap || row.run_status === 'exception')
        .map(row => ({
            country: row.country,
            maintenance_priority: row.maintenance_priority,
            rate_automation_stage: row.rate_automation_stage,
            run_status: row.run_status,
            parser_gap: Boolean(row.parser_gap),
            next_upgrade: row.run_plan_action || row.next_action || ''
        }));
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
            exceptions: exceptions.length,
            filing_grade_auto_sources: sourceRunPlan.filter(row => row.rate_automation_stage === 'official_machine_sync').length,
            parser_gap_sources: sourceRunPlan.filter(row => row.parser_gap).length,
            degraded_sources: sourceRunPlan.filter(row => row.run_status === 'degraded').length
        },
        source_run_plan_summary: {
            stages: stageCounts,
            parser_gap_count: sourceRunPlan.filter(row => row.parser_gap).length,
            filing_grade_auto_count: sourceRunPlan.filter(row => row.rate_automation_stage === 'official_machine_sync').length,
            degraded_count: sourceRunPlan.filter(row => row.run_status === 'degraded').length,
            exception_count: sourceRunPlan.filter(row => row.run_status === 'exception').length
        },
        automation_digest: buildAutomationDigest({ runs, health, sourceRunPlan }),
        automation_upgrade_queue: upgradeQueue,
        auto_applied: autoApplied.map(run => ({
            source: run.source,
            mode: run.mode,
            change_count: run.change_count,
            rate_change_count: run.rate_change_count
        })),
        exceptions,
        runs,
        source_run_plan: sourceRunPlan,
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

async function runAutoDutyRateSync({
    dryRun = false,
    skipOfficialUs = false,
    koreaOfficialFetcher = null,
    indiaOfficialFetcher = null
} = {}) {
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

    let krResult;
    try {
        krResult = await updateKoreaRulesFromOfficialSource({
            dryRun,
            ...(koreaOfficialFetcher ? { fetcher: koreaOfficialFetcher } : {})
        });
    } catch (error) {
        krResult = updateKoreaRules({ dryRun });
        krResult.errors = [
            ...(krResult.errors || []),
            { country: 'KR', error: `Official-live fetch failed: ${error.message}` }
        ];
        krResult.ok = false;
    }
    runs.push(buildRunSummary('Korea Customs official-live', krResult, {
        applied: !dryRun,
        mode: 'official-live'
    }));

    let indiaResult;
    try {
        indiaResult = await updateIndiaRulesFromOfficialSource({
            dryRun,
            ...(indiaOfficialFetcher ? { fetcher: indiaOfficialFetcher } : {})
        });
    } catch (error) {
        indiaResult = updateStaticBenchmarkRules({ countries: ['IN'], dryRun });
        indiaResult.errors = [
            ...(indiaResult.errors || []),
            { country: 'IN', error: `Official-live fetch failed: ${error.message}` }
        ];
        indiaResult.ok = false;
    }
    runs.push(buildRunSummary('India Customs official-live', indiaResult, {
        applied: !dryRun,
        mode: 'official-live'
    }));

    const staticResult = updateStaticBenchmarkRules({
        countries: STATIC_BENCHMARK_COUNTRIES.filter(country => country !== 'IN'),
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
    const sourceRunPlan = buildSourceRunPlan({
        sourcesPayload: readJson(DUTY_RATE_SOURCES_PATH, { sources: [] }),
        runs
    });
    const payload = buildSyncStatusPayload({ runs, health, startedAt, finishedAt, sourceRunPlan });

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
    buildSourceRunPlan,
    buildAutomationDigest,
    buildSyncStatusPayload,
    runAutoDutyRateSync
};
