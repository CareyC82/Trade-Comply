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

function rateLimit(key, limit, windowMs) {
    const now = Date.now();
    const recent = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    rateBuckets.set(key, recent);
    return true;
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
function user(req) { return service.authenticate(cookie(req, 'tracewize_session')); }
function requireUser(req) {
    const current = user(req);
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

async function api(req, res, url) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.origin;
        const expected = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`;
        if (origin && origin !== expected) throw Object.assign(new Error('Cross-site request blocked.'), { status: 403 });
    }
    if (req.method === 'GET' && url.pathname === '/api/consumer/health') return json(res, 200, service.health());
    if (req.method === 'POST' && url.pathname === '/api/consumer/register') {
        if (!rateLimit(`auth:${req.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw Object.assign(new Error('Too many account attempts. Try again later.'), { status: 429 });
        const body = await readBody(req, 16384); const result = service.register(body.email, body.password);
        return json(res, 201, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/login') {
        if (!rateLimit(`auth:${req.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw Object.assign(new Error('Too many account attempts. Try again later.'), { status: 429 });
        const body = await readBody(req, 16384); const result = service.login(body.email, body.password);
        return json(res, 200, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) });
    if (req.method === 'GET' && url.pathname === '/api/consumer/session') return json(res, 200, { ok: true, user: user(req) });
    const current = requireUser(req);
    if (req.method === 'GET' && url.pathname === '/api/consumer/assessments') return json(res, 200, { ok: true, assessments: service.listAssessments(current.id) });
    if (req.method === 'POST' && url.pathname === '/api/consumer/assessments') {
        const body = await readBody(req, 512 * 1024); return json(res, 201, { ok: true, assessment: service.saveAssessment(current.id, body) });
    }
    if (req.method === 'DELETE' && /^\/api\/consumer\/assessments\/[^/]+$/.test(url.pathname)) {
        return json(res, service.deleteAssessment(current.id, path.basename(url.pathname)) ? 200 : 404, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/consumer/files') return json(res, 200, { ok: true, files: service.listFiles(current.id).map(publicFile) });
    if (req.method === 'POST' && url.pathname === '/api/consumer/files') {
        const body = await readBody(req); return json(res, 201, { ok: true, file: publicFile(service.saveFile(current.id, body)) });
    }
    const parseMatch = url.pathname.match(/^\/api\/consumer\/files\/([^/]+)\/parse$/);
    if (req.method === 'POST' && parseMatch) return json(res, 200, { ok: true, file: publicFile(await service.parseFile(current.id, parseMatch[1])) });
    if (req.method === 'DELETE' && /^\/api\/consumer\/files\/[^/]+$/.test(url.pathname)) {
        return json(res, service.deleteFile(current.id, path.basename(url.pathname)) ? 200 : 404, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/consumer/assistant') {
        if (!rateLimit(`ai:${current.id}`, 20, 60 * 1000)) throw Object.assign(new Error('AI Assistant rate limit reached. Try again in a minute.'), { status: 429 });
        const body = await readBody(req, 512 * 1024); return json(res, 200, { ok: true, ...(await service.askAssistant(current.id, body)) });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/consumer/account') {
        service.deleteAccount(current.id); return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) });
    }
    return json(res, 404, { ok: false, error: 'Not found.' });
}

function staticFile(req, res, url) {
    const requested = url.pathname === '/' ? '/can-i-sell-it.html' : url.pathname;
    const target = path.resolve(ROOT, `.${requested}`);
    if (!target.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return json(res, 404, { ok: false, error: 'Not found.' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
    setHeaders(res); res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
}

function createConsumerServer() {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
        try {
            if (url.pathname.startsWith('/api/consumer/')) await api(req, res, url);
            else staticFile(req, res, url);
        } catch (error) {
            if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.status ? error.message : 'Server error.' });
        }
    });
}
if (require.main === module) createConsumerServer().listen(PORT, '127.0.0.1', () => console.log(`Consumer app: http://127.0.0.1:${PORT}/can-i-sell-it.html`));
module.exports = { createConsumerServer, service };
