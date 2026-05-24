function searchProducts(query) {
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

    const aiQuerySection = document.getElementById('ai-query-section');
    const isInRange = checkSearchRange(query) || precheckSelections.length > 0;
    const hasMatchedRules = tags.length > 0;
    if (aiQuerySection) {
        if (isInRange && hasMatchedRules) {
            aiQuerySection.innerHTML = `
                <div class="ai-grounding-note">${escapeHtml(t('aiBasedOnRules', { count: tags.length }))}</div>
                <div style="display: flex; gap: 10px; margin: 15px 0; align-items: center;">
                    <input type="text" id="ai-query-input" style="flex: 1; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.2s;" placeholder="${t('askAiPlaceholder')}" value="">
                    <button id="ai-assistant-btn" class="ai-assistant-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3); transition: transform 0.2s, box-shadow 0.2s; white-space: nowrap;">
                        🤖 ${t('askAiAssistant')}
                    </button>
                </div>
            `;
        } else if (isInRange && !hasMatchedRules) {
            aiQuerySection.innerHTML = `<div class="ai-no-rules-note">${escapeHtml(t('aiNoMatchedRules'))}</div>`;
        } else {
            aiQuerySection.innerHTML = '';
        }
    }

    if (isInRange && hasMatchedRules) {
        const aiBtn = document.getElementById('ai-assistant-btn');
        const aiInput = document.getElementById('ai-query-input');

        if (aiBtn && aiInput) {
            aiBtn.addEventListener('click', () => {
                const userQuery = aiInput.value.trim();
                if (userQuery) {
                    callAiAssistant(userQuery);
                }
            });

            aiInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    aiBtn.click();
                }
            });
        }
    }

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
                acc[categoryLabel] = { category: categoryLabel, tags: [] };
            }
            acc[categoryLabel].tags.push(tag);
            return acc;
        }, {});

        const fragment = document.createDocumentFragment();

        Object.values(groupedTags).forEach(group => {
            const categoryHeader = document.createElement('h3');
            categoryHeader.style = 'margin: 20px 0 12px; color: var(--color-primary); font-size: 1.1rem;';
            categoryHeader.textContent = group.category;
            fragment.appendChild(categoryHeader);

            group.tags.forEach(tag => {
                const card = document.createElement('div');
                const safeTagType = escapeHtml(tag.tag_type || 'Unknown');
                card.className = `compliance-card ${safeTagType.toLowerCase()}`;
                if (tag.tag_id) {
                    card.id = `tag-${tag.tag_id}`;
                }
                
                const hsCodes = tag.related_hs_codes ? escapeHtml(tag.related_hs_codes.join(', ')) : 'Not specified';
                const shortTagId = tag.tag_id ? escapeHtml(tag.tag_id.replace(/^CL-|-[0-9]+$/g, '')) : '';
                
                // 全部使用 escapeHtml，且处理 source URL
                card.innerHTML = `
                    <span class="compliance-tag ${safeTagType.toLowerCase()}">${safeTagType}</span>
                    <div class="compliance-title">${shortTagId}: ${escapeHtml(tag.description)}</div>
                    <div class="compliance-desc">${escapeHtml(tag.short_description || tag.description || 'No details available')}</div>
                    ${tag.exemptions ? `<div class="compliance-extra exemptions-row">✔️ <strong>Exemptions:</strong> ${escapeHtml(tag.exemptions)}</div>` : ''}
                    ${tag.risk_scenarios ? `<div class="compliance-extra risk-row">⚠️ <strong>Risk Scenarios:</strong> ${escapeHtml(tag.risk_scenarios)}</div>` : ''}
                    <div class="compliance-hs"><strong>${t('hsCode')}:</strong> ${hsCodes}</div>
                    ${tag.source_citation ? `<div class="compliance-source"><strong>${t('source')}:</strong> <a href="${sanitizeUrl(tag.source_url)}" target="_blank">${escapeHtml(tag.source_citation)}</a></div>` : ''}
                `;
                fragment.appendChild(card);
            });
        });
        
        cardsContainer.appendChild(fragment);
    }

    const casesContainer = document.getElementById('cases-container');
    if (casesContainer) {
        if (cases.length === 0) {
            casesContainer.innerHTML = '';
        } else {
            casesContainer.innerHTML = `
            <div class="cases-header">${t('relatedCases')}</div>
            ${cases.map(caseItem => `
                <div class="case-card" ${caseItem.case_id ? `id="case-${escapeHtml(caseItem.case_id)}"` : ''}>
                    <div class="case-title">${escapeHtml(caseItem.title)}</div>
                    <div class="case-date">${escapeHtml(caseItem.date)}</div>
                    <div class="case-summary">${escapeHtml(caseItem.summary)}</div>
                    <a href="${sanitizeUrl(caseItem.source_url)}" target="_blank" class="case-link">${t('source')} ${escapeHtml(caseItem.source_url)}</a>
                </div>
            `).join('')}
            `;
        }
    }

    renderTrustBoundary('trust-boundary-container', {
        query,
        direction: AppState.currentDirection,
        tags,
        cases,
        precheckSelections,
        profile: precheckProfile
    });
}
