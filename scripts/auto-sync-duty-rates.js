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
const { updateJapanRules, updateJapanRulesFromOfficialSource } = require('./update-jp-duty-rates');
const { updateKoreaRules, updateKoreaRulesFromOfficialSource } = require('./update-kr-duty-rates');
const {
    DEFAULT_COUNTRIES: STATIC_BENCHMARK_COUNTRIES,
    updateIndiaRulesFromOfficialSource,
    probeStaticBenchmarkReadinessLive,
    updateStaticBenchmarkRules
} = require('./update-static-duty-rates');
const { runDutyRateHealthCheck } = require('./check-duty-rates');
const { dutyAutomationStage } = require('./build-automation-launch-status');

const ROOT = path.join(__dirname, '..');
const SYNC_STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const MATERIAL_RATE_CHANGE_THRESHOLD = 0.03;
const STATIC_OFFICIAL_LIVE_PROBE_COUNTRIES = ['VN', 'MY'];

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
    const degradedDetail = result.official_fetch_degraded_detail || result.official_fetch?.error || '';
    const degradedDiagnosis = classifyOfficialFetchDegradation(degradedDetail);
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
        official_fetch_degraded_detail: degradedDetail,
        official_fetch_degraded_category: result.official_fetch_degraded_category || degradedDiagnosis.category || '',
        official_fetch_degraded_action: result.official_fetch_degraded_action || degradedDiagnosis.action || '',
        readiness: result.readiness || null,
        static_official_probes: result.static_official_probes || null,
        changes,
        errors
    };
}

function buildOfficialFetchSummary(run = {}) {
    const officialFetch = run?.official_fetch || null;
    if (!officialFetch && !run?.official_fetch_degraded) {
        return null;
    }
    const queryAttempts = Array.isArray(officialFetch?.query_attempts)
        ? officialFetch.query_attempts
        : [];
    const exactQuerySummary = officialFetch?.exact_query_summary || null;
    const matchedQueries = Number(exactQuerySummary?.matched ?? queryAttempts.filter(row => Number(row?.row_count || 0) > 0).length);
    const attemptedQueries = Number(exactQuerySummary?.attempted ?? queryAttempts.length);
    return {
        ok: officialFetch?.ok ?? !run?.official_fetch_degraded,
        degraded: Boolean(run?.official_fetch_degraded),
        degraded_reason: run?.official_fetch_degraded_reason || '',
        degraded_detail: run?.official_fetch_degraded_detail || officialFetch?.error || '',
        degraded_category: run?.official_fetch_degraded_category || '',
        degraded_action: run?.official_fetch_degraded_action || '',
        row_count: Number(officialFetch?.row_count || 0),
        latest_schedule_date: officialFetch?.latest_schedule_date || '',
        official_url: officialFetch?.official_url || '',
        lookup_url: officialFetch?.lookup_url || officialFetch?.latest_schedule_url || '',
        exact_query_attempted: Number.isFinite(attemptedQueries) ? attemptedQueries : 0,
        exact_query_matched: Number.isFinite(matchedQueries) ? matchedQueries : 0,
        parser_ready: Boolean(officialFetch?.machine_parser_ready || officialFetch?.writes_official_machine_rates || run?.writes_official_machine_rates),
        status_label: run?.official_fetch_degraded
            ? 'Official fetch degraded'
            : matchedQueries > 0
                ? 'Official exact query matched'
                : Number(officialFetch?.row_count || 0) > 0
                    ? 'Official source parsed'
                    : officialFetch
                        ? 'Official source checked'
                        : 'Official source not checked'
    };
}

function isOfficialTransportError(error = {}) {
    const text = String(error.error || error.message || error || '').toLowerCase();
    return [
        'fetch failed',
        'getaddrinfo',
        'enotfound',
        'econnreset',
        'econnrefused',
        'etimedout',
        'socket hang up',
        'tls',
        'ssl certificate',
        'http 403',
        'http 429',
        'http 500',
        'http 502',
        'http 503',
        'http 504'
    ].some(fragment => text.includes(fragment));
}

