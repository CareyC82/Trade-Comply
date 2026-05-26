function isBrowseAllQuery(query) {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) return true;
    const browseLabels = [t('allProducts'), t('allCases'), 'Semiconductor products', 'semiconductor products'];
    return browseLabels.some(label => label && label.toLowerCase() === normalized);
}

function renderAiQuerySection(container, { showAssistant, matchedRuleCount }) {
    if (!container) {
        return;
    }

    if (!showAssistant) {
        container.innerHTML = '';
        return;
    }

    const note = matchedRuleCount > 0
        ? escapeHtml(t('aiBasedOnRules', { count: matchedRuleCount }))
        : escapeHtml(t('aiNoRulesExploratory'));
    const placeholder = matchedRuleCount > 0
        ? t('askAiPlaceholder')
        : t('askAiPlaceholderNoRules');

    container.innerHTML = `
        <div class="ai-grounding-note">${note}</div>
        <div class="ai-query-row">
            <input type="text" id="ai-query-input" class="ai-query-input" placeholder="${escapeHtml(placeholder)}" value="">
            <button id="ai-assistant-btn" class="ai-assistant-btn" type="button">
                🤖 ${escapeHtml(t('askAiAssistant'))}
            </button>
        </div>
    `;

    bindAiQuerySectionHandlers();
}

function bindAiQuerySectionHandlers() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiInput = document.getElementById('ai-query-input');

    if (!aiBtn || !aiInput) {
        return;
    }

    aiBtn.addEventListener('click', () => {
        const userQuery = aiInput.value.trim();
        if (userQuery) {
            callAiAssistant(userQuery);
        }
    });

    aiInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            aiBtn.click();
        }
    });
}

function searchProducts(query) {
    AppState.searchOrigin = 'electronics';
    const trimmedQuery = query ? query.trim() : '';
    const selections = getPrecheckSelections('precheck-panel');
    const results = searchWithPrecheck(trimmedQuery, selections, search);
    renderResults(trimmedQuery || t('allProducts'), results.tags, results.cases, selections);
}

/**
 * Render search results
 */
