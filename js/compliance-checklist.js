/**
 * Compliance To-Do Checklist UI + enterprise print report helpers.
 */

function getChecklistApi() {
    return globalThis.TradeComplyChecklist || null;
}

function extractChecklistFromApiPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }
    const candidates = [
        payload.checklist,
        payload.check_list,
        payload.data?.checklist,
        payload.response?.checklist,
        payload.classification?.checklist
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate;
        }
    }
    return [];
}

function collectDynamicAiChecklists(options = {}) {
    const buckets = [
        options.aiChecklist,
        AppState.lastApiChecklist,
        AppState.hsContext?.checklist,
        AppState.aiContext?.checklist
    ];
    const merged = [];
    buckets.forEach((entry) => {
        if (Array.isArray(entry)) {
            merged.push(...entry);
        }
    });
    return merged;
}

const CHECKLIST_PHASE_LABELS = {
    technical: '📦 Pre-shipment technical & certification checks',
    environmental: '🌱 Environmental & green-market registration',
    documentation: '📑 Customs & documentation preparation',
    other: '📌 Other compliance actions'
};

function extractChecklistRawPhase(item) {
    const api = getChecklistApi();
    if (api?.extractRawPhaseFromItem) {
        return api.extractRawPhaseFromItem(item);
    }
    return String(item?.phase || item?.stage || item?.category || '').trim();
}

function normalizeChecklistPhaseLite(phaseOrItem) {
    const api = getChecklistApi();
    if (api?.normalizePhase) {
        return api.normalizePhase(phaseOrItem);
    }
    const raw = String(
        typeof phaseOrItem === 'object'
            ? extractChecklistRawPhase(phaseOrItem)
            : (phaseOrItem || '')
    ).trim().toLowerCase();
    if (raw.includes('tech') || raw.includes('pre') || raw.includes('技术') || raw.includes('出口前')) {
        return 'technical';
    }
    if (raw.includes('environ') || raw.includes('green') || raw.includes('环保') || raw.includes('绿色')) {
        return 'environmental';
    }
    if (raw.includes('custom') || raw.includes('doc') || raw.includes('海关') || raw.includes('单证')) {
        return 'documentation';
    }
    return 'other';
}

function groupChecklistByPhaseLite(items) {
    const api = getChecklistApi();
    if (api?.groupChecklistByPhase) {
        return api.groupChecklistByPhase(items);
    }
    const groups = new Map();
    (items || []).forEach((item) => {
        const phaseKey = normalizeChecklistPhaseLite(item);
        const phaseLabel = CHECKLIST_PHASE_LABELS[phaseKey] || CHECKLIST_PHASE_LABELS.other;
        if (!groups.has(phaseKey)) {
            groups.set(phaseKey, { phaseKey, phaseLabel, items: [] });
        }
        groups.get(phaseKey).items.push({ ...item, phase: phaseKey, phaseLabel });
    });
    const order = ['technical', 'environmental', 'documentation', 'other'];
    return order
        .filter((key) => groups.has(key))
        .concat([...groups.keys()].filter((key) => !order.includes(key)))
        .map((key) => groups.get(key));
}

function mergeTagChecklistsInline(tags) {
    const merged = [];
    (tags || []).forEach((tag) => {
        const list = tag.checklist;
        if (!Array.isArray(list)) {
            return;
        }
        list.forEach((item) => {
            if (item && item.task) {
                merged.push({ ...item, source: item.source || tag.tag_id || 'tag' });
            }
        });
    });
    if (merged.length === 0) {
        return [];
    }
    const api = getChecklistApi();
    if (api?.normalizeChecklist) {
        return api.normalizeChecklist(merged);
    }
    return merged.map((item) => {
        const phase = normalizeChecklistPhaseLite(item);
        return {
            id: String(item.id || `${phase}::${item.task}`).slice(0, 120),
            phase,
            phaseLabel: CHECKLIST_PHASE_LABELS[phase] || CHECKLIST_PHASE_LABELS.other,
            task: String(item.task || '').trim(),
            desc: String(item.desc || item.description || '').trim(),
            source: item.source || 'tag'
        };
    });
}

