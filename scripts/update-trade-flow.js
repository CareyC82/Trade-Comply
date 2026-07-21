#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { INDUSTRIES } = require('../lib/trade-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'trade-flow.json');
const STATUS_PATH = path.join(ROOT, 'data', 'trade-flow-sync-status.json');
const NATIONAL_CONNECTOR_REGISTRY_PATH = path.join(ROOT, 'data', 'national-trade-flow-connectors.json');
const NATIONAL_CONNECTOR_STATUS_PATH = path.join(ROOT, 'data', 'national-trade-flow-sync-status.json');
const OFFICIAL_BATCH_DIR = path.join(ROOT, 'data', 'inbox', 'trade-flow');
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
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function seriesKey(row) {
    return [row.source_id, row.market, row.partner, row.industry_id, row.hs_code, row.month].join('|');
}

function aggregateSeries(rows) {
    const byKey = new Map();
    rows.forEach((row) => {
        const key = seriesKey(row);
        const current = byKey.get(key) || {};
        byKey.set(key, {
            ...current,
            ...row,
            imports_value_usd: Number(current.imports_value_usd || 0) + Number(row.imports_value_usd || 0),
            exports_value_usd: Number(current.exports_value_usd || 0) + Number(row.exports_value_usd || 0)
        });
    });
    return [...byKey.values()].sort((a, b) => (
        `${a.market}|${a.industry_id}|${a.month}|${a.source_id}`
            .localeCompare(`${b.market}|${b.industry_id}|${b.month}|${b.source_id}`)
    ));
}

function rowMatchesScope(row, scope = {}) {
    const months = scope.months instanceof Set ? scope.months : new Set(scope.months || []);
    const markets = scope.markets instanceof Set ? scope.markets : new Set(scope.markets || []);
    const industries = scope.industryIds instanceof Set ? scope.industryIds : new Set(scope.industryIds || []);
    return (!months.size || months.has(row.month))
        && (!markets.size || markets.has(row.market))
        && (!industries.size || industries.has(row.industry_id));
}

function replaceSourceScope(existing, incoming, sourceId, scope = {}) {
    const retained = existing.filter((row) => (
        row.source_id !== sourceId || !rowMatchesScope(row, scope)
    ));
    return aggregateSeries([...retained, ...incoming]);
}

