/**
 * Set current direction
 */
function setDirection(direction) {
    AppState.currentDirection = direction;
    const exportBtn = document.getElementById('direction-export');
    const importBtn = document.getElementById('direction-import');
    
    if (exportBtn && importBtn) {
        exportBtn.classList.toggle('active', direction === 'export');
        importBtn.classList.toggle('active', direction === 'import');
    }

    if (typeof syncTradeCountrySelects === 'function') {
        syncTradeCountrySelects(direction);
    }
}

function getViewFromLocation() {
    const hash = window.location.hash.replace(/^#/, '').trim();
    return VALID_VIEWS.includes(hash) ? hash : 'home';
}

function getViewHash(view) {
    return `#${view}`;
}

function applyView(view) {
    const safeView = VALID_VIEWS.includes(view) ? view : 'home';

    VALID_VIEWS.forEach((name) => {
        const el = document.getElementById(`${name}-view`);
        if (!el) {
            return;
        }
        const isActive = name === safeView;
        el.style.display = isActive ? 'block' : 'none';
        el.classList.toggle('active', isActive);
    });
    if (safeView === 'semiconductor') {
        setTimeout(renderSemiQuickActions, 100);
    }
    if (safeView === 'new-energy' && typeof renderNewEnergyQuickSelect === 'function') {
        setTimeout(renderNewEnergyQuickSelect, 100);
    }
    if ((safeView === 'electronics' || safeView === 'new-energy' || safeView === 'semiconductor')
        && typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection(
            AppState.currentDirection || 'export',
            AppState.currentCountry
        );
    }
    window.scrollTo(0, 0);

    AppState.currentView = safeView;
    syncBottomNavActive(safeView);
    return safeView;
}

function syncBottomNavActive(view) {
    const activeByView = {
        home: 'nav-home',
        incoterm: 'nav-incoterm'
    };
    const activeId = activeByView[view] || null;

    document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
        btn.classList.toggle('active', Boolean(activeId && btn.id === activeId));
    });
}

/**
 * Show a specific view
 */
function showView(view, pushHistory = true) {
    const targetView = VALID_VIEWS.includes(view) ? view : 'home';
    const currentView = AppState.currentView || getCurrentView();

    if (currentView !== targetView) {
        if (pushHistory) {
            history.pushState({ view: targetView }, '', getViewHash(targetView));
        }
    }
    applyView(targetView);
}

/**
 * Get current visible view
 */
function getCurrentView() {
    if (AppState.currentView && VALID_VIEWS.includes(AppState.currentView)) {
        return AppState.currentView;
    }

    const views = VALID_VIEWS;
    for (const view of views) {
        const el = document.getElementById(`${view}-view`);
        if (el && el.style.display !== 'none') {
            return view;
        }
    }
    return 'home';
}

function initViewHistory() {
    const initialView = getViewFromLocation();
    applyView(initialView);
    history.replaceState({ view: initialView }, '', getViewHash(initialView));
}

function handlePopState(event) {
    const targetView = event.state?.view || getViewFromLocation();
    const currentView = AppState.currentView || getCurrentView();

    if (currentView === 'result' && targetView !== 'result') {
        resetPrecheckState();
    }

    if (currentView !== targetView) {
        applyView(targetView);
    }
}

function resetPrecheckState() {
    AppState.complianceChecklist = [];
    AppState.checklistChecked = {};
    AppState.lastApiChecklist = null;
    const inputsToClear = ['search-input', 'search-input-energy', 'search-input-semi', 'ai-query-input', 'semi-ai-query-input'];
    inputsToClear.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });

    document.querySelectorAll('input[data-precheck]').forEach(input => {
        input.checked = false;
    });

    ['precheck-summary-container', 'semi-precheck-summary-container', 'ai-query-section', 'semi-ai-query-section', 'compliance-checklist-container'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '';
            if (id === 'compliance-checklist-container') {
                container.hidden = true;
            }
        }
    });

    const semiSummary = document.getElementById('semi-result-summary');
    if (semiSummary) semiSummary.style.display = 'none';

    removeAiBox();
    AppState.lastReport = null;
    AppState.aiContext = null;
}

/**
 * Bind event listeners
 */
