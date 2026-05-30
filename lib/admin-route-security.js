/**
 * Fail-closed gate for administrative / testing HTTP routes.
 *
 * Routes are disabled unless ADMIN_ROUTES_ENABLED=1 (or true/yes).
 * When enabled, requests must present X-Admin-Secret, ?secret=, or legacy Bearer/key
 * matching TEST_CRAWL_SECRET or ADMIN_REVIEW_PASSWORD from the environment.
 */
'use strict';

const crypto = require('crypto');

const PRIMARY_ADMIN_HEADER = 'x-admin-secret';
const LEGACY_HEADER_KEYS = ['x-test-crawl-secret', 'x-api-key', 'x-admin-token'];
const QUERY_SECRET_KEYS = ['secret', 'key', 'token'];

function timingSafeEqualString(expected, provided) {
    const a = String(expected || '');
    const b = String(provided || '');
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function areAdminRoutesEnabled() {
    const flag = String(process.env.ADMIN_ROUTES_ENABLED || '').trim().toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'yes';
}

function getConfiguredAdminSecrets() {
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

function normalizePathname(path) {
    if (!path || typeof path !== 'string') {
        return '/';
    }
    const withoutQuery = path.split('?')[0].trim();
    if (!withoutQuery || withoutQuery === '/') {
        return '/';
    }
    const withLeading = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
    return withLeading.replace(/\/+$/, '') || '/';
}

/**
 * Extract inbound admin credential (X-Admin-Secret preferred).
 */
function extractAdminCredential({ query = {}, headers = {}, bearerToken = '' } = {}) {
    const headerMap = normalizeHeaderMap(headers);

    if (headerMap[PRIMARY_ADMIN_HEADER]) {
        return { value: headerMap[PRIMARY_ADMIN_HEADER], source: `header:${PRIMARY_ADMIN_HEADER}` };
    }

    const fromBearer = String(bearerToken || '').trim();
    if (fromBearer) {
        return { value: fromBearer, source: 'authorization' };
    }

    const authHeader = headerMap.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]?.trim()) {
        return { value: bearerMatch[1].trim(), source: 'authorization' };
    }

    for (const key of LEGACY_HEADER_KEYS) {
        if (headerMap[key]) {
            return { value: headerMap[key], source: `header:${key}` };
        }
    }

    for (const key of QUERY_SECRET_KEYS) {
        const raw = query[key];
        if (raw != null && String(raw).trim()) {
            return { value: String(raw).trim(), source: `query:${key}` };
        }
    }

    return { value: '', source: 'none' };
}

/**
 * @returns {{ ok: boolean, reason?: string, matched_secret?: string, credential_source?: string }}
 */
function authorizeAdminRouteAccess(context = {}) {
    if (!areAdminRoutesEnabled()) {
        return { ok: false, reason: 'routes_disabled' };
    }

    const secrets = getConfiguredAdminSecrets();
    if (secrets.length === 0) {
        return { ok: false, reason: 'secrets_not_configured' };
    }

    const credential = extractAdminCredential(context);
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

function isTestCrawlPath(path, method, queryParams = {}) {
    if (method !== 'GET' && method !== 'POST') {
        return false;
    }
    const normalized = normalizePathname(path);
    if (normalized === '/test-crawl' || normalized === '/api/test-crawl') {
        return true;
    }
    return queryParams.action === 'test_crawl' || queryParams.action === 'test-crawl';
}

function isReviewAdminPath(path) {
    const normalized = normalizePathname(path);
    return normalized === '/api/review' || normalized.startsWith('/api/review/');
}

function isDebugAdminPath(path, queryParams = {}) {
    const normalized = normalizePathname(path);
    if (normalized === '/api/debug' || normalized === '/debug' || normalized.startsWith('/api/debug/')) {
        return true;
    }
    if (queryParams.debug === '1' || queryParams.debug === 'true') {
        return true;
    }
    return false;
}

function isProtectedAdminPath(path, method, queryParams = {}) {
    return isTestCrawlPath(path, method, queryParams)
        || isReviewAdminPath(path)
        || isDebugAdminPath(path, queryParams)
        || normalizePathname(path).startsWith('/api/admin/');
}

function resolveClientIpFromHeaders(headers = {}) {
    const forwarded = normalizeHeaderMap(headers)['x-forwarded-for'] || '';
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    const realIp = normalizeHeaderMap(headers)['x-real-ip'];
    return realIp || '';
}

function resolveClientIpFromRequest(req) {
    if (!req) {
        return 'unknown';
    }
    const fromHeaders = resolveClientIpFromHeaders(req.headers);
    if (fromHeaders) {
        return fromHeaders;
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function logUnauthorizedAdminAccess(meta = {}) {
    const parts = [
        '[SECURITY]',
        'Unauthorized admin route attempt',
        `reason=${meta.reason || 'unknown'}`,
        `method=${meta.method || '?'}`,
        `path=${meta.path || '?'}`,
        `ip=${meta.ip || 'unknown'}`
    ];
    if (meta.credential_source) {
        parts.push(`credential_source=${meta.credential_source}`);
    }
    console.warn(parts.join(' '));
}

function buildAdminForbiddenPayload(auth = {}) {
    const messages = {
        routes_disabled: 'Forbidden. Administrative routes are disabled. Set ADMIN_ROUTES_ENABLED=1 and configure secrets in .env.local.',
        secrets_not_configured: 'Forbidden. Configure TEST_CRAWL_SECRET or ADMIN_REVIEW_PASSWORD in .env.local.',
        missing_credential: 'Forbidden. Provide X-Admin-Secret header or ?secret= matching a configured admin secret.',
        invalid_credential: 'Forbidden. Admin secret is invalid.'
    };
    return {
        ok: false,
        error: messages[auth.reason] || 'Forbidden.',
        reason: auth.reason || 'forbidden'
    };
}

/** @deprecated Use authorizeAdminRouteAccess */
function authorizeTestCrawlAccess(context) {
    return authorizeAdminRouteAccess(context);
}

/** @deprecated Use logUnauthorizedAdminAccess */
function logTestCrawlUnauthorized(meta) {
    logUnauthorizedAdminAccess(meta);
}

module.exports = {
    PRIMARY_ADMIN_HEADER,
    areAdminRoutesEnabled,
    getConfiguredAdminSecrets,
    extractAdminCredential,
    authorizeAdminRouteAccess,
    authorizeTestCrawlAccess,
    isProtectedAdminPath,
    isTestCrawlPath,
    isReviewAdminPath,
    isDebugAdminPath,
    normalizePathname,
    resolveClientIpFromHeaders,
    resolveClientIpFromRequest,
    logUnauthorizedAdminAccess,
    logTestCrawlUnauthorized,
    buildAdminForbiddenPayload
};
