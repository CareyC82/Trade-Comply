'use strict';

const crypto = require('crypto');
const { getOssConfig } = require('./feedback-store');

const METRIC_EVENTS = new Set([
    'can_i_sell_entry_click',
    'can_i_sell_check_started',
    'can_i_sell_result_generated'
]);
const METRIC_PAGES = new Set(['home', 'can-i-sell-it', 'other']);
const METRIC_MODES = new Set(['single', 'compare', 'unknown']);
const METRIC_SOURCES = new Set(['organic', 'campaign', 'unknown']);
const ALLOWED_PAYLOAD_KEYS = new Set([
    'event_name', 'app_build', 'page', 'mode', 'market_count', 'source', 'test_event'
]);
const DEFAULT_RETENTION_DAYS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateLimitStore = new Map();
let lastCleanupAt = 0;

function safeToken(value, maxLength = 80) {
    const token = String(value || '').trim();
    return /^[a-zA-Z0-9._-]+$/.test(token) ? token.slice(0, maxLength) : '';
}

function getUsageMetricsConfig() {
    const oss = getOssConfig();
    const retention = Number(process.env.USAGE_METRICS_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
    return {
        ...oss,
        prefix: String(process.env.OSS_USAGE_METRICS_PREFIX || 'usage-metrics').replace(/^\/+|\/+$/g, ''),
        retentionDays: Number.isInteger(retention) && retention >= 1 && retention <= 90
            ? retention
            : DEFAULT_RETENTION_DAYS
    };
}

function getUsageMetricsStatus() {
    const config = getUsageMetricsConfig();
    const missing = [];
    if (!config.bucket) missing.push('OSS_BUCKET');
    if (!config.accessKeyId) missing.push('OSS_ACCESS_KEY_ID');
    if (!config.accessKeySecret) missing.push('OSS_ACCESS_KEY_SECRET');
    return {
        configured: missing.length === 0,
        storage: missing.length === 0 ? 'oss' : 'unavailable',
        retention_days: config.retentionDays,
        raw_payload_policy: 'allowlisted_anonymous_events_only',
        missing
    };
}

function validateUsageMetricPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'A JSON object is required.' };
    }
    const unexpected = Object.keys(body).filter((key) => !ALLOWED_PAYLOAD_KEYS.has(key));
    if (unexpected.length) {
        return { ok: false, error: `Unsupported metric field: ${unexpected[0]}.` };
    }
    if (!METRIC_EVENTS.has(body.event_name)) {
        return { ok: false, error: 'Unsupported metric event.' };
    }
    const marketCount = Number(body.market_count);
    if (!Number.isInteger(marketCount) || marketCount < 0 || marketCount > 4) {
        return { ok: false, error: 'market_count must be an integer between 0 and 4.' };
    }
    const record = {
        schema_version: 1,
        event_id: crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
        event_name: body.event_name,
        app_build: safeToken(body.app_build, 64) || 'unknown',
        page: METRIC_PAGES.has(body.page) ? body.page : 'other',
        mode: METRIC_MODES.has(body.mode) ? body.mode : 'unknown',
        market_count: marketCount,
        source: METRIC_SOURCES.has(body.source) ? body.source : 'unknown',
        test_event: body.test_event === true
    };
    return { ok: true, record };
}

function clientIp(event = {}) {
    const headers = event.headers || {};
    const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
    return event.requestContext?.identity?.sourceIp
        || event.requestContext?.http?.sourceIp
        || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
        || 'unknown';
}

function checkRateLimit(ip, now = Date.now()) {
    const active = (rateLimitStore.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
    if (active.length >= RATE_LIMIT_MAX) return false;
    active.push(now);
    rateLimitStore.set(ip, active);
    if (rateLimitStore.size > 1000) {
        for (const [key, times] of rateLimitStore) {
            const recent = times.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
            if (recent.length) rateLimitStore.set(key, recent);
            else rateLimitStore.delete(key);
        }
    }
    return true;
}

function ossAuth({ method, resource, contentType = '', config }) {
    const date = new Date().toUTCString();
    const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;
    const signature = crypto.createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');
    return { Date: date, Authorization: `OSS ${config.accessKeyId}:${signature}` };
}

function metricObjectKey(config, record) {
    const date = new Date(record.occurred_at);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${config.prefix}/raw/${yyyy}/${mm}/${dd}/${record.event_id}.json`;
}

function metricDateFromKey(config, key) {
    const escaped = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = key.match(new RegExp(`^${escaped}/raw/(\\d{4})/(\\d{2})/(\\d{2})/`));
    if (!match) return null;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseOssList(xml) {
    return {
        keys: [...String(xml || '').matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]),
        truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
        nextMarker: String(xml || '').match(/<NextMarker>([^<]*)<\/NextMarker>/)?.[1] || ''
    };
}

async function listMetricKeys(config, fetcher = globalThis.fetch) {
    const keys = [];
    let marker = '';
    do {
        const query = new URLSearchParams({ prefix: `${config.prefix}/raw/`, 'max-keys': '1000' });
        if (marker) query.set('marker', marker);
        const resource = `/${config.bucket}/?${query}`;
        const response = await fetcher(`https://${config.bucket}.${config.region}.aliyuncs.com/?${query}`, {
            headers: ossAuth({ method: 'GET', resource, config })
        });
        if (!response.ok) throw new Error(`Usage metric list failed (${response.status}).`);
        const page = parseOssList(await response.text());
        keys.push(...page.keys.filter((key) => key.endsWith('.json')));
        marker = page.truncated ? page.nextMarker : '';
        if (page.truncated && !marker) throw new Error('Usage metric list did not return a continuation marker.');
    } while (marker);
    return keys;
}

