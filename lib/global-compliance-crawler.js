/**
 * Trade Comply — Global Compliance Crawler (unified production backend)
 *
 * English-only, configuration-driven pipeline (Steps 1–4):
 *
 *   Step 1  GLOBAL_CRAWL_SOURCES + multi-method fetch (global-crawl-main.js)
 *   Step 2  refineWithAI() DeepSeek universal refiner (policy-ai-filter.js)
 *   Step 3  Hash-gated tags.json writes by impact country (global-crawl-storage.js)
 *   Step 4  Admin manual route GET/POST /api/test-crawl?persist=1
 *
 * Local smoke test:
 *   ADMIN_REVIEW_PASSWORD=secret node scripts/admin-server.js
 *   curl -H "Authorization: Bearer secret" "http://127.0.0.1:8787/api/test-crawl?persist=1"
 */
'use strict';

const path = require('path');
const { loadLocalEnvFiles } = require('./load-local-env');
loadLocalEnvFiles(path.join(__dirname, '..'));

const {
    GLOBAL_CRAWL_SOURCES,
    getEnabledSources,
    runGlobalCrawlFetchAll
} = require('./global-crawl-main');
const { refineWithAI } = require('./policy-ai-filter');
const {
    formatPolicySkipLog,
    processSourceThroughRefiner,
    persistGlobalEnglishDatabase,
    initStorageContext
} = require('./global-crawl-storage');

const ENGINE_BUILD_ID = '20260603-global-compliance-crawler-v1';
const ENGINE_VERSION = '1.0.0';
const LOG_PREFIX = '[GLOBAL-CRAWL]';

// ---------------------------------------------------------------------------
// Step 4 — High-visibility console logger
// ---------------------------------------------------------------------------

function createGlobalCrawlLogger() {
    function emit(level, message) {
        console.log(`${LOG_PREFIX} [${level}] -> ${message}`);
    }

    return {
        banner(title) {
            console.log(`\n${LOG_PREFIX} ═══════════════════════════════════════════════════`);
            console.log(`${LOG_PREFIX}  ${title}`);
            console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
        },
        info(message) {
            emit('INFO', message);
        },
        /** Step 1 — before HTTP fetch */
        fetching(sourceId) {
            emit('FETCHING', `Triggering source: ${sourceId}`);
        },
        /** Legacy fetch hook */
        crawl(country, sourceId, transport) {
            this.fetching(sourceId);
            emit('FETCH', `country=${country} transport=${transport}`);
        },
        ok(message) {
            emit('OK', message);
        },
        warn(message) {
            console.warn(`${LOG_PREFIX} [WARN] -> ${message}`);
        },
        fail(message) {
            console.error(`${LOG_PREFIX} [FAIL] -> ${message}`);
        },
        skip(message) {
            emit('SKIP', message);
        },
        /** Step 2 — after refineWithAI */
        aiEval(sourceId, verdict) {
            emit(
                'AI-EVAL',
                `source=${sourceId} relevant=${Boolean(verdict?.relevant)} `
                + `industry=${verdict?.industry || 'None'} direction=${verdict?.direction || 'BOTH'}`
            );
            if (verdict?.relevant && verdict?.summary_en) {
                emit('AI-EVAL', `source=${sourceId} summary_en=${verdict.summary_en}`);
            }
        },
        /** Back-compat alias */
        classify(entry, verdict) {
            this.aiEval(entry?.id || 'unknown', verdict);
        },
        /** Step 3 — policy persisted */
        success(message) {
            emit('SUCCESS', message || 'Appended new regulatory policy to storage.');
        },
        write(message) {
            this.success(message);
        },
        unchanged(message) {
            emit('UNCHANGED', message);
        },
        summary({ changed, errors, skipped, unchanged, persist }) {
            console.log(`${LOG_PREFIX} ───────────────────────────────────────────────────`);
            emit(
                'SUMMARY',
                `changed=${changed} errors=${errors} skipped=${skipped} unchanged=${unchanged} persist=${persist}`
            );
            console.log(`${LOG_PREFIX} ───────────────────────────────────────────────────\n`);
        }
    };
}

// ---------------------------------------------------------------------------
// Step 3 — Pipeline loop (fetch → refineWithAI → storage)
// ---------------------------------------------------------------------------

