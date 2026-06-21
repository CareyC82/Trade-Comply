/**
 * Lightweight product-understanding layer.
 *
 * This is intentionally deterministic and local: it improves matching speed and
 * consistency without waiting for an external AI call.
 */
'use strict';

const ATTRIBUTE_RULES = [
    {
        id: 'data_center_system',
        vertical: 'data-center',
        confidence: 0.9,
        pattern: /\b(ai\s*server|gpu\s*server|edge\s*ai\s*(computer|box)|data\s*center|server\s*rack|storage\s*server|nas|san|network appliance|firewall appliance|liquid cooling|pdu|ups)\b/i,
        expansion: ['data center equipment', 'ai server', 'edge computing', 'network appliance', 'storage server'],
        reason: 'System-level data center or edge computing language implies server, power, cooling, and restricted end-use screening.'
    },
    {
        id: 'industrial_automation',
        vertical: 'industrial-automation',
        confidence: 0.88,
        pattern: /\b(plc|programmable logic controller|servo motor|servo drive|industrial robot|robot arm|cnc controller|machine vision|industrial sensor|factory gateway|industrial iot)\b/i,
        expansion: ['industrial automation', 'robotics', 'machine vision', 'industrial control', 'factory gateway'],
        reason: 'Industrial automation language implies machinery safety, control-system, and dual-use screening.'
    },
    {
        id: 'healthcare_lab',
        vertical: 'healthcare-lab',
        confidence: 0.88,
        pattern: /\b(patient monitor|medical monitor|medical device|diagnostic device|lab analyzer|laboratory analyzer|ivd|wearable health|electronic thermometer|cold[-\s]?chain|medical power supply)\b/i,
        expansion: ['medical electronics', 'healthcare device', 'lab instrument', 'diagnostic device', 'market access'],
        reason: 'Healthcare or laboratory electronics language implies medical-device, safety, labeling, and data review.'
    },
    {
        id: 'ai_chip',
        vertical: 'semiconductor',
        confidence: 0.92,
        pattern: /\b(ai\s*(gpu|chip|accelerator)|gpu|hbm|advanced computing|inference accelerator|h100|h200|h800|a100|a800|b100|b200|l40s?|mi300x?|gb200|rtx\s*pro)\b/i,
        expansion: ['ai chip', 'gpu', 'accelerator', 'advanced computing', 'semiconductor'],
        reason: 'AI accelerator / GPU language implies advanced chip screening.'
    },
    {
        id: 'advanced_manufacturing',
        vertical: 'semiconductor',
        confidence: 0.9,
        pattern: /\b(lithography|etching|deposition|semiconductor equipment|wafer fab|foundry|advanced packaging|eda)\b/i,
        expansion: ['semiconductor equipment', 'foundry', 'advanced manufacturing', 'dual-use'],
        reason: 'Semiconductor tooling language implies advanced manufacturing controls.'
    },
    {
        id: 'semiconductor',
        vertical: 'semiconductor',
        confidence: 0.86,
        pattern: /\b(chip|semiconductor|integrated circuit|processor|wafer|8542|8486)\b/i,
        expansion: ['chip', 'semiconductor', 'integrated circuit', 'wafer'],
        reason: 'Chip / semiconductor terms require semiconductor trade-control screening.'
    },
    {
        id: 'uav',
        vertical: 'semiconductor',
        confidence: 0.88,
        pattern: /\b(drone|uav|quadcopter|flight controller|unmanned aerial)\b/i,
        expansion: ['drone', 'uav', 'wireless', 'battery', 'dual-use', 'end use'],
        reason: 'Drone terms imply UAV export-control and end-use screening.'
    },
    {
        id: 'wireless',
        vertical: 'electronics',
        confidence: 0.8,
        pattern: /\b(wifi|wi-fi|bluetooth|wireless|radio|router|srrc|fcc|telecom|5g|lte|rf)\b/i,
        expansion: ['wireless', 'wifi', 'radio', 'srrc', 'fcc'],
        reason: 'Wireless terms imply radio approval and market-access screening.'
    },
    {
        id: 'encryption',
        vertical: 'electronics',
        confidence: 0.82,
        pattern: /\b(encryption|encrypted|vpn|crypto|secure element|secure module|network storage|nvr|nas)\b/i,
        expansion: ['encryption', 'secure module', 'dual-use', 'network storage'],
        reason: 'Encryption or network-storage terms imply commercial encryption review.'
    },
    {
        id: 'battery',
        vertical: 'new-energy',
        confidence: 0.78,
        pattern: /\b(lithium|li-ion|battery|power bank|energy storage|ess|un38\.?3|dangerous goods|ev charger|charger)\b/i,
        expansion: ['lithium battery', 'battery', 'UN38.3', 'dangerous goods'],
        reason: 'Battery / charger terms imply transport and product-safety checks.'
    },
    {
        id: 'infrared',
        vertical: 'electronics',
        confidence: 0.84,
        pattern: /\b(infrared|thermal camera|thermal imaging|night vision)\b/i,
        expansion: ['infrared', 'thermal imaging', 'dual-use', 'surveillance'],
        reason: 'Sensitive imaging terms imply dual-use review.'
    },
    {
        id: 'destination_end_use',
        vertical: null,
        confidence: 0.76,
        pattern: /\b(military|police|surveillance|government|research institute|end[-\s]?use|end[-\s]?user|entity list|sanction|dual-use)\b/i,
        expansion: ['end use', 'end user', 'restricted party', 'dual-use'],
        reason: 'End-use / end-user language implies restricted-party screening.'
    }
];

