'use strict';

function dedupeQuestionKeys(keys = []) {
    return Array.from(new Set(keys));
}

function supplierRequestText(request = {}) {
    return `${request.subject || 'Supplier documents required'}\n\n${request.message || ''}`.trim();
}

function supplierRequestFilename(productLabel = 'product', market = '') {
    const safe = `${productLabel}-${market || 'market'}-supplier-document-request`
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${safe || 'supplier-document-request'}.txt`;
}

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
    const improveQuestions = document.getElementById('sell-improve-questions');
    const result = document.getElementById('sell-result');
    const error = document.getElementById('sell-check-error');
    const productTypeSelect = document.getElementById('sell-product-type');
    const evidenceFiles = document.getElementById('sell-evidence-files');
    const evidencePreview = document.getElementById('sell-evidence-preview');
    const fccIdInput = document.getElementById('sell-fcc-id');
    const fccLookupButton = document.getElementById('sell-fcc-lookup');
    const fccLookupResult = document.getElementById('sell-fcc-result');
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
    const marketSelect = document.getElementById('sell-market');
    const exactHsSingleField = document.getElementById('sell-exact-hs-single-field');
    const exactHsAuField = document.getElementById('sell-exact-hs-au-field');
    const exactHsNzField = document.getElementById('sell-exact-hs-nz-field');
    let currentInput = null;
    let dutyRates = null;
    let latestAssessment = null;
    let latestAssessmentInput = null;
    let currentProfile = null;
    let currentAttributes = null;
    let currentQuickKeys = [];
    let currentEvidenceQuestions = [];
    let currentEvidenceAnswers = {};
    let currentConfirmedDocuments = [];
    let currentUser = null;
    let history = [];
    let uploadedFiles = [];
    const MAX_UPLOAD_FILES = 5;
    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
    const ALLOWED_UPLOAD_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

    function updateExactHsFields() {
        const anz = marketSelect.value === 'ANZ';
        exactHsSingleField.hidden = anz;
        exactHsAuField.hidden = !anz;
        exactHsNzField.hidden = !anz;
    }
    marketSelect.addEventListener('change', updateExactHsFields);
    updateExactHsFields();

    function normalizeExactHs(value) {
        return String(value || '').replace(/[^0-9]/g, '');
    }

    function validateExactHsInputs(market) {
        const checks = market === 'ANZ'
            ? [
                ['Australia tariff code', document.getElementById('sell-exact-hs-au').value],
                ['New Zealand tariff item', document.getElementById('sell-exact-hs-nz').value]
            ]
            : [['Exact national HS code', document.getElementById('sell-exact-hs').value]];
        for (const [label, value] of checks) {
            if (!String(value || '').trim()) continue;
            const code = normalizeExactHs(value);
            const validLengths = ['AU', 'NZ', 'ANZ'].includes(market) ? [8] : [8, 10];
            if (!validLengths.includes(code.length)) {
                return `${label} must contain ${validLengths.join(' or ')} digits.`;
            }
        }
        return '';
    }

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
        bluetooth: 'Bluetooth', wifi: 'Wi-Fi', cellular: 'Cellular / eSIM', radioTransmitter: 'Other radio / 2.4 GHz transmitter',
        battery: 'Rechargeable lithium battery', coinBattery: 'Button / coin battery', healthMonitoring: 'Health / biometric monitoring',
        medicalClaim: 'Medical claim', childUse: 'Designed for children', cameraMic: 'Camera / microphone',
        gps: 'GPS / location tracking', display: 'Screen / projected display',
        wirelessCharging: 'Wireless charging', noiseCancellation: 'Active noise cancellation'
        , mainsPowered: 'AC mains powered'
        , bundledAdapter: 'AC adaptor included', ratedVoltage: 'Rated AC input voltage (V)', ratedPower: 'Rated input power (W)'
    };

    const runAssessment = (input) => input.market === 'ANZ' ? engine.assessAnz(input) : engine.assess(input);

    const regulatorySnapshotsReady = fetch('data/consumer-regulatory-snapshots.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((payload) => {
        (payload?.sources || []).forEach((snapshot) => {
            if (!models.sources[snapshot.id]) return;
            Object.assign(models.sources[snapshot.id], { monitorStatus: snapshot.status, lastGoodAt: snapshot.last_good_at, lifecycleState: snapshot.lifecycle_state, monitorAdapter: snapshot.adapter || snapshot.capture_mode });
        });
    }).catch(() => null);

    function quickQuestionKeys(profile, productType = profile.productType) {
        const material = engine.materialQuestionKeys(productType);
        const modelPriorities = models.getProduct(productType).priorityQuestions || [];
        const scope = currentInput?.market === 'ANZ'
            ? (models.marketScopeMappings?.AU?.[productType] || models.marketScopeMappings?.NZ?.[productType])
            : models.marketScopeMappings?.[currentInput?.market]?.[productType];
        const scopePriorities = scope
            ? (profile.mainsPowered === 'unknown' ? ['mainsPowered', 'bundledAdapter']
                : profile.mainsPowered === true || profile.bundledAdapter === true
                    ? [scope.maxVoltage ? 'ratedVoltage' : null, scope.maxPower ? 'ratedPower' : null].filter(Boolean)
                    : []) : [];
        const priorities = dedupeQuestionKeys([...scopePriorities, ...(profile.healthMonitoring === true
            ? ['medicalClaim', ...modelPriorities, 'childUse']
            : [...modelPriorities, 'childUse', 'medicalClaim'])]);
        const changesMaintainedResult = (key) => {
            if (key === 'cellular') return profile.bluetooth !== true && profile.wifi !== true;
            return ['battery', 'medicalClaim', 'childUse', 'cameraMic', 'mainsPowered', 'bundledAdapter', 'ratedVoltage', 'ratedPower', 'bluetooth', 'wifi', 'radioTransmitter'].includes(key);
        };
        return priorities
            .filter((key) => material.includes(key) && (profile[key] === 'unknown' || profile[key] === null) && changesMaintainedResult(key))
            .slice(0, 2);
    }

    function renderFactQuestions(profile, productType = profile.productType) {
        const keys = quickQuestionKeys(profile, productType);
        currentQuickKeys = keys;
        followUpTitle.textContent = 'Improve your preliminary result';
        followUpCopy.textContent = 'Answer up to two product facts that could materially change the result. “Not sure” is fine.';
        followUpSubmit.textContent = 'Update preliminary result';
        questions.innerHTML = keys.map((key) => `
            <fieldset class="sell-question sell-question--fact">
                <legend>${escapeHtml(attributeLabels[key])}</legend>
                ${['ratedVoltage', 'ratedPower'].includes(key)
                    ? `<small>Use the rating label or supplier specification. Leave blank if unknown.</small><input type="number" name="${key}" min="0" step="0.1" inputmode="decimal" value="${Number.isFinite(profile[key]) ? escapeHtml(profile[key]) : ''}" placeholder="${key === 'ratedVoltage' ? 'e.g. 230' : 'e.g. 45'}">`
                    : `<small>Product fact — Yes may add requirements; it does not mean “pass”.</small>${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="${key}" value="${value}" ${profile[key] === true && value === 'yes' ? 'checked' : profile[key] === false && value === 'no' ? 'checked' : ''}> ${key === 'childUse' && value === 'yes' ? 'Yes — children’s product' : key === 'childUse' && value === 'no' ? 'No — general audience' : value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure'}</label>`).join('')}`}
            </fieldset>`).join('');
        questions.hidden = keys.length === 0;
        document.getElementById('sell-assistant-follow-up').innerHTML = `<strong>Optional accuracy check</strong><p>${keys.length ? `These ${keys.length} answer${keys.length === 1 ? '' : 's'} may change the preliminary result.` : 'No additional product facts are needed for this description.'}</p>`;
        return keys;
    }

    function renderEvidenceQuestions(profile) {
        const platformQuestions = engine.platformEvidenceQuestions(currentInput.platform, profile);
        const applicableRequirements = currentInput.market === 'ANZ'
            ? runAssessment({ ...currentInput, attributes: profile, documents: [], assessmentMode: 'quick', blockingQuestionKeys: [] }).requirements
            : engine.marketRequirements(currentInput.market, profile);
        const marketQuestions = engine.evidenceQuestionsForRequirements(
            applicableRequirements
        );
        currentEvidenceQuestions = [
            ...platformQuestions,
            ...marketQuestions.slice(0, Math.max(0, 5 - platformQuestions.length))
        ];
        improveQuestions.innerHTML = currentEvidenceQuestions.map((item) => `
            <fieldset class="sell-question sell-question--evidence">
                <legend>${escapeHtml(item.label)}</legend>
                <small>${item.scope === 'platform'
                    ? 'Platform status — Yes means this exact product or listing received the stated platform approval.'
                    : 'Supplier claim — Yes means the supplier says this exact-model document is available; upload it for a model-match check.'}</small>
                ${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="evidence:${item.key}" value="${value}" ${currentEvidenceAnswers[item.key]?.value === value ? 'checked' : ''}> ${value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not sure'}</label>`).join('')}
            </fieldset>`).join('');
        improveQuestions.parentElement.hidden = currentEvidenceQuestions.length === 0;
        return currentEvidenceQuestions;
    }

    function renderDocumentOptions(market, profile) {
        const preliminary = runAssessment({ ...currentInput, market, attributes: profile, documents: [] });
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
                <span>${escapeHtml(source.title)} · reviewed ${escapeHtml(source.reviewedAt)} · ${escapeHtml(source.confidence)}${source.lifecycle?.status ? ` · ${escapeHtml(source.lifecycle.status.replaceAll('_', ' '))}${source.lifecycle.effectiveAt ? ` ${escapeHtml(source.lifecycle.effectiveAt)}` : ''}` : ''}</span>
                <small>Verification boundary: ${escapeHtml(source.scope || 'Confirm the exact-model and transaction scope with the authority or a qualified professional.')}</small>
            </a>`).join('')}</div>`;
    }

    function requirementLabel(item) {
        const coverageLabels = {
            official_exact_requirement: 'Official exact requirement',
            official_linked_baseline: 'Official-linked baseline',
            preliminary_applicability_signal: 'Preliminary applicability signal',
            monitor_professional_confirmation_required: 'Monitor / professional confirmation required'
        };
        if (item.coverageLevel && coverageLabels[item.coverageLevel]) return coverageLabels[item.coverageLevel];
        const labels = {
            mandatory: item.severity === 'high' ? 'Mandatory — specialist review' : 'Mandatory requirement',
            scope_check: 'Scope check required',
            advisory: 'Advisory',
            future: 'Future requirement'
        };
        return labels[item.requirementClass] || 'Mandatory requirement';
    }

    function platformChecklistItems(assessment) {
        const items = assessment.platformRules.map((rule) => rule.action);
        if (items.length) return items;
        return ['Identify the marketplace and confirm its category restrictions, document requests and approval process before listing.'];
    }

    function captureVisibleEvidenceAnswers() {
        const data = new FormData(advancedForm);
        currentEvidenceQuestions.forEach((item) => {
            const value = data.get(`evidence:${item.key}`);
            if (value) currentEvidenceAnswers[item.key] = { label: item.label, value };
        });
        return currentEvidenceAnswers;
    }

    function channelEvidenceStatus(assessment, transition = {}) {
        const questions = engine.platformEvidenceQuestions(currentInput.platform, assessment.profile);
        const confirmed = questions.filter((item) => currentEvidenceAnswers[item.key]?.value === 'yes').map((item) => item.label);
        const missing = questions.filter((item) => currentEvidenceAnswers[item.key]?.value !== 'yes').map((item) => item.label);
        const previousTitles = new Set((transition.previousAssessment?.platformRules || []).map((rule) => rule.title));
        const currentTitles = new Set(assessment.platformRules.map((rule) => rule.title));
        const added = [...currentTitles].filter((title) => !previousTitles.has(title));
        const removed = [...previousTitles].filter((title) => !currentTitles.has(title));
        const changed = transition.previousPlatform && transition.previousPlatform !== currentInput.platform;
        return {
            transition: changed
                ? `Switched from ${transition.previousPlatform} to ${currentInput.platform}.`
                : `Current channel: ${currentInput.platform}.`,
            confirmed: confirmed.length ? confirmed.join('; ') : 'No platform evidence confirmed yet.',
            missing: missing.length ? missing.join('; ') : 'No platform evidence still missing.',
            changes: changed
                ? [added.length && `Added: ${added.join('; ')}`, removed.length && `Removed: ${removed.join('; ')}`].filter(Boolean).join('. ') || 'No maintained platform requirements changed.'
                : 'Select another channel to compare its platform requirements.'
        };
    }

    function renderChannelStatus(assessment, transition = {}) {
        const status = channelEvidenceStatus(assessment, transition);
        return `<div class="sell-channel-status" aria-live="polite">
            <span>Channel evidence status</span>
            <p id="sell-channel-transition">${escapeHtml(status.transition)}</p>
            <p><strong>Confirmed:</strong> <span id="sell-channel-confirmed">${escapeHtml(status.confirmed)}</span></p>
            <p><strong>Still needed:</strong> <span id="sell-channel-missing">${escapeHtml(status.missing)}</span></p>
            <p id="sell-channel-requirement-changes">${escapeHtml(status.changes)}</p>
        </div>`;
    }

    function renderPlatformCards(assessment) {
        return assessment.platformRules.length
            ? assessment.platformRules.map((rule) => `<article class="sell-requirement"><span>Platform rule</span><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.action)}</p>${renderSources({ sources: [rule.source] })}</article>`).join('')
            : '<p class="sell-panel-note">No maintained platform-specific rule is available for this channel. Legal market-access checks still apply.</p>';
    }

    function updateChannelView(assessment, transition = {}) {
        const card = document.getElementById('sell-channel-decision');
        if (!card) return;
        card.className = `sell-core-decision sell-core-decision--${assessment.platformDecision.code} sell-channel-updated`;
        document.getElementById('sell-channel-gate-answer').textContent = assessment.platformGateDecision.answer;
        document.getElementById('sell-channel-gate-label').textContent = assessment.platformGateDecision.label;
        document.getElementById('sell-channel-gate-reason').textContent = assessment.platformGateDecision.reason;
        document.getElementById('sell-channel-overall-answer').textContent = assessment.platformDecision.answer;
        document.getElementById('sell-channel-overall-label').textContent = assessment.platformDecision.label;
        document.getElementById('sell-channel-checklist').innerHTML = platformChecklistItems(assessment).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
        const status = channelEvidenceStatus(assessment, transition);
        document.getElementById('sell-channel-transition').textContent = status.transition;
        document.getElementById('sell-channel-confirmed').textContent = status.confirmed;
        document.getElementById('sell-channel-missing').textContent = status.missing;
        document.getElementById('sell-channel-requirement-changes').textContent = status.changes;
        document.getElementById('sell-summary-platform').textContent = currentInput.platform;
        document.getElementById('sell-platform-details-title').textContent = `${currentInput.platform} listing readiness`;
        document.getElementById('sell-platform-details-cards').innerHTML = renderPlatformCards(assessment);
        setTimeout(() => card.classList.remove('sell-channel-updated'), 900);
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

    async function refreshWorkspaceHealth() {
        const panel = document.getElementById('sell-workspace-health');
        if (!panel) return;
        const health = await api('/health');
        const unavailable = [
            !health.parsers?.pdf?.available && 'PDF verification',
            !health.parsers?.image?.available && 'image OCR'
        ].filter(Boolean);
        panel.hidden = unavailable.length === 0;
        panel.classList.toggle('sell-evidence-error', unavailable.length > 0);
        panel.textContent = unavailable.length
            ? `${unavailable.join(' and ')} ${unavailable.length === 1 ? 'is' : 'are'} unavailable. You can still use the preliminary assessment, but uploaded files will not be approved until the server parser is restored.`
            : '';
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

    function postEntryHref(row, assessment) {
        const market = row.market || currentInput.market;
        const params = new URLSearchParams({
            from: currentInput.origin,
            to: market,
            hs: row.hsCode,
            product: assessment.product.label,
            focus: 'import'
        });
        if (row.lastCheckedAt) params.set('effective_date', String(row.lastCheckedAt).slice(0, 10));
        return `post-entry.html?${params.toString()}`;
    }

    function renderTariffCandidateSelector(row, rowIndex) {
        if (row.exact || !(row.candidateExactLines || []).length) return '';
        const options = row.candidateExactLines.map((line) => {
            const rate = line.baseRate === null ? 'rate pending' : `${(line.baseRate * 100).toFixed(2)}%`;
            return `<option value="${escapeHtml(line.hsCode)}">${escapeHtml(line.hsCode)} · ${escapeHtml(rate)} · ${escapeHtml(line.description || 'official tariff description')}</option>`;
        }).join('');
        return `<label class="sell-tariff-selector"><span>Select the exact line only after its official description matches the product</span><select data-exact-tariff-select data-market="${escapeHtml(row.market || currentInput.market)}" data-row="${rowIndex}"><option value="">Choose an official exact tariff line</option>${options}</select></label>`;
    }

    function renderConditionalMeasures(row) {
        if (!(row.conditionalMeasures || []).length) return '';
        return `<details class="sell-tariff-conditions"><summary>Preferences, concessions and additional measures</summary><ul>${row.conditionalMeasures.map((item) => `<li><strong>${escapeHtml(item.label)} — ${escapeHtml(item.status === 'not_applied' ? 'not applied automatically' : 'scope check')}</strong><span>${escapeHtml(item.detail)} · ${escapeHtml(item.authority || 'Official authority')}${item.reviewedAt ? ` · reviewed ${escapeHtml(item.reviewedAt)}` : ''} · <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">official source</a></span></li>`).join('')}</ul></details>`;
    }

    function renderAssessment(assessment) {
        const list = (items = []) => items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>None identified from the supplied facts.</li>';
        const anzPanel = assessment.anzComparison ? `
            <section class="sell-result-panel sell-anz-comparison" aria-label="Australia and New Zealand comparison">
                <h2>Australia + New Zealand comparison</h2>
                <p class="sell-panel-note">Shared test evidence may reduce duplicate work, but local registrations, declarations, labels and supplier responsibilities remain separate.</p>
                <div class="sell-requirement-grid">
                    <article class="sell-requirement"><span>Shared / reusable evidence</span><ul>${list(assessment.anzComparison.sharedEvidence)}</ul></article>
                    <article class="sell-requirement"><span>Australia-specific actions</span><ul>${list(assessment.anzComparison.australiaActions)}</ul></article>
                    <article class="sell-requirement"><span>New Zealand-specific actions</span><ul>${list(assessment.anzComparison.newZealandActions)}</ul></article>
                    <article class="sell-requirement sell-requirement--scope_check"><span>Not automatically transferable</span><ul>${list(assessment.anzComparison.notAutomaticallyTransferable)}</ul></article>
                    <article class="sell-requirement sell-requirement--scope_check"><span>Missing facts</span><ul>${list(assessment.anzComparison.missingFacts)}</ul></article>
                    <article class="sell-requirement sell-requirement--advisory"><span>Professional confirmation</span><ul>${list(assessment.anzComparison.professionalConfirmation)}</ul></article>
                </div>
            </section>` : '';
        const requirementCards = assessment.requirements.map((item) => `
            <article class="sell-requirement sell-requirement--${escapeHtml(item.requirementClass || 'mandatory')} ${item.severity === 'high' ? 'sell-requirement--high' : ''}">
                <span>${escapeHtml(requirementLabel(item))}</span>
                <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p>${renderSources(item)}
            </article>`).join('');
        const gaps = assessment.documentGaps.length
            ? assessment.documentGaps.map((gap) => `<li><strong>${escapeHtml(gap.document)}</strong><span>${escapeHtml(gap.requirement)}</span></li>`).join('')
            : '<li><strong>No document gaps selected by this pre-check</strong><span>Still verify every file against the exact model and supplier.</span></li>';
        const tariffRows = assessment.tariffOptions.length
            ? assessment.tariffOptions.map((row, rowIndex) => `<li><strong>${row.market ? `${escapeHtml(row.market)} · ` : ''}HS ${escapeHtml(row.hsCode)}</strong><span>${row.classificationMismatch ? 'Entered code does not match this product model · ' : ''}${row.exactConflict ? 'Conflicting active official rates — professional confirmation required' : (row.rate === null ? 'Exact national tariff line required' : `${(row.rate * 100).toFixed(2)}% ${row.exact ? 'exact-line rate' : 'planning signal'}`)} · ${escapeHtml(row.exact ? 'official exact-line match' : row.sourceStatus)}${row.classificationRequired ? ' · candidate HS only, not filing-grade' : ''}${row.lastCheckedAt ? ` · checked ${escapeHtml(String(row.lastCheckedAt).slice(0, 10))}` : ''}${row.sourceUrl ? ` · <a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noopener">source</a>` : ''} · <a href="${escapeHtml(postEntryHref(row, assessment))}">Open in Post-Entry</a></span>${renderTariffCandidateSelector(row, rowIndex)}${renderConditionalMeasures(row)}</li>`).join('')
            : '<li><strong>No candidate HS yet</strong><span>Product-specific classification is required.</span></li>';
        const economics = assessment.economics;
        const evidenceRows = assessment.supplierEvidence.length
            ? assessment.supplierEvidence.map((item) => {
                const checkLabels = { kind: 'Document type', model: 'Exact model', holder: 'Manufacturer / holder', market: 'Target market', complete: 'Required fields', current: 'Date / validity' };
                const checks = Object.entries(item.checks || {}).map(([key, value]) => `${checkLabels[key] || key}: ${value === true ? 'matched' : value === false ? 'failed' : 'not verified'}`).join(' · ');
                const status = item.status === 'verified_match' ? 'Automated reference checks passed — authenticity still requires authority confirmation' : item.status.replaceAll('_', ' ');
                return `<li><strong>${escapeHtml(item.kind)} — ${escapeHtml(item.name)}</strong><span>${escapeHtml(status)}: ${escapeHtml(item.note)}</span>${checks ? `<small>${escapeHtml(checks)}</small>` : ''}${item.extracted?.model ? `<small>Model: ${escapeHtml(item.extracted.model)}${item.extracted.manufacturer ? ` · Holder: ${escapeHtml(item.extracted.manufacturer)}` : ''}${item.extracted.reportDate ? ` · Date: ${escapeHtml(item.extracted.reportDate)}` : ''}</small>` : ''}</li>`;
            }).join('')
            : '<li><strong>No supplier files uploaded</strong><span>Upload the exact-model reports before committing inventory.</span></li>';
        const supplierRequest = assessment.supplierRequest;
        const supplierRequestItems = supplierRequest.items.length
            ? `<ul>${supplierRequest.items.map((item) => `<li><strong>${escapeHtml(item.document)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join('')}</ul>`
            : '<p>All applicable uploaded evidence passed the automated reference and completeness checks.</p>';
        const platformCards = renderPlatformCards(assessment);
        const economicsCard = (value, title = 'Landed cost and margin estimate') => value ? `
            <section class="sell-result-panel"><h2>${escapeHtml(title)}</h2>
                <div class="sell-economics-grid">
                    <article><span>Customs value</span><strong>${money(value.customsValue, value.currency)}</strong></article>
                    <article><span>Estimated duty</span><strong>${money(value.duty, value.currency)}</strong><small>${value.dutyRate === null ? 'Exact rate missing' : `${(value.dutyRate * 100).toFixed(2)}% · ${value.dutyRateBasis}`}</small></article>
                    <article><span>GST / import tax base</span><strong>${money(value.taxBase, value.currency)}</strong></article>
                    <article><span>Import tax / GST</span><strong>${money(value.importTax, value.currency)}</strong><small>${(value.importTaxRate * 100).toFixed(2)}% · ${value.importTaxRateBasis}</small></article>
                    ${value.borderFeeStatus ? `<article><span>Border goods levies</span><strong>${money(value.borderFeeBeforeTax, value.currency)}</strong><small>${escapeHtml(value.borderFeeStatus)}</small></article>` : ''}
                    <article><span>Landed cost / unit</span><strong>${money(value.landedUnit, value.currency)}</strong></article>
                    <article><span>Contribution / unit</span><strong>${money(value.profitUnit, value.currency)}</strong></article>
                    <article><span>Contribution margin</span><strong>${value.marginRate === null ? 'Pending' : `${(value.marginRate * 100).toFixed(1)}%`}</strong></article>
                    <article><span>Break-even sale price</span><strong>${money(value.breakEvenPrice, value.currency)}</strong></article>
                </div><p class="sell-panel-note">${escapeHtml(value.caveat)}</p>
            </section>` : '';
        const anzEconomics = assessment.economicsByMarket
            ? `${economicsCard(assessment.economicsByMarket.AU, 'Australia landed cost estimate')}${economicsCard(assessment.economicsByMarket.NZ, 'New Zealand landed cost estimate')}`
            : '';
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
            </section>` : (anzEconomics || `<section class="sell-result-panel"><h2>Landed cost and margin estimate</h2><p class="sell-panel-note">${escapeHtml(assessment.economicsNote || 'Add purchase price and expected selling price to calculate the commercial result.')}</p></section>`);
        const conclusion = assessment.consumerConclusion;
        const sellerConclusion = assessment.sellerConclusion;
        const commercial = assessment.commercialConclusion;
        const platformDecision = assessment.platformDecision;
        const procurement = assessment.procurement;
        const guidance = assessment.productGuidance || { risk: 'Confirm the exact model and enabled functions before relying on this result.', supplier: 'Ask for every exact-model document listed below.' };
        const actionPlan = assessment.sellerActionPlan || {
            purchase: `${procurement.answer}: ${procurement.label}`,
            supplier: guidance.supplier,
            next: assessment.nextActions[0]
        };
        const freshness = assessment.sourceFreshness || { status: 'no_linked_source', sourceCount: 0, staleCount: 0, reviewedThrough: null, confidenceLevels: [] };
        const freshnessLabel = {
            current: 'Current review metadata',
            review_overdue: 'Source review overdue',
            review_metadata_missing: 'Source metadata incomplete',
            using_last_good: 'Using last-good official snapshot',
            no_linked_source: 'No linked official source'
        }[freshness.status] || 'Source review required';
        const commercialPanel = commercial.code === 'not_calculated' ? '' : `
            <section class="sell-commercial-answer sell-commercial-answer--${escapeHtml(commercial.code)}">
                <div><span>Commercial viability</span><strong>${escapeHtml(commercial.answer)}</strong><h2>${escapeHtml(commercial.label)}</h2><p>${escapeHtml(commercial.reason)}</p></div>
                ${assessment.economics ? `<div class="sell-commercial-metrics">
                    <article><span>Landed cost / unit</span><strong>${money(assessment.economics.landedUnit, assessment.economics.currency)}</strong></article>
                    <article><span>Contribution / unit</span><strong>${money(assessment.economics.profitUnit, assessment.economics.currency)}</strong></article>
                    <article><span>Break-even price</span><strong>${money(assessment.economics.breakEvenPrice, assessment.economics.currency)}</strong></article>
                </div>` : ''}
            </section>`;
        const platformOptions = ['Amazon', 'TikTok Shop', 'Shopify / own store', 'Other marketplace']
            .map((platform) => `<option ${platform === currentInput.platform ? 'selected' : ''}>${escapeHtml(platform)}</option>`).join('');
        result.innerHTML = `
            <section class="sell-core-decisions" aria-label="Core assessment answers">
                <article class="sell-core-decision sell-core-decision--${escapeHtml(sellerConclusion.code)}">
                    <span>Preliminary market-access result</span>
                    <h2>${escapeHtml(sellerConclusion.label)}</h2>
                    <p>${escapeHtml(sellerConclusion.reason)}</p>
                </article>
                <article id="sell-channel-decision" class="sell-core-decision sell-core-decision--${escapeHtml(platformDecision.code)}">
                    <label for="sell-result-platform">Can I list it on this channel?</label>
                    <select id="sell-result-platform" aria-label="Compare sales channel">${platformOptions}</select>
                    <div class="sell-channel-layer"><span>Platform check</span><strong id="sell-channel-gate-answer">${escapeHtml(assessment.platformGateDecision.answer)}</strong><h2 id="sell-channel-gate-label">${escapeHtml(assessment.platformGateDecision.label)}</h2><p id="sell-channel-gate-reason">${escapeHtml(assessment.platformGateDecision.reason)}</p></div>
                    <div class="sell-channel-layer sell-channel-layer--overall"><span>Overall listing status</span><strong id="sell-channel-overall-answer">${escapeHtml(platformDecision.answer)}</strong><p id="sell-channel-overall-label">${escapeHtml(platformDecision.label)}</p></div>
                    <div class="sell-channel-tasks"><span>Channel-specific next steps</span><ul id="sell-channel-checklist">${platformChecklistItems(assessment).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
                    ${renderChannelStatus(assessment)}
                </article>
                <article class="sell-core-decision sell-core-decision--procurement sell-core-decision--${escapeHtml(procurement.code)}">
                    <span>What should I verify before paying?</span>
                    <strong>${escapeHtml(procurement.answer)}</strong>
                    <h2>${escapeHtml(procurement.label)}</h2>
                    <p>${escapeHtml(procurement.reason)}</p>
                </article>
            </section>
            ${assessment.coverageStatus.supported && assessment.marketCoverage.level !== 'limited' ? '' : `<section class="sell-coverage-warning"><strong>${escapeHtml(assessment.marketCoverage.level === 'limited' ? assessment.marketCoverage.label : assessment.coverageStatus.label)}</strong><p>${escapeHtml(assessment.marketCoverage.level === 'limited' ? assessment.marketCoverage.detail : assessment.coverageStatus.detail)}</p></section>`}
            <div class="sell-answer-summary">
                <article><span>Market</span><strong>${escapeHtml(currentInput.market)}</strong></article>
                <article><span>Product</span><strong>${escapeHtml(assessment.product.label)}</strong></article>
                <article><span>Sales channel</span><strong id="sell-summary-platform">${escapeHtml(currentInput.platform)}</strong></article>
                <article><span>Can the battery be shipped?</span><strong>${escapeHtml(assessment.shipping)}</strong></article>
            </div>
            ${anzPanel}
            <section class="sell-result-panel sell-action-summary" aria-label="Your next three actions">
                <h2>Your next three actions</h2>
                <ol class="sell-action-list">
                    <li><strong>Purchase decision:</strong> ${escapeHtml(actionPlan.purchase)}</li>
                    <li><strong>Supplier evidence:</strong> ${escapeHtml(actionPlan.supplier)}</li>
                    <li><strong>Next step:</strong> ${escapeHtml(actionPlan.next)}</li>
                </ol>
            </section>
            <section class="sell-product-guidance"><span>What matters for this product?</span><h2>${escapeHtml(guidance.risk)}</h2><p><strong>Ask the supplier:</strong> ${escapeHtml(guidance.supplier)}</p></section>
            <section class="sell-decision-trace"><span>Why this result</span><ol>${assessment.decisionTrace.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section>
            <section class="sell-supplier-request ${supplierRequest.complete ? 'sell-supplier-request--complete' : ''}">
                <div><span>What documents should I ask the supplier for?</span><h2>${supplierRequest.complete ? 'No document follow-up identified' : `${supplierRequest.items.length} document request${supplierRequest.items.length === 1 ? '' : 's'} ready to send`}</h2><p>${supplierRequest.complete ? 'Keep the files with the exact-model purchase record.' : 'Use Improve accuracy below when the supplier replies.'}</p></div>
                ${supplierRequestItems}
                <button type="button" id="sell-copy-supplier-request">${supplierRequest.complete ? 'Copy confirmation request' : 'Copy supplier request'}</button>
                <button type="button" id="sell-download-supplier-request">Download supplier request</button>
                <p id="sell-copy-status" class="sell-copy-status" aria-live="polite"></p>
            </section>
            ${commercialPanel}
            <section class="sell-review-cta"><div><span>Need a second look?</span><h2>Request a complimentary review</h2><p>Prepare a non-confidential summary, then review and send it yourself in your email app. Nothing is uploaded or sent automatically. If the email draft does not open, copy the request and email <a href="mailto:carey@tracewize.com">carey@tracewize.com</a>.</p></div><div class="sell-review-actions"><button type="button" id="sell-copy-review-request">Copy request</button><a id="sell-open-review-email" href="#">Open email draft</a></div><p id="sell-review-status" aria-live="polite"></p></section>
            <details class="sell-result-details"><summary>Technical details, official sources and document checklist</summary>
                <section class="sell-source-freshness sell-source-freshness--${escapeHtml(freshness.status)}"><span>Official-source maintenance</span><strong>${escapeHtml(freshnessLabel)}</strong><p>${freshness.sourceCount ? `${escapeHtml(freshness.sourceCount)} linked source${freshness.sourceCount === 1 ? '' : 's'} · reviewed through ${escapeHtml(freshness.reviewedThrough || 'date missing')} · confidence ${escapeHtml(freshness.confidenceLevels.join(', ') || 'missing')}${freshness.degradedCount ? ` · ${escapeHtml(freshness.degradedCount)} source refresh unavailable; last-good retained${freshness.lastGoodThrough ? ` from ${escapeHtml(freshness.lastGoodThrough)}` : ''}` : ''}${freshness.futureCount ? ` · ${escapeHtml(freshness.futureCount)} future requirement` : ''}${freshness.pendingEffectiveDateCount ? ` · ${escapeHtml(freshness.pendingEffectiveDateCount)} effective date pending` : ''}` : 'No official source is linked to the selected requirements. Treat this result as a checklist and request specialist review.'}</p></section>
                ${economicsPanel}
                <section class="sell-result-panel"><h2>Candidate HS and maintained tariff signals</h2><p class="sell-panel-note">${escapeHtml(assessment.product.hsNote)}</p><ul class="sell-gap-list">${tariffRows}</ul></section>
                <section class="sell-result-panel"><h2>What applies to this product</h2><div class="sell-requirement-legend" aria-label="Coverage confidence key"><span class="mandatory">Official exact requirement</span><span class="scope">Official-linked baseline</span><span class="advisory">Preliminary applicability signal</span><span class="future">Monitor / professional confirmation required</span></div><div class="sell-requirement-grid">${requirementCards}</div></section>
                <section class="sell-result-panel"><h2>Supplier document gaps</h2><ul class="sell-gap-list">${gaps}</ul></section>
                <section class="sell-result-panel"><h2>Uploaded supplier evidence</h2><ul class="sell-gap-list">${evidenceRows}</ul></section>
                <section class="sell-result-panel"><h2 id="sell-platform-details-title">${escapeHtml(currentInput.platform)} listing readiness</h2><div id="sell-platform-details-cards" class="sell-requirement-grid">${platformCards}</div></section>
                <section class="sell-result-panel"><h2>Put these conditions in the purchase order</h2><ol class="sell-action-list">${assessment.contractConditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join('')}</ol></section>
                <section class="sell-result-panel"><h2>What to do next</h2><ol class="sell-action-list">${assessment.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ol></section>
                <section class="sell-result-panel sell-assistant-result"><h2>Ask the assessment assistant</h2><p>${escapeHtml(assessment.assistant.summary)}</p><div>${assessment.assistant.answerPrompts.map((prompt) => `<button type="button" data-assistant-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}</div><p id="sell-assistant-answer" class="sell-panel-note"></p></section>
            </details>
            <div class="sell-result-actions"><button type="button" id="sell-save-assessment">Save this result (optional)</button><button type="button" id="sell-print-assessment">Print / Save PDF</button></div>
            <div class="sell-trust-note"><strong>Preliminary screening only:</strong> this is not customs or legal advice. Do not place a purchase order solely from this result. Final duty requires exact HS classification; certifications must match the exact model, radio module, battery, and listing claims.</div>`;
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
        document.querySelectorAll('[data-exact-tariff-select]').forEach((select) => {
            select.addEventListener('change', () => {
                const code = normalizeExactHs(select.value);
                if (!code) return;
                const market = select.dataset.market;
                if (currentInput.market === 'ANZ') {
                    if (market === 'AU') {
                        currentInput.exactHsCodeAu = code;
                        document.getElementById('sell-exact-hs-au').value = code;
                    } else if (market === 'NZ') {
                        currentInput.exactHsCodeNz = code;
                        document.getElementById('sell-exact-hs-nz').value = code;
                    }
                } else {
                    currentInput.exactHsCode = code;
                    document.getElementById('sell-exact-hs').value = code;
                }
                latestAssessmentInput = { ...latestAssessmentInput, ...currentInput };
                renderAssessment(runAssessment(latestAssessmentInput));
            });
        });
        document.getElementById('sell-copy-supplier-request')?.addEventListener('click', async () => {
            const status = document.getElementById('sell-copy-status');
            const text = supplierRequestText(supplierRequest);
            try {
                await navigator.clipboard.writeText(text);
                status.textContent = 'Copied. You can paste this into email or supplier chat.';
            } catch {
                const textarea = document.createElement('textarea');
                textarea.value = text; document.body.appendChild(textarea); textarea.select();
                document.execCommand('copy'); textarea.remove();
                status.textContent = 'Copied. You can paste this into email or supplier chat.';
            }
        });
        document.getElementById('sell-download-supplier-request')?.addEventListener('click', () => {
            const blob = new Blob([supplierRequestText(supplierRequest)], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = supplierRequestFilename(assessment.product.label, currentInput.market);
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
            document.getElementById('sell-copy-status').textContent = 'Downloaded locally. No supplier or pricing data was uploaded.';
        });
        const reviewContact = engine.buildReviewContact({
            ...currentInput,
            productLabel: assessment.coverageStatus.supported ? assessment.product.label : currentInput.description,
            resultLabel: sellerConclusion.label
        });
        const reviewEmailLink = document.getElementById('sell-open-review-email');
        if (reviewEmailLink) reviewEmailLink.href = reviewContact.mailto;
        document.getElementById('sell-copy-review-request')?.addEventListener('click', async () => {
            const status = document.getElementById('sell-review-status');
            try {
                await navigator.clipboard.writeText(reviewContact.text);
                status.textContent = `Copied. Review it, then send it yourself to ${reviewContact.email}.`;
            } catch {
                status.textContent = `Copy is unavailable in this browser. No information was sent; email ${reviewContact.email} manually.`;
            }
        });
        document.getElementById('sell-result-platform')?.addEventListener('change', (event) => {
            if (!latestAssessmentInput) return;
            captureVisibleEvidenceAnswers();
            const previousPlatform = currentInput.platform;
            const previousAssessment = latestAssessment;
            const platform = event.target.value;
            currentInput = { ...currentInput, platform };
            const entryPlatform = document.getElementById('sell-platform');
            if (entryPlatform) entryPlatform.value = platform;
            latestAssessmentInput = { ...latestAssessmentInput, platform, evidenceAnswers: currentEvidenceAnswers };
            const nextAssessment = runAssessment(latestAssessmentInput);
            latestAssessment = nextAssessment;
            renderEvidenceQuestions(nextAssessment.profile);
            updateChannelView(nextAssessment, { previousPlatform, previousAssessment });
        });
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

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await regulatorySnapshotsReady;
        const description = document.getElementById('sell-description').value.trim();
        if (!description) {
            error.textContent = 'Please describe the product first.';
            error.hidden = false;
            return;
        }
        const market = document.getElementById('sell-market').value;
        const exactHsError = validateExactHsInputs(market);
        if (exactHsError) {
            error.textContent = exactHsError;
            error.hidden = false;
            return;
        }
        error.hidden = true;
        currentEvidenceAnswers = {};
        currentConfirmedDocuments = [];
        currentInput = {
            description,
            origin: document.getElementById('sell-origin').value,
            market,
            platform: document.getElementById('sell-platform').value,
            exactHsCode: normalizeExactHs(document.getElementById('sell-exact-hs').value),
            exactHsCodeAu: normalizeExactHs(document.getElementById('sell-exact-hs-au').value),
            exactHsCodeNz: normalizeExactHs(document.getElementById('sell-exact-hs-nz').value),
            dutyRates
        };
        const profile = engine.extractProfile(description);
        currentProfile = profile;
        productTypeSelect.innerHTML = models.listProducts().map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === profile.productType ? 'selected' : ''}>${escapeHtml(product.label)}</option>`).join('');
        const factKeys = renderFactQuestions(profile, profile.productType);
        renderDocumentOptions(currentInput.market, profile);
        currentAttributes = resolvedAttributes(new FormData(followUpForm));
        latestAssessmentInput = {
            ...currentInput,
            attributes: currentAttributes,
            documents: [],
            evidenceAnswers: {},
            supplierEvidence: { files: [] },
            assessmentMode: 'quick',
            blockingQuestionKeys: factKeys
        };
        const preliminary = runAssessment(latestAssessmentInput);
        renderEvidenceQuestions(preliminary.profile);
        renderAssessment(preliminary);
        followUp.hidden = factKeys.length === 0;
    });

    function resolvedAttributes(data) {
        const productType = data.get('productType') || currentProfile.productType;
        const attributes = { productType };
        engine.materialQuestionKeys(productType).forEach((key) => {
            const answer = data.get(key);
            const inferred = currentProfile[key];
            attributes[key] = ['ratedVoltage', 'ratedPower'].includes(key)
                ? (answer || (Number.isFinite(inferred) ? inferred : 'unknown'))
                : (answer || (inferred === true ? 'yes' : inferred === false ? 'no' : 'unknown'));
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
        currentAttributes = resolvedAttributes(data);
        latestAssessmentInput = {
            ...currentInput,
            attributes: currentAttributes,
            documents: [],
            evidenceAnswers: {},
            supplierEvidence: { files: [] },
            assessmentMode: 'quick',
            blockingQuestionKeys: currentQuickKeys
        };
        const assessment = runAssessment(latestAssessmentInput);
        currentProfile = assessment.profile;
        const nextFactKeys = renderFactQuestions(assessment.profile, assessment.profile.productType);
        latestAssessmentInput.blockingQuestionKeys = nextFactKeys;
        renderEvidenceQuestions(assessment.profile);
        renderDocumentOptions(currentInput.market, assessment.profile);
        renderAssessment(assessment);
        followUp.hidden = nextFactKeys.length === 0;
    });

    advancedForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(advancedForm);
        currentEvidenceAnswers = { ...currentEvidenceAnswers, ...resolvedEvidence(data) };
        currentConfirmedDocuments = confirmedDocuments(data);
        const costKeys = ['currency', 'quantity', 'purchaseUnit', 'saleUnit', 'freightTotal', 'insuranceTotal', 'shippingMode', 'otherImportTotal', 'dutyRate', 'importTaxRate', 'platformFeeRate', 'otherSellingUnit'];
        const costs = Object.fromEntries(costKeys.map((key) => [key, data.get(key)]));
        uploadedFiles = [];
        const sourceFiles = Array.from(evidenceFiles.files || []);
        const uploadProblems = [];
        if (sourceFiles.length > MAX_UPLOAD_FILES) uploadProblems.push(`Choose no more than ${MAX_UPLOAD_FILES} files at a time.`);
        sourceFiles.forEach((file) => {
            if (file.size > MAX_UPLOAD_BYTES) uploadProblems.push(`${file.name} is larger than 10 MB.`);
            if (!ALLOWED_UPLOAD_TYPES.has(file.type)) uploadProblems.push(`${file.name} is not a supported PDF, PNG, JPEG or WebP file.`);
        });
        if (uploadProblems.length) {
            evidencePreview.innerHTML = uploadProblems.map((message) => `<span class="sell-evidence-error">${escapeHtml(message)}</span>`).join('');
            return;
        }
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
        latestAssessmentInput = {
            ...currentInput,
            attributes: currentAttributes,
            documents: Array.from(new Set([...currentConfirmedDocuments, ...data.getAll('documents')])),
            evidenceAnswers: currentEvidenceAnswers,
            costs,
            supplierEvidence: {
                files,
                requiredModel: data.get('requiredModel'),
                supplierModel: data.get('supplierModel'),
                supplierName: data.get('supplierName'),
                documentText: data.get('documentText')
            },
            assessmentMode: 'quick',
            blockingQuestionKeys: currentQuickKeys
        };
        renderAssessment(runAssessment(latestAssessmentInput));
    });

    improveQuestions.addEventListener('change', (event) => {
        if (!event.target.matches('input[name^="evidence:"]') || !latestAssessmentInput || !latestAssessment) return;
        captureVisibleEvidenceAnswers();
        latestAssessmentInput = { ...latestAssessmentInput, evidenceAnswers: currentEvidenceAnswers };
        const nextAssessment = runAssessment(latestAssessmentInput);
        latestAssessment = nextAssessment;
        updateChannelView(nextAssessment);
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
        const problems = files.length > MAX_UPLOAD_FILES ? [`Choose no more than ${MAX_UPLOAD_FILES} files at a time.`] : [];
        files.forEach((file) => {
            if (file.size > MAX_UPLOAD_BYTES) problems.push(`${file.name} is larger than 10 MB.`);
            if (!ALLOWED_UPLOAD_TYPES.has(file.type)) problems.push(`${file.name} is not a supported PDF, PNG, JPEG or WebP file.`);
        });
        evidencePreview.innerHTML = problems.length
            ? problems.map((message) => `<span class="sell-evidence-error">${escapeHtml(message)}</span>`).join('')
            : files.length
            ? files.map((file) => `<span>${escapeHtml(file.name)} · ${(file.size / 1024).toFixed(1)} KB · pending verification</span>`).join('')
            : '';
    });

    fccLookupButton.addEventListener('click', async () => {
        const fccId = fccIdInput.value.trim();
        fccLookupButton.disabled = true;
        fccLookupResult.className = '';
        fccLookupResult.textContent = 'Checking the official FCC Equipment Authorization System…';
        try {
            const { result: lookup } = await api('/fcc-id/lookup', { method: 'POST', body: JSON.stringify({ fccId }) });
            fccLookupResult.className = lookup.verified ? 'sell-fcc-result--match' : 'sell-evidence-error';
            fccLookupResult.innerHTML = lookup.verified
                ? `<strong>Official FCC ID match found.</strong> ${escapeHtml(lookup.records[0]?.grantee || 'FCC grantee found')} · ${escapeHtml(lookup.records[0]?.grantDate || 'grant date unavailable')}. ${escapeHtml(lookup.disclaimer)} <a href="${escapeHtml(lookup.source.url)}" target="_blank" rel="noopener">Open FCC EAS</a>`
                : `<strong>No exact official match returned.</strong> ${escapeHtml(lookup.disclaimer)} <a href="${escapeHtml(lookup.source.url)}" target="_blank" rel="noopener">Search FCC EAS manually</a>`;
        } catch (failure) {
            fccLookupResult.className = 'sell-evidence-error';
            fccLookupResult.textContent = failure.message;
        } finally { fccLookupButton.disabled = false; }
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
                latestAssessmentInput = {
                    ...record.input,
                    attributes: record.assessment.profile,
                    documents: record.assessment.requirements
                        .filter((item) => !record.assessment.documentGaps.some((gap) => gap.requirementId === item.id))
                        .map((item) => item.id),
                    evidenceAnswers: {}
                };
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

    Promise.all([refreshSession(), refreshWorkspaceHealth()]).catch(() => {
        accountMessage.textContent = 'Private workspace server is unavailable. Start it with npm run dev:consumer.';
        renderHistory();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dedupeQuestionKeys, supplierRequestText, supplierRequestFilename };
}
