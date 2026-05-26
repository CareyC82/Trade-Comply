/**
 * Trust boundary — screening scope, limits, and verification roles (P0-a).
 * Copy resolves through UI_STRINGS via t().
 */

const TRUST_BOUNDARY_STATIC = {
    notCoveredKeys: [
        'trustNotCoveredDestination',
        'trustNotCoveredHsFinal',
        'trustNotCoveredEndUse',
        'trustNotCoveredCarrier',
        'trustNotCoveredContract',
        'trustNotCoveredNonElectronics',
        'trustNotCoveredLegal'
    ],
    verifyRoles: {
        low: {
            badgeKey: 'trustVerifyBadgeLow',
            titleKey: 'trustVerifyTitleLow',
            itemKeys: [
                'trustVerifyItemLowBroker',
                'trustVerifyItemLowSource'
            ]
        },
        medium: {
            badgeKey: 'trustVerifyBadgeMedium',
            titleKey: 'trustVerifyTitleMedium',
            itemKeys: [
                'trustVerifyItemMediumBroker',
                'trustVerifyItemMediumCert',
                'trustVerifyItemMediumSource'
            ]
        },
        high: {
            badgeKey: 'trustVerifyBadgeHigh',
            titleKey: 'trustVerifyTitleHigh',
            itemKeys: [
                'trustVerifyItemHighCounsel',
                'trustVerifyItemHighBroker',
                'trustVerifyItemHighAgency'
            ]
        },
        review_required: {
            badgeKey: 'trustVerifyBadgeReview',
            titleKey: 'trustVerifyTitleReview',
            itemKeys: [
                'trustVerifyItemReviewCounsel',
                'trustVerifyItemReviewDocs',
                'trustVerifyItemReviewSource'
            ]
        }
    }
};

function resolveI18nKeys(keys) {
    return (keys || []).map(key => t(key)).filter(Boolean);
}

function getTrustLibraryStats() {
    const tags = AppState.data?.tags || [];
    const cases = AppState.data?.cases || [];
    return {
        ruleCount: tags.length,
        caseCount: cases.length
    };
}

function collectCategoryLabels(tags) {
    const labels = [];
    const seen = new Set();
    (tags || []).forEach(tag => {
        const label = getTagCategoryLabel(tag);
        if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
        }
    });
    return labels;
}

function getTrustScreenStatus(isInRange, hasMatches) {
    if (!isInRange) {
        return {
            code: 'out_of_scope',
            badgeKey: 'trustStatusOutOfScope',
            tone: 'out-of-scope'
        };
    }
    if (!hasMatches) {
        return {
            code: 'no_match',
            badgeKey: 'trustStatusNoMatch',
            tone: 'no-match'
        };
    }
    return {
        code: 'screened',
        badgeKey: 'trustStatusScreened',
        tone: 'screened'
    };
}

function resolveVerifyRole(risk) {
    const roleMap = TRUST_BOUNDARY_STATIC.verifyRoles;
    if (risk === 'review_required' && roleMap.review_required) {
        return roleMap.review_required;
    }
    if (risk === 'high' && roleMap.high) {
        return roleMap.high;
    }
    if (risk === 'medium' && roleMap.medium) {
        return roleMap.medium;
    }
    return roleMap.low;
}

function buildTrustBoundary(context = {}) {
    const query = context.query || '';
    const direction = context.direction || AppState.currentDirection || 'export';
    const tags = context.tags || [];
    const cases = context.cases || [];
    const precheckSelections = context.precheckSelections || [];
    const profile = context.profile || buildPrecheckProfile(precheckSelections, tags);
    const risk = profile.risk || 'low';

    const libraryStats = getTrustLibraryStats();
    const isInRange = checkSearchRange(query) || precheckSelections.length > 0;
    const hasMatches = tags.length > 0;
    const status = getTrustScreenStatus(isInRange, hasMatches);
    const directionLabel = direction === 'import' ? t('importTitle') : t('exportTitle');
    const categories = collectCategoryLabels(tags);
    const precheckLabels = precheckSelections.map(item => item.label).filter(Boolean);

    const notCovered = resolveI18nKeys(TRUST_BOUNDARY_STATIC.notCoveredKeys);
    if (!isInRange) {
        notCovered.push(t('trustNotCoveredOutOfRangeExtra'));
    } else if (!hasMatches) {
        notCovered.push(t('trustNotCoveredNoMatchExtra'));
    } else {
        notCovered.push(t('trustNotCoveredHasMatchExtra'));
    }

    const verifyRole = resolveVerifyRole(risk);

    const covered = {
        directionLabel,
        query,
        ruleCount: tags.length,
        caseCount: cases.length,
        categories,
        precheckLabels,
        libraryRuleCount: libraryStats.ruleCount,
        libraryCaseCount: libraryStats.caseCount,
        isInRange,
        hasMatches,
        status,
        risk,
        riskLabel: getRiskLabel(risk)
    };

    return {
        title: t('trustBoundaryTitle'),
        subtitle: t('trustBoundarySubtitle'),
        covered,
        notCovered,
        verifyWith: {
            badge: t(verifyRole.badgeKey),
            title: t(verifyRole.titleKey),
            items: resolveI18nKeys(verifyRole.itemKeys),
            risk
        }
    };
}

