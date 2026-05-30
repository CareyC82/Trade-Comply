/**
 * Country × industry × direction routing for global policy tags in data/tags.json.
 */
'use strict';

const crypto = require('crypto');
const { buildCrawlComplianceAudit, attachAuditToManifestEntry } = require('./compliance-audit');
const fs = require('fs');
const { getDataPaths } = require('./data-review');
const { INDUSTRY_PULSE_TAGS } = require('./policy-industry-tags');

const MATRIX_COUNTRIES = new Set(['CN', 'US', 'EU', 'GLOBAL']);
/** Catalog schema: ^CL-[A-Z]+-\\d+$ (see data/catalog.schema.json) */
const CATALOG_TAG_FAMILY = 'GLPOL';
const COUNTRY_DIGIT = { CN: 1, US: 2, EU: 3, GLOBAL: 9 };
const INDUSTRY_DIGIT = { Electronics: 1, 'New Energy': 2, Semiconductor: 3 };
const DIRECTION_DIGIT = { IMPORT: 1, EXPORT: 2, BOTH: 3 };

/** @deprecated Old matrix ids (invalid for catalog) → new ids */
const LEGACY_MATRIX_TAG_MAP = {
    'CL-GLOBAL-CN-ELEC-IMP': 'CL-GLPOL-111',
    'CL-GLOBAL-CN-ELEC-EXP': 'CL-GLPOL-112',
    'CL-GLOBAL-CN-ELEC-BOT': 'CL-GLPOL-113',
    'CL-GLOBAL-CN-ENERGY-IMP': 'CL-GLPOL-121',
    'CL-GLOBAL-CN-ENERGY-EXP': 'CL-GLPOL-122',
    'CL-GLOBAL-CN-ENERGY-BOT': 'CL-GLPOL-123',
    'CL-GLOBAL-CN-SEMI-IMP': 'CL-GLPOL-131',
    'CL-GLOBAL-CN-SEMI-EXP': 'CL-GLPOL-132',
    'CL-GLOBAL-CN-SEMI-BOT': 'CL-GLPOL-133',
    'CL-GLOBAL-US-ELEC-IMP': 'CL-GLPOL-211',
    'CL-GLOBAL-US-ELEC-EXP': 'CL-GLPOL-212',
    'CL-GLOBAL-US-ELEC-BOT': 'CL-GLPOL-213',
    'CL-GLOBAL-US-ENERGY-IMP': 'CL-GLPOL-221',
    'CL-GLOBAL-US-ENERGY-EXP': 'CL-GLPOL-222',
    'CL-GLOBAL-US-ENERGY-BOT': 'CL-GLPOL-223',
    'CL-GLOBAL-US-SEMI-IMP': 'CL-GLPOL-231',
    'CL-GLOBAL-US-SEMI-EXP': 'CL-GLPOL-232',
    'CL-GLOBAL-US-SEMI-BOT': 'CL-GLPOL-233',
    'CL-GLOBAL-EU-ELEC-IMP': 'CL-GLPOL-311',
    'CL-GLOBAL-EU-ELEC-EXP': 'CL-GLPOL-312',
    'CL-GLOBAL-EU-ELEC-BOT': 'CL-GLPOL-313',
    'CL-GLOBAL-EU-ENERGY-IMP': 'CL-GLPOL-321',
    'CL-GLOBAL-EU-ENERGY-EXP': 'CL-GLPOL-322',
    'CL-GLOBAL-EU-ENERGY-BOT': 'CL-GLPOL-323',
    'CL-GLOBAL-EU-SEMI-IMP': 'CL-GLPOL-331',
    'CL-GLOBAL-EU-SEMI-EXP': 'CL-GLPOL-332',
    'CL-GLOBAL-EU-SEMI-BOT': 'CL-GLPOL-333',
    'CL-GLOBAL-GLOBAL-ELEC-IMP': 'CL-GLPOL-911',
    'CL-GLOBAL-GLOBAL-ELEC-EXP': 'CL-GLPOL-912',
    'CL-GLOBAL-GLOBAL-ELEC-BOT': 'CL-GLPOL-913',
    'CL-GLOBAL-GLOBAL-ENERGY-IMP': 'CL-GLPOL-921',
    'CL-GLOBAL-GLOBAL-ENERGY-EXP': 'CL-GLPOL-922',
    'CL-GLOBAL-GLOBAL-ENERGY-BOT': 'CL-GLPOL-923',
    'CL-GLOBAL-GLOBAL-SEMI-IMP': 'CL-GLPOL-931',
    'CL-GLOBAL-GLOBAL-SEMI-EXP': 'CL-GLPOL-932',
    'CL-GLOBAL-GLOBAL-SEMI-BOT': 'CL-GLPOL-933'
};

