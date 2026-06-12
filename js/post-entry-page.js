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

    function parseCheckedDate(value) {
        const date = new Date(value || '');
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatCheckedDate(value) {
        const date = parseCheckedDate(value);
        if (!date) return '';
        return date.toISOString().slice(0, 10);
    }

    function getDaysSinceChecked(value) {
        const date = parseCheckedDate(value);
        if (!date) return null;
        return Math.floor((Date.now() - date.getTime()) / 86400000);
    }

    function getCheckedStatus(value) {
        const days = getDaysSinceChecked(value);
        if (days === null) {
            return {
                stale: true,
                label: 'Last checked: unknown'
            };
        }
        return {
            stale: days > 30,
            label: `Last checked: ${formatCheckedDate(value)}${days > 30 ? ' · may be stale' : ''}`
        };
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
            official_source_checked: 'Official exact rate',
            official_heading_benchmark: 'Official heading benchmark',
            benchmark_source_checked: 'Internal benchmark only',
            indicative: 'Internal benchmark only',
            scope_check_required: 'Official heading benchmark',
            flag_only: 'Scope check required',
            not_covered: 'Not covered',
            review_basis: 'Review basis'
        };
        return labels[status] || 'Internal benchmark only';
    }

    function getSourceStatusHelp(status) {
        const labels = {
            official_source_checked: 'A maintained official tariff source is attached and the rate is usable for this pre-check.',
            official_heading_benchmark: 'An official source exists, but the broader HS heading/prefix can contain multiple rates.',
            benchmark_source_checked: 'Maintained by TraceWize as an internal benchmark; useful for screening, not a final tariff lookup.',
            indicative: 'Maintained by TraceWize as an internal benchmark; useful for screening, not a final tariff lookup.',
            scope_check_required: 'The amount depends on exact tariff line, case scope, exclusion, origin, or product-specific facts.',
            flag_only: 'The amount depends on case scope, exclusion, origin, or product-specific facts.',
            not_covered: 'No maintained local rate exists for this route and HS prefix yet.',
            review_basis: 'Value logic is available; local filing correction rules still need confirmation.'
        };
        return labels[status] || labels.indicative;
    }

    function normalizeRateTier(item = {}) {
        const status = item.status || 'indicative';
        const detail = `${item.detail || ''} ${item.source || ''}`.toLowerCase();
        if (status === 'not_covered') return 'not_covered';
        if (status === 'review_basis') return 'review_basis';
        if (status === 'scope_check_required' || status === 'flag_only') return 'official_heading_benchmark';
        if (status === 'benchmark_source_checked' || status === 'indicative') return 'benchmark_source_checked';
        if (status === 'official_source_checked') {
            if (/scope check|required|multiple|benchmark|prefix|\berga omnes\b|heading|chapter/.test(detail)) {
                return 'official_heading_benchmark';
            }
            return 'official_source_checked';
        }
        return status;
    }

    function getRateTierLabel(tier) {
        const labels = {
            official_source_checked: 'Official exact rate',
            official_heading_benchmark: 'Official heading benchmark',
            benchmark_source_checked: 'Internal benchmark only',
            indicative: 'Internal benchmark only',
            not_covered: 'Not covered',
            review_basis: 'Review basis'
        };
        return labels[tier] || labels.indicative;
    }

    function getSourceCoverageLevel(items = []) {
        const tiers = new Set(items.map(normalizeRateTier));
        if (tiers.has('not_covered')) return 'not_covered';
        if (tiers.has('official_heading_benchmark')) return 'official_heading_benchmark';
        if (tiers.size && Array.from(tiers).every(status => status === 'official_source_checked')) {
            return 'official_source_checked';
        }
        if (tiers.has('official_source_checked')) return 'mixed';
        if (tiers.has('benchmark_source_checked')) return 'benchmark_source_checked';
        return tiers.has('review_basis') ? 'review_basis' : 'indicative';
    }

    function countSourceStatuses(items = []) {
        return items.reduce((counts, item) => {
            const tier = normalizeRateTier(item);
            counts[tier] = (counts[tier] || 0) + 1;
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
                label: `${getRateTierLabel(status)} · ${count}`
            }));
        const map = {
            official_source_checked: {
                tone: 'official',
                label: 'Official exact rate',
                summary: 'The displayed duty rate is backed by a maintained official source for this route / HS basis.'
            },
            official_heading_benchmark: {
                tone: 'scope',
                label: 'Official heading benchmark',
                summary: 'An official tariff source is attached, but the exact line or case scope can change the final rate.'
            },
            benchmark_source_checked: {
                tone: 'benchmark',
                label: 'Internal benchmark only',
                summary: 'This uses a maintained TraceWize benchmark. Good for screening; do not treat it as a final official tariff rate.'
            },
            mixed: {
                tone: 'mixed',
                label: 'Mixed source basis',
                summary: 'Official and benchmark layers are mixed. Use the result to identify the gap, then verify the non-official layers before correction.'
            },
            not_covered: {
                tone: 'not-covered',
                label: 'Rate not covered',
                summary: 'No maintained rate exists for this route / HS yet. Only the value math is usable.'
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
        const hasScopeCheck = rows.some(item => normalizeRateTier(item) === 'official_heading_benchmark');
        const officialRows = rows.filter(item => normalizeRateTier(item) === 'official_source_checked');
        const benchmarkRows = rows.filter(item => normalizeRateTier(item) === 'benchmark_source_checked');
        const scopeRows = rows.filter(item => normalizeRateTier(item) === 'official_heading_benchmark');
        const reviewRows = rows.filter(item => normalizeRateTier(item) === 'review_basis');

        if (hasScopeCheck) {
            const target = scopeRows[0] || base || {};
            return {
                tone: 'scope',
                label: 'Official heading benchmark',
                title: 'Use this as a benchmark, not a final payable duty.',
                detail: target.detail || target.source || 'The exact 8-10 digit tariff line can change the rate.'
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
        if (normalizeRateTier(base) === 'official_source_checked') {
            return {
                tone: 'official',
                label: 'Official exact rate',
                title: base.detail || 'Official duty rate matched for this route.',
                detail: benchmarkRows.length
                    ? 'The base duty is official-backed; benchmark tax or add-on layers are separated below.'
                    : 'Displayed duty layers are official-backed in the maintained source table.'
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
            label: 'Internal benchmark only',
            title: base?.detail || 'Duty math uses a maintained benchmark estimate.',
            detail: 'Use this for quick screening; the final official tariff line is not attached yet.'
        };
    }

    function formatSignedMoney(value, currency) {
        const amount = Number(value || 0);
        if (Math.abs(amount) < 0.01) return formatMoney(0, currency);
        const formatted = formatMoney(Math.abs(amount), currency);
        return amount < 0 ? `-${formatted}` : formatted;
    }

    function buildClientSummary(result, dutyImpact, currency, focus, actionText) {
        const valueDifference = focus === 'export'
            ? result.exportRebateBase - result.declaredAmount
            : result.difference;
        const valueTone = Math.abs(valueDifference) > 0.01 ? 'review' : 'clear';
        const summary = {
            valueGap: {
                tone: valueTone,
                label: `${formatSignedMoney(valueDifference, currency)}${result.declaredAmount ? ` (${formatPercent(Math.abs(valueDifference) / result.declaredAmount * 100)})` : ''}`
            },
            dutyGap: {
                tone: 'neutral',
                label: focus === 'export' ? 'Not applicable' : '—'
            },
            action: {
                tone: valueTone,
                label: actionText || 'Keep support with the entry file.'
            }
        };

        if (focus === 'import') {
            if (!dutyImpact?.covered) {
                summary.dutyGap = {
                    tone: 'not-covered',
                    label: 'Rate not covered'
                };
            } else {
                const gap = Number(dutyImpact.dutyVariance || 0);
                summary.dutyGap = {
                    tone: Math.abs(gap) > 0.01 ? 'review' : 'clear',
                    label: `${formatSignedMoney(gap, currency)}`
                };
            }
        }
        return summary;
    }

    function buildCoverageNote(items = []) {
        const level = getSourceCoverageLevel(items);
        if (level === 'official_source_checked') {
            return 'Rate basis: official exact rate.';
        }
        if (level === 'mixed') {
            return 'Rate basis: official rate plus benchmark layers.';
        }
        if (level === 'benchmark_source_checked') {
            return 'Rate basis: internal benchmark only.';
        }
        if (level === 'official_heading_benchmark') {
            return 'Rate basis: official heading benchmark; exact line can change the result.';
        }
        if (level === 'not_covered') {
            return 'Rate basis: not covered; value math only.';
        }
        if (level === 'review_basis') {
            return 'Rate basis: export filing value logic only.';
        }
        return 'Rate basis: internal benchmark only.';
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
            const checked = getCheckedStatus(item.lastCheckedAt);
            const detailParts = [item.source, item.detail, checked.label].filter(Boolean);
            detail.textContent = detailParts.join(' · ') || 'Confirm official source.';
            if (checked.stale) {
                detail.classList.add('post-entry-source-main--stale');
            }
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
                label: 'Official heading benchmark',
                status: 'official_heading_benchmark',
                rows: rows.filter(item => normalizeRateTier(item) === 'official_heading_benchmark')
            },
            {
                label: 'Official exact rate',
                status: 'official_source_checked',
                rows: rows.filter(item => normalizeRateTier(item) === 'official_source_checked')
            },
            {
                label: 'Internal benchmark only',
                status: 'benchmark_source_checked',
                rows: rows.filter(item => normalizeRateTier(item) === 'benchmark_source_checked')
            },
            {
                label: 'Export filing review',
                status: 'review_basis',
                rows: rows.filter(item => normalizeRateTier(item) === 'review_basis')
            },
            {
                label: 'Rate not covered',
                status: 'not_covered',
                rows: rows.filter(item => normalizeRateTier(item) === 'not_covered')
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
                    detail = first.detail || 'Official rate matched for this route and HS basis.';
                }
                if (group.status === 'official_heading_benchmark') {
                    source = 'Official source, broader heading';
                    detail = first.detail || 'A broader HS prefix has multiple possible rates; exact tariff line can change the result.';
                }
                if (group.status === 'benchmark_source_checked') {
                    source = 'TraceWize benchmark';
                    detail = group.rows.length > 1
                        ? `Benchmark layers included: ${group.rows.map(item => item.label || item.source).filter(Boolean).join(', ')}.`
                        : (first.detail || 'Internal benchmark used because no exact official route / HS rate is attached yet.');
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
                    lastCheckedAt: first.lastCheckedAt || '',
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
        const coverageLevel = getSourceCoverageLevel(sourceBreakdown);
        const valueGap = Math.abs(result.difference);
        const hasValueGap = valueGap > 0.01;
        const hasDutyGap = dutyImpact.covered && Math.abs(dutyImpact.dutyVariance || 0) > 0.01;
        if (!dutyImpact.covered) {
            if (result.difference > 0) {
                return `Value gap: ${formatMoney(result.difference, currency)}. Rate not covered, so this is a valuation alert only.`;
            }
            return 'Rate not covered for this route / HS yet. No duty conclusion can be made.';
        }
        if (dutyImpact.dutyVariance > 0.01) {
            return `${confidence.label}: potential duty shortfall ${formatMoney(dutyImpact.dutyVariance, currency)}. Correct value first, then confirm payable duty.`;
        }
        if (dutyImpact.dutyVariance < -0.01) {
            return `${confidence.label}: declared duty may be high by ${formatMoney(Math.abs(dutyImpact.dutyVariance), currency)}. Check overpayment before amendment.`;
        }
        if (hasValueGap) {
            return `${confidence.label}: value gap ${formatMoney(result.difference, currency)} with no duty shortfall against entered duty.`;
        }
        if (coverageLevel === 'official_heading_benchmark') {
            return 'No value gap found. Official benchmark is available, but exact tariff line can still change duty.';
        }
        if (!hasDutyGap) {
            return `No value or duty gap found. ${basis}.`;
        }
        return `No obvious duty shortfall. ${confidence.label}.`;
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
        return `${result.incoterm}: declared amount ${formatMoney(result.declaredAmount, currency)} plus ${charges.join(' + ')} gives customs value ${formatMoney(result.customsValue, currency)}. Declared duty paid is not part of customs value.`;
    }

    function buildDutyImpactText(dutyImpact, currency) {
        if (!dutyImpact.covered) {
            return 'No maintained rate is attached to this route / HS. The page can flag value variance, but it cannot calculate payable duty.';
        }
        const estimatedDuty = formatMoney(dutyImpact.estimatedDuty, currency);
        const dutyGap = formatMoney(dutyImpact.dutyVariance, currency);
        const confidence = buildRateConfidence(dutyImpact.sourceBreakdown || []);
        const basePart = `Base duty ${formatRate(dutyImpact.baseRate)} = ${formatMoney(dutyImpact.baseDuty, currency)}`;
        const addOnParts = (dutyImpact.addOnLayers || [])
            .filter(layer => layer.rate !== null)
            .map(layer => `${layer.label} ${formatRate(layer.rate)} = ${formatMoney(layer.amount, currency)}`);
        const flagParts = (dutyImpact.flagOnlyLayers || [])
            .map(layer => `${layer.label}: official case-scope check required`);
        return [
            `${confidence.label}: ${basePart}.`,
            addOnParts.length ? `Add-ons: ${addOnParts.join('; ')}.` : '',
            flagParts.length ? `Flags: ${flagParts.join('; ')}.` : '',
            `Estimated duty: ${estimatedDuty}; gap vs declared duty paid: ${dutyGap}.`
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
            const exportAction = exportReview.action;
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
                    action: exportAction
                },
                clientSummary: buildClientSummary(result, null, currency, focus, exportAction),
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
        const action = dutyImpact.covered && dutyImpact.dutyVariance > 0.01
            ? dutyImpact.action
            : valueApi.buildRecommendedAction(result, context);
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
                action
            },
            clientSummary: buildClientSummary(result, dutyImpact, currency, focus, action),
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
        const summary = snapshot.clientSummary || {};
        const valueGap = $('post-entry-summary-value-gap');
        const dutyGap = $('post-entry-summary-duty-gap');
        const summaryAction = $('post-entry-summary-action');
        if (valueGap) {
            valueGap.textContent = summary.valueGap?.label || snapshot.values?.difference || '—';
            valueGap.parentElement.className = `post-entry-client-summary-card post-entry-client-summary-card--${summary.valueGap?.tone || 'neutral'}`;
        }
        if (dutyGap) {
            dutyGap.textContent = summary.dutyGap?.label || snapshot.importMetrics?.dutyGap || (snapshot.focus === 'export' ? 'Not applicable' : '—');
            dutyGap.parentElement.className = `post-entry-client-summary-card post-entry-client-summary-card--${summary.dutyGap?.tone || 'neutral'}`;
        }
        if (summaryAction) {
            summaryAction.textContent = summary.action?.label || snapshot.insights?.action || 'Keep support with the entry file.';
            summaryAction.parentElement.className = `post-entry-client-summary-card post-entry-client-summary-card--action post-entry-client-summary-card--${summary.action?.tone || 'neutral'}`;
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
