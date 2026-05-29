/**
 * HS Code classifier page logic (hscode.html).
 */

const HSCODE_API_URL = 'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run?action=hscode_classify';
const HSCODE_MIN_INTERVAL_MS = 15000;
const HSCODE_MAX_DESCRIPTION = 2000;

let lastClassifyAt = 0;
let classifyInFlight = false;
let lastHsCode = '';
let lastHs6 = '';
let selectedDirection = 'export';
let selectedCountry = 'US';
let lastClassification = null;
let lastProductDescription = '';

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
        btn.textContent = isLoading ? 'Loading...' : 'Start Classification';
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
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.hidden = true;
}

function getSelectedDirection() {
    return selectedDirection === 'import' ? 'import' : 'export';
}

const FALLBACK_EXPORT_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'EU', label: 'European Union' },
    { value: 'ASEAN', label: 'ASEAN (Vietnam / Malaysia)' },
    { value: 'RU', label: 'Russia' },
    { value: 'GLOBAL', label: 'Other' }
];
const FALLBACK_IMPORT_OPTIONS = [
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'US', label: 'United States' },
    { value: 'GLOBAL', label: 'Other' }
];

function populateHscodeCountrySelect(direction) {
    const select = document.getElementById('hscode-trade-country');
    if (!select) {
        return;
    }

    let options = direction === 'import' ? FALLBACK_IMPORT_OPTIONS : FALLBACK_EXPORT_OPTIONS;
    let normalize = (value) => String(value || 'US').trim().toUpperCase();

    if (globalThis.TradeComplyCountry) {
        const api = globalThis.TradeComplyCountry;
        options = api.getCountryOptionsForDirection(direction);
        normalize = api.normalizeCountryCode;
    }

    const selected = normalize(selectedCountry);
    select.innerHTML = options.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
    select.value = options.some((o) => o.value === selected) ? selected : options[0].value;
    selectedCountry = select.value;
    select.disabled = false;
}

function bindDirectionToggle() {
    const exportBtn = document.getElementById('hscode-direction-export');
    const importBtn = document.getElementById('hscode-direction-import');
    const countrySelect = document.getElementById('hscode-trade-country');
    if (!exportBtn || !importBtn) {
        return;
    }

    const applyDirection = (direction) => {
        selectedDirection = direction === 'import' ? 'import' : 'export';
        exportBtn.classList.toggle('active', selectedDirection === 'export');
        importBtn.classList.toggle('active', selectedDirection === 'import');
        populateHscodeCountrySelect(selectedDirection);
    };

    exportBtn.addEventListener('click', () => applyDirection('export'));
    importBtn.addEventListener('click', () => applyDirection('import'));

    if (countrySelect) {
        countrySelect.addEventListener('change', () => {
            selectedCountry = countrySelect.value;
        });
    }

    populateHscodeCountrySelect(selectedDirection);
}

function buildComplianceUrl(hscode) {
    const digits = String(hscode || '').replace(/\D/g, '');
    const search = lastHs6 || (digits.length >= 6 ? digits.slice(0, 6) : digits);
    const params = new URLSearchParams();
    params.set('search', search);
    params.set('direction', getSelectedDirection());
    params.set('country', selectedCountry || 'US');
    if (lastClassification) {
        const china = lastClassification.china_code || lastClassification.hscode || '';
        const cp = lastClassification.counterparty_code || '';
        if (china) params.set('china_hs', china);
        if (cp) params.set('cp_hs', cp);
        if (lastClassification.official_name) {
            params.set('product', lastClassification.official_name);
        }
    }
    if (lastProductDescription) {
        params.set('desc', lastProductDescription.slice(0, 200));
    }
    return `index.html?${params.toString()}`;
}

function ensureComplianceChecklistContainer() {
    let container = document.getElementById('compliance-checklist-container');
    if (container) {
        return container;
    }
    const reasoningRow = document.querySelector('.hscode-result-row--reasoning');
    if (!reasoningRow || !reasoningRow.parentNode) {
        return null;
    }
    container = document.createElement('div');
    container.id = 'compliance-checklist-container';
    container.className = 'compliance-checklist-slot hscode-checklist-slot';
    container.hidden = true;
    container.setAttribute('aria-live', 'polite');
    reasoningRow.insertAdjacentElement('afterend', container);
    return container;
}

