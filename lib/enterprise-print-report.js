/**
 * Enterprise PDF / print report — executive summary, print-safe layout, global print gateway.
 * PRODUCTION MASTER VERSION - Hard-aligned ID states and tightened A4 height to prevent overflow splits.
 */
'use strict';

const PHASE_PRINT_LABELS = {
    technical: 'Technical',
    environmental: 'Environmental',
    documentation: 'Documentation',
    other: 'Other'
};

const NEW_ENERGY_EXECUTIVE_SUMMARY =
    'This cross-border trade flow triggers automated Medium-Risk flags under international IATA and local customs dangerous goods frameworks. Immediate action is required to secure qualified carrier dangerous goods approval and UN38.3 certification packs prior to air-freight logistics dispatch.';

const SEMICONDUCTOR_EXECUTIVE_SUMMARY =
    'This trade flow triggers sensitive export control verification procedures. Compliance audit required for BIS ECCN classifications, Entity List restrictions, and end-user screening controls before cargo booking.';

const ELECTRONICS_EXECUTIVE_SUMMARY =
    'Preliminary tracking indicates product safety regulations apply. Ensure target jurisdiction wireless (FCC/CE), environmental substance barriers, and standard commercial clearance invoicing are aligned.';

const DEFAULT_EXECUTIVE_SUMMARY =
    'Preliminary compliance screening completed. Please review the industry-specific regulatory risks and complete the actionable verification checklist below before cargo booking.';

const NEW_ENERGY_SUMMARY_QUERY_RE =
    /lithium|battery|air[- ]?freight|iata|un38|dangerous goods|energy storage|pv module|inverter/i;

function getReportQueryText(report = {}) {
    return sanitizePrintCellText([
        report.productQuery,
        report.query,
        report.officialName,
        report.description
    ].filter(Boolean).join(' ')).toLowerCase();
}

function inferLithiumBatteryTransportCode(report = {}) {
    const text = getReportQueryText(report);
    if (!/lithium|battery|un38|iata|dangerous goods/.test(text)) {
        return null;
    }
    const isMetal = /lithium metal|metal battery|button cell|coin cell/.test(text);
    const isEquipment = /equipment|device|apparatus|machine|contained in|installed in|packed with|with equipment|inside/.test(text);
    const isStandalone = /standalone|spare|loose|cell only|battery only|batteries only|pack only|un3480|un3090/.test(text)
        && !/un3481|un3091/.test(text);

    if (isMetal) {
        return isEquipment && !isStandalone ? 'UN3091' : 'UN3090';
    }
    return isEquipment && !isStandalone ? 'UN3481' : 'UN3480';
}

function buildLithiumBatteryTransportNote(report = {}) {
    const code = inferLithiumBatteryTransportCode(report);
    if (!code) {
        return '';
    }
    const codeLabel = {
        UN3480: 'lithium ion batteries shipped alone',
        UN3481: 'lithium ion batteries packed with or contained in equipment',
        UN3090: 'lithium metal batteries shipped alone',
        UN3091: 'lithium metal batteries packed with or contained in equipment'
    }[code] || 'lithium battery shipment';
    return `Likely dangerous-goods classification: ${code} (${codeLabel}). Confirm chemistry, Wh rating, SOC limits, package instruction, marks/labels, and whether a Shipper's Declaration is required under IATA DGR.`;
}

function inferDefaultOfficialSource(card = {}, report = {}) {
    const text = `${getReportQueryText(report)} ${sanitizePrintCellText(card.description || card.title || '')}`.toLowerCase();
    if (/iata|air[- ]?freight|air transport|un348|un309|un38|lithium|battery/.test(text)) {
        return {
            label: 'IATA lithium battery guidance',
            url: 'https://www.iata.org/en/programs/cargo/dgr/lithium-batteries/'
        };
    }
    return null;
}

function resolveRiskCardSource(card = {}, report = {}) {
    const explicitUrl = String(card.sourceUrl || card.source_url || '').trim();
    const explicitLabel = sanitizePrintCellText(card.sourceLabel || card.sourceCitation || card.sourceName || card.sourceUrl || '');
    if (explicitUrl || explicitLabel) {
        return {
            label: explicitLabel || explicitUrl,
            url: explicitUrl
        };
    }
    return inferDefaultOfficialSource(card, report) || { label: 'Not attached', url: '' };
}

/**
 * Tailored executive summary by industry channel (print/PDF only).
 * @param {string} industry
 * @returns {string}
 */
