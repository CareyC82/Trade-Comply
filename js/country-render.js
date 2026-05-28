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

function renderCountryContextBanner(tags, selectedCountry, direction) {
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
    if (!message) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }

    const variant = coverage.exactCount > 0 ? 'country-context-banner--matched' : 'country-context-banner--fallback';
    banner.className = `country-context-banner ${variant}`;
    banner.hidden = false;
    banner.innerHTML = `
        <span class="country-context-banner__icon" aria-hidden="true">🌐</span>
        <span class="country-context-banner__text">${escapeHtml(message)}</span>
        <span class="country-context-banner__meta">Selected ${escapeHtml(coverage.roleLabel)}: <strong>${escapeHtml(coverage.selectedLabel)}</strong></span>
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