const PRODUCT_EXPANSION_RULES = [
    {
        vertical: 'new-energy',
        pattern: /\b(solar|photovoltaic|pv module|solar panel|solar cell|polysilicon|inverter)\b/i,
        expansion: ['solar panel', 'photovoltaic', 'pv module', 'polysilicon', 'solar inverter']
    },
    {
        vertical: 'new-energy',
        pattern: /\b(ev charger|wallbox|charging station)\b/i,
        expansion: ['ev charger', 'charger', 'power electronics', 'grid interconnection']
    },
    {
        vertical: 'electronics',
        pattern: /\b(ip camera|network camera|nvr|nas|network storage|surveillance camera)\b/i,
        expansion: ['ip camera', 'network storage', 'wireless', 'encryption', 'surveillance']
    },
    {
        vertical: 'electronics',
        pattern: /\b(router|gateway|access point|wifi)\b/i,
        expansion: ['router', 'wireless', 'wifi', 'telecom', 'encryption']
    },
    {
        vertical: 'electronics',
        pattern: /\b(tablet|tablet computer|ipad)\b/i,
        expansion: ['tablet', 'tablet computer', 'wifi', 'bluetooth', 'battery', 'encryption']
    },
    {
        vertical: 'semiconductor',
        pattern: /\b(optical transceiver|optical module|silicon photonics)\b/i,
        expansion: ['optical transceiver', 'semiconductor', 'laser', 'telecom']
    },
    {
        vertical: 'data-center',
        pattern: /\b(ai\s*server|gpu\s*server|edge\s*ai|storage server|nas|san|data center switch|liquid cooling|server rack|pdu|ups)\b/i,
        expansion: ['data center equipment', 'server', 'edge computing', 'power distribution', 'cooling']
    },
    {
        vertical: 'industrial-automation',
        pattern: /\b(plc|servo|industrial robot|cnc|machine vision|industrial sensor|factory gateway)\b/i,
        expansion: ['industrial automation', 'robotics', 'industrial control', 'factory equipment']
    },
    {
        vertical: 'healthcare-lab',
        pattern: /\b(patient monitor|medical|diagnostic|lab analyzer|laboratory|wearable health|thermometer|cold[-\s]?chain)\b/i,
        expansion: ['medical electronics', 'lab equipment', 'diagnostic device', 'healthcare compliance']
    }
];

