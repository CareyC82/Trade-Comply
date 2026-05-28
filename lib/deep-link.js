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

    return { query, direction };
}

/**
 * Pure plan for DOM side effects (tested without a browser).
 */
function buildInboundSearchPlan(searchString) {
    const { query, direction } = getInboundDeepLinkFromSearch(searchString);
    if (!query) {
        return { shouldRun: false, query: '', direction: 'export', view: null, directionClick: null };
    }

    return {
        shouldRun: true,
        query,
        direction,
        view: 'electronics',
        directionClick: direction === 'import' ? 'import' : 'export',
        cleanHash: '#electronics'
    };
}

const api = {
    normalizeInboundDirection,
    getInboundDeepLinkFromSearch,
    buildInboundSearchPlan
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyDeepLink = api;
}
