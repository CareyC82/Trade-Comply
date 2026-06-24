/**
 * Results view DOM mounting — templates only, no search or state preparation.
 */
'use strict';

function mountComplianceCardElements(itemsEl, cardViewModels) {
    if (!itemsEl) {
        return;
    }
    cardViewModels.forEach((cardVm) => {
        const card = document.createElement('div');
        card.className = cardVm.cardClasses;
        if (cardVm.domId) {
            card.id = cardVm.domId;
        }
        mountHtml(card, templateComplianceCard(cardVm));
        itemsEl.appendChild(card);
    });
}

function mountCategoryGroups(container, categoryGroups) {
    const fragment = document.createDocumentFragment();

    categoryGroups.forEach((groupVm) => {
        const groupEl = document.createElement('div');
        groupEl.className = groupVm.groupClass;
        mountHtml(groupEl, templateCategoryGroupShell(groupVm.shell));
        const itemsEl = groupEl.querySelector('.result-category-items');
        mountComplianceCardElements(itemsEl, groupVm.cards);
        fragment.appendChild(groupEl);
    });

    mountFragment(container, fragment);
}

function mountResultCards(cardsContainer, viewModel) {
    if (!cardsContainer) {
        return;
    }
    clearElement(cardsContainer);

    if (viewModel.emptyResults) {
        mountHtml(cardsContainer, templateEmptyResultsMessage(viewModel.emptyResults));
        return;
    }

    mountCategoryGroups(cardsContainer, viewModel.categoryGroups);
}

function mountCasesSection(casesContainer, casesGroupViewModel) {
    if (!casesContainer) {
        return;
    }
    setElementVisible(casesContainer, true);
    if (!casesGroupViewModel) {
        clearElement(casesContainer);
        return;
    }
    mountHtml(casesContainer, templateCasesGroup(casesGroupViewModel));
}

function mountResultSummary(summaryElement, summaryViewModel) {
    if (!summaryElement) {
        return;
    }
    mountHtml(summaryElement, templateResultSummary(summaryViewModel));
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
        clearElement(section);
        return;
    }
    section.style.display = 'block';
    mountHtml(section, renderPolicyCorrectionSection(viewModel.policyCorrectionVariant));
    if (viewModel.policyCorrectionVariant === 'no_match') {
        bindPolicyCorrectionTriggers(section);
    } else if (typeof bindFeedbackTriggers === 'function') {
        bindFeedbackTriggers(section);
    }
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

if (typeof globalThis !== 'undefined') {
    globalThis.mountComplianceCardElements = mountComplianceCardElements;
    globalThis.mountCategoryGroups = mountCategoryGroups;
    globalThis.mountResultCards = mountResultCards;
    globalThis.mountCasesSection = mountCasesSection;
    globalThis.mountResultSummary = mountResultSummary;
    globalThis.mountPolicyCorrectionSection = mountPolicyCorrectionSection;
    globalThis.mountResultComplianceChecklist = mountResultComplianceChecklist;
    globalThis.setResultFeedbackVisible = setResultFeedbackVisible;
}
