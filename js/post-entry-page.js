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
            { value: 'IN', label: 'India' },
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
            official_duty_tax_estimate: 'Official duty + tax estimate',
            official_link_checked: 'Official link estimate',
            official_link_estimate: 'Official link estimate',
            official_heading_benchmark: 'Official source, exact code needed',
            benchmark_source_checked: 'Pre-check estimate',
            indicative: 'Pre-check estimate',
            scope_check_required: 'Official source, exact code needed',
            flag_only: 'Official source, exact code needed',
            exact_hs_required: 'Official source, exact code needed',
            export_review_only: 'Export filing review only',
            regional_route_not_exact_rate: 'Regional review only',
            sanctions_scope_separate: 'Sanctions scope separate',
            not_covered: 'Not covered',
            review_basis: 'Review basis'
        };
        return labels[status] || 'Pre-check estimate';
    }

    function getSourceStatusHelp(status) {
        const labels = {
            official_source_checked: 'A maintained official tariff source is attached and the rate is usable for this pre-check.',
            official_link_checked: 'An official tariff source is attached and monitored, but exact machine-readable tariff-line parsing is still pending.',
            official_link_estimate: 'An official tariff source is attached and monitored, but exact machine-readable tariff-line parsing is still pending.',
            official_heading_benchmark: 'An official source exists, but the broader HS heading/prefix can contain multiple rates.',
            benchmark_source_checked: 'Use this as a screening estimate; confirm the final tariff line before filing or correction.',
            indicative: 'Use this as a screening estimate; confirm the final tariff line before filing or correction.',
            scope_check_required: 'The amount depends on exact tariff line, case scope, exclusion, origin, or product-specific facts.',
            flag_only: 'The amount depends on case scope, exclusion, origin, or product-specific facts.',
            exact_hs_required: 'A rate source exists, but the final rate requires the exact 10-digit HS/CN code and filing date.',
            export_review_only: 'This is export-side filing and value review, not an import-duty calculation.',
            regional_route_not_exact_rate: 'Regional route review is available, but exact country filing and tariff treatment must be selected for rate work.',
            sanctions_scope_separate: 'Ordinary value math is separate from sanctions, restricted-party, and export-control scope.',
            not_covered: 'No maintained local rate exists for this route and HS prefix yet.',
            review_basis: 'Value logic is available; local filing correction rules still need confirmation.'
        };
        return labels[status] || labels.indicative;
    }

    function normalizeRateTier(item = {}) {
        const status = item.status || 'indicative';
        const detail = `${item.detail || ''} ${item.source || ''}`.toLowerCase();
        if (status === 'not_covered') return 'not_covered';
        if (['review_basis', 'export_review_only', 'regional_route_not_exact_rate', 'sanctions_scope_separate'].includes(status)) return status;
        if (status === 'exact_hs_required') return 'exact_hs_required';
        if (status === 'scope_check_required' || status === 'flag_only') return 'official_heading_benchmark';
        if (status === 'official_link_checked') return 'official_link_estimate';
        if (status === 'benchmark_source_checked' || status === 'indicative') return 'benchmark_source_checked';
        if (status === 'official_source_checked') {
            if (/scope check|required|multiple|benchmark|prefix|heading|chapter/.test(detail)) {
                return 'official_heading_benchmark';
            }
            return 'official_source_checked';
        }
        return status;
    }

    function getRateTierLabel(tier) {
        const labels = {
            official_source_checked: 'Official exact rate',
            official_heading_benchmark: 'Official source, exact code needed',
            official_link_estimate: 'Official link estimate',
            benchmark_source_checked: 'Pre-check estimate',
            indicative: 'Pre-check estimate',
            not_covered: 'Not covered',
            review_basis: 'Review basis',
            exact_hs_required: 'Official source, exact code needed',
            export_review_only: 'Export filing review only',
            regional_route_not_exact_rate: 'Regional review only',
            sanctions_scope_separate: 'Sanctions scope separate'
        };
        return labels[tier] || labels.indicative;
    }

    function isTaxEstimateLayer(item = {}) {
        return /vat|gst|consumption_tax/i.test(item.component || '');
    }

    function getSourceCoverageLevel(items = []) {
        const tiers = new Set(items.map(normalizeRateTier));
        if (tiers.has('not_covered')) return 'not_covered';
        if (tiers.has('official_heading_benchmark')) return 'official_heading_benchmark';
        if (tiers.has('official_link_estimate')) return 'official_link_estimate';
        if (tiers.size && Array.from(tiers).every(status => status === 'official_source_checked')) {
            return 'official_source_checked';
        }
        if (tiers.has('official_source_checked')) {
            const nonOfficialRows = items.filter(item => normalizeRateTier(item) !== 'official_source_checked');
            if (nonOfficialRows.length && nonOfficialRows.every(isTaxEstimateLayer)) {
                return 'official_duty_tax_estimate';
            }
            return 'mixed';
        }
        if (tiers.has('benchmark_source_checked')) return 'benchmark_source_checked';
        if (tiers.has('exact_hs_required')) return 'exact_hs_required';
        if (tiers.has('export_review_only')) return 'export_review_only';
        if (tiers.has('regional_route_not_exact_rate')) return 'regional_route_not_exact_rate';
        if (tiers.has('sanctions_scope_separate')) return 'sanctions_scope_separate';
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
            official_duty_tax_estimate: {
                tone: 'official',
                label: 'Official duty + tax estimate',
                summary: 'The base duty is official-backed; tax layers such as VAT, GST, or consumption tax remain screening estimates.'
            },
            official_heading_benchmark: {
                tone: 'scope',
                label: 'Official source, exact code needed',
                summary: 'An official tariff source is attached, but the exact tariff code or case scope can change the final rate.'
            },
            official_link_estimate: {
                tone: 'scope',
                label: 'Official link estimate',
                summary: 'The official tariff source is attached and monitored; exact machine-readable tariff-line parsing is still pending.'
            },
            benchmark_source_checked: {
                tone: 'benchmark',
                label: 'Pre-check estimate',
                summary: 'This is a maintained screening estimate. Confirm the final tariff line before filing or correction.'
            },
            mixed: {
                tone: 'mixed',
                label: 'Hybrid official + estimate',
                summary: 'At least one duty layer is official-backed, but add-ons, trade-remedy scope, or local tax layers still need final confirmation.'
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
            exact_hs_required: {
                tone: 'scope',
                label: 'Official source, exact code needed',
                summary: 'The rebate/tax rate cannot be finalized from a 4-6 digit prefix. Use exact 10-digit HS/CN code and filing date.'
            },
            export_review_only: {
                tone: 'review',
                label: 'Export filing review only',
                summary: 'This checks export filing value and correction posture. It is not an import duty or final export tax calculation.'
            },
            regional_route_not_exact_rate: {
                tone: 'review',
                label: 'Regional review only',
                summary: 'The route is regional. Select a specific country for exact filing and rate work.'
            },
            sanctions_scope_separate: {
                tone: 'scope',
                label: 'Sanctions scope separate',
                summary: 'Value math is separate from sanctions, restricted-party, and export-control scope.'
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
        const officialLinkRows = rows.filter(item => normalizeRateTier(item) === 'official_link_estimate');
        const benchmarkRows = rows.filter(item => normalizeRateTier(item) === 'benchmark_source_checked');
        const scopeRows = rows.filter(item => normalizeRateTier(item) === 'official_heading_benchmark');
        const reviewRows = rows.filter(item => ['review_basis', 'export_review_only', 'regional_route_not_exact_rate', 'sanctions_scope_separate'].includes(normalizeRateTier(item)));
        const exactHsRows = rows.filter(item => normalizeRateTier(item) === 'exact_hs_required');

        if (hasScopeCheck) {
            const target = scopeRows[0] || base || {};
            return {
                tone: 'scope',
                label: 'Official source, exact code needed',
                title: 'Use this as a benchmark, not a final payable duty.',
                detail: target.detail || target.source || 'The exact 8-10 digit tariff line can change the rate.'
            };
        }
        if (officialLinkRows.length) {
            const target = officialLinkRows[0] || base || {};
            return {
                tone: 'scope',
                label: 'Official link estimate',
                title: target.detail || 'Official tariff source is attached, but exact parser is pending.',
                detail: 'Use this as a stronger pre-check than a local benchmark; final filing still needs the exact official tariff-line result.'
            };
        }
        if (exactHsRows.length) {
            const target = exactHsRows[0] || {};
            return {
                tone: 'scope',
                label: 'Official source, exact code needed',
                title: 'Rebate rate is not final until exact 10-digit HS/CN is checked.',
                detail: target.detail || 'The page calculates export rebate base only; final rebate rate must come from the official rebate library.'
            };
        }
        if (reviewRows.length) {
            const target = reviewRows[0] || {};
            return {
                tone: 'mixed',
                label: getRateTierLabel(normalizeRateTier(target)),
                title: target.detail || 'Export-side value review is available for this route.',
                detail: 'This result checks declared value logic and correction posture. It does not calculate destination import duty.'
            };
        }
        if (normalizeRateTier(base) === 'official_source_checked') {
            const onlyTaxEstimates = benchmarkRows.length && benchmarkRows.every(isTaxEstimateLayer);
            return {
                tone: 'official',
                label: onlyTaxEstimates ? 'Official duty + tax estimate' : 'Official exact rate',
                title: base.detail || 'Official duty rate matched for this route.',
                detail: onlyTaxEstimates
                    ? 'The base duty is official-backed; VAT/GST/consumption-tax layers are separated as screening estimates.'
                    : benchmarkRows.length
                        ? 'The base duty is official-backed; benchmark tax or add-on layers are separated below.'
                    : 'Displayed duty layers are official-backed in the maintained source table.'
            };
        }
        if (officialRows.length) {
            return {
                tone: 'benchmark',
                label: 'Pre-check estimate',
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
            label: 'Pre-check estimate',
            title: base?.detail || 'Duty math uses a maintained screening estimate.',
            detail: 'Use this for quick screening; confirm the final tariff line before filing or correction.'
        };
    }

    function buildCoverageNote(items = []) {
        const level = getSourceCoverageLevel(items);
        if (level === 'official_source_checked') {
            return 'Rate basis: official exact rate.';
        }
        if (level === 'official_duty_tax_estimate') {
            return 'Rate basis: official duty + tax estimate.';
        }
        if (level === 'mixed') {
            return 'Rate basis: pre-check estimate.';
        }
        if (level === 'benchmark_source_checked') {
            return 'Rate basis: pre-check estimate.';
        }
        if (level === 'official_heading_benchmark') {
            return 'Rate basis: official source, exact code needed.';
        }
        if (level === 'official_link_estimate') {
            return 'Rate basis: official link estimate; parser pending.';
        }
        if (level === 'not_covered') {
            return 'Rate basis: not covered; value math only.';
        }
        if (level === 'exact_hs_required') {
            return 'Export basis: official source, exact code needed.';
        }
        if (level === 'export_review_only') {
            return 'Export basis: filing-value review only; no import duty calculation.';
        }
        if (level === 'regional_route_not_exact_rate') {
            return 'Export basis: regional review only; select a specific country for exact rate work.';
        }
        if (level === 'sanctions_scope_separate') {
            return 'Export basis: filing-value review only; sanctions/export-control scope is separate.';
        }
        if (level === 'review_basis') {
            return 'Rate basis: export filing value logic only.';
        }
        return 'Rate basis: pre-check estimate.';
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
                label: 'Official heading only',
                status: 'official_heading_benchmark',
                rows: rows.filter(item => normalizeRateTier(item) === 'official_heading_benchmark')
            },
            {
                label: 'Official link estimate',
                status: 'official_link_estimate',
                rows: rows.filter(item => normalizeRateTier(item) === 'official_link_estimate')
            },
            {
                label: 'Official exact rate',
                status: 'official_source_checked',
                rows: rows.filter(item => normalizeRateTier(item) === 'official_source_checked')
            },
            {
                label: 'Pre-check estimate',
                status: 'benchmark_source_checked',
                rows: rows.filter(item => normalizeRateTier(item) === 'benchmark_source_checked')
            },
            {
                label: 'Exact HS required',
                status: 'exact_hs_required',
                rows: rows.filter(item => normalizeRateTier(item) === 'exact_hs_required')
            },
            {
                label: 'Export filing review',
                status: 'review_basis',
                rows: rows.filter(item => ['review_basis', 'export_review_only', 'regional_route_not_exact_rate', 'sanctions_scope_separate'].includes(normalizeRateTier(item)))
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
                if (group.status === 'official_link_estimate') {
                    source = first.source || 'Official tariff source';
                    detail = first.detail || 'Official source is attached; exact machine-readable tariff-line parsing is still pending.';
                }
                if (group.status === 'benchmark_source_checked') {
                    source = 'Pre-check estimate';
                    detail = group.rows.length > 1
                        ? `Estimate layers included: ${group.rows.map(item => item.label || item.source).filter(Boolean).join(', ')}.`
                        : (first.detail || 'Screening estimate used because no exact official route / HS rate is attached yet.');
                }
                if (group.status === 'review_basis') {
                    source = first.source || 'Export-side filing logic';
                    detail = first.detail || 'Review declared value, correction posture, and retained evidence for the origin-side filing.';
                }
                if (group.status === 'exact_hs_required') {
                    source = first.source || 'Official rebate library check';
                    detail = first.detail || 'Exact 10-digit HS/CN code and filing date are required before using a final rebate rate.';
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
        const valueApi = getValueApi();
        const decision = valueApi?.buildImportPostEntryDecision
            ? valueApi.buildImportPostEntryDecision(result, dutyImpact, { currency })
            : null;
        if (decision?.coreConclusion) {
            return decision.coreConclusion;
        }
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

    function getExportSourceStatus(exportReview, context = {}) {
        const origin = String(context.originCountryCode || '').toUpperCase();
        if (origin === 'CN') return 'exact_hs_required';
        if (origin === 'ASEAN') return 'regional_route_not_exact_rate';
        if (origin === 'RU') return 'sanctions_scope_separate';
        return exportReview.covered ? 'export_review_only' : 'not_covered';
    }

    function buildExportSourceRow(exportReview, context = {}) {
        const status = getExportSourceStatus(exportReview, context);
        const origin = String(context.originCountryCode || '').toUpperCase();
        if (origin === 'CN') {
            return {
                label: 'China export VAT rebate basis',
                status,
                source: 'Official rebate library by exact HS/CN',
                detail: 'Export rebate base is calculated here; final rebate rate requires exact 10-digit HS/CN code and filing date.',
                url: 'https://www.chinatax.gov.cn/'
            };
        }
        return {
            label: exportReview.label || 'Export filing review',
            status,
            source: 'Origin-side export filing review',
            detail: exportReview.impact || 'Confirm export declaration requirements for the origin country.',
            url: ''
        };
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
            const exportSourceRow = buildExportSourceRow(exportReview, context);
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
                sourceBreakdown: [exportSourceRow],
                coverageNote: buildCoverageNote([exportSourceRow]),
                rateConfidence: buildRateConfidence([exportSourceRow]),
                rateDecision: buildRateDecisionSummary([exportSourceRow]),
                evidence: exportReview.evidence
            };
        }

            const dutyImpact = valueApi.calculateDutyImpact(result, context, {
            declaredDuty: input.declaredDuty
        });
        const importDecision = valueApi.buildImportPostEntryDecision
            ? valueApi.buildImportPostEntryDecision(result, dutyImpact, { currency })
            : null;
        const action = importDecision?.nextAction
            || (dutyImpact.covered && dutyImpact.dutyVariance > 0.01
                ? dutyImpact.action
                : valueApi.buildRecommendedAction(result, context));
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

    function formatSyncDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function buildDutySyncSummary(payload = {}) {
        const counts = payload.counts || {};
        const exceptions = Number(counts.exceptions || 0);
        const rateChanges = Number(counts.total_rate_changes || 0);
        const changes = Number(counts.total_changes || 0);
        const sources = Number(counts.sources_checked || 0);
        const updatedAt = formatSyncDate(payload.finished_at || payload.updated_at);
        const timeText = updatedAt ? ` Latest sync: ${updatedAt}.` : '';

        if (exceptions > 0) {
            return {
                tone: 'exception',
                title: 'Duty source sync needs review',
                summary: `${exceptions} exception(s) were reported. Use the value math, but do not rely on affected route rates until the admin exception list is cleared.${timeText}`
            };
        }

        if (rateChanges > 0) {
            return {
                tone: 'changed',
                title: 'Material duty-rate change detected',
                summary: `${rateChanges} rate change(s) were detected across ${sources || 'the monitored'} source(s). Re-check quote, landed cost, and correction amount before filing.${timeText}`
            };
        }

        if (changes > 0 || sources > 0) {
            return {
                tone: 'stable',
                title: 'No material duty-rate change detected',
                summary: `${sources || 'Monitored'} source(s) synced with ${changes} metadata/source update(s), but no material duty-rate change was reported.${timeText}`
            };
        }

        return {
            tone: 'review',
            title: 'Duty source status unavailable',
            summary: 'Use the rate confidence card below and confirm the official tariff line before filing.'
        };
    }

    function renderDutySyncCard(summary) {
        const card = $('post-entry-duty-sync-card');
        if (!card || !summary) return;
        card.hidden = false;
        card.className = `post-entry-duty-sync-card post-entry-duty-sync-card--${summary.tone || 'review'}`;
        const title = $('post-entry-duty-sync-title');
        const text = $('post-entry-duty-sync-summary');
        if (title) title.textContent = summary.title || 'Duty source status';
        if (text) text.textContent = summary.summary || '';
    }

    async function hydrateDutySyncStatus() {
        const card = $('post-entry-duty-sync-card');
        if (!card) return;
        try {
            const response = await fetch('data/duty-rate-sync-status.json', { cache: 'no-store' });
            if (!response.ok) return;
            const payload = await response.json();
            renderDutySyncCard(buildDutySyncSummary(payload));
        } catch (error) {
            card.hidden = true;
        }
    }

    function renderReviewSnapshot(snapshot) {
        if (!snapshot) return false;
        setResultModeLabels(snapshot.focus);
        const isExport = snapshot.focus === 'export';
        const title = $('post-entry-result-title');
        if (title) title.textContent = isExport ? 'Export Filing Review Result' : 'Import Duty Review Result';
        const confidenceKicker = $('post-entry-confidence-kicker');
        if (confidenceKicker) confidenceKicker.textContent = isExport ? 'Review basis' : 'Rate confidence';
        const sourceTitle = $('post-entry-source-title');
        if (sourceTitle) sourceTitle.textContent = isExport ? 'Export review basis' : 'Rate source status';
        const sourceNote = $('post-entry-source-note');
        if (sourceNote) sourceNote.textContent = isExport
            ? 'Export-side checks show filing-value and correction basis. Final rebate/tax rates are only shown when exact official coverage exists.'
            : 'Official rate used when available. Exact tariff-line checks stay separate from benchmark estimates.';
        const dutyImpactLabel = $('post-entry-duty-impact-label');
        if (dutyImpactLabel) dutyImpactLabel.textContent = isExport ? 'Filing impact' : 'Duty impact';
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
        hydrateDutySyncStatus();
        return true;
    }

    function setEntryDateParts(value) {
        const parts = String(value || '').match(/^(\d{2})\s\/\s(\d{2})\s\/\s(\d{2})$/);
        const ids = ['post-entry-date-month', 'post-entry-date-day', 'post-entry-date-year'];
        ids.forEach((id, index) => {
            const input = $(id);
            if (input) input.value = parts ? parts[index + 1] : '';
        });
        const hidden = $('post-entry-date');
        if (hidden) hidden.value = parts ? value : '';
    }

    function setPostEntryFocus(focus) {
        selectedPostEntryFocus = focus || '';
        const buttons = Array.from(document.querySelectorAll('[data-post-entry-focus]'));
        buttons.forEach((button) => {
            const active = button.dataset.postEntryFocus === selectedPostEntryFocus;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function normalizeCountryParam(value) {
        const registry = getRegistryApi();
        if (registry?.normalizeCountryCode) {
            return registry.normalizeCountryCode(value || '');
        }
        return String(value || '').trim().toUpperCase();
    }

    function applyPostEntryQueryParams() {
        const params = new URLSearchParams(global.location?.search || '');
        if (!params.toString()) return;
        const from = normalizeCountryParam(params.get('from') || params.get('origin') || '');
        const to = normalizeCountryParam(params.get('to') || params.get('import') || params.get('country') || '');
        const focus = String(params.get('focus') || '').toLowerCase();
        const hs = String(params.get('hs') || params.get('hscode') || params.get('hs_code') || '').replace(/\D/g, '');
        const entryDate = params.get('entryDate') || params.get('entry_date') || '';

        if (from) {
            const origin = $('post-entry-origin-country');
            if (origin) origin.value = from;
        }
        if (to) {
            const destination = $('post-entry-import-country');
            if (destination) destination.value = to;
        }
        if (hs) {
            const hsInput = $('post-entry-hs-code');
            if (hsInput) hsInput.value = hs;
        }
        if (focus === 'import' || focus === 'export') {
            setPostEntryFocus(focus);
        }
        if (/^\d{2}\s\/\s\d{2}\s\/\s\d{2}$/.test(entryDate)) {
            setEntryDateParts(entryDate);
        }
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
                setPostEntryFocus(button.dataset.postEntryFocus || '');
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
        applyPostEntryQueryParams();
        bindForm();
    }

    global.bootstrapPostEntryPage = bootstrapPostEntryPage;
}(typeof globalThis !== 'undefined' ? globalThis : window));
