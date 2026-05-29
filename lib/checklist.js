/**
 * Compliance checklist merge/normalize — shared browser + Node.
 */

const PHASE_ORDER = ['technical', 'environmental', 'documentation', 'other'];
const VALID_PHASES = new Set(PHASE_ORDER);

const PHASE_ALIASES = {
    technical: 'technical',
    'pre-shipment': 'technical',
    preshipment: 'technical',
    'pre_shipment': 'technical',
    certification: 'technical',
    compliance: 'technical',
    技术核查: 'technical',
    environmental: 'environmental',
    chemical: 'environmental',
    rohs: 'environmental',
    reach: 'environmental',
    weee: 'environmental',
    green: 'environmental',
    环保注册: 'environmental',
    customs: 'documentation',
    documentation: 'documentation',
    document: 'documentation',
    licensing: 'documentation',
    shipping: 'documentation',
    单证准备: 'documentation',
    other: 'other',
    general: 'other',
    其他: 'other'
};

const PHASE_DISPLAY_LABELS = {
    technical: '📦 Pre-shipment technical & certification checks',
    environmental: '🌱 Environmental & green-market registration',
    documentation: '📑 Customs & documentation preparation',
    other: '📌 Other compliance actions'
};

/** Browser fallback when fetch of data/country-checklist-baselines.json is unavailable */
const INLINE_BASELINES = {
    US: {
        export: [
            { phase: 'technical', task: 'FCC Part 15 / Part 18 RF conformity', desc: 'Confirm intentional radiators, modular approvals, and supplier FCC IDs for wireless electronics before US entry.' },
            { phase: 'technical', task: 'Section 301 & HTS tariff exposure', desc: 'Map the 10-digit HTS line against Section 301 lists and additional duties; document country of origin and value build-up.' },
            { phase: 'documentation', task: 'BIS / Entity List screening pack', desc: 'Run restricted party and export control screening; retain end-user and end-use statements for controlled semiconductors.' }
        ],
        import: [
            { phase: 'technical', task: 'US-origin technology re-export review', desc: 'Verify US content thresholds and license conditions on components returning to China.' },
            { phase: 'documentation', task: 'US supplier ECCN / license trace', desc: 'Collect manufacturer ECCN classifications and any BIS license references in the commercial invoice packet.' }
        ]
    },
    EU: {
        export: [
            { phase: 'technical', task: 'CE / RED conformity assessment', desc: 'Ensure radio equipment meets EU RED essential requirements with Declaration of Conformity and technical file.' },
            { phase: 'environmental', task: 'RoHS & REACH substance dossier', desc: 'Document restricted substances (RoHS) and SVHC disclosures (REACH) for cables, PCBs, and housings.' },
            { phase: 'environmental', task: 'WEEE producer registration', desc: 'Confirm WEEE registration in destination member state if placing EEE on the EU market.' },
            { phase: 'documentation', task: 'EU TARIC statistical filing', desc: 'Align 10-digit TARIC/CN code with product function; retain GIR classification memo for customs audit.' }
        ],
        import: [
            { phase: 'technical', task: 'EU dual-use export license trace', desc: 'Screen EU-origin controlled technology and re-export conditions before China inbound clearance.' }
        ]
    },
    ASEAN: {
        export: [
            { phase: 'documentation', task: 'Rules of origin certificate (Form E / RCEP)', desc: 'Prepare origin documentation for Vietnam/Malaysia routes to defend against transshipment challenges.' },
            { phase: 'technical', task: 'Anti-circumvention routing review', desc: 'Document value-added steps in ASEAN to support legitimate origin claims for IC assemblies.' }
        ],
        import: [
            { phase: 'documentation', task: 'ASEAN supplier origin declaration', desc: 'Collect mill/factory certificates and BOM origin breakdown for re-exported modules.' }
        ]
    },
    RU: {
        export: [
            { phase: 'technical', task: 'Dual-use & sanctions red-line screen', desc: 'Block Russia-bound advanced computing, telecom, and fab equipment against embargo and SDN lists.' },
            { phase: 'documentation', task: 'End-use / end-user certification', desc: 'Obtain signed end-user statements and commodity classification worksheets for high-risk electronics.' }
        ],
        import: [
            { phase: 'technical', task: 'Russia-origin sanctions screening', desc: 'Verify Russia-sourced items against restricted party and import ban schedules before China entry.' }
        ]
    },
    TW: {
        import: [
            { phase: 'technical', task: 'Cross-strait semiconductor licensing', desc: 'Screen Taiwan-origin lithography, wafer, and advanced IC items for PRC import licensing and technology controls.' },
            { phase: 'documentation', task: 'Technology transfer documentation', desc: 'Retain contracts and technical parameters supporting lawful cross-strait technology flows.' }
        ],
        export: [
            { phase: 'technical', task: 'Cross-strait export control review', desc: 'Assess Taiwan-related electronics for technology transfer restrictions on outbound shipments from China.' }
        ]
    },
    JP: {
        import: [
            { phase: 'technical', task: 'PSE electrical safety conformity', desc: 'For Japan-origin electrical apparatus, confirm PSE marking and test reports where applicable to inbound use.' },
            { phase: 'technical', task: 'TELEC / radio law approval trace', desc: 'Collect Japan radio law certificates for wireless modules embedded in the product.' },
            { phase: 'documentation', task: 'Japan fab equipment import permit', desc: 'Prepare end-user statements for HS 8486/8542 precision equipment imported from Japan.' }
        ],
        export: [
            { phase: 'documentation', task: 'Japan export notification check', desc: 'Verify whether high-tech goods require Japan METI export notification before shipment.' }
        ]
    },
    KR: {
        import: [
            { phase: 'technical', task: 'KC mark / KC certification trace', desc: 'Confirm Korea-origin electrical and radio products meet KC safety requirements referenced in supplier certificates.' },
            { phase: 'technical', task: 'Memory IC end-use screening', desc: 'Screen DRAM/HBM/NAND Korea-origin ICs for technology control and end-use restrictions on China import.' },
            { phase: 'documentation', task: 'Korea supplier ECCN / license pack', desc: 'Collect Korea export classification and license references for controlled semiconductors.' }
        ],
        export: [
            { phase: 'documentation', task: 'Korea outbound license check', desc: 'Verify Korea export licensing for advanced logic and memory when re-exporting from China.' }
        ]
    },
    GLOBAL: {
        export: [
            { phase: 'documentation', task: 'China export declaration baseline', desc: 'Prepare commercial invoice, packing list, contract, and export license slots for general electronics.' },
            { phase: 'technical', task: 'Dual-use & encryption screening', desc: 'Run China export control and cryptography reviews for wireless/secure computing features.' }
        ],
        import: [
            { phase: 'documentation', task: 'China import declaration baseline', desc: 'Prepare customs declaration, origin proof, and inspection/quarantine slots as applicable.' },
            { phase: 'technical', task: 'CCC / SRRC / CEL where applicable', desc: 'Identify whether China market access certifications apply to the finished product category.' }
        ]
    }
};