function renderHscodeChecklist(classification) {
    ensureComplianceChecklistContainer();
    const aiChecklist = classification.checklist || [];
    const options = {
        country: selectedCountry,
        direction: getSelectedDirection(),
        aiChecklist,
        includeBaseline: false
    };

    let checklist = [];
    if (typeof mountComplianceChecklist === 'function') {
        checklist = mountComplianceChecklist('compliance-checklist-container', [], options);
    } else if (globalThis.TradeComplyChecklist) {
        checklist = globalThis.TradeComplyChecklist.buildSessionChecklist({
            tags: [],
            aiChecklist,
            country: selectedCountry,
            direction: getSelectedDirection(),
            includeBaseline: false
        });
        if (typeof renderComplianceChecklistPanel === 'function') {
            renderComplianceChecklistPanel('compliance-checklist-container', checklist);
        }
    }

    if (aiChecklist.length > 0) {
        AppState.lastApiChecklist = aiChecklist;
    }
    AppState.complianceChecklist = checklist;
    AppState.checklistChecked = AppState.checklistChecked || {};
    AppState.hsContext = {
        chinaCode: classification.china_code || classification.hscode || '',
        counterpartyCode: classification.counterparty_code || '',
        counterpartyHsLabel: classification.counterparty_code_label || '',
        officialName: classification.official_name || '',
        productDescription: lastProductDescription,
        checklist
    };
}

function buildHscodePrintReport() {
    const countryApi = globalThis.TradeComplyCountry;
    const countryLabel = countryApi
        ? countryApi.getCountryLabel(selectedCountry)
        : selectedCountry;
    const flowLabel = typeof buildFlowLabel === 'function'
        ? buildFlowLabel(getSelectedDirection(), selectedCountry)
        : `CN → ${countryLabel}`;
    return {
        productQuery: lastClassification?.official_name || lastProductDescription || 'HS classification',
        flowLabel,
        generatedAtLabel: new Date().toLocaleString('en', {
            year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }),
        riskLabel: 'Medium',
        chinaHsCode: lastClassification?.china_code || lastHsCode || '—',
        counterpartyHsCode: lastClassification?.counterparty_code || '—',
        counterpartyHsLabel: lastClassification?.counterparty_code_label || `${countryLabel} HS`,
        riskSummaries: [{
            type: 'CLASSIFIED',
            riskLevel: 'Medium',
            title: lastClassification?.official_name || 'Product classification',
            description: (lastClassification?.reasoning || '').slice(0, 400)
        }],
        checklist: typeof getChecklistForReport === 'function'
            ? getChecklistForReport()
            : AppState.complianceChecklist || []
    };
}

function enrichResultClient(classification) {
    if (globalThis.TradeComplyHsDual) {
        return globalThis.TradeComplyHsDual.enrichClassification(classification, {
            direction: getSelectedDirection(),
            counterpartyCountry: selectedCountry
        });
    }
    return classification;
}

