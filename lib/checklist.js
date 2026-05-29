/**
 * Compliance checklist merge/normalize — shared browser + Node.
 */

const PHASE_ORDER = ['技术核查', '环保注册', '单证准备', '其他'];
const VALID_PHASES = new Set(PHASE_ORDER);

function resolveBaselines() {
    if (typeof require === 'function') {
        try {
            const path = require('path');
            const fs = require('fs');
            const file = path.join(__dirname, '..', 'data', 'country-checklist-baselines.json');
            return JSON.parse(fs.readFileSync(file, 'utf8')).baselines || {};
        } catch (error) {
            return {};
        }
    }
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyChecklistBaselines) {
        return globalThis.TradeComplyChecklistBaselines;
    }
    return {};
}

function normalizePhase(phase) {
    const raw = String(phase || '').trim();
    if (VALID_PHASES.has(raw)) {
        return raw;
    }
    const lower = raw.toLowerCase();
    if (/tech|technical|核查|测试|认证|fcc|kc|pse|ce/.test(lower)) {
        return '技术核查';
    }
    if (/环保|reach|rohs|weee|注册/.test(lower)) {
        return '环保注册';
    }
    if (/单证|文件|document|license|许可/.test(lower)) {
        return '单证准备';
    }
    return raw || '其他';
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
    const phase = normalizePhase(item.phase);
    const id = String(item.id || `${phase}::${task}`).slice(0, 120);
    return {
        id,
        phase,
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
    includeBaseline = true
} = {}) {
    const fromTags = collectChecklistsFromTags(tags, country, direction);
    const fromAi = normalizeChecklist(aiChecklist, 'ai');
    const fromBaseline = includeBaseline
        ? getCountryBaselineChecklist(country, direction)
        : [];
    return mergeChecklists(fromBaseline, fromTags, fromAi);
}

function groupChecklistByPhase(items) {
    const groups = {};
    (items || []).forEach((item) => {
        const phase = item.phase || '其他';
        if (!groups[phase]) {
            groups[phase] = [];
        }
        groups[phase].push(item);
    });
    return PHASE_ORDER
        .filter((phase) => groups[phase]?.length)
        .concat(Object.keys(groups).filter((phase) => !PHASE_ORDER.includes(phase)))
        .map((phase) => ({ phase, items: groups[phase] }));
}

const api = {
    PHASE_ORDER,
    normalizePhase,
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
