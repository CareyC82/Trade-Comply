/**
 * View-model preparation for search results (filtering & mapping before templates).
 */
'use strict';

const BROWSE_QUERY_LABELS = () => [
    t('allProducts'),
    t('allCases'),
    t('semiconductorProducts'),
    t('newEnergyProducts'),
    'Semiconductor products',
    'semiconductor products'
];

function isBrowseAllQuery(query) {
    const normalized = (query || '').trim().toLowerCase();
    if (!normalized) {
        return true;
    }
    return BROWSE_QUERY_LABELS().some((label) => label && label.toLowerCase() === normalized);
}

function resolveCasesForMatchedTags(tags, cases, query = '') {
    const direction = AppState.currentDirection || 'export';
    const allCases = AppState.data?.cases || [];
    let resolved = Array.isArray(cases) ? [...cases] : [];
    const enrichApi = globalThis.TradeComplyMatchedResults;
    if (enrichApi?.collectCasesForMatchedTags && enrichApi?.mergeCasesById) {
        const linked = enrichApi.collectCasesForMatchedTags(tags, allCases, direction, query);
        resolved = enrichApi.mergeCasesById(resolved, linked);
        if (enrichApi.filterCasesByQueryRelevance) {
            resolved = enrichApi.filterCasesByQueryRelevance(resolved, query);
        }
        return enrichApi.filterCasesForMatchedTags
            ? enrichApi.filterCasesForMatchedTags(resolved, tags)
            : resolved;
    }

    const tagIds = new Set((tags || []).map((tag) => tag?.tag_id).filter(Boolean));
    const byId = new Map();
    resolved.forEach((caseItem) => {
        if (caseItem?.case_id) {
            byId.set(caseItem.case_id, caseItem);
        }
    });
    allCases.forEach((caseItem) => {
        if (!caseItem?.case_id) {
            return;
        }
        const caseDirection = caseItem.direction || 'both';
        if (caseDirection !== 'both' && caseDirection !== direction) {
            return;
        }
        const linkedByTag = (caseItem.related_tags || []).some((id) => tagIds.has(id));
        if (linkedByTag) {
            byId.set(caseItem.case_id, caseItem);
        }
    });
    (tags || []).forEach((tag) => {
        (tag.related_cases || []).forEach((caseId) => {
            const caseItem = allCases.find((c) => c.case_id === caseId);
            if (!caseItem) {
                return;
            }
            const caseDirection = caseItem.direction || 'both';
            if (caseDirection === 'both' || caseDirection === direction) {
                byId.set(caseItem.case_id, caseItem);
            }
        });
    });
    resolved = [...byId.values()];
    if (enrichApi?.filterCasesByQueryRelevance) {
        resolved = enrichApi.filterCasesByQueryRelevance(resolved, query);
    }
    return enrichApi?.filterCasesForMatchedTags
        ? enrichApi.filterCasesForMatchedTags(resolved, tags)
        : resolved;
}

function applyCountryFilterToResults(tags, cases) {
    if (typeof applyCountryFilterToSearchResults !== 'function') {
        return { tags, cases };
    }
    return applyCountryFilterToSearchResults({ tags, cases });
}

function groupTagsByCategory(tags, context = {}) {
    return tags.reduce((acc, tag) => {
        const categoryLabel = getTagCategoryLabel(tag, context);
        if (!acc[categoryLabel]) {
            acc[categoryLabel] = {
                category: categoryLabel,
                categoryCode: tag.category || 'OTHER',
                tags: []
            };
        }
        acc[categoryLabel].tags.push(tag);
        return acc;
    }, {});
}

function prepareCountryContext(selectedCountry, direction) {
    const countryApi = globalThis.TradeComplyCountry;
    const selectedCountryLabel = countryApi
        ? countryApi.getCountryLabel(selectedCountry)
        : selectedCountry;
    const roleLabel = countryApi
        ? countryApi.getCounterpartyRoleLabel(direction)
        : (direction === 'import' ? 'origin' : 'destination');
    return { selectedCountryLabel, roleLabel };
}