function getExecutiveSummary(industry) {
    const currentIndustry = String(industry ?? '').trim().toLowerCase();
    if (currentIndustry === 'new energy' || currentIndustry === 'new-energy') {
        return NEW_ENERGY_EXECUTIVE_SUMMARY;
    }
    if (currentIndustry === 'advanced semiconductor' || currentIndustry === 'semiconductor') {
        return SEMICONDUCTOR_EXECUTIVE_SUMMARY;
    }
    if (currentIndustry === 'electronics' || currentIndustry === 'electronics & smart hardware') {
        return ELECTRONICS_EXECUTIVE_SUMMARY;
    }
    return DEFAULT_EXECUTIVE_SUMMARY;
}

function sanitizePrintCellText(value) {
    return String(value ?? '')
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\[\s*\d+\s*[^\]]*$/g, '')
        .replace(/\[\s*(x|X|\s)\s*\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolvePrintIndustry(report = {}) {
    const raw = String(
        report.industry
        || report.vertical
        || report.industryLabel
        || ''
    ).trim();
    const lower = raw.toLowerCase();
    if (lower === 'new-energy' || lower === 'new energy' || raw === 'New Energy') {
        return 'new-energy';
    }
    if (lower === 'semiconductor' || lower === 'advanced semiconductor') {
        return 'semiconductor';
    }
    if (lower === 'electronics' || lower.includes('electronics & smart')) {
        return 'electronics';
    }
    const queryLower = sanitizePrintCellText(report.productQuery || report.query || '').toLowerCase();
    if (NEW_ENERGY_SUMMARY_QUERY_RE.test(queryLower)) {
        return 'new-energy';
    }
    if (/gpu|chip|semiconductor|eccn|bis|foundry|8542/.test(queryLower)) {
        return 'semiconductor';
    }
    return lower || 'electronics';
}

function shortenPhaseForPrint(item = {}) {
    const phaseKey = String(item.phase || '').trim().toLowerCase();
    if (PHASE_PRINT_LABELS[phaseKey]) {
        return PHASE_PRINT_LABELS[phaseKey];
    }
    const rawLabel = sanitizePrintCellText(item.phaseLabel || item.rawPhase || '');
    if (/technical|pre-shipment|certif/i.test(rawLabel)) {
        return 'Technical';
    }
    if (/environmental|green|battery|rohs/i.test(rawLabel)) {
        return 'Environmental';
    }
    if (/documentation|customs|doc/i.test(rawLabel)) {
        return 'Documentation';
    }
    return rawLabel.slice(0, 24) || 'General';
}

function buildExecutiveSummaryForEnterpriseReport(report = {}) {
    const base = getExecutiveSummary(resolvePrintIndustry(report));
    const transportNote = buildLithiumBatteryTransportNote(report);
    return transportNote ? `${base} ${transportNote}` : base;
}

function escapeHtmlForPrint(text) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.escapeHtml === 'function') {
        return globalThis.escapeHtml(text);
    }
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Three-column checklist rows — each task stays inside its own <tr>.
 * FIXED: Aligned dynamic checking status using item.id || item.task fallback keys.
 * @param {Array} tasks
 * @param {function} [esc]
 * @returns {string}
 */
function renderActionableChecklistTable(tasks, esc = escapeHtmlForPrint) {
    if (!tasks || tasks.length === 0) {
        return '<tr><td colspan="3" style="text-align:center;padding:12px;color:#718096;">No checklist items generated.</td></tr>';
    }
    return tasks.map((item) => {
        const phase = esc(shortenPhaseForPrint(item) || item.phase || 'General');
        const task = esc(sanitizePrintCellText(item.task));
        const guidance = esc(sanitizePrintCellText(item.guidance || item.desc || item.description));
        
        // 【核心修复一】判断当前条目在前台是否被勾选
        const isChecked = Boolean(item.checked);
        const checkIcon = isChecked ? '&#9745;' : '&#9744;';
        
        // 动态排版样式：被勾选的文字显示为内敛的深灰，未勾选的显示为鲜明的亮黑
        const titleStyle = isChecked
            ? 'font-weight: 700; font-size: 11.5px; color: #4a5568; margin-bottom: 2px;'
            : 'font-weight: 700; font-size: 11.5px; color: #1a202c; margin-bottom: 2px;';

        return (
            '<tr style="page-break-inside: avoid !important;">'
            + `<td class="phase-cell" style="padding: 5px 8px !important; font-size: 11px;">${phase}</td>`
            + '<td class="task-cell" style="padding: 5px 8px !important;">'
            + `<div class="task-title" style="${titleStyle}">`
            + `<span style="font-family: monospace; font-size: 12px; margin-right: 5px; font-weight: normal;">${checkIcon}</span>${task}`
            + '</div>'
            + (guidance ? `<div class="guidance-block" style="font-size: 10.5px; line-height: 1.35; color: #718096;">${guidance}</div>` : '')
            + '</td>'
            + '<td class="signoff-cell" style="padding: 5px 8px !important; font-size: 10.5px; line-height: 1.3; white-space: nowrap !important;">&#9744; Sign-off: _________<br>Date: ____________</td>'
            + '</tr>'
        );
    }).join('');
}

function buildEnterprisePrintChecklistRowsHtml(items = []) {
    return renderActionableChecklistTable(items);
}

function normalizeChecklistTasks(report = {}) {
    return (report.checklist || report.tasks || []).map((item) => {
        // 【核心修复二】显式携带并对齐 ID 信息
        const itemId = String(item.id || item.task || 'checklist-item');
        return {
            ...item,
            id: itemId,
            phase: item.phase,
            phaseLabel: item.phaseLabel,
            task: item.task,
            guidance: item.guidance || item.desc || item.description,
            desc: item.desc || item.guidance || item.description,
            checked: Boolean(item.checked)
        };
    });
}

function getEnterprisePrintKillHeadersStyles() {
    return getEnterprisePrintStyles();
}

/** Enterprise print — native document flow, compressed padding to fit into 1 page */
function getEnterprisePrintStyles() {
    return `
        * { box-sizing: border-box; }
        @media print {
            @page {
                size: A4 portrait;
                margin: 10mm 12mm 10mm 12mm !important;
            }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                overflow: visible !important;
                background: #fff !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .report-container,
            .report-print-root {
                width: 100% !important;
                max-height: 100%;
            }
            tr {
                page-break-inside: avoid !important;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #2d3748;
            line-height: 1.35;
            margin: 0;
            padding: 0;
            background: #fff;
        }
        .report-container,
        .report-print-root {
            width: 100%;
        }
        .header-title {
            font-size: 18px;
            font-weight: 700;
            color: #1a365d;
            border-bottom: 2px solid #2b6cb0;
            padding-bottom: 2px;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        .meta-grid-print {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 10px;
            font-size: 11px;
            margin-bottom: 8px;
            padding: 6px 8px;
            border: 1px solid #edf2f7;
        }
        .risk-pill-print {
            color: #dd6b20;
            font-weight: 700;
        }
        .hs-pair-print {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 11px;
            margin-bottom: 8px;
        }
        .hs-box-print {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px;
        }
        .hs-code-print {
            font-weight: 700;
            color: #1a365d;
            font-family: ui-monospace, monospace;
            font-size: 11.5px;
        }
        .notice-print {
            font-size: 10px;
            color: #718096;
            margin-bottom: 8px;
            line-height: 1.3;
        }
        .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #2b6cb0;
            background: #ebf8ff;
            padding: 3px 6px;
            margin-top: 10px;
            margin-bottom: 4px;
            border-left: 4px solid #3182ce;
            text-transform: uppercase;
        }
        .summary-box {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 11.5px;
            color: #4a5568;
            line-height: 1.4;
            margin-bottom: 8px;
        }
        .report-risks-block {
            margin-bottom: 8px;
        }
        .risk-print-card {
            padding: 6px 10px;
            border: 1px solid #edf2f7;
            border-left: 4px solid #dd6b20;
            margin-bottom: 5px;
            font-size: 11px;
            line-height: 1.35;
        }
        .risk-print-audit {
            font-size: 10px;
            color: #a0aec0;
            margin-top: 2px;
        }
        .risk-print-source {
            font-size: 10px;
            color: #4a5568;
            margin-top: 2px;
            word-break: break-word;
        }
        .risk-print-source a {
            color: #2b6cb0;
            text-decoration: underline;
        }
        table,
        table.checklist-print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11.5px;
            table-layout: fixed;
        }
        th {
            background: #f7fafc;
            padding: 4px 8px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #e2e8f0;
            color: #4a5568;
        }
        td {
            padding: 4px 8px !important;
            border: 1px solid #e2e8f0;
            vertical-align: top !important;
        }
        .phase-cell {
            font-weight: 500;
            text-transform: capitalize;
            color: #4a5568;
            width: 18%;
        }
        .task-cell {
            width: 62%;
        }
        .task-title {
            font-weight: 700;
            font-size: 11.5px;
            color: #1a202c;
            margin-bottom: 2px;
        }
        .guidance-block,
        .guidance-text {
            font-size: 10.5px;
            color: #718096;
            line-height: 1.35;
        }
        .signoff-cell {
            font-size: 10.5px;
            color: #4a5568;
            width: 20%;
            white-space: nowrap !important;
            vertical-align: top !important;
        }
        .footer-brand {
            margin-top: 15px;
            text-align: center;
            font-size: 10px;
            color: #a0aec0;
            border-top: 1px dashed #e2e8f0;
            padding-top: 6px;
        }
    `;
}

function buildEnterpriseRiskCardsHtml(report = {}, esc = escapeHtmlForPrint) {
    const riskSummaries = (report.riskSummaries || report.risks || []).slice(0, 8);
    if (!riskSummaries.length) {
        return '<p style="font-size:11.5px;color:#718096;">No matched regulatory signals in this session.</p>';
    }
    return riskSummaries.map((card) => {
        const category = esc(card.type || card.category || 'Compliance');
        const rawDescription = sanitizePrintCellText(card.description || card.title || '');
        const description = esc(normalizeLithiumBatteryRiskDescription(rawDescription, report));
        const auditLine = sanitizePrintCellText(card.auditLine);
        const source = resolveRiskCardSource(card, report);
        const sourceLabel = source.label;
        const sourceUrl = source.url;
        const sourceHtml = sourceUrl
            ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sourceLabel || sourceUrl)}</a>`
            : esc(sourceLabel || 'Not attached');
        return (
            '<div class="risk-print-card">'
            + `<strong>[${category}]</strong> ${description}`
            + (auditLine
                ? `<div class="risk-print-audit">${esc(auditLine)}</div>`
                : '<div class="risk-print-audit">Source Jurisdiction: [GLOBAL] | Verified: Live Asset</div>')
            + `<div class="risk-print-source">Official Source: ${sourceHtml}</div>`
            + '</div>'
        );
    }).join('');
}

function normalizeLithiumBatteryRiskDescription(description, report = {}) {
    const code = inferLithiumBatteryTransportCode(report);
    if (!code || !description) {
        return description;
    }
    if (code === 'UN3481' && /UN3480/i.test(description)) {
        return description.replace(/UN3480/gi, 'UN3481').replace(/shipped alone/gi, 'packed with or contained in equipment');
    }
    if (code === 'UN3091' && /UN3090/i.test(description)) {
        return description.replace(/UN3090/gi, 'UN3091').replace(/shipped alone/gi, 'packed with or contained in equipment');
    }
    return description;
}

/**
 * @param {object} report
 * @param {function} [esc]
 * @returns {string}
 */
function assembleEnterprisePrintDocument(report = {}, esc = escapeHtmlForPrint) {
    const industry = resolvePrintIndustry(report);
    const summaryText = esc(buildExecutiveSummaryForEnterpriseReport({ ...report, industry }));
    const tasks = normalizeChecklistTasks(report);
    const tableRowsHtml = renderActionableChecklistTable(tasks, esc);
    const riskCards = buildEnterpriseRiskCardsHtml(report, esc);
    const printStyles = getEnterprisePrintStyles();
    const flow = esc(report.flowLabel || report.flow || 'CN → US');
    const generated = esc(
        report.generatedAtLabel
        || (typeof report.generatedAt === 'string' ? report.generatedAt : '')
        || new Date().toLocaleString()
    );
    const query = esc(report.productQuery || report.query || '');
    const risk = esc(report.riskLabel || report.risk || 'Medium');
    const chinaHs = esc(report.chinaHsCode || 'Not provided - classification required');
    const counterpartyHs = esc(report.counterpartyHsCode || 'Not provided - classification required');
    const counterpartyLabel = esc(report.counterpartyHsLabel || 'Counterparty HS');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Trade Comply Enterprise Pre-Check Report</title>
    <style>${printStyles}</style>
</head>
<body>
    <div class="report-container report-print-root">
        <div class="header-title">Enterprise Compliance Pre-Check Report</div>

        <div class="meta-grid-print">
            <div><strong>Trade Flow:</strong> ${flow}</div>
            <div><strong>Generated:</strong> ${generated}</div>
            <div><strong>Product/Query:</strong> ${query}</div>
            <div><strong>Risk Level:</strong> <span class="risk-pill-print">${risk}</span></div>
        </div>

        <div class="hs-pair-print">
            <div class="hs-box-print"><div>China HS (10-digit)</div><div class="hs-code-print">${chinaHs}</div></div>
            <div class="hs-box-print"><div>${counterpartyLabel}</div><div class="hs-code-print">${counterpartyHs}</div></div>
        </div>

        <p class="notice-print">Preliminary screening only — not legal or customs advice. Verify with licensed professionals before filing.</p>

        <div class="section-title">Executive Summary</div>
        <div class="summary-box">${summaryText}</div>

        <div class="section-title">Identified Regulatory Risks</div>
        <div class="report-risks-block">${riskCards}</div>

        <div class="section-title">Actionable Compliance Checklist</div>
        <table class="checklist-print-table" cellspacing="0" cellpadding="0">
            <thead>
                <tr>
                    <th style="width:18%;">Phase</th>
                    <th style="width:62%;">Task &amp; Guidance</th>
                    <th style="width:20%;">Sign-off / Date</th>
                </tr>
            </thead>
            <tbody>${tableRowsHtml}</tbody>
        </table>

        <div class="footer-brand">
            Trade Comply Intelligence Engine &bull; Confidential Internal Compliance Asset &bull; Page 1 of 1
        </div>
    </div>
</body>
</html>`;
}

function buildEnterprisePrintHtml(report = {}, esc = escapeHtmlForPrint) {
    return assembleEnterprisePrintDocument(report, esc);
}

function printViaHiddenIframe(html) {
    const iframe = document.createElement('iframe');
    iframe.id = 'tc-print-frame';
    iframe.setAttribute('title', 'Compliance pre-check print report');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:210mm;min-height:400px;border:0;opacity:0;pointer-events:none;z-index:-1;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
        return false;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const run = () => {
        const win = iframe.contentWindow;
        if (!win) {
            iframe.remove();
            return;
        }
        const root = doc.querySelector('.report-container') || doc.body;
        iframe.style.width = '210mm';
        iframe.style.height = `${Math.max(root.scrollHeight + 40, 400)}px`;
        win.focus();
        win.print();
        const cleanup = () => iframe.remove();
        win.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 120000);
    };
    if (doc.readyState === 'complete') {
        setTimeout(run, 200);
    } else {
        iframe.addEventListener('load', () => setTimeout(run, 200), { once: true });
    }
    return true;
}

