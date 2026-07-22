'use strict';

(function (global) {
    const API = global.TraceWizeTradeFlow;
    let payload = null;
    let chinaConnectorStatus = null;
    let nationalConnectorStatus = null;

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
        const values = series.flatMap((row) => [
            row.importsAvailable ? row.imports : null,
            row.exportsAvailable ? row.exports : null
        ]).filter(Number.isFinite);
        const max = Math.max(1, ...values);
        return `
            <div class="trade-flow-chart" role="img" aria-label="Monthly import and export trade value trend">
                ${series.map((row) => `
                    <div class="trade-flow-chart__month">
                        <div class="trade-flow-chart__bars">
                            ${row.importsAvailable ? `<span class="trade-flow-chart__bar trade-flow-chart__bar--import" style="height:${Math.max(3, (row.imports / max) * 100)}%" title="Imports ${escapeHtml(API.formatCurrency(row.imports))}"></span>` : '<span class="trade-flow-chart__bar trade-flow-chart__bar--missing" title="Imports not published in this source"></span>'}
                            ${row.exportsAvailable ? `<span class="trade-flow-chart__bar trade-flow-chart__bar--export" style="height:${Math.max(3, (row.exports / max) * 100)}%" title="Exports ${escapeHtml(API.formatCurrency(row.exports))}"></span>` : '<span class="trade-flow-chart__bar trade-flow-chart__bar--missing" title="Exports not published in this source"></span>'}
                        </div>
                        <small>${escapeHtml(row.month.slice(5))}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderConnectorPanel(model) {
        if (model.market === 'CN' && chinaConnectorStatus) {
            return `
                <section class="trade-flow-connector trade-flow-connector--${escapeHtml(chinaConnectorStatus.connector_status || 'unknown')}">
                    <div>
                        <span>China Customs connector</span>
                        <strong>${escapeHtml(chinaConnectorStatus.ok ? 'Last sync completed' : 'Last-good data retained')}</strong>
                        <small>${escapeHtml(chinaConnectorStatus.reason || 'Connector status is available for review.')}</small>
                    </div>
                    <dl>
                        <div><dt>Official platform</dt><dd>${escapeHtml(chinaConnectorStatus.official_platform_latest_period || 'Not declared')}</dd></div>
                        <div><dt>TraceWize synchronized</dt><dd>${escapeHtml(chinaConnectorStatus.synchronized_through || 'Not synchronized')}</dd></div>
                        <div><dt>Industry coverage</dt><dd>${escapeHtml((chinaConnectorStatus.covered_industries || []).length)}/${escapeHtml((chinaConnectorStatus.supported_industries || []).length)}</dd></div>
                    </dl>
                </section>
            `;
        }
        const state = nationalConnectorStatus?.markets?.[model.market];
        if (!state) return '';
        const labels = {
            national_official_current: ['Last sync completed', 'Official national monthly rows are active.'],
            official_delayed: ['Official data delayed', 'The latest synchronized official month is older than the normal reporting window.'],
            last_good_degraded: ['Last-good data retained', state.last_error || 'The latest official batch was rejected, so the prior complete snapshot remains active.'],
            official_feed_pending: ['Official release detected', 'The official source has a newer release, but no complete TraceWize batch is active yet.'],
            configuration_required: ['Connector configuration required', state.probe_error || 'An official API credential is required before this connector can run.'],
            un_comtrade_fallback: ['Historical fallback active', 'No national official series is active; UN Comtrade history is shown separately.'],
            no_official_series: ['Official series not connected', 'No national official monthly snapshot has been synchronized yet.']
        };
        const [title, detail] = labels[state.status] || ['Connector status available', 'Review the latest national connector result.'];
        return `
            <section class="trade-flow-connector trade-flow-connector--${escapeHtml(state.status || 'unknown')}">
                <div>
                    <span>${escapeHtml(state.connector_name || `${model.marketLabel} official connector`)}</span>
                    <strong>${escapeHtml(title)}</strong>
                    <small>${escapeHtml(detail)}</small>
                </div>
                <dl>
                    <div><dt>Official published</dt><dd>${escapeHtml(state.official_latest_period || 'Not detected')}</dd></div>
                    <div><dt>TraceWize synchronized</dt><dd>${escapeHtml(state.synchronized_through || 'Not synchronized')}</dd></div>
                    <div><dt>Active tier</dt><dd>${escapeHtml((state.active_data_tier || 'none').replaceAll('_', ' '))}</dd></div>
                </dl>
            </section>
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
                    <small>${escapeHtml(model.marketLabel)} · ${escapeHtml(model.industryLabel)} · industry-level monthly signal</small>
                </section>
            `;
            return;
        }
        const connectorPanel = renderConnectorPanel(model);
        root.innerHTML = `
            ${connectorPanel}
            <section class="trade-flow-summary">
                <div>
                    <span class="trade-flow-kicker">Latest official month · ${escapeHtml(model.latestMonth)}</span>
                    <h2>${escapeHtml(model.industryLabel)} in ${escapeHtml(model.marketLabel)}</h2>
                    <p>${model.aggregationLevel === 'industry'
                        ? `Official industry summary: ${escapeHtml(model.scopeLabel)}. This is not an exact-HS series.`
                        : 'Official maintained category signal. Trade value is the primary comparable measure.'}</p>
                </div>
                <div class="trade-flow-source-state">
                    <strong class="trade-flow-basis">${escapeHtml(model.sourceBasis.label)}</strong>
                    <span class="trade-flow-source trade-flow-source--${escapeHtml(model.source.tone)}">${escapeHtml(model.source.label)}</span>
                    <small>${escapeHtml(model.source.detail)}</small>
                </div>
            </section>
            <section class="trade-flow-evidence">
                <article class="trade-flow-evidence__item trade-flow-evidence__item--${escapeHtml(model.coverage.status)}">
                    <span>Publication coverage</span>
                    <strong>${escapeHtml(model.coverage.label)}</strong>
                    <small>${escapeHtml(model.coverage.detail)}</small>
                </article>
                <article class="trade-flow-evidence__item trade-flow-evidence__item--${escapeHtml(model.sourceBasis.role)}">
                    <span>Source policy</span>
                    <strong>${escapeHtml(model.sourceBasis.label)}</strong>
                    <small>${escapeHtml(model.sourceBasis.detail)}</small>
                </article>
                ${model.crossCheck ? `
                    <article class="trade-flow-evidence__item trade-flow-evidence__item--${escapeHtml(model.crossCheck.status)}">
                        <span>Cross-validation</span>
                        <strong>${escapeHtml(model.crossCheck.label)}</strong>
                        <small>${escapeHtml(model.crossCheck.detail)}</small>
                    </article>
                ` : ''}
            </section>
            <section class="trade-flow-metrics">
                <article><span>Monthly imports</span><strong>${model.importsAvailable ? escapeHtml(API.formatCurrency(model.imports)) : 'Not published'}</strong><small>${model.importsAvailable ? `MoM ${escapeHtml(formatChange(model.importMoM))} · YoY ${escapeHtml(formatChange(model.importYoY))}` : 'Not available in this industry bulletin'}</small></article>
                <article><span>Monthly exports</span><strong>${model.exportsAvailable ? escapeHtml(API.formatCurrency(model.exports)) : 'Not published'}</strong><small>${model.exportsAvailable ? `MoM ${escapeHtml(formatChange(model.exportMoM))} · YoY ${escapeHtml(formatChange(model.exportYoY))}` : 'Not available in this industry bulletin'}</small></article>
                <article><span>Trade balance</span><strong>${Number.isFinite(model.balance) ? escapeHtml(API.formatCurrency(model.balance)) : 'Not comparable'}</strong><small>${Number.isFinite(model.importShare) ? `${model.importShare.toFixed(1)}% import share` : 'Both directions are required'}</small></article>
            </section>
            <section class="trade-flow-panel">
                <div class="trade-flow-panel__head"><h2>13-month value trend</h2><div><span class="trade-flow-legend trade-flow-legend--import">Imports</span><span class="trade-flow-legend trade-flow-legend--export">Exports</span></div></div>
                ${renderChart(model.series)}
            </section>
            ${model.partners.length ? `
                <section class="trade-flow-panel">
                    <h2>Top partner signals</h2>
                    <div class="trade-flow-partners">${model.partners.map((row) => `<article><strong>${escapeHtml(row.label)}</strong><span>Imports ${escapeHtml(API.formatCurrency(row.imports))}</span><span>Exports ${escapeHtml(API.formatCurrency(row.exports))}</span></article>`).join('')}</div>
                </section>
            ` : ''}
        `;
    }

    function fillSelect(select, rows, placeholder) {
        if (!select) return;
        select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${rows.map((row) => `<option value="${escapeHtml(row.value || row.id)}">${escapeHtml(row.label)}</option>`).join('')}`;
    }

    function refreshPartnerOptions(market, industry, partner) {
        if (!partner || !payload) return;
        const selected = partner.value;
        const rows = API.availablePartners(payload, market.value, industry.value);
        const partnerCodes = rows.map((row) => row.value);
        const field = document.getElementById('trade-flow-partner-field');
        const form = document.getElementById('trade-flow-form');
        fillSelect(partner, rows, 'All partners');
        if (partnerCodes.includes(selected)) partner.value = selected;
        const hasPartnerRows = rows.length > 0;
        partner.disabled = !hasPartnerRows;
        if (field) field.hidden = !hasPartnerRows;
        form?.classList.toggle('trade-flow-form--aggregate', !hasPartnerRows);
    }

    async function bootstrapTradeFlowPage() {
        const market = document.getElementById('trade-flow-market');
        const industry = document.getElementById('trade-flow-industry');
        const partner = document.getElementById('trade-flow-partner');
        const form = document.getElementById('trade-flow-form');
        try {
            const version = global.TradeComplyBuild || Date.now();
            const [baseResponse, industryResponse, connectorResponse, nationalConnectorResponse] = await Promise.all([
                fetch(`data/trade-flow.json?v=${version}`, { cache: 'no-store' }),
                fetch(`data/china-industry-flow.json?v=${version}`, { cache: 'no-store' }),
                fetch(`data/china-customs-sync-status.json?v=${version}`, { cache: 'no-store' }),
                fetch(`data/national-trade-flow-sync-status.json?v=${version}`, { cache: 'no-store' })
            ]);
            if (!baseResponse.ok) throw new Error(`HTTP ${baseResponse.status}`);
            const basePayload = await baseResponse.json();
            const industryPayload = industryResponse.ok ? await industryResponse.json() : { sources: [], series: [] };
            chinaConnectorStatus = connectorResponse.ok ? await connectorResponse.json() : null;
            nationalConnectorStatus = nationalConnectorResponse.ok ? await nationalConnectorResponse.json() : null;
            payload = {
                ...basePayload,
                sources: [...(basePayload.sources || []), ...(industryPayload.sources || [])],
                series: [...(basePayload.series || []), ...(industryPayload.series || [])],
                national_connector_status: nationalConnectorStatus
            };
        } catch (error) {
            payload = { sources: [], series: [] };
            chinaConnectorStatus = null;
            nationalConnectorStatus = null;
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
