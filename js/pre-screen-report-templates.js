/**
 * HTML templates for Compliance Pre-Screening Report panel.
 */
'use strict';

function templatePreScreenReportPanel(vm) {
    return `
        <article class="pre-screen-report collapsible-panel" aria-label="${vm.titleHtml}">
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
                <p class="pre-screen-report__executive">${vm.executiveSummaryHtml}</p>
                <section class="pre-screen-report__section">
                    <h3 class="pre-screen-report__section-title">${vm.triggerTitleHtml}</h3>
                    <p class="pre-screen-report__prose">${vm.triggerReasonHtml}</p>
                </section>
                <section class="pre-screen-report__section">
                    <h3 class="pre-screen-report__section-title">${vm.missingTitleHtml}</h3>
                    ${vm.missingListHtml}
                </section>
                <section class="pre-screen-report__section">
                    <h3 class="pre-screen-report__section-title">${vm.verifyTitleHtml}</h3>
                    ${vm.verifyListHtml}
                </section>
                <section class="pre-screen-report__section">
                    <h3 class="pre-screen-report__section-title">${vm.sourcesTitleHtml}</h3>
                    ${vm.sourcesBlockHtml}
                </section>
                <footer class="pre-screen-report__disclaimer">
                    <h3 class="pre-screen-report__section-title">${vm.disclaimerTitleHtml}</h3>
                    <p class="pre-screen-report__disclaimer-text">${vm.disclaimerHtml}</p>
                </footer>
                ${vm.actionsHtml}
            </div>
        </article>
    `;
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
    globalThis.templateReportList = templateReportList;
    globalThis.templateOfficialSourcesList = templateOfficialSourcesList;
}
