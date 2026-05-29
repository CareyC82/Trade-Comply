/**
 * Dual-country HS / HTS formatting for China export + counterparty import display.
 */

const DESTINATION_META = {
    US: {
        flag: '🇺🇸',
        label: 'United States Import HTS Code',
        codeType: 'HTS',
        complianceHint: 'Section 301 tariff evaluation may apply for US import.'
    },
    EU: {
        flag: '🇪🇺',
        label: 'European Union Import TARIC Code',
        codeType: 'TARIC',
        complianceHint: 'EU TARIC/CN statistical digits may extend beyond HS-6.'
    },
    JP: {
        flag: '🇯🇵',
        label: 'Japan Import HS Code',
        codeType: 'Japan HS',
        complianceHint: 'Japan statistical suffix digits may differ after the 6-digit HS subheading.'
    },
    KR: {
        flag: '🇰🇷',
        label: 'South Korea Import HS Code',
        codeType: 'Korea HS',
        complianceHint: 'Korea national tariff lines may add digits after HS-6.'
    },
    ASEAN: {
        flag: '🌏',
        label: 'ASEAN Import HS Code',
        codeType: 'ASEAN HS',
        complianceHint: 'ASEAN members may apply national extensions to the harmonized 6-digit subheading.'
    },
    TW: {
        flag: '🇹🇼',
        label: 'Taiwan Export HS Code',
        codeType: 'Taiwan HS',
        complianceHint: 'Cross-strait trade may require additional PRC import licensing checks.'
    },
    RU: {
        flag: '🇷🇺',
        label: 'Russia Import HS Code',
        codeType: 'Russia HS',
        complianceHint: 'Sanctions and dual-use controls should be screened separately.'
    },
    GLOBAL: {
        flag: '🌐',
        label: 'Counterparty Import HS Code',
        codeType: 'National HS',
        complianceHint: 'Confirm the destination country national tariff line before filing.'
    },
    OTHER: {
        flag: '🌐',
        label: 'Counterparty Import HS Code',
        codeType: 'National HS',
        complianceHint: 'Confirm the destination country national tariff line before filing.'
    }
};

function normalizeCountryCode(value) {
    const raw = String(value || 'US').trim().toUpperCase();
    const aliases = {
        USA: 'US',
        'UNITED STATES': 'US',
        EUROPE: 'EU',
        'EUROPEAN UNION': 'EU',
        JAPAN: 'JP',
        KOREA: 'KR',
        'SOUTH KOREA': 'KR',
        VIETNAM: 'ASEAN',
        MALAYSIA: 'ASEAN'
    };
    return aliases[raw] || raw;
}

function extractDigits(code) {
    return String(code || '').replace(/\D/g, '');
}

/**
 * Format as China customs 10-digit style: XXXX.XX.XX.XX
 */
function formatTenDigitHs(code) {
    let digits = extractDigits(code);
    if (digits.length < 6) {
        return '';
    }
    if (digits.length < 10) {
        digits = digits.padEnd(10, '0');
    }
    if (digits.length > 10) {
        digits = digits.slice(0, 10);
    }
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
}

function extractHs6(code) {
    const digits = extractDigits(code);
    if (digits.length < 6) {
        return digits;
    }
    return digits.slice(0, 6);
}