function buildTrustBoundaryHtml(boundary) {
    if (!boundary) {
        return '';
    }

    const { covered } = boundary;
    const statusClass = `boundary-badge boundary-badge--${covered.status.tone}`;

    const coveredRows = [
        `<li><strong>${escapeHtml(t('trustCoveredDirection'))}:</strong> ${escapeHtml(covered.directionLabel)}</li>`,
        `<li><strong>${escapeHtml(t('trustCoveredQuery'))}:</strong> ${escapeHtml(covered.query || '—')}</li>`,
        `<li>${escapeHtml(t('trustCoveredMatches', { ruleCount: covered.ruleCount, caseCount: covered.caseCount }))}</li>`,
        `<li>${escapeHtml(t('trustCoveredLibrary', { ruleCount: covered.libraryRuleCount, caseCount: covered.libraryCaseCount }))}</li>`
    ];

    if (covered.hasMatches) {
        coveredRows.push(`<li>${escapeHtml(t('trustCoveredSources'))}</li>`);
    } else if (!covered.isInRange) {
        coveredRows.push(`<li>${escapeHtml(t('trustCoveredOutOfRange'))}</li>`);
    } else {
        coveredRows.push(`<li>${escapeHtml(t('trustCoveredNoMatches'))}</li>`);
    }

    const categoryBlock = covered.categories.length > 0 ? `
        <div class="boundary-subsection">
            <div class="boundary-subheading">${escapeHtml(t('trustCoveredCategories'))}</div>
            <div class="scope-chips">
                ${covered.categories.map(label => `<span class="scope-chip">${escapeHtml(label)}</span>`).join('')}
            </div>
        </div>
    ` : '';

    const precheckBlock = covered.precheckLabels.length > 0 ? `
        <div class="boundary-subsection">
            <div class="boundary-subheading">${escapeHtml(t('trustCoveredPrecheck'))}</div>
            <div class="scope-chips">
                ${covered.precheckLabels.map(label => `<span class="scope-chip scope-chip--precheck">${escapeHtml(label)}</span>`).join('')}
            </div>
        </div>
    ` : '';

    const notCoveredList = boundary.notCovered
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');

    const verifyList = boundary.verifyWith.items
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');

    return `
        <div class="trust-boundary-card" role="region" aria-label="${escapeHtml(boundary.title)}">
            <div class="trust-boundary-header">
                <div>
                    <div class="trust-boundary-title">${escapeHtml(boundary.title)}</div>
                    <div class="trust-boundary-subtitle">${escapeHtml(boundary.subtitle)}</div>
                </div>
                <span class="${statusClass}">${escapeHtml(t(covered.status.badgeKey))}</span>
            </div>

            <div class="trust-boundary-grid">
                <section class="trust-boundary-section collapsible-panel">
                    <button type="button" class="trust-boundary-section-header collapsible-header" aria-expanded="false">
                        <span class="trust-boundary-section-title">${escapeHtml(t('trustCoveredHeading'))}</span>
                        <span class="arrow" aria-hidden="true">▶</span>
                    </button>
                    <div class="trust-boundary-section-body collapsible-body">
                        <ul class="trust-boundary-list">${coveredRows.join('')}</ul>
                        ${categoryBlock}
                        ${precheckBlock}
                    </div>
                </section>

                <section class="trust-boundary-section collapsible-panel">
                    <button type="button" class="trust-boundary-section-header collapsible-header" aria-expanded="false">
                        <span class="trust-boundary-section-title">${escapeHtml(t('trustNotCoveredHeading'))}</span>
                        <span class="arrow" aria-hidden="true">▶</span>
                    </button>
                    <div class="trust-boundary-section-body collapsible-body">
                        <ul class="trust-boundary-list trust-boundary-list--muted">${notCoveredList}</ul>
                    </div>
                </section>

                <section class="trust-boundary-section trust-boundary-section--verify collapsible-panel">
                    <button type="button" class="trust-boundary-section-header trust-boundary-section-header--verify collapsible-header" aria-expanded="false">
                        <span class="trust-boundary-section-header-row">
                            <span class="trust-boundary-section-title">${escapeHtml(t('trustVerifyHeading'))}</span>
                            <span class="arrow" aria-hidden="true">▶</span>
                        </span>
                        <span class="boundary-badge boundary-badge--verify">${escapeHtml(boundary.verifyWith.badge)}</span>
                    </button>
                    <div class="trust-boundary-section-body collapsible-body">
                        <p class="trust-boundary-verify-title">${escapeHtml(boundary.verifyWith.title)}</p>
                        <ul class="trust-boundary-list">${verifyList}</ul>
                    </div>
                </section>
            </div>
        </div>
    `;
}

function renderTrustBoundary(containerId, context) {
    const container = document.getElementById(containerId);
    if (!container) {
        return null;
    }

    const boundary = buildTrustBoundary(context);
    container.innerHTML = buildTrustBoundaryHtml(boundary);
    return boundary;
}
