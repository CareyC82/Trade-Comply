/**
 * Step 3 — Pipeline glue: refineWithAI → hash gate → tags.json (grouped by impact country).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { refineWithAI } = require('./policy-ai-filter');
const {
    expandRoutesFromAiVerdict,
    applyRoutesToTags,
    computeRouteHash,
    loadMatrixManifest,
    saveMatrixManifest,
    readTags,
    getDefaultTagsPath
} = require('./global-policy-matrix');

const IMPACT_COUNTRY_KEYS = ['CN', 'US', 'EU'];

/** Console skip line (Step 3 contract). */
function formatPolicySkipLog(sourceId) {
    return `[SKIP] [${sourceId}] Non-relevant policy or administrative noise.`;
}

/** @deprecated */
const GLOBAL_CRAWL_SKIP_NOTE = 'Non-relevant policy or administrative noise.';

function hashRawContent(text) {
    return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function resolveContentHash(rawBundle) {
    if (rawBundle?.content_hash) {
        return rawBundle.content_hash;
    }
    return hashRawContent(rawBundle?.rawText || '');
}

function ensureManifestCountryBuckets(manifest) {
    if (!manifest.by_country || typeof manifest.by_country !== 'object') {
        manifest.by_country = {};
    }
    for (const code of IMPACT_COUNTRY_KEYS) {
        if (!manifest.by_country[code]) {
            manifest.by_country[code] = { routes: {} };
        }
        if (!manifest.by_country[code].routes) {
            manifest.by_country[code].routes = {};
        }
    }
    return manifest.by_country;
}

function syncRouteToCountryBucket(manifest, route, routeHash, manifestEntry) {
    const buckets = ensureManifestCountryBuckets(manifest);
    const country = route.impactCountry;
    if (!buckets[country]) {
        buckets[country] = { routes: {} };
    }
    buckets[country].routes[route.routeKey] = {
        ...manifestEntry,
        route_hash: routeHash,
        impact_country: country
    };
}

/**
 * Build English policy view grouped by AI impact_countries (for manifest + optional export).
 */
function buildCountryGroupedPolicyIndex(tags) {
    const grouped = {
        schema_version: '1.0',
        updated_at: new Date().toISOString(),
        CN: [],
        US: [],
        EU: []
    };

    for (const tag of tags) {
        if (!String(tag.tag_id || '').startsWith('CL-GLPOL-')) {
            continue;
        }
        const country = String(tag.country || tag.policy_tracker?.impact_country || '').toUpperCase();
        if (!grouped[country]) {
            continue;
        }
        grouped[country].push({
            tag_id: tag.tag_id,
            country,
            industry: tag.policy_tracker?.industry || null,
            direction: tag.policy_tracker?.direction || tag.direction,
            summary_en: tag.content_en || tag.short_description || '',
            source_url: tag.source_url || '',
            source_id: tag.policy_tracker?.source_id || null,
            effective_date: tag.effective_date || null,
            route_hash: tag.policy_tracker?.route_hash || null,
            updated_at: tag.policy_tracker?.updated_at || null
        });
    }

    return grouped;
}

function logPolicySkip(sourceId, logger) {
    const line = formatPolicySkipLog(sourceId);
    if (logger?.skip) {
        logger.skip(line.replace(/^\[SKIP\] /, ''));
    } else {
        console.log(line);
    }
}

/**
 * Step 3 glue — fetch bundle → refineWithAI → skip or hash-gated tags.json write.
 */
async function processSourceThroughRefiner({
    entry,
    rawBundle,
    tags,
    manifest,
    evaluateRelevance,
    logger,
    options = {}
}) {
    const sourceConfig = {
        id: entry.id,
        country: entry.country,
        type: entry.type,
        url: rawBundle.fetched_url || entry.url,
        method: entry.method,
        label: entry.label
    };

    const aiOptions = {
        offline: Boolean(options.offlineAiFilter),
        offlineFixturePath: options.offlineAiFilterFixturePath,
        fallbackWithoutApiKey: options.aiFilterFallbackWithoutApiKey
    };

    let aiVerdict;
    try {
        if (evaluateRelevance && evaluateRelevance !== refineWithAI) {
            aiVerdict = await evaluateRelevance({
                sourceId: entry.id,
                sourceLabel: entry.label,
                sourceUrl: sourceConfig.url,
                sourceCountry: entry.country,
                sourceType: entry.type,
                text: rawBundle.rawText,
                ...aiOptions
            });
        } else {
            aiVerdict = await refineWithAI(rawBundle.rawText, sourceConfig, aiOptions);
        }
    } catch (error) {
        if (logger?.fail) {
            logger.fail(`country=${entry.country} source=${entry.id} AI error: ${error.message}`);
        }
        aiVerdict = {
            relevant: false,
            impact_countries: [],
            direction: 'BOTH',
            industry: 'None',
            summary_en: '',
            method: 'error'
        };
    }

    if (logger?.aiEval) {
        logger.aiEval(entry.id, aiVerdict);
    } else if (logger?.classify) {
        logger.classify(entry, aiVerdict);
    }

    if (!aiVerdict.relevant) {
        logPolicySkip(entry.id, logger);
        return {
            skipped: true,
            relevant: false,
            ai: aiVerdict,
            skip_log: formatPolicySkipLog(entry.id)
        };
    }

    return applyRelevantVerdictToStorage(entry, aiVerdict, rawBundle, tags, manifest, {
        forceWrite: options.forceWrite === true,
        logger
    });
}

/**
 * Hash-gated upsert per impact_country route into flat tags.json + manifest.by_country.
 */
function applyRelevantVerdictToStorage(entry, aiVerdict, rawBundle, tags, manifest, options = {}) {
    const contentHash = resolveContentHash(rawBundle);
    const bundle = { ...rawBundle, content_hash: contentHash };
    const manifestRoutes = manifest.routes || (manifest.routes = {});

    const routes = expandRoutesFromAiVerdict(entry, aiVerdict, bundle);
    if (routes.length === 0) {
        return {
            skipped: false,
            relevant: true,
            ai: aiVerdict,
            routes: [],
            applied: [],
            unchanged: [],
            pipelineFragment: {
                relevant: true,
                route_count: 0,
                warning: 'AI relevant but no routable impact countries'
            }
        };
    }

    const { applied, skipped } = applyRoutesToTags(
        tags,
        routes,
        manifestRoutes,
        { force: options.forceWrite === true }
    );

    for (const item of applied) {
        const route = routes.find((row) => row.routeKey === item.route_key);
        if (!route) {
            continue;
        }
        const routeHash = computeRouteHash({
            contentHash: route.contentHash,
            summaryEn: route.summaryEn,
            sourceUrl: route.sourceUrl,
            industry: route.industry,
            direction: route.direction,
            impactCountry: route.impactCountry
        });
        const manifestEntry = manifestRoutes[route.routeKey];
        syncRouteToCountryBucket(manifest, route, routeHash, manifestEntry);
        if (options.logger?.success) {
            options.logger.success(
                `source=${entry.id} country=${route.impactCountry} tag=${item.tag_id}`
            );
        } else if (options.logger?.write) {
            options.logger.write(
                `source=${entry.id} country=${route.impactCountry} tag=${item.tag_id}`
            );
        }
    }

    manifest.grouped_policy_index = buildCountryGroupedPolicyIndex(tags);

    return {
        skipped: false,
        relevant: true,
        ai: aiVerdict,
        routes,
        applied,
        unchanged: skipped,
        content_hash: contentHash,
        pipelineFragment: {
            relevant: true,
            route_count: routes.length,
            routes_applied: applied,
            routes_unchanged: skipped,
            content_hash: contentHash,
            impact_countries: aiVerdict.impact_countries
        }
    };
}

function writeTagsAtomic(tagsPath, tags) {
    const dir = path.dirname(tagsPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${tagsPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(tags, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, tagsPath);
}

/**
 * Persist flat tags.json + manifest (includes by_country hash state).
 */
function persistGlobalEnglishDatabase({
    tagsPath,
    manifestPath,
    tags,
    manifest,
    tagsUpdated,
    rebuildCatalog = true
}) {
    const uniqueUpdates = [...new Set(tagsUpdated || [])];
    manifest.grouped_policy_index = buildCountryGroupedPolicyIndex(tags);

    if (uniqueUpdates.length === 0) {
        if (manifest?.routes && Object.keys(manifest.routes).length > 0) {
            saveMatrixManifest(manifestPath, manifest);
        }
        return { wrote_tags: false, tags_updated: [], catalog_warning: null };
    }

    const { migrateLegacyGlobalPolicyTags } = require('./global-policy-matrix');
    migrateLegacyGlobalPolicyTags(tags, manifest);

    writeTagsAtomic(tagsPath, tags);
    saveMatrixManifest(manifestPath, manifest);

    let catalogWarning = null;
    if (rebuildCatalog) {
        try {
            const { rebuildCatalog: rebuild } = require('./data-review');
            rebuild();
        } catch (error) {
            catalogWarning = error.message;
            console.warn(`WARN: catalog rebuild: ${catalogWarning}`);
        }
    }

    return {
        wrote_tags: true,
        tags_updated: uniqueUpdates,
        catalog_warning: catalogWarning,
        by_country: manifest.by_country
    };
}

function initStorageContext(dataDir, options = {}) {
    const rel = String(options.matrix_manifest_path || 'global-crawl-manifest.json').replace(/^data\//, '');
    const manifestPath = options.manifestPath || path.join(dataDir, rel);
    const tagsPath = options.tagsPath || getDefaultTagsPath();
    const persist = options.persist !== false;
    const manifest = persist
        ? loadMatrixManifest(manifestPath)
        : { schema_version: '1.0', updated_at: null, routes: {}, by_country: {} };

    ensureManifestCountryBuckets(manifest);

    return {
        persist,
        tagsPath,
        manifestPath,
        tags: persist ? readTags(tagsPath) : [],
        manifest
    };
}

/** @deprecated */
function recordSkippedSource(entry, aiVerdict, logger) {
    logPolicySkip(entry?.id || 'unknown', logger);
    return {
        skipped: true,
        relevant: false,
        ai: aiVerdict,
        skip_reason: GLOBAL_CRAWL_SKIP_NOTE,
        skip_log: formatPolicySkipLog(entry?.id || 'unknown'),
        source_id: entry?.id
    };
}

module.exports = {
    IMPACT_COUNTRY_KEYS,
    GLOBAL_CRAWL_SKIP_NOTE,
    formatPolicySkipLog,
    hashRawContent,
    resolveContentHash,
    logPolicySkip,
    recordSkippedSource,
    processSourceThroughRefiner,
    applyRelevantVerdictToStorage,
    buildCountryGroupedPolicyIndex,
    writeTagsAtomic,
    persistGlobalEnglishDatabase,
    initStorageContext,
    readTags,
    loadMatrixManifest,
    saveMatrixManifest,
    getDefaultTagsPath
};
