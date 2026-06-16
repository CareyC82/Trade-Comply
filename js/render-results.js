/**
 * Search results orchestration — prepare view model, update AppState, mount UI blocks.
 */
'use strict';

function renderResults(query, tags, cases, precheckSelections = []) {
    showView('result');
    removeAiBox();

    const viewModel = prepareResultsViewModel(query, tags, cases, precheckSelections);
    tags = viewModel.tags;
    cases = viewModel.cases;

    mountResultSummary(document.querySelector('.result-summary p'), viewModel.resultSummary);

    if (typeof renderCountryContextBanner === 'function') {
        renderCountryContextBanner(
            tags,
            viewModel.selectedCountry,
            viewModel.direction,
            viewModel.renderContext?.routeContext
        );
    }

    mountOpportunityTeaser(
        document.getElementById('opportunity-teaser-container'),
        query,
        viewModel.renderContext?.routeContext
    );

    const preScreenReport = typeof orchestratePreScreenReport === 'function'
        ? orchestratePreScreenReport(query, tags, cases, precheckSelections)
        : null;

    const reportPayload = viewModel.reportPayload();
    AppState.setSession({
        lastReport: preScreenReport
            ? { ...reportPayload, preScreenReport }
            : reportPayload,
        aiContext: viewModel.aiContext(),
        preScreenReport
    });

    if (typeof renderPreScreenReportPanel === 'function') {
        renderPreScreenReportPanel('pre-screen-report-container', preScreenReport);
    }

    const precheckSummaryContainer = document.getElementById('precheck-summary-container');
    if (precheckSummaryContainer) {
        precheckSummaryContainer.innerHTML = '';
    }

    const trustBoundaryContainer = document.getElementById('trust-boundary-container');
    if (trustBoundaryContainer) {
        trustBoundaryContainer.innerHTML = '';
    }

    renderAiQuerySection(
        document.getElementById('ai-query-section'),
        viewModel.showAiAssistant ? viewModel.aiQuerySection : null
    );

    mountPolicyCorrectionSection(
        document.getElementById('policy-correction-section'),
        viewModel
    );

    mountResultCards(document.getElementById('result-cards-container'), viewModel);
    setResultFeedbackVisible(viewModel.showResultFeedback);

    if (typeof initGlobalCollapsiblePanels === 'function') {
        initGlobalCollapsiblePanels();
    }

    mountCasesSection(document.getElementById('cases-container'), viewModel.casesGroup);
    mountResultComplianceChecklist(
        tags,
        viewModel.selectedCountry,
        viewModel.direction,
        query,
        viewModel.checklistOptions
    );
    const checklistContainer = document.getElementById('compliance-checklist-container');
    const resultCardsContainer = document.getElementById('result-cards-container');
    if (checklistContainer && resultCardsContainer) {
        const position = checklistContainer.compareDocumentPosition(resultCardsContainer);
        if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
            resultCardsContainer.parentNode?.insertBefore(checklistContainer, resultCardsContainer);
        }
    }

    requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
}

let opportunityDutyRatesCache = null;
let opportunityPriorityMatrixCache = null;

async function fetchOpportunityJson(path, fallback) {
    try {
        const response = await fetch(`${path}?v=${globalThis.TradeComplyBuild || Date.now()}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        return fallback;
    }
}

async function loadOpportunityTeaserData() {
    if (!opportunityDutyRatesCache) {
        opportunityDutyRatesCache = fetchOpportunityJson('data/duty-rates.json', { rules: [] });
    }
    if (!opportunityPriorityMatrixCache) {
        opportunityPriorityMatrixCache = fetchOpportunityJson('data/post-entry-rate-priority-matrix.json', { routes: [] });
    }
    const [dutyRates, priorityMatrix] = await Promise.all([
        opportunityDutyRatesCache,
        opportunityPriorityMatrixCache
    ]);
    return { dutyRates, priorityMatrix };
}

function mountOpportunityTeaser(container, query, routeContext) {
    if (!container) {
        return;
    }
    const opportunity = globalThis.TradeComplyOpportunity;
    const countryApi = globalThis.TradeComplyCountryRegistry || globalThis.TradeComplyCountry;
    if (!opportunity || !countryApi || isBrowseAllQuery(query)) {
        container.innerHTML = '';
        return;
    }

    const from = routeContext?.from || AppState.routeFromCountry || 'CN';
    const to = routeContext?.to || AppState.routeToCountry || AppState.currentCountry || 'US';
    const focus = routeContext?.focus || AppState.complianceFocus || 'import';
    const render = (model) => {
        const params = new URLSearchParams({
            product: query,
            from: model.from,
            to: model.to,
            focus: model.focus
        });
        const headline = model.bestIsSelectedMarket
            ? `${model.best.label} remains the primary market to review for ${model.productSignal.label.toLowerCase()}.`
            : `${model.best.label} may be worth comparing for ${model.productSignal.label.toLowerCase()}.`;
        container.innerHTML = `
            <section class="opportunity-teaser" aria-label="Trade opportunity insight">
                <div class="opportunity-teaser__icon" aria-hidden="true">🌐</div>
                <div class="opportunity-teaser__body">
                    <span class="opportunity-teaser__kicker">Trade opportunity insight</span>
                    <strong>${escapeHtml(headline)}</strong>
                    <p>${escapeHtml(model.best.conciseConclusion || model.summary)}</p>
                    <div class="opportunity-teaser__chips">
                        <span>${escapeHtml(model.best.dutyBreakdown?.totalRate || 'Rate pending')} total signal</span>
                        <span>${escapeHtml(model.readyRouteCount || 0)} pricing-comparison route(s)</span>
                        <span>${escapeHtml(model.parserBacklogCount || 0)} parser backlog</span>
                    </div>
                </div>
                <a class="opportunity-teaser__link" href="opportunity.html?${params.toString()}">View Opportunity</a>
            </section>
        `;
    };
    render(opportunity.buildOpportunityInsights({ product: query, from, to, focus }));
    loadOpportunityTeaserData().then(({ dutyRates, priorityMatrix }) => {
        render(opportunity.buildOpportunityInsights({ product: query, from, to, focus, dutyRates, priorityMatrix }));
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.renderResults = renderResults;
    globalThis.mountOpportunityTeaser = mountOpportunityTeaser;
}