let baselinesInitPromise = null;

function resolveBaselines() {
    if (typeof require === 'function') {
        try {
            const path = require('path');
            const fs = require('fs');
            const file = path.join(__dirname, '..', 'data', 'country-checklist-baselines.json');
            return JSON.parse(fs.readFileSync(file, 'utf8')).baselines || INLINE_BASELINES;
        } catch (error) {
            return INLINE_BASELINES;
        }
    }
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyChecklistBaselines) {
        return globalThis.TradeComplyChecklistBaselines;
    }
    return INLINE_BASELINES;
}

function initChecklistBaselines(basePath = 'data/country-checklist-baselines.json') {
    if (typeof require === 'function') {
        return Promise.resolve(resolveBaselines());
    }
    if (globalThis.TradeComplyChecklistBaselines) {
        return Promise.resolve(globalThis.TradeComplyChecklistBaselines);
    }
    if (!baselinesInitPromise) {
        baselinesInitPromise = fetch(basePath)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then((payload) => {
                globalThis.TradeComplyChecklistBaselines = payload.baselines || INLINE_BASELINES;
                return globalThis.TradeComplyChecklistBaselines;
            })
            .catch(() => {
                globalThis.TradeComplyChecklistBaselines = INLINE_BASELINES;
                return globalThis.TradeComplyChecklistBaselines;
            });
    }
    return baselinesInitPromise;
}

