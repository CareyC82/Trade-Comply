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

function buildCategorySearchUrl(query, direction, country, vertical) {
    const params = new URLSearchParams();
    const trimmed = (query || '').trim();
    if (trimmed) {
        params.set('search', trimmed);
    }
    params.set('direction', direction === 'import' ? 'import' : 'export');
    params.set('country', country || 'US');
    params.set('vertical', vertical || 'electronics');
    return `index.html?${params.toString()}`;
}

function redirectCategorySearch(query) {
    const config = CATEGORY_PAGE_CONFIG[getCategoryPageKey()];
    if (!config) {
        return;
    }
    const direction = document.getElementById('direction-import')?.classList.contains('active')
        ? 'import'
        : 'export';
    const countrySelect = document.getElementById('trade-country');
    const country = countrySelect?.value || 'US';
    const url = buildCategorySearchUrl(query, direction, country, config.vertical);
    window.location.href = url;
}

function bindCategoryDirectionToggle() {
    const exportBtn = document.getElementById('direction-export');
    const importBtn = document.getElementById('direction-import');
    if (!exportBtn || !importBtn) {
        return;
    }

    exportBtn.addEventListener('click', () => {
        exportBtn.classList.add('active');
        importBtn.classList.remove('active');
        if (typeof syncTradeCountrySelects === 'function') {
            syncTradeCountrySelects('export');
        }
    });

    importBtn.addEventListener('click', () => {
        importBtn.classList.add('active');
        exportBtn.classList.remove('active');
        if (typeof syncTradeCountrySelects === 'function') {
            syncTradeCountrySelects('import');
        }
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

    bindCategoryDirectionToggle();
    bindCategorySearch();
    bindCategoryFeedback();

    if (typeof renderQuickSelectGrid === 'function') {
        renderQuickSelectGrid('category-quick-select-container', {
            mode: 'category',
            vertical: config.vertical,
            cards: config.cards(),
            onSelect: ({ query }) => redirectCategorySearch(query)
        });
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.bootstrapCategoryPage = bootstrapCategoryPage;
    globalThis.buildCategorySearchUrl = buildCategorySearchUrl;
}