/**
 * Global print gateway — popup sandbox first, iframe fallback if blocked.
 * @param {object} reportData
 * @param {string} [currentIndustry]
 */
function printEnterprisePrecheckReport(reportData = {}, currentIndustry) {
    const esc = escapeHtmlForPrint;
    const industry = currentIndustry || resolvePrintIndustry(reportData);
    const html = assembleEnterprisePrintDocument(reportData, esc);

    if (typeof document === 'undefined') {
        return false;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.document.title = 'Trade Comply Enterprise Pre-Check Report';
        const trigger = () => {
            try {
                printWindow.focus();
                printWindow.print();
            } catch (error) {
                console.error('Print window failed:', error);
            }
            const cleanup = () => {
                try {
                    printWindow.close();
                } catch (e) {
                    /* ignore */
                }
            };
            printWindow.addEventListener('afterprint', cleanup, { once: true });
            setTimeout(cleanup, 120000);
        };
        if (printWindow.document.readyState === 'complete') {
            setTimeout(trigger, 150);
        } else {
            printWindow.onload = trigger;
        }
        return true;
    }

    return printViaHiddenIframe(html);
}

const enterprisePrintApi = {
    NEW_ENERGY_EXECUTIVE_SUMMARY,
    SEMICONDUCTOR_EXECUTIVE_SUMMARY,
    ELECTRONICS_EXECUTIVE_SUMMARY,
    DEFAULT_EXECUTIVE_SUMMARY,
    getExecutiveSummary,
    resolvePrintIndustry,
    sanitizePrintCellText,
    shortenPhaseForPrint,
    buildExecutiveSummaryForEnterpriseReport,
    inferLithiumBatteryTransportCode,
    buildLithiumBatteryTransportNote,
    inferDefaultOfficialSource,
    resolveRiskCardSource,
    normalizeLithiumBatteryRiskDescription,
    renderActionableChecklistTable,
    buildEnterprisePrintChecklistRowsHtml,
    buildEnterpriseRiskCardsHtml,
    assembleEnterprisePrintDocument,
    buildEnterprisePrintHtml,
    getEnterprisePrintKillHeadersStyles,
    getEnterprisePrintStyles,
    escapeHtmlForPrint,
    print: printEnterprisePrecheckReport,
    printEnterprisePrecheckReport
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = enterprisePrintApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyEnterprisePrint = enterprisePrintApi;
}
