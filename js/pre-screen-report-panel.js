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
    const inputs = report.inputs || {};
    const matchedCount = Number(report.matched_rule_count || 0);

    const cleanActionText = (line) => String(line || '')
        .replace(/\s*\(from selected attribute:[^)]+\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const actionPlan = (Array.isArray(report.action_plan) && report.action_plan.length
        ? report.action_plan
        : [
            ...(report.missing_information || []).slice(0, 4).map((task) => ({
                priority: 'critical',
                phase: 'Before shipment',
                task: cleanActionText(task),
                detail: 'Resolve this before relying on this screen.'
            })),
            ...(report.verification_objects || []).slice(0, 4).map((task) => ({
                priority: 'recommended',
                phase: 'Verification pack',
                task: cleanActionText(task),
                detail: 'Keep this in the review pack for broker or counsel review.'
            }))
        ].filter((item) => item.task))
        .slice(0, 3);

    const topTriggers = (report.top_triggers || []).slice(0, 3).map((trigger) => ({
        titleHtml: esc(trigger.title || trigger.tag_id || 'Matched rule'),
        detailHtml: esc(trigger.detail || ''),
        metaHtml: [trigger.jurisdiction, trigger.tag_id].filter(Boolean).map(esc).join(' · ')
    }));

    const iconForDriver = (label) => {
        const text = String(label || '').toLowerCase();
        if (text.includes('chip') || text.includes('gpu') || text.includes('comput')) return '◉';
        if (text.includes('semiconductor') || text.includes('manufactur')) return '◆';
        if (text.includes('encrypt') || text.includes('secure') || text.includes('vpn')) return '⌁';
        if (text.includes('end') || text.includes('entity') || text.includes('party')) return '!';
        if (text.includes('uav') || text.includes('drone')) return '⌖';
        if (text.includes('battery')) return '▣';
        return '•';
    };

    const riskDrivers = (report.risk_drivers || [])
        .slice(0, 6)
        .map((driver) => ({
            iconHtml: esc(iconForDriver(driver.label || driver)),
            labelHtml: esc(driver.label || driver)
        }));

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

    const metaParts = [
        esc(inputs.flow_label || ''),
        report.matched_rule_count != null ? `${matchedCount} matched rule(s)` : '',
        report.generated_at ? esc(formatReportDate(report.generated_at)) : ''
    ].filter(Boolean);

    const matchedRules = report.matched_rule_count > 0;
    const sourceLabels = [...new Set(sources.map((source) => source.labelHtml))]
        .slice(0, 4)
        .join(' · ');
    const primaryTrigger = topTriggers[0]?.titleHtml || (matchedRules ? 'matched compliance controls' : 'no direct rule match');
    const riskSentence = matchedRules
        ? `This screen indicates ${riskLevel.toLowerCase()} pre-check risk for ${esc(inputs.product_query || 'this product')} on ${esc(inputs.flow_label || 'the selected trade flow')}, mainly driven by ${primaryTrigger}.`
        : `No direct rule match was found for ${esc(inputs.product_query || 'this product')}. This is not a clearance to ship.`;

    return {
        titleHtml: esc(t('preScreenReportTitle')),
        metaHtml: metaParts.join(' · '),
        riskLabelHtml: esc(t('preScreenRiskLevel')),
        riskLevelHtml: esc(riskLevel),
        riskLevelClass: riskClass,
        riskToneHtml: esc(resolveRiskTone(riskLevel)),
        riskSentenceHtml: riskSentence,
        matchedCountHtml: esc(String(matchedCount)),
        topTriggersHtml: templateTopTriggers(topTriggers),
        riskDriversHtml: templateRiskDrivers(riskDrivers),
        actionPlanHtml: templateImmediateNextSteps(actionPlan.map((item) => ({
            phaseHtml: esc(item.phase || ''),
            priorityHtml: esc(item.priority || 'recommended'),
            taskHtml: esc(cleanActionText(item.task)),
            detailHtml: esc(item.detail || '')
        }))),
        executiveSummaryHtml: esc(report.executive_summary || ''),
        triggerTitleHtml: esc(t('preScreenTriggerReason')),
        triggerReasonHtml: esc(report.trigger_reason || ''),
        missingTitleHtml: esc(t('preScreenMissingInfo')),
        missingListHtml: templateReportList((report.missing_information || []).map((line) => esc(cleanActionText(line)))),
        verifyTitleHtml: esc(t('preScreenVerificationObjects')),
        verifyListHtml: templateReportList((report.verification_objects || []).map((line) => esc(cleanActionText(line)))),
        sourcesTitleHtml: esc(t('preScreenOfficialSources')),
        sourceCountHtml: esc(String(sources.length)),
        sourceSummaryHtml: sourceLabels || esc('No official source URLs attached yet.'),
        sourcesBlockHtml: templateOfficialSourcesList(sources),
        disclaimerTitleHtml: esc(t('preScreenDisclaimerTitle')),
        disclaimerHtml: esc(report.legal_disclaimer || ''),
        scopeNoteHtml: esc('Scope note: This is a pre-screen only. It does not verify final HS classification, customs rulings, end-use declarations, restricted-party status, carrier acceptance, or shipment approval.')
    };
}

function bindPreScreenReportPanel(container) {
    if (!container) {
        return;
    }
}

function resolveRiskTone(riskLevel) {
    const normalized = String(riskLevel || '').toUpperCase();
    if (normalized === 'CRITICAL') return 'Stop / legal review required';
    if (normalized === 'HIGH') return 'Review before shipment';
    if (normalized === 'MEDIUM') return 'Check required';
    return 'No major signal found';
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
