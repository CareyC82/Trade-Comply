/**
 * Dual-country HS / HTS formatting for China export + counterparty import display.
 */

function resolveCountryRegistry() {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyCountryRegistry) {
        return globalThis.TradeComplyCountryRegistry;
    }
    if (typeof require === 'function') {
        try {
            return require('./country-registry');
        } catch (error) {
            return null;
        }
    }
    return null;
}

const countryRegistry = resolveCountryRegistry();
const normalizeRegistryCountry = countryRegistry
    ? countryRegistry.normalizeCountryCode.bind(countryRegistry)
    : (value) => String(value || 'US').trim().toUpperCase();
const getCountryLabel = countryRegistry
    ? countryRegistry.getCountryLabel.bind(countryRegistry)
    : (code) => code;

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
    return normalizeRegistryCountry(value || 'US');
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

/**
 * Format US HTS style: XXXX.XX.XXXX for 10-digit tariff lines.
 */
function formatUsHtsCode(code) {
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
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 10)}`;
}

function formatCounterpartyHsCode(code, country) {
    const normalized = normalizeCountryCode(country);
    const digits = extractDigits(code);
    if (digits.length < 6) {
        return '';
    }
    if (normalized === 'US') {
        return formatUsHtsCode(code);
    }
    return formatTenDigitHs(code);
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
    if (DESTINATION_META[code]) {
        return DESTINATION_META[code];
    }
    return {
        flag: '🌐',
        label: `${getCountryLabel(code)} Import HS Code`,
        codeType: 'National HS',
        complianceHint: 'Confirm the destination country national tariff line before filing.'
    };
}

function buildCrossBorderNote(hs6, country, codeType) {
    const hs6Display = formatHs6Display(hs6);
    const normalizedCountry = normalizeCountryCode(country);
    const meta = getDestinationMeta(normalizedCountry);
    const countryName = meta.label.replace(/ Import .*$/i, '').trim();
    const nationalCode = formatCounterpartyHsCode(hs6, normalizedCountry) || hs6Display;
    return (
        `The first 6 digits (${hs6Display}) are globally harmonized. ` +
        `For ${countryName} import, ${codeType} ${nationalCode} is a preliminary national-line placeholder until a broker confirms the statistical suffix` +
        (normalizedCountry === 'US' ? ' and subject to Section 301 tariff evaluation.' : '.')
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
    const destFormatted = formatCounterpartyHsCode(destRaw || primaryRaw, country);

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
        counterpartyCode = formatCounterpartyHsCode(raw.origin_export_code || destRaw || primaryRaw, country) || destFormatted;
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
        cross_border_note: crossBorderNote,
        checklist: Array.isArray(raw.checklist) ? raw.checklist : []
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
            ? '  "china_export_hscode": "10-digit China export code formatted XXXX.XX.XX.XX",'
            : '  "china_import_hscode": "10-digit China import code formatted XXXX.XX.XX.XX",',
        tradeDirection === 'export'
            ? `  "destination_import_code": "${country} ${meta.codeType}; US HTS uses XXXX.XX.XXXX, other markets may use national 8/10-digit formats",`
            : `  "origin_export_code": "${country} export HS; preserve the country's national format",`,
        '  "destination_country": "' + country + '",',
        '  "destination_code_type": "' + meta.codeType + '",',
        '  "official_name": "Official customs commodity name in English",',
        '  "confidence": "e.g., 95%",',
        '  "reasoning": "GIR-based justification in English",',
        '  "cross_border_note": "One sentence: first 6 digits harmonized + destination code implication (e.g. Section 301 for US)",',
        '  "checklist": [',
        '    {"phase":"发运前技术与认证核查|环保与绿色准入注册|海关查验与单证准备","stage":"optional English alias","task":"...","desc":"..."}',
        '  ]',
        '}',
        '',
        'CHECKLIST MANDATE: Return 4-6 checklist items minimum. NEVER return "checklist": [].',
        'Detect vertical: Consumer Electronics & Smart Hardware | New Energy & Clean Tech | Advanced Semiconductor & Controls.',
        'Use phase values exactly from: 发运前技术与认证核查 (technical/pre-shipment), 环保与绿色准入注册 (environmental/green), 海关查验与单证准备 (customs/documentation/tariff).',
        `Market theme for ${country}: ${getMarketThemeForCountry(country)}`,
        '',
        'Product description:',
        description
    ].join('\n');
}

function getMarketThemeForCountry(country) {
    if (countryRegistry && typeof countryRegistry.getMarketTheme === 'function') {
        return countryRegistry.getMarketTheme(country);
    }
    const themes = {
        US: 'FCC certification; Section 301 tariffs; BIS export controls',
        EU: 'CE/RED; RoHS/REACH; WEEE',
        ASEAN: 'Rules of origin; anti-circumvention',
        RU: 'Dual-use; sanctions',
        TW: 'Cross-strait semiconductor licensing',
        JP: 'PSE; TELEC',
        KR: 'KC certification',
        GLOBAL: 'General China baseline'
    };
    return themes[normalizeCountryCode(country)] || themes.GLOBAL;
}

function buildHsCodeSystemPrompt() {
    return `You are a world-class cross-border trade compliance and customs risk expert (全球顶尖的跨境贸易法务风控专家).
Apply the Harmonized System General Interpretative Rules (GIR). Always return valid JSON only (no markdown).

