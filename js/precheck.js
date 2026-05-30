function getRiskRank(risk) {
    return { low: 1, medium: 2, high: 3, review_required: 4 }[risk] || 1;
}

function getRiskLabel(risk) {
    return {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        review_required: 'Review Required'
    }[risk] || 'Low';
}

function inferTagRisk(tag) {
    const text = `${tag.category || ''} ${tag.category_label || ''} ${tag.tag_id || ''} ${tag.description || ''} ${tag.short_description || ''} ${tag.risk_scenarios || ''}`.toLowerCase();
    if (text.includes('dual-use') || text.includes('export control') || text.includes('encryption') || text.includes('uav') || text.includes('infrared') || text.includes('semiconductor')) {
        return 'high';
    }
    if (text.includes('battery') || text.includes('srrc') || text.includes('wireless') || text.includes('ccc')) {
        return 'medium';
    }
    return 'low';
}

function truncateSummaryText(text, maxLength = 100) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 3)}...`;
}

function formatTagHsCodes(tag) {
    const hsCodes = tag.related_hs_codes || [];
    return hsCodes.length ? ` (HS ${hsCodes.join(', ')})` : '';
}

function buildTagNextCheck(tag) {
    const tagId = tag.tag_id;
    if (!tagId) return null;

    const hsPart = formatTagHsCodes(tag);
    const category = tag.category || '';
    const textBlob = `${tag.description || ''} ${tag.short_description || ''} ${tag.risk_scenarios || ''}`.toLowerCase();

    const categoryChecks = {
        COMPULSORY_CERT: `Verify CCC catalog scope and certification status${hsPart} — open card [${tagId}] below and use its Source link.`,
        EXPORT_CTRL: `Confirm export control / dual-use triggers, end-use, end-user, and destination — review card [${tagId}] below and the official Source link.`,
        WIRELESS_TELECOM: `Confirm radio module frequency bands, transmit power, and SRRC approval — see card [${tagId}] below and its Source link.`,
        IMPORT_CONTROL: `Confirm import control or trade remedy requirements — review card [${tagId}] below and open Source.`,
        IMPORT_REG: `Confirm import registration or filing requirements — see card [${tagId}] below and open Source.`,
        TAX_REBATE: `Verify export VAT rebate eligibility and declared HS/customs codes — see card [${tagId}] below.`,
        TAX_INCENTIVE: `Verify tax incentive eligibility and supporting documentation — see card [${tagId}] below.`,
        SUPPLY_CHAIN: `Review supply chain security, origin, and end-user declarations — see card [${tagId}] below.`,
        COMPLIANCE_STD: `Confirm applicable compliance standard or labeling requirements — see card [${tagId}] below.`
    };

    if (categoryChecks[category]) {
        return { text: categoryChecks[category], tagId };
    }

    if (textBlob.includes('battery') || textBlob.includes('lithium') || textBlob.includes('un38')) {
        return {
            text: `Confirm UN38.3 test status, watt-hour rating, packaging, and dangerous goods paperwork — see card [${tagId}] below.`,
            tagId
        };
    }

    if (tag.exemptions) {
        return {
            text: `Check whether exemptions apply (${truncateSummaryText(tag.exemptions, 90)}) — see card [${tagId}] below and Source link.`,
            tagId
        };
    }

    if (tag.risk_scenarios) {
        return {
            text: `Review the listed risk scenario in card [${tagId}] below before shipment.`,
            tagId
        };
    }

    return {
        text: `Open card [${tagId}] below, read the requirement${hsPart}, and follow its Source link to the official reference.`,
        tagId
    };
}

function buildSignalsFromTags(tags) {
    const labels = [];
    const seen = new Set();
    tags.forEach(tag => {
        const label = getTagCategoryLabel(tag);
        if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
        }
    });
    return labels.slice(0, 4);
}

function prioritizeTagsForChecks(tags) {
    return [...tags].sort((a, b) => {
        const typeOrderA = a.tag_type === 'MATCHED' ? 0 : 1;
        const typeOrderB = b.tag_type === 'MATCHED' ? 0 : 1;
        if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
        return (a.display_order || a.order || 999) - (b.display_order || b.order || 999);
    });
}

function buildNextChecksFromProfile(selections, tags) {
    const items = [];
    const seenTexts = new Set();

    const addItem = (text, tagId = null) => {
        const normalized = text.trim();
        if (!normalized || seenTexts.has(normalized)) return;
        seenTexts.add(normalized);
        items.push({ text: normalized, tagId });
    };

    selections.forEach(item => {
        item.nextChecks.forEach(check => {
            addItem(`${check} (from selected attribute: ${item.label})`);
        });
    });

    if (tags.length > 0) {
        addItem(
            `On this page: review the ${tags.length} matched rule card${tags.length === 1 ? '' : 's'} below — each card includes a Source link to the official reference.`
        );

        prioritizeTagsForChecks(tags).slice(0, 3).forEach(tag => {
            const tagCheck = buildTagNextCheck(tag);
            if (tagCheck) addItem(tagCheck.text, tagCheck.tagId);
        });

        addItem(
            'Before shipment: align HS code, product description, end-use/end-user, and consignee details with your commercial invoice, packing list, and customs declaration.'
        );
    } else if (selections.length > 0) {
        addItem('Run a product or HS Code search to pull matched rule cards with official Source links on this page.');
    }

    return items.slice(0, 5);
}

function buildPrecheckProfile(selections, tags) {
    let highestRisk = 'low';
    const signals = new Set();
    let riskReason = '';

    selections.forEach(item => {
        if (getRiskRank(item.risk) > getRiskRank(highestRisk)) {
            highestRisk = item.risk;
        }
        item.signals.forEach(signal => signals.add(signal));
    });

    tags.forEach(tag => {
        const tagRisk = inferTagRisk(tag);
        if (getRiskRank(tagRisk) > getRiskRank(highestRisk)) {
            highestRisk = tagRisk;
        }
    });

    if (highestRisk === 'high' && AppState.currentDirection === 'export') {
        highestRisk = 'review_required';
    }

    if (signals.size === 0 && tags.length > 0) {
        buildSignalsFromTags(tags).forEach(signal => signals.add(signal));
    } else if (signals.size === 0 && selections.length > 0) {
        selections.forEach(item => item.signals.forEach(signal => signals.add(signal)));
    }

    const nextCheckItems = buildNextChecksFromProfile(selections, tags);
    const nextChecks = nextCheckItems.map(item => item.text);

    if (highestRisk === 'review_required') {
        if (tags.some(tag => inferTagRisk(tag) === 'high')) {
            riskReason = 'Elevated because matched rules include export control, encryption, semiconductor, or other high-risk signals for export from China.';
        } else if (selections.some(item => item.risk === 'high')) {
            riskReason = 'Elevated because you selected high-risk product attributes that require professional review before shipment.';
        } else {
            riskReason = 'Elevated because this export screen matched rules that should be verified against official sources before shipment.';
        }
    }

    return {
        risk: highestRisk,
        signals: Array.from(signals),
        nextChecks,
        nextCheckItems,
        riskReason,
        matchedRuleCount: tags.length
    };
}

function formatPrecheckCheckText(text) {
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/\[(CL-[A-Z]+-\d+|CASE-[A-Z0-9-]+)\]/g, (match, id) => {
        const anchorId = id.startsWith('CASE-') ? `case-${id}` : `tag-${id}`;
        return `<a href="#" class="rule-cite" data-citation-id="${anchorId}">${match}</a>`;
    });
    return formatted;
}

function bindPrecheckSummaryActions(container, cardsContainerId = 'result-cards-container') {
    if (!container) return;

    container.querySelectorAll('.rule-cite').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            scrollToCitation(link.dataset.citationId);
        });
    });

    const jumpBtn = container.querySelector('.precheck-jump-btn');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const target = document.getElementById(cardsContainerId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
}

function renderPrecheckSummary(containerId, selections, tags, cardsContainerId = 'result-cards-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if ((!selections || selections.length === 0) && (!tags || tags.length === 0)) {
        container.innerHTML = '';
        return;
    }

    const profile = buildPrecheckProfile(selections || [], tags || []);
    const selectedLabels = (selections || []).map(item => item.label);
    const signalChips = profile.signals.length > 0 ? profile.signals : selectedLabels;
    const checkItems = profile.nextCheckItems || profile.nextChecks.map(text => ({ text }));

    container.innerHTML = `
        <div class="precheck-summary-card collapsible-panel">
            <button type="button" class="precheck-summary-header collapsible-header" aria-expanded="false">
                <span class="precheck-risk-label">Pre-check risk level</span>
                <span class="risk-pill ${escapeHtml(profile.risk)}">${escapeHtml(getRiskLabel(profile.risk))}</span>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
            <div class="precheck-summary-body collapsible-body">
                ${profile.riskReason ? `<div class="precheck-risk-reason">${escapeHtml(profile.riskReason)}</div>` : ''}
                ${signalChips.length > 0 ? `
                    <div class="precheck-chips">
                        ${signalChips.map(signal => `<span class="precheck-chip">${escapeHtml(signal)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="precheck-next">
                    <strong>Recommended next checks:</strong>
                    ${checkItems.length > 0 ? `
                        <ol class="precheck-check-list">
                            ${checkItems.map(item => `<li>${formatPrecheckCheckText(item.text)}</li>`).join('')}
                        </ol>
                    ` : 'Review matched rule cards below and confirm product specifications before relying on this first-pass screen.'}
                </div>
                ${profile.matchedRuleCount > 0 ? `
                    <div class="precheck-summary-actions">
                        <button type="button" class="precheck-jump-btn">View matched rules ↓</button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    bindPrecheckSummaryActions(container, cardsContainerId);
}

function buildAiContext({ productQuery, direction, precheckSelections, tags, cases, profile }) {
    const MAX_TAGS = 8;
    const MAX_CASES = 3;

    return {
        product_query: productQuery || '',
        direction: direction || AppState.currentDirection || 'export',
        precheck_attributes: (precheckSelections || []).map(item => item.id),
        risk_level: profile?.risk || 'low',
        tag_ids: (tags || []).slice(0, MAX_TAGS).map(tag => tag.tag_id).filter(Boolean),
        case_ids: (cases || []).slice(0, MAX_CASES).map(caseItem => caseItem.case_id).filter(Boolean),
        match_count: {
            tags: (tags || []).length,
            cases: (cases || []).length
        }
    };
}

function expandAiContext(baseContext, userQuestion) {
    if (!baseContext || !userQuestion || !userQuestion.trim()) {
        return baseContext;
    }

    const extraResults = search(userQuestion.trim());
    const mergedTagIds = mergeById(
        [
            ...(baseContext.tag_ids || []).map(tagId => ({ tag_id: tagId })),
            ...(extraResults.tags || [])
        ],
        item => item.tag_id
    ).slice(0, 8).map(item => item.tag_id);

    const mergedCaseIds = mergeById(
        [
            ...(baseContext.case_ids || []).map(caseId => ({ case_id: caseId })),
            ...(extraResults.cases || [])
        ],
        item => item.case_id
    ).slice(0, 3).map(item => item.case_id);

    return {
        ...baseContext,
        tag_ids: mergedTagIds,
        case_ids: mergedCaseIds,
        match_count: {
            tags: Math.max(baseContext.match_count?.tags || 0, mergedTagIds.length),
            cases: Math.max(baseContext.match_count?.cases || 0, mergedCaseIds.length)
        },
        expanded: true
    };
}

function createReportPayload(query, tags, cases, precheckSelections) {
    const profile = buildPrecheckProfile(precheckSelections || [], tags || []);
    const trustContext = {
        query,
        direction: AppState.currentDirection,
        tags: tags || [],
        cases: cases || [],
        precheckSelections: precheckSelections || [],
        profile
    };
    const trustBoundary = buildTrustBoundary(trustContext);
    const direction = AppState.currentDirection || 'export';
    const country = AppState.currentCountry || 'US';
    const hs = AppState.hsContext || {};
    const vertical = globalThis.TradeComplyChecklistSegment?.resolveChecklistVertical
        ? globalThis.TradeComplyChecklistSegment.resolveChecklistVertical({
            description: query,
            searchOrigin: AppState.searchOrigin
        })
        : (['electronics', 'new-energy', 'semiconductor'].includes(AppState.searchOrigin)
            ? AppState.searchOrigin
            : 'electronics');
    const checklist = typeof buildComplianceChecklistForResults === 'function'
        ? buildComplianceChecklistForResults(tags, {
            country,
            direction,
            includeBaseline: false,
            productQuery: query,
            vertical
        })
        : [];
    if (typeof buildComplianceChecklistForResults === 'function') {
        AppState.complianceChecklist = checklist;
    }

    const countryApi = globalThis.TradeComplyCountry;
    const counterpartyHsLabel = hs.counterpartyHsLabel
        || (countryApi ? `${countryApi.getCountryLabel(country)} HS` : 'Counterparty HS');

    const preScreenReport = globalThis.TradeComplyPreScreenReport?.buildPreScreenReport
        ? globalThis.TradeComplyPreScreenReport.buildPreScreenReport({
            productQuery: query,
            tags: tags || [],
            cases: cases || [],
            precheckSelections: precheckSelections || [],
            profile: {
                ...profile,
                selectedAttributeLabels: (precheckSelections || []).map((item) => item.label)
            },
            directionRaw: direction,
            directionLabel: direction === 'export' ? t('exportTitle') : t('importTitle'),
            destination: country,
            destinationLabel: countryApi ? countryApi.getCountryLabel(country) : country,
            flowLabel: typeof buildFlowLabel === 'function'
                ? buildFlowLabel(direction, country)
                : `${direction} ${country}`,
            origin: 'CN',
            hsContext: hs
        })
        : null;

    return {
        productQuery: query,
        preScreenReport,
        direction: direction === 'export' ? t('exportTitle') : t('importTitle'),
        directionRaw: direction,
        country,
        countryLabel: countryApi ? countryApi.getCountryLabel(country) : country,
        flowLabel: typeof buildFlowLabel === 'function'
            ? buildFlowLabel(direction, country)
            : `${direction} ${country}`,
        generatedAt: new Date().toISOString(),
        generatedAtLabel: formatReportDate(new Date().toISOString()),
        risk: profile.risk,
        riskLabel: getRiskLabel(profile.risk),
        selectedAttributes: (precheckSelections || []).map(item => item.label),
        signals: profile.signals,
        nextChecks: profile.nextChecks,
        chinaHsCode: hs.chinaCode || '',
        counterpartyHsCode: hs.counterpartyCode || '',
        counterpartyHsLabel,
        officialName: hs.officialName || '',
        checklist: checklist.length
            ? checklist.map((item) => {
                const itemId = String(item.id || item.task || 'checklist-item');
                return {
                    ...item,
                    id: itemId,
                    checked: Boolean(AppState.checklistChecked?.[itemId])
                };
            })
            : (typeof getChecklistForReport === 'function' ? getChecklistForReport() : []),
        vertical,
        riskSummaries: (tags || []).slice(0, 12).map(tag => ({
            type: tag.tag_type || 'CHECK',
            riskLevel: tag.risk_level || 'Medium',
            title: tag.short_name || tag.tag_id || '',
            description: tag.short_description || tag.description || '',
            auditLine: typeof formatReportRiskAuditLine === 'function'
                ? formatReportRiskAuditLine(tag)
                : ''
        })),
        trustBoundaryHtml: buildTrustBoundaryReportHtml(trustBoundary),
        tags: (tags || []).map(tag => ({
            tagId: tag.tag_id || '',
            category: tag.category_label || tag.category || '',
            type: tag.tag_type || '',
            description: tag.description || '',
            shortDescription: tag.short_description || '',
            hsCodes: tag.related_hs_codes || [],
            sourceCitation: tag.source_citation || '',
            sourceUrl: tag.source_url || '',
            exemptions: tag.exemptions || '',
            riskScenarios: tag.risk_scenarios || ''
        }))
    };
}

function formatReportDate(isoString) {
    try {
        return new Intl.DateTimeFormat('en', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(isoString));
    } catch (e) {
        return isoString;
    }
}

function slugifyFilePart(text) {
    return String(text || 'all-products')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'all-products';
}

function buildReportSignalRowsHtml(tags) {
    const cellStyle = 'display:table-cell;border:1px solid #E0E0E0;padding:8px;vertical-align:top;text-align:left;font-size:13px;line-height:1.45;word-wrap:break-word;overflow-wrap:break-word;';
    const headStyle = cellStyle + 'background:#F5F7FA;color:#1A3A5C;font-weight:700;';
    const w = {
        category: 'width:96px;min-width:96px;max-width:96px;',
        rule: 'width:96px;min-width:96px;max-width:96px;',
        desc: 'width:238px;min-width:238px;max-width:238px;',
        hs: 'width:128px;min-width:128px;max-width:128px;',
        source: 'width:136px;min-width:136px;max-width:136px;'
    };

    const header = `
        <div style="display:table-row;">
            <div style="${headStyle}${w.category}">Category</div>
            <div style="${headStyle}${w.rule}">Rule ID</div>
            <div style="${headStyle}${w.desc}">Description</div>
            <div style="${headStyle}${w.hs}">HS Codes</div>
            <div style="${headStyle}${w.source}">Source</div>
        </div>`;

    const rows = (tags || []).map(tag => `
        <div style="display:table-row;">
            <div style="${cellStyle}${w.category}">${escapeHtml(tag.category)}</div>
            <div style="${cellStyle}${w.rule}">${escapeHtml(tag.tagId)}</div>
            <div style="${cellStyle}${w.desc}">${escapeHtml(tag.shortDescription || tag.description)}</div>
            <div style="${cellStyle}${w.hs}">${escapeHtml(tag.hsCodes.join(', ') || 'Not specified')}</div>
            <div style="${cellStyle}${w.source}">${tag.sourceUrl ? `<a href="${sanitizeUrl(tag.sourceUrl)}" style="color:#1A3A5C;text-decoration:underline;">${escapeHtml(tag.sourceCitation || tag.sourceUrl)}</a>` : escapeHtml(tag.sourceCitation || 'Not specified')}</div>
        </div>
    `).join('');

    return header + rows;
}

function buildReportHtml(report) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trade Comply Pre-Check Report</title>
    <style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff !important; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #243447; line-height: 1.55; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-root { width: 794px; padding: 32px; background: #ffffff; }
h1 { color: #1A3A5C; margin: 0 0 4px; font-size: 24px; font-weight: 700; }
h2 { color: #1A3A5C; border-bottom: 1px solid #E0E0E0; padding-bottom: 6px; margin: 28px 0 12px; font-size: 16px; font-weight: 700; }
.meta, .notice { color: #666; font-size: 14px; }
.notice { margin: 8px 0 0; }
.summary { border: 1px solid #E0E0E0; border-left: 5px solid #E8A817; border-radius: 8px; padding: 16px; margin: 20px 0; background: #FFFFFF; page-break-inside: avoid; break-inside: avoid; overflow: hidden; }
.summary p { margin: 0 0 10px; page-break-inside: avoid; break-inside: avoid; }
.summary p:last-child { margin-bottom: 0; }
.risk { display: inline-block; border-radius: 999px; padding: 5px 10px; background: #FDECEC; color: #B42318; font-weight: 700; font-size: 13px; white-space: nowrap; page-break-inside: avoid; break-inside: avoid; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.chip { display: inline-block; border: 1px solid #E0E0E0; border-radius: 999px; padding: 4px 9px; margin: 3px; background: #F5F7FA; font-size: 13px; white-space: nowrap; page-break-inside: avoid; break-inside: avoid; }
.avoid-page-break { page-break-inside: avoid !important; break-inside: avoid !important; }
.signals-table-wrap { width: 694px; margin-top: 10px; }
.signals-table { display: table; width: 694px; border-collapse: collapse; table-layout: fixed; border: 1px solid #E0E0E0; background: #FFFFFF; }
a { color: #1A3A5C; word-break: break-word; }
.trust-boundary-card { border: 1px solid #E0E0E0; border-left: 4px solid #1A3A5C; border-radius: 8px; padding: 16px; margin: 20px 0; background: #FAFBFC; page-break-inside: avoid; break-inside: avoid; overflow: hidden; }
.trust-boundary-title { color: #1A3A5C; font-weight: 700; font-size: 16px; margin: 0 0 4px; }
.trust-boundary-subtitle { color: #666; font-size: 13px; margin: 0 0 4px; line-height: 1.45; }
.trust-boundary-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid #E0E0E0; }
.trust-boundary-section--verify { border-top-color: rgba(26, 58, 92, 0.18); }
.trust-boundary-section-title { color: #1A3A5C; font-size: 14px; font-weight: 700; margin: 0 0 8px; }
.trust-boundary-list { margin: 0; padding-left: 18px; color: #444; font-size: 13px; }
.trust-boundary-list li { margin-bottom: 6px; }
.trust-boundary-list--muted { color: #666; }
.trust-boundary-verify-title { color: #666; font-size: 13px; margin: 8px 0; font-weight: 600; }
.boundary-badge { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
.boundary-badge--verify { background: rgba(26, 58, 92, 0.08); color: #1A3A5C; border-color: rgba(26, 58, 92, 0.18); margin-bottom: 4px; }
.boundary-subsection { margin-top: 10px; }
.boundary-subheading { color: #666; font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.scope-chip { display: inline-block; border: 1px solid #E0E0E0; border-radius: 999px; padding: 3px 8px; margin: 2px; background: #F5F7FA; font-size: 12px; }
    </style>
</head>
<body>
    <div id="report-root" class="report-root">
    <h1>Trade Comply Pre-Check Report</h1>
    <div class="meta">Generated: ${escapeHtml(formatReportDate(report.generatedAt))}</div>
    <div class="notice">Preliminary import/export compliance screening only. This is not legal advice, customs advice, or a substitute for professional review.</div>

    ${report.trustBoundaryHtml || ''}

    <div class="summary avoid-page-break" style="border:1px solid #E0E0E0;border-left:5px solid #E8A817;border-radius:8px;padding:16px;margin:20px 0;background:#FFFFFF;page-break-inside:avoid;break-inside:avoid;overflow:hidden;">
<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Product / Query:</strong> ${escapeHtml(report.productQuery)}</p>
<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Direction:</strong> ${escapeHtml(report.direction)}</p>
<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Pre-check risk level:</strong> <span class="risk" style="display:inline-block;border-radius:999px;padding:5px 10px;background:#FDECEC;color:#B42318;font-weight:700;white-space:nowrap;">${escapeHtml(report.riskLabel)}</span></p>
${report.selectedAttributes.length ? `<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Selected attributes:</strong><br>${report.selectedAttributes.map(item => `<span class="chip" style="display:inline-block;border:1px solid #E0E0E0;border-radius:999px;padding:4px 9px;margin:3px;background:#F5F7FA;white-space:nowrap;">${escapeHtml(item)}</span>`).join('')}</p>` : ''}
${report.signals.length ? `<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Triggered signals:</strong><br>${report.signals.map(item => `<span class="chip" style="display:inline-block;border:1px solid #E0E0E0;border-radius:999px;padding:4px 9px;margin:3px;background:#F5F7FA;white-space:nowrap;">${escapeHtml(item)}</span>`).join('')}</p>` : ''}
${report.nextChecks.length ? `<p style="page-break-inside:avoid;break-inside:avoid;"><strong>Recommended next checks:</strong> ${report.nextChecks.map(escapeHtml).join(' ')}</p>` : ''}
    </div>

    <h2>Matched Compliance Signals</h2>
    ${report.tags.length ? `
    <div class="signals-table-wrap">
        <div class="signals-table" style="display:table;width:694px;border-collapse:collapse;border:1px solid #E0E0E0;background:#FFFFFF;">
            ${buildReportSignalRowsHtml(report.tags)}
        </div>
    </div>` : '<p>No matched compliance signals.</p>'}
    </div>
</body>
</html>`;
}

const HTML2PDF_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
let html2PdfLoaderPromise = null;

function loadHtml2Pdf() {
    if (window.html2pdf) {
        return Promise.resolve(window.html2pdf);
    }
    if (!html2PdfLoaderPromise) {
        html2PdfLoaderPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = HTML2PDF_URL;
            script.async = true;
            script.onload = () => {
                if (window.html2pdf) {
                    resolve(window.html2pdf);
                    return;
                }
                reject(new Error('html2pdf failed to load'));
            };
            script.onerror = () => reject(new Error('html2pdf script unavailable'));
            document.head.appendChild(script);
        });
    }
    return html2PdfLoaderPromise;
}