function classifyOfficialFetchDegradation(detail = '') {
    const text = String(detail || '').toLowerCase();
    if (!text) {
        return {
            category: '',
            label: '',
            action: ''
        };
    }
    if (text.includes('ssl certificate') || text.includes('unable to get local issuer certificate') || text.includes('certificate problem')) {
        return {
            category: 'certificate',
            label: 'Certificate / CA validation',
            action: 'Use system CA in CI, verify the source certificate chain, then rerun the official probe.'
        };
    }
    if (text.includes('http 403') || text.includes('http 429')) {
        return {
            category: 'access_limited',
            label: 'Official site access limited',
            action: 'Add a polite official-source probe strategy, rate limiting, or fallback official download before parser promotion.'
        };
    }
    if (text.includes('http 500') || text.includes('http 502') || text.includes('http 503') || text.includes('http 504')) {
        return {
            category: 'official_site_unstable',
            label: 'Official site unstable',
            action: 'Keep maintained exact candidates and retry the official probe on the next sync window.'
        };
    }
    if (text.includes('getaddrinfo') || text.includes('enotfound')) {
        return {
            category: 'dns',
            label: 'DNS / host resolution',
            action: 'Check whether the official endpoint changed or the CI runner cannot resolve the host.'
        };
    }
    if (text.includes('tls') || text.includes('econnreset') || text.includes('socket hang up') || text.includes('fetch failed')) {
        return {
            category: 'network_transport',
            label: 'Network transport',
            action: 'Retry with system CA and source-specific headers; keep parser promotion gated until rows are stable.'
        };
    }
    return {
        category: 'official_fetch_failed',
        label: 'Official fetch failed',
        action: 'Inspect the source response and keep maintained exact candidates until the official parser is stable.'
    };
}