function normalizeMatrixCountry(code) {
    const upper = String(code || '').trim().toUpperCase();
    if (MATRIX_COUNTRIES.has(upper)) {
        return upper;
    }
    return 'GLOBAL';
}

function normalizeTagDirection(direction) {
    const upper = String(direction || 'BOTH').trim().toUpperCase();
    if (upper === 'IMPORT') {
        return 'import';
    }
    if (upper === 'EXPORT') {
        return 'export';
    }
    return 'both';
}

/**
 * Deterministic catalog-valid tag_id: CL-GLPOL-{CCC}
 * CCC = countryDigit*100 + industryDigit*10 + directionDigit
 * (matches ^CL-[A-Z]+-\\d+$ in catalog.schema.json)
 */
function buildMatrixTagId(impactCountry, industry, direction) {
    const country = normalizeMatrixCountry(impactCountry);
    const countryDigit = COUNTRY_DIGIT[country];
    const industryDigit = INDUSTRY_DIGIT[industry];
    const directionDigit = DIRECTION_DIGIT[String(direction || 'BOTH').toUpperCase()] || 3;
    if (!countryDigit || !industryDigit) {
        return null;
    }
    const suffix = countryDigit * 100 + industryDigit * 10 + directionDigit;
    return `CL-${CATALOG_TAG_FAMILY}-${suffix}`;
}

function resolveCatalogTagId(tagId) {
    const upper = String(tagId || '').trim().toUpperCase();
    return LEGACY_MATRIX_TAG_MAP[upper] || upper;
}

function isCatalogValidTagId(tagId) {
    const pattern = /^CL-[A-Z]+-\d+$/;
    return pattern.test(String(tagId || '').trim());
}

function migrateLegacyGlobalPolicyTags(tags, manifest = null) {
    let tagMigrations = 0;
    for (const tag of tags) {
        const next = resolveCatalogTagId(tag.tag_id);
        if (next && next !== tag.tag_id) {
            tag.tag_id = next;
            tagMigrations += 1;
        }
    }

    if (!manifest) {
        return { tagMigrations, manifestMigrations: 0 };
    }

    let manifestMigrations = 0;
    const remapRoute = (routeKey, entry) => {
        if (!entry || !routeKey) {
            return;
        }
        const parts = String(routeKey).split('::');
        const oldTagId = parts.length > 1 ? parts[1] : entry.tag_id;
        const newTagId = resolveCatalogTagId(oldTagId);
        if (!newTagId || newTagId === oldTagId) {
            return;
        }
        const newRouteKey = `${parts[0]}::${newTagId}`;
        entry.tag_id = newTagId;
        entry.route_key = newRouteKey;
        manifestMigrations += 1;
        return { oldRouteKey: routeKey, newRouteKey, entry };
    };

    const routes = manifest.routes || {};
    const routeUpdates = [];
    for (const [key, entry] of Object.entries(routes)) {
        const update = remapRoute(key, entry);
        if (update) {
            routeUpdates.push(update);
        }
    }
    for (const update of routeUpdates) {
        delete routes[update.oldRouteKey];
        routes[update.newRouteKey] = update.entry;
    }

    if (manifest.by_country) {
        for (const bucket of Object.values(manifest.by_country)) {
            const countryRoutes = bucket?.routes || {};
            const countryUpdates = [];
            for (const [key, entry] of Object.entries(countryRoutes)) {
                const update = remapRoute(key, entry);
                if (update) {
                    countryUpdates.push(update);
                }
            }
            for (const update of countryUpdates) {
                delete countryRoutes[update.oldRouteKey];
                countryRoutes[update.newRouteKey] = update.entry;
            }
        }
    }

    return { tagMigrations, manifestMigrations };
}

