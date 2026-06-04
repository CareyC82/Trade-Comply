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

if (typeof globalThis !== 'undefined') {
    globalThis.renderResults = renderResults;
}
