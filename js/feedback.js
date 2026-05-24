const FEEDBACK_API_URL = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run/feedback';

function getActiveSearchQuery() {
    const searchTermEl = document.getElementById('search-term');
    if (searchTermEl && searchTermEl.textContent.trim()) {
        return searchTermEl.textContent.trim();
    }

    const electronicsInput = document.getElementById('search-input');
    if (electronicsInput && electronicsInput.value.trim()) {
        return electronicsInput.value.trim();
    }

    const semiInput = document.getElementById('search-input-semi');
    if (semiInput && semiInput.value.trim()) {
        return semiInput.value.trim();
    }

    return '';
}

function deriveTrustStatus(productQuery, hadResults) {
    const inRange = checkSearchRange(productQuery);
    if (!inRange) return 'out_of_scope';
    if (!hadResults) return 'no_match';
    return 'screened';
}

function buildFeedbackPayload(form) {
    const productInput = form.querySelector('#fb-product');
    const messageInput = form.querySelector('#fb-message');
    const emailInput = form.querySelector('#fb-email');

    const productQuery = productInput ? productInput.value.trim() : '';
    const matchedRuleCount = AppState.aiContext?.match_count?.tags
        ?? AppState.lastReport?.tags?.length
        ?? 0;
    const matchedCaseCount = AppState.aiContext?.match_count?.cases
        ?? AppState.lastReport?.cases?.length
        ?? 0;
    const hadResults = matchedRuleCount > 0 || matchedCaseCount > 0;

    return {
        product_query: productQuery,
        regulation_needed: messageInput ? messageInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        direction: AppState.currentDirection || 'export',
        view: AppState.currentView || getCurrentView(),
        matched_tag_ids: AppState.aiContext?.tag_ids || [],
        matched_rule_count: matchedRuleCount,
        matched_case_count: matchedCaseCount,
        had_results: hadResults,
        risk_level: AppState.lastReport?.risk || AppState.aiContext?.risk_level || 'low',
        trust_status: deriveTrustStatus(productQuery, hadResults),
        selected_precheck_attributes: AppState.lastReport?.selectedAttributes || [],
        page_url: window.location.href,
        user_agent: navigator.userAgent
    };
}

function prefillFeedbackForm() {
    const productInput = document.getElementById('fb-product');
    if (!productInput || productInput.value.trim()) {
        return;
    }

    const activeQuery = getActiveSearchQuery();
    if (activeQuery) {
        productInput.value = activeQuery;
    }
}

function openFeedbackModal() {
    const feedbackModal = document.getElementById('feedback-modal');
    if (!feedbackModal) return;
    prefillFeedbackForm();
    feedbackModal.classList.add('open');
}

async function submitFeedbackForm(form) {
    const payload = buildFeedbackPayload(form);
    const response = await fetch(FEEDBACK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Feedback API error: ${response.status}`);
    }

    return data;
}

function bindFeedbackSubmit(form, feedbackThanks, feedbackFormDiv, feedbackModal) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitBtn = form.querySelector('.modal-submit');
        if (submitBtn) {
            submitBtn.disabled = true;
        }

        try {
            await submitFeedbackForm(form);
            feedbackFormDiv.classList.add('hide');
            feedbackThanks.classList.add('show');
            setTimeout(() => {
                feedbackModal.classList.remove('open');
                feedbackFormDiv.classList.remove('hide');
                feedbackThanks.classList.remove('show');
                form.reset();
            }, 2500);
        } catch (error) {
            console.error('Feedback submit failed:', error);
            alert(t('feedbackSubmitError'));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        }
    });
}
