/**
 * Trade Opportunity Insights — deterministic route and market opportunity layer.
 * The module intentionally uses local coverage/rate signals first, so it remains
 * fast and stable before a future live market-data feed is connected.
 */
'use strict';

function resolveCountryRegistry() {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyCountryRegistry) {
        return globalThis.TradeComplyCountryRegistry;
    }
    if (typeof require === 'function') {
        try {
            return require('./country-registry');
        } catch (error) {
            /* browser without require */
        }
    }
    return null;
}

const countryRegistry = resolveCountryRegistry();

const FALLBACK_COUNTRY_LABELS = {
    CN: 'China',
    US: 'United States',
    EU: 'European Union',
    DE: 'Germany',
    NL: 'Netherlands',
    SG: 'Singapore',
    MX: 'Mexico',
    VN: 'Vietnam',
    MY: 'Malaysia',
    RU: 'Russia',
    JP: 'Japan',
    KR: 'South Korea',
    TW: 'Taiwan (China)',
    GLOBAL: 'Other'
};

const MARKET_PROFILES = {
    US: {
        opportunity: 'Large demand, strong distributor ecosystem, but China-origin electronics may carry trade-remedy and forced-labor scrutiny.',
        advantage: 'High-value market with clear tariff and agency reference systems.',
        watchpoint: 'Check Section 301, AD/CVD, FCC, UFLPA, and restricted-party exposure.',
        score: 66
    },
    EU: {
        opportunity: 'Good for products with strong CE, RoHS, REACH, EPR, and sustainability documentation.',
        advantage: 'Single-market access once compliance evidence is organized.',
        watchpoint: 'Confirm importer EPR, WEEE, battery, packaging, and green-claim obligations.',
        score: 72
    },
    DE: {
        opportunity: 'Strong electronics and industrial buyer base; useful as an EU quality-sensitive market.',
        advantage: 'High-value EU demand and mature compliance expectations.',
        watchpoint: 'Prepare CE/RoHS/REACH, WEEE, packaging, and German market-surveillance evidence.',
        score: 70
    },
    NL: {
        opportunity: 'Useful EU logistics and distribution gateway for electronics and energy products.',
        advantage: 'Strong port/logistics infrastructure for EU routing.',
        watchpoint: 'Confirm EU import evidence, VAT flow, and transit documentation.',
        score: 73
    },
    SG: {
        opportunity: 'Good ASEAN hub for electronics distribution, re-export, and regional testing of demand.',
        advantage: 'Often low customs-duty friction for electronics, with GST and clear import processes.',
        watchpoint: 'Check IMDA telecom approval, strategic goods controls, GST, and re-export screening.',
        score: 83
    },
    MX: {
        opportunity: 'Useful for North America nearshoring and US market access planning.',
        advantage: 'Potential USMCA supply-chain value if origin and manufacturing conditions are met.',
        watchpoint: 'Check NOM standards, customs valuation, VAT, origin support, and IMMEX exposure.',
        score: 76
    },
    VN: {
        opportunity: 'Useful alternative manufacturing/export base for electronics and components.',
        advantage: 'ASEAN production footprint may reduce concentration risk.',
        watchpoint: 'Validate origin, MIC/radio approvals, energy labeling, and anti-circumvention exposure.',
        score: 74
    },
    MY: {
        opportunity: 'Strong electronics manufacturing base and ASEAN supply-chain role.',
        advantage: 'Useful for components, batteries, and smart hardware supply-chain diversification.',
        watchpoint: 'Check SIRIM/MCMC, ST electrical safety, origin evidence, and export documentation.',
        score: 75
    },
    JP: {
        opportunity: 'Premium market for quality electronics, components, and industrial technology.',
        advantage: 'Clear safety/radio approval framework and high buyer trust when documentation is strong.',
        watchpoint: 'Check PSE, TELEC, food-contact/battery rules where relevant, and consumption tax.',
        score: 69
    },
    KR: {
        opportunity: 'Strong electronics and semiconductor ecosystem with clear KC requirements.',
        advantage: 'Good fit for components, consumer electronics, and advanced hardware channels.',
        watchpoint: 'Check KC certification, customs classification, VAT, and strategic technology controls.',
        score: 68
    },
    RU: {
        opportunity: 'Only suitable when sanctions, dual-use, payment, logistics, and end-user risks are cleared.',
        advantage: 'Demand can exist, but compliance friction is material.',
        watchpoint: 'Screen sanctions, dual-use restrictions, end users, logistics providers, and payment route.',
        score: 30
    }
};

