#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    SOURCE_ID,
    atomicWriteJson,
    mergePayload,
    normalizeIndustryId,
    sourceMetadata
} = require('../lib/china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');
const STATUS_PATH = path.join(ROOT, 'data', 'china-customs-sync-status.json');
const dryRun = process.argv.includes('--dry-run');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));

async function fetchJson(url, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { accept: 'application/json', 'user-agent': 'TraceWize-China-Customs-Flow/1.0' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} from configured China Customs adapter`);
        return response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function loadIncoming() {
    const inputPath = inputArg?.slice('--input='.length) || process.env.CHINA_CUSTOMS_FLOW_FILE;
    if (inputPath) return { payload: JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8')), mode: 'file', location: inputPath };
    if (process.env.CHINA_CUSTOMS_FLOW_URL) {
        return { payload: await fetchJson(process.env.CHINA_CUSTOMS_FLOW_URL), mode: 'url', location: process.env.CHINA_CUSTOMS_FLOW_URL };
    }
    return null;
}

function buildStatus(current, values = {}) {
    const source = sourceMetadata(current);
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
        const receivedIndustries = [...new Set(incoming.payload.series.map((row) => (
            normalizeIndustryId(row.industry_id || row.industry || row.category)
        )))].sort();
        status = buildStatus(next, {
            ok: true,
            data_updated: true,
            connector_status: source.connector_status,
            source_mode: incoming.mode,
            source_location: incoming.location,
            official_platform_latest_period: source.official_platform_latest_period,
            synchronized_through: source.synchronized_through,
            rows_received: incoming.payload.series.length,
            industries_received: receivedIndustries,
            supported_industries: source.supported_industries || [],
            covered_industries: source.covered_industries || [],
            last_success_at: new Date().toISOString(),
            reason: source.connector_status === 'current'
                ? 'China Customs industry data is synchronized through the latest declared official platform month.'
                : 'Official rows were updated, but the normalized feed still trails the declared platform month.'
        });
        if (!dryRun) {
            atomicWriteJson(DATA_PATH, next);
            atomicWriteJson(STATUS_PATH, status);
        }
        console.log(`China Customs flow sync: ${source.synchronized_through} (${source.connector_status}).`);
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

module.exports = { buildStatus, fetchJson, main };
