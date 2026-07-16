#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { INDUSTRIES } = require('../lib/trade-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'trade-flow.json');
const CENSUS_SOURCE_ID = 'us-census-international-trade';
const COMTRADE_SOURCE_ID = 'un-comtrade-monthly';
const COMTRADE_ENDPOINT = 'https://comtradeapi.un.org/public/v1/preview/C/M/HS';
const COMTRADE_REPORTERS = {
    EU: 97,
    CN: 156,
    DE: 276,
    IN: 356,
    JP: 392,
    KR: 410,
    MY: 458,
    MX: 484,
    TW: 490,
    NL: 528,
    RU: 643,
    SG: 702,
    VN: 704,
    US: 842
};

const REPORTER_MARKETS = Object.fromEntries(
    Object.entries(COMTRADE_REPORTERS).map(([market, code]) => [String(code), market])
);

const HS_INDUSTRIES = INDUSTRIES.reduce((result, industry) => {
    industry.hs.forEach((hsCode) => {
        if (!result[hsCode]) result[hsCode] = [];
        result[hsCode].push(industry.id);
    });
    return result;
}, {});

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function parseCensusRows(rows, { flow, industryId, hsCode, sourceId = CENSUS_SOURCE_ID } = {}) {
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = rows[0];
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    const valueField = flow === 'export' ? 'ALL_VAL_MO' : 'GEN_VAL_MO';
    return rows.slice(1).map((row) => {
        const month = row[index.time] || '';
        const value = Number(row[index[valueField]] || 0);
        if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(value)) return null;
        return {
            market: 'US',
            partner: 'WORLD',
            industry_id: industryId,
            hs_code: hsCode,
            month,
            imports_value_usd: flow === 'import' ? value : 0,
            exports_value_usd: flow === 'export' ? value : 0,
            source_id: sourceId,
            source_url: flow === 'export'
                ? 'https://api.census.gov/data/timeseries/intltrade/exports/hs.html'
                : 'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
            fetched_at: new Date().toISOString(),
            status: 'official'
        };
    }).filter(Boolean);
}

function monthRange(reference = new Date(), count = 13) {
    const dates = [];
    const cursor = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 2, 1));
    for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
        dates.push(date.toISOString().slice(0, 7));
    }
    return { from: dates[0], to: dates.at(-1) };
}

function monthList(reference = new Date(), count = 30) {
    const range = [];
    const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 2, 1));
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset, 1));
        range.push(date.toISOString().slice(0, 7).replace('-', ''));
    }
    return range;
}

function buildCensusUrl({ flow, hsCode, apiKey, range }) {
    const dataset = flow === 'export' ? 'exports/hs' : 'imports/hs';
    const commodity = flow === 'export' ? 'E_COMMODITY' : 'I_COMMODITY';
    const value = flow === 'export' ? 'ALL_VAL_MO' : 'GEN_VAL_MO';
    const params = new URLSearchParams({
        get: `${value},${commodity}`,
        time: `from ${range.from} to ${range.to}`,
        [commodity]: hsCode,
        CTY_CODE: '-',
        key: apiKey
    });
    return `https://api.census.gov/data/timeseries/intltrade/${dataset}?${params.toString()}`;
}

function buildComtradeUrl({ period, reporters = COMTRADE_REPORTERS, hsCodes = Object.keys(HS_INDUSTRIES) } = {}) {
    const params = new URLSearchParams({
        period,
        reporterCode: Object.values(reporters).join(','),
        cmdCode: hsCodes.join(','),
        flowCode: 'M,X',
        partnerCode: '0',
        partner2Code: '0',
        customsCode: 'C00',
        motCode: '0',
        maxRecords: '500'
    });
    return `${COMTRADE_ENDPOINT}?${params.toString()}`;
}

function parseComtradeRows(response, { sourceId = COMTRADE_SOURCE_ID } = {}) {
    const rows = Array.isArray(response?.data) ? response.data : [];
    const fetchedAt = new Date().toISOString();
    return rows.flatMap((row) => {
        const market = REPORTER_MARKETS[String(row.reporterCode)];
        const hsCode = String(row.cmdCode || '');
        const industries = HS_INDUSTRIES[hsCode] || [];
        const period = String(row.period || '');
        const value = Number(row.primaryValue);
        if (!market || !/^\d{6}$/.test(period) || !Number.isFinite(value) || !industries.length) return [];
        const month = `${period.slice(0, 4)}-${period.slice(4)}`;
        return industries.map((industryId) => ({
            market,
            partner: 'WORLD',
            industry_id: industryId,
            hs_code: hsCode,
            month,
            imports_value_usd: row.flowCode === 'M' ? value : 0,
            exports_value_usd: row.flowCode === 'X' ? value : 0,
            source_id: sourceId,
            source_url: COMTRADE_ENDPOINT,
            fetched_at: fetchedAt,
            status: 'official'
        }));
    });
}

