'use strict';

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TraceWizeTariffWatch = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const COUNTRY_LABELS = {
        CN: 'China',
        US: 'United States',
        EU: 'European Union',
        DE: 'Germany',
        NL: 'Netherlands',
        SG: 'Singapore',
        MX: 'Mexico',
        VN: 'Vietnam',
        MY: 'Malaysia',
        IN: 'India',
        JP: 'Japan',
        KR: 'South Korea',
        TW: 'Taiwan',
        RU: 'Russia'
    };
    const MARKET_PRIORITY = ['US', 'CN', 'EU', 'SG', 'MX', 'JP', 'KR', 'IN', 'DE', 'NL', 'MY', 'VN', 'TW', 'RU'];

    function countryLabel(code) {
        if (!code) return 'selected market';
        return COUNTRY_LABELS[code] || code;
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function formatDate(value) {
        if (!value) return 'Not synced yet';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not synced yet';
        return date.toISOString().slice(0, 10);
    }

    function unique(values) {
        return [...new Set(values.filter(Boolean))];
    }

    function formatPercent(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 'n/a';
        return `${(number * 100).toFixed(number === 0 ? 1 : 1)}%`;
    }

    function compactList(values, limit = 3) {
        const list = unique(asArray(values));
        if (list.length <= limit) return list.join(', ');
        return `${list.slice(0, limit).join(', ')} +${list.length - limit}`;
    }

    function rateConfidenceRank(rule = {}) {
        const confidence = String(rule.confidence || '').toLowerCase();
        const sourceStatus = String(rule.source_status || '').toLowerCase();
        if (confidence.includes('candidate') || sourceStatus.includes('scope_check_required')) return 0;
        if (confidence.includes('official') && sourceStatus.includes('official')) return 3;
        if (confidence.includes('official') || sourceStatus.includes('official')) return 2;
        if (confidence.includes('indicative') || sourceStatus.includes('checked')) return 1;
        return 0;
    }

    function getRateFreshness(value, now = Date.now()) {
        const checkedAt = new Date(value || '').getTime();
        if (!Number.isFinite(checkedAt)) {
            return { label: 'Date unavailable', tone: 'unknown', stale: true, ageDays: null };
        }
        const ageDays = Math.max(0, Math.floor((now - checkedAt) / 86400000));
        if (ageDays > 7) return { label: `Stale · ${ageDays}d`, tone: 'stale', stale: true, ageDays };
        if (ageDays > 2) return { label: `Review age · ${ageDays}d`, tone: 'aging', stale: false, ageDays };
        return { label: 'Fresh', tone: 'fresh', stale: false, ageDays };
    }

    function describeRateTrust(rule = {}, checkedAt = '') {
        const confidence = String(rule.confidence || '');
        const sourceStatus = String(rule.source_status || '');
        const merged = `${confidence} ${sourceStatus}`.toLowerCase();
        const freshness = getRateFreshness(checkedAt);
        if (merged.includes('candidate') || merged.includes('scope_check_required')) {
            return {
                label: 'Pre-check candidate',
                tone: 'candidate',
                detail: 'A maintained estimate is available, but no exact official tariff row has been parsed yet.',
                freshness
            };
        }
        if (merged.includes('exact')) {
            return {
                label: freshness.stale ? 'Exact HS · stale' : 'Exact HS',
                tone: freshness.stale ? 'stale' : 'exact',
                detail: freshness.stale ? 'Exact-line evidence exists but needs a fresh official-source check.' : 'Best for quote screening when the product matches this maintained HS line.',
                freshness
            };
        }
        if (merged.includes('official') && merged.includes('hybrid')) {
            return {
                label: 'Official / hybrid',
                tone: 'official',
                detail: 'Official source is maintained; exact filing line still needs confirmation.',
                freshness
            };
        }
        if (merged.includes('official')) {
            return {
                label: 'Official maintained',
                tone: 'official',
                detail: 'Official source coverage exists for this route / HS scope.',
                freshness
            };
        }
        if (merged.includes('heading')) {
            return {
                label: 'Heading only',
                tone: 'heading',
                detail: 'Use as a maintained heading-level signal before exact HS filing.',
                freshness
            };
        }
        return {
            label: 'Pre-check estimate',
            tone: 'estimate',
            detail: 'Directional tariff signal; verify official exact tariff line before filing.',
            freshness
        };
    }

    function inferProductGroup(rule = {}, hsScope = '') {
        const label = String(rule.label || '').toLowerCase();
        const hs = String(hsScope || '');
        if (label.includes('battery') || hs.startsWith('8507')) return 'Battery / energy storage';
        if (label.includes('solar') || hs.startsWith('854143')) return 'Solar / photovoltaic';
        if (label.includes('semiconductor') || label.includes('chip') || hs.startsWith('85423')) return 'Semiconductor / AI hardware';
        if (label.includes('smartphone') || label.includes('wireless') || hs.startsWith('8517')) return 'Wireless / telecom';
        if (label.includes('medical') || label.includes('lab') || hs.startsWith('9018') || hs.startsWith('9027')) return 'Healthcare / lab device';
        if (label.includes('robot') || hs.startsWith('847950')) return 'Industrial automation';
        if (label.includes('gaming') || hs.startsWith('950450')) return 'Gaming / console';
        if (label.includes('computer') || label.includes('server') || hs.startsWith('8471')) return 'Computing / data processing';
        return 'General high-tech goods';
    }

    function classifyTariffUse(row = {}) {
        const confidence = `${row.confidence || ''} ${row.sourceStatus || ''} ${row.trustLabel || ''}`.toLowerCase();
        const hasOfficial = row.rank >= 2 || confidence.includes('official');
        const hasExact = confidence.includes('exact');
        const hasHeadingOnly = confidence.includes('heading');
        const hasEstimate = confidence.includes('estimate') || confidence.includes('pre-check');

        if (hasOfficial && hasExact) {
            return {
                bucket: 'quote',
                label: 'Quote-ready screen',
                tone: 'quote',
                guidance: 'Use for quote screening when the product, origin, and entry date match this maintained HS line.'
            };
        }

        if (hasOfficial && !hasEstimate) {
            return {
                bucket: 'precheck',
                label: hasHeadingOnly ? 'Heading-level pre-check' : 'Official pre-check',
                tone: 'precheck',
                guidance: 'Good for early pricing review; confirm exact tariff line and add-on layers before filing or final customer quote.'
            };
        }

        return {
            bucket: 'source',
            label: 'Needs source work',
            tone: 'source',
            guidance: 'Use only as a directional signal until the official exact tariff line is refreshed.'
        };
    }

    function buildTariffRow(rule = {}, dutyRates = {}, override = null) {
        const baseRate = toNumber(override?.base_rate ?? rule.base_rate);
        const addOnRate = toNumber(rule.additional_rate);
        const totalRate = baseRate + addOnRate;
        const hsScope = override?.hs_code || compactList(rule.hs_prefixes, 4) || rule.source_hts || 'HS required';
        const checkedAt = override?.last_checked_at || rule.last_checked_at || dutyRates.updated_at;
        const trust = describeRateTrust(override || rule, checkedAt);
        const row = {
            id: override ? `${rule.id}-${override.hs_code}` : rule.id,
            importCountry: rule.import_country,
            marketKey: rule.import_country || 'unknown',
            importMarket: countryLabel(rule.import_country),
            originScope: rule.origin_country === '*' ? 'all origins' : countryLabel(rule.origin_country),
            hsScope,
            productGroup: inferProductGroup(rule, hsScope),
            label: rule.label || 'Maintained tariff signal',
            baseRate: formatPercent(baseRate),
            addOnRate: formatPercent(addOnRate),
            totalRate: formatPercent(totalRate),
            totalRateValue: totalRate,
            confidence: override?.confidence || rule.confidence || rule.source_status || 'Pre-check estimate',
            sourceStatus: override?.source_status || rule.source_status || 'maintained',
            sourceText: override?.source_rate_text || override?.source_note || rule.source_rate_text || rule.source_note || '',
            trustLabel: trust.label,
            trustTone: trust.tone,
            trustDetail: trust.detail,
            freshnessLabel: trust.freshness.label,
            freshnessTone: trust.freshness.tone,
            stale: trust.freshness.stale,
            lastChecked: formatDate(checkedAt),
            rank: rateConfidenceRank(override || rule)
        };
        return {
            ...row,
            useStatus: classifyTariffUse(row)
        };
    }

    function buildTariffRows(dutyRates = {}) {
        const deduped = new Map();
        asArray(dutyRates.rules).forEach((rule) => {
            const prefixes = asArray(rule.hs_prefixes);
            const overrides = asArray(rule.exact_code_overrides).filter((override) => {
                if (!prefixes.length) return true;
                return prefixes.some((prefix) => String(override.hs_code || '').startsWith(String(prefix)));
            });
            const sourceRows = overrides.length
                ? overrides.map((override) => buildTariffRow(rule, dutyRates, override))
                : [buildTariffRow(rule, dutyRates)];
            sourceRows.forEach((row) => {
                const key = `${row.marketKey}|${row.originScope}|${row.hsScope}`;
                const existing = deduped.get(key);
                if (!existing || row.rank > existing.rank || row.totalRateValue > existing.totalRateValue) {
                    deduped.set(key, row);
                }
            });
        });

        return [...deduped.values()]
            .sort((a, b) => {
                if (b.rank !== a.rank) return b.rank - a.rank;
                if (b.totalRateValue !== a.totalRateValue) return b.totalRateValue - a.totalRateValue;
                return a.importMarket.localeCompare(b.importMarket);
            });
    }

    function buildCurrentTariffRows(dutyRates = {}, limit = 10) {
        const rows = buildTariffRows(dutyRates);

        const selected = [];
        const seenMarkets = new Set();
        MARKET_PRIORITY.forEach((country) => {
            const row = rows.find((candidate) => candidate.importCountry === country);
            if (row && selected.length < limit) {
                selected.push(row);
                seenMarkets.add(country);
            }
        });
        rows.forEach((row) => {
            if (!selected.includes(row) && selected.length < limit) {
                selected.push(row);
            }
        });

        return selected;
    }

    function buildMarketCoverageRows(dutyRates = {}) {
        const map = new Map();
        buildTariffRows(dutyRates).forEach((rule) => {
            const key = rule.marketKey || 'unknown';
            const current = map.get(key) || {
                countryCode: key,
                country: countryLabel(key),
                rules: 0,
                official: 0,
                exact: 0,
                headingOnly: 0,
                estimate: 0,
                hsPrefixes: new Set(),
                maxTotalRate: 0,
                lastChecked: ''
            };
            current.rules += 1;
            if (rule.rank >= 2) current.official += 1;
            if (rule.useStatus?.bucket === 'quote') current.quoteReady = (current.quoteReady || 0) + 1;
            if (rule.useStatus?.bucket === 'precheck') current.precheckOnly = (current.precheckOnly || 0) + 1;
            if (rule.useStatus?.bucket === 'source') current.needsSource = (current.needsSource || 0) + 1;
            if (String(rule.confidence || '').toLowerCase().includes('exact')) {
                current.exact += 1;
            } else if (String(rule.confidence || '').toLowerCase().includes('heading')) {
                current.headingOnly += 1;
            } else {
                current.estimate += 1;
            }
            current.hsPrefixes.add(rule.hsScope);
            current.maxTotalRate = Math.max(current.maxTotalRate, rule.totalRateValue);
            current.lastChecked = current.lastChecked || rule.lastChecked || dutyRates.updated_at || '';
            map.set(key, current);
        });

        return [...map.values()]
            .sort((a, b) => b.rules - a.rules || a.country.localeCompare(b.country))
            .map((row) => ({
                marketKey: row.countryCode,
                country: row.country,
                rules: row.rules,
                official: row.official,
                hsCoverage: row.hsPrefixes.size,
                highestSignal: formatPercent(row.maxTotalRate),
                lastChecked: formatDate(row.lastChecked),
                sourceMix: {
                    exact: row.exact,
                    headingOnly: row.headingOnly,
                    estimate: row.estimate
                },
                useBuckets: {
                    quoteReady: row.quoteReady || 0,
                    precheckOnly: row.precheckOnly || 0,
                    needsSource: row.needsSource || 0
                },
                coverageLabel: row.exact > 0
                    ? 'Exact HS lines available'
                    : row.official === row.rules
                        ? 'Official maintained coverage'
                        : 'Pre-check coverage',
                useCase: row.exact > 0
                    ? 'Use for quote screening and Post-Entry pre-check when the product matches a maintained HS line.'
                    : 'Use as a market-level tariff signal; confirm the exact HS line before filing or customer quotation.',
                nextAction: row.exact > 0
                    ? 'Check entry date, origin, and add-on layers before relying on the result.'
                    : 'Enter exact HS / product details and verify the official tariff line before filing.'
            }));
    }

    function buildSpecialProgramRows(dutyRates = {}) {
        return asArray(dutyRates.special_programs).flatMap((program) => {
            const markets = asArray(program.import_markets);
            return markets.map((marketKey) => ({
                id: program.id,
                marketKey,
                market: countryLabel(marketKey),
                label: program.label || program.legal_basis || 'Special tariff program',
                legalBasis: program.legal_basis || '',
                status: program.status || 'monitored',
                effectiveFrom: formatDate(program.effective_from),
                originScope: asArray(program.origin_countries).map(countryLabel).join(', ') || 'specified origins',
                scopeStatus: program.scope_status || '',
                scopeNote: program.scope_note || '',
                annexCounts: program.annex_counts || {},
                annexContentHash: program.annex_content_hash || '',
                annexLastChecked: formatDate(program.annex_last_checked_at || program.last_verified_at),
                treatments: asArray(program.treatments).map((row) => ({
                    annex: row.annex || '',
                    treatment: row.treatment || ''
                })),
                declarationCodes: {
                    measureTypes: asArray(program.declaration_codes?.taric_measure_types),
                    preferenceCode: program.declaration_codes?.preference_code || '',
                    originDocument: program.declaration_codes?.origin_document_code || ''
                },
                originEvidence: program.origin_evidence || {},
                quotaStatus: program.quota_status || {},
                suspensionWatch: program.suspension_watch || {},
                officialUrl: program.official_url || '',
                originProcedureUrl: program.origin_procedure_url || '',
                lastVerified: formatDate(program.last_verified_at || dutyRates.updated_at)
            }));
        });
    }

    function findQueue(syncStatus = {}) {
        const digest = syncStatus.automation_digest || {};
        return asArray(digest.priority_queue);
    }

    function findCountriesWithAttention(syncStatus = {}) {
        const diagnostics = syncStatus.ci_diagnostics || {};
        const digest = syncStatus.automation_digest || {};
        return unique([
            ...asArray(diagnostics.degraded_sources),
            ...asArray(diagnostics.parser_gap_countries),
            ...asArray(digest.degraded_countries),
            ...asArray(digest.parser_gap_countries)
        ]);
    }

    function buildWatchItems(syncStatus = {}, limit = 8) {
        const counts = syncStatus.counts || {};
        const rateChanges = toNumber(counts.total_rate_changes || syncStatus.automation_digest?.rate_change_count);
        const queue = findQueue(syncStatus);
        const degraded = asArray(syncStatus.ci_diagnostics?.degraded_details);
        const parserGaps = asArray(syncStatus.ci_diagnostics?.parser_gap_details);
        const items = [];
        const programChanges = asArray(syncStatus.runs)
            .flatMap((run) => asArray(run.changes))
            .filter((change) => /^special_program_/.test(String(change.change_type || '')));

        programChanges.forEach((change) => {
            const affectedHs = asArray(change.affected_hs);
            const affectedOrders = asArray(change.affected_order_numbers);
            items.push({
                tone: 'changed',
                route: 'United States origin to European Union',
                product: affectedHs.length
                    ? `CN ${compactList(affectedHs, 5)}`
                    : affectedOrders.length
                        ? `Quota ${compactList(affectedOrders, 5)}`
                        : 'Regulation (EU) 2026/1455 / Article 59a',
                changeType: change.change_type === 'special_program_origin_procedure_change'
                    ? 'Origin evidence procedure changed'
                    : change.change_type === 'special_program_quota_change'
                        ? 'Live quota balance changed'
                        : 'Official Annex scope changed',
                beforeAfter: asArray(change.before_after).length
                    ? compactList(change.before_after, 3)
                    : `Added ${asArray(change.added_hs).length} · removed ${asArray(change.removed_hs).length} · changed ${asArray(change.changed_hs).length}`,
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: 'Re-run Post-Entry checks before claiming the adjusted duty treatment.',
                sourceStatus: 'Official regulation monitor'
            });
        });

        if (rateChanges > 0) {
            items.push({
                tone: 'changed',
                route: 'Monitored high-tech routes',
                product: 'Maintained duty-rate rules',
                changeType: 'Material rate change',
                beforeAfter: `${rateChanges} change(s) detected`,
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: 'Refresh quote, Post-Entry review, and customer pricing before shipment.',
                sourceStatus: 'Rate changed'
            });
        }

        degraded.forEach((row) => {
            items.push({
                tone: 'review',
                route: `Imports into ${countryLabel(row.country)}`,
                product: 'Official source monitor',
                changeType: row.label || 'Source degraded',
                beforeAfter: 'Official probe needs retry',
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: row.action || 'Use maintained rates and retry the official source before filing-grade promotion.',
                sourceStatus: row.source || row.reason || 'Official source'
            });
        });

        parserGaps.slice(0, Math.max(0, limit - items.length)).forEach((row) => {
            items.push({
                tone: row.priority === 'P1' ? 'watch' : 'stable',
                route: `Imports into ${countryLabel(row.country)}`,
                product: row.stage || 'Exact tariff parser',
                changeType: `${row.priority || 'P'} parser coverage`,
                beforeAfter: 'Exact-code parser not fully promoted',
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: row.action || 'Confirm exact tariff line before relying on filing-grade rates.',
                sourceStatus: 'Coverage update'
            });
        });

        queue.slice(0, Math.max(0, limit - items.length)).forEach((row) => {
            items.push({
                tone: row.run_status === 'ok' ? 'stable' : 'review',
                route: `Imports into ${countryLabel(row.country)}`,
                product: row.workstream || row.rate_automation_stage || 'Duty-rate automation',
                changeType: row.rate_automation_stage || 'Automation status',
                beforeAfter: row.run_status || 'tracked',
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: row.next_action || 'Keep source coverage refreshed before quote or filing.',
                sourceStatus: row.update_command || row.probe_command || 'Maintained source'
            });
        });

        if (!items.length) {
            items.push({
                tone: 'stable',
                route: 'All monitored routes',
                product: 'Duty-rate monitor',
                changeType: 'No material change',
                beforeAfter: 'Stable',
                effectiveDate: formatDate(syncStatus.finished_at || syncStatus.updated_at),
                impact: 'No tariff refresh action from the latest sync.',
                sourceStatus: 'No exceptions'
            });
        }

        return items.slice(0, limit);
    }

    function buildAutomationActions(syncStatus = {}, limit = 8) {
        const degraded = asArray(syncStatus.ci_diagnostics?.degraded_details);
        const parserGaps = asArray(syncStatus.ci_diagnostics?.parser_gap_details);
        const queue = findQueue(syncStatus);
        const actions = [];
        const seen = new Set();
        const addAction = (action) => {
            const key = `${action.country}|${action.title}|${action.nextAction}`;
            if (seen.has(key) || actions.length >= limit) return;
            seen.add(key);
            actions.push(action);
        };

        degraded.forEach((row) => addAction({
            tone: 'review',
            priority: 'Source retry',
            country: countryLabel(row.country),
            title: row.label || 'Official source needs retry',
            nextAction: row.action || 'Retry the official source before filing-grade promotion.',
            evidence: row.source || row.reason || 'Official source monitor'
        }));

        parserGaps.forEach((row) => addAction({
            tone: row.priority === 'P1' ? 'watch' : 'stable',
            priority: row.priority || 'Parser gap',
            country: countryLabel(row.country),
            title: row.stage || 'Exact tariff parser',
            nextAction: row.action || 'Promote only unambiguous exact HS rows.',
            evidence: 'Exact-code coverage backlog'
        }));

        queue.forEach((row) => {
            const task = row.parser_gap_task || {};
            addAction({
                tone: row.run_status === 'ok' ? 'stable' : 'review',
                priority: task.priority || row.run_status || 'Tracked',
                country: countryLabel(row.country),
                title: row.workstream || row.rate_automation_stage || 'Duty-rate automation',
                nextAction: row.next_action || task.next_action || row.degraded_action || 'Keep source coverage refreshed before quote or filing.',
                evidence: asArray(task.parser_subtasks || row.parser_subtasks).slice(0, 2).join(' ') || row.update_command || 'Maintained automation queue'
            });
        });

        if (!actions.length) {
            actions.push({
                tone: 'stable',
                priority: 'Stable',
                country: 'All monitored markets',
                title: 'No automation action',
                nextAction: 'No source/parser follow-up from the latest sync.',
                evidence: 'Latest duty-rate sync completed without exceptions.'
            });
        }

        return actions;
    }

    function buildTariffWatchModel({ syncStatus = {}, dutyRates = {}, limit = 8 } = {}) {
        const counts = syncStatus.counts || {};
        const diagnostics = syncStatus.ci_diagnostics || {};
        const rateChanges = toNumber(counts.total_rate_changes || syncStatus.automation_digest?.rate_change_count);
        const sourceUpdates = toNumber(counts.total_changes);
        const sourcesChecked = toNumber(counts.sources_checked);
        const impactedCountries = findCountriesWithAttention(syncStatus);
        const impactedRoutes = impactedCountries.slice(0, 6).map((code) => `Imports into ${countryLabel(code)}`);
        const watchItems = buildWatchItems(syncStatus, limit);
        const actionCount = toNumber(counts.exceptions)
            + toNumber(counts.degraded_sources)
            + toNumber(counts.parser_gap_sources);

        return {
            updatedAt: syncStatus.finished_at || syncStatus.updated_at || '',
            status: syncStatus.status || 'unknown',
            headline: rateChanges > 0
                ? `${rateChanges} material tariff / duty change(s) need review.`
                : 'No material duty-rate change detected in the latest sync.',
            subhead: rateChanges > 0
                ? 'Refresh quotes and Post-Entry checks for affected routes before filing.'
                : `${sourceUpdates} source / parser update(s) were monitored without a material rate-change signal.`,
            metrics: [
                {
                    label: "Today's rate changes",
                    value: String(rateChanges),
                    detail: rateChanges > 0 ? 'Pricing refresh needed' : 'No rate-change action'
                },
                {
                    label: 'Impacted routes',
                    value: String(impactedRoutes.length),
                    detail: impactedRoutes.length ? impactedRoutes.slice(0, 2).join(' · ') : 'No route-specific alerts'
                },
                {
                    label: 'Action needed',
                    value: String(actionCount),
                    detail: actionCount ? 'Parser/source follow-up' : 'No exceptions'
                }
            ],
            sourcesChecked,
            sourceUpdates,
            rateChanges,
            specialProgramChanges: asArray(syncStatus.runs)
                .flatMap((run) => asArray(run.changes))
                .filter((change) => /^special_program_/.test(String(change.change_type || ''))),
            impactedRoutes,
            currentTariffRows: buildCurrentTariffRows(dutyRates, 12),
            marketTariffRows: buildTariffRows(dutyRates),
            marketCoverageRows: buildMarketCoverageRows(dutyRates),
            specialPrograms: buildSpecialProgramRows(dutyRates),
            watchItems,
            automationActions: buildAutomationActions(syncStatus, limit),
            degradedSources: asArray(diagnostics.degraded_sources),
            parserGapCountries: asArray(diagnostics.parser_gap_countries),
            ciSummary: diagnostics.summary || syncStatus.automation_digest?.headline || ''
        };
    }

    function buildRouteTariffAlert(syncStatus = {}, route = {}) {
        const counts = syncStatus.counts || {};
        const rateChanges = toNumber(counts.total_rate_changes || syncStatus.automation_digest?.rate_change_count);
        const country = route.focus === 'export' ? route.from : route.to;
        const countryName = countryLabel(country);
        const attentionCountries = findCountriesWithAttention(syncStatus);
        const hasAttention = attentionCountries.includes(country);

        if (rateChanges > 0) {
            return {
                tone: 'changed',
                title: `Tariff Watch: ${rateChanges} material rate change(s) detected`,
                text: `Refresh ${countryName} pricing, Post-Entry values, and source evidence before filing.`,
                href: 'tariff-watch.html'
            };
        }

        if (hasAttention) {
            return {
                tone: 'watch',
                title: `Tariff Watch: ${countryName} exact-rate coverage is being monitored`,
                text: 'No material rate change was detected, but parser/source coverage still needs follow-up before filing-grade reliance.',
                href: 'tariff-watch.html'
            };
        }

        return {
            tone: 'stable',
            title: 'Tariff Watch: no material rate change detected',
            text: 'Latest duty-rate sync did not flag a route-specific rate change for this screen.',
            href: 'tariff-watch.html'
        };
    }

    return {
        buildTariffWatchModel,
        buildRouteTariffAlert,
        countryLabel,
        buildTariffRows,
        buildCurrentTariffRows,
        buildMarketCoverageRows,
        buildSpecialProgramRows,
        classifyTariffUse,
        getRateFreshness,
        describeRateTrust
    };
}));
