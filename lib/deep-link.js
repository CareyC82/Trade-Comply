/**
 * Inbound deep-link parsing (hscode.html -> index.html?search=&direction=).
 * Browser: load via <script> and use globalThis.TradeComplyDeepLink.
 * Node/tests: require('./lib/deep-link').
 */

function normalizeInboundDirection(value) {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'import' ? 'import' : 'export';
}

/**
 * @param {string} [searchString] - e.g. window.location.search or "?search=9617&direction=import"
 */
function getInboundDeepLinkFromSearch(searchString = '') {
    const raw = searchString.startsWith('?') ? searchString : `?${searchString.replace(/^\?/, '')}`;
    const params = new URLSearchParams(raw);

    let query = '';
    const searchParam = params.get('search');
    if (searchParam && searchParam.trim()) {
        query = searchParam.trim();
    } else {
        const hsParam = params.get('hs');
        if (hsParam && hsParam.trim() && params.get('autoSearch') === '1') {
            query = hsParam.trim();
        }
    }

    const direction = normalizeInboundDirection(params.get('direction'));
    const country = normalizeInboundCountry(params.get('country'));
    const chinaCode = (params.get('china_hs') || params.get('china_code') || '').trim();
    const counterpartyCode = (params.get('cp_hs') || params.get('counterparty_hs') || '').trim();
    const productName = (params.get('product') || '').trim();
    const description = (params.get('desc') || '').trim();
    const vertical = (params.get('vertical') || 'electronics').trim().toLowerCase();
    const precheckRaw = (params.get('precheck') || '').trim();
    const precheck = precheckRaw
        ? precheckRaw.split(',').map((id) => id.trim()).filter(Boolean)
        : [];

    return {
        query,
        direction,
        country,
        vertical,
        precheck,
        hsContext: {
            chinaCode,
            counterpartyCode,
            officialName: productName,
            productDescription: description
        }
    };
}

function normalizeInboundCountry(value) {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyCountry) {
        return globalThis.TradeComplyCountry.normalizeCountryCode(value || 'US');
    }
    const { normalizeCountryCode } = require('./country-registry');
    return normalizeCountryCode(value || 'US');
}

/**
 * Pure plan for DOM side effects (tested without a browser).
 */
function getPrecheckPanelIdForVertical(vertical) {
    if (vertical === 'semiconductor') {
        return 'semi-precheck-panel';
    }
    if (vertical === 'new-energy') {
        return 'energy-precheck-panel';
    }
    return 'precheck-panel';
}

function buildInboundSearchPlan(searchString) {
    const { query, direction, country, vertical, precheck } = getInboundDeepLinkFromSearch(searchString);
    if (!query) {
        return {
            shouldRun: false,
            query: '',
            direction: 'export',
            country: 'US',
            vertical: 'electronics',
            precheck: [],
            precheckPanelId: 'precheck-panel',
            view: null,
            directionClick: null
        };
    }

    const safeVertical = ['electronics', 'new-energy', 'semiconductor'].includes(vertical)
        ? vertical
        : 'electronics';

    return {
        shouldRun: true,
        query,
        direction,
        country,
        vertical: safeVertical,
        precheck: precheck || [],
        precheckPanelId: getPrecheckPanelIdForVertical(safeVertical),
        view: safeVertical,
        directionClick: direction === 'import' ? 'import' : 'export',
        cleanHash: `#${safeVertical === 'new-energy' ? 'new-energy' : safeVertical}`
    };
}

const api = {
    normalizeInboundDirection,
    normalizeInboundCountry,
    getInboundDeepLinkFromSearch,
    getPrecheckPanelIdForVertical,
    buildInboundSearchPlan
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyDeepLink = api;
}