function renderResult(classification) {
    const panel = document.getElementById('hscode-result');
    if (!panel) return;

    const enriched = enrichResultClient(classification);
    const chinaCode = String(enriched.china_code || enriched.hscode || '').trim();
    const counterpartyCode = String(enriched.counterparty_code || '').trim();
    const name = String(enriched.official_name || '').trim();
    const confidence = String(enriched.confidence || '—').trim();
    const reasoning = String(enriched.reasoning || '').trim();
    const hs6 = String(enriched.hs6 || '').trim();

    lastClassification = enriched;
    lastHsCode = chinaCode || counterpartyCode;
    lastHs6 = hs6 || (globalThis.TradeComplyHsDual
        ? globalThis.TradeComplyHsDual.extractHs6(lastHsCode)
        : String(lastHsCode).replace(/\D/g, '').slice(0, 6));

    renderHscodeChecklist(enriched);

    const chinaLabelEl = document.getElementById('hscode-china-label');
    const chinaCodeEl = document.getElementById('hscode-china-code');
    const counterpartyLabelEl = document.getElementById('hscode-counterparty-label');
    const counterpartyCodeEl = document.getElementById('hscode-counterparty-code');
    const counterpartyCard = document.getElementById('hscode-counterparty-card');
    const hs6Hint = document.getElementById('hscode-hs6-hint');

    if (chinaLabelEl) {
        chinaLabelEl.textContent = enriched.china_code_label || '🇨🇳 China Export HS Code';
    }
    if (chinaCodeEl) {
        chinaCodeEl.textContent = chinaCode || '—';
    }
    if (counterpartyLabelEl) {
        counterpartyLabelEl.textContent = enriched.counterparty_code_label || 'Counterparty code';
    }
    if (counterpartyCodeEl) {
        counterpartyCodeEl.textContent = counterpartyCode || '—';
    }
    if (counterpartyCard) {
        counterpartyCard.hidden = !counterpartyCode;
    }
    if (hs6Hint) {
        if (hs6 && globalThis.TradeComplyHsDual) {
            const hs6Display = globalThis.TradeComplyHsDual.formatHs6Display(hs6);
            hs6Hint.hidden = false;
            hs6Hint.textContent = `Harmonized subheading (HS-6): ${hs6Display}`;
        } else {
            hs6Hint.hidden = true;
            hs6Hint.textContent = '';
        }
    }

    document.getElementById('hscode-result-name').textContent = name || '—';
    document.getElementById('hscode-result-confidence').textContent = confidence || '—';
    document.getElementById('hscode-result-reasoning').textContent = reasoning || '—';

    panel.hidden = false;
    panel.classList.remove('is-visible');
    requestAnimationFrame(() => {
        panel.classList.add('is-visible');
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function goToComplianceCheck() {
    if (!lastHsCode) {
        alert('No HS Code available yet. Please run classification first.');
        return;
    }
    window.location.href = buildComplianceUrl(lastHsCode);
}

async function classifyProduct() {
    if (classifyInFlight) {
        return;
    }

    const description = getDescription();
    lastProductDescription = description;
    hideError();
    hideResult();
    const checklistSlot = document.getElementById('compliance-checklist-container');
    if (checklistSlot) {
        checklistSlot.hidden = true;
        checklistSlot.innerHTML = '';
    }

    if (!description) {
        alert('Please enter a product description before starting classification.');
        return;
    }

    if (description.length > HSCODE_MAX_DESCRIPTION) {
        alert(`Description is too long. Please keep it within ${HSCODE_MAX_DESCRIPTION} characters.`);
        return;
    }

    const now = Date.now();
    if (now - lastClassifyAt < HSCODE_MIN_INTERVAL_MS) {
        const waitSec = Math.ceil((HSCODE_MIN_INTERVAL_MS - (now - lastClassifyAt)) / 1000);
        alert(`Please wait ${waitSec} seconds before trying again.`);
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
                description,
                direction: getSelectedDirection(),
                counterparty_country: selectedCountry
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        if (data.message === 'Service Online' && !data.ok) {
            throw new Error('HS Code API is not active on the server yet. Please wait for FC deploy to finish or retry in a minute.');
        }

        if (!data.ok || !data.classification) {
            throw new Error(data.error || data.detail || 'Invalid classification response');
        }

        lastClassifyAt = Date.now();
        renderResult(data.classification);
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('HS classify failed:', error);
        if (error.name === 'AbortError') {
            showError('Request timed out. Please try again or shorten the description.');
        } else if (
            error.name === 'TypeError'
            || /failed to fetch/i.test(error.message || '')
        ) {
            showError(
                'Cannot reach the HS classification API (server offline or CORS blocked). '
                + 'If you just deployed, wait 2–3 minutes for Alibaba FC to restart, then retry.'
            );
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
    const risksBtn = document.getElementById('hscode-check-risks-btn');
    const reportBtn = document.getElementById('hscode-download-report-btn');

    bindDirectionToggle();

    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            classifyProduct();
        });
    }

    if (risksBtn) {
        risksBtn.addEventListener('click', goToComplianceCheck);
    }

    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            if (!lastClassification) {
                alert('Run classification first to generate the report.');
                return;
            }
            if (typeof printEnterprisePrecheckReport === 'function') {
                printEnterprisePrecheckReport(buildHscodePrintReport());
            }
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

function bootstrapTradeComplyHscode() {
    bindHsCodePage();
    if (typeof renderQuickSelectGrid === 'function') {
        renderQuickSelectGrid('hscode-quick-select-container', {
            mode: 'hscode',
            defaultTrack: 'consumer'
        });
    }
}
