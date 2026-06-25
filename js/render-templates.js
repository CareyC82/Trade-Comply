/**
 * Pure HTML templates for search results UI.
 * Expects pre-escaped strings in view models (no business logic).
 */
'use strict';

function templateAiQuerySection(vm) {
    return `
        <div class="ai-grounding-note">${vm.noteHtml}</div>
        <div class="ai-query-row">
            <input type="text" id="ai-query-input" class="ai-query-input" placeholder="${vm.placeholderHtml}" value="">
            <button id="ai-assistant-btn" class="ai-assistant-btn" type="button">
                🤖 ${vm.assistantLabelHtml}
            </button>
        </div>
    `;
}

function templateResultSummary(vm) {
    if (vm.routeLineHtml) {
        return `${vm.routeLineHtml}: ${vm.foundRegulationsHtml} <span id="result-count">${vm.tagCount}</span> ${vm.regulationsForHtml} '<span id="search-term">${vm.queryHtml}</span>' <span class="result-summary-role">(${vm.roleFocusHtml})</span>`;
    }
    return `${vm.directionTextHtml} <span class="result-summary-arrow" aria-hidden="true">→</span> <span class="result-summary-country">${vm.countryLabelHtml}</span>: ${vm.foundRegulationsHtml} <span id="result-count">${vm.tagCount}</span> ${vm.regulationsForHtml} '<span id="search-term">${vm.queryHtml}</span>' <span class="result-summary-role">(${vm.roleFocusHtml})</span>`;
}

function templateEmptyResultsMessage(vm) {
    const style = vm.variant === 'out_of_range'
        ? 'text-align: center; color: var(--color-text-secondary); padding: 20px; line-height: 1.6;'
        : 'text-align: center; color: var(--color-text-secondary); padding: 20px;';
    return `<p style="${style}">${vm.messageHtml}</p>`;
}

function templateCategoryGroupShell(vm) {
    return `
        <button type="button" class="category-group-header collapsible-header" aria-expanded="false">
            <span class="group-icon group-icon--themed" aria-hidden="true">${vm.themeIcon}</span>
            <span class="group-title">${vm.categoryLabelHtml}</span>
            <span class="group-count">${vm.ruleCount} ${vm.ruleCountLabelHtml}</span>
            <span class="arrow" aria-hidden="true">▶</span>
        </button>
        <div class="category-group-items result-category-items"></div>
    `;
}

function templateRiskLevelBadge(vm) {
    return `<span class="risk-level-badge risk-level-${vm.riskLevelClass}">${vm.riskLevelHtml}</span>`;
}

function templateCountryScopePill(vm) {
    return `<span class="country-scope-pill">${vm.scopeLineHtml}</span>`;
}

function templateComplianceCardHeaderHint(vm) {
    return `<span class="compliance-card-header-hint">${vm.hintHtml}</span>`;
}

function templateComplianceExemptions(vm) {
    return `<div class="compliance-extra exemptions-row">✔️ <strong>${vm.labelHtml}:</strong> ${vm.valueHtml}</div>`;
}

function templateComplianceRiskScenarios(vm) {
    return `<div class="compliance-extra risk-row">⚠️ <strong>${vm.labelHtml}:</strong> ${vm.valueHtml}</div>`;
}

function templateComplianceEsgEvidence(vm) {
    return `<div class="compliance-extra esg-row">🌱 <strong>${vm.labelHtml}:</strong> ${vm.valueHtml}</div>`;
}

function templateComplianceLegacySource(vm) {
    return `<div class="compliance-source"><strong>${vm.sourceLabelHtml}:</strong> <a href="${vm.sourceUrl}" target="_blank" rel="noopener noreferrer">${vm.sourceCitationHtml}</a></div>`;
}