function buildComplianceChecklistForResults(tags, options = {}) {
    const api = getChecklistApi();
    const country = options.country || AppState.currentCountry || 'US';
    const direction = options.direction || AppState.currentDirection || 'export';
    const aiChecklist = collectDynamicAiChecklists(options);
    const includeBaseline = options.includeBaseline === true;

    if (api?.buildSessionChecklist) {
        return api.buildSessionChecklist({
            tags: tags || [],
            aiChecklist,
            country,
            direction,
            includeBaseline
        });
    }

    const fromTags = mergeTagChecklistsInline(tags);
    if (aiChecklist.length > 0 && api?.mergeChecklists) {
        return api.mergeChecklists(fromTags, aiChecklist);
    }
    return fromTags;
}

function placeChecklistSlotAfterPenaltyCases() {
    let slot = document.getElementById('compliance-checklist-container');
    if (!slot) {
        slot = document.createElement('div');
        slot.id = 'compliance-checklist-container';
        slot.className = 'compliance-checklist-slot';
        slot.setAttribute('aria-live', 'polite');
    }
    const casesContainer = document.getElementById('cases-container');
    if (casesContainer?.parentNode) {
        if (slot.parentNode !== casesContainer.parentNode
            || slot.previousElementSibling !== casesContainer) {
            casesContainer.insertAdjacentElement('afterend', slot);
        }
        return slot;
    }
    const cardsContainer = document.getElementById('result-cards-container');
    if (cardsContainer?.parentNode
        && (slot.parentNode !== cardsContainer.parentNode
            || slot.previousElementSibling !== cardsContainer)) {
        cardsContainer.insertAdjacentElement('afterend', slot);
    }
    return slot;
}

function mountComplianceChecklist(containerId, tags, options = {}) {
    const targetId = containerId || 'compliance-checklist-container';
    placeChecklistSlotAfterPenaltyCases();
    const checklist = buildComplianceChecklistForResults(tags, {
        country: options.country || AppState.currentCountry,
        direction: options.direction || AppState.currentDirection,
        aiChecklist: options.aiChecklist,
        includeBaseline: options.includeBaseline
    });
    renderComplianceChecklistPanel(targetId, checklist);
    const el = document.getElementById(targetId);
    if (el && checklist.length > 0) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return checklist;
}

if (typeof globalThis !== 'undefined') {
    globalThis.mountComplianceChecklist = mountComplianceChecklist;
    globalThis.buildComplianceChecklistForResults = buildComplianceChecklistForResults;
    globalThis.placeChecklistSlotAfterPenaltyCases = placeChecklistSlotAfterPenaltyCases;
    globalThis.placeChecklistSlotAfterRiskCards = placeChecklistSlotAfterPenaltyCases;
    globalThis.extractChecklistFromApiPayload = extractChecklistFromApiPayload;
    globalThis.collectDynamicAiChecklists = collectDynamicAiChecklists;
}

function bindComplianceChecklistCheckboxHandlers(root) {
    const scope = root || document;
    scope.querySelectorAll('.compliance-checklist-checkbox').forEach((input) => {
        input.addEventListener('change', () => {
            const id = input.dataset.checklistId;
            if (input.checked) {
                AppState.checklistChecked[id] = true;
            } else {
                delete AppState.checklistChecked[id];
            }
            const row = input.closest('.compliance-checklist-item');
            if (!row) {
                return;
            }
            row.classList.toggle('is-done', input.checked);
            const taskEl = row.querySelector('.compliance-checklist-task');
            const descEl = row.querySelector('.compliance-checklist-desc');
            if (taskEl) {
                taskEl.classList.toggle('completed', input.checked);
            }
            if (descEl) {
                descEl.classList.toggle('completed', input.checked);
            }
        });
    });
}

