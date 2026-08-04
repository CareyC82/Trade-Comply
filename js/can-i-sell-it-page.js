'use strict';

function bootstrapCanISellItPage() {
    const engine = globalThis.TradeComplyCanISellIt;
    const form = document.getElementById('sell-check-form');
    const followUp = document.getElementById('sell-follow-up');
    const followUpForm = document.getElementById('sell-follow-up-form');
    const questions = document.getElementById('sell-follow-up-questions');
    const followUpTitle = document.getElementById('sell-follow-up-title');
    const followUpCopy = document.getElementById('sell-follow-up-copy');
    const followUpSubmit = document.getElementById('sell-follow-up-submit');
    const documentOptions = document.getElementById('sell-document-options');
    const result = document.getElementById('sell-result');
    const error = document.getElementById('sell-check-error');
    const productTypeSelect = document.getElementById('sell-product-type');
    const evidenceFiles = document.getElementById('sell-evidence-files');
    const evidencePreview = document.getElementById('sell-evidence-preview');
    const advancedTools = document.getElementById('sell-advanced-tools');
    const advancedForm = document.getElementById('sell-advanced-form');
    const historyList = document.getElementById('sell-history-list');
    const historyEmpty = document.getElementById('sell-history-empty');
    const historyCard = document.querySelector('.sell-history-card');
    const models = globalThis.TradeComplyWearableModels;
    const accountForm = document.getElementById('sell-account-form');
    const accountSignedOut = document.getElementById('sell-account-signed-out');
    const accountSignedIn = document.getElementById('sell-account-signed-in');
    const accountEmail = document.getElementById('sell-account-email');
    const accountMessage = document.getElementById('sell-account-message');
    let currentInput = null;
    let dutyRates = null;
    let latestAssessment = null;
    let currentProfile = null;
    let currentAttributes = null;
    let currentQuickKeys = [];
    let currentEvidenceQuestions = [];
    let currentEvidenceAnswers = {};
    let currentConfirmedDocuments = [];
    let questionStage = 'facts';
    let currentUser = null;
    let history = [];
    let uploadedFiles = [];

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
        , mainsPowered: 'AC mains powered'
    };

    function quickQuestionKeys(profile, productType = profile.productType) {
        const material = engine.materialQuestionKeys(productType);
        const priorities = productType === 'charger'
            ? ['mainsPowered', 'wirelessCharging']
            : productType === 'kids_gps_watch' || productType === 'kids_electronics'
                ? ['childUse', 'cellular', 'cameraMic', 'battery']
                : profile.healthMonitoring === true
                    ? ['medicalClaim', 'battery', 'cellular', 'childUse']
                    : ['battery', 'cellular', 'bluetooth', 'wifi', 'medicalClaim'];
        const changesMaintainedResult = (key) => {
            if (key === 'cellular') return profile.bluetooth !== true && profile.wifi !== true;
            return ['battery', 'medicalClaim', 'childUse', 'cameraMic', 'mainsPowered', 'bluetooth', 'wifi'].includes(key);
        };
        return priorities
            .filter((key) => material.includes(key) && profile[key] === 'unknown' && changesMaintainedResult(key))
            .slice(0, 2);
    }

    function renderFactQuestions(profile, productType = profile.productType) {
        const keys = quickQuestionKeys(profile, productType);
        currentQuickKeys = keys;
        questionStage = 'facts';
        followUpTitle.textContent = 'Confirm product facts';
        followUpCopy.textContent = 'First confirm the facts that determine which rules apply. “Not sure” is fine.';
        followUpSubmit.textContent = 'Continue to evidence';
        questions.innerHTML = keys.map((key) => `
            <fieldset class="sell-question sell-question--fact">
                <legend>${escapeHtml(attributeLabels[key])}</legend>
                <small>Product fact — Yes may add requirements; it does not mean “pass”.</small>
                ${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="${key}" value="${value}" ${profile[key] === true && value === 'yes' ? 'checked' : profile[key] === false && value === 'no' ? 'checked' : ''}> ${key === 'childUse' && value === 'yes' ? 'Yes — children’s product' : key === 'childUse' && value === 'no' ? 'No — general audience' : value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure'}</label>`).join('')}
            </fieldset>`).join('');
        questions.hidden = keys.length === 0;
        document.getElementById('sell-assistant-follow-up').innerHTML = `<strong>Product facts</strong><p>${keys.length ? `Answer ${keys.length} product question${keys.length === 1 ? '' : 's'}. These answers determine which market evidence checks appear next.` : 'No additional product facts are needed for this description.'}</p>`;
        return keys;
    }

    function renderEvidenceQuestions(profile) {
        currentEvidenceQuestions = engine.evidenceQuestionsForRequirements(
            engine.marketRequirements(currentInput.market, profile)
        ).slice(0, 5);
        questionStage = 'evidence';
        followUpTitle.textContent = 'Confirm supplier evidence';
        followUpCopy.textContent = 'Only evidence that applies to the confirmed product is shown. Answer based on the exact model.';
        followUpSubmit.textContent = 'Show My Result';
        questions.innerHTML = currentEvidenceQuestions.map((item) => `
            <fieldset class="sell-question sell-question--evidence">
                <legend>${escapeHtml(item.label)}</legend>
                <small>Supplier claim — Yes means the supplier says this exact-model document is available; upload it for a model-match check.</small>
                ${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="evidence:${item.key}" value="${value}" required> ${value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure'}</label>`).join('')}
            </fieldset>`).join('');
        questions.hidden = currentEvidenceQuestions.length === 0;
        document.getElementById('sell-assistant-follow-up').innerHTML = `<strong>Applicable evidence</strong><p>${currentEvidenceQuestions.length ? `${currentEvidenceQuestions.length} exact-model evidence check${currentEvidenceQuestions.length === 1 ? '' : 's'} apply after reviewing your product facts.` : 'No product-specific approval evidence question applies; the result will retain classification and general-product caveats.'}</p>`;
        return currentEvidenceQuestions;
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

    async function api(path, options = {}) {
        const response = await fetch(`/api/consumer${path}`, {
            credentials: 'same-origin',
            ...options,
            headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        return payload;
    }

    async function refreshSession() {
        try {
            currentUser = (await api('/session')).user;
        } catch { currentUser = null; }
        accountSignedOut.hidden = Boolean(currentUser);
        accountSignedIn.hidden = !currentUser;
        accountEmail.textContent = currentUser?.email || '';
        historyCard.hidden = !currentUser;
        await loadHistory();
    }

    async function loadHistory() {
        history = currentUser ? (await api('/assessments')).assessments : [];
        renderHistory();
    }

    function renderHistory() {
        historyEmpty.hidden = history.length > 0;
        historyList.innerHTML = history.map((item) => `
            <article>
                <div><strong>${escapeHtml(item.productLabel)}</strong><span>${escapeHtml(item.market)} · ${escapeHtml(item.platform)} · ${escapeHtml(item.createdAt)}</span></div>
                <div><button type="button" data-history-open="${escapeHtml(item.id)}">Open</button><button type="button" data-history-delete="${escapeHtml(item.id)}">Delete</button></div>
            </article>`).join('');
        if (!currentUser) {
            historyEmpty.hidden = false;
            historyEmpty.textContent = 'Sign in to see your private assessment history.';
        } else {
            historyEmpty.textContent = 'No saved assessments yet.';
        }
    }

    function printAssessment() {
        if (!latestAssessment) return;
        document.body.classList.add('sell-print-mode');
        window.print();
        setTimeout(() => document.body.classList.remove('sell-print-mode'), 500);
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
        const evidenceRows = assessment.supplierEvidence.length
            ? assessment.supplierEvidence.map((item) => `<li><strong>${escapeHtml(item.kind)} — ${escapeHtml(item.name)}</strong><span>${escapeHtml(item.status.replaceAll('_', ' '))}: ${escapeHtml(item.note)}</span></li>`).join('')
            : '<li><strong>No supplier files uploaded</strong><span>Upload the exact-model reports before committing inventory.</span></li>';
        const platformCards = assessment.platformRules.length
            ? assessment.platformRules.map((rule) => `<article class="sell-requirement"><span>Platform rule</span><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.action)}</p>${renderSources({ sources: [rule.source] })}</article>`).join('')
            : '<p class="sell-panel-note">No maintained platform-specific rule is available for this channel. Legal market-access checks still apply.</p>';
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
        const conclusion = assessment.consumerConclusion;
        const commercial = assessment.commercialConclusion;
        const platformDecision = assessment.platformDecision;
        const commercialPanel = commercial.code === 'not_calculated' ? '' : `
            <section class="sell-commercial-answer sell-commercial-answer--${escapeHtml(commercial.code)}">
                <div><span>Commercial viability</span><strong>${escapeHtml(commercial.answer)}</strong><h2>${escapeHtml(commercial.label)}</h2><p>${escapeHtml(commercial.reason)}</p></div>
                ${assessment.economics ? `<div class="sell-commercial-metrics">
                    <article><span>Landed cost / unit</span><strong>${money(assessment.economics.landedUnit, assessment.economics.currency)}</strong></article>
                    <article><span>Contribution / unit</span><strong>${money(assessment.economics.profitUnit, assessment.economics.currency)}</strong></article>
                    <article><span>Break-even price</span><strong>${money(assessment.economics.breakEvenPrice, assessment.economics.currency)}</strong></article>
                </div>` : ''}
            </section>`;
        const platformPanel = `
            <section class="sell-platform-answer sell-platform-answer--${escapeHtml(platformDecision.code)}">
                <span>Can I list it on ${escapeHtml(currentInput.platform)}?</span>
                <strong>${escapeHtml(platformDecision.answer)}</strong>
                <h2>${escapeHtml(platformDecision.label)}</h2>
                <p>${escapeHtml(platformDecision.reason)}</p>
            </section>`;
        result.innerHTML = `
            <section class="sell-final-answer sell-final-answer--${escapeHtml(conclusion.code)}">
                <span>Can I sell it?</span>
                <strong>${escapeHtml(conclusion.answer)}</strong>
                <h2>${escapeHtml(conclusion.label)}</h2>
                <p>${escapeHtml(conclusion.reason)}</p>
            </section>
            ${platformPanel}
            <div class="sell-answer-summary">
                <article><span>Market</span><strong>${escapeHtml(currentInput.market)}</strong></article>
                <article><span>Product</span><strong>${escapeHtml(assessment.product.label)}</strong></article>
                <article><span>Sales channel</span><strong>${escapeHtml(currentInput.platform)}</strong></article>
                <article><span>Shipping</span><strong>${escapeHtml(assessment.shipping)}</strong></article>
            </div>
            <section class="sell-decision-trace"><span>Why this result</span><ol>${assessment.decisionTrace.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section>
            ${commercialPanel}
            <details class="sell-result-details"><summary>View technical basis and document checklist</summary>
                ${economicsPanel}
                <section class="sell-result-panel"><h2>Candidate HS and maintained tariff signals</h2><p class="sell-panel-note">${escapeHtml(assessment.product.hsNote)}</p><ul class="sell-gap-list">${tariffRows}</ul></section>
                <section class="sell-result-panel"><h2>What applies to this product</h2><div class="sell-requirement-grid">${requirementCards}</div></section>
                <section class="sell-result-panel"><h2>Supplier document gaps</h2><ul class="sell-gap-list">${gaps}</ul></section>
                <section class="sell-result-panel"><h2>Uploaded supplier evidence</h2><ul class="sell-gap-list">${evidenceRows}</ul></section>
                <section class="sell-result-panel"><h2>${escapeHtml(currentInput.platform)} listing readiness</h2><div class="sell-requirement-grid">${platformCards}</div></section>
                <section class="sell-result-panel"><h2>Put these conditions in the purchase order</h2><ol class="sell-action-list">${assessment.contractConditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join('')}</ol></section>
                <section class="sell-result-panel"><h2>What to do next</h2><ol class="sell-action-list">${assessment.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol></section>
                <section class="sell-result-panel sell-assistant-result"><h2>Ask the assessment assistant</h2><p>${escapeHtml(assessment.assistant.summary)}</p><div>${assessment.assistant.answerPrompts.map((prompt) => `<button type="button" data-assistant-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}</div><p id="sell-assistant-answer" class="sell-panel-note"></p></section>
            </details>
            <div class="sell-result-actions"><button type="button" id="sell-save-assessment">Save this result (optional)</button><button type="button" id="sell-print-assessment">Print / Save PDF</button></div>
            <div class="sell-trust-note"><strong>How to use this:</strong> do not place a purchase order solely from this result. Final duty requires exact HS classification; certifications must match the exact model, radio module, battery, and listing claims.</div>`;
        latestAssessment = assessment;
        result.hidden = false;
        advancedTools.hidden = false;
        document.getElementById('sell-save-assessment')?.addEventListener('click', () => {
            if (!currentUser) {
                accountMessage.textContent = 'Sign in here only if you want to save this result.';
                advancedTools.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            api('/assessments', { method: 'POST', body: JSON.stringify({
                productLabel: assessment.product.label,
                market: currentInput.market,
                platform: currentInput.platform,
                input: { ...currentInput, dutyRates: undefined },
                assessment
            }) }).then(loadHistory).catch((failure) => { accountMessage.textContent = failure.message; });
        });
        document.getElementById('sell-print-assessment')?.addEventListener('click', printAssessment);
        document.querySelectorAll('[data-assistant-prompt]').forEach((button) => {
            button.addEventListener('click', async () => {
                const prompt = button.dataset.assistantPrompt;
                const target = document.getElementById('sell-assistant-answer');
                if (!currentUser) { target.textContent = 'Sign in to use the AI Assistant.'; return; }
                target.textContent = 'Reviewing this assessment…';
                try {
                    const response = await api('/assistant', { method: 'POST', body: JSON.stringify({ question: prompt, assessment }) });
                    target.textContent = response.answer;
                } catch (failure) { target.textContent = failure.message; }
            });
        });
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
        currentProfile = profile;
        productTypeSelect.innerHTML = models.listProducts().map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === profile.productType ? 'selected' : ''}>${escapeHtml(product.label)}</option>`).join('');
        const factKeys = renderFactQuestions(profile, profile.productType);
        renderDocumentOptions(currentInput.market, profile);
        result.hidden = true;
        advancedTools.hidden = true;
        if (factKeys.length === 0) {
            currentAttributes = resolvedAttributes(new FormData(followUpForm));
            const resolvedProfile = engine.assess({ ...currentInput, attributes: currentAttributes, assessmentMode: 'quick', blockingQuestionKeys: [] }).profile;
            renderEvidenceQuestions(resolvedProfile);
            followUp.hidden = false;
            followUp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            followUp.hidden = false;
            followUp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    function resolvedAttributes(data) {
        const productType = data.get('productType') || currentProfile.productType;
        const attributes = { productType };
        engine.materialQuestionKeys(productType).forEach((key) => {
            const answer = data.get(key);
            const inferred = currentProfile[key];
            attributes[key] = answer || (inferred === true ? 'yes' : inferred === false ? 'no' : 'unknown');
        });
        return attributes;
    }

    function resolvedEvidence(data) {
        return Object.fromEntries(currentEvidenceQuestions.map((item) => [
            item.key,
            { label: item.label, value: data.get(`evidence:${item.key}`) || 'unknown' }
        ]));
    }

    function confirmedDocuments(data) {
        return currentEvidenceQuestions
            .filter((item) => data.get(`evidence:${item.key}`) === 'yes')
            .flatMap((item) => item.docs);
    }

    followUpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(followUpForm);
        if (questionStage === 'facts') {
            currentAttributes = resolvedAttributes(data);
            const resolvedProfile = engine.assess({
                ...currentInput,
                attributes: currentAttributes,
                assessmentMode: 'quick',
                blockingQuestionKeys: currentQuickKeys
            }).profile;
            renderEvidenceQuestions(resolvedProfile);
            renderDocumentOptions(currentInput.market, resolvedProfile);
            followUp.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        currentEvidenceAnswers = resolvedEvidence(data);
        currentConfirmedDocuments = confirmedDocuments(data);
        renderAssessment(engine.assess({
            ...currentInput,
            attributes: currentAttributes,
            documents: currentConfirmedDocuments,
            evidenceAnswers: currentEvidenceAnswers,
            supplierEvidence: { files: [] },
            assessmentMode: 'quick',
            blockingQuestionKeys: currentQuickKeys
        }));
    });

    advancedForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(advancedForm);
        const costKeys = ['currency', 'quantity', 'purchaseUnit', 'saleUnit', 'freightTotal', 'insuranceTotal', 'otherImportTotal', 'dutyRate', 'importTaxRate', 'platformFeeRate', 'otherSellingUnit'];
        const costs = Object.fromEntries(costKeys.map((key) => [key, data.get(key)]));
        uploadedFiles = [];
        const sourceFiles = Array.from(evidenceFiles.files || []);
        if (sourceFiles.length && !currentUser) {
            accountMessage.textContent = 'Sign in to upload and parse supplier evidence. The assessment can continue without the files.';
        } else if (sourceFiles.length) {
            evidencePreview.innerHTML = '<span>Securely uploading and parsing files…</span>';
            for (const file of sourceFiles) {
                try {
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
                    });
                    const saved = await api('/files', { method: 'POST', body: JSON.stringify({ name: file.name, type: file.type, data: dataUrl, expectedModel: data.get('requiredModel') }) });
                    const parsed = await api(`/files/${encodeURIComponent(saved.file.id)}/parse`, { method: 'POST', body: '{}' });
                    uploadedFiles.push({
                        name: file.name, type: file.type, size: file.size, status: parsed.file.status,
                        parsing: parsed.file.parsing,
                        note: parsed.file.parsing?.modelMatch === false
                            ? 'Extracted model does not match your ordered model.'
                            : `Parsed with ${parsed.file.parsing?.engine || 'document parser'}; extracted ${[
                                parsed.file.parsing?.model && 'model', parsed.file.parsing?.manufacturer && 'manufacturer',
                                parsed.file.parsing?.reportNumber && 'report number', parsed.file.parsing?.reportDate && 'date',
                                parsed.file.parsing?.standards?.length && 'standards'
                            ].filter(Boolean).join(', ') || 'no key fields'}.${parsed.file.parsing?.missingFields?.length ? ` Missing: ${parsed.file.parsing.missingFields.join(', ')}.` : ''}`
                    });
                } catch (failure) {
                    uploadedFiles.push({ name: file.name, type: file.type, size: file.size, status: 'verification_failed', note: failure.message });
                }
            }
            evidencePreview.innerHTML = uploadedFiles.map((file) => `<span>${escapeHtml(file.name)} · ${escapeHtml(file.status.replaceAll('_', ' '))} · ${escapeHtml(file.note)}</span>`).join('');
        }
        const files = uploadedFiles.length ? uploadedFiles : sourceFiles.map((file) => ({ name: file.name, type: file.type, size: file.size }));
        renderAssessment(engine.assess({
            ...currentInput,
            attributes: currentAttributes,
            documents: Array.from(new Set([...currentConfirmedDocuments, ...data.getAll('documents')])),
            evidenceAnswers: currentEvidenceAnswers,
            costs,
            supplierEvidence: {
                files,
                requiredModel: data.get('requiredModel'),
                supplierModel: data.get('supplierModel'),
                documentText: data.get('documentText')
            },
            assessmentMode: 'quick',
            blockingQuestionKeys: currentQuickKeys
        }));
    });

    productTypeSelect.addEventListener('change', () => {
        const profile = engine.extractProfile(document.getElementById('sell-description').value);
        profile.productType = productTypeSelect.value;
        currentProfile = profile;
        renderFactQuestions(profile, productTypeSelect.value);
        renderDocumentOptions(currentInput.market, profile);
    });

    fetch('data/duty-rates.json')
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => { dutyRates = payload; })
        .catch(() => { dutyRates = null; });

    evidenceFiles.addEventListener('change', () => {
        const files = Array.from(evidenceFiles.files || []);
        evidencePreview.innerHTML = files.length
            ? files.map((file) => `<span>${escapeHtml(file.name)} · ${(file.size / 1024).toFixed(1)} KB · pending verification</span>`).join('')
            : '';
    });

    historyList.addEventListener('click', async (event) => {
        const openId = event.target.closest('[data-history-open]')?.dataset.historyOpen;
        const deleteId = event.target.closest('[data-history-delete]')?.dataset.historyDelete;
        if (deleteId) {
            await api(`/assessments/${encodeURIComponent(deleteId)}`, { method: 'DELETE' });
            await loadHistory();
        } else if (openId) {
            const record = history.find((item) => item.id === openId);
            if (record) {
                currentInput = record.input;
                latestAssessment = record.assessment;
                renderAssessment(record.assessment);
            }
        }
    });

    accountForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(accountForm);
        const action = event.submitter?.value === 'register' ? 'register' : 'login';
        accountMessage.textContent = action === 'register' ? 'Creating your private workspace…' : 'Signing in…';
        try {
            await api(`/${action}`, { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
            accountForm.reset(); accountMessage.textContent = 'Your private workspace is ready.';
            await refreshSession();
        } catch (failure) { accountMessage.textContent = failure.message; }
    });
    document.getElementById('sell-account-logout').addEventListener('click', async () => {
        await api('/logout', { method: 'POST' }); accountMessage.textContent = 'Signed out.'; await refreshSession();
    });
    document.getElementById('sell-delete-account').addEventListener('click', async () => {
        if (!confirm('Permanently delete your account, assessments, and uploaded evidence files?')) return;
        await api('/account', { method: 'DELETE' }); accountMessage.textContent = 'Your account and private data were deleted.'; await refreshSession();
    });

    refreshSession().catch(() => {
        accountMessage.textContent = 'Private workspace server is unavailable. Start it with npm run dev:consumer.';
        renderHistory();
    });
}