/** Read phase/stage from checklist item — prefer descriptive fields before normalized bucket keys. */
function extractRawPhaseFromItem(item) {
    if (!item || typeof item !== 'object') {
        return '';
    }
    const descriptive = [
        item.rawPhase,
        item.stage,
        item.phase_name,
        item.phaseName,
        item.group,
        item.section,
        item.checklist_phase
    ];
    for (const value of descriptive) {
        if (value !== undefined && value !== null && String(value).trim()) {
            return String(value).trim();
        }
    }
    const phase = String(item.phase || '').trim();
    if (phase && !VALID_PHASES.has(phase)) {
        return phase;
    }
    if (phase && phase !== 'other') {
        return phase;
    }
    const cat = String(item.category || item.category_label || '').trim();
    if (cat && !/^(export_ctrl|import_control|supply_chain|compulsory|wireless|other|export|import)$/i.test(cat.replace(/\s+/g, '_'))) {
        return cat;
    }
    return phase;
}

function normalizePhase(phaseOrItem) {
    const raw = typeof phaseOrItem === 'object'
        ? extractRawPhaseFromItem(phaseOrItem)
        : String(phaseOrItem || '').trim();
    if (!raw) {
        return 'other';
    }
    if (VALID_PHASES.has(raw)) {
        return raw;
    }
    if (PHASE_ALIASES[raw]) {
        return PHASE_ALIASES[raw];
    }
    const lower = raw.toLowerCase().replace(/\s+/g, ' ');
    const compact = lower.replace(/\s+/g, '_').replace(/-/g, '_');
    if (PHASE_ALIASES[compact]) {
        return PHASE_ALIASES[compact];
    }

    if (
        lower.includes('tech')
        || lower.includes('pre')
        || lower.includes('certif')
        || lower.includes('conform')
        || lower.includes('qualification')
        || lower.includes('技术')
        || lower.includes('出口前')
        || lower.includes('核查')
        || lower.includes('资质')
        || lower.includes('测试')
    ) {
        return 'technical';
    }
    if (
        lower.includes('environ')
        || lower.includes('green')
        || lower.includes('chem')
        || lower.includes('rohs')
        || lower.includes('reach')
        || lower.includes('weee')
        || lower.includes('recycle')
        || lower.includes('battery')
        || lower.includes('环保')
        || lower.includes('绿色')
        || lower.includes('注册')
    ) {
        return 'environmental';
    }
    if (
        lower.includes('custom')
        || lower.includes('doc')
        || lower.includes('海关')
        || lower.includes('单证')
        || lower.includes('tariff')
        || lower.includes('licen')
        || lower.includes('ship')
        || lower.includes('declar')
        || lower.includes('文件')
    ) {
        return 'documentation';
    }
    return 'other';
}

function getPhaseDisplayLabel(phaseOrItem) {
    const raw = typeof phaseOrItem === 'object'
        ? extractRawPhaseFromItem(phaseOrItem)
        : String(phaseOrItem || '').trim();
    const key = normalizePhase(raw || phaseOrItem);
    if (PHASE_DISPLAY_LABELS[key]) {
        return PHASE_DISPLAY_LABELS[key];
    }
    return raw ? `📌 ${raw}` : PHASE_DISPLAY_LABELS.other;
}

function normalizeChecklistItem(item, source = 'library') {
    if (!item || typeof item !== 'object') {
        return null;
    }
    const task = String(item.task || item.title || '').trim();
    const desc = String(item.desc || item.description || '').trim();
    if (!task) {
        return null;
    }
    const rawPhase = extractRawPhaseFromItem(item);
    const phase = normalizePhase(item);
    const phaseLabel = getPhaseDisplayLabel(item);
    const id = String(item.id || `${phase}::${task}`).slice(0, 120);
    return {
        id,
        rawPhase,
        phase,
        phaseLabel,
        task,
        desc,
        source
    };
}