function renderResults(query, tags, cases, precheckSelections = []) {
    showView('result');
    // 清空旧的 AI 结果
    removeAiBox();

    const directionText = AppState.currentDirection === 'export' ? t('exportTitle') : t('importTitle');
    const resultSummary = document.querySelector('.result-summary p');
    if (resultSummary) {
        // XSS 修复：过滤查询词
        resultSummary.innerHTML = `${directionText}: ${t('foundRegulations')} <span id="result-count">${tags.length}</span> ${t('regulationsFor')} '<span id="search-term">${escapeHtml(query)}</span>'`;
    }

    AppState.lastReport = createReportPayload(query, tags, cases, precheckSelections);
    const precheckProfile = buildPrecheckProfile(precheckSelections, tags);
    AppState.aiContext = buildAiContext({
        productQuery: query,
        direction: AppState.currentDirection,
        precheckSelections,
        tags,
        cases,
        profile: precheckProfile
    });
    renderPrecheckSummary('precheck-summary-container', precheckSelections, tags);

    renderTrustBoundary('trust-boundary-container', {
        query,
        direction: AppState.currentDirection,
        tags,
        cases,
        precheckSelections,
        profile: precheckProfile
    });

    const aiQuerySection = document.getElementById('ai-query-section');
    renderAiQuerySection(aiQuerySection, {
        showAssistant: !isBrowseAllQuery(query) || precheckSelections.length > 0,
        matchedRuleCount: tags.length
    });

    const cardsContainer = document.getElementById('result-cards-container');
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';

    if (tags.length === 0) {
        // 检查是否超出范围
        const isOutOfRange = !checkSearchRange(query) && precheckSelections.length === 0;
        if (isOutOfRange) {
            cardsContainer.innerHTML = `<p style="text-align: center; color: var(--color-text-secondary); padding: 20px; line-height: 1.6;">${t('outOfRange')}</p>`;
        } else {
            cardsContainer.innerHTML = `<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">${t('noResults')}</p>`;
        }
        // 显示反馈链接
        const resultFeedbackSection = document.getElementById('result-feedback-section');
        if (resultFeedbackSection) {
            resultFeedbackSection.style.display = 'block';
        }
    } else {
        // 隐藏反馈链接
        const resultFeedbackSection = document.getElementById('result-feedback-section');
        if (resultFeedbackSection) {
            resultFeedbackSection.style.display = 'none';
        }
        const groupedTags = tags.reduce((acc, tag) => {
            const categoryLabel = getTagCategoryLabel(tag);
            if (!acc[categoryLabel]) {
                acc[categoryLabel] = {
                    category: categoryLabel,
                    categoryCode: tag.category || 'OTHER',
                    tags: []
                };
            }
            acc[categoryLabel].tags.push(tag);
            return acc;
        }, {});

        const fragment = document.createDocumentFragment();

        Object.values(groupedTags).forEach(group => {
            const theme = getCategoryTheme(group.categoryCode);
            const groupEl = document.createElement('div');
            groupEl.className = `result-category-group category-group collapsible-panel result-category-group--${theme.class}`;
            const ruleCount = group.tags.length;
            const ruleLabel = ruleCount === 1 ? 'rule' : 'rules';

            groupEl.innerHTML = `
                <button type="button" class="category-group-header collapsible-header" aria-expanded="false">
                    <span class="group-icon group-icon--themed" aria-hidden="true">${theme.icon}</span>
                    <span class="group-title">${escapeHtml(group.category)}</span>
                    <span class="group-count">${ruleCount} ${ruleLabel}</span>
                    <span class="arrow" aria-hidden="true">▶</span>
                </button>
                <div class="category-group-items result-category-items"></div>
            `;

            const itemsEl = groupEl.querySelector('.result-category-items');

            group.tags.forEach(tag => {
                const card = document.createElement('div');
                const safeTagType = escapeHtml(tag.tag_type || 'Unknown');
                const tagTypeClass = safeTagType.toLowerCase();
                card.className = `compliance-card collapsible-panel ${tagTypeClass}`;
                if (tag.tag_id) {
                    card.id = `tag-${tag.tag_id}`;
                }

                const hsCodes = tag.related_hs_codes ? escapeHtml(tag.related_hs_codes.join(', ')) : 'Not specified';
                const shortTagId = tag.tag_id ? escapeHtml(tag.tag_id.replace(/^CL-|-[0-9]+$/g, '')) : '';
                const cardLabel = escapeHtml(tag.short_name || shortTagId || tag.tag_id || 'Rule');
                const cardHint = escapeHtml(tag.short_description || '');

                card.innerHTML = `
                    <button type="button" class="compliance-card-header collapsible-header" aria-expanded="false">
                        <span class="compliance-tag ${tagTypeClass}">${safeTagType}</span>
                        <span class="compliance-card-header-text">
                            <span class="compliance-card-header-title">${cardLabel}</span>
                            ${cardHint ? `<span class="compliance-card-header-hint">${cardHint}</span>` : ''}
                        </span>
                        <span class="arrow" aria-hidden="true">▶</span>
                    </button>
                    <div class="compliance-card-body collapsible-body">
                        <div class="compliance-title">${shortTagId}: ${escapeHtml(tag.description)}</div>
                        <div class="compliance-desc">${escapeHtml(tag.short_description || tag.description || 'No details available')}</div>
                        ${tag.exemptions ? `<div class="compliance-extra exemptions-row">✔️ <strong>Exemptions:</strong> ${escapeHtml(tag.exemptions)}</div>` : ''}
                        ${tag.risk_scenarios ? `<div class="compliance-extra risk-row">⚠️ <strong>Risk Scenarios:</strong> ${escapeHtml(tag.risk_scenarios)}</div>` : ''}
                        <div class="compliance-hs"><strong>${t('hsCode')}:</strong> ${hsCodes}</div>
                        ${tag.source_citation ? `<div class="compliance-source"><strong>${t('source')}:</strong> <a href="${sanitizeUrl(tag.source_url)}" target="_blank">${escapeHtml(tag.source_citation)}</a></div>` : ''}
                    </div>
                `;
                itemsEl.appendChild(card);
            });

            fragment.appendChild(groupEl);
        });
        
        cardsContainer.appendChild(fragment);
    }

    const casesContainer = document.getElementById('cases-container');
    if (casesContainer) {
        if (cases.length === 0) {
            casesContainer.innerHTML = '';
        } else {
            const caseCards = cases.map(caseItem => `
                <div class="case-card collapsible-panel" ${caseItem.case_id ? `id="case-${escapeHtml(caseItem.case_id)}"` : ''}>
                    <button type="button" class="case-card-header collapsible-header" aria-expanded="false">
                        <span class="case-card-header-title">${escapeHtml(caseItem.title)}</span>
                        <span class="case-card-header-date">${escapeHtml(caseItem.date)}</span>
                        <span class="arrow" aria-hidden="true">▶</span>
                    </button>
                    <div class="case-card-body collapsible-body">
                        <div class="case-summary">${escapeHtml(caseItem.summary)}</div>
                        <a href="${sanitizeUrl(caseItem.source_url)}" target="_blank" class="case-link">${t('source')} ${escapeHtml(caseItem.source_url)}</a>
                    </div>
                </div>
            `).join('');

            const caseCount = cases.length;
            const caseLabel = caseCount === 1 ? 'case' : 'cases';

            casesContainer.innerHTML = `
                <div class="result-category-group cases-group collapsible-panel result-category-group--penalty-cases">
                    <button type="button" class="category-group-header collapsible-header" aria-expanded="false">
                        <span class="group-icon group-icon--themed" aria-hidden="true">⚖️</span>
                        <span class="group-title">${escapeHtml(t('relatedCases'))}</span>
                        <span class="group-count">${caseCount} ${caseLabel}</span>
                        <span class="arrow" aria-hidden="true">▶</span>
                    </button>
                    <div class="cases-group-body collapsible-body">${caseCards}</div>
                </div>
            `;
        }
    }
}
