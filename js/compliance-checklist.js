/**
 * Compliance To-Do Checklist UI + enterprise print report helpers.
 */
(function initComplianceChecklistModule(global) {
    'use strict';

function getChecklistApi() {
    return globalThis.TradeComplyChecklist || null;
}

function getChecklistSegmentApi() {
    return globalThis.TradeComplyChecklistSegment || null;
}

function resolveChecklistVerticalForSession(options = {}) {
    const segmentApi = getChecklistSegmentApi();
    const productQuery = options.productQuery
        || AppState.lastReport?.productQuery
        || AppState.aiContext?.product_query
        || '';
    if (segmentApi?.resolveChecklistVertical) {
        return segmentApi.resolveChecklistVertical({
            vertical: options.vertical,
            searchOrigin: AppState.searchOrigin,
            description: productQuery,
            hsCode: options.hsCode || AppState.hsContext?.chinaCode || '',
            forceVertical: options.forceVertical === true
        });
    }
    if (['electronics', 'new-energy', 'semiconductor'].includes(options.vertical)) {
        return options.vertical;
    }
    return 'electronics';
}

function filterChecklistRowsForSession(items, options = {}) {
    const vertical = resolveChecklistVerticalForSession(options);
    const segmentApi = getChecklistSegmentApi();
    if (segmentApi?.filterChecklistForVertical) {
        return segmentApi.filterChecklistForVertical(items, vertical);
    }
    return items || [];
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

const CHECKLIST_GROUP_TITLES = {
    technical: '📦 Pre-shipment Technical & Certification Checks',
    environmental: '🌱 Environmental & Green Registry',
    documentation: '📑 Customs & Documentation Preparation',
    other: '📌 Other Compliance Actions'
};

const CHECKLIST_GROUP_ORDER = [
    CHECKLIST_GROUP_TITLES.technical,
    CHECKLIST_GROUP_TITLES.environmental,
    CHECKLIST_GROUP_TITLES.documentation,
    CHECKLIST_GROUP_TITLES.other
];

function resolveChecklistGroupTitle(item) {
    const rawPhase = [
        item.rawPhase,
        item.stage,
        item.phase_name,
        item.phaseName,
        item.group,
        item.section,
        item.checklist_phase,
        item.category,
        item.phase,
        item.task,
        item.desc
    ]
        .filter((value) => value !== undefined && value !== null && String(value).trim())
        .join(' ')
        .toLowerCase();

    if (
        rawPhase.includes('tech')
        || rawPhase.includes('pre')
        || rawPhase.includes('certif')
        || rawPhase.includes('技术')
        || rawPhase.includes('出口前')
        || rawPhase.includes('核查')
    ) {
        return CHECKLIST_GROUP_TITLES.technical;
    }
    if (
        rawPhase.includes('environ')
        || rawPhase.includes('green')
        || rawPhase.includes('环保')
        || rawPhase.includes('绿色')
        || rawPhase.includes('recycle')
        || rawPhase.includes('battery')
        || rawPhase.includes('rohs')
        || rawPhase.includes('reach')
    ) {
        return CHECKLIST_GROUP_TITLES.environmental;
    }
    if (
        rawPhase.includes('custom')
        || rawPhase.includes('doc')
        || rawPhase.includes('海关')
        || rawPhase.includes('单证')
        || rawPhase.includes('tariff')
        || rawPhase.includes('licen')
        || rawPhase.includes('declar')
    ) {
        return CHECKLIST_GROUP_TITLES.documentation;
    }
    return CHECKLIST_GROUP_TITLES.other;
}

function groupChecklistForRender(items) {
    const groups = new Map();
    (items || []).forEach((item) => {
        const groupTitle = resolveChecklistGroupTitle(item);
        if (!groups.has(groupTitle)) {
            groups.set(groupTitle, { phaseLabel: groupTitle, items: [] });
        }
        groups.get(groupTitle).items.push(item);
    });
    return CHECKLIST_GROUP_ORDER
        .filter((title) => groups.has(title))
        .map((title) => groups.get(title));
}

const CHECKLIST_PHASE_LABELS = {
    technical: CHECKLIST_GROUP_TITLES.technical,
    environmental: CHECKLIST_GROUP_TITLES.environmental,
    documentation: CHECKLIST_GROUP_TITLES.documentation,
    other: CHECKLIST_GROUP_TITLES.other
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
    const item = typeof phaseOrItem === 'object' ? phaseOrItem : { phase: phaseOrItem };
    const title = resolveChecklistGroupTitle(item);
    if (title === CHECKLIST_GROUP_TITLES.technical) return 'technical';
    if (title === CHECKLIST_GROUP_TITLES.environmental) return 'environmental';
    if (title === CHECKLIST_GROUP_TITLES.documentation) return 'documentation';
    return 'other';
}

function groupChecklistByPhaseLite(items) {
    return groupChecklistForRender(items);
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

const INLINE_CHECKLIST_PHASE_TECH = 'technical';
const INLINE_CHECKLIST_PHASE_ENV = 'environmental';
const INLINE_CHECKLIST_PHASE_DOC = 'documentation';

function inlineChecklistItem(phase, task, desc) {
    return { phase, task, desc, source: 'inline-baseline' };
}

function mergeActionableAndSupplemental(baseRows, supplementalRows) {
    const seen = new Set();
    const merged = [];
    [...(baseRows || []), ...(supplementalRows || [])].forEach((row) => {
        const task = String(row?.task || row?.title || '').trim();
        if (!task) {
            return;
        }
        const key = `${row.phase || 'other'}::${task}`.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        merged.push(row);
    });
    return merged.slice(0, 8);
}

function runGetActionableChecklist(industry, context) {
    const getter = globalThis.TradeComplyActionableChecklist?.getActionableChecklist
        || globalThis.getActionableChecklist;
    if (typeof getter === 'function') {
        return getter(industry, context);
    }
    return [];
}

function buildActionableChecklistBase(options = {}) {
    const resolvedVertical = resolveChecklistVerticalForSession(options);
    const context = {
        country: options.country || AppState.currentCountry || 'US',
        direction: options.direction || AppState.currentDirection || 'export',
        productQuery: options.productQuery
            || AppState.lastReport?.productQuery
            || AppState.aiContext?.product_query
            || ''
    };
    let rows = runGetActionableChecklist(resolvedVertical, context);
    if (!rows.length && resolvedVertical !== 'electronics') {
        rows = runGetActionableChecklist('electronics', context);
    }
    if (!rows.length) {
        rows = buildInlineActionableChecklistFallback(resolvedVertical, context);
    }
    return rows;
}

/** Last-resort rows when actionable-checklist.js failed to load in the browser. */
function buildInlineActionableChecklistFallback(industry, context = {}) {
    const phaseDoc = 'documentation';
    const phaseEnv = 'environmental';
    const shared = [
        inlineChecklistItem(
            phaseDoc,
            'Prepare commercial invoice & conformity documentation pack',
            'Bundle invoice, packing list, conformity certificates, and test reports for customs clearance.'
        ),
        inlineChecklistItem(
            phaseDoc,
            'Validate HS classification & tariff exposure',
            'Cross-check declared HS code against product function and screen destination tariff / trade-remedy lists before filing.'
        )
    ];
    if (industry === 'new-energy') {
        return [
            inlineChecklistItem(
                phaseEnv,
                'Confirm battery & chemical substance compliance',
                'Check lithium battery UN38.3, MSDS/SDS reports, RoHS/REACH substance limits, and battery recycling labeling obligations.'
            ),
            inlineChecklistItem(
                phaseDoc,
                'Obtain air-freight dangerous goods approval (IATA DGR / UN38.3)',
                'Secure carrier acceptance for lithium batteries; attach UN38.3 summary, proper marks, and shipper declaration.'
            ),
            ...shared
        ];
    }
    if (industry === 'semiconductor') {
        return [
            inlineChecklistItem(
                phaseDoc,
                'Review BIS ECCN classification & export controls',
                'Screen advanced computing, semiconductor, and telecom items against BIS ECCN lists, Entity List, and license requirements.'
            ),
            ...shared
        ];
    }
    return shared;
}

function finalizeChecklistRows(rows, source = 'industry') {
    const api = getChecklistApi();
    let checklist = Array.isArray(rows) ? rows : [];
    if (api?.normalizeChecklist) {
        checklist = api.normalizeChecklist(checklist, source);
    }
    return checklist.map((item, index) => ({
        ...item,
        id: String(item.id || `${item.phase || 'other'}::${item.task || index}`).slice(0, 120)
    }));
}

function applyIndustryChecklistBaseline(checklist, options = {}) {
    return buildComplianceChecklistForResults([], {
        ...options,
        supplementalOnly: Array.isArray(checklist) ? checklist : []
    });
}

function buildComplianceChecklistForResults(tags, options = {}) {
    const api = getChecklistApi();
    const country = options.country || AppState.currentCountry || 'US';
    const direction = options.direction || AppState.currentDirection || 'export';
    const productQuery = options.productQuery
        || AppState.lastReport?.productQuery
        || AppState.aiContext?.product_query
        || '';
    const resolvedVertical = resolveChecklistVerticalForSession({
        vertical: options.vertical,
        productQuery,
        hsCode: options.hsCode,
        forceVertical: options.forceVertical
    });
    const aiChecklist = collectDynamicAiChecklists(options);

    let supplemental = Array.isArray(options.supplementalOnly) ? options.supplementalOnly : [];
    if (!options.supplementalOnly) {
        if (api?.buildSessionChecklist) {
            supplemental = api.buildSessionChecklist({
                tags: tags || [],
                aiChecklist,
                country,
                direction,
                includeBaseline: false,
                vertical: resolvedVertical
            });
        } else {
            supplemental = mergeTagChecklistsInline(tags);
            if (aiChecklist.length > 0 && api?.mergeChecklists) {
                supplemental = api.mergeChecklists(supplemental, aiChecklist);
            }
        }
    }

    supplemental = filterChecklistRowsForSession(supplemental, {
        vertical: resolvedVertical,
        productQuery
    });

    const base = buildActionableChecklistBase({
        vertical: resolvedVertical,
        country,
        direction,
        productQuery,
        hsCode: options.hsCode
    });

    let merged = mergeActionableAndSupplemental(base, supplemental);
    if (!merged.length) {
        merged = buildActionableChecklistBase({
            vertical: resolvedVertical,
            country,
            direction,
            productQuery,
            hsCode: options.hsCode
        });
    }

    return finalizeChecklistRows(merged, 'actionable');
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
        includeBaseline: options.includeBaseline,
        productQuery: options.productQuery,
        vertical: options.vertical,
        hsCode: options.hsCode
    });
    renderComplianceChecklistPanel(targetId, checklist);
    const el = document.getElementById(targetId);
    if (el && checklist.length > 0) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return checklist;
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

    try {
        let checklistData = Array.isArray(checklist) ? checklist : [];
        if (!checklistData.length) {
            checklistData = buildComplianceChecklistForResults([], {
                country: AppState.currentCountry,
                direction: AppState.currentDirection,
                productQuery: AppState.lastReport?.productQuery || AppState.aiContext?.product_query,
                vertical: AppState.searchOrigin
            });
        }

        AppState.complianceChecklist = checklistData;

        if (!checklistData.length) {
            container.hidden = true;
            container.style.display = 'none';
            container.innerHTML = '';
            container.classList.remove('compliance-checklist-container--visible');
            return;
        }

        container.removeAttribute('hidden');
        container.style.display = '';
        container.hidden = false;

        const groups = groupChecklistForRender(checklistData);
        const groupsHtml = groups.map((group) => `
            <div class="compliance-checklist-phase">
                <h3 class="compliance-checklist-phase-title">${escapeHtml(group.phaseLabel || group.phase || 'Other compliance actions')}</h3>
                <ul class="compliance-checklist-items">
                    ${group.items.map((item) => {
                        const itemId = String(item.id || item.task || 'checklist-item');
                        const checked = AppState.checklistChecked[itemId];
                        const rowClass = checked
                            ? 'compliance-checklist-item is-done'
                            : 'compliance-checklist-item';
                        const completedClass = checked ? ' completed' : '';
                        return `
                        <li class="${rowClass}" data-checklist-id="${escapeHtml(itemId)}">
                            <label class="compliance-checklist-label">
                                <input type="checkbox" class="compliance-checklist-checkbox" data-checklist-id="${escapeHtml(itemId)}" ${checked ? 'checked' : ''}>
                                <span class="compliance-checklist-task${completedClass}">${escapeHtml(item.task)}</span>
                            </label>
                            ${item.desc ? `<p class="compliance-checklist-desc${completedClass}">${escapeHtml(item.desc)}</p>` : ''}
                        </li>`;
                    }).join('')}
                </ul>
            </div>
        `).join('');

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
    } catch (error) {
        console.error('Failed to render compliance checklist:', error);
        if (container.dataset.checklistFallbackRetry === '1') {
            return;
        }
        container.dataset.checklistFallbackRetry = '1';
        const fallback = buildComplianceChecklistForResults([], {
            country: AppState.currentCountry,
            direction: AppState.currentDirection,
            productQuery: AppState.lastReport?.productQuery || AppState.aiContext?.product_query,
            vertical: AppState.searchOrigin
        });
        if (fallback.length) {
            renderComplianceChecklistPanel(containerId, fallback);
        }
    }
}

function getChecklistForReport() {
    return (AppState.complianceChecklist || []).map((item) => {
        const itemId = String(item.id || item.task || 'checklist-item');
        return {
            ...item,
            id: itemId,
            checked: Boolean(AppState.checklistChecked[itemId])
        };
    });
}

function buildFlowLabel(direction, countryCode) {
    const countryApi = global.TradeComplyCountry;
    const dir = direction === 'import' ? 'import' : 'export';
    const countryLabel = countryApi ? countryApi.getCountryLabel(countryCode) : countryCode;
    if (dir === 'import') {
        return `CN ← ${countryLabel}`;
    }
    return `CN → ${countryLabel}`;
}

function getEnterprisePrintApi() {
    return global.TradeComplyEnterprisePrint || null;
}

function buildReportChecklistRowsHtml(items) {
    const printApi = getEnterprisePrintApi();
    if (printApi?.buildEnterprisePrintChecklistRowsHtml) {
        return printApi.buildEnterprisePrintChecklistRowsHtml(items);
    }
    return (items || []).map((item) => `
        <tr class="checklist-print-row">
            <td class="checklist-print-box"><span class="print-check">${item.checked ? '&#9745;' : '&#9744;'}</span></td>
            <td class="checklist-print-phase">${escapeHtml(item.phase || '')}</td>
            <td class="checklist-print-task"><strong>${escapeHtml(item.task)}</strong></td>
            <td class="checklist-print-signoff"></td>
        </tr>
    `).join('');
}

function getPrintEscapeHtml() {
    if (typeof global.escapeHtml === 'function') {
        return global.escapeHtml;
    }
    if (typeof escapeHtml === 'function') {
        return escapeHtml;
    }
    const printApi = getEnterprisePrintApi();
    if (printApi?.escapeHtmlForPrint) {
        return printApi.escapeHtmlForPrint;
    }
    return (text) => String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Back-compat: delegate to fluid A4 document builder when available */
function buildEnterpriseReportHtmlCompat(report, esc, printApi) {
    if (printApi?.assembleEnterprisePrintDocument) {
        return printApi.assembleEnterprisePrintDocument(report, esc);
    }
    if (printApi?.buildEnterprisePrintHtml) {
        return printApi.buildEnterprisePrintHtml(report, esc);
    }
    return '';
}

function buildEnterpriseReportHtml(report) {
    const printApi = getEnterprisePrintApi();
    const esc = getPrintEscapeHtml();
    if (printApi?.assembleEnterprisePrintDocument) {
        return printApi.assembleEnterprisePrintDocument(report, esc);
    }
    if (printApi?.buildEnterprisePrintHtml) {
        return printApi.buildEnterprisePrintHtml(report, esc);
    }
    return buildEnterpriseReportHtmlCompat(report, esc, printApi);
}

function buildEnterpriseReportForPrint(baseReport = {}) {
    const productQuery = baseReport.productQuery
        || AppState.lastReport?.productQuery
        || '';
    const vertical = resolveChecklistVerticalForSession({
        vertical: baseReport.vertical,
        productQuery
    });

    let checklist = [];
    if (Array.isArray(baseReport.checklist) && baseReport.checklist.length) {
        checklist = baseReport.checklist.map((item) => {
            const itemId = String(item.id || item.task || 'checklist-item');
            return {
                ...item,
                id: itemId,
                checked: Boolean(AppState.checklistChecked?.[itemId])
            };
        });
    } else if (typeof getChecklistForReport === 'function') {
        checklist = getChecklistForReport();
    }

    if (!checklist.length && typeof buildComplianceChecklistForResults === 'function') {
        checklist = buildComplianceChecklistForResults([], {
            productQuery,
            vertical,
            country: baseReport.country || AppState.currentCountry,
            direction: baseReport.directionRaw || AppState.currentDirection
        });
    }

    if (!checklist.length) {
        checklist = finalizeChecklistRows(
            buildActionableChecklistBase({
                vertical,
                productQuery,
                country: baseReport.country || AppState.currentCountry,
                direction: baseReport.directionRaw || AppState.currentDirection
            }),
            'actionable-print-fallback'
        );
    }

    const printApi = getEnterprisePrintApi();
    const executiveSummary = printApi?.getExecutiveSummary
        ? printApi.getExecutiveSummary(printApi.resolvePrintIndustry
            ? printApi.resolvePrintIndustry({ ...baseReport, vertical })
            : vertical)
        : (printApi?.buildExecutiveSummaryForEnterpriseReport
            ? printApi.buildExecutiveSummaryForEnterpriseReport({ ...baseReport, vertical, checklist })
            : '');

    return {
        ...baseReport,
        vertical,
        checklist,
        executiveSummary,
        generatedAtLabel: baseReport.generatedAtLabel
            || (typeof formatReportDate === 'function' && baseReport.generatedAt
                ? formatReportDate(baseReport.generatedAt)
                : '')
    };
}

/**
 * Delegates to TradeComplyEnterprisePrint.print (popup sandbox + iframe fallback).
 */
function printEnterprisePrecheckReport(report) {
    const printApi = getEnterprisePrintApi();
    const industry = printApi?.resolvePrintIndustry
        ? printApi.resolvePrintIndustry(report)
        : (report.vertical || report.industry || '');

    if (printApi?.print) {
        const ok = printApi.print(report, industry);
        if (ok !== false) {
            return;
        }
    }

    if (printApi?.printEnterprisePrecheckReport) {
        const ok = printApi.printEnterprisePrecheckReport(report, industry);
        if (ok !== false) {
            return;
        }
    }

    const html = buildEnterpriseReportHtml(report);
    if (!html || !String(html).includes('report-container')) {
        console.error('Enterprise print HTML empty. TradeComplyEnterprisePrint=', global.TradeComplyEnterprisePrint);
        window.alert('Print module did not load. Please hard-refresh (Cmd+Shift+R) and try again.');
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'tc-print-frame';
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:210mm;min-height:400px;border:0;opacity:0;pointer-events:none;z-index:-1;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 120000);
    }, 250);
}

    global.mountComplianceChecklist = mountComplianceChecklist;
    global.buildComplianceChecklistForResults = buildComplianceChecklistForResults;
    global.placeChecklistSlotAfterPenaltyCases = placeChecklistSlotAfterPenaltyCases;
    global.placeChecklistSlotAfterRiskCards = placeChecklistSlotAfterPenaltyCases;
    global.extractChecklistFromApiPayload = extractChecklistFromApiPayload;
    global.collectDynamicAiChecklists = collectDynamicAiChecklists;
    global.renderComplianceChecklistPanel = renderComplianceChecklistPanel;
    global.applyIndustryChecklistBaseline = applyIndustryChecklistBaseline;
    global.resolveChecklistVerticalForSession = resolveChecklistVerticalForSession;
    global.filterChecklistRowsForSession = filterChecklistRowsForSession;
    global.buildEnterpriseReportForPrint = buildEnterpriseReportForPrint;
    global.buildEnterpriseReportHtml = buildEnterpriseReportHtml;
    global.printEnterprisePrecheckReport = printEnterprisePrecheckReport;
    global.getEnterprisePrintApi = getEnterprisePrintApi;
    global.buildFlowLabel = buildFlowLabel;
    global.getChecklistForReport = getChecklistForReport;
}(typeof globalThis !== 'undefined' ? globalThis : window));
