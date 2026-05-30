/**
 * Enterprise PDF / print report — executive summary, print-safe layout, global print gateway.
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
    return getExecutiveSummary(resolvePrintIndustry(report));
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
 * @param {Array} tasks
 * @param {function} [esc]
 * @returns {string}
 */
function renderActionableChecklistTable(tasks, esc = escapeHtmlForPrint) {
    if (!tasks || tasks.length === 0) {
        return '<tr><td colspan="3" style="text-align:center;padding:15px;color:#718096;">No checklist items generated.</td></tr>';
    }
    return tasks.map((item) => {
        const phase = esc(shortenPhaseForPrint(item) || item.phase || 'General');
        const task = esc(sanitizePrintCellText(item.task));
        const guidance = esc(sanitizePrintCellText(item.guidance || item.desc || item.description));
        return (
            '<tr>'
            + `<td class="phase-cell">${phase}</td>`
            + '<td class="task-cell">'
            + `<div class="task-title">${task}</div>`
            + (guidance ? `<div class="guidance-block">${guidance}</div>` : '')
            + '</td>'
            + '<td class="signoff-cell">&#9744; Sign-off: _________<br>Date: ____________</td>'
            + '</tr>'
        );
    }).join('');
}

function buildEnterprisePrintChecklistRowsHtml(items = []) {
    return renderActionableChecklistTable(items);
}

function normalizeChecklistTasks(report = {}) {
    return (report.checklist || report.tasks || []).map((item) => ({
        ...item,
        phase: item.phase,
        phaseLabel: item.phaseLabel,
        task: item.task,
        guidance: item.guidance || item.desc || item.description,
        desc: item.desc || item.guidance || item.description
    }));
}

function getEnterprisePrintKillHeadersStyles() {
    return getEnterprisePrintStyles();
}

/** Enterprise print — native document flow, one <tr> per checklist task */
function getEnterprisePrintStyles() {
    return `
        * { box-sizing: border-box; }
        @media print {
            @page {
                size: A4 portrait;
                margin: 12mm 15mm 12mm 15mm !important;
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
            line-height: 1.4;
            margin: 0;
            padding: 0;
            background: #fff;
        }
        .report-container,
        .report-print-root {
            width: 100%;
        }
        .header-title {
            font-size: 20px;
            font-weight: 700;
            color: #1a365d;
            border-bottom: 2px solid #2b6cb0;
            padding-bottom: 4px;
            margin-bottom: 12px;
            text-transform: uppercase;
        }
        .meta-grid-print {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 12px;
            font-size: 12px;
            margin-bottom: 12px;
            padding: 10px;
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
            margin-bottom: 12px;
        }
        .hs-box-print {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 8px;
        }
        .hs-code-print {
            font-weight: 700;
            color: #1a365d;
            font-family: ui-monospace, monospace;
            font-size: 12px;
        }
        .notice-print {
            font-size: 11px;
            color: #718096;
            margin-bottom: 12px;
            line-height: 1.4;
        }
        .section-title {
            font-size: 13px;
            font-weight: 700;
            color: #2b6cb0;
            background: #ebf8ff;
            padding: 4px 8px;
            margin-top: 15px;
            margin-bottom: 6px;
            border-left: 4px solid #3182ce;
            text-transform: uppercase;
        }
        .summary-box {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 12.5px;
            color: #4a5568;
            line-height: 1.45;
            margin-bottom: 12px;
        }
        .report-risks-block {
            margin-bottom: 12px;
        }
        .risk-print-card {
            padding: 8px 12px;
            border: 1px solid #edf2f7;
            border-left: 4px solid #dd6b20;
            margin-bottom: 8px;
            font-size: 12px;
            line-height: 1.4;
        }
        .risk-print-audit {
            font-size: 11px;
            color: #a0aec0;
            margin-top: 4px;
        }
        table,
        table.checklist-print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            table-layout: fixed;
        }
        th {
            background: #f7fafc;
            padding: 6px 8px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #e2e8f0;
            color: #4a5568;
        }
        td {
            padding: 6px 8px !important;
            border: 1px solid #e2e8f0;
            vertical-align: top !important;
        }
        .phase-cell {
            font-weight: 500;
            text-transform: capitalize;
            color: #4a5568;
            width: 20%;
        }
        .task-cell {
            width: 60%;
        }
        .task-title {
            font-weight: 700;
            font-size: 12.5px;
            color: #1a202c;
            margin-bottom: 3px;
        }
        .guidance-block,
        .guidance-text {
            font-size: 11px;
            color: #718096;
            line-height: 1.35;
        }
        .signoff-cell {
            font-size: 11px;
            color: #4a5568;
            width: 20%;
            white-space: nowrap !important;
            vertical-align: top !important;
        }
        .footer-brand {
            margin-top: 25px;
            text-align: center;
            font-size: 10.5px;
            color: #a0aec0;
            border-top: 1px dashed #e2e8f0;
            padding-top: 8px;
        }
    `;
}

function buildEnterpriseRiskCardsHtml(report = {}, esc = escapeHtmlForPrint) {
    const riskSummaries = (report.riskSummaries || report.risks || []).slice(0, 8);
    if (!riskSummaries.length) {
        return '<p style="font-size:13px;color:#718096;">No matched regulatory signals in this session.</p>';
    }
    return riskSummaries.map((card) => {
        const category = esc(card.type || card.category || 'Compliance');
        const description = esc(sanitizePrintCellText(card.description || card.title || ''));
        const auditLine = sanitizePrintCellText(card.auditLine);
        return (
            '<div class="risk-print-card">'
            + `<strong>[${category}]</strong> ${description}`
            + (auditLine
                ? `<div class="risk-print-audit">${esc(auditLine)}</div>`
                : '<div class="risk-print-audit">Source Jurisdiction: [GLOBAL] | Verified: Live Asset</div>')
            + '</div>'
        );
    }).join('');
}

/**
 * @param {object} report
 * @param {function} [esc]
 * @returns {string}
 */
function assembleEnterprisePrintDocument(report = {}, esc = escapeHtmlForPrint) {
    const industry = resolvePrintIndustry(report);
    const summaryText = esc(getExecutiveSummary(industry));
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
    const chinaHs = esc(report.chinaHsCode || '—');
    const counterpartyHs = esc(report.counterpartyHsCode || '—');
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
                    <th style="width:20%;">Phase</th>
                    <th style="width:60%;">Task &amp; Guidance</th>
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
            setTimeout(() => {
                try {
                    printWindow.close();
                } catch (e) {
                    /* ignore */
                }
            }, 500);
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