function formatHs6Display(hs6) {
    const digits = extractDigits(hs6);
    if (digits.length < 6) {
        return digits;
    }
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`;
}

function getDestinationMeta(country) {
    const code = normalizeCountryCode(country);
    return DESTINATION_META[code] || DESTINATION_META.OTHER;
}

function buildCrossBorderNote(hs6, country, codeType) {
    const hs6Display = formatHs6Display(hs6);
    const meta = getDestinationMeta(country);
    const countryName = meta.label.replace(/ Import .*$/i, '').trim();
    return (
        `The first 6 digits (${hs6Display}) are globally harmonized. ` +
        `For ${countryName} import, ${codeType} ${formatTenDigitHs(hs6) || hs6Display} is typically applied` +
        (country === 'US' ? ' and subject to Section 301 tariff evaluation.' : '.')
    );
}

function ensureCrossBorderInReasoning(reasoning, note) {
    const base = String(reasoning || '').trim();
    if (!note) {
        return base;
    }
    if (base.toLowerCase().includes('globally harmonized') || base.includes(note.slice(0, 24))) {
        return base;
    }
    return base ? `${base}\n\n${note}` : note;
}

/**
 * Normalize model output + fill dual-code fields for API/frontend.
 */
function enrichClassification(raw, { direction = 'export', counterpartyCountry = 'US' } = {}) {
    const tradeDirection = direction === 'import' ? 'import' : 'export';
    const country = normalizeCountryCode(counterpartyCountry);
    const meta = getDestinationMeta(country);

    const primaryRaw = raw.china_export_hscode || raw.china_import_hscode || raw.hscode || raw.hs_code || '';
    const destRaw = raw.destination_import_code || raw.origin_export_code || raw.counterparty_hscode || '';
    const hs6 = extractHs6(raw.hs6 || primaryRaw);

    const chinaFormatted = formatTenDigitHs(raw.china_export_hscode || raw.china_import_hscode || primaryRaw);
    const destFormatted = formatTenDigitHs(destRaw || primaryRaw);

    let chinaLabel;
    let counterpartyLabel;
    let chinaCode;
    let counterpartyCode;

    if (tradeDirection === 'export') {
        chinaLabel = '🇨🇳 China Export HS Code';
        chinaCode = chinaFormatted;
        counterpartyLabel = `${meta.flag} ${meta.label}`;
        counterpartyCode = destFormatted || chinaFormatted;
    } else {
        chinaLabel = '🇨🇳 China Import HS Code';
        chinaCode = formatTenDigitHs(raw.china_import_hscode || primaryRaw) || chinaFormatted;
        const originMeta = getDestinationMeta(country);
        counterpartyLabel = `${originMeta.flag} ${originMeta.label.replace('Import', 'Export')}`;
        counterpartyCode = formatTenDigitHs(raw.origin_export_code || destRaw || primaryRaw) || destFormatted;
    }

    const crossBorderNote = String(raw.cross_border_note || '').trim()
        || buildCrossBorderNote(hs6, country, meta.codeType);

    return {
        hscode: chinaCode || formatTenDigitHs(primaryRaw),
        hs6,
        china_export_hscode: tradeDirection === 'export' ? chinaCode : '',
        china_import_hscode: tradeDirection === 'import' ? chinaCode : '',
        destination_country: country,
        destination_import_code: tradeDirection === 'export' ? counterpartyCode : '',
        origin_export_code: tradeDirection === 'import' ? counterpartyCode : '',
        destination_code_type: meta.codeType,
        china_code_label: chinaLabel,
        counterparty_code_label: counterpartyLabel,
        china_code: chinaCode,
        counterparty_code: counterpartyCode,
        trade_direction: tradeDirection,
        official_name: String(raw.official_name || '').trim(),
        confidence: String(raw.confidence || '').trim(),
        reasoning: ensureCrossBorderInReasoning(raw.reasoning, crossBorderNote),
        cross_border_note: crossBorderNote
    };
}

function buildHsCodeUserPrompt(description, { direction = 'export', counterpartyCountry = 'US' } = {}) {
    const tradeDirection = direction === 'import' ? 'import' : 'export';
    const country = normalizeCountryCode(counterpartyCountry);
    const meta = getDestinationMeta(country);

    return [
        `Trade context:`,
        `- trade_direction: ${tradeDirection}`,
        `- counterparty_country: ${country}`,
        `- destination_code_type: ${meta.codeType}`,
        '',
        'Classify the product and return JSON ONLY with this structure:',
        '{',
        '  "hs6": "6-digit harmonized subheading (digits only, e.g. 854239)",',
        '  "hscode": "Primary 10-digit code formatted XXXX.XX.XX.XX",',
        tradeDirection === 'export'
            ? '  "china_export_hscode": "10-digit China export code formatted XXXX.XX.XX.XX (pad to 10 digits)",'
            : '  "china_import_hscode": "10-digit China import code formatted XXXX.XX.XX.XX",',
        tradeDirection === 'export'
            ? `  "destination_import_code": "${country} ${meta.codeType} formatted XXXX.XX.XX.XX (often same first 8 digits, statistical suffix may differ)",`
            : `  "origin_export_code": "${country} export HS formatted XXXX.XX.XX.XX",`,
        '  "destination_country": "' + country + '",',
        '  "destination_code_type": "' + meta.codeType + '",',
        '  "official_name": "Official customs commodity name in English",',
        '  "confidence": "e.g., 95%",',
        '  "reasoning": "GIR-based justification in English",',
        '  "cross_border_note": "One sentence: first 6 digits harmonized + destination code implication (e.g. Section 301 for US)"',
        '}',
        '',
        'Product description:',
        description
    ].join('\n');
}

function buildHsCodeSystemPrompt() {
    return `You are a professional customs tariff specialist for China Customs HS classification and cross-border HS/HTS mapping.
Apply the Harmonized System General Interpretative Rules (GIR). Always return valid JSON only (no markdown).

Rules:
1. china_export_hscode / china_import_hscode MUST be a full 10-digit China customs style code formatted as XXXX.XX.XX.XX (pad with trailing zeros to reach 10 digits when the model stops at 6 or 8 digits).
2. When trade_direction is "export", also return destination_import_code for the counterparty_country using the correct national system (US=HTS, EU=TARIC, JP/KR/ASEAN=national HS).
3. hs6 must be exactly 6 digits (no dots).
4. cross_border_note must explain HS-6 harmonization and destination-country statistical suffix / trade policy (e.g. US Section 301) in one English sentence.
5. Append the same cross-border idea inside reasoning when helpful.`;
}

const api = {
    DESTINATION_META,
    normalizeCountryCode,
    formatTenDigitHs,
    extractHs6,
    formatHs6Display,
    getDestinationMeta,
    buildCrossBorderNote,
    enrichClassification,
    buildHsCodeUserPrompt,
    buildHsCodeSystemPrompt
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyHsDual = api;
}
