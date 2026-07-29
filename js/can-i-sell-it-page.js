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
    let currentInput = null;

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

    function renderQuestions(profile) {
        const all = [
            ['bluetooth', 'Bluetooth'], ['wifi', 'Wi-Fi'], ['cellular', 'Cellular / eSIM'],
            ['battery', 'Rechargeable lithium battery'], ['healthMonitoring', 'Health / biometric monitoring'],
            ['medicalClaim', 'Medical claim'], ['childUse', 'Designed for children'], ['cameraMic', 'Camera / microphone']
        ];
        questions.innerHTML = all.map(([key, label]) => `
            <fieldset class="sell-question">
                <legend>${escapeHtml(label)}</legend>
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

    function renderAssessment(assessment) {
        const requirementCards = assessment.requirements.map((item) => `
            <article class="sell-requirement ${item.severity === 'high' ? 'sell-requirement--high' : ''}">
                <span>${item.severity === 'high' ? 'Specialist check' : 'Required check'}</span>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p>
            </article>`).join('');
        const gaps = assessment.documentGaps.length
            ? assessment.documentGaps.map((gap) => `<li><strong>${escapeHtml(gap.document)}</strong><span>${escapeHtml(gap.requirement)}</span></li>`).join('')
            : '<li><strong>No document gaps selected by this pre-check</strong><span>Still verify every file against the exact model and supplier.</span></li>';
        result.innerHTML = `
            <div class="sell-verdict ${verdictClass(assessment.verdict)}">
                <div><span>${assessment.coverage === 'deep' ? 'Deep market screen' : 'Basic market screen'}</span><h2>${escapeHtml(assessment.verdictLabel)}</h2></div>
                <p>${escapeHtml(assessment.disclaimer)}</p>
            </div>
            <div class="sell-readiness-grid">
                <article><span>Market access</span><strong>${assessment.requirements.some((item) => item.severity === 'high') ? 'Specialist review' : 'Conditional'}</strong></article>
                <article><span>Small Parcel Check</span><strong>${escapeHtml(assessment.shipping)}</strong></article>
                <article><span>Platform readiness</span><strong>Evidence required</strong><small>${escapeHtml(assessment.platform)}</small></article>
            </div>
            <section class="sell-result-panel"><h2>What applies to this product</h2><div class="sell-requirement-grid">${requirementCards}</div></section>
            <section class="sell-result-panel"><h2>Supplier document gaps</h2><ul class="sell-gap-list">${gaps}</ul></section>
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
            platform: document.getElementById('sell-platform').value
        };
        const profile = engine.extractProfile(description);
        renderQuestions(profile);
        renderDocumentOptions(currentInput.market, profile);
        followUp.hidden = false;
        result.hidden = true;
        followUp.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    followUpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(followUpForm);
        const attributes = {};
        ['bluetooth', 'wifi', 'cellular', 'battery', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic']
            .forEach((key) => { attributes[key] = data.get(key) || 'unknown'; });
        renderAssessment(engine.assess({
            ...currentInput,
            attributes,
            documents: data.getAll('documents')
        }));
    });
}