const PRODUCT_SIGNALS = [
    {
        id: 'battery',
        match: /(battery|batteries|lithium|li-ion|energy storage|ess|储能|锂电)/i,
        label: 'Battery / ESS',
        hsPrefixes: ['850760', '8507'],
        opportunity: 'Battery and ESS demand is strong, but documentation quality can decide market access.',
        green: 'Battery, recycling, EPR, transport, and carbon-footprint evidence may affect buyer acceptance.',
        supplyChain: 'Prepare cell origin, pack assembly, supplier declarations, and dangerous-goods evidence.'
    },
    {
        id: 'solar',
        match: /(solar|photovoltaic|pv module|panel|inverter|光伏|太阳能)/i,
        label: 'Solar / PV',
        hsPrefixes: ['854143', '854142', '8504'],
        opportunity: 'PV products can benefit from energy-transition demand, but origin and forced-labor proof are decisive.',
        green: 'Green claims, EPR/packaging, CE, and product safety evidence matter in developed markets.',
        supplyChain: 'Prepare polysilicon/wafer/cell/module origin traceability and supplier declarations.'
    },
    {
        id: 'smartphone',
        match: /(smartphone|phone|cellular|5g|tablet|computer|laptop|智能手机|平板|电脑)/i,
        label: 'Consumer electronics',
        hsPrefixes: ['8517', '8471'],
        opportunity: 'Consumer electronics can move through lower-friction hubs when radio, safety, and labeling evidence is ready.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and battery requirements may affect channel onboarding.',
        supplyChain: 'Keep radio module, battery, adapter, and origin evidence aligned with the declared HS code.'
    },
    {
        id: 'semiconductor',
        match: /(chip|semiconductor|gpu|accelerator|processor|ic|integrated circuit|芯片|半导体)/i,
        label: 'Semiconductor / AI hardware',
        hsPrefixes: ['8542', '8473'],
        opportunity: 'High-value demand exists, but route selection should account for export controls and end-use scrutiny.',
        green: 'Green compliance is usually secondary to export-control and supply-chain evidence for this category.',
        supplyChain: 'Prepare foundry, technology-origin, end-use, end-user, and restricted-party documentation.'
    },
    {
        id: 'drone',
        match: /(drone|uav|quadcopter|flight controller|无人机)/i,
        label: 'Drone / UAV',
        hsPrefixes: ['8806', '8525'],
        opportunity: 'Civil UAV opportunities exist, but route choice should avoid dual-use ambiguity.',
        green: 'Battery transport and product safety evidence remain important.',
        supplyChain: 'Prepare payload, range, autonomy, camera/sensor, end-use, and consignee evidence.'
    }
];

function normalizeCountry(code) {
    return countryRegistry?.normalizeCountryCode
        ? countryRegistry.normalizeCountryCode(code)
        : String(code || 'GLOBAL').trim().toUpperCase();
}

function countryLabel(code) {
    const normalized = normalizeCountry(code);
    return countryRegistry?.getCountryLabel
        ? countryRegistry.getCountryLabel(normalized)
        : (FALLBACK_COUNTRY_LABELS[normalized] || normalized);
}

function routeOptions() {
    if (countryRegistry?.getRouteOptions) {
        return countryRegistry.getRouteOptions().filter((row) => row.value !== 'GLOBAL');
    }
    return Object.entries(FALLBACK_COUNTRY_LABELS)
        .filter(([value]) => value !== 'GLOBAL')
        .map(([value, label]) => ({ value, label }));
}

function detectProductSignal(product = '') {
    const text = String(product || '');
    return PRODUCT_SIGNALS.find((signal) => signal.match.test(text)) || {
        id: 'general',
        label: 'General electronics',
        hsPrefixes: ['8517', '8504', '8542'],
        opportunity: 'Compare markets by import friction, route risk, and documentation readiness.',
        green: 'Check product safety, environmental registration, and packaging/EPR obligations where relevant.',
        supplyChain: 'Keep origin, supplier, and technical evidence consistent with invoices and declarations.'
    };
}

function normalizeDutyRules(dutyRates = {}) {
    if (Array.isArray(dutyRates)) {
        return dutyRates;
    }
    if (Array.isArray(dutyRates.rules)) {
        return dutyRates.rules;
    }
    return [];
}

function hsMatches(rule, hsPrefixes = []) {
    const rulePrefixes = Array.isArray(rule?.hs_prefixes) ? rule.hs_prefixes : [];
    if (!rulePrefixes.length || !hsPrefixes.length) {
        return false;
    }
    return rulePrefixes.some((rulePrefix) => hsPrefixes.some((prefix) => (
        String(rulePrefix).startsWith(String(prefix)) || String(prefix).startsWith(String(rulePrefix))
    )));
}

function findDutySignal({ from, to, productSignal, dutyRates }) {
    const rules = normalizeDutyRules(dutyRates);
    const exact = rules.find((rule) => (
        normalizeCountry(rule.import_country) === to
        && normalizeCountry(rule.origin_country) === from
        && hsMatches(rule, productSignal.hsPrefixes)
    ));
    const destination = exact || rules.find((rule) => (
        normalizeCountry(rule.import_country) === to
        && hsMatches(rule, productSignal.hsPrefixes)
    ));
    if (!destination) {
        return null;
    }
    const base = Number(destination.base_rate || 0);
    const additional = Number(destination.additional_rate || 0);
    return {
        id: destination.id || '',
        sourceStatus: destination.source_status || 'indicative',
        baseRate: base,
        additionalRate: additional,
        totalRate: base + additional,
        confidence: destination.confidence || '',
        note: destination.source_note || destination.label || ''
    };
}

