const POLICY_CORRECTION_API_URL = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run/';

function getActiveProductKeyword() {
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

function buildPolicyCorrectionPayload(form) {
    const productInput = form.querySelector('#pc-product-keyword');
    const policyTypeInput = form.querySelector('#pc-policy-type');
    const sourceUrlInput = form.querySelector('#pc-source-url');
    const messageInput = form.querySelector('#pc-user-message');

    const record = {
        product_keyword: productInput ? productInput.value.trim() : '',
        policy_type: policyTypeInput ? policyTypeInput.value.trim() : '',
        source_url: sourceUrlInput ? sourceUrlInput.value.trim() : '',
        user_message: messageInput ? messageInput.value.trim() : ''
    };

    return {
        query: encodeComplianceFeedbackQuery(record)
    };
}

function prefillPolicyCorrectionForm() {
    const productInput = document.getElementById('pc-product-keyword');
    if (!productInput) {
        return;
    }

    const activeQuery = getActiveProductKeyword();
    if (activeQuery) {
        productInput.value = activeQuery;
    }
}

function openPolicyCorrectionModal() {
    const modal = document.getElementById('policy-correction-modal');
    if (!modal) {
        return;
    }

    prefillPolicyCorrectionForm();
    modal.classList.add('open');
}

function closePolicyCorrectionModal() {
    const modal = document.getElementById('policy-correction-modal');
    const form = document.getElementById('policy-correction-form');
    const formWrap = document.getElementById('policy-correction-form-wrap');

    if (modal) {
        modal.classList.remove('open');
    }

    if (form) {
        form.reset();
    }

    if (formWrap) {
        formWrap.classList.remove('hide');
    }
}

function showPolicyCorrectionToast(message) {
    let toast = document.getElementById('policy-correction-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'policy-correction-toast';
        toast.className = 'policy-correction-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    window.clearTimeout(showPolicyCorrectionToast._timer);
    showPolicyCorrectionToast._timer = window.setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

async function submitPolicyCorrectionForm(form) {
    const payload = buildPolicyCorrectionPayload(form);
    const response = await fetch(POLICY_CORRECTION_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Policy correction API error: ${response.status}`);
    }
    if (data.message === 'Service Online' && !data.ok) {
        throw new Error('Policy correction API is not deployed yet. Please redeploy the FC function.');
    }

    if (data.debug) {
        console.warn('Policy correction API debug:', data.debug);
    }

    return data;
}

function bindPolicyCorrectionSubmit(form, modal) {
    if (!form || form.dataset.bound === 'true') {
        return;
    }

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitBtn = form.querySelector('.policy-correction-submit');
        const originalLabel = submitBtn ? submitBtn.textContent : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = t('policyCorrectionSubmitting');
        }

        try {
            await submitPolicyCorrectionForm(form);
            showPolicyCorrectionToast(t('policyCorrectionSuccess'));
            closePolicyCorrectionModal();
        } catch (error) {
            console.error('Policy correction submit failed:', error);
            const detail = error && error.message ? `\n\n${error.message}` : '';
            alert(`${t('policyCorrectionSubmitError')}${detail}`);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel || t('policyCorrectionSubmit');
            }
        }
    });

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closePolicyCorrectionModal();
            }
        });
    }
}

function bindPolicyCorrectionTriggers(root = document) {
    root.querySelectorAll('.policy-correction-trigger').forEach(trigger => {
        if (trigger.dataset.bound === 'true') {
            return;
        }

        trigger.dataset.bound = 'true';
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            openPolicyCorrectionModal();
        });
    });
}

function renderPolicyCorrectionSection(variant) {
    const label = variant === 'no_match'
        ? t('policyCorrectionBtnNoMatch')
        : t('policyCorrectionBtnHasResults');

    return `
        <a href="#" class="feedback-link report-action-link policy-correction-trigger" data-correction-variant="${escapeHtml(variant)}">
            ${escapeHtml(label)}
        </a>
    `;
}

function renderTrustBoundaryCorrectionCta() {
    return `
        <div class="trust-boundary-correction-cta">
            <a href="#" class="feedback-link policy-correction-trigger" data-correction-variant="no_match">
                ${escapeHtml(t('policyCorrectionBtnNoMatch'))}
            </a>
        </div>
    `;
}

function initPolicyCorrectionUi() {
    const modal = document.getElementById('policy-correction-modal');
    const form = document.getElementById('policy-correction-form');
    const cancelBtn = document.getElementById('policy-correction-cancel');

    bindPolicyCorrectionSubmit(form, modal);
    bindPolicyCorrectionTriggers(document);

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closePolicyCorrectionModal();
        });
    }
}
