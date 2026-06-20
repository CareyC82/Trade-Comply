/**
 * Canonical country/region registry — aligned with frontend <select> options.
 * Works in Node (reads data/country-registry.json) and browser (inline copy).
 */

let REGISTRY_PATH = '';
let COVERAGE_MATRIX_PATH = '';

const DEFAULT_COVERAGE_MATRIX = {
    import: {
        US: 'full',
        CN: 'full',
        EU: 'full',
        DE: 'full',
        NL: 'full',
        VN: 'full',
        MY: 'full',
        ASEAN: 'full',
        RU: 'full',
        TW: 'full',
        JP: 'full',
        KR: 'full',
        SG: 'full',
        MX: 'full',
        IN: 'full',
        GLOBAL: 'baseline'
    },
    export: {
        CN: 'full',
        US: 'full',
        EU: 'full',
        DE: 'full',
        NL: 'full',
        VN: 'full',
        MY: 'full',
        ASEAN: 'full',
        RU: 'full',
        TW: 'full',
        JP: 'full',
        KR: 'full',
        SG: 'full',
        MX: 'full',
        IN: 'full',
        GLOBAL: 'baseline'
    }
};

let runtimeCoverageMatrix = null;

/** Inline copy for browser <script> tags (no require/fs). Keep in sync with country-registry.json */
const INLINE_REGISTRY = {
    version: 1,
    canonical_codes: ['CN', 'US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'ASEAN', 'RU', 'TW', 'JP', 'KR', 'IN', 'GLOBAL'],
    route_options: [
        { value: 'CN', label: 'China' },
        { value: 'US', label: 'United States' },
        { value: 'DE', label: 'Germany' },
        { value: 'NL', label: 'Netherlands' },
        { value: 'SG', label: 'Singapore' },
        { value: 'MX', label: 'Mexico' },
        { value: 'VN', label: 'Vietnam' },
        { value: 'MY', label: 'Malaysia' },
        { value: 'ASEAN', label: 'ASEAN' },
        { value: 'EU', label: 'European Union' },
        { value: 'RU', label: 'Russia' },
        { value: 'TW', label: 'Taiwan (China)' },
        { value: 'JP', label: 'Japan' },
        { value: 'KR', label: 'South Korea' },
        { value: 'IN', label: 'India' },
        { value: 'GLOBAL', label: 'Other' }
    ],
    export_options: [
        { value: 'US', label: 'United States' },
        { value: 'EU', label: 'European Union' },
        { value: 'IN', label: 'India' },
        { value: 'VN', label: 'Vietnam' },
        { value: 'MY', label: 'Malaysia' },
        { value: 'ASEAN', label: 'ASEAN' },
        { value: 'RU', label: 'Russia' },
        { value: 'GLOBAL', label: 'Other' }
    ],
    import_options: [
        { value: 'TW', label: 'Taiwan (China)' },
        { value: 'JP', label: 'Japan' },
        { value: 'KR', label: 'South Korea' },
        { value: 'VN', label: 'Vietnam' },
        { value: 'MY', label: 'Malaysia' },
        { value: 'IN', label: 'India' },
        { value: 'US', label: 'United States' },
        { value: 'GLOBAL', label: 'Other' }
    ],
    label_to_code: {
        'United States': 'US',
        China: 'CN',
        Germany: 'DE',
        Netherlands: 'NL',
        Singapore: 'SG',
        Mexico: 'MX',
        Vietnam: 'VN',
        Malaysia: 'MY',
        'European Union': 'EU',
        ASEAN: 'ASEAN',
        'ASEAN (Vietnam / Malaysia)': 'ASEAN',
        Russia: 'RU',
        'Taiwan (China)': 'TW',
        Japan: 'JP',
        'South Korea': 'KR',
        India: 'IN',
        Other: 'GLOBAL'
    },
    aliases: {
        USA: 'US',
        'UNITED STATES': 'US',
        'U.S.': 'US',
        CN: 'CN',
        CHINA: 'CN',
        GERMANY: 'DE',
        DEUTSCHLAND: 'DE',
        NETHERLANDS: 'NL',
        HOLLAND: 'NL',
        SINGAPORE: 'SG',
        MEXICO: 'MX',
        EUROPE: 'EU',
        'EUROPEAN UNION': 'EU',
        VIETNAM: 'VN',
        'VIET NAM': 'VN',
        VN: 'VN',
        MALAYSIA: 'MY',
        MY: 'MY',
        'SOUTHEAST ASIA': 'ASEAN',
        RUSSIA: 'RU',
        'RUSSIAN FEDERATION': 'RU',
        TAIWAN: 'TW',
        'TAIWAN (CHINA)': 'TW',
        JAPAN: 'JP',
        KOREA: 'KR',
        'SOUTH KOREA': 'KR',
        'REPUBLIC OF KOREA': 'KR',
        INDIA: 'IN',
        BHARAT: 'IN',
        IN: 'IN',
        OTHER: 'GLOBAL',
        OTHERS: 'GLOBAL',
        GLOBAL: 'GLOBAL'
    },
    market_themes: {
        US: 'FCC certification (Part 15/18); Section 301 tariff risk; BIS export controls & Entity List',
        EU: 'CE/RED conformity; RoHS & REACH; WEEE producer responsibility; EU TARIC alignment',
        DE: 'EU single market requirements; CE/RED, RoHS/REACH, WEEE, and German market surveillance',
        NL: 'EU single market requirements; CE/RED, RoHS/REACH, WEEE, and Dutch customs/logistics checks',
        SG: 'Singapore IMDA telecom approval, safety standards, strategic goods controls, and re-export screening',
        MX: 'Mexico NOM standards, customs valuation/origin, IMMEX exposure, and USMCA route sensitivity',
        VN: 'Vietnam MIC ICT/radio conformity, MOIT energy labeling, customs classification, and battery/ESS import checks',
        MY: 'Malaysia MCMC/SIRIM telecom approval, ST electrical safety COA, customs classification, and battery/ESS import checks',
        ASEAN: 'Rules of origin (Form E/RCEP); transshipment & anti-circumvention for Vietnam/Malaysia routes',
        RU: 'Dual-use controls; international sanctions red lines; embargoed electronic components',
        TW: 'Cross-strait semiconductor licensing; special technology transfer permits',
        JP: 'PSE electrical safety; TELEC radio approval; Japan-origin fab equipment import controls',
        KR: 'KC unified national certification; Korea-origin memory/semiconductor screening',
        IN: 'India BIS quality-control orders, WPC wireless approvals, customs valuation, BCD/SWS/IGST, e-waste and battery rules',
        GLOBAL: 'General China import/export baseline; CCC/SRRC/CEL where applicable'
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
        DE: {
            export: 'Apply EU export controls plus Germany-specific customs and market-surveillance checks where relevant.',
            import: 'Review Germany-origin technology, CE/RoHS/REACH evidence, and EU dual-use re-export conditions.'
        },
        NL: {
            export: 'Apply EU export controls plus Netherlands logistics, transit, and customs documentation checks.',
            import: 'Review Netherlands-origin or EU-transit goods for EU compliance evidence and re-export conditions.'
        },
        SG: {
            export: 'Screen Singapore strategic goods controls, IMDA telecom approval, and re-export requirements.',
            import: 'Check Singapore-origin electronics for strategic-goods, telecom, and safety documentation.'
        },
        MX: {
            export: 'Screen Mexico NOM, customs/origin, and USMCA supply-chain implications for outbound shipments.',
            import: 'Check Mexico-origin electronics for NOM evidence, origin documentation, and customs valuation support.'
        },
        VN: {
            export: 'Screen Vietnam origin, export documentation, and ASEAN transshipment/origin exposure where relevant.',
            import: 'Check Vietnam MIC ICT/radio conformity, MOIT energy labeling, customs classification, and battery/ESS import requirements.'
        },
        MY: {
            export: 'Screen Malaysia origin, export documentation, and ASEAN transshipment/origin exposure where relevant.',
            import: 'Check Malaysia MCMC/SIRIM telecom approval, ST electrical safety COA, customs classification, and battery/ESS import requirements.'
        },
        JP: {
            import: 'Screen Japan-origin semiconductor manufacturing equipment and controlled technology items.',
            export: 'Assess Japan market access and export notification for high-tech goods.'
        },
        KR: {
            import: 'Screen Korea-origin semiconductor equipment, memory ICs, and export-licensed technologies.',
            export: 'Assess Korea outbound licensing for advanced electronics.'
        },
        IN: {
            export: 'Screen India export controls, SCOMET dual-use exposure, DGFT licensing, BIS/QCO documentation, and origin evidence for outbound electronics.',
            import: 'Check India BCD/SWS/IGST, BIS quality-control orders, WPC wireless approvals, e-waste/battery rules, and customs valuation before import.'
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

function normalizeCoverageMatrixPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return DEFAULT_COVERAGE_MATRIX;
    }
    const matrix = payload.matrix && typeof payload.matrix === 'object'
        ? payload.matrix
        : payload;
    return {
        import: { ...DEFAULT_COVERAGE_MATRIX.import, ...(matrix.import || {}) },
        export: { ...DEFAULT_COVERAGE_MATRIX.export, ...(matrix.export || {}) }
    };
}

function loadCoverageMatrix() {
    if (runtimeCoverageMatrix) {
        return runtimeCoverageMatrix;
    }
    if (isNodeRuntime()) {
        try {
            const fs = require('fs');
            const path = require('path');
            const matrixPath = path.join(__dirname, '..', 'data', 'coverage-matrix.json');
            COVERAGE_MATRIX_PATH = matrixPath;
            runtimeCoverageMatrix = normalizeCoverageMatrixPayload(JSON.parse(fs.readFileSync(matrixPath, 'utf8')));
            return runtimeCoverageMatrix;
        } catch (error) {
            runtimeCoverageMatrix = normalizeCoverageMatrixPayload(loadRegistry().coverage_matrix);
            return runtimeCoverageMatrix;
        }
    }
    runtimeCoverageMatrix = normalizeCoverageMatrixPayload(loadRegistry().coverage_matrix);
    return runtimeCoverageMatrix;
}

function setCoverageMatrix(payload) {
    runtimeCoverageMatrix = normalizeCoverageMatrixPayload(payload);
    return runtimeCoverageMatrix;
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

function getRouteOptions() {
    const registry = loadRegistry();
    const options = Array.isArray(registry.route_options)
        ? registry.route_options
        : [...registry.export_options, ...registry.import_options];
    const seen = new Set();
    return options
        .filter((row) => {
            if (!row?.value || seen.has(row.value)) {
                return false;
            }
            seen.add(row.value);
            return true;
        })
        .map((row) => ({ ...row }));
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
    const row = [...getRouteOptions(), ...registry.export_options, ...registry.import_options]
        .find((item) => item.value === normalized);
    return row ? row.label : normalized;
}

function getCountryOptionsForDirection(direction) {
    return direction === 'import' ? getImportOptions() : getExportOptions();
}

function normalizeRouteFocus(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'export' || raw === 'origin' || raw === 'export-origin') {
        return 'export';
    }
    return 'import';
}

function getLegacyDirectionForRoute(fromCountry, toCountry, focus = 'import') {
    const from = normalizeCountryCode(fromCountry || 'CN');
    const to = normalizeCountryCode(toCountry || 'US');
    const routeFocus = normalizeRouteFocus(focus);

    if (routeFocus === 'import') {
        return 'export';
    }
    if (from === 'CN') {
        return 'export';
    }
    if (to === 'CN') {
        return 'import';
    }
    return 'export';
}

function getLegacyCountryForRoute(fromCountry, toCountry, focus = 'import') {
    const from = normalizeCountryCode(fromCountry || 'CN');
    const to = normalizeCountryCode(toCountry || 'US');
    const routeFocus = normalizeRouteFocus(focus);

    if (routeFocus === 'import') {
        return to;
    }
    if (from === 'CN') {
        return to;
    }
    return from;
}

function getRouteContext(input = {}) {
    const focus = normalizeRouteFocus(input.focus || input.complianceFocus);
    const from = normalizeCountryCode(input.from || input.routeFromCountry || 'CN');
    const to = normalizeCountryCode(input.to || input.routeToCountry || 'US');
    const direction = getLegacyDirectionForRoute(from, to, focus);
    const country = getLegacyCountryForRoute(from, to, focus);
    return {
        from,
        to,
        focus,
        direction,
        country,
        fromLabel: getCountryLabel(from),
        toLabel: getCountryLabel(to)
    };
}

function getComplianceFocus(country, direction = 'export') {
    const code = normalizeCountryCode(country);
    const focus = loadRegistry().compliance_focus[code] || loadRegistry().compliance_focus.GLOBAL;
    return focus[direction] || focus.export || focus.import || '';
}

function getMarketTheme(country) {
    const code = normalizeCountryCode(country);
    const themes = loadRegistry().market_themes || {};
    return themes[code] || themes.GLOBAL || '';
}

function normalizeCoverageLevel(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'full' || raw === 'partial' || raw === 'baseline' || raw === 'none') {
        return raw;
    }
    return 'baseline';
}

function getConfiguredCoverageLevel(country, focus = 'import') {
    const code = normalizeCountryCode(country || 'GLOBAL');
    const routeFocus = normalizeRouteFocus(focus);
    const matrix = loadCoverageMatrix();
    const focusMatrix = matrix[routeFocus] || {};
    return normalizeCoverageLevel(focusMatrix[code] || focusMatrix.GLOBAL || 'baseline');
}

function buildPipelineStructurerSystemPrompt() {
    const registry = loadRegistry();
    const lines = [
        'You are a trade compliance data engineer for a multi-country matrix (China export/import).',
        'Return ONE JSON object with keys: hs_code, direction (export|import),',
        'country (US|EU|VN|MY|ASEAN|RU|TW|JP|KR|GLOBAL only), risk_level (High|Medium|Low),',
        'source, content_en, content_zh, checklist (array). English content_en, Chinese content_zh. No markdown.',
        '',
        'Country codes MUST match frontend dropdown labels exactly:',
        ...registry.export_options.map((o) => `- "${o.label}" -> ${o.value}`),
        ...registry.import_options.map((o) => `- "${o.label}" -> ${o.value}`),
        '- "Other" -> GLOBAL',
        '',
        'Each checklist item: {"phase":"技术核查|环保注册|单证准备","task":"...","desc":"..."}',
        '',
        'Market themes:',
        ...Object.entries(registry.market_themes || {}).map(([code, text]) => `- ${code}: ${text}`),
        '',
        'Regional review weights:'
    ];

    for (const code of ['RU', 'TW', 'VN', 'MY', 'ASEAN', 'US', 'EU', 'JP', 'KR']) {
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

const countryRegistryApi = {
    REGISTRY_PATH,
    COVERAGE_MATRIX_PATH,
    INLINE_REGISTRY,
    DEFAULT_COVERAGE_MATRIX,
    loadRegistry,
    loadCoverageMatrix,
    setCoverageMatrix,
    normalizeCoverageMatrixPayload,
    getCanonicalCodes,
    getExportOptions,
    getImportOptions,
    getRouteOptions,
    getLabelToCodeMap,
    normalizeCountryCode,
    getCountryLabel,
    getCountryOptionsForDirection,
    normalizeRouteFocus,
    getLegacyDirectionForRoute,
    getLegacyCountryForRoute,
    getRouteContext,
    getComplianceFocus,
    getMarketTheme,
    normalizeCoverageLevel,
    getConfiguredCoverageLevel,
    buildPipelineStructurerSystemPrompt,
    buildPipelineUserContext
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = countryRegistryApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyCountryRegistry = countryRegistryApi;
}