async function runGlobalCrawlPipeline(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    const persist = options.persist !== false;
    const aiFilterEnabled = options.aiFilter !== false;
    const evaluateRelevance = options.evaluateRelevance || refineWithAI;
    const registry = options.sources || GLOBAL_CRAWL_SOURCES;
    const enabled = getEnabledSources(registry);
    const enabledById = Object.fromEntries(enabled.map((row) => [row.id, row]));
    const log = options.logger || createGlobalCrawlLogger();

    const storage = initStorageContext(dataDir, options);

    const legacyManifestPath = path.join(dataDir, 'inbox', 'manifest.json');
    let legacyManifest = { sources: {} };
    try {
        legacyManifest = JSON.parse(require('fs').readFileSync(legacyManifestPath, 'utf8'));
    } catch (error) {
        /* optional GAC cache */
    }

    if (log.banner) {
        log.banner(`Global Compliance Crawler · ${ENGINE_BUILD_ID}`);
    }
    if (log.info) {
        log.info(`persist=${persist} sources=${enabled.length} ai_filter=${aiFilterEnabled}`);
    }

    const fetchResult = options.fetchResult || await runGlobalCrawlFetchAll({
        sources: registry,
        manifestSources: legacyManifest.sources,
        logger: log
    });

    const sourceRows = [];
    const tagsUpdated = [];
    let skippedNoise = 0;
    let routesUnchanged = 0;
    const fetchErrors = fetchResult.errors || 0;

    for (const fetchRow of fetchResult.sources) {
        const pipelineRow = {
            id: fetchRow.id,
            country: fetchRow.country,
            type: fetchRow.type,
            ok: fetchRow.ok,
            skipped: false,
            relevant: false,
            routes_applied: [],
            routes_unchanged: []
        };

        if (!fetchRow.ok) {
            log.fail(`source=${fetchRow.id} ${fetchRow.error || 'fetch failed'}`);
            sourceRows.push(pipelineRow);
            continue;
        }

        const entry = enabledById[fetchRow.id];
        const rawBundle = fetchResult.rawTextStore[fetchRow.id];
        if (!entry || !rawBundle?.rawText) {
            pipelineRow.error = 'Missing raw text bundle';
            log.fail(`source=${fetchRow.id} ${pipelineRow.error}`);
            sourceRows.push(pipelineRow);
            continue;
        }

        let result;
        if (aiFilterEnabled) {
            result = await processSourceThroughRefiner({
                entry,
                rawBundle,
                tags: storage.tags,
                manifest: storage.manifest,
                evaluateRelevance,
                logger: log,
                options
            });
        } else {
            result = await processSourceThroughRefiner({
                entry,
                rawBundle,
                tags: storage.tags,
                manifest: storage.manifest,
                evaluateRelevance: async () => ({
                    relevant: true,
                    impact_countries: [entry.country],
                    direction: 'BOTH',
                    industry: 'Electronics',
                    summary_en: ''
                }),
                logger: log,
                options
            });
        }

        pipelineRow.ai = result.ai;

        if (result.skipped) {
            skippedNoise += 1;
            pipelineRow.skipped = true;
            pipelineRow.skip_log = result.skip_log || formatPolicySkipLog(entry.id);
            sourceRows.push(pipelineRow);
            continue;
        }

        pipelineRow.relevant = true;
        Object.assign(pipelineRow, result.pipelineFragment || {});
        pipelineRow.routes_applied = result.applied || [];
        pipelineRow.routes_unchanged = result.unchanged || [];
        routesUnchanged += (result.unchanged || []).length;

        for (const item of pipelineRow.routes_applied) {
            tagsUpdated.push(item.tag_id);
            log.success(`source=${entry.id} tag=${item.tag_id} country=${item.impact_country}`);
        }

        for (const item of pipelineRow.routes_unchanged) {
            log.unchanged(`source=${entry.id} route=${item.route_key} hash unchanged`);
        }

        sourceRows.push(pipelineRow);
    }

    let catalogWarning = null;
    if (storage.persist && tagsUpdated.length > 0) {
        const persistResult = persistGlobalEnglishDatabase({
            tagsPath: storage.tagsPath,
            manifestPath: storage.manifestPath,
            tags: storage.tags,
            manifest: storage.manifest,
            tagsUpdated,
            rebuildCatalog: options.rebuildCatalog !== false
        });
        catalogWarning = persistResult.catalog_warning;
    }

    const changedCount = tagsUpdated.length;

    return {
        ok: fetchErrors === 0 || sourceRows.some((row) => row.ok),
        message: changedCount > 0
            ? `Applied ${changedCount} policy update(s) to tags.json`
            : `No tags.json changes (${skippedNoise} skipped)`,
        fetch: fetchResult,
        sources: sourceRows,
        changed_count: changedCount,
        tags_updated: [...new Set(tagsUpdated)],
        skipped_noise: skippedNoise,
        routes_unchanged: routesUnchanged,
        fetch_errors: fetchErrors,
        persist,
        manifest_path: storage.persist ? storage.manifestPath : null,
        tags_path: storage.persist ? storage.tagsPath : null,
        by_country: storage.manifest.grouped_policy_index || null,
        catalog_warning: catalogWarning
    };
}

// ---------------------------------------------------------------------------
// Orchestration + API telemetry (Step 4)
// ---------------------------------------------------------------------------

function buildCrawlTelemetry(pipelineResult) {
    const changed = pipelineResult.changed ?? pipelineResult.changed_count ?? 0;
    const errors = pipelineResult.errors ?? pipelineResult.fetch_errors ?? 0;
    return {
        changed,
        errors,
        skipped: pipelineResult.skipped_noise ?? 0,
        unchanged: pipelineResult.routes_unchanged ?? 0,
        persist: Boolean(pipelineResult.persist)
    };
}

