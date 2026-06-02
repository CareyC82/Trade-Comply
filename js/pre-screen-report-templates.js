/**
 * HTML templates for Compliance Pre-Screening Report panel.
 */
'use strict';

function templatePreScreenReportPanel(vm) {
    return `
        <article class="pre-screen-report pre-screen-report--dashboard collapsible-panel" aria-label="${vm.titleHtml}">
            <button type="button" class="pre-screen-report__header collapsible-header" aria-expanded="false">
                <div class="pre-screen-report__heading">
                    <h2 class="pre-screen-report__title">${vm.titleHtml}</h2>
                    <p class="pre-screen-report__meta">${vm.metaHtml}</p>
                </div>
                <div class="pre-screen-report__risk">
                    <span class="pre-screen-report__risk-label">${vm.riskLabelHtml}</span>
                    <span class="psr-risk-badge psr-risk-badge--${vm.riskLevelClass}">${vm.riskLevelHtml}</span>
                </div>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
            <div class="pre-screen-report__body collapsible-body">
                <section class="psr-snapshot psr-snapshot--${vm.riskLevelClass}">
                    <div class="psr-traffic-light" aria-hidden="true">
                        <span class="psr-traffic-dot psr-traffic-dot--red"></span>
                        <span class="psr-traffic-dot psr-traffic-dot--yellow"></span>
                        <span class="psr-traffic-dot psr-traffic-dot--green"></span>
                    </div>
                    <div class="psr-snapshot__content">
                        <p class="psr-snapshot__tone">${vm.riskToneHtml}</p>
                        <p class="psr-snapshot__sentence">${vm.riskSentenceHtml}</p>
                        ${vm.riskDriversHtml}
                    </div>
                </section>

                <section class="psr-trigger-strip" aria-label="${vm.triggerTitleHtml}">
                    <div class="psr-section-kicker">${vm.triggerTitleHtml}</div>
                    ${vm.topTriggersHtml}
                </section>

                <section class="psr-action-plan" aria-label="${vm.missingTitleHtml}">
                    <div class="psr-section-heading-row">
                        <div>
                            <h3 class="pre-screen-report__section-title">Immediate Next Steps</h3>
                            <p class="psr-section-subtitle">The three checks most likely to affect the shipment decision.</p>
                        </div>
                        <span class="psr-count-pill">${vm.matchedCountHtml} signals</span>
                    </div>
                    ${vm.actionPlanHtml}
                </section>

                <details class="psr-legal-basis">
                    <summary>
                        <span>${vm.sourcesTitleHtml}</span>
                        <strong>${vm.sourceCountHtml} sources</strong>
                        <small>${vm.sourceSummaryHtml}</small>
                    </summary>
                    ${vm.sourcesBlockHtml}
                    <div class="psr-scope-note">${vm.scopeNoteHtml}</div>
                    <footer class="pre-screen-report__disclaimer">
                        <h3 class="pre-screen-report__section-title">${vm.disclaimerTitleHtml}</h3>
                        <p class="pre-screen-report__disclaimer-text">${vm.disclaimerHtml}</p>
                    </footer>
                </details>
            </div>
        </article>
    `;
}

function templateRiskDrivers(drivers) {
    if (!drivers.length) {
        return '';
    }
    return `<div class="psr-driver-chips">${drivers.map((driver) => `
        <span class="psr-driver-chip"><span aria-hidden="true">${driver.iconHtml}</span>${driver.labelHtml}</span>
    `).join('')}</div>`;
}

function templateTopTriggers(triggers) {
    if (!triggers.length) {
        return `<p class="pre-screen-report__empty">No direct rule trigger found in the current library.</p>`;
    }
    return `<div class="psr-trigger-list">${triggers.map((trigger, index) => `
        <article class="psr-trigger-card">
            <span class="psr-trigger-rank">${index + 1}</span>
            <div>
                <h4>${trigger.titleHtml}</h4>
                ${trigger.metaHtml ? `<p class="psr-trigger-meta">${trigger.metaHtml}</p>` : ''}
                ${trigger.detailHtml ? `<p>${trigger.detailHtml}</p>` : ''}
            </div>
        </article>
    `).join('')}</div>`;
}

function templateImmediateNextSteps(items) {
    if (!items.length) {
        return `<p class="pre-screen-report__empty">No immediate action items identified for this screen.</p>`;
    }
    return `<ol class="psr-next-steps">${items.map((item, index) => `
        <li class="${item.priorityHtml === 'critical' ? 'psr-next-step--critical' : ''}">
            <span class="psr-next-step-index">${index + 1}</span>
            <span class="psr-next-step-task">${item.taskHtml}</span>
            <span class="psr-next-step-phase">${item.phaseHtml}</span>
        </li>
    `).join('')}</ol>`;
}

function templateReportList(items, itemClass) {
    if (!items.length) {
        return `<p class="pre-screen-report__empty">None identified for this screen.</p>`;
    }
    return `<ul class="pre-screen-report__list ${itemClass || ''}">${items.map((line) => `<li>${line}</li>`).join('')}</ul>`;
}

function templateOfficialSourcesList(sources) {
    if (!sources.length) {
        return `<p class="pre-screen-report__empty">No official source URLs attached to matched rules.</p>`;
    }
    return `<ul class="pre-screen-report__sources">${sources.map((source) => `
        <li>
            <a class="pre-screen-report__source-link" href="${source.url}" target="_blank" rel="noopener noreferrer">${source.labelHtml}</a>
            ${source.metaHtml ? `<span class="pre-screen-report__source-meta">${source.metaHtml}</span>` : ''}
        </li>
    `).join('')}</ul>`;
}

if (typeof globalThis !== 'undefined') {
    globalThis.templatePreScreenReportPanel = templatePreScreenReportPanel;
    globalThis.templateRiskDrivers = templateRiskDrivers;
    globalThis.templateTopTriggers = templateTopTriggers;
    globalThis.templateImmediateNextSteps = templateImmediateNextSteps;
    globalThis.templateReportList = templateReportList;
    globalThis.templateOfficialSourcesList = templateOfficialSourcesList;
}
