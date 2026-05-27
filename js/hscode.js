const HSCODE_API_URL = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run';
const HSCODE_MIN_INTERVAL_MS = 15000;
const HSCODE_MAX_DESCRIPTION = 2000;

let lastClassifyAt = 0;
let classifyInFlight = false;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDescription() {
    const el = document.getElementById('hscode-description');
    return el ? el.value.trim() : '';
}

function setLoading(isLoading) {
    const btn = document.getElementById('hscode-submit-btn');
    const panel = document.getElementById('hscode-loading');
    if (btn) {
        btn.disabled = isLoading;
        btn.classList.toggle('is-loading', isLoading);
        btn.textContent = isLoading ? 'Classifying…' : 'Start Classification';
    }
    if (panel) {
        panel.hidden = !isLoading;
    }
}

function showError(message) {
    const box = document.getElementById('hscode-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
}

function hideError() {
    const box = document.getElementById('hscode-error');
    if (!box) return;
    box.hidden = true;
    box.textContent = '';
}

function hideResult() {
    const panel = document.getElementById('hscode-result');
    if (panel) panel.hidden = true;
}

function buildComplianceUrl(hscode) {
    const params = new URLSearchParams();
    params.set('hs', hscode);
    params.set('autoSearch', '1');
    return `index.html?${params.toString()}`;
}

function renderResult(classification) {
    const panel = document.getElementById('hscode-result');
    if (!panel) return;

    const hs = classification.hscode || '';
    const name = classification.official_name || '';
    const confidence = classification.confidence || '—';
    const reasoning = classification.reasoning || '';

    document.getElementById('hscode-result-code').textContent = hs;
    document.getElementById('hscode-result-name').textContent = name;
    document.getElementById('hscode-result-confidence').textContent = confidence;
    document.getElementById('hscode-result-reasoning').textContent = reasoning;

    const complianceLink = document.getElementById('hscode-compliance-link');
    if (complianceLink) {
        complianceLink.href = buildComplianceUrl(hs);
    }

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function classifyProduct() {
    if (classifyInFlight) {
        return;
    }

    const description = getDescription();
    hideError();
    hideResult();

    if (!description) {
        showError('Please enter a product description before classifying.');
        return;
    }

    if (description.length > HSCODE_MAX_DESCRIPTION) {
        showError(`Description is too long. Please keep it within ${HSCODE_MAX_DESCRIPTION} characters.`);
        return;
    }

    const now = Date.now();
    if (now - lastClassifyAt < HSCODE_MIN_INTERVAL_MS) {
        const waitSec = Math.ceil((HSCODE_MIN_INTERVAL_MS - (now - lastClassifyAt)) / 1000);
        showError(`Please wait ${waitSec} seconds before trying again.`);
        return;
    }

    classifyInFlight = true;
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
        const response = await fetch(HSCODE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                action: 'hscode_classify',
                description
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        if (!data.ok || !data.classification) {
            throw new Error(data.error || 'Invalid classification response');
        }

        lastClassifyAt = Date.now();
        renderResult(data.classification);
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('HS classify failed:', error);
        if (error.name === 'AbortError') {
            showError('Request timed out. Please try again or shorten the description.');
        } else {
            showError(error.message || 'Classification failed. Please try again.');
        }
    } finally {
        classifyInFlight = false;
        setLoading(false);
    }
}

function bindHsCodePage() {
    const form = document.getElementById('hscode-form');
    const textarea = document.getElementById('hscode-description');

    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            classifyProduct();
        });
    }

    if (textarea) {
        textarea.addEventListener('input', () => {
            const counter = document.getElementById('hscode-char-count');
            if (counter) {
                counter.textContent = `${textarea.value.length} / ${HSCODE_MAX_DESCRIPTION}`;
            }
        });
        textarea.dispatchEvent(new Event('input'));
    }
}

document.addEventListener('DOMContentLoaded', bindHsCodePage);