function waitForReportFrame(iframe) {
    return new Promise((resolve) => {
        const finish = () => {
            const doc = iframe.contentDocument;
            const root = doc.getElementById('report-root');
            if (!root) {
                resolve({ root: doc.body, contentHeight: doc.body.scrollHeight });
                return;
            }
            const contentHeight = root.scrollHeight;
            iframe.style.width = '794px';
            iframe.style.height = `${contentHeight}px`;
            resolve({ root, contentHeight });
        };
        if (iframe.contentDocument?.readyState === 'complete') {
            setTimeout(finish, 200);
            return;
        }
        iframe.addEventListener('load', () => setTimeout(finish, 200), { once: true });
    });
}

function createReportRenderFrame(report) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:794px;height:600px;border:0;opacity:0;pointer-events:none;z-index:-1;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(buildReportHtml(report));
    doc.close();
    return waitForReportFrame(iframe).then(({ root, contentHeight }) => ({ iframe, root, contentHeight }));
}

function downloadPrecheckReport() {
    if (!AppState.lastReport) {
        return;
    }

    const btn = document.getElementById('download-report-btn');
    const originalLabel = btn?.textContent || 'Download Pre-Check Report (Print / PDF)';

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Opening print preview…';
    }

    try {
        const report = typeof buildEnterpriseReportForPrint === 'function'
            ? buildEnterpriseReportForPrint({
                ...AppState.lastReport,
                generatedAtLabel: formatReportDate(AppState.lastReport.generatedAt)
            })
            : {
                ...AppState.lastReport,
                checklist: typeof getChecklistForReport === 'function'
                    ? getChecklistForReport()
                    : AppState.lastReport.checklist,
                generatedAtLabel: formatReportDate(AppState.lastReport.generatedAt)
            };

        if (typeof printEnterprisePrecheckReport === 'function') {
            printEnterprisePrecheckReport(report);
        }
    } catch (error) {
        console.error('Print report failed:', error);
        window.alert('Could not open the print report. Please try again.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    }
}