function rateLabel(rate) {
    if (!Number.isFinite(rate)) {
        return 'not covered';
    }
    return `${(rate * 100).toFixed(rate === 0 ? 1 : 1)}%`;
}

function scoreMarket({ market, from, to, focus, productSignal, dutySignal }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    let score = profile.score;
    const totalRate = dutySignal?.totalRate;
    if (Number.isFinite(totalRate)) {
        if (totalRate === 0) score += 10;
        else if (totalRate <= 0.05) score += 5;
        else if (totalRate >= 0.15) score -= 12;
        else if (totalRate >= 0.08) score -= 6;
    } else {
        score -= 4;
    }
    if (market === to) {
        score += 4;
    }
    if (market === from) {
        score -= 30;
    }
    if (market === 'RU') {
        score -= 24;
    }
    if (productSignal.id === 'solar' && ['EU', 'DE', 'NL', 'SG', 'MY', 'VN'].includes(market)) {
        score += 5;
    }
    if (productSignal.id === 'battery' && ['SG', 'MY', 'VN', 'EU', 'DE', 'NL'].includes(market)) {
        score += 5;
    }
    if (productSignal.id === 'semiconductor' && ['US', 'JP', 'KR', 'SG', 'NL'].includes(market)) {
        score += 3;
    }
    if (focus === 'export' && market === from) {
        score += 8;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function buildMarketCard({ market, from, to, focus, productSignal, dutyRates }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    const dutySignal = findDutySignal({ from, to: market, productSignal, dutyRates });
    const score = scoreMarket({ market, from, to, focus, productSignal, dutySignal });
    const route = `${countryLabel(from)} -> ${countryLabel(market)}`;
    const rateText = dutySignal
        ? `${rateLabel(dutySignal.totalRate)} estimated import duty signal`
        : 'No maintained exact duty signal yet';
    const tag = score >= 80 ? 'Strong opportunity' : score >= 68 ? 'Worth reviewing' : score >= 50 ? 'Watch carefully' : 'High-friction route';
    return {
        market,
        label: countryLabel(market),
        route,
        score,
        tag,
        rateText,
        sourceStatus: dutySignal?.sourceStatus || 'not_covered',
        opportunity: profile.opportunity,
        advantage: profile.advantage,
        watchpoint: profile.watchpoint
    };
}

function buildOpportunityInsights(input = {}) {
    const from = normalizeCountry(input.from || 'CN');
    const to = normalizeCountry(input.to || 'US');
    const focus = String(input.focus || 'import').toLowerCase() === 'export' ? 'export' : 'import';
    const product = String(input.product || '').trim() || 'electronics product';
    const productSignal = detectProductSignal(product);
    const candidates = routeOptions()
        .map((row) => normalizeCountry(row.value))
        .filter((code) => code && code !== 'GLOBAL' && code !== from);
    const cards = candidates
        .map((market) => buildMarketCard({ market, from, to, focus, productSignal, dutyRates: input.dutyRates }))
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    const selectedMarket = buildMarketCard({ market: to, from, to, focus, productSignal, dutyRates: input.dutyRates });
    const best = cards[0] || selectedMarket;
    const compared = cards.slice(0, 4);
    const lowerFriction = compared.find((card) => card.market !== to && card.score > selectedMarket.score + 4);
    const summary = lowerFriction
        ? `${lowerFriction.label} may be a lower-friction market to compare against ${countryLabel(to)} for ${productSignal.label.toLowerCase()}.`
        : `${countryLabel(to)} remains the primary route to review; compare tax, certification, and evidence readiness before committing.`;

    return {
        product,
        productSignal,
        from,
        to,
        focus,
        routeLabel: `${countryLabel(from)} -> ${countryLabel(to)}`,
        best,
        selectedMarket,
        markets: compared,
        summary,
        insights: [
            {
                type: 'Route opportunity',
                label: best.tag,
                text: `${best.route}: ${best.advantage} ${best.rateText}.`
            },
            {
                type: 'Green compliance',
                label: productSignal.label,
                text: productSignal.green
            },
            {
                type: 'Supply-chain evidence',
                label: 'Evidence readiness',
                text: productSignal.supplyChain
            },
            {
                type: 'Watchpoint',
                label: countryLabel(to),
                text: selectedMarket.watchpoint
            }
        ]
    };
}

const api = {
    MARKET_PROFILES,
    PRODUCT_SIGNALS,
    detectProductSignal,
    buildOpportunityInsights
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyOpportunity = api;
}
