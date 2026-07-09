/**
 * Tariff Watch page and compact result-page alerts.
 */
'use strict';

(function (global) {
    let syncStatusCache = null;
    let dutyRatesCache = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadTariffWatchStatus() {
        if (syncStatusCache) {
            return syncStatusCache;
        }
        try {
            const response = await fetch(`data/duty-rate-sync-status.json?v=${global.TradeComplyBuild || Date.now()}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            syncStatusCache = await response.json();
        } catch (error) {
            syncStatusCache = {
                status: 'unavailable',
                counts: {},
                ci_diagnostics: {
                    summary: 'Duty-rate sync status is unavailable in this browser session.'
                }
            };
        }
        return syncStatusCache;
    }

    async function loadDutyRates() {
        if (dutyRatesCache) {
            return dutyRatesCache;
        }
        try {
            const response = await fetch(`data/duty-rates.json?v=${global.TradeComplyBuild || Date.now()}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            dutyRatesCache = await response.json();
        } catch (error) {
            dutyRatesCache = {
                status: 'unavailable',
                rules: []
            };
        }
        return dutyRatesCache;
    }

    function formatDate(value) {
        if (!value) return 'Not synced yet';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Not synced yet';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function renderCurrentTariffRow(row) {
        return `
            <article class="tariff-current-row">
                <div>
                    <span>Import market</span>
                    <strong>${escapeHtml(row.importMarket)}</strong>
                    <small>Origin: ${escapeHtml(row.originScope)}</small>
                </div>
                <div>
                    <span>Product / HS</span>
                    <strong>${escapeHtml(row.hsScope)}</strong>
                    <small>${escapeHtml(row.label)}</small>
                </div>
                <div>
                    <span>Base duty</span>
                    <strong>${escapeHtml(row.baseRate)}</strong>
                </div>
                <div>
                    <span>Add-on / tax</span>
                    <strong>${escapeHtml(row.addOnRate)}</strong>
                </div>
                <div>
                    <span>Total signal</span>
                    <strong>${escapeHtml(row.totalRate)}</strong>
                </div>
                <div>
                    <span>Source</span>
                    <strong>${escapeHtml(row.confidence)}</strong>
                    <small>${escapeHtml(row.lastChecked)}</small>
                </div>
            </article>
        `;
    }

    function renderMarketCoverageRow(row) {
        return `
            <a class="tariff-market-card" href="tariff-watch.html?market=${encodeURIComponent(row.marketKey)}" data-market="${escapeHtml(row.marketKey)}">
                <strong>${escapeHtml(row.country)}</strong>
                <p>${escapeHtml(row.coverageLabel || `${row.rules} maintained rule(s)`)}</p>
                <div>
                    <span>HS lines</span>
                    <b>${escapeHtml(row.hsCoverage)}</b>
                </div>
                <div>
                    <span>Highest signal</span>
                    <b>${escapeHtml(row.highestSignal)}</b>
                </div>
                <div>
                    <span>Use for</span>
                    <b>${escapeHtml(row.official === row.rules ? 'Quote screen' : 'Pre-check')}</b>
                </div>
                <small>${escapeHtml(row.nextAction || 'Confirm exact HS before filing.')}</small>
                <small>Last checked ${escapeHtml(row.lastChecked)}</small>
            </a>
        `;
    }

    function renderMarketDetailPage(model, marketKey) {
        const market = model.marketCoverageRows.find((row) => row.marketKey === marketKey) || model.marketCoverageRows[0];
        const rows = model.marketTariffRows.filter((row) => row.marketKey === market?.marketKey);
        return `
            <section class="tariff-watch-section tariff-market-detail-page">
                <a class="tariff-watch-back-link" href="tariff-watch.html">← Back to market coverage</a>
                <div class="tariff-watch-section-heading">
                    <h2>${escapeHtml(market?.country || 'Selected market')} tariff details</h2>
                    <p>${escapeHtml(rows.length)} maintained import duty / tax signal(s) for this market.</p>
                </div>
                <div class="tariff-market-brief" aria-label="How to use this tariff market">
                    <div>
                        <span>Coverage quality</span>
                        <strong>${escapeHtml(market?.coverageLabel || 'Maintained coverage')}</strong>
                    </div>
                    <div>
                        <span>Use this for</span>
                        <strong>${escapeHtml(market?.useCase || 'Market-level tariff pre-check before quote or filing.')}</strong>
                    </div>
                    <div>
                        <span>Before filing</span>
                        <strong>${escapeHtml(market?.nextAction || 'Confirm exact HS, origin, entry date, and add-on tax layers.')}</strong>
                    </div>
                </div>
                <div class="tariff-current-table">
                    ${rows.length
                        ? rows.map(renderCurrentTariffRow).join('')
                        : '<p class="tariff-watch-empty">No maintained tariff rows are available for this market yet.</p>'}
                </div>
            </section>
        `;
    }

    function renderTariffWatch(model) {
        const mount = document.getElementById('tariff-watch-root');
        if (!mount) return;
        const selectedMarket = new URLSearchParams(global.location?.search || '').get('market');
        const introHtml = selectedMarket ? '' : `
            <section class="tariff-watch-hero tariff-watch-hero--${escapeHtml(model.rateChanges > 0 ? 'changed' : 'stable')}">
                <span class="tariff-watch-kicker">Tariff & Duty Change Monitor</span>
                <h2>${escapeHtml(model.headline)}</h2>
                <p>${escapeHtml(model.subhead)}</p>
                <small>Last sync: ${escapeHtml(formatDate(model.updatedAt))}</small>
            </section>

            <section class="tariff-watch-metrics" aria-label="Tariff watch summary">
                ${model.metrics.map((metric) => `
                    <article class="tariff-watch-metric-card">
                        <span>${escapeHtml(metric.label)}</span>
                        <strong>${escapeHtml(metric.value)}</strong>
                        <p>${escapeHtml(metric.detail)}</p>
                    </article>
                `).join('')}
            </section>
        `;
        const bodyHtml = selectedMarket ? renderMarketDetailPage(model, selectedMarket) : `
            <section class="tariff-watch-section">
                <div class="tariff-watch-section-heading">
                    <h2>Coverage by market</h2>
                    <p>Select a market to open its maintained tariff signals on a detail page.</p>
                </div>
                <div class="tariff-watch-guide" aria-label="How to read tariff coverage">
                    <article>
                        <strong>Exact HS lines</strong>
                        <span>Best for quote screening and Post-Entry pre-check when the product matches the maintained HS line.</span>
                    </article>
                    <article>
                        <strong>Official maintained</strong>
                        <span>Good market signal, but still confirm exact HS, origin, and entry date before filing.</span>
                    </article>
                    <article>
                        <strong>Pre-check coverage</strong>
                        <span>Use only as a directional signal until the official tariff line is verified.</span>
                    </article>
                </div>
                <div class="tariff-market-grid">
                    ${model.marketCoverageRows.map(renderMarketCoverageRow).join('')}
                </div>
            </section>
        `;
        const adminHtml = selectedMarket ? '' : `
            <section class="tariff-watch-section tariff-watch-section--admin">
                <div class="tariff-watch-section-heading">
                    <h2>Automation status</h2>
                    <p>Use this to separate real duty-rate changes from parser/source maintenance.</p>
                </div>
                <div class="tariff-watch-admin-grid">
                    <div><span>Sources checked</span><strong>${escapeHtml(model.sourcesChecked)}</strong></div>
                    <div><span>Source/parser updates</span><strong>${escapeHtml(model.sourceUpdates)}</strong></div>
                    <div><span>Degraded sources</span><strong>${escapeHtml(model.degradedSources.join(', ') || 'None')}</strong></div>
                    <div><span>Parser backlog</span><strong>${escapeHtml(model.parserGapCountries.slice(0, 8).join(', ') || 'None')}</strong></div>
                </div>
            </section>
        `;

        mount.innerHTML = `
            ${introHtml}
            ${bodyHtml}
            ${adminHtml}
        `;
    }

    async function bootstrapTariffWatchPage() {
        const api = global.TraceWizeTariffWatch;
        if (!api) return;
        const [status, dutyRates] = await Promise.all([
            loadTariffWatchStatus(),
            loadDutyRates()
        ]);
        renderTariffWatch(api.buildTariffWatchModel({ syncStatus: status, dutyRates, limit: 8 }));
    }

    async function mountTariffWatchAlert(container, routeContext = {}) {
        const api = global.TraceWizeTariffWatch;
        if (!container || !api) return;
        const status = await loadTariffWatchStatus();
        const alert = api.buildRouteTariffAlert(status, routeContext);
        container.innerHTML = `
            <section class="tariff-watch-alert tariff-watch-alert--${escapeHtml(alert.tone)}">
                <div>
                    <strong>${escapeHtml(alert.title)}</strong>
                    <p>${escapeHtml(alert.text)}</p>
                </div>
                <a href="${escapeHtml(alert.href)}">Open Tariff Watch</a>
            </section>
        `;
    }

    global.bootstrapTariffWatchPage = bootstrapTariffWatchPage;
    global.mountTariffWatchAlert = mountTariffWatchAlert;
}(typeof globalThis !== 'undefined' ? globalThis : window));
