loadIncotermData();

function handleInboundSearchFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hs = params.get('hs');
    const autoSearch = params.get('autoSearch');

    if (!hs || autoSearch !== '1') {
        return;
    }

    showView('electronics');
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = hs;
    }

    searchProducts(hs);

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    history.replaceState({ view: 'result' }, '', cleanUrl);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initData();

    const params = new URLSearchParams(window.location.search);
    const hasAutoHsSearch = params.get('hs') && params.get('autoSearch') === '1';

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
