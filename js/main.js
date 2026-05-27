loadIncotermData();

function handleInboundSearchFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('search') || params.get('hs');
    const legacyAuto = params.get('autoSearch') === '1';

    if (!query) {
        return;
    }
    if (!params.get('search') && !legacyAuto) {
        return;
    }

    showView('electronics');
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = query;
    }

    searchProducts(query);

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    history.replaceState({ view: 'result' }, '', cleanUrl);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initData();

    const params = new URLSearchParams(window.location.search);
    const hasAutoHsSearch = Boolean(params.get('search'))
        || (params.get('hs') && params.get('autoSearch') === '1');

    if (hasAutoHsSearch) {
        applyView('electronics');
        history.replaceState({ view: 'electronics' }, '', `${window.location.pathname}#electronics`);
    } else {
        initViewHistory();
    }

    bindEvents();
    applyUiStrings();

    if (hasAutoHsSearch) {
        handleInboundSearchFromUrl();
        return;
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }
});
