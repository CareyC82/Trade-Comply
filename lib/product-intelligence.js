/**
 * Lightweight product-understanding layer.
 *
 * This is intentionally deterministic and local: it improves matching speed and
 * consistency without waiting for an external AI call.
 */
'use strict';

const ATTRIBUTE_RULES = [
    {
        id: 'ai_chip',
        vertical: 'semiconductor',
        confidence: 0.92,
        pattern: /\b(ai\s*(gpu|chip|accelerator)|gpu|hbm|advanced computing|inference accelerator)\b/i,
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
        vertical: 'semiconductor',
        pattern: /\b(optical transceiver|optical module|silicon photonics)\b/i,
        expansion: ['optical transceiver', 'semiconductor', 'laser', 'telecom']
    }
];

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
    const parts = base ? [base] : [];
    uniqueAppend(parts, profile.expansionTerms);
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
    inferProductAttributes,
    buildEnhancedProductQuery,
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
