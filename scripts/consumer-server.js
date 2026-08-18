#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadLocalEnvFiles } = require('../lib/load-local-env');

const ROOT = path.join(__dirname, '..');
loadLocalEnvFiles(ROOT);
const { ConsumerService } = require('../lib/consumer-service');
const PORT = Number(process.env.CONSUMER_PORT || 8790);
const service = new ConsumerService();
const rateBuckets = new Map();
const PUBLIC_DIRECTORIES = new Set(['css', 'js']);
const PUBLIC_LIB_FILES = new Set([
    'actionable-checklist.js', 'can-i-sell-it.js', 'checklist-industry-segment.js', 'checklist.js',
    'country-registry.js', 'deep-link.js', 'enterprise-print-report.js', 'eu-us-special-program.js',
    'hscode-dual.js', 'industry-checklist-baseline.js', 'matched-results.js', 'post-entry-value.js',
    'pre-screen-report.js', 'product-intelligence.js', 'tariff-watch.js', 'trade-country.js',
    'trade-flow.js', 'trade-opportunity.js', 'wearable-product-models.js'
]);
const PUBLIC_ROOT_EXTENSIONS = new Set(['.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp']);
const PUBLIC_ROOT_FILES = new Set([
    'can-i-sell-it.html', 'data-center.html', 'electronics.html', 'healthcare-lab.html',
    'hscode.html', 'index.html', 'industrial-automation.html', 'new-energy.html',
    'opportunity.html', 'post-entry-result.html', 'post-entry.html', 'semiconductor.html',
    'tariff-watch.html', 'trade-flow.html', 'us-market.html', 'compliance-feedback-codec.js'
]);
const PUBLIC_DATA_FILES = new Set([
    'cases.json', 'catalog.json', 'catalog.schema.json', 'categories.json',
    'china-customs-sync-status.json', 'china-industry-flow.json', 'country-registry.json', 'coverage-matrix.json',
    'country-checklist-baselines.json', 'duty-rate-sync-status.json', 'duty-rates.json', 'incoterms.json', 'knowledge-base.json',
    'national-trade-flow-sync-status.json', 'post-entry-rate-priority-matrix.json',
    'quick-actions.json', 'scope-keywords.json', 'tags.json', 'trade-flow.json', 'updates.json'
]);

function rateLimit(key, limit, windowMs) {
    const now = Date.now();
    if (rateBuckets.size > 1000) {
        for (const [bucketKey, times] of rateBuckets) {
            const active = times.filter((time) => now - time < windowMs);
            if (active.length) rateBuckets.set(bucketKey, active);
            else rateBuckets.delete(bucketKey);
        }
    }
    if (rateBuckets.size >= 1000 && !rateBuckets.has(key)) return false;
    const recent = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    rateBuckets.set(key, recent);
    return true;
}

function isPublicPath(requested) {
    const normalized = requested.replace(/^\/+/, '');
    if (!normalized || normalized.split('/').some((part) => !part || part.startsWith('.'))) return false;
    const parts = normalized.split('/');
    if (parts.length === 1) {
        return PUBLIC_ROOT_FILES.has(parts[0]) || PUBLIC_ROOT_EXTENSIONS.has(path.extname(parts[0]).toLowerCase());
    }
    if (parts[0] === 'data') return parts.length === 2 && PUBLIC_DATA_FILES.has(parts[1]);
    if (parts[0] === 'lib') return parts.length === 2 && PUBLIC_LIB_FILES.has(parts[1]);
    return PUBLIC_DIRECTORIES.has(parts[0]) && ['.js', '.css'].includes(path.extname(normalized).toLowerCase());
}

function cookie(req, name) {
    return String(req.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
}
function json(res, status, payload, extra = {}) {
    setHeaders(res);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
    res.end(JSON.stringify(payload));
}
function readBody(req, limit = 14 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = []; let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); return; }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
            catch { reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 })); }
        });
        req.on('error', reject);
    });
}
function user(req, activeService = service) { return activeService.authenticate(cookie(req, 'tracewize_session')); }
function requireUser(req, activeService = service) {
    const current = user(req, activeService);
    if (!current) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
    return current;
}
function sessionCookie(token, clear = false) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `tracewize_session=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure}`;
}
function publicFile(file) {
    const { userId, ...safe } = file;
    return safe;
}