function templateComplianceCard(vm) {
    return `
        ${vm.matchRibbonHtml}
        <button type="button" class="compliance-card-header collapsible-header" aria-expanded="false">
            <span class="compliance-tag ${vm.tagTypeClass}">${vm.tagTypeLabelHtml}</span>
            ${vm.riskBadgeHtml}
            <span class="compliance-card-header-text">
                <span class="compliance-card-header-title">
                    ${vm.regulatoryBadgeHtml}
                    ${vm.countryCodeBadgeHtml}
                    <span class="compliance-card-title-text">${vm.cardLabelHtml}</span>
                </span>
                ${vm.scopePillHtml}
                ${vm.cardHintHtml}
            </span>
            <span class="arrow" aria-hidden="true">▶</span>
        </button>
        <div class="compliance-card-body collapsible-body">
            ${vm.auditTrailHtml}
            <div class="compliance-title">${vm.bodyTitleHtml}</div>
            <div class="compliance-desc">${vm.bodyDescHtml}</div>
            ${vm.esgEvidenceHtml || ''}
            ${vm.exemptionsHtml}
            ${vm.riskScenariosHtml}
            <div class="compliance-hs"><strong>${vm.hsCodeLabelHtml}:</strong> ${vm.hsCodesHtml}</div>
            ${vm.legacySourceHtml}
        </div>
    `;
}

function templateCaseCard(vm) {
    const idAttr = vm.caseDomId ? `id="${vm.caseDomId}"` : '';
    return `
        <div class="case-card collapsible-panel" ${idAttr}>
            <button type="button" class="case-card-header collapsible-header" aria-expanded="false">
                <span class="case-card-header-title">${vm.titleHtml}</span>
                <span class="case-card-header-date">${vm.dateHtml}</span>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
            <div class="case-card-body collapsible-body">
                <div class="case-summary">${vm.summaryHtml}</div>
                <a href="${vm.sourceUrl}" target="_blank" rel="noopener noreferrer" class="case-link">${vm.sourceLinkLabelHtml} ${vm.sourceUrlDisplayHtml}</a>
            </div>
        </div>
    `;
}

function templateCasesGroup(vm) {
    return `
        <div class="result-category-group cases-group collapsible-panel result-category-group--penalty-cases">
            <button type="button" class="category-group-header collapsible-header" aria-expanded="false">
                <span class="group-icon group-icon--themed" aria-hidden="true">⚖️</span>
                <span class="group-title">${vm.groupTitleHtml}</span>
                <span class="group-count">${vm.caseCount} ${vm.caseCountLabelHtml}</span>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
            <div class="cases-group-body collapsible-body">${vm.caseCardsHtml}</div>
        </div>
    `;
}

if (typeof globalThis !== 'undefined') {
    globalThis.templateAiQuerySection = templateAiQuerySection;
    globalThis.templateResultSummary = templateResultSummary;
    globalThis.templateEmptyResultsMessage = templateEmptyResultsMessage;
    globalThis.templateCategoryGroupShell = templateCategoryGroupShell;
    globalThis.templateRiskLevelBadge = templateRiskLevelBadge;
    globalThis.templateCountryScopePill = templateCountryScopePill;
    globalThis.templateComplianceCardHeaderHint = templateComplianceCardHeaderHint;
    globalThis.templateComplianceExemptions = templateComplianceExemptions;
    globalThis.templateComplianceRiskScenarios = templateComplianceRiskScenarios;
    globalThis.templateComplianceEsgEvidence = templateComplianceEsgEvidence;
    globalThis.templateComplianceLegacySource = templateComplianceLegacySource;
    globalThis.templateComplianceCard = templateComplianceCard;
    globalThis.templateCaseCard = templateCaseCard;
    globalThis.templateCasesGroup = templateCasesGroup;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        templateAiQuerySection,
        templateResultSummary,
        templateEmptyResultsMessage,
        templateCategoryGroupShell,
        templateComplianceCard,
        templateComplianceEsgEvidence,
        templateCaseCard,
        templateCasesGroup
    };
}