function mergePipelineReport(pipelineResult, registryById = {}) {
    const fetchById = Object.fromEntries(
        (pipelineResult.fetch?.sources || []).map((row) => [row.id, row])
    );

    return (pipelineResult.sources || []).map((row) => {
        const fetchRow = fetchById[row.id] || {};
        const meta = registryById[row.id] || {};
        const routesApplied = row.routes_applied || [];
        const ai = row.ai || {};

        return {
            id: row.id,
            country: row.country || fetchRow.country,
            type: row.type || fetchRow.type,
            label: meta.label || fetchRow.label,
            url: meta.url || fetchRow.url,
            ok: Boolean(row.ok),
            optional: Boolean(fetchRow.optional),
            error: row.error || fetchRow.error,
            fetched_at: fetchRow.fetched_at,
            fetched_url: fetchRow.fetched_url,
            byte_length: fetchRow.byte_length,
            content_hash: fetchRow.content_hash,
            transport: fetchRow.transport,
            changed: routesApplied.length > 0,
            relevant: Boolean(row.relevant),
            skipped: Boolean(row.skipped),
            skip_log: row.skip_log || null,
            ai_relevant: ai.relevant,
            ai_industry: ai.industry || 'None',
            ai_direction: ai.direction || 'BOTH',
            ai_impact_countries: ai.impact_countries || [],
            ai_summary_en: ai.summary_en || '',
            ai_filter_method: ai.method,
            routes_applied: routesApplied.map((r) => r.tag_id),
            preview: fetchRow.raw_text_preview || ''
        };
    });
}

/**
 * Run full global compliance network (Steps 1–3).
 */
async function runGlobalComplianceNetwork(options = {}) {
    const log = options.logger || createGlobalCrawlLogger();
    const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    const persist = options.persist !== false;
    const label = options.label || 'global-crawl';
    const registry = options.sources || GLOBAL_CRAWL_SOURCES;
    const enabled = getEnabledSources(registry);

    if (!process.env.DEEPSEEK_API_KEY && options.aiFilter !== false) {
        log.warn('DEEPSEEK_API_KEY not set — AI fail-closed; expect skips.');
    }

    const pipelineResult = await runGlobalCrawlPipeline({
        ...options,
        dataDir,
        persist,
        logger: log
    });

    const telemetry = buildCrawlTelemetry(pipelineResult);
    const sources = mergePipelineReport(
        pipelineResult,
        Object.fromEntries(enabled.map((entry) => [entry.id, entry]))
    );

    log.summary({
        changed: telemetry.changed,
        errors: telemetry.errors,
        skipped: telemetry.skipped,
        unchanged: telemetry.unchanged,
        persist: telemetry.persist
    });

    return {
        ok: pipelineResult.ok !== false,
        engine: 'global-crawl-engine',
        engine_build: ENGINE_BUILD_ID,
        engine_version: ENGINE_VERSION,
        message: pipelineResult.message,
        label,
        persist,
        ...telemetry,
        sources,
        changed_count: telemetry.changed,
        fetch_errors: telemetry.errors,
        changed_policies: sources.filter((row) => row.changed),
        tags_updated: pipelineResult.tags_updated || [],
        warnings: sources.filter((row) => !row.ok).map((row) => `${row.id}: ${row.error}`),
        manifest_path: pipelineResult.manifest_path,
        tags_path: pipelineResult.tags_path,
        by_country: pipelineResult.by_country,
        catalog_warning: pipelineResult.catalog_warning,
        global_sources_count: enabled.length
    };
}

/** Step 4 — Admin / CLI test entry (`?persist=1` writes tags.json). */
async function runGlobalCrawlTest(options = {}) {
    const persist = options.persist === true
        || options.persist === '1'
        || options.persist === 1;
    const log = options.logger || createGlobalCrawlLogger();
    log.info(`/api/test-crawl manual run · persist=${persist}`);
    return runGlobalComplianceNetwork({
        ...options,
        persist,
        label: options.label || 'test-crawl',
        logger: log
    });
}

function parsePersistQueryFlag(searchParams) {
    const value = String(searchParams?.get('persist') || '').trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
}

const runGlobalCrawlEngine = runGlobalComplianceNetwork;

module.exports = {
    ENGINE_BUILD_ID,
    ENGINE_VERSION,
    LOG_PREFIX,
    GLOBAL_CRAWL_SOURCES,
    createGlobalCrawlLogger,
    createEngineLogger: createGlobalCrawlLogger,
    runGlobalCrawlPipeline,
    runGlobalComplianceNetwork,
    runGlobalCrawlEngine,
    runGlobalCrawlTest,
    buildCrawlTelemetry,
    parsePersistQueryFlag,
    formatPolicySkipLog,
    refineWithAI
};
