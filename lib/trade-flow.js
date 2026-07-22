'use strict';

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TraceWizeTradeFlow = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const INDUSTRIES = [
        { id: 'semiconductor_ai', label: 'Semiconductors & AI hardware', hs: ['854231', '854232', '854239', '847150'] },
        { id: 'memory', label: 'Memory components', hs: ['854232'] },
        { id: 'computing', label: 'Computers & data processing', hs: ['847130', '847141', '847149', '847150'] },
        { id: 'telecom', label: 'Telecom & connected devices', hs: ['851713', '851762'] },
        { id: 'battery_energy', label: 'Batteries & energy storage', hs: ['850760', '850440'] },
        { id: 'solar', label: 'Solar & photovoltaic', hs: ['854143'] },
        { id: 'industrial_automation', label: 'Industrial automation', hs: ['847950'] },
        { id: 'healthcare_lab', label: 'Healthcare & laboratory equipment', hs: ['901890', '902750'] },
        { id: 'gaming', label: 'Gaming & interactive electronics', hs: ['950450'] }
    ];

    const MARKET_LABELS = {
        US: 'United States', EU: 'European Union', CN: 'China', DE: 'Germany', NL: 'Netherlands',
        SG: 'Singapore', MX: 'Mexico', VN: 'Vietnam', MY: 'Malaysia', IN: 'India', JP: 'Japan',
        KR: 'South Korea', TW: 'Taiwan', RU: 'Russia'
    };

    const CHINA_PRIMARY_SOURCE_ID = 'china-customs-major-industries';
    const COMTRADE_SOURCE_ID = 'un-comtrade-monthly';

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function percentChange(current, previous) {
        const a = Number(current);
        const b = Number(previous);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
        return ((a - b) / Math.abs(b)) * 100;
    }

    function formatCurrency(value) {
        const number = toNumber(value);
        if (Math.abs(number) >= 1e9) return `$${(number / 1e9).toFixed(1)}B`;
        if (Math.abs(number) >= 1e6) return `$${(number / 1e6).toFixed(1)}M`;
        if (Math.abs(number) >= 1e3) return `$${(number / 1e3).toFixed(1)}K`;
        return `$${number.toFixed(0)}`;
    }

    function latestMonth(rows) {
        return asArray(rows).map((row) => row.month).filter(Boolean).sort().at(-1) || '';
    }

    function monthLag(month, reference = new Date()) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
        const asOf = reference instanceof Date ? reference : new Date(reference);
        if (!match || Number.isNaN(asOf.getTime())) return null;
        return Math.max(0,
            (asOf.getUTCFullYear() - Number(match[1])) * 12
            + asOf.getUTCMonth() - (Number(match[2]) - 1));
    }

    function aggregateSeries(rows = []) {
        const byMonth = new Map();
        rows.forEach((row) => {
            if (!row?.month) return;
            const current = byMonth.get(row.month) || {
                month: row.month,
                imports: 0,
                exports: 0,
                importsAvailable: false,
                exportsAvailable: false
            };
            const importsAvailable = row.imports_available !== false && Number.isFinite(Number(row.imports_value_usd));
            const exportsAvailable = row.exports_available !== false && Number.isFinite(Number(row.exports_value_usd));
            if (importsAvailable) {
                current.imports += toNumber(row.imports_value_usd);
                current.importsAvailable = true;
            }
            if (exportsAvailable) {
                current.exports += toNumber(row.exports_value_usd);
                current.exportsAvailable = true;
            }
            byMonth.set(row.month, current);
        });
        return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    }

    function buildPartnerRanking(rows = [], month = '') {
        const totals = new Map();
        rows.filter((row) => !month || row.month === month).forEach((row) => {
            const partner = row.partner || 'WORLD';
            if (partner === 'WORLD') return;
            const current = totals.get(partner) || { partner, imports: 0, exports: 0 };
            current.imports += toNumber(row.imports_value_usd);
            current.exports += toNumber(row.exports_value_usd);
            totals.set(partner, current);
        });
        return [...totals.values()]
            .sort((a, b) => (b.imports + b.exports) - (a.imports + a.exports))
            .slice(0, 5)
            .map((row) => ({ ...row, label: MARKET_LABELS[row.partner] || row.partner }));
    }

    function availablePartners(payload = {}, market = '', industry = '') {
        const selectedMarket = String(market || '').toUpperCase();
        const selectedIndustry = String(industry || '');
        return [...new Set(asArray(payload.series)
            .filter((row) => (
                row?.status === 'official'
                && (!selectedMarket || row.market === selectedMarket)
                && (!selectedIndustry || row.industry_id === selectedIndustry)
                && row.partner
                && row.partner !== 'WORLD'
            ))
            .map((row) => row.partner))]
            .sort((a, b) => (MARKET_LABELS[a] || a).localeCompare(MARKET_LABELS[b] || b))
            .map((code) => ({ value: code, label: MARKET_LABELS[code] || code }));
    }

    function sourceStatus(payload = {}, market = '', hasMarketRows = null, context = {}) {
        const sources = asArray(context.sources).length
            ? asArray(context.sources)
            : asArray(payload.sources).filter((source) => !market || asArray(source.markets).includes(market));
        const nationalState = payload?.national_connector_status?.markets?.[market];
        if (market !== 'CN' && nationalState) {
            const connectorName = nationalState.connector_name || `${MARKET_LABELS[market] || market} official connector`;
            if (nationalState.status === 'national_official_current') {
                if (hasMarketRows === false) return { tone: 'pending', label: 'Official connector active', detail: `${connectorName} is active, but this selection has no synchronized monthly rows.` };
                return { tone: 'current', label: 'Official data current', detail: `${connectorName} is synchronized through ${nationalState.latest_period || 'the latest accepted batch'}.` };
            }
            if (nationalState.status === 'official_delayed') return { tone: 'delayed', label: 'Official data delayed', detail: `${connectorName} is synchronized through ${nationalState.latest_period || 'an older reporting month'}.` };
            if (nationalState.status === 'last_good_degraded') return { tone: 'degraded', label: 'Last-good data retained', detail: nationalState.last_error || `${connectorName} rejected the latest batch and retained the prior complete snapshot.` };
            if (nationalState.status === 'official_feed_pending') return { tone: 'pending', label: 'Official release detected', detail: `${connectorName} publishes through ${nationalState.official_latest_period || 'a newer month'}, but TraceWize has no complete active batch yet.` };
            if (nationalState.status === 'api_key_pending') return { tone: 'historical', label: 'API key pending', detail: nationalState.probe_note || `${connectorName} API access is not configured; historical UN Comtrade data remains available.` };
            if (nationalState.status === 'configuration_required') return { tone: 'pending', label: 'Connector configuration required', detail: nationalState.probe_error || `${connectorName} requires an API credential.` };
            if (nationalState.status === 'un_comtrade_fallback') return { tone: 'historical', label: 'Historical fallback active', detail: `${connectorName} has no active national series; UN Comtrade history is shown separately.` };
            if (nationalState.status === 'no_official_series') return { tone: 'missing', label: 'No official series yet', detail: `${connectorName} has not published a complete synchronized batch.` };
        }
        if (!sources.length) return { tone: 'missing', label: 'No official connector', detail: 'This market is not connected yet.' };
        if (hasMarketRows === false && sources.some((source) => source.status === 'official_current')) {
            return {
                tone: 'pending',
                label: 'Official connector active',
                detail: 'The official source returned no monthly rows for this market and exact HS selection in the maintained history window.'
            };
        }
        if (sources.some((source) => source.status === 'official_current')) {
            const selectedMonth = String(context.latestMonth || '');
            const currentSource = sources.find((source) => source.status === 'official_current') || {};
            const platformMonth = String(currentSource.official_platform_latest_period || '');
            const synchronizedThrough = String(currentSource.synchronized_through || currentSource.latest_period || selectedMonth || '');
            if (platformMonth && synchronizedThrough && platformMonth > synchronizedThrough) {
                return {
                    tone: 'delayed',
                    label: 'TraceWize sync delayed',
                    detail: `China Customs data is available through ${platformMonth}; TraceWize is synchronized through ${synchronizedThrough}.`
                };
            }
            const lag = monthLag(selectedMonth, context.referenceDate || payload.updated_at || new Date());
            if (Number.isFinite(lag) && lag > 8) {
                return {
                    tone: 'historical',
                    label: 'Official historical data',
                    detail: `The latest official month for this selection is ${selectedMonth}, ${lag} months behind the current reporting month.`
                };
            }
            if (Number.isFinite(lag) && lag > 4) {
                return {
                    tone: 'delayed',
                    label: 'Source synchronization delayed',
                    detail: `The latest official month for this selection is ${selectedMonth}, ${lag} months behind the current reporting month.`
                };
            }
            return { tone: 'current', label: 'Official data current', detail: 'Latest official monthly snapshot is available.' };
        }
        if (sources.some((source) => source.status === 'degraded')) {
            return { tone: 'degraded', label: 'Official source degraded', detail: 'Showing the last successful official snapshot.' };
        }
        if (sources.some((source) => source.status === 'key_required')) {
            return { tone: 'pending', label: 'API key required', detail: 'Connector is ready; add the source key to start synchronization.' };
        }
        return { tone: 'pending', label: 'Official connector ready', detail: 'No official monthly snapshot has been synchronized yet.' };
    }

    function sourceById(payload = {}, id = '') {
        return asArray(payload.sources).find((source) => source?.id === id) || null;
    }

    function buildSourceBasis(payload = {}, market = '', industry = '', primaryRows = [], fallbackRows = [], categoryProxy = null) {
        if (market === 'CN') {
            const chinaSource = sourceById(payload, CHINA_PRIMARY_SOURCE_ID);
            const fallbackSource = sourceById(payload, COMTRADE_SOURCE_ID);
            if (primaryRows.length) {
                if (categoryProxy) {
                    const proxyLabel = INDUSTRIES.find((row) => row.id === categoryProxy.industry)?.label || categoryProxy.industry;
                    return {
                        role: 'primary_category_proxy',
                        sourceId: CHINA_PRIMARY_SOURCE_ID,
                        source: chinaSource,
                        label: 'Broader category · China Customs',
                        detail: `China Customs ${proxyLabel} industry data is used as a broader signal for ${INDUSTRIES.find((row) => row.id === industry)?.label || industry}. This is not an exact Memory series. UN Comtrade exact-HS history remains separate for validation.`
                    };
                }
                return {
                    role: 'primary',
                    sourceId: CHINA_PRIMARY_SOURCE_ID,
                    source: chinaSource,
                    label: 'Primary source · China Customs',
                    detail: chinaSource?.official_platform_latest_period && chinaSource?.synchronized_through
                        ? `China Customs online data is available through ${chinaSource.official_platform_latest_period}; the maintained TraceWize industry summary is synchronized through ${chinaSource.synchronized_through}. UN Comtrade remains separate for historical validation.`
                        : 'China Customs industry data is used for this market. UN Comtrade remains separate for historical validation.'
                };
            }
            if (fallbackRows.length) {
                return {
                    role: 'historical_fallback',
                    sourceId: COMTRADE_SOURCE_ID,
                    source: fallbackSource,
                    label: 'Historical fallback · UN Comtrade',
                    detail: `No maintained China Customs industry series is connected for ${INDUSTRIES.find((row) => row.id === industry)?.label || industry}; the UN series is not presented as current China-source data.`
                };
            }
            return {
                role: 'missing',
                sourceId: CHINA_PRIMARY_SOURCE_ID,
                source: chinaSource,
                label: 'China Customs source gap',
                detail: 'No maintained China Customs industry series or UN historical fallback is available for this selection.'
            };
        }
        const sourceId = primaryRows[0]?.source_id || '';
        const source = sourceById(payload, sourceId);
        return {
            role: 'official_source',
            sourceId,
            source,
            label: source?.name ? `Official source · ${source.name}` : 'Official maintained source',
            detail: 'The selected market series is kept separate from other source families.'
        };
    }

    function buildCoverageState(series = []) {
        const current = series.at(-1) || {};
        const missingDirections = [];
        if (!current.importsAvailable) missingDirections.push('imports');
        if (!current.exportsAvailable) missingDirections.push('exports');
        const completeMonth = [...series].reverse().find((row) => row.importsAvailable && row.exportsAvailable)?.month || '';
        return {
            status: missingDirections.length ? 'partial' : 'complete',
            missingDirections,
            completeMonth,
            label: missingDirections.length
                ? `Latest month missing ${missingDirections.join(' and ')}`
                : 'Latest month includes both trade directions',
            detail: missingDirections.length
                ? (completeMonth ? `Last complete two-way month: ${completeMonth}.` : 'No complete two-way month exists in the maintained series.')
                : `Imports and exports are both published for ${current.month || 'the latest month'}.`
        };
    }

    function buildTradeFlowModel(payload = {}, filters = {}) {
        const market = String(filters.market || '').toUpperCase();
        const industry = String(filters.industry || '');
        const partner = String(filters.partner || '').toUpperCase();
        const selectedRows = asArray(payload.series).filter((row) => (
            (!market || row.market === market)
            && (!industry || row.industry_id === industry)
            && row.status === 'official'
        ));
        const exactChinaPrimaryRows = market === 'CN'
            ? selectedRows.filter((row) => row.source_id === CHINA_PRIMARY_SOURCE_ID)
            : [];
        const chinaSource = sourceById(payload, CHINA_PRIMARY_SOURCE_ID);
        const proxyIndustry = market === 'CN' && !exactChinaPrimaryRows.length
            ? String(chinaSource?.category_proxies?.[industry] || '')
            : '';
        const chinaProxyRows = proxyIndustry
            ? asArray(payload.series).filter((row) => (
                row.market === 'CN'
                && row.industry_id === proxyIndustry
                && row.source_id === CHINA_PRIMARY_SOURCE_ID
                && row.status === 'official'
            ))
            : [];
        const chinaPrimaryRows = exactChinaPrimaryRows.length ? exactChinaPrimaryRows : chinaProxyRows;
        const categoryProxy = chinaProxyRows.length ? { industry: proxyIndustry } : null;
        const comtradeRows = selectedRows.filter((row) => row.source_id === COMTRADE_SOURCE_ID);
        const industrySummaryRows = selectedRows.filter((row) => row.aggregation_level === 'industry');
        const marketIndustryRows = market === 'CN'
            ? (chinaPrimaryRows.length ? chinaPrimaryRows : (comtradeRows.length ? comtradeRows : selectedRows))
            : (industrySummaryRows.length ? industrySummaryRows : selectedRows);
        const allPartners = !partner || partner === 'WORLD';
        const hasWorldAggregate = marketIndustryRows.some((row) => row.partner === 'WORLD');
        const rows = allPartners
            ? marketIndustryRows.filter((row) => hasWorldAggregate ? row.partner === 'WORLD' : row.partner !== 'WORLD')
            : marketIndustryRows.filter((row) => row.partner === partner);
        const fullSeries = aggregateSeries(rows);
        const series = fullSeries.slice(-13);
        const current = series.at(-1) || {
            month: '', imports: 0, exports: 0, importsAvailable: false, exportsAvailable: false
        };
        const previous = series.at(-2) || null;
        const yearAgo = series.length >= 13 ? series[series.length - 13] : null;
        const hasBothFlows = current.importsAvailable && current.exportsAvailable;
        const tradeTotal = hasBothFlows ? current.imports + current.exports : null;
        const importShare = tradeTotal ? (current.imports / tradeTotal) * 100 : null;
        const industryRow = INDUSTRIES.find((row) => row.id === industry);
        const sourceBasis = buildSourceBasis(payload, market, industry, chinaPrimaryRows, comtradeRows, categoryProxy);
        const selectedSources = sourceBasis.source ? [sourceBasis.source] : [];
        const coverage = buildCoverageState(fullSeries);
        const crossCheck = market === 'CN' && chinaPrimaryRows.length && comtradeRows.length
            ? {
                status: 'separate',
                label: 'UN cross-check kept separate',
                detail: 'UN Comtrade exact-HS history is retained for validation, but it is not merged into the China Customs industry summary.'
            }
            : (market === 'CN' && sourceBasis.role === 'historical_fallback'
                ? {
                    status: 'primary_missing',
                    label: 'China primary series missing',
                    detail: 'This selection uses UN Comtrade only as a historical fallback until a matching China Customs category series is connected.'
                }
                : null);
        return {
            hasData: rows.length > 0,
            market,
            marketLabel: MARKET_LABELS[market] || market || 'Select a market',
            industry,
            industryLabel: industryRow?.label || 'Select an industry',
            hsScope: industryRow?.hs || [],
            partner,
            latestMonth: current.month,
            imports: current.imports,
            exports: current.exports,
            importsAvailable: current.importsAvailable,
            exportsAvailable: current.exportsAvailable,
            balance: hasBothFlows ? current.exports - current.imports : null,
            tradeTotal,
            importShare,
            importMoM: previous?.importsAvailable && current.importsAvailable ? percentChange(current.imports, previous.imports) : null,
            exportMoM: previous?.exportsAvailable && current.exportsAvailable ? percentChange(current.exports, previous.exports) : null,
            importYoY: yearAgo?.importsAvailable && current.importsAvailable ? percentChange(current.imports, yearAgo.imports) : null,
            exportYoY: yearAgo?.exportsAvailable && current.exportsAvailable ? percentChange(current.exports, yearAgo.exports) : null,
            series,
            partners: buildPartnerRanking(marketIndustryRows, current.month),
            source: sourceStatus(payload, market, marketIndustryRows.length > 0, {
                latestMonth: current.month,
                referenceDate: filters.referenceDate,
                sources: selectedSources
            }),
            sourceBasis,
            coverage,
            crossCheck,
            aggregationLevel: marketIndustryRows.some((row) => row.aggregation_level === 'industry') ? 'industry' : 'maintained_category',
            scopeLabel: categoryProxy
                ? `${marketIndustryRows.find((row) => row.scope_label)?.scope_label || sourceBasis.source?.category_proxy_note || 'Semiconductor industry summary'} (broader than ${industryRow?.label || industry})`
                : (marketIndustryRows.find((row) => row.scope_label)?.scope_label || industryRow?.label || ''),
            updatedAt: payload.updated_at || '',
            formatCurrency
        };
    }

    return {
        INDUSTRIES,
        MARKET_LABELS,
        aggregateSeries,
        availablePartners,
        buildTradeFlowModel,
        formatCurrency,
        monthLag,
        percentChange,
        sourceStatus
    };
}));
