/**
 * Search results DOM orchestration (pure UI mount; view models from render-prepare.js).
 */
'use strict';

function renderAiQuerySection(container, viewModel) {
    if (!container) {
        return;
    }
    if (!viewModel) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = templateAiQuerySection(viewModel);
    bindAiQuerySectionHandlers();
}

function bindAiQuerySectionHandlers() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiInput = document.getElementById('ai-query-input');

    if (!aiBtn || !aiInput) {
        return;
    }

    aiBtn.addEventListener('click', () => {
        const userQuery = aiInput.value.trim();
        if (userQuery) {
            callAiAssistant(userQuery);
        }
    });

    aiInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            aiBtn.click();
        }
    });
}

function searchProducts(query) {
    AppState.searchOrigin = 'electronics';
    const trimmedQuery = query ? query.trim() : '';
    const selections = getPrecheckSelections('precheck-panel');
    const results = searchWithPrecheck(trimmedQuery, selections, search);
    renderResults(trimmedQuery || t('allProducts'), results.tags, results.cases, selections);
}

function searchEnergyProducts(query) {
    AppState.searchOrigin = 'new-energy';
    const trimmedQuery = query ? query.trim() : '';
    const selections = getPrecheckSelections('energy-precheck-panel');
    const results = searchWithPrecheck(trimmedQuery, selections, search);
    renderResults(trimmedQuery || t('newEnergyProducts'), results.tags, results.cases, selections);
}

function mountComplianceCardElements(itemsEl, cardViewModels) {
    cardViewModels.forEach((cardVm) => {
        const card = document.createElement('div');
        card.className = cardVm.cardClasses;
        if (cardVm.domId) {
            card.id = cardVm.domId;
        }
        card.innerHTML = templateComplianceCard(cardVm);
        itemsEl.appendChild(card);
    });
}

function mountCategoryGroups(container, categoryGroups) {
    const fragment = document.createDocumentFragment();

    categoryGroups.forEach((groupVm) => {
        const groupEl = document.createElement('div');
        groupEl.className = groupVm.groupClass;
        groupEl.innerHTML = templateCategoryGroupShell(groupVm.shell);
        const itemsEl = groupEl.querySelector('.result-category-items');
        mountComplianceCardElements(itemsEl, groupVm.cards);
        fragment.appendChild(groupEl);
    });

    container.appendChild(fragment);
}

function mountResultCards(cardsContainer, viewModel) {
    cardsContainer.innerHTML = '';

    if (viewModel.emptyResults) {
        cardsContainer.innerHTML = templateEmptyResultsMessage(viewModel.emptyResults);
        return;
    }

    mountCategoryGroups(cardsContainer, viewModel.categoryGroups);
}

function mountCasesSection(casesContainer, casesGroupViewModel) {
    if (!casesContainer) {
        return;
    }
    casesContainer.hidden = false;
    casesContainer.style.display = '';
    if (!casesGroupViewModel) {
        casesContainer.innerHTML = '';
        return;
    }
    casesContainer.innerHTML = templateCasesGroup(casesGroupViewModel);
}

function setResultFeedbackVisible(visible) {
    const resultFeedbackSection = document.getElementById('result-feedback-section');
    if (resultFeedbackSection) {
        resultFeedbackSection.style.display = visible ? 'block' : 'none';
    }
}

function mountPolicyCorrectionSection(section, viewModel) {
    if (!section) {
        return;
    }
    if (!viewModel.showPolicyCorrection) {
        section.style.display = 'none';
        section.innerHTML = '';
        return;
    }
    section.style.display = 'block';
    section.innerHTML = renderPolicyCorrectionSection(viewModel.policyCorrectionVariant);
    bindPolicyCorrectionTriggers(section);
}

/**
 * Render search results (orchestration only).
 */
function renderResults(query, tags, cases, precheckSelections = []) {
    showView('result');
    removeAiBox();

    const viewModel = prepareResultsViewModel(query, tags, cases, precheckSelections);
    tags = viewModel.tags;
    cases = viewModel.cases;

    const resultSummary = document.querySelector('.result-summary p');
    if (resultSummary) {
        resultSummary.innerHTML = templateResultSummary(viewModel.resultSummary);
    }

    if (typeof renderCountryContextBanner === 'function') {
        renderCountryContextBanner(tags, viewModel.selectedCountry, viewModel.direction);
    }

    AppState.lastReport = viewModel.reportPayload();
    AppState.aiContext = viewModel.aiContext();

    renderPrecheckSummary('precheck-summary-container', precheckSelections, tags);
    renderTrustBoundary('trust-boundary-container', {
        query,
        direction: viewModel.direction,
        tags,
        cases,
        precheckSelections,
        profile: viewModel.precheckProfile
    });

    const aiQuerySection = document.getElementById('ai-query-section');
    renderAiQuerySection(
        aiQuerySection,
        viewModel.showAiAssistant ? viewModel.aiQuerySection : null
    );

    mountPolicyCorrectionSection(
        document.getElementById('policy-correction-section'),
        viewModel
    );

    const cardsContainer = document.getElementById('result-cards-container');
    if (cardsContainer) {
        mountResultCards(cardsContainer, viewModel);
    }

    setResultFeedbackVisible(viewModel.showResultFeedback);

    if (typeof initGlobalCollapsiblePanels === 'function') {
        initGlobalCollapsiblePanels();
    }

    mountCasesSection(document.getElementById('cases-container'), viewModel.casesGroup);
    mountResultComplianceChecklist(tags, viewModel.selectedCountry, viewModel.direction, query, viewModel.checklistOptions);
}

function mountResultComplianceChecklist(tags, selectedCountry, direction, query, options) {
    if (typeof mountComplianceChecklist === 'function') {
        mountComplianceChecklist('compliance-checklist-container', tags, options);
        return;
    }
    if (typeof placeChecklistSlotAfterPenaltyCases === 'function') {
        placeChecklistSlotAfterPenaltyCases();
    } else if (typeof placeChecklistSlotAfterRiskCards === 'function') {
        placeChecklistSlotAfterRiskCards();
    }
    if (typeof buildComplianceChecklistForResults === 'function'
        && typeof renderComplianceChecklistPanel === 'function') {
        const checklist = buildComplianceChecklistForResults(tags, options);
        renderComplianceChecklistPanel('compliance-checklist-container', checklist);
    }
}
