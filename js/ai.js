async function callAiAssistant(query) {
    if (!query.trim()) {
        return;
    }

    if (!AppState.aiContext) {
        removeAiBox();
        createAiBox(t('aiError'), null);
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const context = expandAiContext(AppState.aiContext, query);
        const requestBody = JSON.stringify({
            query: query.trim(),
            context
        });

        updateAiButtonState(true);

        const response = await fetch('https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `API error: ${response.status}`;
            try {
                const errorPayload = await response.json();
                if (errorPayload?.error) {
                    errorMessage = errorPayload.error;
                }
            } catch (parseError) {
                // Keep the status-based message when the server error is not JSON.
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        handleAiResponse(data);
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('API Error:', error);
        removeAiBox();
        const fallback = t('aiError');
        const isNetworkError = error.name === 'AbortError'
            || /failed to fetch|network|cors/i.test(error.message || '');
        const diagnostic = isNetworkError
            ? `${fallback} The AI service may be blocked by browser network/CORS settings.`
            : `${fallback} ${error.message || ''}`.trim();
        createAiBox(diagnostic, null);
        updateAiButtonState(false);
    }
}

/**
 * Update AI button state
 */
function updateAiButtonState(isLoading) {
    const aiBtn = document.getElementById('ai-assistant-btn');
    if (aiBtn) {
        if (isLoading) {
            aiBtn.disabled = true;
            aiBtn.innerHTML = '⏳ ' + t('searching');
        } else {
            aiBtn.disabled = false;
            aiBtn.innerHTML = '🤖 ' + t('askAiAssistant');
        }
    }
}

/**
 * Handle AI response
 */
function handleAiResponse(data) {
    updateAiButtonState(false);

    const dynamicChecklist = typeof extractChecklistFromApiPayload === 'function'
        ? extractChecklistFromApiPayload(data)
        : (Array.isArray(data.checklist) ? data.checklist : []);

    if (dynamicChecklist.length > 0) {
        AppState.lastApiChecklist = dynamicChecklist;
        if (typeof mountComplianceChecklist === 'function') {
            mountComplianceChecklist('compliance-checklist-container', [], {
                aiChecklist: dynamicChecklist,
                country: AppState.currentCountry,
                direction: AppState.currentDirection,
                includeBaseline: false
            });
        }
    }

    if (data.response && data.response.trim()) {
        removeAiBox();
        createAiBox(data.response, data.grounding || null);
    } else if (data.error) {
        removeAiBox();
        createAiBox(t('aiError'), null);
    } else {
        removeAiBox();
        createAiBox(t('aiError'), null);
    }
}

/**
 * Remove AI box
 */
function removeAiBox() {
    const existingAiBox = document.querySelector('.ai-assistant-box');
    if (existingAiBox) existingAiBox.remove();
}

function scrollToCitation(citationId) {
    const target = document.getElementById(citationId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.transition = 'box-shadow 0.3s ease';
        target.style.boxShadow = '0 0 0 3px rgba(232, 168, 23, 0.45)';
        setTimeout(() => {
            target.style.boxShadow = '';
        }, 1800);
    }
}

function buildGroundingFooter(grounding) {
    if (!grounding) return '';

    const citedIds = [
        ...(grounding.cited_tag_ids || []),
        ...(grounding.cited_case_ids || [])
    ];

    if (citedIds.length === 0) {
        if (grounding.confidence === 'insufficient_context') {
            return `<div class="ai-sources">${escapeHtml(t('aiInsufficientContext'))}</div>`;
        }
        return '';
    }

    const links = citedIds.map(id => {
        const anchorId = id.startsWith('CASE-') ? `case-${id}` : `tag-${id}`;
        return `<a href="#" class="rule-cite" data-citation-id="${escapeHtml(anchorId)}">[${escapeHtml(id)}]</a>`;
    }).join(' ');

    let footer = `<div class="ai-sources"><strong>${escapeHtml(t('referenceSources'))}</strong> ${links}</div>`;

    if (grounding.confidence === 'partial') {
        footer += `<div class="ai-grounding-note">${escapeHtml(t('aiGeneralGuidance'))}</div>`;
    }

    return footer;
}

/**
 * Create AI box
 */
function createAiBox(content, grounding) {
    const aiBox = document.createElement('div');
    aiBox.className = 'ai-assistant-box';
    
    let formattedContent = escapeHtml(content);
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedContent = formattedContent.replace(/^(\d+\.\s+.+)$/gm, '<span class="ai-section-title">$1</span>');
    formattedContent = formattedContent.replace(/\[(CL-[A-Z]+-\d+|CASE-[A-Z0-9-]+)\]/g, (match, id) => {
        const anchorId = id.startsWith('CASE-') ? `case-${id}` : `tag-${id}`;
        return `<a href="#" class="rule-cite" data-citation-id="${anchorId}">[${id}]</a>`;
    });
    formattedContent = formattedContent.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    const sourcesHtml = buildGroundingFooter(grounding);

    aiBox.innerHTML = `<span class="ai-assistant-tag">${t('aiAssistant')}</span>
                       <div class="ai-assistant-content">
                         <p>${formattedContent}</p>
                       </div>
                       ${sourcesHtml}`;

    aiBox.querySelectorAll('.rule-cite').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            scrollToCitation(link.dataset.citationId);
        });
    });

    const resultSummary = document.querySelector('.result-summary');
    if (resultSummary && resultSummary.nextSibling) {
        document.getElementById('result-view').insertBefore(aiBox, resultSummary.nextSibling);
    }
}
