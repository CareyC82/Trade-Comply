'use strict';

const SEARCH_GAP_API_URL = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run/feedback';
const SEARCH_GAP_SESSION_KEY = 'trade-comply-search-gaps-v1';

function searchGapFingerprint(payload) {
    return [
        payload.product_query.toLowerCase(),
        payload.direction,
        payload.route_origin,
        payload.route_destination,
        payload.compliance_focus,
        payload.trust_status
    ].join('|');
}

function readRecordedSearchGaps() {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SEARCH_GAP_SESSION_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function recordSearchGap({ query, tags = [], cases = [], selections = [], view = '' } = {}) {
    const productQuery = String(query || '').trim();
    if (productQuery.length < 2) return;
    const tagCount = tags.length;
    const caseCount = cases.length;
    if (tagCount > 1) return;
    const trustStatus = tagCount === 0 ? 'no_match' : 'weak_match';
    const payload = {
        event_type: 'search_gap',
        product_query: productQuery,
        regulation_needed: '',
        direction: AppState.currentDirection || 'export',
        view: view || AppState.currentView || 'unknown',
        matched_tag_ids: tags.map((tag) => tag.tag_id).filter(Boolean).slice(0, 12),
        matched_rule_count: tagCount,
        matched_case_count: caseCount,
        had_results: tagCount > 0 || caseCount > 0,
        risk_level: 'unknown',
        trust_status: trustStatus,
        selected_precheck_attributes: selections.map((item) => item.id || item).filter(Boolean),
        route_origin: AppState.routeFromCountry || '',
        route_destination: AppState.routeToCountry || AppState.currentCountry || '',
        compliance_focus: AppState.complianceFocus || '',
        page_url: window.location.href,
        user_agent: navigator.userAgent
    };
    const recorded = readRecordedSearchGaps();
    const fingerprint = searchGapFingerprint(payload);
    if (recorded.has(fingerprint)) return;
    recorded.add(fingerprint);
    sessionStorage.setItem(SEARCH_GAP_SESSION_KEY, JSON.stringify([...recorded].slice(-100)));
    fetch(SEARCH_GAP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
    }).catch(() => {});
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplySearchGap = { recordSearchGap, searchGapFingerprint };
}
