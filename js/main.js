/**
 * Single application entry — loads modules in order, then boots the active page.
 * HTML pages only need: <script src="js/main.js" data-app="index|hscode|category"></script>
 */
(function () {
    const BUILD = '20260604-route-ai-terms';
    globalThis.TradeComplyBuild = BUILD;
    const entryScript = document.currentScript;
    const path = window.location.pathname.toLowerCase();

    function detectApp() {
        if (entryScript?.dataset?.app) {
            return entryScript.dataset.app;
        }
        if (/\/hscode\.html/i.test(path)) {
            return 'hscode';
        }
        if (/\/electronics\.html/i.test(path) || /\/new-energy\.html/i.test(path) || /\/semiconductor\.html/i.test(path)) {
            return 'category';
        }
        return 'index';
    }

    const app = detectApp();

    const INDEX_MODULES = [
        'js/app-state.js',
        'js/dom-mount.js',
        'js/core.js',
        'lib/country-registry.js',
        'lib/trade-country.js',
        'lib/checklist.js',
        'lib/checklist-industry-segment.js',
        'lib/actionable-checklist.js',
        'lib/enterprise-print-report.js',
        'lib/industry-checklist-baseline.js',
        'lib/product-intelligence.js',
        'lib/deep-link.js',
        'js/tag-enrich.js',
        'js/trade-country-ui.js',
        'js/country-render.js',
        'js/global-policy-audit.js',
        'js/catalog.js',
        'js/data-templates.js',
        'js/data-service.js',
        'js/quick-select-grid.js',
        'js/data.js',
        'lib/matched-results.js',
        'lib/pre-screen-report.js',
        'js/search.js',
        'js/compliance-checklist.js',
        'js/precheck.js',
        'js/pre-screen-report-templates.js',
        'js/pre-screen-report-panel.js',
        'js/trust-boundary.js',
        'js/ai.js',
        'js/render-templates.js',
        'js/render-prepare.js',
        'js/render-mount.js',
        'js/ai-query-bindings.js',
        'js/search-actions.js',
        'js/render-results.js',
        'js/render.js',
        'js/feedback.js',
        'compliance-feedback-codec.js',
        'js/policy-correction.js',
        'js/navigation.js',
        'js/semiconductor.js',
        'js/incoterm.js',
        'js/bootstrap.js'
    ];

    const HSCODE_MODULES = [
        'js/app-state.js',
        'js/dom-mount.js',
        'js/core.js',
        'lib/country-registry.js',
        'lib/trade-country.js',
        'js/trade-country-ui.js',
        'lib/checklist.js',
        'lib/hscode-dual.js',
        'lib/checklist-industry-segment.js',
        'lib/actionable-checklist.js',
        'lib/enterprise-print-report.js',
        'lib/industry-checklist-baseline.js',
        'lib/product-intelligence.js',
        'js/compliance-checklist.js',
        'js/hscode-page.js'
    ];

    const CATEGORY_MODULES = [
        'js/app-state.js',
        'js/dom-mount.js',
        'js/core.js',
        'lib/country-registry.js',
        'lib/trade-country.js',
        'js/trade-country-ui.js',
        'js/quick-select-grid.js',
        'js/feedback.js',
        'compliance-feedback-codec.js',
        'js/category-page.js'
    ];

    function withVersion(src) {
        return `${src}?v=${BUILD}`;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = withVersion(src);
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function loadModules(paths) {
        for (const pathToLoad of paths) {
            await loadScript(pathToLoad);
        }
    }

    function onDocumentReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }

    async function primeChecklistBaselines() {
        if (globalThis.TradeComplyChecklist?.initChecklistBaselines) {
            await globalThis.TradeComplyChecklist.initChecklistBaselines();
        }
    }

    function bindCategoryFeedbackModal() {
        const feedbackModal = document.getElementById('feedback-modal');
        const modalCancel = document.getElementById('modal-cancel');
        const feedbackForm = document.getElementById('user-feedback-form');
        const feedbackThanks = document.getElementById('feedback-thanks');
        const feedbackFormDiv = document.getElementById('feedback-form');

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

        if (feedbackForm && feedbackThanks && feedbackFormDiv && feedbackModal && typeof bindFeedbackSubmit === 'function') {
            bindFeedbackSubmit(feedbackForm, feedbackThanks, feedbackFormDiv, feedbackModal);
        }
    }

    async function start() {
        try {
            let modules = INDEX_MODULES;
            if (app === 'hscode') {
                modules = HSCODE_MODULES;
            } else if (app === 'category') {
                modules = CATEGORY_MODULES;
            }
            await loadModules(modules);
            if (app !== 'category') {
                await primeChecklistBaselines();
            }

            onDocumentReady(() => {
                if (app === 'hscode') {
                    if (typeof bootstrapTradeComplyHscode === 'function') {
                        bootstrapTradeComplyHscode();
                    }
                    return;
                }
                if (app === 'category') {
                    bindCategoryFeedbackModal();
                    if (typeof bootstrapCategoryPage === 'function') {
                        bootstrapCategoryPage();
                    }
                    return;
                }
                if (typeof bootstrapTradeComplyIndex === 'function') {
                    bootstrapTradeComplyIndex();
                }
            });
        } catch (error) {
            console.error('Trade Comply module load failed:', error);
        }
    }

    start();
}());