function prepareResultSummaryViewModel(query, tagCount, context) {
    const route = context.routeContext;
    if (route?.fromLabel && route?.toLabel) {
        const isExportFocus = route.focus === 'export';
        return {
            routeLineHtml: escapeHtml(isExportFocus
                ? `Export from ${route.fromLabel} to ${route.toLabel}`
                : `Import into ${route.toLabel} from ${route.fromLabel}`),
            directionTextHtml: escapeHtml(isExportFocus ? `Export from ${route.fromLabel}` : `Import into ${route.toLabel}`),
            countryLabelHtml: escapeHtml(isExportFocus ? route.toLabel : route.fromLabel),
            foundRegulationsHtml: escapeHtml(t('foundRegulations')),
            tagCount,
            regulationsForHtml: escapeHtml(t('regulationsFor')),
            queryHtml: escapeHtml(query),
            roleFocusHtml: escapeHtml(isExportFocus ? 'origin export focus' : 'destination import focus')
        };
    }
    const directionText = context.direction === 'export' ? t('exportTitle') : t('importTitle');
    return {
        directionTextHtml: escapeHtml(directionText),
        countryLabelHtml: escapeHtml(context.selectedCountryLabel),
        foundRegulationsHtml: escapeHtml(t('foundRegulations')),
        tagCount,
        regulationsForHtml: escapeHtml(t('regulationsFor')),
        queryHtml: escapeHtml(query),
        roleFocusHtml: escapeHtml(t('resultRoleFocus', { role: context.roleLabel }))
    };
}

function prepareAiQuerySectionViewModel(matchedRuleCount) {
    const note = matchedRuleCount > 0
        ? escapeHtml(t('aiBasedOnRules', { count: matchedRuleCount }))
        : escapeHtml(t('aiNoRulesExploratory'));
    const placeholder = matchedRuleCount > 0
        ? t('askAiPlaceholder')
        : t('askAiPlaceholderNoRules');
    return {
        noteHtml: note,
        placeholderHtml: escapeHtml(placeholder),
        assistantLabelHtml: escapeHtml(t('askAiAssistant'))
    };
}

function prepareEmptyResultsViewModel(query, precheckSelections) {
    const isOutOfRange = !checkSearchRange(query) && precheckSelections.length === 0;
    return {
        variant: isOutOfRange ? 'out_of_range' : 'no_results',
        messageHtml: escapeHtml(isOutOfRange ? t('outOfRange') : t('noResults'))
    };
}

