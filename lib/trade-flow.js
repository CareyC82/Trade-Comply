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

    function aggregateSeries(rows = []) {
        const byMonth = new Map();
        rows.forEach((row) => {
            if (!row?.month) return;
            const current = byMonth.get(row.month) || { month: row.month, imports: 0, exports: 0 };
            current.imports += toNumber(row.imports_value_usd);
            current.exports += toNumber(row.exports_value_usd);
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

    function sourceStatus(payload = {}, market = '', hasMarketRows = null) {
        const sources = asArray(payload.sources).filter((source) => !market || asArray(source.markets).includes(market));
        if (!sources.length) return { tone: 'missing', label: 'No official connector', detail: 'This market is not connected yet.' };
        if (hasMarketRows === false && sources.some((source) => source.status === 'official_current')) {
            return {
                tone: 'pending',
                label: 'Official connector active',
                detail: 'The official source returned no monthly rows for this market and exact HS selection in the maintained history window.'
            };
        }
        if (sources.some((source) => source.status === 'official_current')) {
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

    function buildTradeFlowModel(payload = {}, filters = {}) {
        const market = String(filters.market || '').toUpperCase();
        const industry = String(filters.industry || '');
        const partner = String(filters.partner || '').toUpperCase();
        const marketIndustryRows = asArray(payload.series).filter((row) => (
            (!market || row.market === market)
            && (!industry || row.industry_id === industry)
            && row.status === 'official'
        ));
        const allPartners = !partner || partner === 'WORLD';
        const hasWorldAggregate = marketIndustryRows.some((row) => row.partner === 'WORLD');
        const rows = allPartners
            ? marketIndustryRows.filter((row) => hasWorldAggregate ? row.partner === 'WORLD' : row.partner !== 'WORLD')
            : marketIndustryRows.filter((row) => row.partner === partner);
        const series = aggregateSeries(rows).slice(-13);
        const current = series.at(-1) || { month: '', imports: 0, exports: 0 };
        const previous = series.at(-2) || null;
        const yearAgo = series.length >= 13 ? series[series.length - 13] : null;
        const tradeTotal = current.imports + current.exports;
        const importShare = tradeTotal ? (current.imports / tradeTotal) * 100 : null;
        const industryRow = INDUSTRIES.find((row) => row.id === industry);
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
            balance: current.exports - current.imports,
            tradeTotal,
            importShare,
            importMoM: previous ? percentChange(current.imports, previous.imports) : null,
            exportMoM: previous ? percentChange(current.exports, previous.exports) : null,
            importYoY: yearAgo ? percentChange(current.imports, yearAgo.imports) : null,
            exportYoY: yearAgo ? percentChange(current.exports, yearAgo.exports) : null,
            series,
            partners: buildPartnerRanking(marketIndustryRows, current.month),
            source: sourceStatus(payload, market, marketIndustryRows.length > 0),
            updatedAt: payload.updated_at || '',
            formatCurrency
        };
    }

    return {
        INDUSTRIES,
        MARKET_LABELS,
        aggregateSeries,
        buildTradeFlowModel,
        formatCurrency,
        percentChange,
        sourceStatus
    };
}));
