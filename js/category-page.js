/**
 * Category hub pages — electronics.html, new-energy.html, semiconductor.html
 */

const CATEGORY_PAGE_CONFIG = {
    electronics: {
        title: 'Electronics & Smart Hardware',
        subtitle: 'Screen wireless, battery, encryption, consumer devices, and local market safety approval signals.',
        searchPlaceholder: 'Enter product, HS Code, or risk feature',
        vertical: 'electronics',
        cards: () => globalThis.ELECTRONICS_QUICK_SELECT_CARDS
    },
    'new-energy': {
        title: 'New Energy & Clean Tech',
        subtitle: 'Pre-check PV modules, inverters, energy storage, EV chargers, UFLPA supply chain tracing, and tariff exposure.',
        searchPlaceholder: 'Enter PV module, inverter, HS Code, or supply chain risk',
        vertical: 'new-energy',
        cards: () => globalThis.NEW_ENERGY_QUICK_SELECT_CARDS
    },
    semiconductor: {
        title: 'Advanced Semiconductor & Controls',
        subtitle: 'Pre-screen chips, high-speed optics, foundries, dual-use export limits, and entity list screening.',
        searchPlaceholder: 'Enter chip, optics module, HS Code, or export control risk',
        vertical: 'semiconductor',
        cards: () => globalThis.SEMICONDUCTOR_HUB_QUICK_SELECT_CARDS
    }
};

function getCategoryPageKey() {
    const script = document.querySelector('script[data-category]');
    if (script?.dataset?.category) {
        return script.dataset.category;
    }
    const path = window.location.pathname.toLowerCase();
    if (path.includes('new-energy')) {
        return 'new-energy';
    }
    if (path.includes('semiconductor')) {
        return 'semiconductor';
    }
    return 'electronics';
}

function getCategoryRouteSelection() {
    const from = (typeof getActiveRouteSelect === 'function' ? getActiveRouteSelect('from')?.value : document.querySelector('[data-route-country="from"]')?.value) || 'CN';
    const to = (typeof getActiveRouteSelect === 'function' ? getActiveRouteSelect('to')?.value : document.querySelector('[data-route-country="to"]')?.value) || 'US';
    const selectedFocus = (typeof getActiveFocusButton === 'function' ? getActiveFocusButton()?.dataset.complianceFocus : document.querySelector('[data-compliance-focus].active')?.dataset.complianceFocus) || AppState.complianceFocus || '';
    if (typeof syncRouteControls === 'function') {
        if (selectedFocus) {
            return syncRouteControls(from, to, selectedFocus);
        }
        const api = typeof getCountryOptionsApi === 'function' ? getCountryOptionsApi() : null;
        if (api?.getRouteContext) {
            return {
                ...api.getRouteContext({ from, to, focus: 'import' }),
                hasSelectedFocus: false
            };
        }
    }
    const focus = document.getElementById('direction-import')?.classList.contains('active') ? 'export' : 'import';
    const country = focus === 'import' ? to : from;
    return { from, to, focus, direction: focus === 'export' ? 'export' : 'export', country, hasSelectedFocus: Boolean(selectedFocus) };
}

function buildCategorySearchUrl(query, direction, country, vertical, routeContext = null) {
    const params = new URLSearchParams();
    params.set('appv', globalThis.TradeComplyBuild || 'current');
    const trimmed = (query || '').trim();
    if (trimmed) {
        params.set('search', trimmed);
        params.set('autoSearch', '1');
    }
    params.set('direction', direction === 'import' ? 'import' : 'export');
    params.set('country', country || 'US');
    if (routeContext) {
        params.set('from', routeContext.from || 'CN');
        params.set('to', routeContext.to || 'US');
        if (routeContext.hasSelectedFocus !== false) {
            params.set('focus', routeContext.focus === 'export' ? 'export' : 'import');
        }
    }
    params.set('vertical', vertical || 'electronics');
    return `index.html?${params.toString()}#result`;
}

function redirectCategorySearch(query, verticalOverride) {
    const config = CATEGORY_PAGE_CONFIG[getCategoryPageKey()];
    if (!config) {
        return;
    }
    const route = getCategoryRouteSelection();
    const vertical = ['electronics', 'new-energy', 'semiconductor'].includes(verticalOverride)
        ? verticalOverride
        : config.vertical;
    const url = buildCategorySearchUrl(query, route.direction, route.country, vertical, route);
    window.location.href = url;
}

function bindCategoryDirectionToggle() {
    const exportBtn = document.getElementById('direction-export');
    const importBtn = document.getElementById('direction-import');
    if (!exportBtn || !importBtn) {
        return;
    }

    exportBtn.addEventListener('click', () => {
        AppState.complianceFocusSelected = true;
        const route = typeof syncRouteControls === 'function'
            ? syncRouteControls(undefined, undefined, 'import')
            : null;
        AppState.currentDirection = route?.direction || 'export';
        exportBtn.classList.add('active');
        importBtn.classList.remove('active');
    });

    importBtn.addEventListener('click', () => {
        AppState.complianceFocusSelected = true;
        const route = typeof syncRouteControls === 'function'
            ? syncRouteControls(undefined, undefined, 'export')
            : null;
        AppState.currentDirection = route?.direction || 'export';
        importBtn.classList.add('active');
        exportBtn.classList.remove('active');
    });
}

function bindCategorySearch() {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            redirectCategorySearch(searchInput?.value || '');
        });
    }
    if (searchInput) {
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                redirectCategorySearch(searchInput.value);
            }
        });
    }
}

function bindCategoryFeedback() {
    const trigger = document.getElementById('category-feedback-trigger');
    const modal = document.getElementById('feedback-modal');
    if (trigger && modal && typeof openFeedbackModal === 'function') {
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            openFeedbackModal();
        });
    }
}

function bootstrapCategoryPage() {
    const key = getCategoryPageKey();
    const config = CATEGORY_PAGE_CONFIG[key];
    if (!config) {
        return;
    }

    if (typeof bindTradeCountryControls === 'function') {
        bindTradeCountryControls();
    }
    if (typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection('export', 'US');
    }
    if (typeof initRouteControls === 'function') {
        initRouteControls('CN', 'US', '');
    }
    if (typeof clearUnselectedComplianceFocus === 'function') {
        clearUnselectedComplianceFocus();
    }

    bindCategoryDirectionToggle();
    bindCategorySearch();
    bindCategoryFeedback();

    if (typeof renderQuickSelectGrid === 'function') {
        renderQuickSelectGrid('category-quick-select-container', {
            mode: 'category',
            vertical: config.vertical,
            cards: config.cards(),
            onSelect: ({ query, vertical }) => redirectCategorySearch(query, vertical)
        });
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.bootstrapCategoryPage = bootstrapCategoryPage;
    globalThis.buildCategorySearchUrl = buildCategorySearchUrl;
}
