/**
 * Trade Opportunity page controller.
 */
'use strict';

function bootstrapTradeOpportunityPage() {
    const registry = globalThis.TradeComplyCountryRegistry;
    const opportunity = globalThis.TradeComplyOpportunity;
    if (!registry || !opportunity) {
        return;
    }

    const $ = (id) => document.getElementById(id);
    const form = $('opportunity-form');
    const result = $('opportunity-result');
    const error = $('opportunity-error');
    const startPanel = document.querySelector('.opportunity-start-panel');
    let dutyRates = null;
    let priorityMatrix = null;

    function populateSelect(select, defaultValue) {
        if (!select) {
            return;
        }
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select country / region';
        placeholder.selected = !defaultValue;
        select.appendChild(placeholder);
        registry.getRouteOptions()
            .filter((row) => row.value !== 'GLOBAL')
            .forEach((row) => {
                const option = document.createElement('option');
                option.value = row.value;
                option.textContent = row.label;
                select.appendChild(option);
            });
        select.value = defaultValue || '';
    }

    function setError(message) {
        if (!error) {
            return;
        }
        error.textContent = message || '';
        error.hidden = !message;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function transitStatusLabel(status = '') {
        const labels = {
            second_leg_not_covered: 'Second leg not covered',
            second_leg_baseline: 'Baseline second-leg check',
            cost_advantage: 'Potential cost advantage',
            cost_disadvantage: 'Not cheaper than direct',
            cost_similar: 'Cost-similar to direct'
        };
        return labels[status] || String(status || 'Transit review').replace(/_/g, ' ');
    }

    async function loadDutyRates() {
        if (dutyRates) {
            return dutyRates;
        }
        try {
            const response = await fetch(`data/duty-rates.json?v=${globalThis.TradeComplyBuild || Date.now()}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            dutyRates = await response.json();
        } catch (loadError) {
            dutyRates = { rules: [] };
        }
        return dutyRates;
    }

    async function loadPriorityMatrix() {
        if (priorityMatrix) {
            return priorityMatrix;
        }
        try {
            const response = await fetch(`data/post-entry-rate-priority-matrix.json?v=${globalThis.TradeComplyBuild || Date.now()}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            priorityMatrix = await response.json();
        } catch (loadError) {
            priorityMatrix = { routes: [] };
        }
        return priorityMatrix;
    }

    function renderMarketCard(card, index) {
        const transit = card.transitComparison || null;
        const sourceEvidence = Array.isArray(card.sourceEvidence)
            ? card.sourceEvidence.slice(0, 5)
            : [];
        const rejectionReasons = Array.isArray(card.rejectionReasons)
            ? card.rejectionReasons.slice(0, 3)
            : [];
        const metricItems = transit ? [
            { label: 'Status', value: transitStatusLabel(card.transitCostStatus) },
            { label: 'Transit total', value: transit.combinedRate || 'Not covered' },
            { label: 'Transit cost / $1k', value: transit.combinedCostPer1000 || 'Pending' },
            { label: 'Delta / $1k', value: transit.deltaCostPer1000 || 'Pending' },
            { label: 'First leg', value: `${transit.firstLegRate || 'Pending'} · ${transit.firstLegCostPer1000 || 'Pending'}` },
            { label: 'Second leg', value: `${transit.secondLegRate || 'Pending'} · ${transit.secondLegCostPer1000 || 'Pending'}` }
        ] : [
            { label: 'Route type', value: 'Direct route' },
            { label: 'Direct total', value: card.dutyBreakdown?.totalRate || 'Not covered' },
            { label: 'Coverage', value: card.coverageLabel || 'Pending' },
            { label: 'Quote readiness', value: card.quoteReadiness || 'Pending' },
            { label: 'Landed-cost risk', value: card.landedCostRisk || 'Unknown' },
            { label: 'Demand strength', value: card.demandStrength || 'Selective' },
            { label: 'Compliance friction', value: card.complianceFriction || 'Medium' }
        ];
        const displaySummary = transit?.costConclusion || card.conciseConclusion || card.opportunity;
        const transitDecision = transit?.decision || null;
        const verdict = card.opportunityVerdict || null;
        return `
            <article class="opportunity-market-card ${index === 0 ? 'opportunity-market-card--best' : ''} opportunity-market-card--${escapeHtml(card.coverageTone)}">
                <div class="opportunity-market-score">${escapeHtml(card.score)}</div>
                <div>
                    <div class="opportunity-market-label">${escapeHtml(card.label)}</div>
                    <div class="opportunity-market-route">${escapeHtml(card.routeScopeLabel || card.route)}</div>
                </div>
                <span class="opportunity-pill">${escapeHtml(card.tag)}</span>
                ${verdict ? `
                    <div class="opportunity-route-verdict opportunity-route-verdict--${escapeHtml(verdict.tone || 'neutral')}">
                        <span>Decision</span>
                        <strong>${escapeHtml(verdict.label)}</strong>
                        <p>${escapeHtml(verdict.action)}</p>
                    </div>
                ` : ''}
                ${transitDecision ? `
                    <div class="opportunity-transit-verdict opportunity-transit-verdict--${escapeHtml(transitDecision.tone || 'neutral')}">
                        <span>Transit decision</span>
                        <strong>${escapeHtml(transitDecision.headline)}</strong>
                        <p>${escapeHtml(transitDecision.reason)}</p>
                    </div>
                ` : ''}
                <p>${escapeHtml(displaySummary)}</p>
                ${card.transitReason ? `<p class="opportunity-transit-reason">${escapeHtml(card.transitReason)}</p>` : ''}
                <div class="opportunity-rate-mini-grid">
                    ${metricItems.map((item) => `
                        <div>
                            <span>${escapeHtml(item.label)}</span>
                            <strong>${escapeHtml(item.value)}</strong>
                        </div>
                    `).join('')}
                </div>
                ${card.transitWarning ? `<div class="opportunity-transit-note">${escapeHtml(card.transitWarning)}</div>` : ''}
                ${card.routeDecisionSummary || rejectionReasons.length ? `
                    <div class="opportunity-route-decision" aria-label="Route decision">
                        <span>Route decision</span>
                        ${card.routeDecisionSummary ? `<strong>${escapeHtml(card.routeDecisionSummary)}</strong>` : ''}
                        ${rejectionReasons.length ? `
                            <ul>
                                ${rejectionReasons.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                ` : ''}
                ${sourceEvidence.length ? `
                    <div class="opportunity-source-evidence" aria-label="Decision evidence">
                        <span>Decision evidence</span>
                        ${sourceEvidence.map((item) => `
                            <div>
                                <strong>${escapeHtml(item.label)}</strong>
                                <p>${escapeHtml(item.detail)}</p>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="opportunity-card-action">${escapeHtml(card.businessAction)}</div>
            </article>
        `;
    }

    function renderInsightCard(item) {
        return `
            <article class="opportunity-insight-card">
                <span>${escapeHtml(item.type)}</span>
                <strong>${escapeHtml(item.label)}</strong>
                <p>${escapeHtml(item.text)}</p>
            </article>
        `;
    }

    function renderBusinessDecisionSummary(model) {
        const summary = model.businessDecisionSummary || {};
        const rows = Array.isArray(summary.rows) ? summary.rows : [];
        if (!rows.length) {
            return '';
        }
        return `
            <section class="opportunity-section opportunity-decision-summary">
                <div class="opportunity-section-heading">
                    <h3>Decision summary</h3>
                    <p>${escapeHtml(summary.headline || 'Use this summary to decide whether the route is worth quoting.')}</p>
                </div>
                <div class="opportunity-summary-action">${escapeHtml(summary.primaryAction || 'Compare tariff, control, and evidence readiness before quoting.')}</div>
                <div class="opportunity-decision-summary-grid">
                    ${rows.map((row) => `
                        <article class="opportunity-summary-row opportunity-summary-row--${escapeHtml(row.tone || 'neutral')}">
                            <span>${escapeHtml(row.type)}</span>
                            <strong>${escapeHtml(row.label)}</strong>
                            <p>${escapeHtml(row.route)}</p>
                            <b>${escapeHtml(row.cost)}</b>
                            <small>${escapeHtml(row.gate || row.action)}</small>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;
    }

    function renderParserTargets(model) {
        const targets = Array.isArray(model.parserTargets) ? model.parserTargets : [];
        if (!targets.length) {
            return '';
        }
        return `
            <section class="opportunity-section opportunity-parser-section">
                <div class="opportunity-section-heading">
                    <h3>Exact tariff parser priorities</h3>
                    <p>These are the next routes to upgrade from official-link monitoring to exact tariff-line parsing.</p>
                </div>
                <div class="opportunity-parser-grid">
                    ${targets.map((target) => `
                        <article class="opportunity-parser-card">
                            <span>${escapeHtml(target.priority)}</span>
                            <strong>${escapeHtml(target.label)} · HS ${escapeHtml(target.hsCode)}</strong>
                            <p>${escapeHtml(target.nextAction)}</p>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;
    }

    function renderInsights(model) {
        if (!result) {
            return;
        }
        const best = model.best || {};
        const bestAction = best.opportunitySignal?.shortAction || best.businessAction || best.parserNextAction || 'Compare this route before quoting.';
        const salesAngle = best.salesAngle || best.strategicNote || 'Use this as a route comparison input before quoting.';
        const quoteGate = best.quoteGate || best.riskNote || 'Confirm tariff source and compliance evidence before final quote.';
        const controlGate = best.exportControlGate || null;
        result.hidden = false;
        result.innerHTML = `
            <section class="opportunity-hero-result">
                <div>
                    <span class="opportunity-kicker">Opportunity snapshot</span>
                    <h2>${escapeHtml(model.productSignal.label)} · ${escapeHtml(model.routeLabel)}</h2>
                    <p>${escapeHtml(model.summary)}</p>
                    <div class="opportunity-hero-facts" aria-label="Opportunity decision facts">
                        <span><strong>Best route</strong>${escapeHtml(best.label || 'Selected route')}</span>
                        <span><strong>Data confidence</strong>${escapeHtml(best.coverageLabel || 'Pending')}</span>
                        <span><strong>Next move</strong>${escapeHtml(bestAction)}</span>
                    </div>
                    <div class="opportunity-commercial-brief" aria-label="Commercial decision brief">
                        <strong>${escapeHtml(best.commercialDecision || best.opportunitySignal?.oneLine || 'Review this route before quoting.')}</strong>
                        <span>${escapeHtml(salesAngle)}</span>
                        <span>${escapeHtml(quoteGate)}</span>
                        <span><b>Why this route:</b> ${escapeHtml(model.whyThisRoute || 'Compare maintained duty, tax, and compliance evidence before quoting.')}</span>
                        <span><b>Selected route check:</b> ${escapeHtml(model.whyNotSelectedRoute || 'Keep the selected route visible until evidence shows a better option.')}</span>
                    </div>
                    ${controlGate ? `
                        <div class="opportunity-control-gate" aria-label="Export control gate">
                            <div>
                                <span>${escapeHtml(controlGate.severity || 'Review required')}</span>
                                <strong>${escapeHtml(controlGate.label)}</strong>
                            </div>
                            <p>${escapeHtml(controlGate.summary)}</p>
                            <ul>
                                ${(controlGate.checks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    <div class="opportunity-decision-strip">
                        <span>Quote status: ${escapeHtml(best.quoteReadiness || 'Research only')}</span>
                        <span>Landed-cost risk: ${escapeHtml(best.landedCostRisk || 'Unknown')}</span>
                        <span>Compliance friction: ${escapeHtml(best.complianceFriction || 'Medium')}</span>
                    </div>
                </div>
                <div class="opportunity-best-badge">
                    <span>${escapeHtml(model.bestIsSelectedMarket ? 'Primary route to review' : 'Best route to compare')}</span>
                    <strong>${escapeHtml(best.label || 'Selected route')}</strong>
                </div>
            </section>

            ${renderBusinessDecisionSummary(model)}

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Direct route and top transit options</h3>
                    <p>Showing the selected direct route plus the two strongest transit comparisons. Transit totals combine both maintained duty/tax legs and still require origin-transformation, re-export, and logistics evidence.</p>
                </div>
                <div class="opportunity-market-grid">
                    ${model.markets.map(renderMarketCard).join('')}
                </div>
            </section>

            ${renderParserTargets(model)}

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Commercial signals</h3>
                    <p>Use these as a business-development filter before a deeper compliance review.</p>
                </div>
                <div class="opportunity-insight-grid">
                    ${model.insights.map(renderInsightCard).join('')}
                </div>
            </section>
        `;
    }

    function buildOpportunityUrl({ product, from, to }) {
        const params = new URLSearchParams();
        params.set('product', product);
        params.set('from', from);
        params.set('to', to);
        params.set('result', '1');
        return `opportunity.html?${params.toString()}`;
    }

    async function renderOpportunityResult({ product, from, to }) {
        const [rates, matrix] = await Promise.all([
            loadDutyRates(),
            loadPriorityMatrix()
        ]);
        const model = opportunity.buildOpportunityInsights({
            product,
            from,
            to,
            dutyRates: rates,
            priorityMatrix: matrix
        });
        renderInsights(model);
    }

    function setResultMode(enabled) {
        document.body.classList.toggle('opportunity-result-mode', enabled);
        if (form) {
            form.hidden = enabled;
        }
        if (startPanel) {
            startPanel.hidden = enabled;
        }
    }

    function applyParams() {
        const params = new URLSearchParams(window.location.search);
        const product = params.get('product') || params.get('search') || '';
        const from = params.has('from') ? registry.normalizeCountryCode(params.get('from')) : '';
        const to = params.has('to') ? registry.normalizeCountryCode(params.get('to')) : '';
        const hasResultParams = Boolean(product && from && to);
        setResultMode(hasResultParams);
        if ($('opportunity-product')) {
            $('opportunity-product').value = product;
        }
        populateSelect($('opportunity-from'), from);
        populateSelect($('opportunity-to'), to);
        if (hasResultParams) {
            renderOpportunityResult({ product, from, to })
                .catch(() => setError('Unable to load opportunity results. Please try again.'));
        }
    }

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        setError('');
        const product = $('opportunity-product')?.value.trim();
        const from = $('opportunity-from')?.value || '';
        const to = $('opportunity-to')?.value || '';
        if (!product) {
            setError('Enter a product description to find opportunity signals.');
            return;
        }
        if (!from || !to) {
            setError('Select both From country / region and Target market.');
            return;
        }
        window.location.assign(buildOpportunityUrl({ product, from, to }));
    });

    applyParams();
}

if (typeof globalThis !== 'undefined') {
    globalThis.bootstrapTradeOpportunityPage = bootstrapTradeOpportunityPage;
}
