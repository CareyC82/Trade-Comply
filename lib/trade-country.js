/**
 * Trade partner country / region codes for import-export screening.
 * Canonical mapping lives in data/country-registry.json via lib/country-registry.js.
 */

const registry = require('./country-registry');

const COUNTRY_CODES = new Set(registry.getCanonicalCodes());
const EXPORT_OPTIONS = registry.getExportOptions();
const IMPORT_OPTIONS = registry.getImportOptions();

function normalizeCountryCode(value) {
    return registry.normalizeCountryCode(value);
}

function getCountryOptionsForDirection(direction) {
    return registry.getCountryOptionsForDirection(direction);
}

function getCountryLabel(code) {
    return registry.getCountryLabel(code);
}

function getTagCountry(tag) {
    if (!tag || typeof tag !== 'object') {
        return 'GLOBAL';
    }
    return normalizeCountryCode(tag.country || tag.trade_country || 'GLOBAL');
}

function countryMatchesSelection(tag, selectedCountry) {
    const tagCountry = getTagCountry(tag);
    const selected = normalizeCountryCode(selectedCountry);

    if (tagCountry === selected) {
        return true;
    }
    if (tagCountry === 'GLOBAL' || selected === 'GLOBAL') {
        return tagCountry === 'GLOBAL';
    }
    return false;
}

function countryPriorityScore(tag, selectedCountry) {
    const selected = normalizeCountryCode(selectedCountry);
    const tagCountry = getTagCountry(tag);
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
        return `Showing ${baselineCount} China ${direction === 'import' ? 'import' : 'export'} baseline rule${baselineCount === 1 ? '' : 's'}. No ${selectedLabel}-specific ${roleLabel} barriers found for this product/HS Code yet.`;
    }

    return `Showing ${total} rule(s). None are tagged for ${selectedLabel}; review other markets below.`;
}

const api = {
    COUNTRY_CODES,
    EXPORT_OPTIONS,
    IMPORT_OPTIONS,
    normalizeCountryCode,
    getCountryOptionsForDirection,
    getCountryLabel,
    getTagCountry,
    countryMatchesSelection,
    countryPriorityScore,
    isExactCountryMatch,
    isChinaBaselineRule,
    getTagCountryBadgeCode,
    getTagCountryBadgeTitle,
    getCounterpartyRoleLabel,
    analyzeCountryCoverage,
    buildCountryContextMessage,
    getComplianceFocus: registry.getComplianceFocus
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountry = api;
}
