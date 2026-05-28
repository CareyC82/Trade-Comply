/**
 * Human-in-the-loop review queue: stage AI output in pending_data, publish to prod on approve.
 *
 * Production (prod_data) — served by index.html:
 *   data/tags.json, data/cases.json, data/catalog.json (built from prod sources)
 *
 * Staging (pending_data):
 *   data/pending_data/queue.json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function getDataRoot() {
    return process.env.DATA_REVIEW_ROOT || ROOT;
}

function getDataPaths() {
    const dataRoot = getDataRoot();
    return {
        root: dataRoot,
        queue: path.join(dataRoot, 'data', 'pending_data', 'queue.json'),
        prodTags: path.join(dataRoot, 'data', 'tags.json'),
        prodCases: path.join(dataRoot, 'data', 'cases.json'),
        catalogScript: path.join(ROOT, 'scripts', 'build-catalog.js')
    };
}

function paths() {
    return getDataPaths();
}

const EMPTY_QUEUE = {
    version: 1,
    updated_at: null,
    items: []
};

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        if (fallback !== undefined) {
            return fallback;
        }
        throw error;
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createPendingId() {
    const suffix = crypto.randomBytes(4).toString('hex');
    return `pend_${Date.now()}_${suffix}`;
}

function loadQueue() {
    const { queue: QUEUE_PATH } = paths();
    if (!fs.existsSync(QUEUE_PATH)) {
        return { ...EMPTY_QUEUE, updated_at: new Date().toISOString() };
    }
    const queue = readJson(QUEUE_PATH, { ...EMPTY_QUEUE });
    if (!Array.isArray(queue.items)) {
        queue.items = [];
    }
    if (!queue.version) {
        queue.version = 1;
    }
    return queue;
}

function saveQueue(queue) {
    const { queue: QUEUE_PATH } = paths();
    queue.updated_at = new Date().toISOString();
    writeJson(QUEUE_PATH, queue);
}

function loadProdTags() {
    return readJson(paths().prodTags, []);
}

function loadProdCases() {
    return readJson(paths().prodCases, []);
}

function writeProdTags(tags) {
    writeJson(paths().prodTags, tags);
}

function writeProdCases(cases) {
    writeJson(paths().prodCases, cases);
}

function collectProdTagIds() {
    return new Set(loadProdTags().map(tag => tag.tag_id).filter(Boolean));
}

function collectProdCaseIds() {
    return new Set(loadProdCases().map(caseItem => caseItem.case_id).filter(Boolean));
}

function collectPendingEntityIds(queue = loadQueue()) {
    const tagIds = new Set();
    const caseIds = new Set();
    for (const item of queue.items) {
        if (item.status && item.status !== 'pending') {
            continue;
        }
        if (item.kind === 'tag' && item.payload?.tag_id) {
            tagIds.add(item.payload.tag_id);
        }
        if (item.kind === 'case' && item.payload?.case_id) {
            caseIds.add(item.payload.case_id);
        }
    }
    return { tagIds, caseIds };
}

function createPendingItem({ kind, payload, meta = {}, source = 'policy-tracker' }) {
    return {
        pending_id: createPendingId(),
        kind,
        action: 'create',
        status: 'pending',
        submitted_at: new Date().toISOString(),
        source,
        meta,
        payload
    };
}

/**
 * Append proposed tags/cases to the review queue (does not touch prod files).
 */