const ROUTE_EXPANSION_RULES = {
    import: {
        US: ['us import', 'cbp', 'hts', 'fcc'],
        EU: ['eu import', 'taric', 'ce', 'red'],
        DE: ['germany import', 'taric', 'ce', 'market surveillance'],
        NL: ['netherlands import', 'taric', 'ce', 'dutch customs'],
        SG: ['singapore import', 'singapore customs', 'imda', 'safety mark'],
        MX: ['mexico import', 'nom', 'ift', 'pedimento'],
        VN: ['vietnam import', 'mic', 'qcvn', 'moit'],
        MY: ['malaysia import', 'sirim', 'mcmc', 'st coa'],
        JP: ['japan import', 'pse', 'telec', 'naccs'],
        KR: ['korea import', 'kc certification', 'rra', 'uni-pass'],
        RU: ['russia import', 'eac', 'eaeu', 'customs'],
        TW: ['taiwan import', 'bsmi', 'ncc', 'customs'],
        ASEAN: ['asean import', 'rcep', 'origin', 'customs'],
        CN: ['china import', 'ccc', 'srrc', 'customs']
    },
    export: {
        US: ['us export', 'bis', 'ear', 'aes'],
        EU: ['eu export', 'dual-use', 'export customs', 'regulation 2021/821'],
        DE: ['germany export', 'bafa', 'dual-use', 'export customs'],
        NL: ['netherlands export', 'strategic goods', 'dual-use', 'export customs'],
        SG: ['singapore export', 'strategic goods', 're-export', 'singapore customs'],
        MX: ['mexico export', 'customs export', 'origin', 'usmca'],
        VN: ['vietnam export', 'customs export', 'origin', 'rcep'],
        MY: ['malaysia export', 'customs export', 'origin', 'rcep'],
        JP: ['japan export', 'meti', 'export control', 'catch-all'],
        KR: ['korea export', 'strategic goods', 'kosti', 'export control'],
        RU: ['russia export', 'sanctions', 'dual-use', 'customs'],
        TW: ['taiwan export', 'boft', 'strategic high-tech commodities', 'export control'],
        ASEAN: ['asean export', 'form d', 'rcep', 'origin'],
        CN: ['china export', 'mofcom', 'customs export', 'ccc']
    }
};

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueAppend(target, values) {
    const seen = new Set(target.map((item) => item.toLowerCase()));
    values.forEach((value) => {
        const normalized = normalizeText(value);
        if (!normalized || seen.has(normalized.toLowerCase())) {
            return;
        }
        seen.add(normalized.toLowerCase());
        target.push(normalized);
    });
}