function validateCompleteBatch({
    existing = [], incoming = [], sourceId, requestedIds = [], completedIds = [], scope = {}, latestMonth
} = {}) {
    const requested = new Set(requestedIds);
    const completed = new Set(completedIds);
    const missing = [...requested].filter((id) => !completed.has(id));
    if (missing.length) return { ok: false, reason: `Incomplete official batch: ${missing.length} request(s) returned no usable rows`, missing };
    if (!incoming.length) return { ok: false, reason: 'Official batch returned no usable monthly rows', missing: [] };
    if (latestMonth && !incoming.some((row) => row.month === latestMonth)) {
        return { ok: false, reason: `Official batch does not contain required latest month ${latestMonth}`, missing: [latestMonth] };
    }

    const oldScoped = existing.filter((row) => row.source_id === sourceId && rowMatchesScope(row, scope));
    const oldKeys = new Set(oldScoped.map(seriesKey));
    const newKeys = new Set(incoming.map(seriesKey));
    if (oldKeys.size >= 20 && newKeys.size < Math.ceil(oldKeys.size * 0.35)) {
        return {
            ok: false,
            reason: `Official batch shrank unexpectedly from ${oldKeys.size} to ${newKeys.size} maintained row(s)`,
            missing: []
        };
    }
    return { ok: true, reason: 'Complete official batch accepted', missing: [] };
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
    return replaceSourceScope(existing, incoming, sourceId);
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
    const requestedIds = [];
    const completedIds = [];
    try {
        for (const industry of INDUSTRIES) {
            if (!industry.hs.length) continue;
            const hsCode = industry.hs[0].slice(0, 4);
            for (const flow of ['import', 'export']) {
                const requestId = `${industry.id}:${flow}`;
                requestedIds.push(requestId);
                const url = buildCensusUrl({ flow, hsCode, apiKey, range });
                const rows = await fetchJson(url, fetchImpl);
                const parsed = parseCensusRows(rows, { flow, industryId: industry.id, hsCode });
                if (parsed.length) completedIds.push(requestId);
                incoming.push(...parsed);
            }
        }
        const existing = Array.isArray(payload.series) ? payload.series : [];
        const months = [];
        for (let cursor = new Date(`${range.from}-01T00:00:00Z`); cursor <= new Date(`${range.to}-01T00:00:00Z`); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
            months.push(cursor.toISOString().slice(0, 7));
        }
        const validation = validateCompleteBatch({
            existing,
            incoming,
            sourceId: CENSUS_SOURCE_ID,
            requestedIds,
            completedIds,
            latestMonth: range.to,
            scope: { months, markets: ['US'], industryIds: INDUSTRIES.map((industry) => industry.id) }
        });
        if (!validation.ok) throw new Error(validation.reason);
        payload.series = replaceSourceScope(existing, incoming, CENSUS_SOURCE_ID, {
            months,
            markets: ['US'],
            industryIds: INDUSTRIES.map((industry) => industry.id)
        });
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
        const responses = await mapWithConcurrency(periods, concurrency, async (period) => {
            const response = await fetchJson(buildComtradeUrl({ period }), fetchImpl, { retries: 3 });
            return { period, rows: parseComtradeRows(response) };
        });
        const incoming = responses.flatMap((response) => response.rows);
        const completedIds = responses.filter((response) => response.rows.length).map((response) => response.period);
        const existing = Array.isArray(payload.series) ? payload.series : [];
        const months = periods.map((period) => `${period.slice(0, 4)}-${period.slice(4)}`);
        const validation = validateCompleteBatch({
            existing,
            incoming,
            sourceId: COMTRADE_SOURCE_ID,
            requestedIds: periods,
            completedIds,
            latestMonth: months.at(-1),
            scope: { months, markets: Object.keys(COMTRADE_REPORTERS), industryIds: INDUSTRIES.map((industry) => industry.id) }
        });
        if (!validation.ok) throw new Error(validation.reason);
        payload.series = replaceSourceScope(existing, incoming, COMTRADE_SOURCE_ID, {
            months,
            markets: Object.keys(COMTRADE_REPORTERS),
            industryIds: INDUSTRIES.map((industry) => industry.id)
        });
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

function normalizeOfficialBatchRow(row, source, fetchedAt) {
    const market = String(row.market || '').toUpperCase();
    const industryId = String(row.industry_id || '');
    const month = String(row.month || '');
    if (!COMTRADE_REPORTERS[market]) throw new Error(`Unsupported market in official batch: ${market || 'missing'}`);
    if (!INDUSTRIES.some((industry) => industry.id === industryId)) throw new Error(`Unsupported industry in official batch: ${industryId || 'missing'}`);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid official batch month: ${month || 'missing'}`);
    const imports = row.imports_value_usd === undefined ? undefined : Number(row.imports_value_usd);
    const exports = row.exports_value_usd === undefined ? undefined : Number(row.exports_value_usd);
    if (imports !== undefined && (!Number.isFinite(imports) || imports < 0)) throw new Error(`Invalid imports value for ${market}/${industryId}/${month}`);
    if (exports !== undefined && (!Number.isFinite(exports) || exports < 0)) throw new Error(`Invalid exports value for ${market}/${industryId}/${month}`);
    return {
        market,
        partner: String(row.partner || 'WORLD').toUpperCase(),
        industry_id: industryId,
        hs_code: String(row.hs_code || 'INDUSTRY'),
        month,
        imports_value_usd: imports ?? 0,
        exports_value_usd: exports ?? 0,
        source_id: source.id,
        source_url: source.source_url,
        fetched_at: fetchedAt,
        status: 'official'
    };
}

function validateOfficialManifest(manifest) {
    if (!manifest || manifest.complete !== true) throw new Error('Official batch must declare complete: true');
    const source = manifest.source || {};
    if (!/^[a-z0-9][a-z0-9._-]+$/i.test(String(source.id || ''))) throw new Error('Official batch source.id is invalid');
    if (!source.name) throw new Error('Official batch source.name is required');
    if (!/^https:\/\//i.test(String(source.source_url || ''))) throw new Error('Official batch source_url must be an HTTPS official reference');
    const expected = manifest.expected || {};
    const markets = [...new Set((expected.markets || []).map((value) => String(value).toUpperCase()))];
    const months = [...new Set((expected.months || []).map(String))];
    const industryIds = [...new Set((expected.industry_ids || []).map(String))];
    const directions = [...new Set((expected.directions || ['import', 'export']).map(String))];
    if (!markets.length || !months.length || !industryIds.length) throw new Error('Official batch expected markets, months, and industry_ids are required');
    if (directions.some((direction) => !['import', 'export'].includes(direction))) throw new Error('Official batch directions must be import and/or export');

    const fetchedAt = new Date().toISOString();
    const rows = (manifest.series || []).map((row) => normalizeOfficialBatchRow(row, source, fetchedAt));
    const rowMap = new Map(rows.map((row) => [`${row.market}|${row.industry_id}|${row.month}`, row]));
    const missing = [];
    markets.forEach((market) => months.forEach((month) => industryIds.forEach((industryId) => {
        const row = rowMap.get(`${market}|${industryId}|${month}`);
        if (!row) {
            missing.push(`${market}/${industryId}/${month}`);
            return;
        }
        if (directions.includes('import') && !Object.prototype.hasOwnProperty.call(
            (manifest.series || []).find((candidate) => String(candidate.market).toUpperCase() === market && candidate.industry_id === industryId && candidate.month === month) || {},
            'imports_value_usd'
        )) missing.push(`${market}/${industryId}/${month}:import`);
        if (directions.includes('export') && !Object.prototype.hasOwnProperty.call(
            (manifest.series || []).find((candidate) => String(candidate.market).toUpperCase() === market && candidate.industry_id === industryId && candidate.month === month) || {},
            'exports_value_usd'
        )) missing.push(`${market}/${industryId}/${month}:export`);
    })));
    if (missing.length) throw new Error(`Official batch is incomplete: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` +${missing.length - 5}` : ''}`);
    return { source, rows, scope: { markets, months, industryIds }, expected: { markets, months, industryIds, directions } };
}

function discoverOfficialBatchPaths(configured = process.env.OFFICIAL_TRADE_FLOW_MANIFEST) {
    const configuredPaths = String(configured || '').split(',').map((value) => value.trim()).filter(Boolean);
    const inboxPaths = fs.existsSync(OFFICIAL_BATCH_DIR)
        ? fs.readdirSync(OFFICIAL_BATCH_DIR).filter((name) => name.endsWith('.json')).map((name) => path.join(OFFICIAL_BATCH_DIR, name))
        : [];
    return [...new Set([...configuredPaths, ...inboxPaths].map((filePath) => (
        path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath)
    )))];
}

function syncOfficialBatches(payload, { manifestPaths = discoverOfficialBatchPaths() } = {}) {
    if (!manifestPaths.length) return { ok: true, skipped: true, reason: 'No national official batch manifests configured', rows: [], batches: [] };
    const batches = [];
    const acceptedRows = [];
    let allOk = true;
    manifestPaths.forEach((manifestPath) => {
        try {
            const manifest = readJson(manifestPath, null);
            if (!manifest) throw new Error('Manifest is not valid JSON');
            const validated = validateOfficialManifest(manifest);
            const existing = Array.isArray(payload.series) ? payload.series : [];
            const requestedIds = validated.expected.markets.flatMap((market) => (
                validated.expected.months.flatMap((month) => validated.expected.industryIds.map((industryId) => `${market}/${industryId}/${month}`))
            ));
            const completedIds = validated.rows.map((row) => `${row.market}/${row.industry_id}/${row.month}`);
            const complete = validateCompleteBatch({
                existing,
                incoming: validated.rows,
                sourceId: validated.source.id,
                requestedIds,
                completedIds,
                latestMonth: validated.expected.months.slice().sort().at(-1),
                scope: validated.scope
            });
            if (!complete.ok) throw new Error(complete.reason);
            payload.series = replaceSourceScope(existing, validated.rows, validated.source.id, validated.scope);
            const sourceEntry = (payload.sources || []).find((source) => source.id === validated.source.id);
            const nextSource = {
                ...(sourceEntry || {}),
                id: validated.source.id,
                name: validated.source.name,
                source_url: validated.source.source_url,
                markets: validated.expected.markets,
                status: 'official_current',
                role: 'national_official_monthly_industry',
                latest_period: validated.expected.months.slice().sort().at(-1),
                row_count: validated.rows.length,
                last_success_at: new Date().toISOString()
            };
            if (sourceEntry) Object.assign(sourceEntry, nextSource);
            else payload.sources = [...(payload.sources || []), nextSource];
            acceptedRows.push(...validated.rows);
            batches.push({ path: path.relative(ROOT, manifestPath), source_id: validated.source.id, ok: true, row_count: validated.rows.length });
        } catch (error) {
            allOk = false;
            batches.push({ path: path.relative(ROOT, manifestPath), ok: false, error: String(error.message || error), row_count: 0 });
        }
    });
    if (acceptedRows.length) payload.updated_at = new Date().toISOString();
    return { ok: allOk, skipped: false, rows: acceptedRows, batches };
}

function monthLag(latestMonth, referenceDate = new Date()) {
    const match = String(latestMonth || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const reference = new Date(referenceDate);
    return ((reference.getUTCFullYear() - Number(match[1])) * 12) + (reference.getUTCMonth() + 1 - Number(match[2]));
}

function nationalConnectorState(payload, connector, { error = '', referenceDate = new Date() } = {}) {
    const officialRows = (payload.series || []).filter((row) => row.market === connector.market && row.source_id === connector.id);
    const fallbackRows = (payload.series || []).filter((row) => row.market === connector.market && row.source_id === COMTRADE_SOURCE_ID);
    const latestPeriod = officialRows.map((row) => row.month).filter(Boolean).sort().at(-1) || '';
    const lagMonths = monthLag(latestPeriod, referenceDate);
    let status = 'no_official_series';
    if (officialRows.length && error) status = 'last_good_degraded';
    else if (officialRows.length && Number.isFinite(lagMonths) && lagMonths > 4) status = 'official_delayed';
    else if (officialRows.length) status = 'national_official_current';
    else if (fallbackRows.length) status = 'un_comtrade_fallback';
    return {
        market: connector.market,
        connector_id: connector.id,
        connector_name: connector.name,
        official_url: connector.official_url,
        status,
        latest_period: latestPeriod || fallbackRows.map((row) => row.month).filter(Boolean).sort().at(-1) || '',
        lag_months: lagMonths,
        official_row_count: officialRows.length,
        fallback_row_count: fallbackRows.length,
        last_error: error || undefined
    };
}

async function syncNationalOfficialConnectors(payload, {
    registry = readJson(NATIONAL_CONNECTOR_REGISTRY_PATH, { connectors: [] }),
    env = process.env,
    fetchImpl,
    referenceDate = new Date()
} = {}) {
    const markets = {};
    const acceptedRows = [];
    const failures = [];
    for (const connector of registry.connectors || []) {
        const feedUrl = String(env[connector.feed_env] || '').trim();
        let error = '';
        if (feedUrl) {
            try {
                const manifest = await fetchJson(feedUrl, fetchImpl, { retries: 2 });
                const validated = validateOfficialManifest(manifest);
                if (validated.source.id !== connector.id) throw new Error(`Source id must be ${connector.id}`);
                if (validated.expected.markets.length !== 1 || validated.expected.markets[0] !== connector.market) {
                    throw new Error(`Manifest must contain only market ${connector.market}`);
                }
                const existing = Array.isArray(payload.series) ? payload.series : [];
                const requestedIds = validated.expected.markets.flatMap((market) => (
                    validated.expected.months.flatMap((month) => validated.expected.industryIds.map((industryId) => `${market}/${industryId}/${month}`))
                ));
                const completedIds = validated.rows.map((row) => `${row.market}/${row.industry_id}/${row.month}`);
                const complete = validateCompleteBatch({
                    existing,
                    incoming: validated.rows,
                    sourceId: connector.id,
                    requestedIds,
                    completedIds,
                    latestMonth: validated.expected.months.slice().sort().at(-1),
                    scope: validated.scope
                });
                if (!complete.ok) throw new Error(complete.reason);
                payload.series = replaceSourceScope(existing, validated.rows, connector.id, validated.scope);
                const sourceEntry = (payload.sources || []).find((source) => source.id === connector.id);
                const nextSource = {
                    ...(sourceEntry || {}),
                    id: connector.id,
                    name: connector.name,
                    source_url: connector.official_url,
                    markets: [connector.market],
                    status: 'official_current',
                    role: 'national_official_monthly_industry',
                    latest_period: validated.expected.months.slice().sort().at(-1),
                    row_count: validated.rows.length,
                    last_success_at: new Date().toISOString()
                };
                if (sourceEntry) Object.assign(sourceEntry, nextSource);
                else payload.sources = [...(payload.sources || []), nextSource];
                acceptedRows.push(...validated.rows);
            } catch (caught) {
                error = String(caught.message || caught);
                failures.push({ market: connector.market, connector_id: connector.id, error });
            }
        }
        markets[connector.market] = nationalConnectorState(payload, connector, { error, referenceDate });
    }
    const status = {
        schema_version: '1.0',
        generated_at: new Date().toISOString(),
        ok: failures.length === 0,
        publish_policy: 'complete_batch_only_last_good_retained',
        markets,
        failures
    };
    payload.national_connector_status = status;
    if (acceptedRows.length) payload.updated_at = new Date().toISOString();
    return { ok: status.ok, skipped: acceptedRows.length === 0 && failures.length === 0, rows: acceptedRows, status, failures };
}

async function run({ dryRun = false, apiKey, fetchImpl, manifestPaths, nationalRegistry, env, referenceDate } = {}) {
    const payload = readJson(DATA_PATH, { schema_version: '1.0', sources: [], series: [] });
    const comtrade = await syncComtrade(payload, { fetchImpl });
    const census = await syncCensus(payload, { apiKey, fetchImpl });
    const officialBatches = syncOfficialBatches(payload, { manifestPaths });
    const nationalOfficial = await syncNationalOfficialConnectors(payload, { registry: nationalRegistry, env, fetchImpl, referenceDate });
    const result = {
        ok: comtrade.ok && census.ok && officialBatches.ok && nationalOfficial.ok,
        skipped: comtrade.skipped && census.skipped,
        reason: census.reason,
        error: [comtrade.error, census.error, ...officialBatches.batches.filter((batch) => !batch.ok).map((batch) => batch.error), ...nationalOfficial.failures.map((failure) => failure.error)].filter(Boolean).join('; ') || undefined,
        rows: [...comtrade.rows, ...census.rows, ...officialBatches.rows, ...nationalOfficial.rows],
        connectors: { comtrade, census, official_batches: officialBatches, national_official: nationalOfficial },
        payload
    };
    if (!dryRun) {
        writeJson(DATA_PATH, payload);
        writeJson(NATIONAL_CONNECTOR_STATUS_PATH, nationalOfficial.status);
        writeJson(STATUS_PATH, {
            schema_version: '1.0',
            generated_at: new Date().toISOString(),
            ok: result.ok,
            publish_policy: 'complete_batch_only_last_good_retained',
            connectors: {
                comtrade: { ok: comtrade.ok, skipped: comtrade.skipped, row_count: comtrade.rows.length, error: comtrade.error },
                census: { ok: census.ok, skipped: census.skipped, row_count: census.rows.length, reason: census.reason, error: census.error },
                official_batches: { ok: officialBatches.ok, skipped: officialBatches.skipped, row_count: officialBatches.rows.length, batches: officialBatches.batches },
                national_official: { ok: nationalOfficial.ok, skipped: nationalOfficial.skipped, row_count: nationalOfficial.rows.length, markets: nationalOfficial.status.markets, failures: nationalOfficial.failures }
            }
        });
    }
    return result;
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
    replaceSourceScope,
    run,
    syncCensus,
    syncComtrade,
    syncNationalOfficialConnectors,
    syncOfficialBatches,
    validateCompleteBatch,
    validateOfficialManifest
};
