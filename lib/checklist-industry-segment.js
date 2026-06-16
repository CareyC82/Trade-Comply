/**
 * Strict industry segmentation for compliance checklists — prevents cross-industry tasks
 * (e.g. FCC Part 15 on new-energy / semiconductor sessions).
 */
'use strict';

const VALID_VERTICALS = new Set([
    'electronics',
    'new-energy',
    'semiconductor',
    'data-center',
    'industrial-automation',
    'healthcare-lab'
]);

/** Consumer-electronics RF / labeling tasks — never on specialized non-consumer verticals. */
const CONSUMER_ELECTRONICS_ONLY_PATTERNS = [
    /\bfcc\b/i,
    /\bpart\s*15\b/i,
    /\bpart\s*18\b/i,
    /\bfcc\s*id\b/i,
    /\bintentional\s*radiator\b/i,
    /\brf\s*exposure\b/i,
    /\bspecific\s*absorption\s*rate\b/i,
    /\bsar\b/i,
    /\bimei\b/i
];

/** Solar / PV baseline tasks — not for semiconductor unless query is solar-related. */
const NEW_ENERGY_ONLY_PATTERNS = [
    /\buflpa\b/i,
    /\bpolysilicon\b/i,
    /\bphotovoltaic\b/i,
    /\bpv\s+module\b/i,
    /\bad\/cvd\b/i
];

function normalizeVertical(value) {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyActionableChecklist?.normalizeIndustry) {
        return globalThis.TradeComplyActionableChecklist.normalizeIndustry(value);
    }
    if (typeof require === 'function') {
        try {
            const { normalizeIndustry } = require('./actionable-checklist');
            return normalizeIndustry(value);
        } catch (e) {
            // fall through
        }
    }
    const key = String(value || '').trim().toLowerCase();
    return VALID_VERTICALS.has(key) ? key : null;
}

function resolveChecklistVertical(context = {}) {
    const forced = context.forceVertical === true;
    const explicitOption = normalizeVertical(context.vertical);
    if (forced && explicitOption) {
        return explicitOption;
    }

    let detectFn = context.detectProductProfile || null;
    if (!detectFn && typeof globalThis !== 'undefined' && globalThis.TradeComplyIndustryBaseline?.detectProductProfile) {
        detectFn = globalThis.TradeComplyIndustryBaseline.detectProductProfile;
    }
    if (!detectFn && typeof require === 'function') {
        try {
            detectFn = require('./industry-checklist-baseline').detectProductProfile;
        } catch (e) {
            detectFn = null;
        }
    }
    if (detectFn) {
        const profile = detectFn(
            context.description || context.productQuery || '',
            context.hsCode || context.hscode || ''
        );
        const fromProfile = normalizeVertical(profile?.vertical);
        if (fromProfile) {
            return fromProfile;
        }
    }

    if (explicitOption) {
        return explicitOption;
    }

    const searchOrigin = normalizeVertical(context.searchOrigin);
    if (searchOrigin) {
        return searchOrigin;
    }

    return 'electronics';
}

function getChecklistItemHaystack(item) {
    return `${item?.task || item?.title || ''} ${item?.desc || item?.description || ''}`;
}

function isConsumerElectronicsOnlyChecklistItem(item) {
    const haystack = getChecklistItemHaystack(item);
    return CONSUMER_ELECTRONICS_ONLY_PATTERNS.some((pattern) => pattern.test(haystack));
}

function isNewEnergyOnlyChecklistItem(item) {
    const haystack = getChecklistItemHaystack(item);
    return NEW_ENERGY_ONLY_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * @param {Array<object>} items
 * @param {string|null} vertical
 * @returns {Array<object>}
 */
function filterChecklistForVertical(items, vertical) {
    const safeVertical = normalizeVertical(vertical) || 'electronics';
    if (safeVertical === 'electronics') {
        return Array.isArray(items) ? [...items] : [];
    }

    return (items || []).filter((item) => {
        if (!item || (!item.task && !item.title)) {
            return false;
        }
        if (isConsumerElectronicsOnlyChecklistItem(item)) {
            return false;
        }
        if (safeVertical === 'semiconductor' && isNewEnergyOnlyChecklistItem(item)) {
            return false;
        }
        return true;
    });
}

const checklistSegmentApi = {
    VALID_VERTICALS,
    resolveChecklistVertical,
    filterChecklistForVertical,
    isConsumerElectronicsOnlyChecklistItem,
    isNewEnergyOnlyChecklistItem
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = checklistSegmentApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyChecklistSegment = checklistSegmentApi;
}
