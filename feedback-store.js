const crypto = require('crypto');

const MAX_PRODUCT_LENGTH = 200;
const MAX_REGULATION_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 120;
const MAX_LIST_ITEMS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 8;

function truncateText(text, maxLength) {
    if (typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 3)}...`;
}

function normalizeStringList(values, maxItems = MAX_LIST_ITEMS) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
        if (result.length >= maxItems) break;
    }
    return result;
}

function createFeedbackId() {
    const suffix = crypto.randomBytes(4).toString('hex');
    return `fb_${Date.now()}_${suffix}`;
}

function getClientIp(event) {
    const headers = event.headers || {};
    const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return event.requestContext?.identity?.sourceIp
        || event.requestContext?.http?.sourceIp
        || 'unknown';
}

function checkRateLimit(clientIp) {
    const key = clientIp || 'unknown';
    const now = Date.now();
    const recent = (rateLimitStore.get(key) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
        return false;
    }
    recent.push(now);
    rateLimitStore.set(key, recent);
    return true;
}

function validateFeedbackPayload(body) {
    const errors = [];
    const productQuery = truncateText(body?.product_query, MAX_PRODUCT_LENGTH);
    const regulationNeeded = truncateText(body?.regulation_needed, MAX_REGULATION_LENGTH);
    const email = truncateText(body?.email, MAX_EMAIL_LENGTH);

    if (!productQuery || productQuery.length < 2) {
        errors.push('product_query is required.');
    }

    if (email && !EMAIL_PATTERN.test(email)) {
        errors.push('email format is invalid.');
    }

    const direction = body?.direction === 'import' ? 'import' : 'export';
    const view = truncateText(body?.view, 40) || 'unknown';
    const riskLevel = truncateText(body?.risk_level, 40) || 'unknown';
    const trustStatus = truncateText(body?.trust_status, 40) || 'unknown';

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    const record = {
        feedback_id: createFeedbackId(),
        submitted_at: new Date().toISOString(),
        product_query: productQuery,
        regulation_needed: regulationNeeded,
        email: email || null,
        direction,
        view,
        matched_tag_ids: normalizeStringList(body?.matched_tag_ids),
        matched_rule_count: Number.isFinite(body?.matched_rule_count)
            ? Math.max(0, Math.min(999, Math.floor(body.matched_rule_count)))
            : 0,
        matched_case_count: Number.isFinite(body?.matched_case_count)
            ? Math.max(0, Math.min(999, Math.floor(body.matched_case_count)))
            : 0,
        had_results: Boolean(body?.had_results),
        risk_level: riskLevel,
        trust_status: trustStatus,
        selected_precheck_attributes: normalizeStringList(body?.selected_precheck_attributes),
        page_url: truncateText(body?.page_url, 500) || null,
        user_agent: truncateText(body?.user_agent, 300) || null
    };

    return { ok: true, record };
}

function getOssConfig() {
    return {
        bucket: process.env.OSS_BUCKET || '',
        region: process.env.OSS_REGION || process.env.FC_REGION || 'cn-shenzhen',
        accessKeyId: process.env.OSS_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
        prefix: (process.env.OSS_FEEDBACK_PREFIX || 'feedback').replace(/^\/+|\/+$/g, '')
    };
}

function buildOssObjectKey(prefix, feedbackId, submittedAt) {
    const date = new Date(submittedAt);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${prefix}/${yyyy}/${mm}/${dd}/${feedbackId}.json`;
}

function signOssRequest({ method, contentType, date, resource, secret }) {
    const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;
    return crypto.createHmac('sha1', secret).update(stringToSign).digest('base64');
}

function buildOssAuthHeaders({ method, contentType = '', resource, config }) {
    const date = new Date().toUTCString();
    const signature = signOssRequest({
        method,
        contentType,
        date,
        resource,
        secret: config.accessKeySecret
    });

    return {
        date,
        authorization: `OSS ${config.accessKeyId}:${signature}`
    };
}

function parseOssListKeys(xmlText) {
    const keys = [];
    const keyMatches = xmlText.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const match of keyMatches) {
        keys.push(match[1]);
    }

    const truncatedMatch = xmlText.match(/<IsTruncated>(true|false)<\/IsTruncated>/);
    const nextMarkerMatch = xmlText.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    const isTruncated = truncatedMatch?.[1] === 'true';
    const nextMarker = nextMarkerMatch?.[1] || '';

    return { keys, isTruncated, nextMarker };
}

async function listFeedbackObjectKeys({ prefix, maxKeys = 1000 } = {}) {
    const config = getOssConfig();
    if (!config.bucket || !config.accessKeyId || !config.accessKeySecret) {
        throw new Error('OSS is not configured. Set OSS_BUCKET, OSS_ACCESS_KEY_ID, and OSS_ACCESS_KEY_SECRET.');
    }

    const listPrefix = prefix || `${config.prefix}/`;
    const objectKeys = [];
    let marker = '';

    do {
        const query = new URLSearchParams({
            prefix: listPrefix,
            'max-keys': String(maxKeys)
        });
        if (marker) {
            query.set('marker', marker);
        }

        const queryString = query.toString();
        const resource = `/${config.bucket}/?${queryString}`;
        const { date, authorization } = buildOssAuthHeaders({
            method: 'GET',
            resource,
            config
        });
        const url = `https://${config.bucket}.${config.region}.aliyuncs.com/?${queryString}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Date: date,
                Authorization: authorization
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OSS list failed (${response.status}): ${errorText.slice(0, 200)}`);
        }

        const xmlText = await response.text();
        const page = parseOssListKeys(xmlText);
        objectKeys.push(...page.keys.filter(key => key.endsWith('.json')));
        marker = page.isTruncated ? page.nextMarker : '';
    } while (marker);

    return objectKeys;
}