function prepareComplianceCardViewModel(tag, context) {
    const { selectedCountry, direction } = context;
    const countryMeta = typeof buildTagCountryDisplayMeta === 'function'
        ? buildTagCountryDisplayMeta(tag, selectedCountry, direction)
        : { badgeCode: 'CN', badgeClass: 'cn', scopeLine: '', isExact: false, isBaseline: true, matchRibbon: '' };

    const tagTypeRaw = tag.tag_type || 'Unknown';
    const tagTypeClass = String(tagTypeRaw).toLowerCase();
    const shortTagId = tag.tag_id ? tag.tag_id.replace(/^CL-|-[0-9]+$/g, '') : '';
    const isGlobalPolicy = typeof isGlobalPolicyTag === 'function' && isGlobalPolicyTag(tag);

    const hsCodes = tag.hs_code
        ? escapeHtml(tag.hs_code)
        : (tag.related_hs_codes?.length
            ? escapeHtml(tag.related_hs_codes.join(', '))
            : escapeHtml(t('hsNotSpecified')));

    const cardHintText = tag.short_description || tag.content_en || '';
    const scopeLine = countryMeta.scopeLine || '';

    let riskBadgeHtml = '';
    if (tag.risk_level) {
        riskBadgeHtml = templateRiskLevelBadge({
            riskLevelClass: String(tag.risk_level).toLowerCase(),
            riskLevelHtml: escapeHtml(tag.risk_level)
        });
    }

    let scopePillHtml = '';
    if (scopeLine) {
        scopePillHtml = templateCountryScopePill({ scopeLineHtml: escapeHtml(scopeLine) });
    }

    let cardHintHtml = '';
    if (cardHintText) {
        cardHintHtml = templateComplianceCardHeaderHint({ hintHtml: escapeHtml(cardHintText) });
    }

    let exemptionsHtml = '';
    if (tag.exemptions) {
        exemptionsHtml = templateComplianceExemptions({
            labelHtml: escapeHtml(t('exemptionsLabel')),
            valueHtml: escapeHtml(tag.exemptions)
        });
    }

    let riskScenariosHtml = '';
    if (tag.risk_scenarios) {
        riskScenariosHtml = templateComplianceRiskScenarios({
            labelHtml: escapeHtml(t('riskScenariosLabel')),
            valueHtml: escapeHtml(tag.risk_scenarios)
        });
    }

    let esgEvidenceHtml = '';
    const isGreenCompliance = tag.category === 'ENVIRONMENT_BATTERY'
        || getDisplayCategoryLabel(tag.category_label || tag.category, tag.category) === 'Green Compliance & ESG';
    if (isGreenCompliance && typeof templateComplianceEsgEvidence === 'function') {
        const checklistTasks = Array.isArray(tag.checklist)
            ? tag.checklist.map((item) => item.task).filter(Boolean).slice(0, 2)
            : [];
        const evidenceText = checklistTasks.length
            ? checklistTasks.join('; ')
            : 'Keep recycling, take-back, battery, labeling, importer, and customer evidence with the file.';
        esgEvidenceHtml = templateComplianceEsgEvidence({
            labelHtml: escapeHtml('ESG evidence'),
            valueHtml: escapeHtml(evidenceText)
        });
    }

    let legacySourceHtml = '';
    if (!isGlobalPolicy && tag.source_citation) {
        legacySourceHtml = templateComplianceLegacySource({
            sourceLabelHtml: escapeHtml(t('source')),
            sourceUrl: sanitizeUrl(tag.source_url),
            sourceCitationHtml: escapeHtml(tag.source_citation)
        });
    }

    const cardClasses = [
        'compliance-card',
        'collapsible-panel',
        tagTypeClass,
        countryMeta.isExact ? 'country-match-highlight' : '',
        countryMeta.isBaseline ? 'country-baseline-rule' : ''
    ].filter(Boolean).join(' ');

    return {
        domId: tag.tag_id ? `tag-${tag.tag_id}` : '',
        cardClasses,
        matchRibbonHtml: typeof buildMatchRibbonHtml === 'function' ? (buildMatchRibbonHtml(countryMeta) || '') : '',
        tagTypeClass,
        tagTypeLabelHtml: escapeHtml(tagTypeRaw),
        riskBadgeHtml,
        regulatoryBadgeHtml: isGlobalPolicy && typeof buildRegulatoryBodyBadgeHtml === 'function'
            ? (buildRegulatoryBodyBadgeHtml(tag) || '')
            : '',
        countryCodeBadgeHtml: typeof buildCountryBadgeHtml === 'function'
            ? (buildCountryBadgeHtml(countryMeta) || '')
            : '',
        cardLabelHtml: escapeHtml(tag.short_name || shortTagId || tag.tag_id || 'Rule'),
        scopePillHtml,
        cardHintHtml,
        auditTrailHtml: isGlobalPolicy && typeof buildGlobalPolicyAuditTrailHtml === 'function'
            ? (buildGlobalPolicyAuditTrailHtml(tag) || '')
            : '',
        bodyTitleHtml: `${escapeHtml(shortTagId)}: ${escapeHtml(tag.description || '')}`,
        bodyDescHtml: escapeHtml(tag.short_description || tag.description || t('cardNoDetails')),
        esgEvidenceHtml,
        exemptionsHtml,
        riskScenariosHtml,
        hsCodeLabelHtml: escapeHtml(t('hsCode')),
        hsCodesHtml: hsCodes,
        legacySourceHtml
    };
}

function prepareCategoryGroupViewModel(group, context) {
    const theme = getCategoryTheme(group.categoryCode, group.category);
    const ruleCount = group.tags.length;
    return {
        groupClass: `result-category-group category-group collapsible-panel result-category-group--${theme.class}`,
        shell: {
            themeIcon: theme.icon,
            categoryLabelHtml: escapeHtml(group.category),
            ruleCount,
            ruleCountLabelHtml: escapeHtml(ruleCount === 1 ? t('ruleCountSingular') : t('ruleCountPlural'))
        },
        cards: group.tags.map((tag) => prepareComplianceCardViewModel(tag, context))
    };
}