function renderComplianceChecklistPanel(containerId, checklist) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const checklistData = checklist || [];
    console.log('Real AI Checklist Data:', checklistData);
    console.log('Checklist phase fields:', checklistData.map((item) => ({
        phase: item?.phase,
        stage: item?.stage,
        category: item?.category,
        raw: extractChecklistRawPhase(item),
        normalized: normalizeChecklistPhaseLite(item)
    })));

    AppState.complianceChecklist = checklistData;

    if (!checklistData.length) {
        container.hidden = true;
        container.style.display = 'none';
        container.innerHTML = '';
        container.classList.remove('compliance-checklist-container--visible');
        return;
    }

    container.style.display = '';
    container.hidden = false;

    const groups = groupChecklistByPhaseLite(checklistData);

    const groupsHtml = groups.map((group) => `
        <div class="compliance-checklist-phase">
            <h3 class="compliance-checklist-phase-title">${escapeHtml(group.phaseLabel || group.phase || 'Other compliance actions')}</h3>
            <ul class="compliance-checklist-items">
                ${group.items.map((item) => {
                    const checked = AppState.checklistChecked[item.id];
                    const rowClass = checked
                        ? 'compliance-checklist-item is-done'
                        : 'compliance-checklist-item';
                    const completedClass = checked ? ' completed' : '';
                    return `
                    <li class="${rowClass}" data-checklist-id="${escapeHtml(item.id)}">
                        <label class="compliance-checklist-label">
                            <input type="checkbox" class="compliance-checklist-checkbox" data-checklist-id="${escapeHtml(item.id)}" ${checked ? 'checked' : ''}>
                            <span class="compliance-checklist-task${completedClass}">${escapeHtml(item.task)}</span>
                        </label>
                        ${item.desc ? `<p class="compliance-checklist-desc${completedClass}">${escapeHtml(item.desc)}</p>` : ''}
                    </li>`;
                }).join('')}
            </ul>
        </div>
    `).join('');

    container.hidden = false;
    container.classList.add('compliance-checklist-container--visible');
    container.innerHTML = `
        <section class="compliance-checklist-panel result-category-group result-category-group--compliance-checklist collapsible-panel" aria-label="Actionable Compliance Checklist">
            <button type="button" class="compliance-checklist-header category-group-header collapsible-header" aria-expanded="false">
                <span class="group-icon group-icon--themed" aria-hidden="true">📋</span>
                <span class="group-title compliance-checklist-title">Actionable Compliance Checklist</span>
                <span class="group-count compliance-checklist-count">${checklistData.length} ${checklistData.length === 1 ? 'task' : 'tasks'}</span>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
            <div class="compliance-checklist-body collapsible-body">
                <p class="compliance-checklist-note">Grouped by compliance phase for your selected market. Check off tasks as you complete them — your selections are included in the print report.</p>
                ${groupsHtml}
            </div>
        </section>
    `;

    bindComplianceChecklistCheckboxHandlers(container);

    if (typeof initGlobalCollapsiblePanels === 'function') {
        initGlobalCollapsiblePanels();
    }
}

function getChecklistForReport() {
    return (AppState.complianceChecklist || []).map((item) => ({
        ...item,
        checked: Boolean(AppState.checklistChecked[item.id])
    }));
}

function buildFlowLabel(direction, countryCode) {
    const api = globalThis.TradeComplyCountry;
    const dir = direction === 'import' ? 'import' : 'export';
    const countryLabel = api ? api.getCountryLabel(countryCode) : countryCode;
    if (dir === 'import') {
        return `CN ← ${countryLabel}`;
    }
    return `CN → ${countryLabel}`;
}

function buildReportChecklistRowsHtml(items) {
    return (items || []).map((item) => `
        <tr class="checklist-print-row avoid-page-break">
            <td class="checklist-print-box">${item.checked ? '[x]' : '[ ]'}</td>
            <td class="checklist-print-phase">${escapeHtml(item.phaseLabel || item.phase)}</td>
            <td class="checklist-print-task">
                <strong>${escapeHtml(item.task)}</strong>
                ${item.desc ? `<div class="checklist-print-desc">${escapeHtml(item.desc)}</div>` : ''}
            </td>
            <td class="checklist-print-signoff">
                <div class="signoff-line">Sign-off: _______________</div>
                <div class="signoff-line">Date: _______________</div>
            </td>
        </tr>
    `).join('');
}

