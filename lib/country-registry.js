/**
 * Canonical country/region registry — aligned with frontend <select> options.
 * Works in Node (reads data/country-registry.json) and browser (inline copy).
 */

let REGISTRY_PATH = '';

/** Inline copy for browser <script> tags (no require/fs). Keep in sync with country-registry.json */
const INLINE_REGISTRY = {
    version: 1,
    canonical_codes: ['US', 'EU', 'ASEAN', 'RU', 'TW', 'JP', 'KR', 'GLOBAL'],
    export_options: [
        { value: 'US', label: 'United States' },
        { value: 'EU', label: 'European Union' },
        { value: 'ASEAN', label: 'ASEAN (Vietnam / Malaysia)' },
        { value: 'RU', label: 'Russia' },
        { value: 'GLOBAL', label: 'Other' }
    ],
    import_options: [
        { value: 'TW', label: 'Taiwan (China)' },
        { value: 'JP', label: 'Japan' },
        { value: 'KR', label: 'South Korea' },
        { value: 'US', label: 'United States' },
        { value: 'GLOBAL', label: 'Other' }
    ],
    label_to_code: {
        'United States': 'US',
        'European Union': 'EU',
        'ASEAN (Vietnam / Malaysia)': 'ASEAN',
        Russia: 'RU',
        'Taiwan (China)': 'TW',
        Japan: 'JP',
        'South Korea': 'KR',
        Other: 'GLOBAL'
    },
    aliases: {
        USA: 'US',
        'UNITED STATES': 'US',
        'U.S.': 'US',
        EUROPE: 'EU',
        'EUROPEAN UNION': 'EU',
        VIETNAM: 'ASEAN',
        MALAYSIA: 'ASEAN',
        'SOUTHEAST ASIA': 'ASEAN',
        RUSSIA: 'RU',
        'RUSSIAN FEDERATION': 'RU',
        TAIWAN: 'TW',
        'TAIWAN (CHINA)': 'TW',
        JAPAN: 'JP',
        KOREA: 'KR',
        'SOUTH KOREA': 'KR',
        'REPUBLIC OF KOREA': 'KR',
        OTHER: 'GLOBAL',
        OTHERS: 'GLOBAL',
        GLOBAL: 'GLOBAL',
        CN: 'GLOBAL',
        CHINA: 'GLOBAL'
    },
    compliance_focus: {
        RU: {
            export: 'Screen dual-use export controls, international sanctions red lines, and electronic component embargo risk for Russia-bound shipments.',
            import: 'Verify Russia-origin items against sanctions and restricted party lists before China import.'
        },
        TW: {
            import: 'Screen Taiwan-origin semiconductor equipment, wafer technology, and special cross-strait technology licensing requirements.',
            export: 'Assess cross-strait technology transfer restrictions for Taiwan-related electronics.'
        },
        ASEAN: {
            export: 'Emphasize rules of origin compliance and transshipment / anti-circumvention risk for Vietnam and Malaysia routes.',
            import: 'Check ASEAN origin documentation and re-export control for electronics supply chains.'
        },
        US: {
            export: 'Include US HTS alignment, Section 301 / BIS export control, and entity list exposure.',
            import: 'Review US-origin technology licensing and re-export conditions.'
        },
        EU: {
            export: 'Include EU TARIC alignment, CBAM reporting, and dual-use export screening.',
            import: 'Check EU-origin controlled technology and REACH-related obligations where relevant.'
        },
        JP: {
            import: 'Screen Japan-origin semiconductor manufacturing equipment and controlled technology items.',
            export: 'Assess Japan market access and export notification for high-tech goods.'
        },
        KR: {
            import: 'Screen Korea-origin semiconductor equipment, memory ICs, and export-licensed technologies.',
            export: 'Assess Korea outbound licensing for advanced electronics.'
        },
        GLOBAL: {
            export: 'Apply general China export compliance baseline when no specific destination rule matches.',
            import: 'Apply general China import baseline for unspecified origins.'
        }
    }
};

let cachedRegistry = null;

function isNodeRuntime() {
    return typeof process !== 'undefined'
        && process.versions
        && process.versions.node
        && typeof require === 'function';
}

