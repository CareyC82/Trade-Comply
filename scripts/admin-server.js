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
    loadQueue
} = require('../lib/data-review');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.ADMIN_REVIEW_PORT || 8787);
const PASSWORD = process.env.ADMIN_REVIEW_PASSWORD || '';

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

async function handleApi(req, res) {
    if (!isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized. Set Authorization: Bearer <ADMIN_REVIEW_PASSWORD>.' });
        return;
    }

    const urlPath = req.url.split('?')[0];

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

        const result = urlPath.endsWith('/approve')
            ? approvePendingItem(pendingId)
            : rejectPendingItem(pendingId);

        sendJson(res, result.ok ? 200 : 400, result);
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
    if (!PASSWORD) {
        console.warn('WARNING: ADMIN_REVIEW_PASSWORD is not set. All API calls will be rejected.');
        console.warn('Example: ADMIN_REVIEW_PASSWORD=your-secret node scripts/admin-server.js');
    }
    console.log(`Review admin listening on http://127.0.0.1:${PORT}/admin.html`);
});
