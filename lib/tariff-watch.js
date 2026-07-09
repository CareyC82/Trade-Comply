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
        if (confidence.includes('official') && sourceStatus.includes('official')) return 3;
        if (confidence.includes('official') || sourceStatus.includes('official')) return 2;
        if (confidence.includes('indicative') || sourceStatus.includes('checked')) return 1;
        return 0;
    }

    function buildTariffRow(rule = {}, dutyRates = {}, override = null) {
        const baseRate = toNumber(override?.base_rate ?? rule.base_rate);
        const addOnRate = toNumber(rule.additional_rate);
        const totalRate = baseRate + addOnRate;
        const hsScope = override?.hs_code || compactList(rule.hs_prefixes, 4) || rule.source_hts || 'HS required';
        return {
            id: override ? `${rule.id}-${override.hs_code}` : rule.id,
            importCountry: rule.import_country,
            marketKey: rule.import_country || 'unknown',
            importMarket: countryLabel(rule.import_country),
            originScope: rule.origin_country === '*' ? 'all origins' : countryLabel(rule.origin_country),
            hsScope,
            label: rule.label || 'Maintained tariff signal',
            baseRate: formatPercent(baseRate),
            addOnRate: formatPercent(addOnRate),
            totalRate: formatPercent(totalRate),
            totalRateValue: totalRate,
            confidence: override?.confidence || rule.confidence || rule.source_status || 'Pre-check estimate',
            sourceStatus: override?.source_status || rule.source_status || 'maintained',
            sourceText: override?.source_rate_text || override?.source_note || rule.source_rate_text || rule.source_note || '',
            lastChecked: formatDate(override?.last_checked_at || rule.last_checked_at || dutyRates.updated_at),
            rank: rateConfidenceRank(override || rule)
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
                hsPrefixes: new Set(),
                maxTotalRate: 0,
                lastChecked: ''
            };
            current.rules += 1;
            if (rule.rank >= 2) current.official += 1;
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
                lastChecked: formatDate(row.lastChecked)
            }));
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
            impactedRoutes,
            currentTariffRows: buildCurrentTariffRows(dutyRates, 12),
            marketTariffRows: buildTariffRows(dutyRates),
            marketCoverageRows: buildMarketCoverageRows(dutyRates),
            watchItems,
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
        buildMarketCoverageRows
    };
}));
