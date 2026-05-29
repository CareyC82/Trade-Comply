/**
 * Trade Comply index app bootstrap (DOM ready).
 */

loadIncotermData();

function normalizeInboundDirection(value) {
    if (globalThis.TradeComplyDeepLink) {
        return globalThis.TradeComplyDeepLink.normalizeInboundDirection(value);
    }
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'import' ? 'import' : 'export';
}

function getInboundDeepLink() {
    if (globalThis.TradeComplyDeepLink) {
        return globalThis.TradeComplyDeepLink.getInboundDeepLinkFromSearch(window.location.search);
    }
    const params = new URLSearchParams(window.location.search);
    return {
        query: (params.get('search') || '').trim(),
        direction: normalizeInboundDirection(params.get('direction')),
        country: (params.get('country') || 'US').trim().toUpperCase()
    };
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

async function bootstrapTradeComplyIndex() {
    try {
        if (typeof initGlobalCollapsiblePanels === 'function') {
            initGlobalCollapsiblePanels();
        }

        await initData();

        const inbound = getInboundDeepLink();
        const {
            query: inboundQuery,
            direction: inboundDirection,
            country: inboundCountry,
            hsContext: inboundHsContext
        } = inbound;

        bindEvents();
        applyUiStrings();

        if (typeof bindTradeCountryControls === 'function') {
            bindTradeCountryControls();
        }
        if (typeof initTradeCountryForDirection === 'function') {
            initTradeCountryForDirection(AppState.currentDirection || 'export', inboundCountry);
        }

        if (inboundHsContext && (inboundHsContext.chinaCode || inboundHsContext.counterpartyCode)) {
            AppState.hsContext = inboundHsContext;
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
    } catch (error) {
        console.error('Trade Comply init failed:', error);
        if (typeof bindEvents === 'function') {
            bindEvents();
        }
        if (typeof initGlobalCollapsiblePanels === 'function') {
            initGlobalCollapsiblePanels();
        }
    }
}