Country codes (counterparty_country) MUST be one of: US, EU, ASEAN, RU, TW, JP, KR, GLOBAL.
Frontend label mapping: United States->US, European Union->EU, ASEAN (Vietnam / Malaysia)->ASEAN, Russia->RU, Taiwan (China)->TW, Japan->JP, South Korea->KR, Other->GLOBAL.

HS CODE RULES:
1. china_export_hscode / china_import_hscode MUST be a full 10-digit China customs style code formatted as XXXX.XX.XX.XX when a reliable China tariff line is known. If only HS-6/HS-8 is defensible, extend with trailing zeros only as a preliminary placeholder and say in reasoning that broker confirmation is needed.
2. When trade_direction is "export", also return destination_import_code for the counterparty_country using the correct national system (US=HTS, EU=TARIC, JP/KR/ASEAN=national HS).
3. hs6 must be exactly 6 digits (no dots).
4. For US HTS, format 10-digit codes as XXXX.XX.XXXX, not China-style XXXX.XX.XX.XX. For EU/TARIC and other national lines, preserve the recognized local style.
5. cross_border_note must explain HS-6 harmonization and destination-country statistical suffix / trade policy (e.g. US Section 301) in one English sentence.
6. Append the same cross-border idea inside reasoning when helpful.

=== MANDATORY CHECKLIST ENGINE (NEVER EMPTY) ===
When analyzing the product and HS Code, EVEN IF the product is fully legal with NO export-control or sanctions hits, you MUST dynamically generate 4-6 industry-standard market-access and customs action items in the JSON "checklist" array.
FORBIDDEN: "checklist": [] — always return 4-6 objects.

Each checklist item format:
{"phase":"发运前技术与认证核查|环保与绿色准入注册|海关查验与单证准备","task":"short English title","desc":"actionable English guide"}

Phase routing (use these Chinese phase labels — frontend groups by keywords tech/pre/技术, environ/green/环保, custom/doc/海关):
- 发运前技术与认证核查 = pre-shipment technical & certification checks
- 环保与绿色准入注册 = environmental & green-market registration
- 海关查验与单证准备 = customs & documentation preparation

=== INDUSTRY MATRIX — FORCE APPLY BY VERTICAL ===

1) Consumer Electronics & Smart Hardware (消费电子 / 智能硬件):
- Export to US: MUST include task "Verify FCC ID conformity & technical labeling" (phase: 发运前技术与认证核查) — FCC Part 15 RF conformity & label rules.
- Export to EU: MUST include "Complete CE Marking (RED Directive)" (phase: 发运前技术与认证核查) AND "Submit RoHS & WEEE Compliance" (phase: 环保与绿色准入注册).
- Smart Phone specialty (手机 / smartphone / HS 8517.13): ALSO MUST add:
  * phase 发运前技术与认证核查 | task "Execute Regulatory SAR (Specific Absorption Rate) Testing"
  * phase 海关查验与单证准备 | task "Register IMEI Number with local Telecom Authority"
  * phase 发运前技术与认证核查 | task "Verify Commercial Cryptography & Encryption Control"

2) New Energy & Clean Tech (新能源 / 绿色供应链):
- Solar Panel / Solar Inverter + US destination: MUST add:
  * phase 发运前技术与认证核查 | task "Run UFLPA supply chain tracing for polysilicon raw materials"
  * phase 海关查验与单证准备 | task "Verify Anti-Dumping/Countervailing Duties (AD/CVD) exposure"
- Solar + EU destination: MUST add phase 环保与绿色准入注册 | task "Register WEEE for Photovoltaic modules"
- Energy Storage / Power Bank / ESS (any destination): MUST add phase 海关查验与单证准备 | task "Obtain Class 9 Dangerous Goods maritime booking approval & UN38.3 report"
- Energy Storage + US/EU: ALSO add UL 9540/9540A (US) OR "Prepare Battery Passport under New EU Battery Regulation" (EU) in appropriate phase.
- EV Charger / E-Scooter: North America -> UL 2202 (charger) or UL 2272 (e-scooter); EU -> RED Cybersecurity Article 3(3) for smart/connected charging.

3) Advanced Semiconductor & Controls (半导体 / 贸易管制分会场):
- ANY flow: MUST include phase 发运前技术与认证核查 | task "Perform BIS ECCN & dual-use export control screening" (US BIS ECCN determination + Entity List screening)
- Optical Module / high-speed optics: MUST add phase 发运前技术与认证核查 | task "Verify FDA Class 1 Laser Safety certification"
- Civilian Drone / UAV: MUST add phase 海关查验与单证准备 | task "Check MOFCOM UAV dual-use export control catalog thresholds" (endurance, payload, control range vs China MOFCOM 2024 UAV rules)

Think step-by-step: (1) classify HS, (2) detect which of the three verticals applies (Electronics / New Energy / Semiconductor), (3) apply matrix rules for counterparty_country + trade_direction, (4) output 4-6 checklist items minimum — NEVER return an empty checklist array.`;
}

const hsCodeDualApi = {
    DESTINATION_META,
    normalizeCountryCode,
    formatTenDigitHs,
    formatUsHtsCode,
    formatCounterpartyHsCode,
    extractHs6,
    formatHs6Display,
    getDestinationMeta,
    buildCrossBorderNote,
    enrichClassification,
    buildHsCodeUserPrompt,
    buildHsCodeSystemPrompt,
    getMarketThemeForCountry
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = hsCodeDualApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyHsDual = hsCodeDualApi;
}
