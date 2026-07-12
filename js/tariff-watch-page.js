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
                    <strong>${escapeHtml(row.trustLabel || row.confidence)}</strong>
                    <small>${escapeHtml(row.lastChecked)}</small>
                </div>
            </article>
        `;
    }

    function renderTrustBadge(row) {
        return `<span class="tariff-trust-badge tariff-trust-badge--${escapeHtml(row.trustTone || 'estimate')}">${escapeHtml(row.trustLabel || row.confidence || 'Pre-check')}</span>`;
    }

    function renderUseStatusBadge(row) {
        const status = row.useStatus || {};
        return `<span class="tariff-use-badge tariff-use-badge--${escapeHtml(status.tone || 'source')}">${escapeHtml(status.label || 'Pre-check signal')}</span>`;
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

    function renderMarketDetailSummary(market, rows) {
        const sourceMix = market?.sourceMix || {};
        const exactCount = Number(sourceMix.exact || 0);
        const useBuckets = market?.useBuckets || {};
        return `
            <div class="tariff-market-detail-summary" aria-label="Market tariff coverage summary">
                <article>
                    <span>Maintained signals</span>
                    <strong>${escapeHtml(rows.length)}</strong>
                    <small>Import duty / tax rows</small>
                </article>
                <article>
                    <span>Exact HS lines</span>
                    <strong>${escapeHtml(exactCount)}</strong>
                    <small>${escapeHtml(exactCount > 0 ? 'Use when product matches' : 'Exact HS still required')}</small>
                </article>
                <article>
                    <span>Quote-ready screen</span>
                    <strong>${escapeHtml(useBuckets.quoteReady || 0)}</strong>
                    <small>Best maintained rows for quote review</small>
                </article>
                <article>
                    <span>Pre-check / source work</span>
                    <strong>${escapeHtml((useBuckets.precheckOnly || 0) + (useBuckets.needsSource || 0))}</strong>
                    <small>Confirm exact line before filing</small>
                </article>
            </div>
        `;
    }

    function renderMarketSignalCard(row) {
        return `
            <article class="tariff-market-signal-card">
                <div class="tariff-market-signal-card__head">
                    <div>
                        <span>Product / HS group</span>
                        <strong>${escapeHtml(row.productGroup || 'High-tech goods')}</strong>
                        <small>HS ${escapeHtml(row.hsScope)} · Origin: ${escapeHtml(row.originScope)}</small>
                    </div>
                    <div class="tariff-signal-badge-stack">
                        ${renderUseStatusBadge(row)}
                        ${renderTrustBadge(row)}
                    </div>
                </div>
                <p>${escapeHtml(row.label)}</p>
                <div class="tariff-rate-mini-grid" aria-label="Tariff rate breakdown">
                    <div><span>Base duty</span><strong>${escapeHtml(row.baseRate)}</strong></div>
                    <div><span>Add-on / tax</span><strong>${escapeHtml(row.addOnRate)}</strong></div>
                    <div><span>Total signal</span><strong>${escapeHtml(row.totalRate)}</strong></div>
                    <div><span>Source trust</span><strong>${escapeHtml(row.confidence)}</strong></div>
                </div>
                <small>${escapeHtml(row.useStatus?.guidance || row.trustDetail || row.sourceText || 'Confirm exact HS, origin, and entry date before filing.')}</small>
            </article>
        `;
    }

    function renderMarketSignalGroup(title, description, rows, tone) {
        return `
            <section class="tariff-market-signal-group tariff-market-signal-group--${escapeHtml(tone)}">
                <div class="tariff-market-signal-group__head">
                    <div>
                        <h3>${escapeHtml(title)}</h3>
                        <p>${escapeHtml(description)}</p>
                    </div>
                    <strong>${escapeHtml(rows.length)}</strong>
                </div>
                <div class="tariff-market-signal-list" aria-label="${escapeHtml(title)}">
                    ${rows.length
                        ? rows.map(renderMarketSignalCard).join('')
                        : '<p class="tariff-watch-empty">No maintained rows in this bucket yet.</p>'}
                </div>
            </section>
        `;
    }

    function renderMarketSignalGroups(rows) {
        const quoteRows = rows.filter((row) => row.useStatus?.bucket === 'quote');
        const precheckRows = rows.filter((row) => row.useStatus?.bucket === 'precheck');
        const sourceRows = rows.filter((row) => row.useStatus?.bucket === 'source');
        return [
            renderMarketSignalGroup(
                'Quote-ready screen',
                'Most usable rows for early customer quote review when product, origin, and date match.',
                quoteRows,
                'quote'
            ),
            renderMarketSignalGroup(
                'Pre-check only',
                'Official or heading-level signals that still need exact HS, origin, and add-on layer confirmation.',
                precheckRows,
                'precheck'
            ),
            renderMarketSignalGroup(
                'Needs source / parser work',
                'Directional rows or source gaps that should not be used as filing-grade rates yet.',
                sourceRows,
                'source'
            )
        ].join('');
    }

    function renderMarketActionPanel(model, market) {
        const marketName = String(market?.country || '').toLowerCase();
        const actions = (model.automationActions || [])
            .filter((action) => String(action.country || '').toLowerCase() === marketName)
            .slice(0, 3);
        if (!actions.length) return '';
        return `
            <div class="tariff-market-action-panel" aria-label="Coverage upgrade next">
                <div>
                    <span>Coverage upgrade next</span>
                    <strong>${escapeHtml(actions[0].title || 'Source follow-up')}</strong>
                    <p>${escapeHtml(actions[0].nextAction || 'Keep this source under review before filing-grade use.')}</p>
                </div>
                <ul>
                    ${actions.map((action) => `
                        <li>
                            <b>${escapeHtml(action.priority || 'Tracked')}</b>
                            <span>${escapeHtml(action.evidence || 'Maintained automation queue')}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    function renderSpecialProgram(program) {
        const codes = program.declarationCodes || {};
        const counts = program.annexCounts || {};
        const annexSummary = [
            ['I', counts.annex_i],
            ['II', counts.annex_ii],
            ['III', counts.annex_iii],
            ['Quota groups', counts.quotas]
        ].filter(([, count]) => Number.isFinite(Number(count)));
        const quotaRows = Array.isArray(program.quotaStatus?.rows) ? program.quotaStatus.rows : [];
        const availableQuotas = quotaRows.filter((row) => row.available === true).length;
        const codeText = [
            Array.isArray(codes.measureTypes) && codes.measureTypes.length ? `Measure ${codes.measureTypes.join('/')}` : '',
            codes.preferenceCode ? `Preference ${codes.preferenceCode}` : '',
            codes.originDocument ? `Document ${codes.originDocument}` : ''
        ].filter(Boolean).join(' · ');
        return `
            <article class="tariff-special-program">
                <div class="tariff-special-program__head">
                    <div>
                        <span>Special tariff program · effective ${escapeHtml(program.effectiveFrom)}</span>
                        <h3>${escapeHtml(program.label)}</h3>
                        <p>Origin: ${escapeHtml(program.originScope)} · ${escapeHtml(program.legalBasis)}</p>
                    </div>
                    <a href="${escapeHtml(program.officialUrl)}" target="_blank" rel="noopener noreferrer">Official regulation</a>
                </div>
                <div class="tariff-special-program__gate">
                    <strong>Official Annex scope parsed</strong>
                    <p>${escapeHtml(program.scopeNote)}</p>
                </div>
                ${annexSummary.length ? `
                    <ul class="tariff-special-program__counts" aria-label="Official Annex coverage">
                        ${annexSummary.map(([label, count]) => `<li><b>${escapeHtml(label)}</b><span>${escapeHtml(count)} entries</span></li>`).join('')}
                    </ul>
                ` : ''}
                ${quotaRows.length ? `<p class="tariff-special-program__quota"><b>Live quota status</b> ${availableQuotas}/${quotaRows.length} order numbers currently show available balance. Allocation remains first-come, first-served.</p>` : ''}
                <ul>
                    ${(program.treatments || []).map((row) => `<li><b>Annex ${escapeHtml(row.annex)}</b><span>${escapeHtml(row.treatment)}</span></li>`).join('')}
                </ul>
                <small>${escapeHtml(codeText)} · Article 59a origin and transport evidence required${program.annexLastChecked ? ` · Annex checked ${escapeHtml(program.annexLastChecked)}` : ''}</small>
            </article>
        `;
    }

    function renderSpecialPrograms(model, market) {
        const programs = (model.specialPrograms || []).filter((row) => row.marketKey === market?.marketKey);
        if (!programs.length) return '';
        return `
            <section class="tariff-special-programs" aria-label="Special tariff programs">
                <div class="tariff-watch-section-heading">
                    <h2>Special tariff programs</h2>
                    <p>Conditional treatments are shown separately from standard market tariff signals.</p>
                </div>
                ${programs.map(renderSpecialProgram).join('')}
            </section>
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
                ${renderSpecialPrograms(model, market)}
                ${renderMarketDetailSummary(market, rows)}
                ${renderMarketActionPanel(model, market)}
                <div class="tariff-market-signal-groups" aria-label="Market tariff signal list">
                    ${rows.length
                        ? renderMarketSignalGroups(rows)
                        : '<p class="tariff-watch-empty">No maintained tariff rows are available for this market yet.</p>'}
                </div>
            </section>
        `;
    }

    function renderAutomationAction(action) {
        return `
            <article class="tariff-automation-action tariff-automation-action--${escapeHtml(action.tone || 'stable')}">
                <div>
                    <span>${escapeHtml(action.priority || 'Action')}</span>
                    <strong>${escapeHtml(action.country || 'Market')}</strong>
                </div>
                <div>
                    <b>${escapeHtml(action.title || 'Source follow-up')}</b>
                    <p>${escapeHtml(action.nextAction || 'Keep this source under review.')}</p>
                    <small>${escapeHtml(action.evidence || 'Maintained automation signal')}</small>
                </div>
            </article>
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
                    <h2>Automation action list</h2>
                    <p>Only source/parser follow-up that affects rate confidence is shown here.</p>
                </div>
                <div class="tariff-automation-summary">
                    <div><span>Sources checked</span><strong>${escapeHtml(model.sourcesChecked)}</strong></div>
                    <div><span>Source/parser updates</span><strong>${escapeHtml(model.sourceUpdates)}</strong></div>
                    <div><span>Markets needing follow-up</span><strong>${escapeHtml(model.automationActions.length)}</strong></div>
                </div>
                <div class="tariff-automation-action-list">
                    ${model.automationActions.map(renderAutomationAction).join('')}
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
