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

const api = {
    COUNTRY_CODES,
    EXPORT_OPTIONS,
    IMPORT_OPTIONS,
    normalizeCountryCode,
    getCountryOptionsForDirection,
    getCountryLabel,
    getTagCountry,
    countryMatchesSelection,
    countryPriorityScore
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountry = api;
}
