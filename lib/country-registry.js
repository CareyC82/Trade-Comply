/**
 * Canonical country/region registry — single source aligned with frontend <select> options.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'country-registry.json');

let cachedRegistry = null;

function loadRegistry() {
    if (cachedRegistry) {
        return cachedRegistry;
    }
    cachedRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
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

module.exports = {
    REGISTRY_PATH,
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
