/**
 * Data loading — fetch JSON and hydrate AppState (no DOM rendering).
 */
'use strict';

function withDataCacheBust(url) {
    const build = globalThis.TradeComplyBuild || '';
    if (!build || !url || /\?/.test(url)) {
        return url;
    }
    return `${url}?v=${encodeURIComponent(build)}`;
}

async function fetchJsonSafe(url, fallbackValue = []) {
    try {
        const response = await fetch(withDataCacheBust(url));
        if (!response.ok) {
            throw new Error(`Status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.warn(`⚠️ Failed to load ${url}, using fallback value. Error:`, err);
        return fallbackValue;
    }
}

async function loadApplicationDataBundle() {
    const [
        tags,
        cases,
        quickActions,
        kb,
        categories,
        updates,
        catalogSchema,
        scopeConfig,
        catalogArtifact,
        coverageMatrix
    ] = await Promise.all([
        fetchJsonSafe('data/tags.json', []),
        fetchJsonSafe('data/cases.json', []),
        fetchJsonSafe('data/quick-actions.json', []),
        fetchJsonSafe('data/knowledge-base.json', { categories: [] }),
        fetchJsonSafe('data/categories.json', []),
        fetchJsonSafe('data/updates.json', []),
        fetchJsonSafe('data/catalog.schema.json', {}),
        fetchJsonSafe('data/scope-keywords.json', {}),
        fetchJsonSafe('data/catalog.json', null),
        fetchJsonSafe('data/coverage-matrix.json', null)
    ]);

    if (coverageMatrix && globalThis.TradeComplyCountryRegistry?.setCoverageMatrix) {
        globalThis.TradeComplyCountryRegistry.setCoverageMatrix(coverageMatrix);
    }

    const enrichedTags = (tags || []).map((tag) => {
        if (typeof enrichTagForCountryPanel === 'function') {
            return enrichTagForCountryPanel(tag);
        }
        return tag;
    });

    let catalog = Catalog.hydrateScopeCatalog(catalogArtifact);
    if (!catalog || !catalog.keywordList.length) {
        catalog = Catalog.buildScopeCatalog({
            tags: enrichedTags,
            cases,
            categories,
            scopeConfig,
            catalogSchema
        });
        console.warn('catalog.json unavailable or empty; built scope catalog at runtime.');
    }

    return {
        data: {
            tags: enrichedTags,
            cases,
            categories,
            updates,
            quickActions,
            knowledgeBase: kb,
            catalogSchema,
            scopeConfig
        },
        catalog
    };
}

function hydrateAppStateFromBundle(bundle) {
    AppState.setData(bundle.data);
    AppState.setCatalog(bundle.catalog);
    return AppState;
}

if (typeof globalThis !== 'undefined') {
    globalThis.fetchJsonSafe = fetchJsonSafe;
    globalThis.loadApplicationDataBundle = loadApplicationDataBundle;
    globalThis.hydrateAppStateFromBundle = hydrateAppStateFromBundle;
}