function loadRegistry() {
    if (cachedRegistry) {
        return cachedRegistry;
    }
    if (isNodeRuntime()) {
        try {
            const fs = require('fs');
            const path = require('path');
            const registryPath = path.join(__dirname, '..', 'data', 'country-registry.json');
            REGISTRY_PATH = registryPath;
            cachedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            return cachedRegistry;
        } catch (error) {
            cachedRegistry = INLINE_REGISTRY;
            return cachedRegistry;
        }
    }
    cachedRegistry = INLINE_REGISTRY;
    return cachedRegistry;
}

function getCanonicalCodes() {
    return [...loadRegistry().canonical_codes];
}

function getExportOptions() {
    return loadRegistry().export_options.map((row) => ({ ...row }));
}

function getImportOptions() {
    return loadRegistry().import_options.map((row) => ({ ...row }));
}

function getLabelToCodeMap() {
    return { ...loadRegistry().label_to_code };
}

function normalizeCountryCode(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return 'GLOBAL';
    }

    const registry = loadRegistry();
    if (registry.label_to_code[raw]) {
        return registry.label_to_code[raw];
    }

    const upper = raw.toUpperCase();
    if (registry.canonical_codes.includes(upper)) {
        return upper;
    }
    if (registry.aliases[upper]) {
        return registry.aliases[upper];
    }
    if (registry.aliases[raw]) {
        return registry.aliases[raw];
    }

    return 'GLOBAL';
}

function getCountryLabel(code) {
    const normalized = normalizeCountryCode(code);
    const registry = loadRegistry();
    const row = [...registry.export_options, ...registry.import_options]
        .find((item) => item.value === normalized);
    return row ? row.label : normalized;
}

function getCountryOptionsForDirection(direction) {
    return direction === 'import' ? getImportOptions() : getExportOptions();
}

function getComplianceFocus(country, direction = 'export') {
    const code = normalizeCountryCode(country);
    const focus = loadRegistry().compliance_focus[code] || loadRegistry().compliance_focus.GLOBAL;
    return focus[direction] || focus.export || focus.import || '';
}

function buildPipelineStructurerSystemPrompt() {
    const registry = loadRegistry();
    const lines = [
        'You are a trade compliance data engineer for a multi-country matrix (China export/import).',
        'Return ONE JSON object with keys: hs_code, direction (export|import),',
        'country (US|EU|ASEAN|RU|TW|JP|KR|GLOBAL only), risk_level (High|Medium|Low),',
        'source, content_en, content_zh. English content_en, Chinese content_zh. No markdown.',
        '',
        'Country codes MUST match frontend option values exactly:',
        ...registry.export_options.map((o) => `- ${o.label} -> ${o.value}`),
        ...registry.import_options.map((o) => `- ${o.label} -> ${o.value}`),
        '',
        'Regional review weights (apply when assigning risk_level and content):'
    ];

    for (const code of ['RU', 'TW', 'ASEAN', 'US', 'EU', 'JP', 'KR']) {
        const focus = registry.compliance_focus[code];
        if (focus?.export) {
            lines.push(`- ${code} export: ${focus.export}`);
        }
        if (focus?.import) {
            lines.push(`- ${code} import: ${focus.import}`);
        }
    }

    return lines.join('\n');
}

function buildPipelineUserContext(item) {
    const country = normalizeCountryCode(item.default_country || item.country || 'GLOBAL');
    const direction = item.default_direction === 'import' ? 'import' : 'export';
    const focus = getComplianceFocus(country, direction);
    return {
        title: item.title,
        body: item.body,
        source_org: item.source_org,
        default_country: country,
        default_direction: direction,
        compliance_focus: focus
    };
}

const api = {
    REGISTRY_PATH,
    INLINE_REGISTRY,
    loadRegistry,
    getCanonicalCodes,
    getExportOptions,
    getImportOptions,
    getLabelToCodeMap,
    normalizeCountryCode,
    getCountryLabel,
    getCountryOptionsForDirection,
    getComplianceFocus,
    buildPipelineStructurerSystemPrompt,
    buildPipelineUserContext
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountryRegistry = api;
}
