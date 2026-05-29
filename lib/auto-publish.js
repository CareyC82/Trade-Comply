/**
 * Auto-publish validated pipeline/policy data to production JSON files.
 */

const fs = require('fs');
const path = require('path');
const { validateDataSchema, partitionByGuardrail } = require('./data-guardrail');
const { riskSignalToTag } = require('./risk-signal');
const { rebuildCatalog, getDataPaths } = require('./data-review');

const EMPTY_INTERCEPTED = {
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

function getInterceptedPath() {
    return path.join(getDataPaths().root, 'data', 'pending_data.json');
}

function loadInterceptedStore() {
    const filePath = getInterceptedPath();
    if (!fs.existsSync(filePath)) {
        return { ...EMPTY_INTERCEPTED };
    }
    const store = readJson(filePath, { ...EMPTY_INTERCEPTED });
    if (!Array.isArray(store.items)) {
        store.items = [];
    }
    store.version = store.version || 1;
    return store;
}

function appendInterceptedRows(rows, { source = 'guardrail', meta = {} } = {}) {
    if (!rows.length) {
        return { appended: 0 };
    }

    const store = loadInterceptedStore();
    const timestamp = new Date().toISOString();

    for (const row of rows) {
        store.items.push({
            intercepted_at: timestamp,
            source,
            meta,
            kind: row.kind || 'risk_signal',
            reasons: row.reasons || [],
            raw: row.raw || row
        });
    }

    store.updated_at = timestamp;
    writeJson(getInterceptedPath(), store);
    return { appended: rows.length, total: store.items.length };
}

function loadProdTags() {
    return readJson(getDataPaths().prodTags, []);
}

function loadProdCases() {
    return readJson(getDataPaths().prodCases, []);
}

function writeProdTags(tags) {
    writeJson(getDataPaths().prodTags, tags);
}

function writeProdCases(cases) {
    writeJson(getDataPaths().prodCases, cases);
}

function mergeUniqueById(existing, incoming, idKey) {
    const ids = new Set(existing.map((row) => row[idKey]).filter(Boolean));
    const added = [];

    for (const row of incoming) {
        const id = row[idKey];
        if (!id || ids.has(id)) {
            continue;
        }
        ids.add(id);
        added.push(row);
        existing.push(row);
    }

    return added;
}

/**
 * Validate and publish rows to prod. Intercepted rows go to data/pending_data.json.
 */
function autoPublishBatch({
    risk_signals = [],
    tags = [],
    cases = [],
    source = 'auto-publish',
    meta = {}
} = {}) {
    const signalPartition = partitionByGuardrail(risk_signals, 'risk_signal');
    const tagPartition = partitionByGuardrail(tags, 'tag');
    const casePartition = partitionByGuardrail(cases, 'case');

    const intercepted = [
        ...signalPartition.intercepted,
        ...tagPartition.intercepted,
        ...casePartition.intercepted
    ];

    const tagsToAdd = tagPartition.passed.map((tag) => ({ ...tag }));
    for (const signal of signalPartition.passed) {
        tagsToAdd.push(riskSignalToTag(signal));
    }

    const prodTags = loadProdTags();
    const prodCases = loadProdCases();

    const publishedTags = mergeUniqueById(prodTags, tagsToAdd, 'tag_id');
    const publishedCases = mergeUniqueById(prodCases, casePartition.passed, 'case_id');

    if (publishedTags.length > 0) {
        writeProdTags(prodTags);
    }
    if (publishedCases.length > 0) {
        writeProdCases(prodCases);
    }

    let catalogWarning = null;
    if (publishedTags.length > 0 || publishedCases.length > 0) {
        try {
            rebuildCatalog();
        } catch (error) {
            catalogWarning = error.message;
        }
    }

    const interceptResult = appendInterceptedRows(intercepted, { source, meta });

    return {
        ok: true,
        published: {
            tags: publishedTags.map((tag) => tag.tag_id),
            cases: publishedCases.map((caseItem) => caseItem.case_id)
        },
        counts: {
            published_tags: publishedTags.length,
            published_cases: publishedCases.length,
            intercepted: intercepted.length,
            skipped_duplicates: tagsToAdd.length - publishedTags.length
        },
        intercepted,
        intercept_store: interceptResult,
        catalog_warning: catalogWarning,
        paths_touched: [
            ...(publishedTags.length ? ['data/tags.json'] : []),
            ...(publishedCases.length ? ['data/cases.json'] : []),
            ...(publishedTags.length || publishedCases.length ? ['data/catalog.json'] : []),
            ...(intercepted.length ? ['data/pending_data.json'] : [])
        ]
    };
}

module.exports = {
    autoPublishBatch,
    appendInterceptedRows,
    loadInterceptedStore,
    getInterceptedPath
};