async function downloadFeedbackObject(objectKey) {
    const config = getOssConfig();
    if (!config.bucket || !config.accessKeyId || !config.accessKeySecret) {
        throw new Error('OSS is not configured. Set OSS_BUCKET, OSS_ACCESS_KEY_ID, and OSS_ACCESS_KEY_SECRET.');
    }

    const resource = `/${config.bucket}/${objectKey}`;
    const { date, authorization } = buildOssAuthHeaders({
        method: 'GET',
        resource,
        config
    });
    const url = `https://${config.bucket}.${config.region}.aliyuncs.com/${objectKey}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Date: date,
            Authorization: authorization
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OSS download failed (${response.status}) for ${objectKey}: ${errorText.slice(0, 200)}`);
    }

    return response.text();
}

function parseFeedbackRecord(rawText, sourceKey = null) {
    if (!rawText || !rawText.trim()) {
        return null;
    }

    let record;
    try {
        record = JSON.parse(rawText);
    } catch (error) {
        console.warn(`WARN: Skipping invalid JSON${sourceKey ? ` (${sourceKey})` : ''}: ${error.message}`);
        return null;
    }

    if (!record || typeof record !== 'object' || !record.product_query) {
        console.warn(`WARN: Skipping record missing product_query${sourceKey ? ` (${sourceKey})` : ''}.`);
        return null;
    }

    return record;
}

async function loadFeedbackRecordsFromOss({ since, until, maxRecords = 5000 } = {}) {
    const config = getOssConfig();
    const objectKeys = await listFeedbackObjectKeys({ prefix: `${config.prefix}/` });
    const sinceMs = since ? since.getTime() : null;
    const untilMs = until ? until.getTime() : null;
    const records = [];

    for (const objectKey of objectKeys) {
        if (records.length >= maxRecords) {
            break;
        }

        const rawText = await downloadFeedbackObject(objectKey);
        const record = parseFeedbackRecord(rawText, objectKey);
        if (!record) {
            continue;
        }

        const submittedMs = Date.parse(record.submitted_at || '');
        if (Number.isFinite(submittedMs)) {
            if (sinceMs !== null && submittedMs < sinceMs) {
                continue;
            }
            if (untilMs !== null && submittedMs > untilMs) {
                continue;
            }
        }

        records.push({
            ...record,
            _source_key: objectKey
        });
    }

    records.sort((left, right) => {
        const leftMs = Date.parse(left.submitted_at || '') || 0;
        const rightMs = Date.parse(right.submitted_at || '') || 0;
        return rightMs - leftMs;
    });

    return records;
}

async function uploadFeedbackToOss(record) {
    const config = getOssConfig();
    if (!config.bucket || !config.accessKeyId || !config.accessKeySecret) {
        return {
            ok: true,
            storage: 'log',
            message: 'OSS not configured; feedback logged only.'
        };
    }

    const objectKey = buildOssObjectKey(config.prefix, record.feedback_id, record.submitted_at);
    const body = `${JSON.stringify(record)}\n`;
    const contentType = 'application/json; charset=utf-8';
    const resource = `/${config.bucket}/${objectKey}`;
    const { date, authorization } = buildOssAuthHeaders({
        method: 'PUT',
        contentType,
        resource,
        config
    });
    const url = `https://${config.bucket}.${config.region}.aliyuncs.com/${objectKey}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Date: date,
            'Content-Type': contentType,
            Authorization: authorization
        },
        body
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OSS upload failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    return {
        ok: true,
        storage: 'oss',
        object_key: objectKey
    };
}

async function storeFeedbackRecord(record) {
    console.log('FEEDBACK_RECORD', JSON.stringify(record));
    const result = await uploadFeedbackToOss(record);
    return result;
}

async function handleFeedbackRequest(body, event) {
    const clientIp = getClientIp(event);
    if (!checkRateLimit(clientIp)) {
        return {
            statusCode: 429,
            body: { error: 'Too many feedback submissions. Please try again later.' }
        };
    }

    const validation = validateFeedbackPayload(body);
    if (!validation.ok) {
        return {
            statusCode: 400,
            body: { error: validation.errors.join(' ') }
        };
    }

    const storage = await storeFeedbackRecord(validation.record);
    return {
        statusCode: 200,
        body: {
            ok: true,
            feedback_id: validation.record.feedback_id,
            storage: storage.storage,
            object_key: storage.object_key || null
        }
    };
}

module.exports = {
    validateFeedbackPayload,
    handleFeedbackRequest,
    storeFeedbackRecord,
    getOssConfig,
    listFeedbackObjectKeys,
    downloadFeedbackObject,
    parseFeedbackRecord,
    loadFeedbackRecordsFromOss
};
