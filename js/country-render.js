/**
 * Country-aware result rendering helpers (browser).
 */

function getCountryRenderApi() {
    return globalThis.TradeComplyCountry || null;
}

function buildTagCountryDisplayMeta(tag, selectedCountry, direction) {
    const api = getCountryRenderApi();
    const safeDirection = direction === 'import' ? 'import' : 'export';

    if (!api) {
        return {
            badgeCode: 'CN',
            badgeClass: 'cn',
            scopeLine: 'Compliance scope',
            isExact: false,
            isBaseline: true,
            matchRibbon: ''
        };
    }

    const badgeCode = api.getTagCountryBadgeCode(tag, safeDirection);
    const badgeClass = String(badgeCode || 'cn').toLowerCase();
    const isExact = api.isExactCountryMatch(tag, selectedCountry);
    const isBaseline = api.isChinaBaselineRule(tag);
    const selectedLabel = api.getCountryLabel(selectedCountry);
    const scopeLine = api.getTagCountryBadgeTitle(tag, safeDirection);
    const roleLabel = api.getCounterpartyRoleLabel(safeDirection);

    let matchRibbon = '';
    if (isExact) {
        matchRibbon = `Matches your selected ${roleLabel}: ${selectedLabel}`;
    } else if (isBaseline) {
        matchRibbon = safeDirection === 'import'
            ? 'China import baseline (applies regardless of origin country)'
            : 'China export baseline (applies when shipping from China)';
    }

    return {
        badgeCode,
        badgeClass,
        scopeLine,
        isExact,
        isBaseline,
        matchRibbon
    };
}

function renderCountryContextBanner(tags, selectedCountry, direction, routeContext = null) {
    const banner = document.getElementById('country-context-banner');
    if (!banner) {
        return;
    }

    const api = getCountryRenderApi();
    if (!api || !tags || tags.length === 0) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }

    const coverage = api.analyzeCountryCoverage(tags, selectedCountry, direction);
    const message = api.buildCountryContextMessage(coverage);
    const indicator = typeof api.buildCoverageIndicator === 'function'
        ? api.buildCoverageIndicator(coverage, routeContext)
        : null;
    if (!message && !indicator) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }

    const level = indicator?.level || (coverage.exactCount > 0 ? 'partial' : 'baseline');
    const variant = coverage.exactCount > 0 ? 'country-context-banner--matched' : 'country-context-banner--fallback';
    const metaText = indicator
        ? `Route-specific matches: ${indicator.exactCount} · Baseline matches: ${indicator.baselineCount}`
        : message;
    banner.className = `country-context-banner ${variant} country-context-banner--${level}`;
    banner.hidden = false;
    banner.innerHTML = `
        <span class="coverage-badge coverage-badge--${escapeHtml(level)}">${escapeHtml(indicator?.label || 'Coverage')}</span>
        <span class="country-context-banner__text">
            <strong>${escapeHtml(indicator?.routeLine || `Selected ${coverage.roleLabel}: ${coverage.selectedLabel}`)}</strong>
            <span>${escapeHtml(indicator?.message || message)}</span>
        </span>
        <span class="country-context-banner__meta">${escapeHtml(metaText)}</span>
    `;
}

function buildCountryBadgeHtml(meta) {
    return `<span class="country-code-badge country-code-badge--${escapeHtml(meta.badgeClass)}" title="${escapeHtml(meta.scopeLine)}">[${escapeHtml(meta.badgeCode)}]</span>`;
}

function buildMatchRibbonHtml(meta) {
    if (!meta.matchRibbon) {
        return '';
    }
    const ribbonClass = meta.isExact
        ? 'country-match-ribbon country-match-ribbon--exact'
        : 'country-match-ribbon country-match-ribbon--baseline';
    return `<div class="${ribbonClass}">${escapeHtml(meta.matchRibbon)}</div>`;
}