function normalizeChecklist(items, source = 'library') {
    if (!Array.isArray(items)) {
        return [];
    }
    const seen = new Set();
    const out = [];
    items.forEach((item) => {
        const normalized = normalizeChecklistItem(item, source);
        if (!normalized) {
            return;
        }
        const key = `${normalized.phase}::${normalized.task}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push(normalized);
    });
    return out.sort((a, b) => {
        const phaseDelta = PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase);
        if (phaseDelta !== 0) {
            return phaseDelta;
        }
        return a.task.localeCompare(b.task);
    });
}

function mergeChecklists(...lists) {
    const merged = [];
    lists.forEach((list) => {
        if (Array.isArray(list)) {
            merged.push(...list);
        }
    });
    return normalizeChecklist(merged);
}

function getCountryBaselineChecklist(country, direction = 'export') {
    const baselines = resolveBaselines();
    const code = String(country || 'GLOBAL').trim().toUpperCase();
    const dir = direction === 'import' ? 'import' : 'export';
    const bucket = baselines[code] || baselines.GLOBAL || {};
    return normalizeChecklist(bucket[dir] || bucket.export || [], `baseline-${code}`);
}

function collectChecklistsFromTags(tags, selectedCountry, direction = 'export') {
    const selected = String(selectedCountry || 'GLOBAL').trim().toUpperCase();
    const dir = direction === 'import' ? 'import' : 'export';
    const out = [];

    (tags || []).forEach((tag) => {
        const tagCountry = String(tag.country || 'GLOBAL').trim().toUpperCase();
        const tagDir = tag.direction === 'import' || tag.direction === 'export' ? tag.direction : 'both';
        if (tagDir !== 'both' && tagDir !== dir) {
            return;
        }
        if (tagCountry !== selected && tagCountry !== 'GLOBAL') {
            return;
        }
        const list = normalizeChecklist(tag.checklist || [], tag.tag_id || 'tag');
        out.push(...list);
    });

    return mergeChecklists(out);
}

function buildSessionChecklist({
    tags = [],
    aiChecklist = [],
    country = 'GLOBAL',
    direction = 'export',
    includeBaseline = false
} = {}) {
    const fromTags = collectChecklistsFromTags(tags, country, direction);
    const fromAi = normalizeChecklist(aiChecklist, 'ai');
    const fromBaseline = includeBaseline
        ? getCountryBaselineChecklist(country, direction)
        : [];
    return mergeChecklists(fromBaseline, fromTags, fromAi);
}

function groupChecklistByPhase(items) {
    const groups = new Map();
    (items || []).forEach((item) => {
        const phaseKey = normalizePhase(item);
        const phaseLabel = getPhaseDisplayLabel(item);
        if (!groups.has(phaseKey)) {
            groups.set(phaseKey, { phaseKey, phaseLabel, items: [] });
        }
        groups.get(phaseKey).items.push({
            ...item,
            rawPhase: item.rawPhase || extractRawPhaseFromItem(item),
            phase: phaseKey,
            phaseLabel
        });
    });

    const orderedKeys = PHASE_ORDER
        .filter((key) => groups.has(key))
        .concat([...groups.keys()].filter((key) => !PHASE_ORDER.includes(key)));

    return orderedKeys.map((key) => groups.get(key));
}

const api = {
    PHASE_ORDER,
    INLINE_BASELINES,
    initChecklistBaselines,
    extractRawPhaseFromItem,
    normalizePhase,
    getPhaseDisplayLabel,
    normalizeChecklistItem,
    normalizeChecklist,
    mergeChecklists,
    getCountryBaselineChecklist,
    collectChecklistsFromTags,
    buildSessionChecklist,
    groupChecklistByPhase
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyChecklist = api;
}
