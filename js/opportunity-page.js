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
        const metricItems = [
            { label: 'Total signal', value: card.dutyBreakdown?.totalRate || 'Not covered' },
            { label: 'Coverage', value: card.coverageLabel || 'Pending' },
            { label: 'Quote readiness', value: card.quoteReadiness || 'Pending' },
            { label: 'Landed-cost risk', value: card.landedCostRisk || 'Unknown' },
            { label: 'Demand strength', value: card.demandStrength || 'Selective' },
            { label: 'Compliance friction', value: card.complianceFriction || 'Medium' }
        ];
        return `
            <article class="opportunity-market-card ${index === 0 ? 'opportunity-market-card--best' : ''} opportunity-market-card--${escapeHtml(card.coverageTone)}">
                <div class="opportunity-market-score">${escapeHtml(card.score)}</div>
                <div>
                    <div class="opportunity-market-label">${escapeHtml(card.label)}</div>
                    <div class="opportunity-market-route">${escapeHtml(card.route)}</div>
                </div>
                <span class="opportunity-pill">${escapeHtml(card.tag)}</span>
                <p>${escapeHtml(card.conciseConclusion || card.opportunity)}</p>
                <div class="opportunity-rate-mini-grid">
                    ${metricItems.map((item) => `
                        <div>
                            <span>${escapeHtml(item.label)}</span>
                            <strong>${escapeHtml(item.value)}</strong>
                        </div>
                    `).join('')}
                </div>
                <div class="opportunity-card-action">${escapeHtml(card.businessAction)}</div>
            </article>
        `;
    }

    function renderRouteRow(card) {
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(card.route)}</strong>
                    <span>${escapeHtml(card.label)} · score ${escapeHtml(card.score)}</span>
                </td>
                <td>
                    <strong>${escapeHtml(card.dutyBreakdown?.totalRate || 'Not covered')}</strong>
                    <span>Base ${escapeHtml(card.dutyBreakdown?.baseDuty || 'Pending')}</span>
                    <span>Add-on ${escapeHtml(card.dutyBreakdown?.addOnDuty || 'Pending')}</span>
                    <span>Tax ${escapeHtml(card.dutyBreakdown?.taxLayer || 'Pending')}</span>
                </td>
                <td><span class="opportunity-coverage-pill opportunity-coverage-pill--${escapeHtml(card.coverageTone)}">${escapeHtml(card.coverageLabel)}</span></td>
                <td>${escapeHtml(card.hsCode || 'Pending')}</td>
                <td>
                    <strong>${escapeHtml(card.parserPriority || 'P?')}</strong>
                    <span>${escapeHtml(card.parserNextAction)}</span>
                </td>
            </tr>
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
                    <div class="opportunity-decision-strip">
                        <span>${escapeHtml(model.readyRouteCount)} route(s) usable for pricing comparison</span>
                        <span>${escapeHtml(model.parserBacklogCount)} route(s) need parser/source upgrade</span>
                    </div>
                </div>
                <div class="opportunity-best-badge">
                    <span>${escapeHtml(model.bestIsSelectedMarket ? 'Primary route to review' : 'Best route to compare')}</span>
                    <strong>${escapeHtml(best.label || 'Selected route')}</strong>
                </div>
            </section>

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Markets to consider</h3>
                    <p>Ranked by duty structure, rate-source confidence, market access friction, and category fit.</p>
                </div>
                <div class="opportunity-market-grid">
                    ${model.markets.map(renderMarketCard).join('')}
                </div>
            </section>

            ${renderParserTargets(model)}

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Route comparison and rate coverage</h3>
                    <p>Use this to compare duty structure, official coverage, HS basis, and parser priority.</p>
                </div>
                <div class="opportunity-table-wrap">
                    <table class="opportunity-route-table">
                        <thead>
                            <tr>
                                <th>Route</th>
                                <th>Duty signal</th>
                                <th>Coverage</th>
                                <th>HS basis</th>
                                <th>Parser priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${model.routeComparison.map(renderRouteRow).join('')}
                        </tbody>
                    </table>
                </div>
            </section>

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

    function buildOpportunityUrl({ product, from, to, focus }) {
        const params = new URLSearchParams();
        params.set('product', product);
        params.set('from', from);
        params.set('to', to);
        params.set('focus', focus);
        params.set('result', '1');
        return `opportunity.html?${params.toString()}`;
    }

    async function renderOpportunityResult({ product, from, to, focus }) {
        const [rates, matrix] = await Promise.all([
            loadDutyRates(),
            loadPriorityMatrix()
        ]);
        const model = opportunity.buildOpportunityInsights({
            product,
            from,
            to,
            focus,
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
        const focus = params.has('focus') ? params.get('focus') : '';
        const hasResultParams = Boolean(product && from && to && focus);
        setResultMode(hasResultParams);
        if ($('opportunity-product')) {
            $('opportunity-product').value = product;
        }
        populateSelect($('opportunity-from'), from);
        populateSelect($('opportunity-to'), to);
        const focusEl = focus
            ? document.querySelector(`input[name="opportunity-focus"][value="${focus === 'export' ? 'export' : 'import'}"]`)
            : null;
        if (focusEl && (product || from || to)) {
            focusEl.checked = true;
        }
        if (hasResultParams) {
            renderOpportunityResult({ product, from, to, focus })
                .catch(() => setError('Unable to load opportunity results. Please try again.'));
        }
    }

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        setError('');
        const product = $('opportunity-product')?.value.trim();
        const from = $('opportunity-from')?.value || '';
        const to = $('opportunity-to')?.value || '';
        const focus = document.querySelector('input[name="opportunity-focus"]:checked')?.value || '';
        if (!product) {
            setError('Enter a product description to find opportunity signals.');
            return;
        }
        if (!from || !to) {
            setError('Select both From country / region and Target market.');
            return;
        }
        if (!focus) {
            setError('Select export-side or import-side opportunity focus.');
            return;
        }
        window.location.assign(buildOpportunityUrl({ product, from, to, focus }));
    });

    applyParams();
}

if (typeof globalThis !== 'undefined') {
    globalThis.bootstrapTradeOpportunityPage = bootstrapTradeOpportunityPage;
}
