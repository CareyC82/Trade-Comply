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
        <div class="precheck-summary-card">
            <div class="precheck-summary-top">
                <div class="precheck-risk-label">Pre-check risk level</div>
                <span class="risk-pill ${escapeHtml(profile.risk)}">${escapeHtml(getRiskLabel(profile.risk))}</span>
            </div>
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
    return {
        productQuery: query,
        direction: AppState.currentDirection === 'export' ? t('exportTitle') : t('importTitle'),
        generatedAt: new Date().toISOString(),
        risk: profile.risk,
        riskLabel: getRiskLabel(profile.risk),
        selectedAttributes: (precheckSelections || []).map(item => item.label),
        signals: profile.signals,
        nextChecks: profile.nextChecks,
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
        })),
        cases: (cases || []).map(caseItem => ({
            title: caseItem.title || '',
            date: caseItem.date || '',
            summary: caseItem.summary || '',
            sourceUrl: caseItem.source_url || ''
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

function buildReportHtml(report) {
    const tagRows = report.tags.map(tag => `
        <tr>
            <td>${escapeHtml(tag.category)}</td>
            <td>${escapeHtml(tag.tagId)}</td>
            <td>${escapeHtml(tag.shortDescription || tag.description)}</td>
            <td>${escapeHtml(tag.hsCodes.join(', ') || 'Not specified')}</td>
            <td>${tag.sourceUrl ? `<a href="${sanitizeUrl(tag.sourceUrl)}">${escapeHtml(tag.sourceCitation || tag.sourceUrl)}</a>` : escapeHtml(tag.sourceCitation || 'Not specified')}</td>
        </tr>
    `).join('');

    const caseRows = report.cases.map(caseItem => `
        <tr>
            <td>${escapeHtml(caseItem.date)}</td>
            <td>${escapeHtml(caseItem.title)}</td>
            <td>${escapeHtml(caseItem.summary)}</td>
            <td>${caseItem.sourceUrl ? `<a href="${sanitizeUrl(caseItem.sourceUrl)}">${escapeHtml(caseItem.sourceUrl)}</a>` : 'Not specified'}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trade Comply Pre-Check Report</title>
    <style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #243447; margin: 32px; line-height: 1.55; }
h1 { color: #1A3A5C; margin-bottom: 4px; }
h2 { color: #1A3A5C; border-bottom: 1px solid #E0E0E0; padding-bottom: 6px; margin-top: 28px; }
.meta, .notice { color: #666; font-size: 14px; }
.summary { border: 1px solid #E0E0E0; border-left: 5px solid #E8A817; border-radius: 8px; padding: 16px; margin: 20px 0; }
.risk { display: inline-block; border-radius: 999px; padding: 5px 10px; background: #FDECEC; color: #B42318; font-weight: 700; }
.chip { display: inline-block; border: 1px solid #E0E0E0; border-radius: 999px; padding: 4px 9px; margin: 3px; background: #F5F7FA; font-size: 13px; }
table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 13px; }
th, td { border: 1px solid #E0E0E0; padding: 8px; vertical-align: top; text-align: left; }
th { background: #F5F7FA; color: #1A3A5C; }
a { color: #1A3A5C; }
@media print { body { margin: 18mm; } }
    </style>
</head>
<body>
    <h1>Trade Comply Pre-Check Report</h1>
    <div class="meta">Generated: ${escapeHtml(formatReportDate(report.generatedAt))}</div>
    <div class="notice">Preliminary import/export compliance screening only. This is not legal advice, customs advice, or a substitute for professional review.</div>

    <div class="summary">
<p><strong>Product / Query:</strong> ${escapeHtml(report.productQuery)}</p>
<p><strong>Direction:</strong> ${escapeHtml(report.direction)}</p>
<p><strong>Pre-check risk level:</strong> <span class="risk">${escapeHtml(report.riskLabel)}</span></p>
${report.selectedAttributes.length ? `<p><strong>Selected attributes:</strong><br>${report.selectedAttributes.map(item => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</p>` : ''}
${report.signals.length ? `<p><strong>Triggered signals:</strong><br>${report.signals.map(item => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</p>` : ''}
${report.nextChecks.length ? `<p><strong>Recommended next checks:</strong> ${report.nextChecks.map(escapeHtml).join(' ')}</p>` : ''}
    </div>

    <h2>Matched Compliance Signals</h2>
    ${report.tags.length ? `<table><thead><tr><th>Category</th><th>Rule ID</th><th>Description</th><th>HS Codes</th><th>Source</th></tr></thead><tbody>${tagRows}</tbody></table>` : '<p>No matched compliance signals.</p>'}

    <h2>Related Penalty Cases</h2>
    ${report.cases.length ? `<table><thead><tr><th>Date</th><th>Case</th><th>Summary</th><th>Source</th></tr></thead><tbody>${caseRows}</tbody></table>` : '<p>No related penalty cases found.</p>'}
</body>
</html>`;
}

function downloadPrecheckReport() {
    if (!AppState.lastReport) return;
    const html = buildReportHtml(AppState.lastReport);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trade-comply-precheck-${slugifyFilePart(AppState.lastReport.productQuery)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
