/**
 * Trade partner country / region codes for import-export screening.
 * Canonical mapping: lib/country-registry.js (Node + browser).
 */

function resolveRegistry() {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyCountryRegistry) {
        return globalThis.TradeComplyCountryRegistry;
    }
    if (typeof require === 'function') {
        try {
            return require('./country-registry');
        } catch (error) {
            /* browser without bundle */
        }
    }
    return null;
}

const registry = resolveRegistry();

const FALLBACK_EXPORT_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'EU', label: 'European Union' },
    { value: 'ASEAN', label: 'ASEAN (Vietnam / Malaysia)' },
    { value: 'RU', label: 'Russia' },
    { value: 'GLOBAL', label: 'Other' }
];

const FALLBACK_IMPORT_OPTIONS = [
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'US', label: 'United States' },
    { value: 'GLOBAL', label: 'Other' }
];

function getRegistry() {
    return registry || {
        getCanonicalCodes: () => ['US', 'EU', 'ASEAN', 'RU', 'TW', 'JP', 'KR', 'GLOBAL'],
        getExportOptions: () => FALLBACK_EXPORT_OPTIONS,
        getImportOptions: () => FALLBACK_IMPORT_OPTIONS,
        normalizeCountryCode: (value) => {
            const raw = String(value || '').trim().toUpperCase();
            const map = { USA: 'US', OTHER: 'GLOBAL', CHINA: 'GLOBAL' };
            return map[raw] || raw || 'GLOBAL';
        },
        getCountryLabel: (code) => code,
        getCountryOptionsForDirection: (direction) => (
            direction === 'import' ? FALLBACK_IMPORT_OPTIONS : FALLBACK_EXPORT_OPTIONS
        ),
        getComplianceFocus: () => ''
    };
}

const reg = getRegistry();
const COUNTRY_CODES = new Set(reg.getCanonicalCodes());
const EXPORT_OPTIONS = reg.getExportOptions();
const IMPORT_OPTIONS = reg.getImportOptions();

function normalizeCountryCode(value) {
    return reg.normalizeCountryCode(value);
}

function getCountryOptionsForDirection(direction) {
    return reg.getCountryOptionsForDirection(direction);
}

function getCountryLabel(code) {
    return reg.getCountryLabel(code);
}

function getTagCountry(tag) {
    if (!tag || typeof tag !== 'object') {
        return 'GLOBAL';
    }
    return normalizeCountryCode(tag.country || tag.trade_country || 'GLOBAL');
}

/** Regional baseline tags encode origin in tag_id (e.g. CL-TW-001). */
function getRegionalOriginFromTagId(tagId) {
    const match = /^CL-(TW|JP|KR|RU|ASEAN)-/i.exec(String(tagId || ''));
    return match ? normalizeCountryCode(match[1]) : null;
}

function getEffectiveTagCountry(tag) {
    return getRegionalOriginFromTagId(tag?.tag_id) || getTagCountry(tag);
}

function countryMatchesSelection(tag, selectedCountry) {
    const tagCountry = getEffectiveTagCountry(tag);
    const selected = normalizeCountryCode(selectedCountry);

    if (tagCountry === selected) {
        return true;
    }
    if (tagCountry === 'GLOBAL') {
        return true;
    }
    return false;
}

/**
 * Keep only rules for the selected counterparty + China baseline (GLOBAL).
 */
function filterTagsForSelectedCountry(tags, selectedCountry) {
    return (tags || []).filter((tag) => countryMatchesSelection(tag, selectedCountry));
}

function countryPriorityScore(tag, selectedCountry) {
    const selected = normalizeCountryCode(selectedCountry);
    const tagCountry = getEffectiveTagCountry(tag);
    if (tagCountry === selected) {
        return 100;
    }
    if (tagCountry === 'GLOBAL') {
        return 40;
    }
    return 0;
}

function isExactCountryMatch(tag, selectedCountry) {
    return countryPriorityScore(tag, selectedCountry) >= 100;
}

function isChinaBaselineRule(tag) {
    return getTagCountry(tag) === 'GLOBAL';
}

function getTagCountryBadgeCode(tag, direction = 'export') {
    const tagCountry = getTagCountry(tag);
    if (tagCountry === 'GLOBAL') {
        return 'CN';
    }
    return tagCountry;
}

function getTagCountryBadgeTitle(tag, direction = 'export') {
    const tagCountry = getTagCountry(tag);
    if (tagCountry === 'GLOBAL') {
        return direction === 'import'
            ? 'China import / inbound compliance (general)'
            : 'China export / outbound compliance (general)';
    }
    if (direction === 'import') {
        return `Origin / source market: ${getCountryLabel(tagCountry)}`;
    }
    return `Destination / counterparty market: ${getCountryLabel(tagCountry)}`;
}

function getCounterpartyRoleLabel(direction = 'export') {
    return direction === 'import' ? 'origin' : 'destination';
}

function analyzeCountryCoverage(tags, selectedCountry, direction = 'export') {
    const selected = normalizeCountryCode(selectedCountry);
    const selectedLabel = getCountryLabel(selected);
    let exactCount = 0;
    let baselineCount = 0;
    let otherCount = 0;

    (tags || []).forEach((tag) => {
        const tagCountry = getTagCountry(tag);
        if (tagCountry === selected) {
            exactCount += 1;
        } else if (tagCountry === 'GLOBAL') {
            baselineCount += 1;
        } else {
            otherCount += 1;
        }
    });

    return {
        selected,
        selectedLabel,
        direction,
        roleLabel: getCounterpartyRoleLabel(direction),
        exactCount,
        baselineCount,
        otherCount,
        total: (tags || []).length
    };
}

function buildCountryContextMessage(coverage) {
    const {
        exactCount,
        baselineCount,
        total,
        selectedLabel,
        roleLabel,
        direction
    } = coverage;

    if (total === 0) {
        return '';
    }

    if (exactCount > 0 && baselineCount > 0) {
        return `Includes ${exactCount} rule(s) for your selected ${roleLabel} (${selectedLabel}), plus ${baselineCount} China ${direction === 'import' ? 'import' : 'export'} baseline rule(s).`;
    }

    if (exactCount > 0) {
        return `${exactCount} rule(s) match your selected ${roleLabel}: ${selectedLabel}.`;
    }

    if (baselineCount > 0) {
        return `Showing ${baselineCount} China ${direction === 'import' ? 'import' : 'export'} baseline rule${baselineCount === 1 ? '' : 's'}. No product-specific ${selectedLabel} ${roleLabel} rule matched yet; review the selected market focus and baseline rules before relying on the screen.`;
    }

    return `Showing ${total} rule(s). None are tagged for ${selectedLabel}; review other markets below.`;
}

const tradeCountryApi = {
    COUNTRY_CODES,
    EXPORT_OPTIONS,
    IMPORT_OPTIONS,
    normalizeCountryCode,
    getCountryOptionsForDirection,
    getCountryLabel,
    getTagCountry,
    countryMatchesSelection,
    filterTagsForSelectedCountry,
    countryPriorityScore,
    isExactCountryMatch,
    isChinaBaselineRule,
    getTagCountryBadgeCode,
    getTagCountryBadgeTitle,
    getCounterpartyRoleLabel,
    analyzeCountryCoverage,
    buildCountryContextMessage,
    getComplianceFocus: (...args) => reg.getComplianceFocus(...args)
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = tradeCountryApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountry = tradeCountryApi;
}