function buildEnterpriseReportHtml(report) {
    const flow = escapeHtml(report.flowLabel || '');
    const chinaHs = escapeHtml(report.chinaHsCode || '—');
    const counterpartyHs = escapeHtml(report.counterpartyHsCode || '—');
    const riskCards = (report.riskSummaries || []).map((card) => `
        <div class="report-risk-card avoid-page-break">
            <div class="report-risk-card-head">
                <span class="report-risk-type">${escapeHtml(card.type)}</span>
                <span class="report-risk-level">${escapeHtml(card.riskLevel)}</span>
            </div>
            <div class="report-risk-title">${escapeHtml(card.title)}</div>
            <div class="report-risk-desc">${escapeHtml(card.description)}</div>
        </div>
    `).join('');

    const checklistRows = buildReportChecklistRowsHtml(report.checklist || []);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Trade Comply Enterprise Pre-Check Report</title>
    <style>
        @page { margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; color: #243447; margin: 0; padding: 24px; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h1 { color: #1A3A5C; font-size: 22px; margin: 0 0 6px; }
        h2 { color: #1A3A5C; font-size: 15px; border-bottom: 1px solid #dde3ea; padding-bottom: 6px; margin: 22px 0 10px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 12px 0 18px; }
        .meta-item strong { color: #1A3A5C; }
        .flow-pill { display: inline-block; background: #1A3A5C; color: #fff; padding: 4px 12px; border-radius: 999px; font-weight: 700; }
        .hs-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0; }
        .hs-box { border: 1px solid #dde3ea; border-radius: 8px; padding: 10px; }
        .hs-code { font-size: 16px; font-weight: 700; color: #1A3A5C; font-family: ui-monospace, monospace; }
        .notice { color: #666; font-size: 11px; margin-top: 8px; }
        .report-risk-card { border: 1px solid #dde3ea; border-left: 4px solid #E8A817; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
        .report-risk-card-head { display: flex; gap: 8px; margin-bottom: 4px; }
        .report-risk-type { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #666; }
        .report-risk-level { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #fff4e5; color: #9a6700; }
        .report-risk-title { font-weight: 700; color: #1A3A5C; }
        .checklist-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .checklist-table th, .checklist-table td { border: 1px solid #dde3ea; padding: 8px; vertical-align: top; text-align: left; }
        .checklist-table th { background: #f5f7fa; color: #1A3A5C; font-size: 11px; }
        .checklist-print-box { width: 28px; text-align: center; font-size: 14px; font-weight: 700; }
        .checklist-print-phase { width: 88px; font-size: 11px; color: #555; }
        .checklist-print-signoff { width: 140px; font-size: 10px; color: #666; }
        .signoff-line { margin: 6px 0; }
        .avoid-page-break { page-break-inside: avoid; break-inside: avoid; }
        .no-screen { display: none; }
        @media print {
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <h1>Enterprise Compliance Pre-Check Report</h1>
    <div class="meta-grid">
        <div class="meta-item"><strong>Trade flow:</strong> <span class="flow-pill">${flow}</span></div>
        <div class="meta-item"><strong>Generated:</strong> ${escapeHtml(report.generatedAtLabel || '')}</div>
        <div class="meta-item"><strong>Product / query:</strong> ${escapeHtml(report.productQuery || '')}</div>
        <div class="meta-item"><strong>Pre-check risk:</strong> ${escapeHtml(report.riskLabel || '')}</div>
    </div>
    <div class="hs-pair avoid-page-break">
        <div class="hs-box"><div>China HS (10-digit)</div><div class="hs-code">${chinaHs}</div></div>
        <div class="hs-box"><div>${escapeHtml(report.counterpartyHsLabel || 'Counterparty HS')}</div><div class="hs-code">${counterpartyHs}</div></div>
    </div>
    <p class="notice">Preliminary screening only — not legal or customs advice. Verify with licensed professionals before filing.</p>

    <h2>Identified Regulatory Risks</h2>
    ${riskCards || '<p>No matched regulatory signals in this session.</p>'}

    <h2>Actionable Compliance Checklist</h2>
    <table class="checklist-table">
        <thead>
            <tr>
                <th></th>
                <th>Phase</th>
                <th>Task &amp; guidance</th>
                <th>Sign-off / Date</th>
            </tr>
        </thead>
        <tbody>${checklistRows || '<tr><td colspan="4">No checklist items generated.</td></tr>'}</tbody>
    </table>
</body>
</html>`;
}

function removePrintFrame() {
    const frame = document.getElementById('tc-print-frame');
    if (frame) {
        frame.remove();
    }
}

/**
 * Print via hidden iframe (no pop-up window — works when blockers are on).
 */
function printEnterprisePrecheckReport(report) {
    const html = buildEnterpriseReportHtml(report);
    removePrintFrame();

    const iframe = document.createElement('iframe');
    iframe.id = 'tc-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Compliance pre-check print report');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;z-index:-1;';

    let printStarted = false;
    const runPrint = () => {
        if (printStarted) {
            return;
        }
        printStarted = true;

        const win = iframe.contentWindow;
        if (!win) {
            window.alert('Could not open the print dialog. Please try again.');
            removePrintFrame();
            return;
        }
        try {
            win.focus();
            win.print();
        } catch (error) {
            console.error('Print failed:', error);
            window.alert('Could not open the print dialog. Please try again.');
        }
        setTimeout(removePrintFrame, 120000);
    };

    iframe.onload = () => setTimeout(runPrint, 200);
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
        window.alert('Could not prepare the print report. Please try again.');
        removePrintFrame();
        return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState === 'complete') {
        setTimeout(runPrint, 250);
    }
}
