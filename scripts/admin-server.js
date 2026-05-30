#!/usr/bin/env node
/**
 * Local review API for admin.html (password-protected).
 *
 * Usage:
 *   ADMIN_REVIEW_PASSWORD=your-secret node scripts/admin-server.js
 *   open http://127.0.0.1:8787/admin.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
    listPendingItems,
    approvePendingItem,
    rejectPendingItem,
    loadQueue,
    getDataPaths
} = require('../lib/data-review');
const {
    maybeTriggerPublishSyncAfterApprove,
    publishReviewedDataToGit
} = require('../lib/publish-sync');

const ROOT = path.join(__dirname, '..');
const { loadLocalEnvFiles } = require('../lib/load-local-env');
let envFiles = loadLocalEnvFiles(ROOT);

const PORT = Number(process.env.ADMIN_REVIEW_PORT || 8787);
const PASSWORD = process.env.ADMIN_REVIEW_PASSWORD || '';
const ADMIN_BUILD_ID = '20260603-global-compliance-crawler-v1';
const LOG_PREFIX = '[GLOBAL-CRAWL]';

/** Re-read .env.local / .env so keys work without restart after file is created. */
function refreshLocalEnv() {
    envFiles = loadLocalEnvFiles(ROOT);
    return Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim());
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function isAuthorized(req) {
    if (!PASSWORD) {
        return false;
    }
    return getBearerToken(req) === PASSWORD;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') {
        urlPath = '/admin.html';
    }

    const relative = path.normalize(urlPath.replace(/^\//, '')).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(ROOT, relative);

    if (!filePath.startsWith(ROOT)) {
        sendJson(res, 403, { ok: false, error: 'Forbidden' });
        return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
}

function normalizeApiPath(url) {
    const raw = String(url || '').split('?')[0];
    const trimmed = raw.replace(/\/+$/, '') || '/';
    return trimmed;
}

async function handleApi(req, res) {
    const urlPath = normalizeApiPath(req.url);

    if (req.method === 'GET' && urlPath === '/api/review/health') {
        const dataPaths = getDataPaths();
        sendJson(res, 200, {
            ok: true,
            build: ADMIN_BUILD_ID,
            project_root: ROOT,
            data_paths: dataPaths,
            supported_kinds: ['tag', 'case', 'risk_signal'],
            password_required: Boolean(PASSWORD),
            test_crawl: '/api/test-crawl (GET/POST, global crawl engine)',
            engine: 'global-crawl-engine',
            engine_build: ADMIN_BUILD_ID,
            got_scraping: Boolean(require('fs').existsSync(path.join(ROOT, 'node_modules', 'got-scraping'))),
            deepseek_configured: refreshLocalEnv(),
            env_files_loaded: envFiles,
            env_local_exists: fs.existsSync(path.join(ROOT, '.env.local'))
        });
        return;
    }

    if (urlPath === '/api/test-crawl' && (req.method === 'GET' || req.method === 'POST')) {
        if (!isAuthorized(req)) {
            sendJson(res, 401, { ok: false, error: 'Unauthorized. Use review password Bearer token.' });
            return;
        }
        try {
            if (!refreshLocalEnv()) {
                sendJson(res, 400, {
                    ok: false,
                    error: 'DEEPSEEK_API_KEY is not configured. Create .env.local from .env.example, set DEEPSEEK_API_KEY=sk-..., then refresh this page or restart: npm run restart:admin',
                    changed: 0,
                    errors: 0,
                    deepseek_configured: false,
                    env_files_loaded: envFiles,
                    env_local_exists: fs.existsSync(path.join(ROOT, '.env.local'))
                });
                return;
            }
            const {
                runGlobalCrawlTest,
                ENGINE_BUILD_ID,
                parsePersistQueryFlag,
                buildCrawlTelemetry
            } = require('../lib/global-compliance-crawler');
            const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
            const persist = parsePersistQueryFlag(url.searchParams);
            console.log(`${LOG_PREFIX} [INFO] -> /api/test-crawl persist=${persist}`);
            const result = await runGlobalCrawlTest({
                dataDir: path.join(ROOT, 'data'),
                persist,
                label: 'admin-test-crawl'
            });
            const telemetry = buildCrawlTelemetry(result);
            const status = result.ok ? 200 : (telemetry.errors > 0 ? 502 : 200);
            sendJson(res, status, {
                ...result,
                changed: telemetry.changed,
                errors: telemetry.errors,
                telemetry,
                engine_build: ENGINE_BUILD_ID
            });
        } catch (error) {
            console.error('[GLOBAL-CRAWL] [FAIL] /api/test-crawl', error.message);
            sendJson(res, 500, { ok: false, error: error.message, engine_build: ADMIN_BUILD_ID });
        }
        return;
    }

    if (!isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized. Set Authorization: Bearer <ADMIN_REVIEW_PASSWORD>.' });
        return;
    }

    if (req.method === 'GET' && urlPath === '/api/review/pending') {
        const items = listPendingItems();
        const queue = loadQueue();
        sendJson(res, 200, {
            ok: true,
            updated_at: queue.updated_at,
            count: items.length,
            items
        });
        return;
    }

    if (req.method === 'POST' && (urlPath === '/api/review/approve' || urlPath === '/api/review/reject')) {
        let body;
        try {
            body = await readBody(req);
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message });
            return;
        }

        const pendingId = typeof body.pending_id === 'string' ? body.pending_id.trim() : '';
        if (!pendingId) {
            sendJson(res, 400, { ok: false, error: 'pending_id is required' });
            return;
        }

        if (urlPath.endsWith('/approve')) {
            let result;
            try {
                result = approvePendingItem(pendingId);
            } catch (error) {
                sendJson(res, 500, { ok: false, error: error.message });
                return;
            }
            if (result.ok) {
                const dataPaths = getDataPaths();
                result.written_paths = {
                    tags: dataPaths.prodTags,
                    cases: dataPaths.prodCases,
                    queue: dataPaths.queue,
                    catalog: path.join(dataPaths.root, 'data', 'catalog.json')
                };
                const sync = await maybeTriggerPublishSyncAfterApprove({ pendingId });
                result.sync = sync;
            }
            sendJson(res, result.ok ? 200 : 400, result);
            return;
        }

        const result = rejectPendingItem(pendingId);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }

    if (req.method === 'POST' && urlPath === '/api/review/publish-sync') {
        try {
            const body = await readBody(req);
            const dispatch = body.dispatch === true || process.env.PUBLISH_DISPATCH === '1';
            const result = await publishReviewedDataToGit({ dispatch });
            sendJson(res, 200, result);
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message });
        }
        return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/api/')) {
        await handleApi(req, res);
        return;
    }

    serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
    const dataPaths = getDataPaths();
    if (!PASSWORD) {
        console.warn('WARNING: ADMIN_REVIEW_PASSWORD is not set. All API calls will be rejected.');
        console.warn('Example: ADMIN_REVIEW_PASSWORD=your-secret node scripts/admin-server.js');
    }
    console.log(`Review admin listening on http://127.0.0.1:${PORT}/admin.html`);
    console.log(`Build: ${ADMIN_BUILD_ID}`);
    console.log(`Project root: ${ROOT}`);
    console.log(`Writes to: ${dataPaths.prodTags}`);
    console.log(`Pending queue: ${dataPaths.queue}`);
    console.log('Manual crawl test: GET/POST http://127.0.0.1:' + PORT + '/api/test-crawl?persist=1');
    if (envFiles.length > 0) {
        console.log(`Loaded env: ${envFiles.join(', ')}`);
    }
    if (refreshLocalEnv()) {
        console.log('DEEPSEEK_API_KEY: configured (AI filter active)');
    } else {
        console.warn('DEEPSEEK_API_KEY: NOT SET — create .env.local from .env.example, then npm run restart:admin');
    }
});
