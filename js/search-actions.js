/**
 * Search actions — run indexing + delegate to results orchestration (no DOM templates).
 */
'use strict';

function runProductSearch({ query, origin, precheckPanelId, fallbackLabel }) {
    AppState.setSearchOrigin(origin);
    const trimmedQuery = query ? query.trim() : '';
    const manualSelections = getPrecheckSelections(precheckPanelId);
    const intelligence = globalThis.TradeComplyProductIntelligence?.prepareIntelligentSearch
        ? globalThis.TradeComplyProductIntelligence.prepareIntelligentSearch(
            trimmedQuery,
            manualSelections,
            globalThis.PRECHECK_FACTORS || PRECHECK_FACTORS,
            {
                direction: AppState.currentDirection || 'export',
                country: AppState.currentCountry || 'US',
                from: AppState.routeFromCountry || 'CN',
                to: AppState.routeToCountry || 'US',
                focus: AppState.complianceFocus || 'import',
                vertical: origin
            }
        )
        : {
            expandedQuery: trimmedQuery,
            selections: manualSelections,
            profile: null
        };
    const selections = intelligence.selections || manualSelections;
    const searchQuery = intelligence.expandedQuery || trimmedQuery;
    const results = searchWithPrecheck(searchQuery, selections, search, trimmedQuery);
    const displayQuery = trimmedQuery || fallbackLabel || t('allProducts');

    AppState.setLastSearch({
        query: displayQuery,
        tagCount: results.tags.length,
        caseCount: results.cases.length
    });
    AppState.productIntelligence = intelligence.profile || null;

    renderResults(displayQuery, results.tags, results.cases, selections);
}

function searchProducts(query) {
    runProductSearch({
        query,
        origin: 'electronics',
        precheckPanelId: 'precheck-panel',
        fallbackLabel: t('allProducts')
    });
}

function searchEnergyProducts(query) {
    runProductSearch({
        query,
        origin: 'new-energy',
        precheckPanelId: 'energy-precheck-panel',
        fallbackLabel: t('newEnergyProducts')
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.runProductSearch = runProductSearch;
    globalThis.searchProducts = searchProducts;
    globalThis.searchEnergyProducts = searchEnergyProducts;
}