async function fetchJson(url, fetchImpl = global.fetch, { retries = 0 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
            if (response.ok) return response.json();
            if (response.status === 429 && attempt < retries) {
                const retryAfter = Number(response.headers?.get?.('retry-after'));
                const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : 5000 * (attempt + 1);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                continue;
            }
            throw new Error(`HTTP ${response.status}`);
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error('Official source retry budget exhausted');
}

function mergeSeries(existing, incoming, sourceId) {
    const byKey = new Map();
    existing.filter((row) => row.source_id !== sourceId).forEach((row) => {
        byKey.set(`${row.market}|${row.partner}|${row.industry_id}|${row.hs_code}|${row.month}`, row);
    });
    incoming.forEach((row) => {
        const key = `${row.market}|${row.partner}|${row.industry_id}|${row.hs_code}|${row.month}`;
        const current = byKey.get(key) || {};
        byKey.set(key, {
            ...current,
            ...row,
            imports_value_usd: Number(current.imports_value_usd || 0) + Number(row.imports_value_usd || 0),
            exports_value_usd: Number(current.exports_value_usd || 0) + Number(row.exports_value_usd || 0)
        });
    });
    return [...byKey.values()].sort((a, b) => `${a.market}|${a.industry_id}|${a.month}`.localeCompare(`${b.market}|${b.industry_id}|${b.month}`));
}

async function syncCensus(payload, { apiKey = process.env.CENSUS_API_KEY, fetchImpl = global.fetch } = {}) {
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const source = sources.find((row) => row.id === CENSUS_SOURCE_ID);
    if (!apiKey) {
        if (source) source.status = 'key_required';
        return { ok: true, skipped: true, reason: 'CENSUS_API_KEY is not configured', rows: [] };
    }
    const range = monthRange();
    const incoming = [];
    try {
        for (const industry of INDUSTRIES) {
            if (!industry.hs.length) continue;
            const hsCode = industry.hs[0].slice(0, 4);
            for (const flow of ['import', 'export']) {
                const url = buildCensusUrl({ flow, hsCode, apiKey, range });
                const rows = await fetchJson(url, fetchImpl);
                incoming.push(...parseCensusRows(rows, { flow, industryId: industry.id, hsCode }));
            }
        }
        if (!incoming.length) throw new Error('Official API returned no monthly rows');
        payload.series = mergeSeries(Array.isArray(payload.series) ? payload.series : [], incoming, CENSUS_SOURCE_ID);
        payload.updated_at = new Date().toISOString();
        if (source) {
            source.status = 'official_current';
            source.role = 'official_aggregator';
            source.market_roles = {
                CN: 'historical_fallback_and_cross_validation',
                default: 'primary_official_aggregator'
            };
            source.last_success_at = payload.updated_at;
            delete source.last_error;
        }
        return { ok: true, skipped: false, rows: incoming };
    } catch (error) {
        if (source) {
            source.status = 'degraded';
            source.last_error = String(error.message || error);
            source.last_attempt_at = new Date().toISOString();
        }
        return { ok: false, skipped: false, error: String(error.message || error), rows: [] };
    }
}

async function mapWithConcurrency(items, concurrency, task) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await task(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

async function syncComtrade(payload, {
    fetchImpl = global.fetch,
    periods = monthList(),
    concurrency = 1
} = {}) {
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const source = sources.find((row) => row.id === COMTRADE_SOURCE_ID);
    try {
        const responses = await mapWithConcurrency(periods, concurrency, async (period) => (
            fetchJson(buildComtradeUrl({ period }), fetchImpl, { retries: 3 })
        ));
        const incoming = responses.flatMap((response) => parseComtradeRows(response));
        if (!incoming.length) throw new Error('UN Comtrade returned no monthly rows for the maintained HS scope');
        payload.series = mergeSeries(Array.isArray(payload.series) ? payload.series : [], incoming, COMTRADE_SOURCE_ID);
        payload.updated_at = new Date().toISOString();
        if (source) {
            source.status = 'official_current';
            source.last_success_at = payload.updated_at;
            source.latest_period = incoming.map((row) => row.month).sort().at(-1);
            source.row_count = incoming.length;
            delete source.last_error;
        }
        return { ok: true, skipped: false, rows: incoming };
    } catch (error) {
        if (source) {
            source.status = Array.isArray(payload.series) && payload.series.some((row) => row.source_id === COMTRADE_SOURCE_ID)
                ? 'degraded'
                : 'connector_ready';
            source.last_error = String(error.message || error);
            source.last_attempt_at = new Date().toISOString();
        }
        return { ok: false, skipped: false, error: String(error.message || error), rows: [] };
    }
}

async function run({ dryRun = false, apiKey, fetchImpl } = {}) {
    const payload = readJson(DATA_PATH, { schema_version: '1.0', sources: [], series: [] });
    const comtrade = await syncComtrade(payload, { fetchImpl });
    const census = await syncCensus(payload, { apiKey, fetchImpl });
    if (!dryRun) writeJson(DATA_PATH, payload);
    return {
        ok: comtrade.ok && census.ok,
        skipped: comtrade.skipped && census.skipped,
        reason: census.reason,
        error: [comtrade.error, census.error].filter(Boolean).join('; ') || undefined,
        rows: [...comtrade.rows, ...census.rows],
        connectors: { comtrade, census },
        payload
    };
}

if (require.main === module) {
    run({ dryRun: process.argv.includes('--dry-run') }).then((result) => {
        console.log(JSON.stringify({ ok: result.ok, skipped: result.skipped, reason: result.reason, error: result.error, row_count: result.rows.length }, null, 2));
        process.exit(result.ok ? 0 : 1);
    });
}

module.exports = {
    COMTRADE_REPORTERS,
    buildCensusUrl,
    buildComtradeUrl,
    mapWithConcurrency,
    mergeSeries,
    monthList,
    monthRange,
    parseCensusRows,
    parseComtradeRows,
    run,
    syncCensus,
    syncComtrade
};