function bindEvents() {
    window.addEventListener('popstate', handlePopState);

    // Categories 事件委托 (替代内联 onclick)
    const categoriesContainer = document.getElementById('categories-container');
    if (categoriesContainer) {
        bindCollapsiblePanels(categoriesContainer);
        categoriesContainer.addEventListener('click', (e) => {
            if (e.target.closest('.collapsible-header')) {
                return;
            }
            const tag = e.target.closest('.category-tag');
            if (tag) {
                const query = tag.dataset.query;
                const hsCode = tag.dataset.hscode;
                searchFromCategory(query, hsCode);
            }
        });
    }

    const resultView = document.getElementById('result-view');
    if (resultView) {
        bindCollapsiblePanels(resultView);
    }

    // Direction toggle
    const exportBtn = document.getElementById('direction-export');
    if (exportBtn) exportBtn.addEventListener('click', () => setDirection('export'));
    const importBtn = document.getElementById('direction-import');
    if (importBtn) importBtn.addEventListener('click', () => setDirection('import'));

    if (typeof bindTradeCountryControls === 'function') {
        bindTradeCountryControls();
    }

    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = document.getElementById('search-input')?.value;
            searchProducts(query);
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchProducts(e.target.value);
            }
        });
    }

    // Navigation Actions
    const addNavEvent = (id, targetView) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => {
            if (targetView === 'home') {
                resetPrecheckState();
            }
            showView(targetView);
        });
    };

    document.getElementById('download-report-btn')?.addEventListener('click', downloadPrecheckReport);
    addNavEvent('nav-home', 'home');
    addNavEvent('nav-incoterm', 'incoterm');

    // Hub cards navigate to dedicated category pages (electronics.html, etc.)

    // New Energy Events
    const energyExportBtn = document.getElementById('direction-export-energy');
    const energyImportBtn = document.getElementById('direction-import-energy');
    if (energyExportBtn) {
        energyExportBtn.addEventListener('click', () => {
            AppState.currentDirection = 'export';
            energyExportBtn.classList.add('active');
            energyImportBtn?.classList.remove('active');
            if (typeof syncTradeCountrySelects === 'function') {
                syncTradeCountrySelects('export');
            }
        });
    }
    if (energyImportBtn) {
        energyImportBtn.addEventListener('click', () => {
            AppState.currentDirection = 'import';
            energyImportBtn.classList.add('active');
            energyExportBtn?.classList.remove('active');
            if (typeof syncTradeCountrySelects === 'function') {
                syncTradeCountrySelects('import');
            }
        });
    }
    document.getElementById('search-btn-energy')?.addEventListener('click', () => {
        const q = document.getElementById('search-input-energy')?.value;
        if (typeof searchEnergyProducts === 'function') {
            searchEnergyProducts(q);
        }
    });
    document.getElementById('search-input-energy')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && typeof searchEnergyProducts === 'function') {
            searchEnergyProducts(e.target.value);
        }
    });

    // Semiconductor Events
    const semiExportBtn = document.getElementById('direction-export-semi');
    const semiImportBtn = document.getElementById('direction-import-semi');
    if (semiExportBtn) {
        semiExportBtn.addEventListener('click', () => {
            AppState.currentDirection = 'export';
            semiExportBtn.classList.add('active');
            semiImportBtn?.classList.remove('active');
            if (typeof syncTradeCountrySelects === 'function') {
                syncTradeCountrySelects('export');
            }
        });
    }
    if (semiImportBtn) {
        semiImportBtn.addEventListener('click', () => {
            AppState.currentDirection = 'import';
            semiImportBtn.classList.add('active');
            semiExportBtn?.classList.remove('active');
            if (typeof syncTradeCountrySelects === 'function') {
                syncTradeCountrySelects('import');
            }
        });
    }
    document.getElementById('search-btn-semi')?.addEventListener('click', () => { const q = document.getElementById('search-input-semi')?.value; searchSemiconductorProducts(q); });
    document.getElementById('search-input-semi')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') { const q = e.target.value; searchSemiconductorProducts(q); } });

    // Incoterm Events
    document.getElementById('tab-find')?.addEventListener('click', () => switchIncotermTab('find'));
    document.getElementById('tab-calc')?.addEventListener('click', () => switchIncotermTab('calc'));

    const viewCasesBtn = document.getElementById('view-cases-btn');
    if (viewCasesBtn) {
        viewCasesBtn.addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            const results = search('');
            renderResults(t('allCases'), [], results.cases);
        });
    }

    // Feedback modal
    const feedbackModal = document.getElementById('feedback-modal');
    const modalCancel = document.getElementById('modal-cancel');
    const feedbackForm = document.getElementById('user-feedback-form');
    const feedbackThanks = document.getElementById('feedback-thanks');
    const feedbackFormDiv = document.getElementById('feedback-form');

    ['feedback-trigger', 'result-feedback-trigger', 'home-feedback-trigger', 'semi-feedback-trigger', 'energy-feedback-trigger', 'incoterm-feedback-trigger']
        .forEach(id => {
            const trigger = document.getElementById(id);
            if (trigger && feedbackModal) {
                trigger.addEventListener('click', (event) => {
                    event.preventDefault();
                    openFeedbackModal();
                });
            }
        });

    if (modalCancel && feedbackModal) {
        feedbackModal.classList.remove('open');
        modalCancel.addEventListener('click', () => {
            feedbackModal.classList.remove('open');
        });
    }

    if (feedbackModal) {
        feedbackModal.addEventListener('click', (event) => {
            if (event.target === feedbackModal) {
                feedbackModal.classList.remove('open');
            }
        });
    }

    if (feedbackForm && feedbackThanks && feedbackFormDiv && feedbackModal) {
        bindFeedbackSubmit(feedbackForm, feedbackThanks, feedbackFormDiv, feedbackModal);
    }

    initPolicyCorrectionUi();
}