function prepareCaseCardViewModel(caseItem) {
    const caseDomId = caseItem.case_id ? `case-${escapeHtml(caseItem.case_id)}` : '';
    return {
        caseDomId,
        titleHtml: escapeHtml(caseItem.title || ''),
        dateHtml: escapeHtml(caseItem.date || ''),
        summaryHtml: escapeHtml(caseItem.summary || ''),
        sourceUrl: sanitizeUrl(caseItem.source_url),
        sourceLinkLabelHtml: escapeHtml(t('source')),
        sourceUrlDisplayHtml: escapeHtml(caseItem.source_url || '')
    };
}

function prepareCasesGroupViewModel(cases) {
    const caseCount = cases.length;
    return {
        groupTitleHtml: escapeHtml(t('relatedCases')),
        caseCount,
        caseCountLabelHtml: escapeHtml(caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural')),
        caseCardsHtml: cases.map((caseItem) => templateCaseCard(prepareCaseCardViewModel(caseItem))).join('')
    };
}

/**
 * Full results screen view model (filtering and mapping only).
 */
function prepareResultsViewModel(query, tags, cases, precheckSelections = []) {
    const direction = AppState.currentDirection || 'export';
    const selectedCountry = AppState.currentCountry || 'US';
    cases = resolveCasesForMatchedTags(tags, cases, query);
    const filtered = applyCountryFilterToResults(tags, cases);
    tags = filtered.tags;
    cases = filtered.cases;

    const countryContext = prepareCountryContext(selectedCountry, direction);
    const routeContext = globalThis.TradeComplyCountry?.getRouteContext
        ? globalThis.TradeComplyCountry.getRouteContext({
            from: AppState.routeFromCountry || 'CN',
            to: AppState.routeToCountry || selectedCountry || 'US',
            focus: AppState.complianceFocus || 'import'
        })
        : null;
    const renderContext = { selectedCountry, direction, routeContext, ...countryContext };
    const precheckProfile = buildPrecheckProfile(precheckSelections, tags);
    const browseAll = isBrowseAllQuery(query);
    const showPolicyCorrection = !browseAll;
    const policyCorrectionVariant = tags.length === 0 ? 'no_match' : 'has_results';

    const grouped = groupTagsByCategory(tags, renderContext);
    const categoryGroups = Object.values(grouped).map((group) => prepareCategoryGroupViewModel(group, renderContext));

    return {
        query,
        tags,
        cases,
        precheckSelections,
        precheckProfile,
        direction,
        selectedCountry,
        renderContext,
        resultSummary: prepareResultSummaryViewModel(query, tags.length, { direction, routeContext, ...countryContext }),
        aiQuerySection: prepareAiQuerySectionViewModel(tags.length),
        showAiAssistant: !browseAll || precheckSelections.length > 0,
        showPolicyCorrection,
        policyCorrectionVariant,
        showResultFeedback: tags.length === 0,
        emptyResults: tags.length === 0 ? prepareEmptyResultsViewModel(query, precheckSelections) : null,
        categoryGroups,
        casesGroup: cases.length > 0 ? prepareCasesGroupViewModel(cases) : null,
        reportPayload: () => createReportPayload(query, tags, cases, precheckSelections),
        aiContext: () => buildAiContext({
            productQuery: query,
            direction: AppState.currentDirection,
            routeContext,
            precheckSelections,
            tags,
            cases,
            profile: precheckProfile
        }),
        checklistOptions: {
            country: selectedCountry,
            direction,
            includeBaseline: false,
            productQuery: query,
            vertical: ['electronics', 'new-energy', 'semiconductor', 'data-center', 'industrial-automation', 'healthcare-lab'].includes(AppState.searchOrigin)
                ? AppState.searchOrigin
                : undefined
        }
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.isBrowseAllQuery = isBrowseAllQuery;
    globalThis.resolveCasesForMatchedTags = resolveCasesForMatchedTags;
    globalThis.prepareResultsViewModel = prepareResultsViewModel;
    globalThis.prepareAiQuerySectionViewModel = prepareAiQuerySectionViewModel;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isBrowseAllQuery,
        resolveCasesForMatchedTags,
        groupTagsByCategory,
        prepareResultsViewModel,
        prepareAiQuerySectionViewModel
    };
}
