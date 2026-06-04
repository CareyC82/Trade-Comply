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
    CN: {
        flag: '🇨🇳',
        label: 'China Import HS Code',
        codeType: 'China HS',
        complianceHint: 'China 10-digit customs code and CIQ/supervision conditions should be confirmed before filing.'
    },
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
    DE: {
        flag: '🇩🇪',
        label: 'Germany Import TARIC Code',
        codeType: 'EU TARIC',
        complianceHint: 'Germany applies EU TARIC/CN classification plus national customs filing requirements.'
    },
    NL: {
        flag: '🇳🇱',
        label: 'Netherlands Import TARIC Code',
        codeType: 'EU TARIC',
        complianceHint: 'Netherlands applies EU TARIC/CN classification plus Dutch customs filing requirements.'
    },
    SG: {
        flag: '🇸🇬',
        label: 'Singapore Import HS Code',
        codeType: 'Singapore HS',
        complianceHint: 'Singapore national HS/AHTN extensions should be confirmed for TradeNet declarations.'
    },
    MX: {
        flag: '🇲🇽',
        label: 'Mexico Import TIGIE Code',
        codeType: 'TIGIE',
        complianceHint: 'Mexico TIGIE/NICO classification and NOM applicability should be confirmed before import.'
    },
    VN: {
        flag: '🇻🇳',
        label: 'Vietnam Import HS Code',
        codeType: 'Vietnam HS',
        complianceHint: 'Vietnam national tariff lines and MIC/MOIT import triggers should be confirmed before clearance.'
    },
    MY: {
        flag: '🇲🇾',
        label: 'Malaysia Import HS Code',
        codeType: 'Malaysia HS',
        complianceHint: 'Malaysia tariff classification plus SIRIM/MCMC or ST COA triggers should be confirmed before import.'
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

function getImportCodeLabel(country) {
    const meta = getDestinationMeta(country);
    return `${meta.flag} ${meta.label}`;
}

function getExportCodeLabel(country) {
    const meta = getDestinationMeta(country);
    const label = meta.label.replace(/\bImport\b/i, 'Export');
    return `${meta.flag} ${label}`;
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
function enrichClassification(raw, {
    direction = 'export',
    counterpartyCountry = 'US',
    fromCountry = 'CN',
    toCountry = counterpartyCountry || 'US',
    focus = ''
} = {}) {
    const tradeDirection = direction === 'import' ? 'import' : 'export';
    const originCountry = normalizeCountryCode(fromCountry || (tradeDirection === 'import' ? counterpartyCountry : 'CN'));
    const destinationCountry = normalizeCountryCode(toCountry || (tradeDirection === 'import' ? 'CN' : counterpartyCountry));
    const country = normalizeCountryCode(counterpartyCountry || (focus === 'export' ? originCountry : destinationCountry));
    const meta = getDestinationMeta(destinationCountry);

    const primaryRaw = raw.china_export_hscode || raw.china_import_hscode || raw.hscode || raw.hs_code || '';
    const destRaw = raw.destination_import_code || raw.origin_export_code || raw.counterparty_hscode || '';
    const hs6 = extractHs6(raw.hs6 || primaryRaw);

    const originFormatted = formatCounterpartyHsCode(raw.origin_export_code || raw.china_export_hscode || primaryRaw, originCountry);
    const destinationFormatted = formatCounterpartyHsCode(raw.destination_import_code || raw.china_import_hscode || destRaw || primaryRaw, destinationCountry);

    let originLabel;
    let counterpartyLabel;
    let originCode;
    let counterpartyCode;

    originLabel = getExportCodeLabel(originCountry);
    originCode = originFormatted || formatTenDigitHs(primaryRaw);
    counterpartyLabel = getImportCodeLabel(destinationCountry);
    counterpartyCode = destinationFormatted || originCode;

    const crossBorderNote = String(raw.cross_border_note || '').trim()
        || buildCrossBorderNote(hs6, destinationCountry, meta.codeType);

    return {
        hscode: originCode || formatTenDigitHs(primaryRaw),
        hs6,
        china_export_hscode: originCountry === 'CN' ? originCode : '',
        china_import_hscode: destinationCountry === 'CN' ? counterpartyCode : '',
        origin_country: originCountry,
        destination_country: destinationCountry,
        destination_import_code: counterpartyCode,
        origin_export_code: originCode,
        destination_code_type: meta.codeType,
        china_code_label: originLabel,
        counterparty_code_label: counterpartyLabel,
        china_code: originCode,
        counterparty_code: counterpartyCode,
        trade_direction: tradeDirection,
        compliance_focus: focus || (tradeDirection === 'import' ? 'import' : 'export'),
        official_name: String(raw.official_name || '').trim(),
        confidence: String(raw.confidence || '').trim(),
        reasoning: ensureCrossBorderInReasoning(raw.reasoning, crossBorderNote),
        cross_border_note: crossBorderNote,
        checklist: Array.isArray(raw.checklist) ? raw.checklist : []
    };
}

function buildHsCodeUserPrompt(description, {
    direction = 'export',
    counterpartyCountry = 'US',
    fromCountry = 'CN',
    toCountry = counterpartyCountry || 'US',
    focus = ''
} = {}) {
    const tradeDirection = direction === 'import' ? 'import' : 'export';
    const origin = normalizeCountryCode(fromCountry || (tradeDirection === 'import' ? counterpartyCountry : 'CN'));
    const destination = normalizeCountryCode(toCountry || (tradeDirection === 'import' ? 'CN' : counterpartyCountry));
    const country = normalizeCountryCode(counterpartyCountry || (focus === 'export' ? origin : destination));
    const routeFocus = focus === 'export' ? 'origin export requirements' : 'destination import requirements';
    const meta = getDestinationMeta(destination);

    return [
        `Trade context:`,
        `- trade_direction: ${tradeDirection}`,
        `- origin_country: ${origin}`,
        `- destination_country: ${destination}`,
        `- compliance_focus: ${routeFocus}`,
        `- counterparty_country: ${country}`,
        `- destination_code_type: ${meta.codeType}`,
        '',
        'Classify the product and return JSON ONLY with this structure:',
        '{',
        '  "hs6": "6-digit harmonized subheading (digits only, e.g. 854239)",',
        '  "hscode": "Primary 10-digit code formatted XXXX.XX.XX.XX",',
        `  "origin_export_code": "${origin} export HS; preserve the country's national format",`,
        `  "destination_import_code": "${destination} ${meta.codeType}; US HTS uses XXXX.XX.XXXX, other markets may use national 8/10-digit formats",`,
        '  "origin_country": "' + origin + '",',
        '  "destination_country": "' + destination + '",',
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
        `Origin market theme for ${origin}: ${getMarketThemeForCountry(origin)}`,
        `Destination market theme for ${destination}: ${getMarketThemeForCountry(destination)}`,
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
        CN: 'China 10-digit customs code; CCC/SRRC/CEL and export-control checks where applicable',
        US: 'FCC certification; Section 301 tariffs; BIS export controls',
        EU: 'CE/RED; RoHS/REACH; WEEE',
        DE: 'EU TARIC; CE/RED; RoHS/REACH; BAFA dual-use export controls',
        NL: 'EU TARIC; Dutch Customs/CDIU strategic goods export controls',
        SG: 'TradeNet; Strategic Goods Control; ICDV where required',
        MX: 'TIGIE/NICO; NOM import compliance; customs documentation',
        VN: 'Vietnam HS; MIC ICT/radio conformity; MOIT energy labeling',
        MY: 'Malaysia HS; MCMC/SIRIM approval; ST COA electrical safety',
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

Country codes (origin_country, destination_country, counterparty_country) MUST be one of: CN, US, EU, DE, NL, SG, MX, VN, MY, ASEAN, RU, TW, JP, KR, GLOBAL.
Frontend label mapping: China->CN, United States->US, European Union->EU, Germany->DE, Netherlands->NL, Singapore->SG, Mexico->MX, Vietnam->VN, Malaysia->MY, ASEAN->ASEAN, Russia->RU, Taiwan (China)->TW, Japan->JP, South Korea->KR, Other->GLOBAL.

HS CODE RULES:
1. origin_export_code and destination_import_code should follow the relevant national tariff format. If a reliable national suffix is not known, extend from HS-6 only as a preliminary placeholder and say in reasoning that broker confirmation is needed.
2. Return destination_import_code for destination_country using the correct national system (US=HTS, EU/DE/NL=TARIC/CN, MX=TIGIE/NICO, SG/VN/MY/JP/KR/ASEAN=national HS).
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

Think step-by-step: (1) classify HS, (2) detect which of the three verticals applies (Electronics / New Energy / Semiconductor), (3) apply route rules for origin_country + destination_country + compliance_focus, (4) output 4-6 checklist items minimum — NEVER return an empty checklist array.`;
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
