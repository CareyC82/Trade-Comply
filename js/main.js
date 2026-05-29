/**
 * Single application entry — loads modules in order, then boots the active page.
 * HTML pages only need: <script src="js/main.js" data-app="index|hscode"></script>
 */
(function () {
    const BUILD = '20260531mod';
    const entryScript = document.currentScript;
    const app = entryScript?.dataset?.app
        || (/\/hscode\.html/i.test(window.location.pathname) ? 'hscode' : 'index');

    const INDEX_MODULES = [
        'js/core.js',
        'lib/country-registry.js',
        'lib/trade-country.js',
        'lib/checklist.js',
        'lib/deep-link.js',
        'js/tag-enrich.js',
        'js/trade-country-ui.js',
        'js/country-render.js',
        'js/catalog.js',
        'js/data.js',
        'js/search.js',
        'js/compliance-checklist.js',
        'js/precheck.js',
        'js/trust-boundary.js',
        'js/ai.js',
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
        'js/core.js',
        'lib/country-registry.js',
        'lib/trade-country.js',
        'lib/checklist.js',
        'lib/hscode-dual.js',
        'js/compliance-checklist.js',
        'js/hscode-page.js'
    ];

    function withVersion(path) {
        return `${path}?v=${BUILD}`;
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
        for (const path of paths) {
            await loadScript(path);
        }
    }

    function onDocumentReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }

    async function start() {
        try {
            const modules = app === 'hscode' ? HSCODE_MODULES : INDEX_MODULES;
            await loadModules(modules);

            onDocumentReady(() => {
                if (app === 'hscode') {
                    if (typeof bootstrapTradeComplyHscode === 'function') {
                        bootstrapTradeComplyHscode();
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
