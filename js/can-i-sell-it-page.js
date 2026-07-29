'use strict';

function bootstrapCanISellItPage() {
    const engine = globalThis.TradeComplyCanISellIt;
    const form = document.getElementById('sell-check-form');
    const followUp = document.getElementById('sell-follow-up');
    const followUpForm = document.getElementById('sell-follow-up-form');
    const questions = document.getElementById('sell-follow-up-questions');
    const documentOptions = document.getElementById('sell-document-options');
    const result = document.getElementById('sell-result');
    const error = document.getElementById('sell-check-error');
    const productTypeSelect = document.getElementById('sell-product-type');
    const models = globalThis.TradeComplyWearableModels;
    let currentInput = null;
    let dutyRates = null;

    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));

    const labels = {
        fcc: 'FCC evidence', red: 'CE / RED file', rohs: 'RoHS / REACH evidence',
        battery: 'UN38.3 / SDS', fda: 'FDA pathway evidence', mdr: 'MDR evidence',
        children: 'Children / privacy evidence', privacy: 'Privacy and claims evidence',
        privacy_features: 'Recording-feature disclosures', classification: 'Classification evidence',
        local_radio: 'Local radio approval'
    };

    const attributeLabels = {
        bluetooth: 'Bluetooth', wifi: 'Wi-Fi', cellular: 'Cellular / eSIM',
        battery: 'Rechargeable lithium battery', healthMonitoring: 'Health / biometric monitoring',
        medicalClaim: 'Medical claim', childUse: 'Designed for children', cameraMic: 'Camera / microphone',
        gps: 'GPS / location tracking', display: 'Screen / projected display',
        wirelessCharging: 'Wireless charging', noiseCancellation: 'Active noise cancellation'
    };

    function renderQuestions(profile, productType = profile.productType) {
        questions.innerHTML = engine.materialQuestionKeys(productType).map((key) => `
            <fieldset class="sell-question">
                <legend>${escapeHtml(attributeLabels[key])}</legend>
                ${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="${key}" value="${value}" ${profile[key] === true && value === 'yes' ? 'checked' : profile[key] === false && value === 'no' ? 'checked' : profile[key] === 'unknown' && value === 'unknown' ? 'checked' : ''}> ${value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure'}</label>`).join('')}
            </fieldset>`).join('');
    }

    function renderDocumentOptions(market, profile) {
        const preliminary = engine.assess({ ...currentInput, market, attributes: profile, documents: [] });
        documentOptions.innerHTML = preliminary.requirements.map((item) => `
            <label><input type="checkbox" name="documents" value="${escapeHtml(item.id)}"> ${escapeHtml(labels[item.id] || item.title)}</label>`).join('');
    }

    function verdictClass(verdict) {
        return ['high_risk', 'information_missing'].includes(verdict) ? 'sell-verdict--warning' : 'sell-verdict--conditional';
    }

    function money(value, currency) {
        return value === null || value === undefined
            ? 'Pending'
            : `${currency} ${Number(value).toFixed(2)}`;
    }

    function renderSources(item) {
        if (!item.sources?.length) return '';
        return `<div class="sell-source-list">${item.sources.map((source) => `
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">
                <strong>${escapeHtml(source.authority)}</strong>
                <span>${escapeHtml(source.title)} · reviewed ${escapeHtml(source.reviewedAt)} · ${escapeHtml(source.confidence)}</span>
            </a>`).join('')}</div>`;
    }

    function renderAssessment(assessment) {
        const requirementCards = assessment.requirements.map((item) => `
            <article class="sell-requirement ${item.severity === 'high' ? 'sell-requirement--high' : ''}">
                <span>${item.severity === 'high' ? 'Specialist check' : 'Required check'}</span>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p>${renderSources(item)}
            </article>`).join('');
        const gaps = assessment.documentGaps.length
            ? assessment.documentGaps.map((gap) => `<li><strong>${escapeHtml(gap.document)}</strong><span>${escapeHtml(gap.requirement)}</span></li>`).join('')
            : '<li><strong>No document gaps selected by this pre-check</strong><span>Still verify every file against the exact model and supplier.</span></li>';
        const tariffRows = assessment.tariffOptions.length
            ? assessment.tariffOptions.map((row) => `<li><strong>HS ${escapeHtml(row.hsCode)}</strong><span>${row.rate === null ? 'Rate not covered' : `${(row.rate * 100).toFixed(2)}% candidate signal`} · ${escapeHtml(row.exact ? 'exact-line source match' : row.sourceStatus)}${row.sourceUrl ? ` · <a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noopener">source</a>` : ''}</span></li>`).join('')
            : '<li><strong>No candidate HS yet</strong><span>Product-specific classification is required.</span></li>';
        const economics = assessment.economics;
        const economicsPanel = economics ? `
            <section class="sell-result-panel"><h2>Landed cost and margin estimate</h2>
                <div class="sell-economics-grid">
                    <article><span>Customs value</span><strong>${money(economics.customsValue, economics.currency)}</strong></article>
                    <article><span>Estimated duty</span><strong>${money(economics.duty, economics.currency)}</strong><small>${economics.dutyRate === null ? 'Rate missing' : `${(economics.dutyRate * 100).toFixed(2)}% · ${economics.dutyRateBasis}`}</small></article>
                    <article><span>Import tax / VAT</span><strong>${money(economics.importTax, economics.currency)}</strong><small>${(economics.importTaxRate * 100).toFixed(2)}% · ${economics.importTaxRateBasis}</small></article>
                    <article><span>Landed cost / unit</span><strong>${money(economics.landedUnit, economics.currency)}</strong></article>
                    <article><span>Contribution / unit</span><strong>${money(economics.profitUnit, economics.currency)}</strong></article>
                    <article><span>Contribution margin</span><strong>${economics.marginRate === null ? 'Pending' : `${(economics.marginRate * 100).toFixed(1)}%`}</strong></article>
                    <article><span>Break-even sale price</span><strong>${money(economics.breakEvenPrice, economics.currency)}</strong></article>
                </div><p class="sell-panel-note">${escapeHtml(economics.caveat)}</p>
            </section>` : '<section class="sell-result-panel"><h2>Landed cost and margin estimate</h2><p class="sell-panel-note">Add purchase price and expected selling price to calculate the commercial result.</p></section>';
        result.innerHTML = `
            <div class="sell-verdict ${verdictClass(assessment.verdict)}">
                <div><span>${assessment.coverage === 'deep' ? 'Deep market screen' : 'Basic market screen'}</span><h2>${escapeHtml(assessment.verdictLabel)}</h2></div>
                <p>${escapeHtml(assessment.disclaimer)}</p>
            </div>
            <section class="sell-procurement"><span>Procurement decision</span><h2>${escapeHtml(assessment.procurement.label)}</h2><p>${escapeHtml(assessment.procurement.reason)}</p></section>
            <div class="sell-readiness-grid">
                <article><span>Market access</span><strong>${assessment.requirements.some((item) => item.severity === 'high') ? 'Specialist review' : 'Conditional'}</strong></article>
                <article><span>Small Parcel Check</span><strong>${escapeHtml(assessment.shipping)}</strong></article>
                <article><span>Platform readiness</span><strong>Evidence required</strong><small>${escapeHtml(assessment.platform)}</small></article>
            </div>
            ${economicsPanel}
            <section class="sell-result-panel"><h2>Candidate HS and maintained tariff signals</h2><p class="sell-panel-note">${escapeHtml(assessment.product.hsNote)}</p><ul class="sell-gap-list">${tariffRows}</ul></section>
            <section class="sell-result-panel"><h2>What applies to this product</h2><div class="sell-requirement-grid">${requirementCards}</div></section>
            <section class="sell-result-panel"><h2>Supplier document gaps</h2><ul class="sell-gap-list">${gaps}</ul></section>
            <section class="sell-result-panel"><h2>Put these conditions in the purchase order</h2><ol class="sell-action-list">${assessment.contractConditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join('')}</ol></section>
            <section class="sell-result-panel"><h2>What to do next</h2><ol class="sell-action-list">${assessment.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol></section>
            <div class="sell-trust-note"><strong>How to use this:</strong> do not place a purchase order solely from this result. Final duty requires exact HS classification; certifications must match the exact model, radio module, battery, and listing claims.</div>`;
        result.hidden = false;
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.querySelectorAll('[data-example]').forEach((button) => {
        button.addEventListener('click', () => {
            document.getElementById('sell-description').value = button.dataset.example;
        });
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const description = document.getElementById('sell-description').value.trim();
        if (!description) {
            error.textContent = 'Please describe the product first.';
            error.hidden = false;
            return;
        }
        error.hidden = true;
        currentInput = {
            description,
            origin: document.getElementById('sell-origin').value,
            market: document.getElementById('sell-market').value,
            platform: document.getElementById('sell-platform').value,
            dutyRates
        };
        const profile = engine.extractProfile(description);
        productTypeSelect.innerHTML = models.listProducts().map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === profile.productType ? 'selected' : ''}>${escapeHtml(product.label)}</option>`).join('');
        renderQuestions(profile, profile.productType);
        renderDocumentOptions(currentInput.market, profile);
        followUp.hidden = false;
        result.hidden = true;
        followUp.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    followUpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(followUpForm);
        const attributes = { productType: data.get('productType') };
        engine.materialQuestionKeys(attributes.productType)
            .forEach((key) => { attributes[key] = data.get(key) || 'unknown'; });
        const costKeys = ['currency', 'quantity', 'purchaseUnit', 'saleUnit', 'freightTotal', 'insuranceTotal', 'otherImportTotal', 'dutyRate', 'importTaxRate', 'platformFeeRate', 'otherSellingUnit'];
        const costs = Object.fromEntries(costKeys.map((key) => [key, data.get(key)]));
        renderAssessment(engine.assess({
            ...currentInput,
            attributes,
            documents: data.getAll('documents'),
            costs
        }));
    });

    productTypeSelect.addEventListener('change', () => {
        const profile = engine.extractProfile(document.getElementById('sell-description').value);
        profile.productType = productTypeSelect.value;
        renderQuestions(profile, productTypeSelect.value);
        renderDocumentOptions(currentInput.market, profile);
    });

    fetch('data/duty-rates.json')
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => { dutyRates = payload; })
        .catch(() => { dutyRates = null; });
}
