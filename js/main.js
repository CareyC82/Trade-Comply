loadIncotermData();

/**
 * Deep-link from hscode.html: index.html?search=81099000
 * Must read query BEFORE any history.replaceState that strips ?search=...
 */
function getInboundSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam && searchParam.trim()) {
        return searchParam.trim();
    }

    const hsParam = params.get('hs');
    if (hsParam && hsParam.trim() && params.get('autoSearch') === '1') {
        return hsParam.trim();
    }

    return '';
}

function handleInboundSearchFromUrl(inboundQuery) {
    const query = (inboundQuery || '').trim();
    if (!query) {
        return;
    }

    showView('electronics', false);

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

    const inboundQuery = getInboundSearchQuery();

    bindEvents();
    applyUiStrings();

    if (inboundQuery) {
        handleInboundSearchFromUrl(inboundQuery);
        return;
    }

    initViewHistory();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }
});