function stagePendingItems({ tags = [], cases = [], meta = {}, source = 'policy-tracker' } = {}) {
    const queue = loadQueue();
    const prodTagIds = collectProdTagIds();
    const prodCaseIds = collectProdCaseIds();
    const pendingIds = collectPendingEntityIds(queue);
    const staged = [];
    const skipped = [];

    for (const tag of tags) {
        const tagId = tag?.tag_id;
        if (!tagId) {
            skipped.push({ kind: 'tag', reason: 'Missing tag_id' });
            continue;
        }
        if (prodTagIds.has(tagId) || pendingIds.tagIds.has(tagId)) {
            skipped.push({ kind: 'tag', tag_id: tagId, reason: 'Already in prod or pending queue' });
            continue;
        }
        const item = createPendingItem({ kind: 'tag', payload: tag, meta, source });
        queue.items.push(item);
        pendingIds.tagIds.add(tagId);
        staged.push(item);
    }

    for (const caseItem of cases) {
        const caseId = caseItem?.case_id;
        if (!caseId) {
            skipped.push({ kind: 'case', reason: 'Missing case_id' });
            continue;
        }
        if (prodCaseIds.has(caseId) || pendingIds.caseIds.has(caseId)) {
            skipped.push({ kind: 'case', case_id: caseId, reason: 'Already in prod or pending queue' });
            continue;
        }
        const item = createPendingItem({ kind: 'case', payload: caseItem, meta, source });
        queue.items.push(item);
        pendingIds.caseIds.add(caseId);
        staged.push(item);
    }

    if (staged.length > 0) {
        saveQueue(queue);
    }

    return { staged, skipped, queue };
}

function listPendingItems() {
    const queue = loadQueue();
    return queue.items.filter(item => !item.status || item.status === 'pending');
}

function findPendingItem(queue, pendingId) {
    const index = queue.items.findIndex(
        item => item.pending_id === pendingId && (!item.status || item.status === 'pending')
    );
    if (index < 0) {
        return null;
    }
    return { item: queue.items[index], index };
}

function rebuildCatalog() {
    const { root: dataRoot, catalogScript } = paths();
    const result = spawnSync(process.execPath, [catalogScript], {
        cwd: dataRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        env: {
            ...process.env,
            DATA_REVIEW_ROOT: dataRoot
        }
    });
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(`Catalog rebuild failed: ${detail || `exit ${result.status}`}`);
    }
}

function approvePendingItem(pendingId, { rebuildCatalog: shouldRebuild = true } = {}) {
    const queue = loadQueue();
    const found = findPendingItem(queue, pendingId);
    if (!found) {
        return { ok: false, error: `Pending item not found: ${pendingId}` };
    }

    const { item } = found;
    let published;

    if (item.kind === 'tag') {
        const tags = loadProdTags();
        const tagId = item.payload?.tag_id;
        if (!tagId) {
            return { ok: false, error: 'Pending tag payload is missing tag_id' };
        }
        if (tags.some(tag => tag.tag_id === tagId)) {
            queue.items.splice(found.index, 1);
            saveQueue(queue);
            return { ok: false, error: `Tag ${tagId} already exists in production` };
        }
        tags.push(item.payload);
        writeProdTags(tags);
        published = { kind: 'tag', tag_id: tagId };
    } else if (item.kind === 'case') {
        const cases = loadProdCases();
        const caseId = item.payload?.case_id;
        if (!caseId) {
            return { ok: false, error: 'Pending case payload is missing case_id' };
        }
        if (cases.some(caseItem => caseItem.case_id === caseId)) {
            queue.items.splice(found.index, 1);
            saveQueue(queue);
            return { ok: false, error: `Case ${caseId} already exists in production` };
        }
        cases.push(item.payload);
        writeProdCases(cases);
        published = { kind: 'case', case_id: caseId };
    } else {
        return { ok: false, error: `Unsupported pending kind: ${item.kind}` };
    }

    queue.items.splice(found.index, 1);
    saveQueue(queue);

    if (shouldRebuild) {
        rebuildCatalog();
    }

    return {
        ok: true,
        pending_id: pendingId,
        published,
        message: 'Approved and published to production.'
    };
}

function rejectPendingItem(pendingId) {
    const queue = loadQueue();
    const found = findPendingItem(queue, pendingId);
    if (!found) {
        return { ok: false, error: `Pending item not found: ${pendingId}` };
    }

    const removed = queue.items.splice(found.index, 1)[0];
    saveQueue(queue);

    return {
        ok: true,
        pending_id: pendingId,
        removed: {
            kind: removed.kind,
            id: removed.payload?.tag_id || removed.payload?.case_id || null
        },
        message: 'Rejected and removed from pending queue.'
    };
}

module.exports = {
    ROOT,
    getDataRoot,
    getDataPaths,
    loadQueue,
    saveQueue,
    listPendingItems,
    stagePendingItems,
    approvePendingItem,
    rejectPendingItem,
    rebuildCatalog
};
