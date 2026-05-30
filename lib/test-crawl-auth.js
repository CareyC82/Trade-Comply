/**
 * Strict authentication for /api/test-crawl and /test-crawl (fail-closed).
 */
'use strict';

const crypto = require('crypto');

const QUERY_KEYS = ['key', 'secret', 'token'];
const HEADER_KEYS = ['x-test-crawl-secret', 'x-api-key', 'x-admin-token'];

function timingSafeEqualString(expected, provided) {
    const a = String(expected || '');
    const b = String(provided || '');
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function getConfiguredSecrets() {
    const testCrawlSecret = String(process.env.TEST_CRAWL_SECRET || '').trim();
    const adminPassword = String(process.env.ADMIN_REVIEW_PASSWORD || '').trim();
    const secrets = [];
    if (testCrawlSecret) {
        secrets.push({ name: 'TEST_CRAWL_SECRET', value: testCrawlSecret });
    }
    if (adminPassword) {
        secrets.push({ name: 'ADMIN_REVIEW_PASSWORD', value: adminPassword });
    }
    return secrets;
}

function normalizeHeaderMap(headers) {
    if (!headers || typeof headers !== 'object') {
        return {};
    }
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        out[String(key).toLowerCase()] = String(value || '').trim();
    }
    return out;
}

/**
 * Collect credential from query, headers, or explicit Bearer token.
 */
function extractProvidedCredential({ query = {}, headers = {}, bearerToken = '' } = {}) {
    const fromBearer = String(bearerToken || '').trim();
    if (fromBearer) {
        return { value: fromBearer, source: 'authorization' };
    }

    const headerMap = normalizeHeaderMap(headers);
    const authHeader = headerMap.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]?.trim()) {
        return { value: bearerMatch[1].trim(), source: 'authorization' };
    }

    for (const key of HEADER_KEYS) {
        if (headerMap[key]) {
            return { value: headerMap[key], source: `header:${key}` };
        }
    }

    for (const key of QUERY_KEYS) {
        const raw = query[key];
        if (raw != null && String(raw).trim()) {
            return { value: String(raw).trim(), source: `query:${key}` };
        }
    }

    return { value: '', source: 'none' };
}

/**
 * Fail-closed: deny when no secrets configured or credential missing/invalid.
 *
 * @returns {{ ok: boolean, reason?: string, matched_secret?: string, credential_source?: string }}
 */
function authorizeTestCrawlAccess(context = {}) {
    const secrets = getConfiguredSecrets();
    if (secrets.length === 0) {
        return { ok: false, reason: 'secrets_not_configured' };
    }

    const credential = extractProvidedCredential(context);
    if (!credential.value) {
        return { ok: false, reason: 'missing_credential', credential_source: credential.source };
    }

    for (const entry of secrets) {
        if (timingSafeEqualString(entry.value, credential.value)) {
            return {
                ok: true,
                matched_secret: entry.name,
                credential_source: credential.source
            };
        }
    }

    return {
        ok: false,
        reason: 'invalid_credential',
        credential_source: credential.source
    };
}

function logTestCrawlUnauthorized(meta = {}) {
    const parts = [
        '[SECURITY]',
        'Unauthorized test-crawl attempt',
        `reason=${meta.reason || 'unknown'}`,
        `method=${meta.method || '?'}`,
        `path=${meta.path || '/api/test-crawl'}`,
        `ip=${meta.ip || 'unknown'}`
    ];
    if (meta.credential_source) {
        parts.push(`credential_source=${meta.credential_source}`);
    }
    console.warn(parts.join(' '));
}

module.exports = {
    authorizeTestCrawlAccess,
    extractProvidedCredential,
    getConfiguredSecrets,
    logTestCrawlUnauthorized
};
