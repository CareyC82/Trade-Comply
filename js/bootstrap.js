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
        country: (params.get('country') || 'US').trim().toUpperCase(),
        routeFrom: (params.get('from') || 'CN').trim().toUpperCase(),
        routeTo: (params.get('to') || params.get('country') || 'US').trim().toUpperCase(),
        focus: (params.get('focus') || 'import').trim().toLowerCase(),
        vertical: (params.get('vertical') || 'electronics').trim().toLowerCase()
    };
}

function handleInboundSearchFromUrl(inboundQuery, inboundDirection, inboundCountry, inboundVertical, inboundPrecheck, inboundRoute = null) {
    const query = (inboundQuery || '').trim();
    if (!query) {
        return;
    }
    const hasExplicitFocus = inboundRoute?.focus === 'import' || inboundRoute?.focus === 'export';

    const vertical = ['electronics', 'new-energy', 'semiconductor'].includes(inboundVertical)
        ? inboundVertical
        : 'electronics';

    const panelId = globalThis.TradeComplyDeepLink?.getPrecheckPanelIdForVertical
        ? globalThis.TradeComplyDeepLink.getPrecheckPanelIdForVertical(vertical)
        : (vertical === 'semiconductor'
            ? 'semi-precheck-panel'
            : vertical === 'new-energy'
                ? 'energy-precheck-panel'
                : 'precheck-panel');

    if (hasExplicitFocus && typeof applyScenarioDirection === 'function') {
        applyScenarioDirection(vertical, inboundDirection);
    }

    if (inboundRoute && typeof initRouteControls === 'function') {
        const route = initRouteControls(
            inboundRoute.from,
            inboundRoute.to,
            hasExplicitFocus ? inboundRoute.focus : ''
        );
        inboundDirection = route.direction;
        inboundCountry = route.country;
    }

    if (typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection(inboundDirection, inboundCountry);
    } else if (inboundCountry && typeof setTradeCountry === 'function') {
        setTradeCountry(inboundCountry);
    }

    if (Array.isArray(inboundPrecheck) && inboundPrecheck.length && typeof applyPrecheckSelections === 'function') {
        applyPrecheckSelections(panelId, inboundPrecheck);
    }

    if (typeof showView === 'function') {
        showView(vertical, false);
    }

    requestAnimationFrame(() => {
        if (vertical === 'semiconductor') {
            const searchInput = document.getElementById('search-input-semi');
            if (searchInput) {
                searchInput.value = query;
            }
            if (typeof searchSemiconductorProducts === 'function') {
                searchSemiconductorProducts(query);
            }
            return;
        }
        if (vertical === 'new-energy') {
            const searchInput = document.getElementById('search-input-energy');
            if (searchInput) {
                searchInput.value = query;
            }
            if (typeof searchEnergyProducts === 'function') {
                searchEnergyProducts(query);
            }
            return;
        }
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = query;
        }
        if (typeof searchProducts === 'function') {
            searchProducts(query);
        }
    });

    const cleanUrl = `${window.location.pathname}#result`;
    history.replaceState({ view: 'result' }, '', cleanUrl);
}

async function bootstrapTradeComplyIndex() {
    try {
        if (typeof initGlobalCollapsiblePanels === 'function') {
            initGlobalCollapsiblePanels();
        }

        await initData();

        const inbound = getInboundDeepLink();
        const inboundParams = new URLSearchParams(window.location.search);
        const hasExplicitInboundFocus = inboundParams.has('focus');
        const {
            query: inboundQuery,
            direction: inboundDirection,
            country: inboundCountry,
            routeFrom: inboundRouteFrom,
            routeTo: inboundRouteTo,
            focus: inboundFocus,
            vertical: inboundVertical,
            precheck: inboundPrecheck,
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
        if (typeof initRouteControls === 'function') {
            initRouteControls(
                inboundRouteFrom || 'CN',
                inboundRouteTo || inboundCountry || 'US',
                hasExplicitInboundFocus ? inboundFocus : ''
            );
        }
        if (typeof clearUnselectedComplianceFocus === 'function') {
            clearUnselectedComplianceFocus();
        }

        if (inboundHsContext && (inboundHsContext.chinaCode || inboundHsContext.counterpartyCode)) {
            AppState.hsContext = inboundHsContext;
        }

        if (inboundQuery) {
            handleInboundSearchFromUrl(
                inboundQuery,
                inboundDirection,
                inboundCountry,
                inboundVertical,
                inboundPrecheck,
                {
                    from: inboundRouteFrom,
                    to: inboundRouteTo,
                    focus: hasExplicitInboundFocus ? inboundFocus : ''
                }
            );
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
