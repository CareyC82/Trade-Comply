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
        placeholder.disabled = true;
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
        return `
            <article class="opportunity-market-card ${index === 0 ? 'opportunity-market-card--best' : ''} opportunity-market-card--${escapeHtml(card.coverageTone)}">
                <div class="opportunity-market-score">${escapeHtml(card.score)}</div>
                <div>
                    <div class="opportunity-market-label">${escapeHtml(card.label)}</div>
                    <div class="opportunity-market-route">${escapeHtml(card.route)}</div>
                </div>
                <span class="opportunity-pill">${escapeHtml(card.tag)}</span>
                <p>${escapeHtml(card.opportunity)}</p>
                <small>${escapeHtml(card.rateText)} · ${escapeHtml(card.coverageLabel)}</small>
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
                <td>${escapeHtml(card.rateText)}</td>
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

    function renderInsights(model) {
        if (!result) {
            return;
        }
        result.hidden = false;
        result.innerHTML = `
            <section class="opportunity-hero-result">
                <div>
                    <span class="opportunity-kicker">Opportunity snapshot</span>
                    <h2>${escapeHtml(model.productSignal.label)} · ${escapeHtml(model.routeLabel)}</h2>
                    <p>${escapeHtml(model.summary)}</p>
                    <div class="opportunity-decision-strip">
                        <span>${escapeHtml(model.readyRouteCount)} route(s) usable for pricing comparison</span>
                        <span>${escapeHtml(model.parserBacklogCount)} route(s) need parser/source upgrade</span>
                    </div>
                </div>
                <div class="opportunity-best-badge">
                    <span>Best route to compare</span>
                    <strong>${escapeHtml(model.best.label)}</strong>
                </div>
            </section>

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Markets to consider</h3>
                    <p>Ranked by maintained duty signals, source trust, market access friction, and category fit.</p>
                </div>
                <div class="opportunity-market-grid">
                    ${model.markets.map(renderMarketCard).join('')}
                </div>
            </section>

            <section class="opportunity-section">
                <div class="opportunity-section-heading">
                    <h3>Route comparison and rate coverage</h3>
                    <p>Use this to see whether a route is official-backed, hybrid, official-link monitored, or still missing exact coverage.</p>
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

    function applyParams() {
        const params = new URLSearchParams(window.location.search);
        const product = params.get('product') || params.get('search') || '';
        const from = params.has('from') ? registry.normalizeCountryCode(params.get('from')) : '';
        const to = params.has('to') ? registry.normalizeCountryCode(params.get('to')) : '';
        const focus = params.has('focus') ? params.get('focus') : '';
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
        if (product || params.get('auto') === '1') {
            form?.requestSubmit();
        }
    }

    form?.addEventListener('submit', async (event) => {
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
        window.history.replaceState(null, '', `opportunity.html?product=${encodeURIComponent(product)}&from=${encodeURIComponent(model.from)}&to=${encodeURIComponent(model.to)}&focus=${encodeURIComponent(model.focus)}`);
    });

    applyParams();
}

if (typeof globalThis !== 'undefined') {
    globalThis.bootstrapTradeOpportunityPage = bootstrapTradeOpportunityPage;
}
