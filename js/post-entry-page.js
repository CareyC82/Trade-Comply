(function (global) {
    let selectedPostEntryFocus = '';
    const POST_ENTRY_REVIEW_STORAGE_KEY = 'tracewize.postEntry.review';

    function $(id) {
        return document.getElementById(id);
    }

    function getRegistryApi() {
        return global.TradeComplyCountryRegistry || null;
    }

    function getValueApi() {
        return global.TraceWizePostEntryValue || null;
    }

    function populateCountrySelect(select, placeholder) {
        if (!select) return;
        const registry = getRegistryApi();
        const options = registry?.getRouteOptions ? registry.getRouteOptions() : [
            { value: 'CN', label: 'China' },
            { value: 'US', label: 'United States' },
            { value: 'DE', label: 'Germany' },
            { value: 'NL', label: 'Netherlands' },
            { value: 'SG', label: 'Singapore' },
            { value: 'MX', label: 'Mexico' },
            { value: 'VN', label: 'Vietnam' },
            { value: 'MY', label: 'Malaysia' },
            { value: 'JP', label: 'Japan' },
            { value: 'KR', label: 'South Korea' },
            { value: 'GLOBAL', label: 'Other' }
        ];

        select.innerHTML = '';
        const first = document.createElement('option');
        first.value = '';
        first.textContent = placeholder;
        select.appendChild(first);
        options
            .filter(option => option.value !== 'ASEAN')
            .forEach((option) => {
                const el = document.createElement('option');
                el.value = option.value;
                el.textContent = option.label;
                select.appendChild(el);
            });
    }

    function getCountryLabel(code) {
        const registry = getRegistryApi();
        if (registry?.getCountryLabel) {
            return registry.getCountryLabel(code);
        }
        return code || '';
    }

    function numberInput(id) {
        return Number($(id)?.value || 0);
    }

    function formatMoney(value, currency) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency,
                maximumFractionDigits: 2
            }).format(value);
        } catch (error) {
            return `${currency} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        }
    }

    function formatPercent(value) {
        return `${Number(value || 0).toFixed(1)}%`;
    }

    function formatRate(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
        return `${(value * 100).toFixed(1)}%`;
    }

    function normalizeDatePart(value) {
        return String(value || '').replace(/\D/g, '').slice(0, 2);
    }

    function padDatePart(value) {
        const digits = normalizeDatePart(value);
        return digits.length === 1 ? `0${digits}` : digits;
    }

    function getEntryDateFromParts() {
        const month = $('post-entry-date-month')?.value || '';
        const day = $('post-entry-date-day')?.value || '';
        const year = $('post-entry-date-year')?.value || '';
        if (month.length !== 2 || day.length !== 2 || year.length !== 2) {
            return '';
        }
        return `${month} / ${day} / ${year}`;
    }

    function finalizeEntryDateParts() {
        ['post-entry-date-month', 'post-entry-date-day', 'post-entry-date-year'].forEach((id) => {
            const input = $(id);
            if (input) input.value = padDatePart(input.value);
        });
        const hiddenDate = $('post-entry-date');
        if (hiddenDate) hiddenDate.value = getEntryDateFromParts();
    }

    function isCompleteEntryDate(value) {
        return /^\d{2}\s\/\s\d{2}\s\/\s\d{2}$/.test(String(value || '').trim());
    }

    function setRiskBadge(risk) {
        const badge = $('post-entry-risk-badge');
        if (!badge) return;
        badge.className = `post-entry-risk-badge post-entry-risk-badge--${risk.tone}`;
        badge.textContent = risk.level;
    }

    function getValueGapRisk(diffPercent, declaredAmount) {
        if (!declaredAmount) {
            return { level: 'Review Required', tone: 'medium' };
        }
        if (diffPercent > 15) {
            return { level: 'High', tone: 'high' };
        }
        if (diffPercent > 5) {
            return { level: 'Review Required', tone: 'medium' };
        }
        if (diffPercent > 0) {
            return { level: 'Low Variance', tone: 'low' };
        }
        return { level: 'No Variance', tone: 'clear' };
    }

    function renderList(id, items) {
        const list = $(id);
        if (!list) return;
        list.innerHTML = '';
        items.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item;
            list.appendChild(li);
        });
    }

    function buildChargeList(result) {
        const charges = [];
        if (result.freight > 0) charges.push('freight');
        if (result.insurance > 0) charges.push('insurance');
        if (result.otherCharges > 0) charges.push('other dutiable charges');
        return charges;
    }

    function buildPrimaryConclusion(result, currency) {
        if (result.difference > 0) {
            const charges = buildChargeList(result);
            const reason = charges.length ? ` because ${charges.join(' + ')} were added under ${result.incoterm}` : '';
            return `Declared value appears low by ${formatMoney(result.difference, currency)}${reason}. Working customs value: ${formatMoney(result.customsValue, currency)}.`;
        }
        if (result.difference < 0) {
            return `Declared value appears higher than the current customs-value estimate by ${formatMoney(Math.abs(result.difference), currency)}. Check whether costs were double-counted.`;
        }
        return `No value gap is visible from the entered ${result.incoterm} cost components.`;
    }

    function buildExportConclusion(result, currency) {
        const difference = result.exportRebateBase - result.declaredAmount;
        if (difference < 0) {
            return `Export filing value appears lower than the invoice amount by ${formatMoney(Math.abs(difference), currency)} after converting to an FOB-style basis.`;
        }
        if (difference > 0) {
            return `Export filing value appears higher than the declared amount by ${formatMoney(difference, currency)} after adding export-side charges.`;
        }
        return `No export filing value gap is visible from the entered ${result.incoterm} cost components.`;
    }

    function buildValuationLogic(result, currency, focus) {
        const charges = buildChargeList(result);
        if (focus === 'export') {
            if (!charges.length) {
                return `${result.incoterm}: export filing value currently equals declared amount because no freight, insurance, or other charge amount was entered.`;
            }
            return `${result.incoterm}: estimated export filing value uses an FOB-style basis. Declared amount ${formatMoney(result.declaredAmount, currency)} is adjusted by entered charge components to ${formatMoney(result.exportRebateBase, currency)}.`;
        }
        if (!charges.length) {
            return `${result.incoterm}: no freight, insurance, or other charge amount was entered, so customs value currently equals declared value.`;
        }
        return `${result.incoterm}: declared amount ${formatMoney(result.declaredAmount, currency)} + ${charges.join(' + ')} = estimated customs value ${formatMoney(result.customsValue, currency)}.`;
    }

    function buildDutyImpactText(dutyImpact, currency) {
        if (!dutyImpact.covered) {
            return `${dutyImpact.rateLabel}. ${dutyImpact.action}`;
        }
        const estimatedDuty = formatMoney(dutyImpact.estimatedDuty, currency);
        const dutyGap = formatMoney(dutyImpact.dutyVariance, currency);
        const basePart = `Base duty ${formatRate(dutyImpact.baseRate)} = ${formatMoney(dutyImpact.baseDuty, currency)}`;
        const addOnParts = (dutyImpact.addOnLayers || [])
            .filter(layer => layer.rate !== null)
            .map(layer => `${layer.label} ${formatRate(layer.rate)} = ${formatMoney(layer.amount, currency)}`);
        const flagParts = (dutyImpact.flagOnlyLayers || [])
            .map(layer => `${layer.label}: official case-scope check required`);
        return [
            `${dutyImpact.rateLabel}: ${basePart}.`,
            addOnParts.length ? `Add-ons: ${addOnParts.join('; ')}.` : '',
            flagParts.length ? `Flags: ${flagParts.join('; ')}.` : '',
            `Estimated duty: ${estimatedDuty}. Duty gap vs entered duty: ${dutyGap}.`
        ].filter(Boolean).join(' ');
    }

    function buildExportImpactText(exportReview) {
        return `${exportReview.label}: ${exportReview.impact}`;
    }

    function setResultModeLabels(focus) {
        const isExport = focus === 'export';
        const labelMap = isExport ? {
            'post-entry-customs-value-label': 'Export filing value',
            'post-entry-rebate-base-label': 'Declared invoice amount',
            'post-entry-difference-label': 'Export value gap'
        } : {
            'post-entry-customs-value-label': 'Customs dutiable value',
            'post-entry-rebate-base-label': 'Export rebate base',
            'post-entry-difference-label': 'Difference vs declared'
        };
        Object.entries(labelMap).forEach(([id, text]) => {
            const el = $(id);
            if (el) el.textContent = text;
        });
        document.querySelectorAll('[data-import-only]').forEach((el) => {
            el.hidden = isExport;
        });
    }

    function buildReviewSnapshot(valueApi, result, context, input) {
        const currency = input.currency || 'USD';
        const focus = input.focus || 'import';
        const base = {
            createdAt: new Date().toISOString(),
            focus,
            route: `${context.originCountry || context.originCountryCode} to ${context.importCountry || context.importCountryCode}`,
            subtitle: `${focus === 'export' ? 'Export-side review at origin' : 'Import-side review at destination'} · ${context.entryDate}`,
            labels: focus === 'export' ? {
                customsValue: 'Export filing value',
                rebateBase: 'Declared invoice amount',
                difference: 'Export value gap'
            } : {
                customsValue: 'Customs dutiable value',
                rebateBase: 'Export rebate base',
                difference: 'Difference vs declared'
            },
            values: {},
            insights: {},
            evidence: []
        };

        if (focus === 'export') {
            const exportReview = valueApi.buildExportPostEntryReview(result, context);
            const exportDifference = result.exportRebateBase - result.declaredAmount;
            const exportDiffPercent = result.declaredAmount ? Math.abs(exportDifference) / result.declaredAmount * 100 : 100;
            const exportRisk = getValueGapRisk(exportDiffPercent, result.declaredAmount);
            return {
                ...base,
                risk: exportRisk,
                values: {
                    customsValue: formatMoney(result.exportRebateBase, currency),
                    rebateBase: formatMoney(result.declaredAmount, currency),
                    difference: `${formatMoney(exportDifference, currency)} (${formatPercent(exportDiffPercent)})`
                },
                importMetrics: null,
                conclusion: buildExportConclusion(result, currency),
                insights: {
                    valuation: buildValuationLogic(result, currency, focus),
                    duty: buildExportImpactText(exportReview),
                    compliance: exportReview.complianceMeaning,
                    action: exportReview.action
                },
                evidence: exportReview.evidence
            };
        }

        const dutyImpact = valueApi.calculateDutyImpact(result, context, {
            declaredDuty: input.declaredDuty
        });
        return {
            ...base,
            risk: result.risk,
            values: {
                customsValue: formatMoney(result.customsValue, currency),
                rebateBase: formatMoney(result.exportRebateBase, currency),
                difference: `${formatMoney(result.difference, currency)} (${formatPercent(result.diffPercent)})`
            },
            importMetrics: {
                estimatedDuty: dutyImpact.covered ? formatMoney(dutyImpact.estimatedDuty, currency) : 'Rate not covered',
                addOnDuty: dutyImpact.covered ? formatMoney(dutyImpact.addOnDuty, currency) : '—',
                dutyGap: dutyImpact.covered ? formatMoney(dutyImpact.dutyVariance, currency) : '—'
            },
            conclusion: buildPrimaryConclusion(result, currency),
            insights: {
                valuation: buildValuationLogic(result, currency, focus),
                duty: buildDutyImpactText(dutyImpact, currency),
                compliance: valueApi.buildComplianceMeaning(result, context),
                action: dutyImpact.covered && dutyImpact.dutyVariance > 0.01
                    ? dutyImpact.action
                    : valueApi.buildRecommendedAction(result, context)
            },
            evidence: valueApi.buildEvidenceList(context)
        };
    }

    function renderReviewSnapshot(snapshot) {
        if (!snapshot) return false;
        setResultModeLabels(snapshot.focus);
        const subtitle = $('post-entry-result-subtitle');
        if (subtitle) subtitle.textContent = snapshot.subtitle || 'Post-entry review result.';
        const route = $('post-entry-result-route');
        if (route) route.textContent = snapshot.route || '';
        if (snapshot.labels) {
            const customLabel = $('post-entry-customs-value-label');
            const rebateLabel = $('post-entry-rebate-base-label');
            const diffLabel = $('post-entry-difference-label');
            if (customLabel) customLabel.textContent = snapshot.labels.customsValue || customLabel.textContent;
            if (rebateLabel) rebateLabel.textContent = snapshot.labels.rebateBase || rebateLabel.textContent;
            if (diffLabel) diffLabel.textContent = snapshot.labels.difference || diffLabel.textContent;
        }
        $('post-entry-customs-value').textContent = snapshot.values?.customsValue || '—';
        $('post-entry-rebate-base').textContent = snapshot.values?.rebateBase || '—';
        $('post-entry-difference').textContent = snapshot.values?.difference || '—';
        if (snapshot.focus === 'import' && snapshot.importMetrics) {
            $('post-entry-estimated-duty').textContent = snapshot.importMetrics.estimatedDuty || '—';
            $('post-entry-addon-duty').textContent = snapshot.importMetrics.addOnDuty || '—';
            $('post-entry-duty-gap').textContent = snapshot.importMetrics.dutyGap || '—';
        }
        $('post-entry-explanation').textContent = snapshot.conclusion || '—';
        $('post-entry-valuation-method').textContent = snapshot.insights?.valuation || '—';
        $('post-entry-duty-impact').textContent = snapshot.insights?.duty || '—';
        $('post-entry-compliance-meaning').textContent = snapshot.insights?.compliance || '—';
        $('post-entry-recommended-action').textContent = snapshot.insights?.action || '—';
        renderList('post-entry-evidence-list', snapshot.evidence || []);
        setRiskBadge(snapshot.risk || { level: 'Review', tone: 'medium' });
        const resultSection = $('post-entry-result');
        if (resultSection) {
            resultSection.hidden = false;
            requestAnimationFrame(() => resultSection.classList.add('is-visible'));
        }
        return true;
    }

    function saveReviewSnapshot(snapshot) {
        try {
            sessionStorage.setItem(POST_ENTRY_REVIEW_STORAGE_KEY, JSON.stringify(snapshot));
            return true;
        } catch (error) {
            return false;
        }
    }

    function loadReviewSnapshot() {
        try {
            const raw = sessionStorage.getItem(POST_ENTRY_REVIEW_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function validateForm() {
        const required = [
            ['post-entry-origin-country', 'Select from country / region.'],
            ['post-entry-import-country', 'Select to country / region.'],
            ['post-entry-date', 'Enter entry date.'],
            ['post-entry-hs-code', 'Enter declared HS code.'],
            ['post-entry-incoterm', 'Select Incoterm.'],
            ['post-entry-currency', 'Select currency.']
        ];
        if (!selectedPostEntryFocus) {
            return 'Select export-side or import-side post-entry review.';
        }
        finalizeEntryDateParts();
        for (const [id, message] of required) {
            if (!$(id)?.value) {
                return message;
            }
        }
        if (!isCompleteEntryDate($('post-entry-date')?.value)) {
            return 'Enter entry date in MM / DD / YY format.';
        }
        if (numberInput('post-entry-declared-amount') <= 0) {
            return 'Enter declared amount greater than 0.';
        }
        return '';
    }

    function runValueCheck() {
        const error = $('post-entry-error');
        const validationError = validateForm();
        if (validationError) {
            if (error) {
                error.textContent = validationError;
                error.hidden = false;
            }
            return;
        }
        if (error) {
            error.hidden = true;
        }

        const valueApi = getValueApi();
        if (!valueApi?.calculatePostEntryValue) {
            if (error) {
                error.textContent = 'Value review engine is unavailable. Please refresh and try again.';
                error.hidden = false;
            }
            return;
        }

        const currency = $('post-entry-currency').value || 'USD';
        const declaredDuty = numberInput('post-entry-declared-duty');
        const result = valueApi.calculatePostEntryValue({
            incoterm: $('post-entry-incoterm').value,
            declaredAmount: numberInput('post-entry-declared-amount'),
            freight: numberInput('post-entry-freight'),
            insurance: numberInput('post-entry-insurance'),
            otherCharges: numberInput('post-entry-other-charges')
        });
        const context = {
            importCountryCode: $('post-entry-import-country').value,
            originCountryCode: $('post-entry-origin-country').value,
            importCountry: getCountryLabel($('post-entry-import-country').value),
            originCountry: getCountryLabel($('post-entry-origin-country').value),
            entryDate: $('post-entry-date').value,
            hsCode: $('post-entry-hs-code').value.trim()
        };
        const snapshot = buildReviewSnapshot(valueApi, result, context, {
            currency,
            declaredDuty,
            focus: selectedPostEntryFocus
        });

        if (!saveReviewSnapshot(snapshot)) {
            if (error) {
                error.textContent = 'Unable to prepare the result page. Please try again.';
                error.hidden = false;
            }
            return;
        }
        window.location.href = 'post-entry-result.html';
    }

    function bindForm() {
        const form = $('post-entry-form');
        if (!form) return;
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            runValueCheck();
        });
    }

    function bindPostEntryFocusToggle() {
        const buttons = Array.from(document.querySelectorAll('[data-post-entry-focus]'));
        buttons.forEach((button) => {
            button.addEventListener('click', () => {
                selectedPostEntryFocus = button.dataset.postEntryFocus || '';
                buttons.forEach((candidate) => {
                    const active = candidate === button;
                    candidate.classList.toggle('is-active', active);
                    candidate.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
            });
            button.setAttribute('aria-pressed', 'false');
        });
    }

    function bindPostEntryFeedback() {
        const trigger = $('post-entry-feedback-trigger');
        const feedbackModal = $('feedback-modal');
        const modalCancel = $('modal-cancel');
        const feedbackForm = $('user-feedback-form');
        const feedbackThanks = $('feedback-thanks');
        const feedbackFormDiv = $('feedback-form');

        if (trigger && feedbackModal && typeof openFeedbackModal === 'function') {
            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                openFeedbackModal();
            });
        }

        if (modalCancel && feedbackModal) {
            feedbackModal.classList.remove('open');
            modalCancel.addEventListener('click', () => {
                feedbackModal.classList.remove('open');
            });
        }

        if (feedbackModal) {
            feedbackModal.addEventListener('click', (event) => {
                if (event.target === feedbackModal) {
                    feedbackModal.classList.remove('open');
                }
            });
        }

        if (feedbackForm && feedbackThanks && feedbackFormDiv && feedbackModal && typeof bindFeedbackSubmit === 'function') {
            bindFeedbackSubmit(feedbackForm, feedbackThanks, feedbackFormDiv, feedbackModal);
        }
    }

    async function hydrateDutyRules() {
        const valueApi = getValueApi();
        if (!valueApi?.setDutyRulesForTest) return;
        try {
            const response = await fetch('data/duty-rates.json', { cache: 'no-store' });
            if (!response.ok) return;
            const payload = await response.json();
            if (Array.isArray(payload.rules)) {
                valueApi.setDutyRulesForTest(payload.rules);
            }
        } catch (error) {
            // Bundled fallback rules still keep the page usable offline.
        }
    }

    function clearEntryDate() {
        ['post-entry-date', 'post-entry-date-month', 'post-entry-date-day', 'post-entry-date-year'].forEach((id) => {
            const input = $(id);
            if (input) {
                input.value = '';
                input.defaultValue = '';
            }
        });
    }

    function bindEntryDateMask() {
        const hiddenDate = $('post-entry-date');
        const parts = [
            $('post-entry-date-month'),
            $('post-entry-date-day'),
            $('post-entry-date-year')
        ].filter(Boolean);
        if (!hiddenDate || parts.length !== 3) return;

        const syncHiddenDate = () => {
            hiddenDate.value = getEntryDateFromParts();
        };

        parts.forEach((input, index) => {
            input.addEventListener('input', () => {
                input.value = normalizeDatePart(input.value);
                if (input.value.length === 2 && parts[index + 1]) {
                    parts[index + 1].focus();
                }
                syncHiddenDate();
            });
            input.addEventListener('blur', () => {
                input.value = padDatePart(input.value);
                syncHiddenDate();
            });
            input.addEventListener('paste', () => {
                setTimeout(() => {
                    input.value = normalizeDatePart(input.value);
                    syncHiddenDate();
                }, 0);
            });
        });
    }

    async function bootstrapPostEntryPage() {
        await hydrateDutyRules();
        const resultOnlyPage = Boolean($('post-entry-result-page'));
        if (resultOnlyPage) {
            const rendered = renderReviewSnapshot(loadReviewSnapshot());
            const empty = $('post-entry-empty-result');
            if (empty) empty.hidden = rendered;
            bindPostEntryFeedback();
            return;
        }

        populateCountrySelect($('post-entry-origin-country'), 'Select from country');
        populateCountrySelect($('post-entry-import-country'), 'Select to country');
        clearEntryDate();
        bindEntryDateMask();
        bindPostEntryFocusToggle();
        bindForm();
    }

    global.bootstrapPostEntryPage = bootstrapPostEntryPage;
}(typeof globalThis !== 'undefined' ? globalThis : window));