async function api(req, res, url, activeService = service) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.origin;
        const expected = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`;
        if (origin && origin !== expected) throw Object.assign(new Error('Cross-site request blocked.'), { status: 403 });
    }
    if (req.method === 'GET' && url.pathname === '/api/consumer/health') return json(res, 200, activeService.health());
    if (req.method === 'POST' && url.pathname === '/api/consumer/register') {
        if (!rateLimit(`auth:${req.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw Object.assign(new Error('Too many account attempts. Try again later.'), { status: 429 });
        const body = await readBody(req, 16384); const result = activeService.register(body.email, body.password);
        return json(res, 201, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/login') {
        if (!rateLimit(`auth:${req.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw Object.assign(new Error('Too many account attempts. Try again later.'), { status: 429 });
        const body = await readBody(req, 16384); const result = activeService.login(body.email, body.password);
        return json(res, 200, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) });
    if (req.method === 'GET' && url.pathname === '/api/consumer/session') return json(res, 200, { ok: true, user: user(req, activeService) });
    const current = requireUser(req, activeService);
    if (req.method === 'GET' && url.pathname === '/api/consumer/assessments') return json(res, 200, { ok: true, assessments: activeService.listAssessments(current.id) });
    if (req.method === 'POST' && url.pathname === '/api/consumer/assessments') {
        const body = await readBody(req, 512 * 1024); return json(res, 201, { ok: true, assessment: activeService.saveAssessment(current.id, body) });
    }
    if (req.method === 'DELETE' && /^\/api\/consumer\/assessments\/[^/]+$/.test(url.pathname)) {
        return json(res, activeService.deleteAssessment(current.id, path.basename(url.pathname)) ? 200 : 404, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/consumer/files') return json(res, 200, { ok: true, files: activeService.listFiles(current.id).map(publicFile) });
    if (req.method === 'POST' && url.pathname === '/api/consumer/files') {
        const body = await readBody(req); return json(res, 201, { ok: true, file: publicFile(activeService.saveFile(current.id, body)) });
    }
    const parseMatch = url.pathname.match(/^\/api\/consumer\/files\/([^/]+)\/parse$/);
    if (req.method === 'POST' && parseMatch) return json(res, 200, { ok: true, file: publicFile(await activeService.parseFile(current.id, parseMatch[1])) });
    if (req.method === 'DELETE' && /^\/api\/consumer\/files\/[^/]+$/.test(url.pathname)) {
        return json(res, activeService.deleteFile(current.id, path.basename(url.pathname)) ? 200 : 404, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/assistant') {
        if (!rateLimit(`ai:${current.id}`, 20, 60 * 1000)) throw Object.assign(new Error('AI Assistant rate limit reached. Try again in a minute.'), { status: 429 });
        const body = await readBody(req, 512 * 1024); return json(res, 200, { ok: true, ...(await activeService.askAssistant(current.id, body)) });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/consumer/account') {
        activeService.deleteAccount(current.id); return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) });
    }
    return json(res, 404, { ok: false, error: 'Not found.' });
}

function staticFile(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    const requested = url.pathname === '/' ? '/can-i-sell-it.html' : url.pathname;
    if (!isPublicPath(requested)) return json(res, 404, { ok: false, error: 'Not found.' });
    const target = path.resolve(ROOT, `.${requested}`);
    if (!target.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return json(res, 404, { ok: false, error: 'Not found.' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
    setHeaders(res); res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
}

function createConsumerServer(activeService = service) {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
        try {
            if (url.pathname.startsWith('/api/consumer/')) await api(req, res, url, activeService);
            else staticFile(req, res, url);
        } catch (error) {
            if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.status ? error.message : 'Server error.' });
        }
    });
}
if (require.main === module) createConsumerServer().listen(PORT, '127.0.0.1', () => console.log(`Consumer app: http://127.0.0.1:${PORT}/can-i-sell-it.html`));
module.exports = { createConsumerServer, service, isPublicPath };