function getCountryRegistryApi() {
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

function normalizeCountryCode(value) {
    const registry = getCountryRegistryApi();
    if (registry?.normalizeCountryCode) {
        return registry.normalizeCountryCode(value || 'GLOBAL');
    }
    return String(value || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
}

function normalizeRouteFocus(value) {
    const registry = getCountryRegistryApi();
    if (registry?.normalizeRouteFocus) {
        return registry.normalizeRouteFocus(value || 'import');
    }
    return value === 'export' ? 'export' : 'import';
}

function getRouteSearchContext(context = {}) {
    const hasModernRoute = Boolean(
        context.from || context.routeFromCountry || context.to || context.routeToCountry || context.focus || context.complianceFocus
    );
    const hasLegacyRoute = Boolean(context.direction && context.country);
    if (!hasModernRoute && !hasLegacyRoute) {
        return null;
    }

    if (!hasModernRoute && hasLegacyRoute) {
        const direction = context.direction === 'import' ? 'import' : 'export';
        const country = normalizeCountryCode(context.country);
        return {
            from: direction === 'import' ? country : 'CN',
            to: direction === 'import' ? 'CN' : country,
            focus: direction === 'import' ? 'export' : 'import',
            direction,
            country
        };
    }

    const registry = getCountryRegistryApi();
    if (registry?.getRouteContext) {
        return registry.getRouteContext({
            from: context.from || context.routeFromCountry,
            to: context.to || context.routeToCountry,
            focus: context.focus || context.complianceFocus
        });
    }
    const focus = normalizeRouteFocus(context.focus || context.complianceFocus || context.direction);
    const from = normalizeCountryCode(context.from || context.routeFromCountry || 'CN');
    const to = normalizeCountryCode(context.to || context.routeToCountry || context.country || 'US');
    return {
        from,
        to,
        focus,
        country: focus === 'export' ? from : to
    };
}

function getRouteExpansionTerms(context = {}) {
    const route = getRouteSearchContext(context);
    if (!route) {
        return [];
    }
    const focus = normalizeRouteFocus(route.focus);
    const focusCountry = normalizeCountryCode(focus === 'export' ? route.from : route.to);
    const selectedCountry = normalizeCountryCode(route.country || context.country);
    const country = focusCountry !== 'GLOBAL' ? focusCountry : selectedCountry;
    const terms = ROUTE_EXPANSION_RULES[focus]?.[country] || ROUTE_EXPANSION_RULES[focus]?.GLOBAL || [];
    return terms.slice(0, 4);
}

function inferProductAttributes(description = '', context = {}) {
    const text = normalizeText([
        description,
        context.hsCode || context.hscode || '',
        context.category || '',
        context.vertical || ''
    ].filter(Boolean).join(' '));

    const attributes = [];
    const precheckIds = [];
    const expansionTerms = [];
    const verticalScores = {};
    const reasons = [];

    ATTRIBUTE_RULES.forEach((rule) => {
        if (!rule.pattern.test(text)) {
            return;
        }
        attributes.push({
            id: rule.id,
            confidence: rule.confidence,
            reason: rule.reason
        });
        precheckIds.push(rule.id);
        uniqueAppend(expansionTerms, rule.expansion);
        reasons.push(rule.reason);
        if (rule.vertical) {
            verticalScores[rule.vertical] = (verticalScores[rule.vertical] || 0) + rule.confidence;
        }
    });

    PRODUCT_EXPANSION_RULES.forEach((rule) => {
        if (!rule.pattern.test(text)) {
            return;
        }
        uniqueAppend(expansionTerms, rule.expansion);
        if (rule.vertical) {
            verticalScores[rule.vertical] = (verticalScores[rule.vertical] || 0) + 0.5;
        }
    });

    if (precheckIds.includes('ai_chip') || precheckIds.includes('advanced_manufacturing')) {
        precheckIds.push('semiconductor');
    }
    if (precheckIds.includes('uav')) {
        precheckIds.push('wireless', 'battery', 'destination_end_use');
    }

    const vertical = Object.entries(verticalScores)
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        || context.vertical
        || 'electronics';

    return {
        input: text,
        vertical,
        attributes,
        precheckIds: [...new Set(precheckIds)],
        expansionTerms,
        confidence: attributes.length
            ? Math.max(...attributes.map((item) => item.confidence))
            : 0,
        reasons: [...new Set(reasons)]
    };
}

function buildEnhancedProductQuery(description = '', context = {}) {
    const base = normalizeText(description);
    const profile = inferProductAttributes(base, context);
    const routeTerms = getRouteExpansionTerms(context);
    const parts = base ? [base] : [];
    uniqueAppend(parts, profile.expansionTerms);
    uniqueAppend(parts, routeTerms);
    profile.routeTerms = routeTerms;
    profile.route = getRouteSearchContext(context);
    return {
        query: parts.join(' ').trim(),
        profile
    };
}

function mapPrecheckIdsToSelections(precheckIds, factors) {
    const source = factors || (typeof globalThis !== 'undefined' ? globalThis.PRECHECK_FACTORS : null) || {};
    return [...new Set(precheckIds || [])]
        .filter((id) => source[id])
        .map((id) => ({ id, ...source[id], inferred: true }));
}

function mergePrecheckSelections(manualSelections = [], inferredSelections = []) {
    const merged = [];
    const seen = new Set();
    [...(manualSelections || []), ...(inferredSelections || [])].forEach((item) => {
        if (!item?.id || seen.has(item.id)) {
            return;
        }
        seen.add(item.id);
        merged.push(item);
    });
    return merged;
}

function prepareIntelligentSearch(description = '', manualSelections = [], factors = null, context = {}) {
    const enhanced = buildEnhancedProductQuery(description, context);
    const inferredSelections = mapPrecheckIdsToSelections(enhanced.profile.precheckIds, factors);
    const selections = mergePrecheckSelections(manualSelections, inferredSelections);
    return {
        originalQuery: normalizeText(description),
        expandedQuery: enhanced.query,
        profile: enhanced.profile,
        inferredSelections,
        selections
    };
}

const productIntelligenceApi = {
    ATTRIBUTE_RULES,
    PRODUCT_EXPANSION_RULES,
    ROUTE_EXPANSION_RULES,
    inferProductAttributes,
    buildEnhancedProductQuery,
    getRouteExpansionTerms,
    mapPrecheckIdsToSelections,
    mergePrecheckSelections,
    prepareIntelligentSearch
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = productIntelligenceApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyProductIntelligence = productIntelligenceApi;
}
