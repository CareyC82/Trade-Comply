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

    function getSourceStatusLabel(status) {
        const labels = {
            official_source_checked: 'Official source checked',
            benchmark_source_checked: 'Benchmark checked',
            indicative: 'Benchmark estimate',
            scope_check_required: 'Scope check required',
            flag_only: 'Scope check required',
            not_covered: 'Not covered',
            review_basis: 'Review basis'
        };
        return labels[status] || 'Indicative';
    }

    function getSourceStatusHelp(status) {
        const labels = {
            official_source_checked: 'Pulled from an official tariff source and stored with the rate basis.',
            benchmark_source_checked: 'Matched to a maintained local benchmark and official source roadmap, but not a live official tariff lookup.',
            indicative: 'Useful for pre-check math, but not a final official tariff lookup.',
            scope_check_required: 'The amount depends on case scope, exclusion, origin, or product-specific facts.',
            flag_only: 'The amount depends on case scope, exclusion, origin, or product-specific facts.',
            not_covered: 'No maintained local rate exists for this route and HS prefix yet.',
            review_basis: 'Value logic is available; local filing correction rules still need confirmation.'
        };
        return labels[status] || labels.indicative;
    }

    function getSourceCoverageLevel(items = []) {
        const statuses = new Set(items.map(item => item.status));
        if (statuses.has('not_covered')) return 'not_covered';
        if (statuses.has('scope_check_required') || statuses.has('flag_only')) return 'scope_check_required';
        if (statuses.size && Array.from(statuses).every(status => status === 'official_source_checked')) {
            return 'official_source_checked';
        }
        if (statuses.has('official_source_checked')) return 'mixed';
        if (statuses.has('benchmark_source_checked')) return 'benchmark_source_checked';
        return statuses.has('review_basis') ? 'review_basis' : 'indicative';
    }

    function countSourceStatuses(items = []) {
        return items.reduce((counts, item) => {
            const status = item.status || 'indicative';
            counts[status] = (counts[status] || 0) + 1;
            return counts;
        }, {});
    }

    function buildRateConfidence(items = []) {
        const rows = Array.isArray(items) ? items : [];
        const level = getSourceCoverageLevel(rows);
        const counts = countSourceStatuses(rows);
        const chips = Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => ({
                status,
                label: `${getSourceStatusLabel(status)} · ${count}`
            }));
        const map = {
            official_source_checked: {
                tone: 'official',
                label: 'Official checked',
                summary: 'Base rate is backed by a maintained official tariff source. Still confirm entry-date applicability and product scope before filing.'
            },
            benchmark_source_checked: {
                tone: 'benchmark',
                label: 'Benchmark checked',
                summary: 'Rate math uses a maintained local benchmark and source roadmap. Treat it as a strong pre-check, not a live official tariff lookup.'
            },
            mixed: {
                tone: 'mixed',
                label: 'Mixed source basis',
                summary: 'Some rate components are official-checked, while add-ons or taxes remain benchmark or indicative. Verify the non-official layers before amendment.'
            },
            scope_check_required: {
                tone: 'scope',
                label: 'Scope review required',
                summary: 'At least one duty layer depends on case scope, exclusion, origin, sanctions, or product-specific facts. Do not use the estimate as the final duty bill.'
            },
            not_covered: {
                tone: 'not-covered',
                label: 'Rate not covered',
                summary: 'No maintained route / HS rate exists yet. Use the value math only and confirm the official tariff line separately.'
            },
            review_basis: {
                tone: 'review',
                label: 'Review basis only',
                summary: 'This result provides filing-value review logic, not destination import duty math.'
            },
            indicative: {
                tone: 'indicative',
                label: 'Indicative only',
                summary: 'The rate is useful for screening, but it is not official-checked. Confirm the destination tariff and tax treatment before filing.'
            }
        };
        return {
            ...(map[level] || map.indicative),
            level,
            chips: chips.length ? chips : [{ status: level, label: getSourceStatusLabel(level) }]
        };
    }

    function buildRateBasisText(items = []) {
        const summary = buildRateDecisionSummary(items);
        return summary?.label || 'Rate source not covered';
    }

    function findBaseDutySource(items = []) {
        return (items || []).find(item => /base duty/i.test(item.label || '')) || (items || [])[0] || null;
    }

    function buildRateDecisionSummary(items = []) {
        const rows = Array.isArray(items) ? items : [];
        const base = findBaseDutySource(rows);
        const hasScopeCheck = rows.some(item => item.status === 'scope_check_required' || item.status === 'flag_only');
        const officialRows = rows.filter(item => item.status === 'official_source_checked');
        const benchmarkRows = rows.filter(item => item.status === 'benchmark_source_checked' || item.status === 'indicative');
        const scopeRows = rows.filter(item => item.status === 'scope_check_required' || item.status === 'flag_only');
        const reviewRows = rows.filter(item => item.status === 'review_basis');

        if (hasScopeCheck) {
            const target = scopeRows[0] || base || {};
            return {
                tone: 'scope',
                label: 'Needs exact tariff line',
                title: 'Exact HS / TARIC scope is required before using a final duty rate.',
                detail: target.detail || target.source || 'Enter a more specific 8-10 digit HS/TARIC code to narrow the applicable rate.'
            };
        }
        if (reviewRows.length) {
            const target = reviewRows[0] || {};
            return {
                tone: 'mixed',
                label: 'Export filing review',
                title: target.detail || 'Export-side value review is available for this route.',
                detail: 'This result checks declared value logic and correction posture. It does not calculate destination import duty.'
            };
        }
        if (base?.status === 'official_source_checked') {
            return {
                tone: 'official',
                label: 'Official rate used',
                title: base.detail || 'Official base duty rate was matched for this route.',
                detail: benchmarkRows.length
                    ? 'Base duty is official-checked; VAT or add-on layers may still be benchmark estimates.'
                    : 'All displayed duty-rate layers are backed by maintained official source data.'
            };
        }
        if (officialRows.length) {
            return {
                tone: 'mixed',
                label: 'Mixed source basis',
                title: 'Some duty components are official-checked.',
                detail: 'Review benchmark add-ons, taxes, or local layers before filing or correction.'
            };
        }
        if (!rows.length || rows.some(item => item.status === 'not_covered')) {
            return {
                tone: 'not-covered',
                label: 'Rate not covered',
                title: 'No maintained route / HS duty rate is available yet.',
                detail: 'Use the value calculation only, then confirm the official tariff line separately.'
            };
        }
        return {
            tone: 'benchmark',
            label: 'Benchmark estimate',
            title: base?.detail || 'Duty math uses a maintained benchmark estimate.',
            detail: 'Use this for quick screening. Treat the amount as a benchmark until an official tariff source is attached.'
        };
    }

    function buildCoverageNote(items = []) {
        const level = getSourceCoverageLevel(items);
        if (level === 'official_source_checked') {
            return 'Official rate used. Still confirm entry-date applicability before filing.';
        }
        if (level === 'mixed') {
            return 'Official base rate plus benchmark add-ons. Confirm taxes, exclusions, and entry-date scope.';
        }
        if (level === 'benchmark_source_checked') {
            return 'Benchmark estimate. Useful for pre-check decisions, but verify the official tariff line before filing.';
        }
        if (level === 'scope_check_required') {
            return 'Needs exact tariff line. A broader HS prefix has multiple possible duty outcomes.';
        }
        if (level === 'not_covered') {
            return 'Rate basis: not covered yet. Use the value math only, then confirm the official tariff line.';
        }
        if (level === 'review_basis') {
            return 'Rate basis: export filing value logic only. Confirm local correction rules before filing.';
        }
        return 'Rate basis: benchmark estimate. Confirm the official tariff line before filing or correction.';
    }

    function buildJurisdictionScopeNote(context = {}) {
        const importCountry = String(context.importCountryCode || '').toUpperCase();
        if (importCountry === 'EU') {
            return 'EU TARIC duty is shown at EU level; import VAT depends on the destination member state.';
        }
        if (importCountry === 'DE') {
            return 'Germany view: EU TARIC duty plus Germany VAT benchmark.';
        }
        if (importCountry === 'NL') {
            return 'Netherlands view: EU TARIC duty plus Netherlands VAT benchmark.';
        }
        return '';
    }

    function renderSourceList(id, items) {
        const list = $(id);
        if (!list) return;
        list.innerHTML = '';
        const rows = Array.isArray(items) && items.length ? items : [{
            label: 'Rate source',
            status: 'not_covered',
            source: 'No source attached',
            detail: 'Confirm the official tariff line before filing.'
        }];
        rows.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'post-entry-source-row';

            const main = document.createElement('div');
            main.className = 'post-entry-source-main';
            const title = document.createElement('strong');
            title.textContent = item.label || 'Rate source';
            const detail = document.createElement('span');
            detail.textContent = [item.source, item.detail].filter(Boolean).join(' · ') || 'Confirm official source.';
            main.append(title, detail);

            const status = document.createElement(item.url ? 'a' : 'span');
            status.className = `post-entry-source-status post-entry-source-status--${item.status || 'indicative'}`;
            status.textContent = getSourceStatusLabel(item.status);
            if (item.url) {
                status.href = item.url;
                status.target = '_blank';
                status.rel = 'noopener noreferrer';
                status.title = 'Open source';
            } else {
                status.title = getSourceStatusHelp(item.status);
            }

            row.append(main, status);
            list.appendChild(row);
        });
    }

    function renderRateDecision(summary) {
        const card = $('post-entry-rate-decision');
        if (!card) return;
        const safe = summary || buildRateDecisionSummary([]);
        card.className = `post-entry-rate-decision post-entry-rate-decision--${safe.tone || 'benchmark'}`;
        const label = $('post-entry-rate-decision-label');
        const title = $('post-entry-rate-decision-title');
        const detail = $('post-entry-rate-decision-detail');
        if (label) label.textContent = safe.label || 'Rate decision';
        if (title) title.textContent = safe.title || 'Review rate basis.';
        if (detail) detail.textContent = safe.detail || '';
    }

    function compactSourceRows(items = []) {
        const rows = Array.isArray(items) ? items : [];
        if (!rows.length) {
            return [{
                label: 'Rate not covered',
                status: 'not_covered',
                source: 'No maintained source attached',
                detail: 'Confirm the official tariff line before filing.'
            }];
        }
        const groups = [
            {
                label: 'Needs exact tariff line',
                status: 'scope_check_required',
                rows: rows.filter(item => item.status === 'scope_check_required' || item.status === 'flag_only')
            },
            {
                label: 'Official rate used',
                status: 'official_source_checked',
                rows: rows.filter(item => item.status === 'official_source_checked')
            },
            {
                label: 'Benchmark estimate',
                status: 'benchmark_source_checked',
                rows: rows.filter(item => ['benchmark_source_checked', 'indicative'].includes(item.status))
            },
            {
                label: 'Export filing review',
                status: 'review_basis',
                rows: rows.filter(item => item.status === 'review_basis')
            },
            {
                label: 'Rate not covered',
                status: 'not_covered',
                rows: rows.filter(item => item.status === 'not_covered')
            }
        ];
        return groups
            .filter(group => group.rows.length)
            .map((group) => {
                const first = group.rows[0] || {};
                let source = group.rows.map(item => item.label || item.source).filter(Boolean).slice(0, 2).join(' + ');
                let detail = group.rows
                    .map(item => item.detail || item.source || item.label)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(' · ');
                if (group.status === 'official_source_checked') {
                    source = 'Official tariff source';
                    detail = first.detail || 'Official base duty rate matched for this route and HS prefix.';
                }
                if (group.status === 'scope_check_required') {
                    source = 'Exact tariff-line required';
                    detail = first.detail || 'A broader HS prefix has multiple possible rates; enter a more specific 8-10 digit code before using a final duty amount.';
                }
                if (group.status === 'benchmark_source_checked') {
                    source = 'Maintained benchmark';
                    detail = group.rows.length > 1
                        ? `Benchmark add-ons included: ${group.rows.map(item => item.label || item.source).filter(Boolean).join(', ')}.`
                        : (first.detail || 'Benchmark estimate used because no official route / HS rate is attached yet.');
                }
                if (group.status === 'review_basis') {
                    source = 'Export-side filing logic';
                    detail = first.detail || 'Review declared value, correction posture, and retained evidence for the origin-side filing.';
                }
                if (group.status === 'not_covered') {
                    source = 'No maintained rate';
                    detail = first.detail || 'Confirm the official tariff line before filing.';
                }
                const suffix = group.rows.length > 2 && group.status !== 'benchmark_source_checked' ? ` + ${group.rows.length - 2} more` : '';
                return {
                    label: group.label,
                    status: group.status,
                    source,
                    detail: `${detail}${suffix}`,
                    url: first.url || ''
                };
            });
    }

    function renderCompactSourceList(id, items) {
        renderSourceList(id, compactSourceRows(items));
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

    function buildImportTopConclusion(result, dutyImpact, currency) {
        const sourceBreakdown = dutyImpact.sourceBreakdown || [];
        const confidence = buildRateConfidence(sourceBreakdown);
        const basis = buildRateBasisText(sourceBreakdown);
        if (!dutyImpact.covered) {
            if (result.difference > 0) {
                return `Value gap detected: ${formatMoney(result.difference, currency)}. Duty rate is not covered yet, so confirm official tariff before correction.`;
            }
            return 'No duty estimate available for this route / HS yet. Confirm official tariff before filing or correction.';
        }
        if (dutyImpact.dutyVariance > 0.01) {
            return `Potential duty shortfall: ${formatMoney(dutyImpact.dutyVariance, currency)}. ${basis}: confirm before correction.`;
        }
        if (dutyImpact.dutyVariance < -0.01) {
            return `Declared duty may be higher than estimate by ${formatMoney(Math.abs(dutyImpact.dutyVariance), currency)}. ${basis}: check for overpayment or double-counting.`;
        }
        if (result.difference > 0.01) {
            return `Value gap detected: ${formatMoney(result.difference, currency)}. ${basis}: use the corrected customs value for duty review.`;
        }
        return `No obvious duty shortfall. ${confidence.label}: ${basis}.`;
    }

    function buildExportTopConclusion(result, currency) {
        const difference = result.exportRebateBase - result.declaredAmount;
        if (Math.abs(difference) > 0.01) {
            return `Export filing value gap: ${formatMoney(difference, currency)}. Review before export declaration correction.`;
        }
        return 'No obvious export filing value gap from the entered Incoterm and charges.';
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
            'post-entry-rebate-base-label': 'FOB reference value',
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
                rebateBase: 'FOB reference value',
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
                topConclusion: buildExportTopConclusion(result, currency),
                conclusion: buildExportConclusion(result, currency),
                insights: {
                    valuation: buildValuationLogic(result, currency, focus),
                    duty: buildExportImpactText(exportReview),
                    compliance: exportReview.complianceMeaning,
                    action: exportReview.action
                },
                sourceBreakdown: [{
                    label: exportReview.label || 'Export filing review',
                    status: exportReview.covered ? 'review_basis' : 'not_covered',
                    source: focus === 'export' ? 'Stored export-side post-entry rule' : 'Stored post-entry rule',
                    detail: exportReview.impact || 'Confirm export declaration requirements for the origin country.',
                    url: ''
                }],
                coverageNote: buildCoverageNote([{
                    status: exportReview.covered ? 'review_basis' : 'not_covered'
                }]),
                rateConfidence: buildRateConfidence([{
                    status: exportReview.covered ? 'review_basis' : 'not_covered'
                }]),
                rateDecision: buildRateDecisionSummary([{
                    label: exportReview.label || 'Export filing review',
                    status: exportReview.covered ? 'review_basis' : 'not_covered',
                    detail: exportReview.impact || 'Confirm export declaration requirements for the origin country.'
                }]),
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
            topConclusion: buildImportTopConclusion(result, dutyImpact, currency),
            conclusion: buildPrimaryConclusion(result, currency),
            insights: {
                valuation: buildValuationLogic(result, currency, focus),
                duty: buildDutyImpactText(dutyImpact, currency),
                compliance: valueApi.buildComplianceMeaning(result, context),
                action: dutyImpact.covered && dutyImpact.dutyVariance > 0.01
                    ? dutyImpact.action
                    : valueApi.buildRecommendedAction(result, context)
            },
            sourceBreakdown: dutyImpact.sourceBreakdown || [],
            coverageNote: [buildCoverageNote(dutyImpact.sourceBreakdown || []), buildJurisdictionScopeNote(context)].filter(Boolean).join(' '),
            rateConfidence: buildRateConfidence(dutyImpact.sourceBreakdown || []),
            rateDecision: buildRateDecisionSummary(dutyImpact.sourceBreakdown || []),
            evidence: valueApi.buildEvidenceList(context)
        };
    }

    function renderRateConfidence(confidence) {
        const card = $('post-entry-confidence-card');
        if (!card) return;
        const safe = confidence || buildRateConfidence([]);
        card.className = `post-entry-confidence-card post-entry-confidence-card--${safe.tone || 'indicative'}`;
        const label = $('post-entry-confidence-label');
        const summary = $('post-entry-confidence-summary');
        const chips = $('post-entry-confidence-chips');
        if (label) label.textContent = safe.label || 'Indicative only';
        if (summary) summary.textContent = safe.summary || '';
        if (chips) {
            chips.innerHTML = '';
            (safe.chips || []).forEach((chip) => {
                const el = document.createElement('span');
                el.className = `post-entry-confidence-chip post-entry-confidence-chip--${chip.status || 'indicative'}`;
                el.textContent = chip.label || getSourceStatusLabel(chip.status);
                chips.appendChild(el);
            });
        }
    }

    function renderReviewSnapshot(snapshot) {
        if (!snapshot) return false;
        setResultModeLabels(snapshot.focus);
        const subtitle = $('post-entry-result-subtitle');
        if (subtitle) subtitle.textContent = snapshot.subtitle || 'Post-entry review result.';
        const route = $('post-entry-result-route');
        if (route) route.textContent = snapshot.route || '';
        const decisionStrip = $('post-entry-decision-strip');
        if (decisionStrip) {
            const tone = snapshot.risk?.tone || 'medium';
            decisionStrip.className = `post-entry-decision-strip post-entry-decision-strip--${tone}`;
        }
        const decisionText = $('post-entry-decision-text');
        if (decisionText) decisionText.textContent = snapshot.topConclusion || snapshot.conclusion || 'Review required.';
        const coverageNote = $('post-entry-coverage-note');
        if (coverageNote) coverageNote.textContent = snapshot.coverageNote || buildCoverageNote(snapshot.sourceBreakdown || []);
        renderRateConfidence(snapshot.rateConfidence || buildRateConfidence(snapshot.sourceBreakdown || []));
        renderRateDecision(snapshot.rateDecision || buildRateDecisionSummary(snapshot.sourceBreakdown || []));
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
        const actionSummary = $('post-entry-action-summary');
        if (actionSummary) actionSummary.textContent = snapshot.insights?.action || snapshot.conclusion || 'Keep the review result with the entry file.';
        renderCompactSourceList('post-entry-source-list', snapshot.sourceBreakdown || []);
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