function buildRouteKey(sourceId, impactCountry, industry, direction) {
    const tagId = buildMatrixTagId(impactCountry, industry, direction);
    if (!tagId) {
        return null;
    }
    return `${sourceId}::${tagId}`;
}

/**
 * Hash is tied to AI routing dimensions + publisher content fingerprint.
 */
function computeRouteHash({
    contentHash,
    summaryEn,
    sourceUrl,
    industry,
    direction,
    impactCountry
}) {
    const payload = [
        String(impactCountry || ''),
        String(industry || ''),
        String(direction || ''),
        String(contentHash || ''),
        String(summaryEn || '').trim(),
        String(sourceUrl || '').trim()
    ].join('|');
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function extractPublishedAt(rawText, fetchedAt) {
    const text = String(rawText || '');
    const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
        return isoMatch[0];
    }
    if (fetchedAt) {
        return String(fetchedAt).slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
}

function buildMatrixTag(row) {
    const template = INDUSTRY_PULSE_TAGS[row.industry];
    if (!template) {
        return null;
    }

    const tagId = buildMatrixTagId(row.impactCountry, row.industry, row.direction);
    if (!tagId) {
        return null;
    }

    const summary = String(row.summaryEn || '').trim();
    const direction = normalizeTagDirection(row.direction);
    const country = normalizeMatrixCountry(row.impactCountry);
    const publishedAt = row.publishedAt || new Date().toISOString().slice(0, 10);
    const audit = row.audit || buildCrawlComplianceAudit({
        sourceId: row.sourceId,
        publisherCountry: row.publisherCountry,
        sourceTypeHint: row.sourceType,
        aiVerdict: row.aiVerdict || {},
        fetchedAt: row.fetchedAt,
        verifiedAt: new Date().toISOString()
    });
    const legacyStatus = audit.effective_status === 'pending_effective' ? 'PENDING' : 'ACTIVE';

    return {
        tag_id: tagId,
        country,
        category: 'OTHER',
        category_label: 'Other Requirements',
        tag_type: 'MATCHED',
        short_name: `[Global Policy · ${country} · ${row.industry}]`,
        short_description: summary,
        description: summary,
        content_en: summary,
        content_zh: summary,
        source_citation: row.sourceLabel || 'Global policy tracker',
        source_url: row.sourceUrl || '',
        effective_date: publishedAt,
        status: legacyStatus,
        direction,
        related_hs_codes: [...template.related_hs_codes],
        related_keywords: [...template.related_keywords],
        display_order: 2,
        related_cases: [],
        last_verified_at: audit.last_verified_at,
        source_type: audit.source_type,
        jurisdiction: audit.jurisdiction,
        effective_status: audit.effective_status,
        review_status: audit.review_status,
        confidence_score: audit.confidence_score,
        policy_tracker: {
            source_id: row.sourceId,
            publisher_country: row.publisherCountry,
            impact_country: country,
            industry: row.industry,
            direction: row.direction,
            route_hash: row.routeHash,
            published_at: publishedAt,
            fetched_at: row.fetchedAt,
            updated_at: audit.last_verified_at,
            last_verified_at: audit.last_verified_at,
            source_type: audit.source_type,
            jurisdiction: audit.jurisdiction,
            effective_status: audit.effective_status,
            review_status: audit.review_status,
            confidence_score: audit.confidence_score
        }
    };
}

/**
 * Upsert one matrix cell in tags.json.
 */
function upsertGlobalPolicyMatrixTag(tags, row) {
    const payload = buildMatrixTag(row);
    if (!payload) {
        return null;
    }

    const index = tags.findIndex((tag) => tag.tag_id === payload.tag_id);
    if (index >= 0) {
        tags[index] = { ...tags[index], ...payload };
        return { updated: true, created: false, tag_id: payload.tag_id, route_key: row.routeKey };
    }

    tags.push(payload);
    return { updated: true, created: true, tag_id: payload.tag_id, route_key: row.routeKey };
}

function readTags(tagsPath) {
    if (!fs.existsSync(tagsPath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
}

function writeTags(tagsPath, tags) {
    const pathMod = require('path');
    fs.mkdirSync(pathMod.dirname(tagsPath), { recursive: true });
    fs.writeFileSync(tagsPath, `${JSON.stringify(tags, null, 2)}\n`, 'utf8');
}

/**
 * Expand AI verdict into routable matrix rows (one per impact country).
 */
function expandRoutesFromAiVerdict(entry, aiVerdict, fetchPayload) {
    if (!aiVerdict?.relevant) {
        return [];
    }

    const countries = Array.isArray(aiVerdict.impact_countries) && aiVerdict.impact_countries.length > 0
        ? aiVerdict.impact_countries
        : [entry.country || 'GLOBAL'];

    const routes = [];
    for (const impactCountry of countries) {
        const routeKey = buildRouteKey(entry.id, impactCountry, aiVerdict.industry, aiVerdict.direction);
        if (!routeKey) {
            continue;
        }
        const audit = buildCrawlComplianceAudit({
            sourceId: entry.id,
            publisherCountry: entry.country,
            sourceTypeHint: entry.type,
            aiVerdict,
            fetchedAt: fetchPayload.fetched_at,
            verifiedAt: aiVerdict.evaluated_at
        });
        routes.push({
            routeKey,
            sourceId: entry.id,
            publisherCountry: entry.country,
            sourceType: entry.type,
            impactCountry: normalizeMatrixCountry(impactCountry),
            industry: aiVerdict.industry,
            direction: aiVerdict.direction,
            summaryEn: aiVerdict.summary_en,
            sourceLabel: entry.label,
            sourceUrl: fetchPayload.fetched_url || entry.url,
            fetchedAt: fetchPayload.fetched_at,
            publishedAt: extractPublishedAt(fetchPayload.rawText, fetchPayload.fetched_at),
            contentHash: fetchPayload.content_hash,
            aiVerdict,
            audit
        });
    }
    return routes;
}

function applyRoutesToTags(tags, routes, manifestRoutes, { force = false } = {}) {
    const applied = [];
    const skipped = [];

    for (const route of routes) {
        const routeHash = computeRouteHash({
            contentHash: route.contentHash,
            summaryEn: route.summaryEn,
            sourceUrl: route.sourceUrl,
            industry: route.industry,
            direction: route.direction,
            impactCountry: route.impactCountry
        });
        route.routeHash = routeHash;

        const previous = manifestRoutes[route.routeKey];
        const changed = force || !previous || previous.route_hash !== routeHash;

        if (!changed) {
            skipped.push({ route_key: route.routeKey, tag_id: buildMatrixTagId(route.impactCountry, route.industry, route.direction) });
            continue;
        }

        const result = upsertGlobalPolicyMatrixTag(tags, route);
        if (!result) {
            continue;
        }

        manifestRoutes[route.routeKey] = attachAuditToManifestEntry({
            route_key: route.routeKey,
            tag_id: result.tag_id,
            route_hash: routeHash,
            source_id: route.sourceId,
            impact_country: route.impactCountry,
            industry: route.industry,
            direction: route.direction,
            source_url: route.sourceUrl,
            published_at: route.publishedAt,
            summary_en: route.summaryEn,
            updated_at: new Date().toISOString()
        }, route.audit);

        applied.push({
            ...result,
            route_hash: routeHash,
            impact_country: route.impactCountry,
            direction: route.direction,
            industry: route.industry
        });
    }

    return { applied, skipped };
}

function loadMatrixManifest(manifestPath) {
    if (!fs.existsSync(manifestPath)) {
        return { schema_version: '1.0', updated_at: null, routes: {} };
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function saveMatrixManifest(manifestPath, manifest) {
    manifest.updated_at = new Date().toISOString();
    const path = require('path');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

module.exports = {
    MATRIX_COUNTRIES,
    CATALOG_TAG_FAMILY,
    LEGACY_MATRIX_TAG_MAP,
    buildMatrixTagId,
    resolveCatalogTagId,
    isCatalogValidTagId,
    migrateLegacyGlobalPolicyTags,
    buildRouteKey,
    computeRouteHash,
    normalizeMatrixCountry,
    expandRoutesFromAiVerdict,
    upsertGlobalPolicyMatrixTag,
    applyRoutesToTags,
    loadMatrixManifest,
    saveMatrixManifest,
    readTags,
    writeTags,
    getDefaultTagsPath: () => getDataPaths().prodTags
};
