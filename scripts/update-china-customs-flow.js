#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    SOURCE_ID,
    atomicWriteJson,
    coverageDiagnostics,
    mergePayload,
    normalizeIndustryId,
    parseOfficialExport,
    sourceMetadata
} = require('../lib/china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');
const STATUS_PATH = path.join(ROOT, 'data', 'china-customs-sync-status.json');
const dryRun = process.argv.includes('--dry-run');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));

async function fetchOfficialExport(url, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { accept: 'application/json, text/csv;q=0.9, text/plain;q=0.8', 'user-agent': 'TraceWize-China-Customs-Flow/1.1' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} from configured China Customs adapter`);
        const body = await response.text();
        return parseOfficialExport(body, {
            official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || undefined,
            source_url: url
        });
    } finally {
        clearTimeout(timer);
    }
}

async function loadIncoming() {
    const inputPath = inputArg?.slice('--input='.length) || process.env.CHINA_CUSTOMS_FLOW_FILE;
    if (inputPath) return {
        payload: parseOfficialExport(fs.readFileSync(path.resolve(inputPath), 'utf8'), {
            official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || undefined
        }),
        mode: 'file',
        location: inputPath
    };
    if (process.env.CHINA_CUSTOMS_FLOW_URL) {
        return { payload: await fetchOfficialExport(process.env.CHINA_CUSTOMS_FLOW_URL), mode: 'url', location: process.env.CHINA_CUSTOMS_FLOW_URL };
    }
    return null;
}

function buildStatus(current, values = {}) {
    const source = sourceMetadata(current);
    const diagnostics = coverageDiagnostics(current, process.env.CHINA_CUSTOMS_LATEST_PERIOD || source.official_platform_latest_period || null);
    return {
        schema_version: 1,
        source_id: SOURCE_ID,
        attempted_at: new Date().toISOString(),
        ok: false,
        data_updated: false,
        connector_status: source.connector_status || 'source_action_required',
        source_mode: 'not_configured',
        official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || source.official_platform_latest_period || null,
        synchronized_through: source.synchronized_through || source.latest_period || null,
        supported_industries: source.supported_industries || [],
        covered_industries: source.covered_industries || [],
        coverage: diagnostics,
        reason: 'Configure CHINA_CUSTOMS_FLOW_URL or CHINA_CUSTOMS_FLOW_FILE with a normalized official export. Last-good data was preserved.',
        ...values
    };
}

async function main() {
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let status = buildStatus(current);
    try {
        const incoming = await loadIncoming();
        if (!incoming) {
            if (!dryRun) atomicWriteJson(STATUS_PATH, status);
            console.log(status.reason);
            return status;
        }
        if (process.env.CHINA_CUSTOMS_LATEST_PERIOD && !incoming.payload.official_platform_latest_period) {
            incoming.payload.official_platform_latest_period = process.env.CHINA_CUSTOMS_LATEST_PERIOD;
        }
        const next = mergePayload(current, incoming.payload);
        const source = sourceMetadata(next);
        const diagnostics = coverageDiagnostics(next, source.official_platform_latest_period);
        const receivedIndustries = [...new Set(incoming.payload.series.map((row) => (
            normalizeIndustryId(row.industry_id || row.industry || row.category)
        )))].sort();
        status = buildStatus(next, {
            ok: true,
            data_updated: true,
            connector_status: diagnostics.complete ? 'current' : 'partial_coverage',
            source_mode: incoming.mode,
            source_location: incoming.location,
            official_platform_latest_period: source.official_platform_latest_period,
            synchronized_through: source.synchronized_through,
            rows_received: incoming.payload.series.length,
            industries_received: receivedIndustries,
            supported_industries: source.supported_industries || [],
            covered_industries: source.covered_industries || [],
            coverage: diagnostics,
            last_success_at: new Date().toISOString(),
            reason: diagnostics.complete
                ? 'China Customs industry data is synchronized through the latest declared official platform month with all maintained industries and directions.'
                : `Official rows were imported and last-good history was preserved. Remaining gaps: ${diagnostics.missing_periods.length} month(s), ${diagnostics.missing_industries_at_target.length} industry category/categories, ${diagnostics.missing_directions_at_target.length} trade direction(s).`
        });
        if (!dryRun) {
            atomicWriteJson(DATA_PATH, next);
            atomicWriteJson(STATUS_PATH, status);
        }
        console.log(`China Customs flow sync: ${source.synchronized_through} (${status.connector_status}).`);
        return status;
    } catch (error) {
        status = buildStatus(current, {
            source_mode: process.env.CHINA_CUSTOMS_FLOW_URL ? 'url' : 'file',
            connector_status: 'failed_last_attempt',
            error: error.message,
            reason: 'Configured China Customs sync failed validation or transport. Last-good data was preserved.'
        });
        if (!dryRun) atomicWriteJson(STATUS_PATH, status);
        console.error(error.stack || error.message);
        process.exitCode = 1;
        return status;
    }
}

if (require.main === module) main();

module.exports = { buildStatus, fetchOfficialExport, loadIncoming, main };
