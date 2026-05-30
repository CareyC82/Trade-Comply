/**
 * Dashboard orchestration for Compliance Pre-Screening Report.
 */
'use strict';

function preparePreScreenReportContext(query, tags, cases, precheckSelections) {
    const profile = buildPrecheckProfile(precheckSelections || [], tags || []);
    const direction = AppState.currentDirection || 'export';
    const destination = AppState.currentCountry || 'US';
    const countryApi = globalThis.TradeComplyCountry;
    const destinationLabel = countryApi ? countryApi.getCountryLabel(destination) : destination;
    const directionLabel = direction === 'import' ? t('importTitle') : t('exportTitle');
    const flowLabel = typeof buildFlowLabel === 'function'
        ? buildFlowLabel(direction, destination)
        : `${directionLabel} → ${destinationLabel}`;

    return {
        productQuery: query,
        query,
        tags: tags || [],
        cases: cases || [],
        precheckSelections: precheckSelections || [],
        profile: {
            ...profile,
            selectedAttributeLabels: (precheckSelections || []).map((item) => item.label)
        },
        directionRaw: direction,
        directionLabel,
        destination,
        destinationLabel,
        flowLabel,
        origin: 'CN',
        hsContext: AppState.hsContext || {}
    };
}

function buildPreScreenReportForResults(query, tags, cases, precheckSelections) {
    const api = globalThis.TradeComplyPreScreenReport;
    if (!api?.buildPreScreenReport) {
        return null;
    }
    const context = preparePreScreenReportContext(query, tags, cases, precheckSelections);
    return api.buildPreScreenReport(context);
}

function preparePreScreenReportViewModel(report) {
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
    const riskLevel = String(report.risk_level || 'LOW');
    const riskClass = riskLevel.toLowerCase();

    const missingItems = (report.missing_information || []).map((line) => esc(line));
    const verifyItems = (report.verification_objects || []).map((line) => esc(line));
    const sources = (report.official_sources || []).map((source) => {
        const url = typeof sanitizeUrl === 'function' ? sanitizeUrl(source.url) : esc(source.url);
        const metaParts = [];
        if (source.jurisdiction) {
            metaParts.push(esc(source.jurisdiction));
        }
        if (source.source_type) {
            metaParts.push(esc(String(source.source_type).replace(/_/g, ' ')));
        }
        if (source.tag_id) {
            metaParts.push(esc(source.tag_id));
        }
        return {
            url,
            labelHtml: esc(source.label || source.url),
            metaHtml: metaParts.join(' · ')
        };
    });

    const inputs = report.inputs || {};
    const metaParts = [
        esc(inputs.flow_label || ''),
        report.matched_rule_count != null ? `${report.matched_rule_count} matched rule(s)` : '',
        report.generated_at ? esc(formatReportDate(report.generated_at)) : ''
    ].filter(Boolean);

    const matchedRules = report.matched_rule_count > 0;
    const actionsHtml = matchedRules
        ? `<div class="pre-screen-report__actions">
            <button type="button" class="pre-screen-report__jump-btn" data-psr-jump="result-cards-container">${esc(t('preScreenViewRules'))}</button>
           </div>`
        : '';

    return {
        titleHtml: esc(t('preScreenReportTitle')),
        metaHtml: metaParts.join(' · '),
        riskLabelHtml: esc(t('preScreenRiskLevel')),
        riskLevelHtml: esc(riskLevel),
        riskLevelClass: riskClass,
        executiveSummaryHtml: esc(report.executive_summary || ''),
        triggerTitleHtml: esc(t('preScreenTriggerReason')),
        triggerReasonHtml: esc(report.trigger_reason || ''),
        missingTitleHtml: esc(t('preScreenMissingInfo')),
        missingListHtml: templateReportList(missingItems),
        verifyTitleHtml: esc(t('preScreenVerificationObjects')),
        verifyListHtml: templateReportList(verifyItems),
        sourcesTitleHtml: esc(t('preScreenOfficialSources')),
        sourcesBlockHtml: templateOfficialSourcesList(sources),
        disclaimerTitleHtml: esc(t('preScreenDisclaimerTitle')),
        disclaimerHtml: esc(report.legal_disclaimer || ''),
        actionsHtml
    };
}

function bindPreScreenReportPanel(container) {
    if (!container) {
        return;
    }
    const jumpBtn = container.querySelector('[data-psr-jump]');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const targetId = jumpBtn.getAttribute('data-psr-jump') || 'result-cards-container';
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
}

function renderPreScreenReportPanel(containerId, report) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    if (!report) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }
    const vm = preparePreScreenReportViewModel(report);
    container.innerHTML = templatePreScreenReportPanel(vm);
    container.hidden = false;
    bindPreScreenReportPanel(container);
}

function orchestratePreScreenReport(query, tags, cases, precheckSelections) {
    const report = buildPreScreenReportForResults(query, tags, cases, precheckSelections);
    AppState.preScreenReport = report;
    return report;
}

if (typeof globalThis !== 'undefined') {
    globalThis.preparePreScreenReportContext = preparePreScreenReportContext;
    globalThis.buildPreScreenReportForResults = buildPreScreenReportForResults;
    globalThis.renderPreScreenReportPanel = renderPreScreenReportPanel;
    globalThis.orchestratePreScreenReport = orchestratePreScreenReport;
}
