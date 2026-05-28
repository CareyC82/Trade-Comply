loadIncotermData();

/**
 * Deep-link from hscode.html: index.html?search=81099000&direction=import
 * Must read query BEFORE any history.replaceState that strips URL params.
 * Parser lives in lib/deep-link.js (global TradeComplyDeepLink).
 */
function normalizeInboundDirection(value) {
    return globalThis.TradeComplyDeepLink.normalizeInboundDirection(value);
}

function getInboundDeepLink() {
    return globalThis.TradeComplyDeepLink.getInboundDeepLinkFromSearch(window.location.search);
}

function applyInboundDirection(direction) {
    const safeDirection = normalizeInboundDirection(direction);
    setDirection(safeDirection);

    const exportBtn = document.getElementById('direction-export');
    const importBtn = document.getElementById('direction-import');

    if (safeDirection === 'import') {
        importBtn?.click();
    } else {
        exportBtn?.click();
    }
}

function handleInboundSearchFromUrl(inboundQuery, inboundDirection, inboundCountry) {
    const query = (inboundQuery || '').trim();
    if (!query) {
        return;
    }

    showView('electronics', false);
    applyInboundDirection(inboundDirection);
    if (typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection(inboundDirection, inboundCountry);
    } else if (inboundCountry) {
        setTradeCountry(inboundCountry);
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = query;
    }

    searchProducts(query);

    const cleanUrl = `${window.location.pathname}#electronics`;
    history.replaceState({ view: 'result' }, '', cleanUrl);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initData();

    const { query: inboundQuery, direction: inboundDirection, country: inboundCountry } = getInboundDeepLink();

    bindEvents();
    applyUiStrings();
    if (typeof bindTradeCountryControls === 'function') {
        bindTradeCountryControls();
    }
    if (typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection(AppState.currentDirection || 'export', inboundCountry);
    }

    if (inboundQuery) {
        handleInboundSearchFromUrl(inboundQuery, inboundDirection, inboundCountry);
        return;
    }

    initViewHistory();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }
});