async function deleteMetricObject(config, key, fetcher = globalThis.fetch) {
    const resource = `/${config.bucket}/${key}`;
    const response = await fetcher(`https://${config.bucket}.${config.region}.aliyuncs.com/${key}`, {
        method: 'DELETE',
        headers: ossAuth({ method: 'DELETE', resource, config })
    });
    if (!response.ok && response.status !== 404) throw new Error(`Usage metric delete failed (${response.status}).`);
}

async function enforceUsageMetricsRetention(config, options = {}) {
    const now = options.now || new Date();
    const fetcher = options.fetcher || globalThis.fetch;
    const cutoff = new Date(now.getTime() - config.retentionDays * 86400000);
    const keys = await listMetricKeys(config, fetcher);
    const expired = keys.filter((key) => {
        const date = metricDateFromKey(config, key);
        return date && date < cutoff;
    });
    for (const key of expired) await deleteMetricObject(config, key, fetcher);
    lastCleanupAt = now.getTime();
    return { checked: keys.length, deleted: expired.length, cutoff: cutoff.toISOString() };
}

async function storeUsageMetric(record, options = {}) {
    const config = options.config || getUsageMetricsConfig();
    const fetcher = options.fetcher || globalThis.fetch;
    if (!getUsageMetricsStatus().configured && !options.config) {
        throw Object.assign(new Error('Usage metrics storage is not configured.'), { status: 503 });
    }
    const now = options.now || new Date();
    if (now.getTime() - lastCleanupAt > 6 * 60 * 60 * 1000) {
        await enforceUsageMetricsRetention(config, { fetcher, now });
    }
    const key = metricObjectKey(config, record);
    const body = `${JSON.stringify(record)}\n`;
    const contentType = 'application/json; charset=utf-8';
    const resource = `/${config.bucket}/${key}`;
    const response = await fetcher(`https://${config.bucket}.${config.region}.aliyuncs.com/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, ...ossAuth({ method: 'PUT', resource, contentType, config }) },
        body
    });
    if (!response.ok) throw new Error(`Usage metric write failed (${response.status}).`);
    return { storage: 'oss' };
}

async function handleUsageMetricRequest(body, event, options = {}) {
    if (!checkRateLimit(clientIp(event))) return { statusCode: 429, body: { ok: false, error: 'Too many metric events.' } };
    const validation = validateUsageMetricPayload(body);
    if (!validation.ok) return { statusCode: 400, body: { ok: false, error: validation.error } };
    try {
        const stored = options.store
            ? await options.store(validation.record)
            : await storeUsageMetric(validation.record, options);
        return { statusCode: 202, body: { ok: true, accepted: true, storage: stored.storage } };
    } catch (error) {
        return { statusCode: error.status || 503, body: { ok: false, error: 'Usage metrics are temporarily unavailable.' } };
    }
}

function summarizeUsageEvents(records, { includeTest = false } = {}) {
    const eligible = records.filter((record) => METRIC_EVENTS.has(record?.event_name) && (includeTest || record.test_event !== true));
    const totals = Object.fromEntries([...METRIC_EVENTS].map((name) => [name, 0]));
    const days = {};
    for (const record of eligible) {
        totals[record.event_name] += 1;
        const day = String(record.occurred_at || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        days[day] ||= Object.fromEntries([...METRIC_EVENTS].map((name) => [name, 0]));
        days[day][record.event_name] += 1;
    }
    return { totals, days: Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([date, counts]) => ({ date, ...counts })) };
}

async function loadUsageMetricRecords(config = getUsageMetricsConfig(), options = {}) {
    const fetcher = options.fetcher || globalThis.fetch;
    const keys = await listMetricKeys(config, fetcher);
    const records = [];
    for (const key of keys) {
        const resource = `/${config.bucket}/${key}`;
        const response = await fetcher(`https://${config.bucket}.${config.region}.aliyuncs.com/${key}`, {
            headers: ossAuth({ method: 'GET', resource, config })
        });
        if (!response.ok) throw new Error(`Usage metric read failed (${response.status}).`);
        try { records.push(JSON.parse(await response.text())); } catch {}
    }
    return records;
}

module.exports = {
    METRIC_EVENTS,
    getUsageMetricsConfig,
    getUsageMetricsStatus,
    validateUsageMetricPayload,
    metricObjectKey,
    metricDateFromKey,
    enforceUsageMetricsRetention,
    storeUsageMetric,
    handleUsageMetricRequest,
    summarizeUsageEvents,
    loadUsageMetricRecords
};
