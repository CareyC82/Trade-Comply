'use strict';

(function (global) {
    const API = global.TraceWizeTradeFlow;
    let payload = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatChange(value) {
        if (!Number.isFinite(value)) return 'Not enough history';
        const sign = value > 0 ? '+' : '';
        return `${sign}${value.toFixed(1)}%`;
    }

    function renderChart(series) {
        const max = Math.max(1, ...series.flatMap((row) => [row.imports, row.exports]));
        return `
            <div class="trade-flow-chart" role="img" aria-label="Monthly import and export trade value trend">
                ${series.map((row) => `
                    <div class="trade-flow-chart__month">
                        <div class="trade-flow-chart__bars">
                            <span class="trade-flow-chart__bar trade-flow-chart__bar--import" style="height:${Math.max(3, (row.imports / max) * 100)}%" title="Imports ${escapeHtml(API.formatCurrency(row.imports))}"></span>
                            <span class="trade-flow-chart__bar trade-flow-chart__bar--export" style="height:${Math.max(3, (row.exports / max) * 100)}%" title="Exports ${escapeHtml(API.formatCurrency(row.exports))}"></span>
                        </div>
                        <small>${escapeHtml(row.month.slice(5))}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderModel(model) {
        const root = document.getElementById('trade-flow-result');
        if (!root) return;
        if (!model.market || !model.industry) {
            root.innerHTML = '<section class="trade-flow-empty">Select a market and industry to view official monthly trade signals.</section>';
            return;
        }
        if (!model.hasData) {
            root.innerHTML = `
                <section class="trade-flow-empty trade-flow-empty--status">
                    <span class="trade-flow-source trade-flow-source--${escapeHtml(model.source.tone)}">${escapeHtml(model.source.label)}</span>
                    <h2>No synchronized monthly series yet</h2>
                    <p>${escapeHtml(model.source.detail)}</p>
                    <small>${escapeHtml(model.marketLabel)} · ${escapeHtml(model.industryLabel)} · HS ${escapeHtml(model.hsScope.join(', '))}</small>
                </section>
            `;
            return;
        }
        root.innerHTML = `
            <section class="trade-flow-summary">
                <div>
                    <span class="trade-flow-kicker">Latest official month · ${escapeHtml(model.latestMonth)}</span>
                    <h2>${escapeHtml(model.industryLabel)} in ${escapeHtml(model.marketLabel)}</h2>
                    <p>Trade value is the primary comparable signal. Quantity is excluded when official units differ across HS lines.</p>
                </div>
                <span class="trade-flow-source trade-flow-source--${escapeHtml(model.source.tone)}">${escapeHtml(model.source.label)}</span>
            </section>
            <section class="trade-flow-metrics">
                <article><span>Monthly imports</span><strong>${escapeHtml(API.formatCurrency(model.imports))}</strong><small>MoM ${escapeHtml(formatChange(model.importMoM))} · YoY ${escapeHtml(formatChange(model.importYoY))}</small></article>
                <article><span>Monthly exports</span><strong>${escapeHtml(API.formatCurrency(model.exports))}</strong><small>MoM ${escapeHtml(formatChange(model.exportMoM))} · YoY ${escapeHtml(formatChange(model.exportYoY))}</small></article>
                <article><span>Trade balance</span><strong>${escapeHtml(API.formatCurrency(model.balance))}</strong><small>${Number.isFinite(model.importShare) ? `${model.importShare.toFixed(1)}% import share` : 'Share unavailable'}</small></article>
            </section>
            <section class="trade-flow-panel">
                <div class="trade-flow-panel__head"><h2>13-month value trend</h2><div><span class="trade-flow-legend trade-flow-legend--import">Imports</span><span class="trade-flow-legend trade-flow-legend--export">Exports</span></div></div>
                ${renderChart(model.series)}
            </section>
            <section class="trade-flow-panel">
                <h2>Top partner signals</h2>
                ${model.partners.length ? `<div class="trade-flow-partners">${model.partners.map((row) => `<article><strong>${escapeHtml(row.label)}</strong><span>Imports ${escapeHtml(API.formatCurrency(row.imports))}</span><span>Exports ${escapeHtml(API.formatCurrency(row.exports))}</span></article>`).join('')}</div>` : '<p class="trade-flow-note">Partner-level rows have not been synchronized for this selection.</p>'}
            </section>
        `;
    }

    function fillSelect(select, rows, placeholder) {
        if (!select) return;
        select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${rows.map((row) => `<option value="${escapeHtml(row.value || row.id)}">${escapeHtml(row.label)}</option>`).join('')}`;
    }

    function refreshPartnerOptions(market, industry, partner) {
        if (!partner || !payload) return;
        const selected = partner.value;
        const partnerCodes = [...new Set((payload.series || [])
            .filter((row) => row.status === 'official' && row.market === market.value && row.industry_id === industry.value && row.partner && row.partner !== 'WORLD')
            .map((row) => row.partner))];
        const rows = partnerCodes.map((code) => ({ value: code, label: API.MARKET_LABELS[code] || code }));
        fillSelect(partner, rows, 'All partners');
        if (partnerCodes.includes(selected)) partner.value = selected;
    }

    async function bootstrapTradeFlowPage() {
        const market = document.getElementById('trade-flow-market');
        const industry = document.getElementById('trade-flow-industry');
        const partner = document.getElementById('trade-flow-partner');
        const form = document.getElementById('trade-flow-form');
        try {
            const response = await fetch(`data/trade-flow.json?v=${global.TradeComplyBuild || Date.now()}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            payload = await response.json();
        } catch (error) {
            payload = { sources: [], series: [] };
        }
        const routeOptions = global.TradeComplyCountryRegistry?.getRouteOptions?.() || [];
        fillSelect(market, routeOptions.filter((row) => row.value !== 'GLOBAL' && row.value !== 'ASEAN'), 'Select market');
        fillSelect(industry, API.INDUSTRIES, 'Select industry');
        refreshPartnerOptions(market, industry, partner);
        renderModel(API.buildTradeFlowModel(payload));
        market?.addEventListener('change', () => refreshPartnerOptions(market, industry, partner));
        industry?.addEventListener('change', () => refreshPartnerOptions(market, industry, partner));
        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            renderModel(API.buildTradeFlowModel(payload, { market: market.value, industry: industry.value, partner: partner.value }));
        });
    }

    global.bootstrapTradeFlowPage = bootstrapTradeFlowPage;
}(globalThis));
