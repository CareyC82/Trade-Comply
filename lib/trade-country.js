/**
 * Trade partner country / region codes for import-export screening.
 */

const COUNTRY_CODES = new Set(['US', 'EU', 'ASEAN', 'RU', 'TW', 'JP', 'KR', 'GLOBAL', 'OTHER']);

const EXPORT_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'EU', label: 'European Union' },
    { value: 'ASEAN', label: 'ASEAN (Vietnam / Malaysia)' },
    { value: 'RU', label: 'Russia' },
    { value: 'OTHER', label: 'Other' }
];

const IMPORT_OPTIONS = [
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'US', label: 'United States' },
    { value: 'OTHER', label: 'Other' }
];

const LABEL_BY_CODE = Object.fromEntries(
    [...EXPORT_OPTIONS, ...IMPORT_OPTIONS].map((item) => [item.value, item.label])
);

function normalizeCountryCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    const aliases = {
        USA: 'US',
        'UNITED STATES': 'US',
        EUROPE: 'EU',
        'EUROPEAN UNION': 'EU',
        VIETNAM: 'ASEAN',
        MALAYSIA: 'ASEAN',
        RUSSIA: 'RU',
        TAIWAN: 'TW',
        JAPAN: 'JP',
        KOREA: 'KR',
        'SOUTH KOREA': 'KR',
        GLOBAL: 'GLOBAL',
        CN: 'GLOBAL',
        CHINA: 'GLOBAL'
    };
    const code = aliases[raw] || raw;
    if (COUNTRY_CODES.has(code)) {
        return code;
    }
    return 'OTHER';
}

function getCountryOptionsForDirection(direction) {
    return direction === 'import' ? IMPORT_OPTIONS : EXPORT_OPTIONS;
}

function getCountryLabel(code) {
    return LABEL_BY_CODE[normalizeCountryCode(code)] || code || 'Other';
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
    if (selected === 'OTHER') {
        return !['US', 'EU', 'ASEAN', 'RU', 'TW', 'JP', 'KR'].includes(tagCountry);
    }
    if (tagCountry === 'GLOBAL') {
        return true;
    }
    return tagCountry === selected;
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
    if (selected === 'OTHER' && !['US', 'EU', 'ASEAN', 'RU', 'TW', 'JP', 'KR'].includes(tagCountry)) {
        return 60;
    }
    return 0;
}

function isExactCountryMatch(tag, selectedCountry) {
    return countryPriorityScore(tag, selectedCountry) >= 100;
}

function isChinaBaselineRule(tag) {
    return getTagCountry(tag) === 'GLOBAL';
}

/**
 * Short badge code shown on cards: CN = China export/import baseline, US/EU/... = counterparty-specific.
 */
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
    buildCountryContextMessage
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountry = api;
}