function downgradeOfficialTransportFailure(run, {
    reason = 'official_fetch_failed'
} = {}) {
    const errors = Array.isArray(run?.errors) ? run.errors : [];
    if (!errors.length || !errors.every(isOfficialTransportError)) {
        return run;
    }
    const detail = errors
        .slice(0, 5)
        .map(error => [error.rule, error.prefix, error.error || error.message].filter(Boolean).join(': '))
        .join(' | ');
    const diagnosis = classifyOfficialFetchDegradation(detail);
    return {
        ...run,
        ok: true,
        applied: false,
        error_count: 0,
        errors: [],
        writes_official_machine_rates: false,
        official_fetch_degraded: true,
        official_fetch_degraded_reason: reason,
        official_fetch_degraded_detail: detail,
        official_fetch_degraded_category: diagnosis.category,
        official_fetch_degraded_action: diagnosis.action
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
    if (country === 'JP') return 'Japan Customs official-live';
    if (country === 'KR') return 'Korea Customs official-live';
    if (country === 'IN') return 'India Customs official-live';
    if (['CN', 'VN', 'MY', 'TW', 'RU'].includes(country)) return 'Static official-link benchmarks';
    return source.name || country || 'Unknown source';
}

function buildParserGapTask(row = {}, source = {}) {
    if (!row.parser_gap) return null;
    const urls = Array.isArray(source.official_probe_urls) ? source.official_probe_urls : [];
    const useCases = Array.isArray(source.source_use_cases) ? source.source_use_cases : [];
    const parserSubtasks = Array.isArray(source.parser_subtasks) ? source.parser_subtasks : [];
    const rateChangeDrivers = Array.isArray(source.rate_change_drivers) ? source.rate_change_drivers : [];
    const taskByStage = {
        official_hybrid_parser: 'Promote exact HS parser only after official tariff rows and rate fields are stable.',
        official_probe_candidate: 'Run live official probe, verify parsed rows, then connect exact HS parser when rows are reliable.',
        maintained_exact_map: 'Find machine-readable official tariff rows and promote parser only where exact HS rates are unambiguous.',
        official_link_monitor: 'Keep official link monitoring live and add parser only when machine-readable tariff rows become available.',
        not_automated: 'Add an official source, probe URL, and parser path before claiming automated coverage.'
    };
    return {
        country: row.country || source.country || '',
        priority: row.maintenance_priority || source.maintenance_priority || 'Unassigned',
        stage: row.rate_automation_stage || '',
        task: taskByStage[row.rate_automation_stage] || row.run_plan_action || row.next_action || 'Review parser/source gap.',
        probe_command: row.probe_command || source.probe_command || '',
        official_probe_urls: urls,
        official_probe_live_status: row.official_probe_live_status || null,
        source_use_cases: useCases,
        parser_subtasks: parserSubtasks,
        rate_change_drivers: rateChangeDrivers,
        transit_route_priority: Boolean(source.transit_route_priority),
        next_action: row.run_plan_action || row.next_action || source.next_action || ''
    };
}

function buildSourceRunPlan({ sourcesPayload = {}, runs = [] } = {}) {
    const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const runsBySource = new Map(runs.map(run => [run.source, run]));
    const sources = Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : [];
    return sources
        .map((source) => {
            const runSource = getSourceRunName(source);
            const run = runsBySource.get(runSource);
            const liveProbe = run?.static_official_probes?.[String(source.country || '').toUpperCase()] || null;
            const stage = dutyAutomationStage(source);
            const runStatus = run
                ? run.official_fetch_degraded
                    ? 'degraded'
                    : run.ok ? 'ok' : 'exception'
                : 'not_run';
            const degradationDiagnosis = classifyOfficialFetchDegradation(
                run?.official_fetch_degraded_detail || run?.official_fetch?.error || ''
            );
            const runPlanAction = runStatus === 'exception'
                ? 'Fix updater exception before relying on this source.'
                : runStatus === 'degraded'
                    ? (run?.official_fetch_degraded_action || degradationDiagnosis.action || 'Official source probe degraded; keep maintained exact candidates and promote parser when rows are machine-readable.')
                : stage.parser_gap
                    ? stage.next_upgrade
                    : 'Keep official machine-readable sync running.';
            const officialProbeUrls = Array.isArray(source.official_probe_urls) ? source.official_probe_urls : [];
            const sourceUseCases = Array.isArray(source.source_use_cases) ? source.source_use_cases : [];
            const parserSubtasks = Array.isArray(source.parser_subtasks) ? source.parser_subtasks : [];
            const rateChangeDrivers = Array.isArray(source.rate_change_drivers) ? source.rate_change_drivers : [];
            const row = {
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
                degraded_category: run?.official_fetch_degraded_category || degradationDiagnosis.category || '',
                degraded_label: degradationDiagnosis.label || '',
                degraded_action: run?.official_fetch_degraded_action || degradationDiagnosis.action || '',
                official_fetch_summary: buildOfficialFetchSummary(run),
                official_probe_live_status: liveProbe ? {
                    checked: Boolean(liveProbe.checked ?? liveProbe.official_probe?.checked),
                    ok: liveProbe.ok ?? liveProbe.official_probe?.ok ?? null,
                    official_url: liveProbe.official_url || liveProbe.official_probe?.official_url || '',
                    parsed_rate_rows: Number(liveProbe.parsed_rate_rows ?? liveProbe.official_probe?.parsed_rate_rows ?? liveProbe.live_row_count ?? 0),
                    safe_rate_rows: Number(liveProbe.safe_rate_rows ?? liveProbe.official_probe?.safe_rate_rows ?? 0),
                    weak_rate_rows: Number(liveProbe.weak_rate_rows ?? liveProbe.official_probe?.weak_rate_rows ?? 0),
                    exact_rate_safe: Boolean(liveProbe.exact_rate_safe ?? liveProbe.official_probe?.exact_rate_safe),
                    machine_parser_ready: Boolean(liveProbe.machine_parser_ready ?? liveProbe.official_probe?.machine_parser_ready),
                    parser_note: liveProbe.parser_note || liveProbe.official_probe?.parser_note || '',
                    error: liveProbe.error || liveProbe.official_probe?.error || ''
                } : null,
                next_action: source.next_action || '',
                run_plan_action: runPlanAction,
                official_probe_urls: officialProbeUrls,
                source_use_cases: sourceUseCases,
                parser_subtasks: parserSubtasks,
                rate_change_drivers: rateChangeDrivers,
                transit_route_priority: Boolean(source.transit_route_priority)
            };
            return {
                ...row,
                parser_gap_task: buildParserGapTask(row, source)
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
        .map((run) => {
            const detail = run.official_fetch_degraded_detail || run.official_fetch?.error || '';
            const diagnosis = classifyOfficialFetchDegradation(detail);
            return {
                source: run.source,
                reason: run.official_fetch_degraded_reason || 'official_probe_degraded',
                detail,
                category: run.official_fetch_degraded_category || diagnosis.category,
                action: run.official_fetch_degraded_action || diagnosis.action
            };
        });
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
            probe_command: row.probe_command,
            official_probe_urls: row.official_probe_urls || [],
            official_probe_live_status: row.official_probe_live_status || null,
            source_use_cases: row.source_use_cases || [],
            parser_subtasks: row.parser_subtasks || [],
            rate_change_drivers: row.rate_change_drivers || [],
            transit_route_priority: Boolean(row.transit_route_priority),
            degraded_category: row.degraded_category || '',
            degraded_label: row.degraded_label || '',
            degraded_action: row.degraded_action || '',
            parser_gap_task: row.parser_gap_task || null,
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

function buildCiDiagnostics({ exceptions = [], runs = [], sourceRunPlan = [], health = null } = {}) {
    const degraded = sourceRunPlan.filter(row => row.run_status === 'degraded');
    const parserGaps = sourceRunPlan.filter(row => row.parser_gap);
    const failedHealth = health && health.ok === false;
    const firstException = exceptions[0] || null;
    const firstDegraded = degraded[0] || null;
    const changedRuns = runs.filter(run => Number(run.change_count || 0) > 0);

    if (firstException) {
        return {
            outcome: 'action_required',
            summary: `Duty-rate sync needs attention: ${exceptions.length} exception(s). First issue: ${firstException.source || 'source'} - ${firstException.reason || firstException.type || 'unknown issue'}.`,
            failed_step_hint: firstException.type === 'health_check_failed'
                ? 'Verify duty-rate sync output / Post-Entry coverage health check.'
                : 'Run duty-rate auto sync source parser.',
            next_action: firstException.type === 'health_check_failed'
                ? 'Open the health failure details, update the maintained route/sample expectation, then rerun npm test.'
                : 'Open the source error details, fix the updater/parser or downgrade transport-only failures, then rerun the Duty Rate Auto Sync workflow.',
            exception_sources: Array.from(new Set(exceptions.map(row => row.source).filter(Boolean))),
            degraded_sources: degraded.map(row => row.country).filter(Boolean),
            parser_gap_countries: parserGaps.map(row => row.country).filter(Boolean)
        };
    }

    if (failedHealth) {
        return {
            outcome: 'action_required',
            summary: 'Duty-rate sync ran, but the Post-Entry health check failed.',
            failed_step_hint: 'Verify maintained route coverage / Verify duty-rate sync output.',
            next_action: 'Review health.failures in data/duty-rate-sync-status.json and update the relevant rate rule or sample expectation.',
            exception_sources: [],
            degraded_sources: degraded.map(row => row.country).filter(Boolean),
            parser_gap_countries: parserGaps.map(row => row.country).filter(Boolean)
        };
    }

    if (degraded.length) {
        return {
            outcome: 'completed_with_degraded_sources',
            summary: `Duty-rate sync completed; ${degraded.length} official probe(s) were degraded and kept on maintained/candidate coverage.`,
            failed_step_hint: '',
            next_action: firstDegraded?.run_plan_action || 'Keep daily sync running and promote exact parsers only after official rows are stable.',
            exception_sources: [],
            degraded_sources: degraded.map(row => row.country).filter(Boolean),
            parser_gap_countries: parserGaps.map(row => row.country).filter(Boolean)
        };
    }

    return {
        outcome: 'ok',
        summary: changedRuns.length
            ? `Duty-rate sync completed with ${changedRuns.reduce((sum, run) => sum + Number(run.change_count || 0), 0)} change(s) and no exceptions.`
            : 'Duty-rate sync completed with no exceptions.',
        failed_step_hint: '',
        next_action: parserGaps.length
            ? `Next parser backlog: ${parserGaps.slice(0, 3).map(row => row.country).join(', ')}.`
            : 'Keep daily duty-rate sync running.',
        exception_sources: [],
        degraded_sources: [],
        parser_gap_countries: parserGaps.map(row => row.country).filter(Boolean)
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
            official_probe_urls: row.official_probe_urls || [],
            source_use_cases: row.source_use_cases || [],
            transit_route_priority: Boolean(row.transit_route_priority),
            degraded_category: row.degraded_category || '',
            degraded_label: row.degraded_label || '',
            degraded_action: row.degraded_action || '',
            parser_gap_task: row.parser_gap_task || null,
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
        ci_diagnostics: buildCiDiagnostics({ exceptions, runs, sourceRunPlan, health }),
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
    japanOfficialFetcher = null,
    koreaOfficialFetcher = null,
    indiaOfficialFetcher = null,
    staticOfficialFetcher = null,
    skipStaticOfficialProbe = false
} = {}) {
    const startedAt = new Date().toISOString();
    const runs = [];

    if (!skipOfficialUs) {
        const usDryRun = await updateUsRules({ dryRun: true });
        const rawUsDrySummary = buildRunSummary('USITC', usDryRun, {
            applied: false,
            mode: 'official-dry-run'
        });
        const { run: usDrySummary } = appendMultiPrefixConflicts(
            downgradeOfficialTransportFailure(rawUsDrySummary)
        );
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

    let jpResult;
    try {
        jpResult = await updateJapanRulesFromOfficialSource({
            dryRun,
            ...(japanOfficialFetcher ? { fetcher: japanOfficialFetcher } : {})
        });
    } catch (error) {
        jpResult = updateJapanRules({ dryRun });
        jpResult.errors = [
            ...(jpResult.errors || []),
            { country: 'JP', error: `Official-live fetch failed: ${error.message}` }
        ];
        jpResult.ok = false;
    }
    runs.push(buildRunSummary('Japan Customs official-live', jpResult, {
        applied: !dryRun,
        mode: jpResult.writes_official_machine_rates ? 'official-live' : 'benchmark'
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

    const staticCountries = STATIC_BENCHMARK_COUNTRIES.filter(country => country !== 'IN');
    const staticResult = updateStaticBenchmarkRules({
        countries: staticCountries,
        dryRun
    });
    const staticProbeCountries = staticCountries.filter(country => STATIC_OFFICIAL_LIVE_PROBE_COUNTRIES.includes(country));
    const staticOfficialProbes = {};
    if (!skipStaticOfficialProbe) {
        await Promise.all(staticProbeCountries.map(async (country) => {
            const readiness = await probeStaticBenchmarkReadinessLive(country, {
                ...(staticOfficialFetcher ? { fetcher: staticOfficialFetcher } : {})
            }).catch(error => ({
                country,
                ok: false,
                official_url: '',
                parsed_rate_rows: 0,
                safe_rate_rows: 0,
                weak_rate_rows: 0,
                exact_rate_safe: false,
                machine_parser_ready: false,
                parser_note: `${country} live official probe failed.`,
                error: error.message,
                official_probe: {
                    checked: true,
                    ok: false,
                    parsed_rate_rows: 0,
                    safe_rate_rows: 0,
                    weak_rate_rows: 0,
                    exact_rate_safe: false,
                    machine_parser_ready: false,
                    parser_note: `${country} live official probe failed.`,
                    error: error.message
                }
            }));
            const probe = readiness.official_probe || readiness;
            staticOfficialProbes[country] = {
                checked: true,
                ok: probe.ok ?? null,
                official_url: probe.official_url || readiness.official_url || '',
                parsed_rate_rows: Number(probe.parsed_rate_rows || readiness.live_row_count || 0),
                safe_rate_rows: Number(probe.safe_rate_rows || 0),
                weak_rate_rows: Number(probe.weak_rate_rows || 0),
                exact_rate_safe: Boolean(probe.exact_rate_safe),
                machine_parser_ready: Boolean(probe.machine_parser_ready),
                parser_note: probe.parser_note || readiness.next_action || '',
                error: probe.error || readiness.error || ''
            };
        }));
    }
    staticResult.static_official_probes = staticOfficialProbes;
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
    downgradeOfficialTransportFailure,
    classifyOfficialFetchDegradation,
    buildExceptionsForRun,
    findMultiPrefixRateConflicts,
    appendMultiPrefixConflicts,
    buildSourceRunPlan,
    buildAutomationDigest,
    buildCiDiagnostics,
    buildSyncStatusPayload,
    runAutoDutyRateSync
};
