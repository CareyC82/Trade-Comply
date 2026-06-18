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
    IN: 'India',
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
        score: 76
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
    IN: {
        opportunity: 'Large electronics demand and manufacturing-shift opportunity, with tariff-line certainty and product approvals deciding execution quality.',
        advantage: 'High-growth market for electronics, PV, batteries, mobile devices, and supply-chain diversification.',
        watchpoint: 'Check BCD/SWS/IGST, BIS/QCO, WPC, e-waste, battery rules, customs valuation, and anti-dumping/safeguard scope.',
        score: 77
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
        id: 'tablet',
        match: /(tablet|ipad|portable computer|平板)/i,
        label: 'Tablet computer',
        hsPrefixes: ['847130', '8471'],
        priorityProductIds: ['tablet'],
        opportunity: 'Tablet and portable-computer routes can be attractive when wireless, battery, labeling, and duty evidence are ready.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and embedded-battery requirements may affect channel onboarding.',
        supplyChain: 'Keep processor, radio module, battery, adapter, and origin evidence aligned with declared HS codes.'
    },
    {
        id: 'battery',
        match: /(battery|batteries|lithium|li-ion|energy storage|ess|储能|锂电)/i,
        label: 'Battery / ESS',
        hsPrefixes: ['850760', '8507'],
        priorityProductIds: ['battery'],
        opportunity: 'Battery and ESS demand is strong, but documentation quality can decide market access.',
        green: 'Battery, recycling, EPR, transport, and carbon-footprint evidence may affect buyer acceptance.',
        supplyChain: 'Prepare cell origin, pack assembly, supplier declarations, and dangerous-goods evidence.'
    },
    {
        id: 'ev_charger',
        match: /(ev charger|charging station|power converter|ac charger|dc charger|充电桩|充电器)/i,
        label: 'EV charger / power converter',
        hsPrefixes: ['850440', '8504'],
        priorityProductIds: ['ev_charger'],
        opportunity: 'EV charging equipment can ride clean-transport demand, but standards, installation, and grid-safety evidence drive buyer confidence.',
        green: 'Energy-efficiency, product safety, EMC, RoHS/REACH, and packaging/EPR obligations can affect market entry.',
        supplyChain: 'Keep converter specifications, safety certificates, connector standards, origin, and installation-use evidence aligned.'
    },
    {
        id: 'solar',
        match: /(solar|photovoltaic|pv module|panel|inverter|光伏|太阳能)/i,
        label: 'Solar / PV',
        hsPrefixes: ['854143', '854142', '8504'],
        priorityProductIds: ['solar'],
        opportunity: 'PV products can benefit from energy-transition demand, but origin and forced-labor proof are decisive.',
        green: 'Green claims, EPR/packaging, CE, and product safety evidence matter in developed markets.',
        supplyChain: 'Prepare polysilicon/wafer/cell/module origin traceability and supplier declarations.'
    },
    {
        id: 'smartphone',
        match: /(smartphone|phone|cellular|5g|tablet|computer|laptop|智能手机|平板|电脑)/i,
        label: 'Consumer electronics',
        hsPrefixes: ['8517', '8471'],
        priorityProductIds: ['smartphone', 'router'],
        opportunity: 'Consumer electronics can move through lower-friction hubs when radio, safety, and labeling evidence is ready.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and battery requirements may affect channel onboarding.',
        supplyChain: 'Keep radio module, battery, adapter, and origin evidence aligned with the declared HS code.'
    },
    {
        id: 'semiconductor',
        match: /(?!(?:.*\b(?:ai\s*server|gpu\s*server|edge\s*ai|data\s*center|server\s*rack|storage\s*server)\b))(chip|semiconductor|gpu\s*(?:chip|accelerator)?|accelerator\s*(?:chip|card)?|processor|ic|integrated circuit|芯片|半导体)/i,
        label: 'Semiconductor / AI hardware',
        hsPrefixes: ['8542', '8473'],
        priorityProductIds: ['semiconductor'],
        opportunity: 'High-value demand exists, but route selection should account for export controls and end-use scrutiny.',
        green: 'Green compliance is usually secondary to export-control and supply-chain evidence for this category.',
        supplyChain: 'Prepare foundry, technology-origin, end-use, end-user, and restricted-party documentation.'
    },
    {
        id: 'data_center',
        match: /(ai\s*server|gpu\s*server|edge\s*ai|data\s*center|server\s*rack|storage\s*server|nas|san|network appliance|firewall appliance|liquid cooling|pdu|ups)/i,
        label: 'Data center / edge computing equipment',
        hsPrefixes: ['8471', '8517', '8504', '8419'],
        priorityProductIds: ['server', 'router', 'semiconductor'],
        opportunity: 'System-level compute, storage, network, cooling, and rack-power opportunities depend on buyer ecosystem, export controls, and infrastructure readiness.',
        green: 'Energy efficiency, cooling, packaging, WEEE/EPR, and responsible supply-chain evidence can affect enterprise procurement.',
        supplyChain: 'Keep accelerator, storage, network module, power, cooling, origin, and end-use evidence aligned before quoting routes.'
    },
    {
        id: 'industrial_automation',
        match: /(industrial robot|robot arm|plc|programmable logic controller|servo motor|servo drive|cnc controller|machine vision|industrial sensor|factory gateway|industrial iot)/i,
        label: 'Industrial automation / robotics',
        hsPrefixes: ['8479', '8537', '8501', '8525', '8517'],
        priorityProductIds: ['robotics', 'machinery', 'router'],
        opportunity: 'Automation equipment can benefit from reshoring, factory upgrades, and advanced manufacturing demand when safety and control-system evidence are ready.',
        green: 'Energy efficiency, machinery safety, RoHS/REACH, and lifecycle documentation can support industrial buyer onboarding.',
        supplyChain: 'Prepare controller, servo, sensor, software, safety, origin, and end-user evidence for each route.'
    },
    {
        id: 'healthcare_lab',
        match: /(patient monitor|medical monitor|medical device|diagnostic device|lab analyzer|laboratory analyzer|ivd|wearable health|electronic thermometer|cold[-\s]?chain|medical power supply)/i,
        label: 'Healthcare / lab electronics',
        hsPrefixes: ['9018', '9027', '9025', '8504'],
        priorityProductIds: ['medical', 'lab', 'electronics'],
        opportunity: 'Healthcare and lab electronics opportunities depend on regulated-use scope, distributor readiness, and documentation quality.',
        green: 'Battery, packaging, e-waste, calibration, and cold-chain evidence may affect hospital, lab, and distributor acceptance.',
        supplyChain: 'Keep intended-use, labeling, serial/lot, calibration, safety, EMC, importer, and post-market evidence organized.'
    },
    {
        id: 'drone',
        match: /(drone|uav|quadcopter|flight controller|无人机)/i,
        label: 'Drone / UAV',
        hsPrefixes: ['8806', '8525'],
        priorityProductIds: [],
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
        priorityProductIds: ['smartphone', 'router', 'tablet'],
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

function normalizePriorityRoutes(priorityMatrix = {}) {
    if (Array.isArray(priorityMatrix)) {
        return priorityMatrix;
    }
    if (Array.isArray(priorityMatrix.routes)) {
        return priorityMatrix.routes;
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
    const layers = Array.isArray(destination.add_on_layers)
        ? destination.add_on_layers.map((layer) => ({
            type: layer.type || 'add_on',
            label: layer.label || layer.type || 'Add-on',
            rate: Number.isFinite(Number(layer.rate)) ? Number(layer.rate) : null,
            basis: layer.basis || '',
            status: layer.status || '',
            source: layer.source || ''
        }))
        : [];
    const taxLayers = layers.filter((layer) => /(vat|gst|tax|consumption)/i.test(`${layer.type} ${layer.label}`));
    const tradeRemedyLayers = layers.filter((layer) => !taxLayers.includes(layer));
    return {
        id: destination.id || '',
        sourceStatus: destination.source_status || 'indicative',
        baseRate: base,
        additionalRate: additional,
        totalRate: base + additional,
        layers,
        taxLayers,
        tradeRemedyLayers,
        confidence: destination.confidence || '',
        note: destination.source_note || destination.label || '',
        sourceUrl: destination.source_url || '',
        sourceHts: destination.source_hts || '',
        sourceRateText: destination.source_rate_text || ''
    };
}

function findPriorityRoute({ from, to, productSignal, priorityMatrix }) {
    const routes = normalizePriorityRoutes(priorityMatrix);
    const productIds = Array.isArray(productSignal.priorityProductIds) ? productSignal.priorityProductIds : [];
    const exact = routes.find((route) => (
        normalizeCountry(route.origin_country) === from
        && normalizeCountry(route.import_country) === to
        && productIds.includes(route.product_id)
    ));
    if (exact) {
        return exact;
    }
    const wildcard = routes.find((route) => (
        String(route.origin_country || '').trim() === '*'
        && normalizeCountry(route.import_country) === to
        && productIds.includes(route.product_id)
    ));
    if (wildcard) {
        return wildcard;
    }
    return routes.find((route) => (
        normalizeCountry(route.origin_country) === from
        && normalizeCountry(route.import_country) === to
        && hsMatches({ hs_prefixes: [route.hs_code] }, productSignal.hsPrefixes)
    )) || null;
}

function trustRank(sourceTrust = '') {
    const ranks = {
        official_exact_rate: 100,
        official_duty_tax_estimate: 86,
        mixed_official_estimate: 72,
        official_heading_only: 62,
        official_link_estimate: 58,
        precheck_estimate: 36
    };
    return ranks[sourceTrust] || 20;
}

function classifyCoverage({ dutySignal, priorityRoute }) {
    const sourceTrust = priorityRoute?.expected_source_trust || '';
    if (sourceTrust === 'official_exact_rate') {
        return {
            label: 'Official exact',
            tone: 'official',
            sourceTrust,
            automationLevel: priorityRoute.automation_level || 'official_auto',
            parserNextAction: 'Exact official tariff-line parser is already connected for this maintained route.'
        };
    }
    if (sourceTrust === 'official_duty_tax_estimate') {
        return {
            label: 'Official duty + tax estimate',
            tone: 'hybrid',
            sourceTrust,
            automationLevel: priorityRoute.automation_level || 'hybrid_official',
            parserNextAction: 'Keep VAT/GST and local tax layer refresh separate from official base-duty parsing.'
        };
    }
    if (sourceTrust === 'mixed_official_estimate') {
        return {
            label: 'Hybrid official estimate',
            tone: 'hybrid',
            sourceTrust,
            automationLevel: priorityRoute?.automation_level || 'hybrid_official',
            parserNextAction: 'Add exact add-on duty / trade-remedy scope parser where available.'
        };
    }
    if (sourceTrust === 'official_heading_only') {
        return {
            label: 'Official heading only',
            tone: 'partial',
            sourceTrust,
            automationLevel: priorityRoute?.automation_level || 'official_link_monitor',
            parserNextAction: 'Connect exact tariff-line parser; heading-level source can change by product attributes.'
        };
    }
    if (sourceTrust === 'official_link_estimate') {
        return {
            label: 'Official link monitored',
            tone: 'partial',
            sourceTrust,
            automationLevel: priorityRoute?.automation_level || 'official_link_monitor',
            parserNextAction: 'Connect exact machine-readable tariff-line parser for this official source.'
        };
    }
    if (dutySignal?.sourceStatus === 'official_link_checked') {
        return {
            label: 'Official link monitored',
            tone: 'partial',
            sourceTrust: 'official_link_estimate',
            automationLevel: 'official_link_monitor',
            parserNextAction: 'Connect exact machine-readable tariff-line parser for this official source.'
        };
    }
    if (dutySignal) {
        return {
            label: 'Maintained duty signal',
            tone: 'partial',
            sourceTrust: dutySignal.sourceStatus || 'indicative',
            automationLevel: 'duty_signal',
            parserNextAction: 'Map this route into the high-frequency matrix and assign a source trust tier.'
        };
    }
    return {
        label: 'Coverage gap',
        tone: 'gap',
        sourceTrust: 'not_covered',
        automationLevel: 'not_covered',
        parserNextAction: 'Add maintained duty-rate coverage and official source mapping for this route.'
    };
}

function coverageReadiness(coverage) {
    const details = {
        official_exact_rate: {
            rank: 5,
            headline: 'Ready to quote with official exact rate',
            businessAction: 'Use this route as a strong commercial candidate; keep entry-date and origin evidence current.',
            parserPriority: 'P0 maintained'
        },
        official_duty_tax_estimate: {
            rank: 4,
            headline: 'Commercially usable with official duty basis',
            businessAction: 'Good route for pricing comparison; VAT/GST and local tax layers should stay refreshed before filing.',
            parserPriority: 'P1 tax-layer refresh'
        },
        mixed_official_estimate: {
            rank: 3,
            headline: 'Usable for comparison, but add-on duty scope matters',
            businessAction: 'Use for opportunity sizing, then confirm trade-remedy/add-on scope before quoting landed cost.',
            parserPriority: 'P1 add-on scope parser'
        },
        official_heading_only: {
            rank: 2,
            headline: 'Official source exists, exact HS still controls the answer',
            businessAction: 'Do not price final landed cost from this route until exact tariff line and scope are confirmed.',
            parserPriority: 'P2 exact HS parser'
        },
        official_link_estimate: {
            rank: 2,
            headline: 'Official source is linked, parser still pending',
            businessAction: 'Useful for market screening; avoid final price promises until the exact tariff parser is connected.',
            parserPriority: 'P2 parser backlog'
        },
        not_covered: {
            rank: 0,
            headline: 'Rate source not maintained yet',
            businessAction: 'Treat as a research lead only; add official tariff coverage before recommending this route.',
            parserPriority: 'P0 source gap'
        }
    };
    return details[coverage.sourceTrust] || {
        rank: 1,
        headline: 'Maintained pre-check signal',
        businessAction: 'Use for quick screening only; map this route into the official priority matrix before relying on it.',
        parserPriority: 'P3 matrix mapping'
    };
}

function rateLabel(rate) {
    if (!Number.isFinite(rate)) {
        return 'not covered';
    }
    return `${(rate * 100).toFixed(rate === 0 ? 1 : 1)}%`;
}

function layerRateLabel(layer) {
    return Number.isFinite(layer?.rate) ? rateLabel(layer.rate) : 'scope check';
}

function productMarketFit(productId, market) {
    const fit = {
        solar: {
            EU: 7,
            DE: 7,
            NL: 6,
            US: 5,
            IN: 5,
            VN: 4,
            MY: 4,
            SG: 2
        },
        battery: {
            EU: 6,
            DE: 6,
            NL: 5,
            US: 5,
            IN: 5,
            MY: 4,
            VN: 4,
            SG: 3
        },
        smartphone: {
            US: 6,
            EU: 5,
            JP: 5,
            KR: 5,
            IN: 5,
            MX: 4,
            SG: 3
        },
        semiconductor: {
            US: 8,
            JP: 7,
            KR: 7,
            NL: 6,
            EU: 5,
            IN: 4,
            SG: 3
        },
        data_center: {
            US: 8,
            EU: 6,
            DE: 6,
            NL: 5,
            JP: 5,
            KR: 5,
            IN: 5,
            SG: 2
        },
        industrial_automation: {
            DE: 8,
            JP: 7,
            KR: 6,
            US: 6,
            MX: 6,
            EU: 5,
            VN: 4,
            SG: 2
        },
        healthcare_lab: {
            US: 7,
            EU: 7,
            DE: 6,
            JP: 6,
            KR: 5,
            IN: 5,
            SG: 2
        },
        drone: {
            US: 5,
            EU: 5,
            JP: 4,
            KR: 4,
            SG: 2
        },
        general: {
            US: 5,
            EU: 4,
            DE: 4,
            NL: 4,
            JP: 4,
            KR: 4,
            MX: 4,
            SG: 3
        }
    };
    return fit[productId]?.[market] ?? 0;
}

function summarizeDutyBreakdown(dutySignal) {
    if (!dutySignal) {
        return {
            baseDuty: 'Not covered',
            addOnDuty: 'Pending',
            taxLayer: 'Pending',
            totalRate: 'Not covered',
            sourceBasis: 'No maintained route / HS duty signal yet.',
            officialSourceUrl: '',
            items: []
        };
    }
    const taxText = dutySignal.taxLayers.length
        ? dutySignal.taxLayers.map((layer) => `${layer.label}: ${layerRateLabel(layer)}`).join(' · ')
        : 'No tax layer shown';
    const addOnText = dutySignal.tradeRemedyLayers.length
        ? dutySignal.tradeRemedyLayers.map((layer) => `${layer.label}: ${layerRateLabel(layer)}`).join(' · ')
        : (dutySignal.additionalRate ? rateLabel(dutySignal.additionalRate) : 'None shown');
    const sourceBasis = [
        dutySignal.sourceHts,
        dutySignal.sourceRateText,
        dutySignal.confidence
    ].filter(Boolean).join(' · ') || dutySignal.note || 'Maintained pre-check duty signal.';
    return {
        baseDuty: rateLabel(dutySignal.baseRate),
        addOnDuty: addOnText,
        taxLayer: taxText,
        totalRate: rateLabel(dutySignal.totalRate),
        sourceBasis,
        officialSourceUrl: dutySignal.sourceUrl,
        items: [
            { label: 'Base duty', value: rateLabel(dutySignal.baseRate) },
            { label: 'Add-on / remedy', value: addOnText },
            { label: 'Tax layer', value: taxText },
            { label: 'Total signal', value: rateLabel(dutySignal.totalRate) }
        ]
    };
}

function recommendationReasons({ market, from, to, productSignal, dutySignal, coverage, readiness, profile }) {
    const reasons = [];
    if (Number.isFinite(dutySignal?.totalRate)) {
        if (dutySignal.totalRate === 0) {
            reasons.push({
                label: 'Low duty signal',
                tone: 'positive',
                detail: 'Maintained duty signal is 0.0%, which supports pricing comparison.'
            });
        } else if (dutySignal.totalRate <= 0.05) {
            reasons.push({
                label: 'Manageable duty',
                tone: 'positive',
                detail: `Maintained duty signal is ${rateLabel(dutySignal.totalRate)}.`
            });
        } else if (dutySignal.totalRate >= 0.15) {
            reasons.push({
                label: 'High landed-cost friction',
                tone: 'caution',
                detail: `Maintained duty signal is ${rateLabel(dutySignal.totalRate)} before final scope checks.`
            });
        } else {
            reasons.push({
                label: 'Moderate duty exposure',
                tone: 'neutral',
                detail: `Maintained duty signal is ${rateLabel(dutySignal.totalRate)}.`
            });
        }
    } else {
        reasons.push({
            label: 'Rate coverage gap',
            tone: 'caution',
            detail: 'No maintained duty signal is available for this route/product yet.'
        });
    }

    if (readiness.rank >= 4) {
        reasons.push({
            label: 'Stronger rate confidence',
            tone: 'positive',
            detail: coverage.label
        });
    } else if (readiness.rank >= 2) {
        reasons.push({
            label: 'Parser upgrade needed',
            tone: 'caution',
            detail: readiness.parserPriority
        });
    } else {
        reasons.push({
            label: 'Source mapping needed',
            tone: 'caution',
            detail: readiness.parserPriority
        });
    }

    if (profile.score >= 78) {
        reasons.push({
            label: 'Strong market fit',
            tone: 'positive',
            detail: profile.advantage
        });
    } else if (profile.score >= 68) {
        reasons.push({
            label: 'Relevant market fit',
            tone: 'neutral',
            detail: profile.advantage
        });
    }

    if (productSignal.id === 'solar' && ['EU', 'DE', 'NL', 'SG', 'MY', 'VN'].includes(market)) {
        reasons.push({
            label: 'Energy-transition demand',
            tone: 'positive',
            detail: 'PV route can support green-trade and alternative-market opportunity screening.'
        });
    }
    if (productSignal.id === 'battery' && ['SG', 'MY', 'VN', 'EU', 'DE', 'NL'].includes(market)) {
        reasons.push({
            label: 'Supply-chain diversification',
            tone: 'positive',
            detail: 'Battery / ESS demand and ASEAN/EU channel options make this worth comparing.'
        });
    }
    if (productSignal.id === 'semiconductor' && ['US', 'JP', 'KR', 'SG', 'NL'].includes(market)) {
        reasons.push({
            label: 'High-value electronics ecosystem',
            tone: 'neutral',
            detail: 'Strong buyer ecosystem, but export-control and end-use evidence remain decisive.'
        });
    }
    if (market === to) {
        reasons.push({
            label: 'Selected target market',
            tone: 'neutral',
            detail: 'This route matches the user-selected target market.'
        });
    }
    if (market === 'RU') {
        reasons.push({
            label: 'Sanctions friction',
            tone: 'caution',
            detail: 'Treat as high-friction until sanctions, end-user, payment, and logistics checks are clear.'
        });
    }
    if (market === from) {
        reasons.push({
            label: 'Origin market excluded',
            tone: 'caution',
            detail: 'Opportunity comparison should normally prioritize destination or alternative target markets.'
        });
    }

    return reasons.slice(0, 3);
}

function buildCommercialOpportunity({ market, productSignal, dutySignal, coverage, profile }) {
    const categoryHooks = {
        solar: 'energy-transition procurement and origin-diversification demand',
        battery: 'storage, mobility, and backup-power demand',
        semiconductor: 'advanced hardware procurement and controlled-technology sourcing',
        data_center: 'AI infrastructure, cloud capacity, and enterprise hardware refresh demand',
        industrial_automation: 'factory automation, reshoring, and productivity-upgrade demand',
        healthcare_lab: 'healthcare digitization, lab capacity, and regulated-device distribution demand',
        smartphone: 'consumer-device replacement and channel expansion demand',
        tablet: 'education, enterprise mobility, and portable-computing demand',
        ev_charger: 'clean-transport infrastructure demand',
        drone: 'civil inspection, mapping, and logistics experimentation demand',
        general: 'electronics channel expansion demand'
    };
    const trustHook = coverage.sourceTrust === 'official_exact_rate' || coverage.sourceTrust === 'official_duty_tax_estimate'
        ? 'rate evidence is strong enough for early landed-cost comparison'
        : coverage.sourceTrust === 'official_link_estimate' || coverage.sourceTrust === 'official_heading_only'
            ? 'official source coverage exists, but exact tariff-line parsing is still the gating item'
            : 'tariff coverage must be strengthened before turning this into a quote';
    const rateHook = Number.isFinite(dutySignal?.totalRate)
        ? dutySignal.totalRate === 0
            ? 'low duty friction can protect margin'
            : dutySignal.totalRate <= 0.1
                ? 'moderate landed-cost signal can still support channel testing'
                : 'higher landed-cost friction means pricing power or supply-chain savings must justify the route'
        : 'rate coverage is not ready for pricing';

    return {
        demandDriver: categoryHooks[productSignal.id] || categoryHooks.general,
        valueLever: rateHook,
        executionGate: trustHook,
        thesis: `${profile.advantage} The commercial angle is ${categoryHooks[productSignal.id] || categoryHooks.general}; ${rateHook}.`,
        evidenceEdge: productSignal.supplyChain,
        evidence: [
            {
                label: 'Demand driver',
                detail: categoryHooks[productSignal.id] || categoryHooks.general
            },
            {
                label: 'Value lever',
                detail: rateHook
            },
            {
                label: 'Execution gate',
                detail: trustHook
            }
        ]
    };
}

function conciseConclusion({ cardLabel, tag, dutyBreakdown, coverage }) {
    const duty = dutyBreakdown.totalRate && dutyBreakdown.totalRate !== 'Not covered'
        ? `${dutyBreakdown.totalRate} total duty/tax signal`
        : 'rate coverage still pending';
    return `${cardLabel} is a ${tag.toLowerCase()} route with ${duty} and ${coverage.label.toLowerCase()} coverage.`;
}

function isBenchmarkOnlyCoverage(coverage) {
    return ['precheck_estimate', 'benchmark_source_checked', 'indicative', 'not_covered'].includes(coverage?.sourceTrust || '');
}

function scoreMarket({ market, from, to, focus, productSignal, dutySignal, priorityRoute }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    let score = profile.score;
    score += productMarketFit(productSignal.id, market);
    const totalRate = dutySignal?.totalRate;
    if (Number.isFinite(totalRate)) {
        if (totalRate === 0) score += 10;
        else if (totalRate <= 0.05) score += 5;
        else if (totalRate >= 0.15) score -= 12;
        else if (totalRate >= 0.08) score -= 6;
    } else {
        score -= 4;
    }
    if (priorityRoute?.expected_source_trust) {
        score += Math.round((trustRank(priorityRoute.expected_source_trust) - 50) / 6);
        if (priorityRoute.expected_source_trust === 'official_exact_rate') score += 8;
        if (priorityRoute.expected_source_trust === 'official_duty_tax_estimate') score += 5;
        if (priorityRoute.expected_source_trust === 'precheck_estimate') score -= 8;
    } else if (!dutySignal) {
        score -= 14;
    }
    if (market === to) {
        score += 8;
    }
    if (market === from) {
        score -= 30;
    }
    if (market === 'RU') {
        score -= 24;
    }
    if (productSignal.id === 'solar' && ['EU', 'DE', 'NL', 'SG', 'MY', 'VN'].includes(market)) {
        score += market === 'SG' ? 1 : 4;
    }
    if (productSignal.id === 'battery' && ['SG', 'MY', 'VN', 'EU', 'DE', 'NL'].includes(market)) {
        score += market === 'SG' ? 1 : 4;
    }
    if (productSignal.id === 'semiconductor' && ['US', 'JP', 'KR', 'SG', 'NL'].includes(market)) {
        score += market === 'SG' ? 1 : 3;
    }
    if (focus === 'export' && market === from) {
        score += 8;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function buildMarketCard({ market, from, to, focus, productSignal, dutyRates, priorityMatrix }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    const dutySignal = findDutySignal({ from, to: market, productSignal, dutyRates });
    const priorityRoute = findPriorityRoute({ from, to: market, productSignal, priorityMatrix });
    const coverage = classifyCoverage({ dutySignal, priorityRoute });
    const readiness = coverageReadiness(coverage);
    const dutyBreakdown = summarizeDutyBreakdown(dutySignal);
    const rawScore = scoreMarket({ market, from, to, focus, productSignal, dutySignal, priorityRoute });
    const benchmarkOnly = isBenchmarkOnlyCoverage(coverage);
    const score = benchmarkOnly ? Math.min(rawScore, 55) : rawScore;
    const route = `${countryLabel(from)} -> ${countryLabel(market)}`;
    const rateText = benchmarkOnly
        ? 'Data pending: official tariff source/parser is not strong enough for recommendation'
        : dutySignal
        ? `${rateLabel(dutySignal.totalRate)} estimated import duty signal`
        : 'No maintained exact duty signal yet';
    const tag = benchmarkOnly ? 'Data pending' : score >= 80 ? 'Strong opportunity' : score >= 68 ? 'Worth reviewing' : score >= 50 ? 'Watch carefully' : 'High-friction route';
    const recommendationReasonsList = recommendationReasons({ market, from, to, productSignal, dutySignal, coverage, readiness, profile });
    const commercialOpportunity = buildCommercialOpportunity({ market, productSignal, dutySignal, coverage, profile });
    return {
        market,
        label: countryLabel(market),
        route,
        score,
        rawScore,
        tag,
        recommendationGate: benchmarkOnly ? 'compare_later_data_pending' : 'recommendable',
        rateText,
        dutyBreakdown,
        conciseConclusion: conciseConclusion({ cardLabel: countryLabel(market), tag, dutyBreakdown, coverage }),
        sourceStatus: dutySignal?.sourceStatus || 'not_covered',
        sourceTrust: coverage.sourceTrust,
        automationLevel: coverage.automationLevel,
        coverageLabel: coverage.label,
        coverageTone: coverage.tone,
        parserNextAction: coverage.parserNextAction,
        parserPriority: readiness.parserPriority,
        parserPriorityRank: Number(readiness.parserPriority.match(/P(\d)/)?.[1] ?? 9),
        readinessRank: readiness.rank,
        readinessHeadline: readiness.headline,
        businessAction: readiness.businessAction,
        hsCode: priorityRoute?.hs_code || '',
        recommendationReasons: recommendationReasonsList,
        commercialOpportunity,
        tradeOpportunityThesis: commercialOpportunity.thesis,
        valueLever: commercialOpportunity.valueLever,
        executionGate: commercialOpportunity.executionGate,
        evidenceEdge: commercialOpportunity.evidenceEdge,
        opportunityEvidence: commercialOpportunity.evidence,
        opportunity: profile.opportunity,
        advantage: profile.advantage,
        watchpoint: profile.watchpoint
    };
}

function chooseFeaturedMarket({ cards, selectedMarket, to }) {
    const top = cards[0] || selectedMarket;
    if (!selectedMarket) {
        return top;
    }
    const selectedIsMaintained = selectedMarket.sourceTrust !== 'not_covered';
    const topBeatsSelected = top.market !== to && top.score >= selectedMarket.score + 8;
    const topHasMuchBetterCoverage = top.market !== to
        && top.readinessRank >= selectedMarket.readinessRank + 2
        && top.score >= selectedMarket.score + 4;

    if (selectedIsMaintained && !topBeatsSelected && !topHasMuchBetterCoverage) {
        return selectedMarket;
    }
    return top;
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
        .map((market) => buildMarketCard({ market, from, to, focus, productSignal, dutyRates: input.dutyRates, priorityMatrix: input.priorityMatrix }))
        .sort((a, b) => b.score - a.score || b.readinessRank - a.readinessRank || a.label.localeCompare(b.label));
    const selectedMarket = buildMarketCard({ market: to, from, to, focus, productSignal, dutyRates: input.dutyRates, priorityMatrix: input.priorityMatrix });
    const best = chooseFeaturedMarket({ cards, selectedMarket, to });
    const compared = cards.slice(0, 8);
    const lowerFriction = compared.find((card) => card.market !== to && card.score >= selectedMarket.score + 8);
    const summary = lowerFriction
        ? `${lowerFriction.label} may be a lower-friction market to compare against ${countryLabel(to)} for ${productSignal.label.toLowerCase()}.`
        : `${countryLabel(to)} remains the primary route to review; compare tax, certification, and evidence readiness before committing.`;
    const readyRoutes = compared.filter((card) => card.readinessRank >= 3);
    const parserBacklog = compared.filter((card) => card.coverageTone === 'partial' || card.coverageTone === 'gap');
    const parserTargets = parserBacklog
        .slice()
        .sort((a, b) => a.parserPriorityRank - b.parserPriorityRank || b.score - a.score)
        .slice(0, 4)
        .map((card) => ({
            market: card.market,
            label: card.label,
            route: card.route,
            hsCode: card.hsCode || 'Pending',
            priority: card.parserPriority,
            nextAction: card.parserNextAction
        }));
    const topReady = readyRoutes[0] || best;
    const keyAction = best.businessAction || selectedMarket.businessAction;

    return {
        product,
        productSignal,
        from,
        to,
        focus,
        routeLabel: `${countryLabel(from)} -> ${countryLabel(to)}`,
        best,
        bestIsSelectedMarket: best.market === to,
        selectedMarket,
        markets: compared,
        routeComparison: compared,
        parserTargets,
        readyRouteCount: readyRoutes.length,
        parserBacklogCount: parserBacklog.length,
        summary,
        insights: [
            {
                type: 'Best route',
                label: best.tag,
                text: `${best.label}: ${best.advantage} ${best.rateText}. ${best.coverageLabel}.`
            },
            {
                type: 'Trade opportunity',
                label: best.label,
                text: best.tradeOpportunityThesis
            },
            {
                type: 'Commercial action',
                label: topReady.readinessHeadline,
                text: keyAction
            },
            {
                type: 'Coverage backlog',
                label: `${parserBacklog.length} route(s) need parser/source work`,
                text: parserBacklog[0]
                    ? `${parserBacklog[0].label}: ${parserBacklog[0].parserPriority} · ${parserBacklog[0].parserNextAction}`
                    : 'No parser backlog in the compared routes.'
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
