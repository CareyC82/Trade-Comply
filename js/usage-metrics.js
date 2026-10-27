'use strict';

(function (root) {
    const ENDPOINT = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run/api/usage-metrics';
    const EVENTS = new Set([
        'can_i_sell_entry_click',
        'can_i_sell_check_started',
        'can_i_sell_result_generated'
    ]);

    function params() {
        try { return new URLSearchParams(root.location?.search || ''); }
        catch { return new URLSearchParams(); }
    }

    function isDevelopmentHost(hostname = root.location?.hostname) {
        return !hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    function isTestEvent() {
        return params().get('tw_test') === '1' || root.TRACEWIZE_TEST_EVENT === true;
    }

    function sourceClass() {
        const query = params();
        if (query.get('tw_source') === 'organic') return 'organic';
        if (query.get('tw_source') === 'campaign' || query.has('utm_source') || query.has('utm_campaign')) return 'campaign';
        return 'unknown';
    }

    function payload(eventName, details = {}) {
        if (!EVENTS.has(eventName)) return null;
        return {
            event_name: eventName,
            app_build: String(root.TradeComplyBuild || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64) || 'unknown',
            page: details.page === 'home' || details.page === 'can-i-sell-it' ? details.page : 'other',
            mode: details.mode === 'single' || details.mode === 'compare' ? details.mode : 'unknown',
            market_count: Number.isInteger(details.marketCount) ? Math.max(0, Math.min(4, details.marketCount)) : 0,
            source: sourceClass(),
            test_event: isTestEvent()
        };
    }

    function record(eventName, details = {}) {
        if (isDevelopmentHost()) return Promise.resolve({ suppressed: true, reason: 'development_host' });
        const body = payload(eventName, details);
        if (!body) return Promise.resolve({ suppressed: true, reason: 'unsupported_event' });
        return root.fetch(ENDPOINT, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then((response) => ({ accepted: response.ok })).catch(() => ({ accepted: false }));
    }

    function bindEntryClicks(doc = root.document) {
        if (!doc?.addEventListener) return;
        doc.addEventListener('click', (event) => {
            const link = event.target?.closest?.('a[href]');
            if (!link) return;
            let destination;
            try { destination = new URL(link.href, root.location?.href); } catch { return; }
            if (!/\/can-i-sell-it\.html$/i.test(destination.pathname)) return;
            if (isTestEvent()) {
                destination.searchParams.set('tw_test', '1');
                link.href = destination.toString();
            }
            record('can_i_sell_entry_click', {
                page: /\/can-i-sell-it\.html$/i.test(root.location?.pathname || '') ? 'can-i-sell-it' : 'home'
            });
        });
    }

    const api = { ENDPOINT, isDevelopmentHost, isTestEvent, sourceClass, payload, record, bindEntryClicks };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TradeComplyUsageMetrics = api;
    bindEntryClicks();
})(typeof globalThis !== 'undefined' ? globalThis : window);
