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

function resolveProductIntelligence() {
    if (typeof globalThis !== 'undefined' && globalThis.TradeComplyProductIntelligence) {
        return globalThis.TradeComplyProductIntelligence;
    }
    if (typeof require === 'function') {
        try {
            return require('./product-intelligence');
        } catch (error) {
            /* browser without require */
        }
    }
    return null;
}

const productIntelligence = resolveProductIntelligence();

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
    CN: {
        opportunity: 'Large electronics and high-tech manufacturing demand, but import licensing, CCC/SRRC, dual-use, and re-export sensitivity can decide execution.',
        advantage: 'Large buyer and manufacturing ecosystem for components, computing hardware, and production equipment.',
        watchpoint: 'Check import licensing, CCC/SRRC, SCOMET-style sensitivity, end-use, customs valuation, and re-export-control exposure.',
        score: 73
    },
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

const TRANSIT_SECOND_LEG_EVIDENCE = {
    'SG->CN': {
        note: 'Singapore -> China has maintained transit-route review evidence: Singapore re-export / strategic-goods screening plus China destination duty/tax baseline must both be checked.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Singapore re-export responsibility, China import tariff line, end-use, origin treatment, and logistics documents before recommending this routing.'
    },
    'MY->CN': {
        note: 'Malaysia -> China has maintained transit-route review evidence: Malaysia export/origin records plus China destination duty/tax baseline must both be checked.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Malaysia export declaration, origin transformation evidence, China import tariff line, and consignee/end-use documents before recommending this routing.'
    },
    'VN->CN': {
        note: 'Vietnam -> China has maintained transit-route review evidence: Vietnam export/origin records plus China destination duty/tax baseline must both be checked.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Vietnam export declaration, origin transformation evidence, China import tariff line, and consignee/end-use documents before recommending this routing.'
    },
    'SG->US': {
        note: 'Singapore -> United States has maintained transit-route review evidence: re-export controls, origin treatment, Section 301 / trade-remedy scope, and US entry documents must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Singapore re-export evidence, US HTS/Chapter 99 scope, origin treatment, and importer records before recommending this routing.'
    },
    'MY->US': {
        note: 'Malaysia -> United States has maintained transit-route review evidence: origin transformation, anti-circumvention, Section 301 / trade-remedy scope, and US entry documents must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Malaysia origin transformation, US HTS/Chapter 99 scope, trade-remedy exposure, and importer records before recommending this routing.'
    },
    'VN->US': {
        note: 'Vietnam -> United States has maintained transit-route review evidence: origin transformation, anti-circumvention, Section 301 / trade-remedy scope, and US entry documents must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Vietnam origin transformation, US HTS/Chapter 99 scope, trade-remedy exposure, and importer records before recommending this routing.'
    },
    'SG->EU': {
        note: 'Singapore -> European Union has maintained transit-route review evidence: Singapore re-export / strategic-goods screening plus EU TARIC, VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Singapore re-export responsibility, origin transformation, EU TARIC line, member-state VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'MY->EU': {
        note: 'Malaysia -> European Union has maintained transit-route review evidence: Malaysia export/origin records plus EU TARIC, VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Malaysia origin transformation, EU TARIC line, member-state VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'VN->EU': {
        note: 'Vietnam -> European Union has maintained transit-route review evidence: Vietnam export/origin records plus EU TARIC, VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Vietnam origin transformation, EU TARIC line, member-state VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'SG->DE': {
        note: 'Singapore -> Germany has maintained transit-route review evidence: Singapore re-export / strategic-goods screening plus EU TARIC, German VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Singapore re-export responsibility, origin transformation, EU TARIC line, German VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'MY->DE': {
        note: 'Malaysia -> Germany has maintained transit-route review evidence: Malaysia export/origin records plus EU TARIC, German VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Malaysia origin transformation, EU TARIC line, German VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'VN->DE': {
        note: 'Vietnam -> Germany has maintained transit-route review evidence: Vietnam export/origin records plus EU TARIC, German VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Vietnam origin transformation, EU TARIC line, German VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'SG->NL': {
        note: 'Singapore -> Netherlands has maintained transit-route review evidence: Singapore re-export / strategic-goods screening plus EU TARIC, Dutch VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Singapore re-export responsibility, origin transformation, EU TARIC line, Dutch VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'MY->NL': {
        note: 'Malaysia -> Netherlands has maintained transit-route review evidence: Malaysia export/origin records plus EU TARIC, Dutch VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Malaysia origin transformation, EU TARIC line, Dutch VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    },
    'VN->NL': {
        note: 'Vietnam -> Netherlands has maintained transit-route review evidence: Vietnam export/origin records plus EU TARIC, Dutch VAT, CE/RoHS, and market-surveillance evidence must be checked together.',
        parserPriority: 'P1 transit-route evidence',
        nextAction: 'Confirm Vietnam origin transformation, EU TARIC line, Dutch VAT, CE/RoHS evidence, and importer records before recommending this routing.'
    }
};

function transitSecondLegEvidence(from, to) {
    return TRANSIT_SECOND_LEG_EVIDENCE[`${normalizeCountry(from)}->${normalizeCountry(to)}`] || null;
}

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
        match: /(battery|batteries|lithium|li[-\s]?ion|energy\s*storage|\bess\b|储能|锂电)/i,
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
        match: /(smartphone|phone|cellular|5g|tablet|laptop|desktop\s*computer|notebook\s*computer|智能手机|平板|电脑)/i,
        label: 'Consumer electronics',
        hsPrefixes: ['8517', '8471'],
        priorityProductIds: ['smartphone', 'router'],
        opportunity: 'Consumer electronics can move through lower-friction hubs when radio, safety, and labeling evidence is ready.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and battery requirements may affect channel onboarding.',
        supplyChain: 'Keep radio module, battery, adapter, and origin evidence aligned with the declared HS code.'
    },
    {
        id: 'surveillance_imaging',
        match: /(ip\s*camera|network\s*camera|surveillance\s*camera|security\s*camera|thermal\s*(?:camera|imaging)|infrared|night\s*vision|nvr|video\s*analytics|dash\s*cam)/i,
        label: 'Surveillance / sensitive imaging',
        hsPrefixes: ['8525', '8517', '9031'],
        priorityProductIds: ['router', 'electronics'],
        opportunity: 'Imaging and surveillance products can move through security and infrastructure channels, but end-use, sensor capability, and encryption evidence matter.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and battery evidence may affect channel access.',
        supplyChain: 'Prepare camera specs, thermal/infrared capability, storage/encryption features, end-use, customer, and origin evidence.'
    },
    {
        id: 'ai_compute',
        match: /(ai\s*server|gpu\s*server|edge\s*ai|ai\s*computer|inference\s*server|accelerator\s*server)/i,
        label: 'AI server / accelerator system',
        hsPrefixes: ['8471', '8542', '8473'],
        priorityProductIds: ['server', 'semiconductor'],
        opportunity: 'AI compute systems have strong demand, but accelerator content, performance, end use, and re-export exposure drive route feasibility.',
        green: 'Energy efficiency, cooling, packaging, WEEE/EPR, and responsible supply-chain evidence can affect enterprise procurement.',
        supplyChain: 'Keep accelerator model, memory, interconnect, software, origin, end-use, and end-user evidence aligned before quoting routes.'
    },
    {
        id: 'memory_ic',
        match: /\b(hbm|hbm2e|hbm3e?|dram|ddr[3-6]?|lpddr[3-6]?|gddr[5-7]?|nand|flash\s*memory|memory\s*(chip|ic|module|stack|controller)|ssd\s*controller|storage\s*controller|controller\s*ic|storage\s*ic)\b/i,
        label: 'Memory / storage IC',
        hsPrefixes: ['854232', '854239', '8542'],
        priorityProductIds: ['memory_ic', 'semiconductor'],
        opportunity: 'Memory IC demand is strong, but bandwidth, density, foundry origin, and end-use evidence can decide route feasibility.',
        green: 'Green compliance is usually secondary to export-control, origin, and supply-chain evidence for memory ICs.',
        supplyChain: 'Prepare memory type, bandwidth, density, stack/module configuration, wafer-fab origin, end-use, and customer evidence.'
    },
    {
        id: 'semiconductor',
        match: /(?!(?:.*\b(?:ai\s*server|gpu\s*server|edge\s*ai|data\s*center|server\s*rack|storage\s*server)\b))(chip|semiconductor|gpu\s*(?:chip|accelerator)?|accelerator\s*(?:chip|card)?|processor|\bic\b|integrated circuit|\b(?:h100|h200|h800|a100|a800|b100|b200|l40s?|mi300x?|gb200|rtx\s*pro)\b|芯片|半导体)/i,
        label: 'Semiconductor / AI hardware',
        hsPrefixes: ['8542', '8473'],
        priorityProductIds: ['semiconductor'],
        opportunity: 'High-value demand exists, but route selection should account for export controls and end-use scrutiny.',
        green: 'Green compliance is usually secondary to export-control and supply-chain evidence for this category.',
        supplyChain: 'Prepare foundry, technology-origin, end-use, end-user, and restricted-party documentation.'
    },
    {
        id: 'network_equipment',
        match: /(router|network\s*(?:switch|gateway|appliance)|ethernet\s*switch|access\s*point|firewall\s*appliance|telecom\s*equipment|base\s*station|路由器|交换机|网关)/i,
        label: 'Router / network equipment',
        hsPrefixes: ['8517'],
        priorityProductIds: ['router'],
        opportunity: 'Network equipment opportunities depend on radio, telecom, cybersecurity, and local type-approval evidence.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and enterprise buyer sustainability evidence may affect channel access.',
        supplyChain: 'Keep radio module, encryption/security features, network function, origin, and telecom approval evidence aligned.'
    },
    {
        id: 'data_center_infrastructure',
        match: /(liquid cooling|cooling unit|server rack|rack power|pdu|ups|power distribution)/i,
        label: 'Data center infrastructure',
        hsPrefixes: ['8419', '8504', '8537'],
        priorityProductIds: ['server', 'electronics'],
        opportunity: 'Data-center infrastructure can support AI and cloud growth, but value depends on safety, energy, installation, and buyer evidence.',
        green: 'Energy efficiency, cooling-fluid, packaging, WEEE/EPR, and installation evidence can affect enterprise procurement.',
        supplyChain: 'Keep power, cooling, rack, safety, origin, installation-use, and customer documentation aligned.'
    },
    {
        id: 'optical_module',
        match: /(optical\s*(module|transceiver)|transceiver\s*module|800g|400g|coherent\s*module|光模块|光通信模块)/i,
        label: 'Optical module / high-speed interconnect',
        hsPrefixes: ['8517', '8541'],
        priorityProductIds: ['router', 'semiconductor'],
        opportunity: 'Optical modules and high-speed interconnect routes can be attractive when telecom approval, encryption/security, and end-use evidence are ready.',
        green: 'RoHS, REACH, WEEE/EPR, packaging, and enterprise buyer sustainability evidence may affect channel access.',
        supplyChain: 'Prepare laser/transceiver specs, data-rate, encryption/security features, origin, telecom approval, and end-use evidence.'
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
        match: /(patient monitor|medical monitor|medical device|diagnostic device|lab analyzer|laboratory analyzer|pcr\s*(?:analyzer|machine|system)?|lab equipment|laboratory equipment|ivd|wearable health|electronic thermometer|cold[-\s]?chain|medical power supply)/i,
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
    if (/\b(ai\s*server|gpu\s*server|edge\s*ai|ai\s*computer|inference\s*server|accelerator\s*server)\b/i.test(text)) {
        return PRODUCT_SIGNALS.find((signal) => signal.id === 'ai_compute');
    }
    if (/\b(gpu|gpgpu|ai\s*accelerator|accelerator\s*(?:chip|card)?|h100|h200|h800|a100|a800|b100|b200|l40s?|mi300x?|gb200|rtx\s*pro)\b/i.test(text)) {
        const semiconductor = PRODUCT_SIGNALS.find((signal) => signal.id === 'semiconductor');
        return {
            ...semiconductor,
            label: 'GPU / AI accelerator'
        };
    }
    const matched = PRODUCT_SIGNALS.find((signal) => signal.match.test(text));
    if (matched?.id === 'memory_ic') {
        const memorySubtype = productIntelligence?.classifyMemorySubtype
            ? productIntelligence.classifyMemorySubtype(text)
            : null;
        const subtypeHs = memorySubtype?.id === 'ssd_controller'
            ? ['854239', '8542']
            : memorySubtype
            ? ['854232', '8542']
            : matched.hsPrefixes;
        const subtypePriority = memorySubtype?.id
            ? [`memory_${memorySubtype.id}`, 'memory_ic', 'semiconductor']
            : matched.priorityProductIds;
        return {
            ...matched,
            label: memorySubtype?.label || matched.label,
            hsPrefixes: subtypeHs,
            priorityProductIds: subtypePriority,
            memorySubtype
        };
    }
    if (matched?.id === 'smartphone' && /(smartphone|phone|cellular|5g|智能手机)/i.test(text)) {
        return {
            ...matched,
            label: 'Smartphone / cellular device'
        };
    }
    if (matched?.id === 'smartphone' && /(laptop|desktop\s*computer|notebook\s*computer|电脑)/i.test(text)) {
        return {
            ...matched,
            label: 'Laptop / computer'
        };
    }
    return matched || {
        id: 'general',
        label: 'General electronics',
        hsPrefixes: ['8517', '8504', '8542'],
        priorityProductIds: ['smartphone', 'router', 'tablet'],
        opportunity: 'Compare markets by import friction, route risk, and documentation readiness.',
        green: 'Check product safety, environmental registration, and packaging/EPR obligations where relevant.',
        supplyChain: 'Keep origin, supplier, and technical evidence consistent with invoices and declarations.'
    };
}

const COMMERCIAL_OPPORTUNITY_RULES = {
    CN: {
        demandStrength: 'High',
        complianceFriction: 'High',
        routeFeasibility: 'Manufacturing-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['manufacturing ecosystem', 'component demand', 'approval and end-use gate'],
        strategicNote: 'China can be attractive for high-tech components and manufacturing inputs when import approvals, end-use, and re-export exposure are handled early.',
        riskNote: 'Import licensing, CCC/SRRC, customs valuation, end-use, and technology-control overlap can slow or block execution.'
    },
    US: {
        demandStrength: 'High',
        complianceFriction: 'High',
        routeFeasibility: 'Demand-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['large buyer market', 'clear tariff source', 'trade-remedy sensitivity'],
        strategicNote: 'Use the United States when buyer demand can absorb tariff, forced-labor, FCC, AD/CVD, or Section 301 review work.',
        riskNote: 'Strong market, but margin and release timing can be damaged if tariff add-ons, UFLPA, or product approvals are missed.'
    },
    EU: {
        demandStrength: 'High',
        complianceFriction: 'Medium-high',
        routeFeasibility: 'Evidence-led',
        greenSupplyChainAdvantage: 'High',
        opportunityTags: ['single-market access', 'green compliance premium', 'CE/RoHS/REACH readiness'],
        strategicNote: 'Use the EU when CE, RoHS, REACH, EPR, battery, and sustainability evidence can become a sales advantage.',
        riskNote: 'Opportunity depends on importer responsibility, technical file quality, and country-level EPR/VAT execution.'
    },
    DE: {
        demandStrength: 'High',
        complianceFriction: 'Medium-high',
        routeFeasibility: 'Quality-led',
        greenSupplyChainAdvantage: 'High',
        opportunityTags: ['industrial demand', 'EU compliance gateway', 'green procurement'],
        strategicNote: 'Germany is attractive for high-quality electronics and industrial equipment when the compliance file is strong.',
        riskNote: 'German market surveillance, WEEE, packaging, and technical-document expectations can slow weak suppliers.'
    },
    NL: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium',
        routeFeasibility: 'Hub-led',
        greenSupplyChainAdvantage: 'High',
        opportunityTags: ['EU logistics hub', 'distribution testing', 'VAT/transit planning'],
        strategicNote: 'The Netherlands is useful as an EU logistics and distribution comparison route, not only as an end market.',
        riskNote: 'Do not treat transit convenience as product approval; EU compliance and importer obligations still decide release quality.'
    },
    IN: {
        demandStrength: 'Very high',
        complianceFriction: 'High',
        routeFeasibility: 'Approval-led',
        greenSupplyChainAdvantage: 'Medium-high',
        opportunityTags: ['high-growth demand', 'manufacturing shift', 'BIS/WPC/QCO gate'],
        strategicNote: 'India can be a strong growth route when tariff line, BIS/QCO/WPC approvals, and distributor readiness are handled early.',
        riskNote: 'High demand does not mean easy entry; approval scope, valuation, and tariff layers must be checked before pricing.'
    },
    SG: {
        demandStrength: 'Medium',
        complianceFriction: 'Low-medium',
        routeFeasibility: 'Hub-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['ASEAN hub', 're-export testing', 'low duty friction'],
        strategicNote: 'Singapore is best used as a regional hub or comparison route when GST, IMDA, strategic-goods, and re-export controls are clear.',
        riskNote: 'Singapore should not automatically be the best route; weak demand fit or missing re-export evidence lowers the case.'
    },
    VN: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium',
        routeFeasibility: 'Manufacturing-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['alternative origin', 'ASEAN manufacturing', 'origin diversification'],
        strategicNote: 'Vietnam is useful for supply-chain diversification when origin, radio/energy approvals, and anti-circumvention risk are controlled.',
        riskNote: 'The commercial value comes from verified manufacturing/origin facts, not from simply routing goods through Vietnam.'
    },
    MY: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium',
        routeFeasibility: 'Manufacturing-led',
        greenSupplyChainAdvantage: 'Medium-high',
        opportunityTags: ['electronics cluster', 'battery/components base', 'ASEAN diversification'],
        strategicNote: 'Malaysia is attractive for electronics, batteries, and components when SIRIM/MCMC/ST evidence and origin records are clean.',
        riskNote: 'Check whether the route creates real manufacturing value or only adds documentation and tax complexity.'
    },
    MX: {
        demandStrength: 'High',
        complianceFriction: 'Medium-high',
        routeFeasibility: 'Nearshoring-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['North America nearshoring', 'USMCA potential', 'NOM/VAT gate'],
        strategicNote: 'Mexico is strongest when local manufacturing or origin support can improve North America access and delivery speed.',
        riskNote: 'USMCA value requires origin proof; NOM, VAT, IMMEX, and valuation issues can erase the route advantage.'
    },
    JP: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium-high',
        routeFeasibility: 'Quality-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['premium buyers', 'PSE/TELEC gate', 'quality channel'],
        strategicNote: 'Japan rewards quality and documentation discipline, especially for electronics, industrial, and healthcare hardware.',
        riskNote: 'Treat PSE, TELEC, labeling, and consumption-tax handling as quote gates, not afterthoughts.'
    },
    KR: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium-high',
        routeFeasibility: 'Ecosystem-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['electronics ecosystem', 'KC gate', 'semiconductor adjacency'],
        strategicNote: 'South Korea is useful for electronics and advanced hardware when KC and strategic-technology checks are ready.',
        riskNote: 'Certification, classification, and strategic-control review can be more important than the base duty rate.'
    },
    RU: {
        demandStrength: 'Selective',
        complianceFriction: 'Very high',
        routeFeasibility: 'Restricted',
        greenSupplyChainAdvantage: 'Low',
        opportunityTags: ['restricted route', 'sanctions-first', 'payment/logistics risk'],
        strategicNote: 'Russia should be treated as a restricted-route exception, not a normal opportunity market.',
        riskNote: 'Sanctions, dual-use, end-user, payment, and logistics clearance must come before any commercial analysis.'
    }
};

const PRODUCT_COMMERCIAL_MODIFIERS = {
    solar: {
        greenSupplyChainAdvantage: 'High',
        opportunityTags: ['energy transition', 'origin traceability', 'trade-remedy exposure']
    },
    battery: {
        greenSupplyChainAdvantage: 'High',
        opportunityTags: ['storage demand', 'battery compliance', 'dangerous-goods evidence']
    },
    semiconductor: {
        complianceFriction: 'Very high',
        routeFeasibility: 'Control-led',
        opportunityTags: ['controlled technology', 'end-use scrutiny', 'high-value demand']
    },
    memory_ic: {
        demandStrength: 'High',
        complianceFriction: 'Very high',
        routeFeasibility: 'Control-led',
        opportunityTags: ['advanced memory', 'bandwidth threshold', 'origin evidence']
    },
    ai_compute: {
        demandStrength: 'High',
        complianceFriction: 'Very high',
        routeFeasibility: 'Control-led',
        opportunityTags: ['AI infrastructure', 'controlled accelerator', 'end-use scrutiny']
    },
    optical_module: {
        demandStrength: 'High',
        complianceFriction: 'High',
        routeFeasibility: 'Telecom-led',
        opportunityTags: ['high-speed connectivity', 'data-center demand', 'telecom approval gate']
    },
    network_equipment: {
        demandStrength: 'Medium-high',
        complianceFriction: 'High',
        routeFeasibility: 'Telecom-led',
        opportunityTags: ['network infrastructure', 'telecom approval gate', 'cybersecurity evidence']
    },
    surveillance_imaging: {
        demandStrength: 'Medium-high',
        complianceFriction: 'High',
        routeFeasibility: 'Security-led',
        opportunityTags: ['security channel', 'sensor capability review', 'end-use evidence']
    },
    data_center: {
        demandStrength: 'High',
        complianceFriction: 'High',
        opportunityTags: ['AI infrastructure', 'enterprise refresh', 'controlled compute']
    },
    data_center_infrastructure: {
        demandStrength: 'Medium-high',
        complianceFriction: 'Medium',
        routeFeasibility: 'Infrastructure-led',
        opportunityTags: ['data-center buildout', 'energy efficiency', 'installation evidence']
    },
    industrial_automation: {
        demandStrength: 'High',
        routeFeasibility: 'Productivity-led',
        opportunityTags: ['factory automation', 'reshoring', 'industrial upgrade']
    },
    healthcare_lab: {
        complianceFriction: 'High',
        routeFeasibility: 'Regulated-use-led',
        opportunityTags: ['regulated device', 'distributor readiness', 'post-market evidence']
    }
};

function commercialRuleForMarket(market, productSignal = {}) {
    const normalized = normalizeCountry(market);
    const marketRule = COMMERCIAL_OPPORTUNITY_RULES[normalized] || {
        demandStrength: 'Selective',
        complianceFriction: 'Medium',
        routeFeasibility: 'Evidence-led',
        greenSupplyChainAdvantage: 'Medium',
        opportunityTags: ['selective market', 'route evidence', 'tariff comparison'],
        strategicNote: 'Use this route only when duty, product approval, and channel evidence support the commercial case.',
        riskNote: 'Treat missing tariff or compliance coverage as a reason to compare other routes before quoting.'
    };
    const modifier = PRODUCT_COMMERCIAL_MODIFIERS[productSignal.id] || {};
    return {
        ...marketRule,
        ...modifier,
        opportunityTags: Array.from(new Set([
            ...(marketRule.opportunityTags || []),
            ...(modifier.opportunityTags || [])
        ])).slice(0, 5)
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

function normalizeHs(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function findExactDutyOverride(rule, hsCode = '') {
    const normalizedHs = normalizeHs(hsCode);
    const overrides = Array.isArray(rule?.exact_code_overrides) ? rule.exact_code_overrides : [];
    if (!normalizedHs || !overrides.length) {
        return null;
    }
    return overrides
        .filter((override) => {
            const overrideHs = normalizeHs(override.hs_code);
            return overrideHs && (normalizedHs.startsWith(overrideHs) || overrideHs.startsWith(normalizedHs));
        })
        .sort((a, b) => normalizeHs(b.hs_code).length - normalizeHs(a.hs_code).length)[0] || null;
}

function findDutySignal({ from, to, productSignal, dutyRates, hsCode = '', strictOrigin = false }) {
    const rules = normalizeDutyRules(dutyRates);
    const exact = rules.find((rule) => (
        normalizeCountry(rule.import_country) === to
        && normalizeCountry(rule.origin_country) === from
        && hsMatches(rule, productSignal.hsPrefixes)
    ));
    const wildcard = rules.find((rule) => (
        normalizeCountry(rule.import_country) === to
        && String(rule.origin_country || '').trim() === '*'
        && hsMatches(rule, productSignal.hsPrefixes)
    ));
    const fallbackDestination = !strictOrigin && rules.find((rule) => (
        normalizeCountry(rule.import_country) === to
        && hsMatches(rule, productSignal.hsPrefixes)
    ));
    const destination = exact || wildcard || fallbackDestination;
    if (!destination) {
        return null;
    }
    const matchScope = exact ? 'origin_specific' : wildcard ? 'destination_baseline' : 'destination_fallback';
    const exactOverride = findExactDutyOverride(destination, hsCode);
    const base = Number((exactOverride?.base_rate ?? destination.base_rate) || 0);
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
        sourceStatus: exactOverride?.source_status || destination.source_status || 'indicative',
        baseRate: base,
        additionalRate: additional,
        totalRate: base + additional,
        layers,
        taxLayers,
        tradeRemedyLayers,
        confidence: exactOverride?.confidence || destination.confidence || '',
        note: exactOverride?.source_note || destination.source_note || destination.label || '',
        sourceUrl: exactOverride?.source_url || destination.source_url || '',
        sourceHts: exactOverride?.source_hts || destination.source_hts || '',
        sourceRateText: exactOverride?.source_rate_text || destination.source_rate_text || '',
        matchScope,
        originSpecific: matchScope === 'origin_specific',
        routeSpecific: matchScope === 'origin_specific'
    };
}

function findPriorityRoute({ from, to, productSignal, priorityMatrix }) {
    const routes = normalizePriorityRoutes(priorityMatrix);
    const productIds = Array.isArray(productSignal.priorityProductIds) ? productSignal.priorityProductIds : [];
    const byPriority = (a, b) => {
        const ai = productIds.indexOf(a.product_id);
        const bi = productIds.indexOf(b.product_id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    };
    const exact = routes.filter((route) => (
        normalizeCountry(route.origin_country) === from
        && normalizeCountry(route.import_country) === to
        && productIds.includes(route.product_id)
    )).sort(byPriority)[0];
    if (exact) {
        return exact;
    }
    const wildcard = routes.filter((route) => (
        String(route.origin_country || '').trim() === '*'
        && normalizeCountry(route.import_country) === to
        && productIds.includes(route.product_id)
    )).sort(byPriority)[0];
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
        official_exact: 100,
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
    if (sourceTrust === 'official_exact') {
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
    if (dutySignal?.sourceStatus === 'official_source_checked') {
        return {
            label: 'Official duty source',
            tone: 'hybrid',
            sourceTrust: 'official_duty_tax_estimate',
            automationLevel: 'hybrid_official',
            parserNextAction: 'Keep entry-date, origin, tax, and add-on duty scope refreshed before quoting.'
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
        official_exact: {
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

function costPerThousandLabel(rate, { signed = false } = {}) {
    if (!Number.isFinite(rate)) {
        return 'not covered';
    }
    const amount = rate * 1000;
    const prefix = signed
        ? amount >= 0 ? '+' : '-'
        : '';
    return `${prefix}$${Math.abs(amount).toFixed(2)} / $1k`;
}

function sentenceFragment(value = '') {
    return String(value || '').trim().replace(/[.!?]+$/g, '').toLowerCase();
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
            CN: 7,
            US: 8,
            JP: 7,
            KR: 7,
            NL: 6,
            EU: 5,
            IN: 4,
            SG: 3
        },
        memory_ic: {
            CN: 7,
            US: 7,
            JP: 6,
            KR: 7,
            SG: 5,
            MY: 5,
            VN: 4,
            EU: 4,
            NL: 4,
            IN: 4
        },
        ai_compute: {
            CN: 7,
            US: 8,
            JP: 7,
            KR: 7,
            EU: 6,
            DE: 6,
            NL: 6,
            IN: 5,
            SG: 3
        },
        optical_module: {
            CN: 7,
            US: 7,
            IN: 6,
            SG: 6,
            MY: 5,
            VN: 5,
            EU: 5,
            DE: 5,
            JP: 5,
            KR: 5,
            NL: 4
        },
        network_equipment: {
            US: 7,
            EU: 6,
            IN: 6,
            JP: 5,
            KR: 5,
            MX: 5,
            SG: 4,
            CN: 4
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
        data_center_infrastructure: {
            US: 6,
            EU: 6,
            DE: 6,
            NL: 5,
            JP: 5,
            KR: 5,
            IN: 5,
            SG: 3,
            MX: 3
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
    const categoryHooks = {
        solar: 'energy-transition procurement and origin-diversification demand',
        battery: 'storage, mobility, and backup-power demand',
        semiconductor: 'advanced hardware procurement and controlled-technology sourcing',
        memory_ic: 'advanced memory, AI hardware, and storage-supply procurement demand',
        ai_compute: 'AI infrastructure and accelerator-system procurement demand',
        optical_module: 'data-center, telecom, and high-speed interconnect demand',
        network_equipment: 'telecom, enterprise networking, and cybersecurity procurement demand',
        surveillance_imaging: 'security, infrastructure, and sensitive-imaging procurement demand',
        data_center: 'AI infrastructure, cloud capacity, and enterprise hardware refresh demand',
        data_center_infrastructure: 'data-center buildout, power, cooling, and infrastructure refresh demand',
        industrial_automation: 'factory automation, reshoring, and productivity-upgrade demand',
        healthcare_lab: 'healthcare digitization, lab capacity, and regulated-device distribution demand',
        smartphone: 'consumer-device replacement and channel expansion demand',
        tablet: 'education, enterprise mobility, and portable-computing demand',
        ev_charger: 'clean-transport infrastructure demand',
        drone: 'civil inspection, mapping, and logistics experimentation demand',
        general: 'electronics channel expansion demand'
    };
    reasons.push({
        label: profile.score >= 78 ? 'Strong market demand' : 'Market demand signal',
        tone: profile.score >= 78 ? 'positive' : 'neutral',
        detail: `${profile.advantage} Demand driver: ${categoryHooks[productSignal.id] || categoryHooks.general}.`
    });

    if (Number.isFinite(dutySignal?.totalRate)) {
        if (dutySignal.totalRate === 0) {
            reasons.push({
                label: 'Cost lever',
                tone: 'positive',
                detail: '0.0% maintained duty signal can protect margin or support sharper channel pricing.'
            });
        } else if (dutySignal.totalRate <= 0.05) {
            reasons.push({
                label: 'Cost lever',
                tone: 'positive',
                detail: `${rateLabel(dutySignal.totalRate)} maintained duty/tax signal leaves room for pilot pricing.`
            });
        } else if (dutySignal.totalRate >= 0.15) {
            reasons.push({
                label: 'Cost pressure',
                tone: 'caution',
                detail: `${rateLabel(dutySignal.totalRate)} maintained duty/tax signal means demand or supply-chain savings must justify the route.`
            });
        } else {
            reasons.push({
                label: 'Cost lever',
                tone: 'neutral',
                detail: `${rateLabel(dutySignal.totalRate)} maintained duty/tax signal is usable for early pricing comparison.`
            });
        }
    } else {
        reasons.push({
            label: 'Cost data gap',
            tone: 'caution',
            detail: 'No maintained duty signal is available for this route/product yet.'
        });
    }

    if (readiness.rank >= 4) {
        reasons.push({
            label: 'Execution confidence',
            tone: 'positive',
            detail: `${coverage.label}; use this route for pricing comparison while keeping tax/add-on layers refreshed.`
        });
    } else if (readiness.rank >= 2) {
        reasons.push({
            label: 'Execution gate',
            tone: 'caution',
            detail: `${readiness.parserPriority}: confirm exact tariff line before quoting landed cost.`
        });
    } else {
        reasons.push({
            label: 'Execution gate',
            tone: 'caution',
            detail: `${readiness.parserPriority}: add official source coverage before recommending this route.`
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
    if ((productSignal.id === 'semiconductor' || productSignal.id === 'ai_compute') && ['US', 'JP', 'KR', 'SG', 'NL'].includes(market)) {
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
    const commercialRule = commercialRuleForMarket(market, productSignal);
    const categoryHooks = {
        solar: 'energy-transition procurement and origin-diversification demand',
        battery: 'storage, mobility, and backup-power demand',
        semiconductor: 'advanced hardware procurement and controlled-technology sourcing',
        memory_ic: 'advanced memory, AI hardware, and storage-supply procurement demand',
        optical_module: 'data-center, telecom, and high-speed interconnect demand',
        network_equipment: 'telecom, enterprise networking, and cybersecurity procurement demand',
        data_center: 'AI infrastructure, cloud capacity, and enterprise hardware refresh demand',
        industrial_automation: 'factory automation, reshoring, and productivity-upgrade demand',
        healthcare_lab: 'healthcare digitization, lab capacity, and regulated-device distribution demand',
        smartphone: 'consumer-device replacement and channel expansion demand',
        tablet: 'education, enterprise mobility, and portable-computing demand',
        ev_charger: 'clean-transport infrastructure demand',
        drone: 'civil inspection, mapping, and logistics experimentation demand',
        general: 'electronics channel expansion demand'
    };
    const trustHook = coverage.sourceTrust === 'official_exact' || coverage.sourceTrust === 'official_duty_tax_estimate'
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
    const readyForPricing = coverage.sourceTrust === 'official_exact'
        || coverage.sourceTrust === 'official_duty_tax_estimate'
        || coverage.sourceTrust === 'mixed_official_estimate';
    const rateValue = Number.isFinite(dutySignal?.totalRate) ? dutySignal.totalRate : null;
    const quickDecision = !readyForPricing
        ? `Research only: ${countryLabel(market)} needs stronger tariff coverage before quoting.`
        : commercialRule.complianceFriction === 'Very high'
            ? `Control-led opportunity: ${countryLabel(market)} has demand, but license, end-use, or controlled-technology checks come first.`
        : rateValue === 0
            ? `Prioritize pilot pricing: ${countryLabel(market)} combines low duty friction with ${categoryHooks[productSignal.id] || categoryHooks.general}.`
            : rateValue <= 0.1
                ? `Worth quoting: ${countryLabel(market)} has a manageable ${rateLabel(rateValue)} duty/tax signal and clear demand hook.`
                : `Selective opportunity: ${countryLabel(market)} demand exists, but ${rateLabel(rateValue)} landed-cost friction needs pricing power.`;
    const marginSignal = rateValue === null
        ? 'No pricing-grade duty signal yet.'
        : rateValue === 0
            ? 'Best used to protect gross margin or sharpen entry pricing.'
            : rateValue <= 0.1
                ? 'Can support early landed-cost comparison if tax/add-on layers stay refreshed.'
                : 'Needs higher selling price, supply-chain savings, or compliance premium to work.';
    const salesAngle = `${commercialRule.demandStrength} demand; ${categoryHooks[productSignal.id] || categoryHooks.general}; sales angle: ${sentenceFragment(profile.advantage)}.`;
    const quoteGate = readyForPricing
        ? coverage.sourceTrust === 'mixed_official_estimate'
            ? 'Quote only after add-on duty / trade-remedy scope is confirmed.'
            : 'Quote with tariff evidence attached; refresh entry-date tax/add-on layers before filing.'
        : 'Do not quote final landed cost until official tariff coverage is upgraded.';
    const quoteReadiness = !readyForPricing
        ? 'Research only'
        : coverage.sourceTrust === 'mixed_official_estimate'
            ? 'Compare first'
            : rateValue !== null && rateValue <= 0.1
                ? 'Quote-ready'
                : 'Selective quote';
    const landedCostRisk = rateValue === null
        ? 'Unknown'
        : rateValue === 0
            ? 'Low'
            : rateValue <= 0.1
                ? 'Medium'
                : 'High';
    const marketRole = commercialRule.routeFeasibility === 'Hub-led'
        ? 'Regional distribution hub'
        : commercialRule.routeFeasibility === 'Manufacturing-led' || commercialRule.routeFeasibility === 'Nearshoring-led'
            ? 'Manufacturing / alternative supply-chain market'
            : commercialRule.routeFeasibility === 'Telecom-led'
                ? 'Telecom and data-center channel market'
            : commercialRule.routeFeasibility === 'Restricted'
                ? 'Restricted / high-friction market'
                : commercialRule.demandStrength === 'Very high'
                    ? 'Growth market with approval-driven execution'
                    : commercialRule.demandStrength === 'High'
                        ? 'High-value demand market'
                        : 'Selective demand market';
    const opportunityType = !readyForPricing
        ? 'Research lead'
        : commercialRule.routeFeasibility === 'Hub-led'
            ? 'Route-comparison hub'
            : commercialRule.routeFeasibility === 'Manufacturing-led' || commercialRule.routeFeasibility === 'Nearshoring-led'
                ? 'Supply-chain option'
                : commercialRule.complianceFriction === 'Very high' || commercialRule.complianceFriction === 'High'
                    ? 'Controlled quote candidate'
                : rateValue !== null && rateValue <= 0.1
                    ? 'Quote candidate'
                    : 'Selective pricing candidate';
    const routeStrategy = !readyForPricing
        ? `Use ${countryLabel(market)} for research only until exact tariff coverage improves.`
        : commercialRule.routeFeasibility === 'Restricted'
            ? 'Do not treat as a normal opportunity; screen sanctions, end-use, payment, and logistics first.'
            : commercialRule.routeFeasibility === 'Hub-led'
                ? `Use ${countryLabel(market)} as a comparison hub for landed-cost and channel testing.`
            : commercialRule.routeFeasibility === 'Manufacturing-led' || commercialRule.routeFeasibility === 'Nearshoring-led'
                ? `Use ${countryLabel(market)} to test supply-chain diversification and origin economics.`
            : commercialRule.routeFeasibility === 'Telecom-led'
                ? `Use ${countryLabel(market)} to test telecom/data-center channel demand once approval and end-use evidence are clear.`
                : `Use ${countryLabel(market)} as a demand-market quote candidate when evidence is ready.`;

    return {
        demandStrength: commercialRule.demandStrength,
        complianceFriction: commercialRule.complianceFriction,
        routeFeasibility: commercialRule.routeFeasibility,
        greenSupplyChainAdvantage: commercialRule.greenSupplyChainAdvantage,
        opportunityTags: commercialRule.opportunityTags,
        strategicNote: commercialRule.strategicNote,
        riskNote: commercialRule.riskNote,
        demandDriver: categoryHooks[productSignal.id] || categoryHooks.general,
        valueLever: rateHook,
        executionGate: trustHook,
        marketRole,
        opportunityType,
        routeStrategy,
        quickDecision,
        marginSignal,
        salesAngle,
        quoteGate,
        quoteReadiness,
        landedCostRisk,
        thesis: `${commercialRule.strategicNote} ${rateHook}.`,
        evidenceEdge: productSignal.supplyChain,
        evidence: [
            {
                label: 'Demand driver',
                detail: `${commercialRule.demandStrength} demand: ${categoryHooks[productSignal.id] || categoryHooks.general}`
            },
            {
                label: 'Compliance friction',
                detail: `${commercialRule.complianceFriction}: ${commercialRule.riskNote}`
            },
            {
                label: 'Route advantage',
                detail: `${commercialRule.routeFeasibility}: ${commercialRule.opportunityTags.join(', ')}`
            }
        ]
    };
}

function buildOpportunitySignal({ cardLabel, market, tag, dutySignal, coverage, productSignal, profile, readiness }) {
    const demand = productMarketFit(productSignal.id, market) >= 5
        ? 'strong category-market fit'
        : profile.score >= 72
            ? 'credible channel fit'
            : 'selective demand fit';
    const value = Number.isFinite(dutySignal?.totalRate)
        ? dutySignal.totalRate === 0
            ? 'low duty friction'
            : dutySignal.totalRate <= 0.1
                ? 'manageable landed-cost signal'
                : 'higher landed-cost friction'
        : 'tariff data not ready';
    const confidence = readiness.rank >= 4
        ? 'rate evidence is strong'
        : readiness.rank >= 2
            ? 'official source coverage exists, exact parser pending'
            : 'source coverage is not recommendation-ready';
    const action = coverage.sourceTrust === 'not_covered' || coverage.sourceTrust === 'precheck_estimate'
        ? 'Compare later after official tariff coverage improves.'
        : readiness.rank >= 4
            ? 'Use this as a pricing-comparison candidate.'
            : 'Use for market screening; confirm exact tariff line before quoting.';
    const shortAction = coverage.sourceTrust === 'not_covered' || coverage.sourceTrust === 'precheck_estimate'
        ? 'Wait for coverage upgrade before quoting.'
        : readiness.rank >= 4
            ? 'Prioritize for quote comparison.'
            : 'Screen now, quote after exact tariff confirmation.';

    return {
        headline: `${cardLabel}: ${tag} route`,
        oneLine: `${cardLabel} shows ${demand}, ${value}, and ${confidence}.`,
        action,
        shortAction
    };
}

function exportControlAgency(origin) {
    const agencies = {
        US: 'US BIS / EAR',
        CN: 'China MOFCOM / dual-use export control',
        EU: 'EU Dual-Use Regulation',
        DE: 'BAFA / EU dual-use export control',
        NL: 'Dutch strategic goods / EU dual-use export control',
        SG: 'Singapore Strategic Goods Control',
        JP: 'Japan METI export control',
        KR: 'Korea strategic goods control',
        TW: 'Taiwan BOFT strategic high-tech control',
        IN: 'India DGFT SCOMET',
        RU: 'Sanctions / restricted-route export control'
    };
    return agencies[normalizeCountry(origin)] || `${countryLabel(origin)} export-control review`;
}

function exportControlProfile(productSignal) {
    if (productSignal?.id === 'memory_ic') {
        const memorySubtype = productSignal.memorySubtype;
        const profiles = {
            hbm: {
                label: 'HBM / high-bandwidth memory export-control gate',
                summary: 'HBM and HBM3E-class memory must be treated as advanced-computing supply-chain content first: bandwidth, destination, end use, end user, and re-export exposure decide whether the route is commercially usable.',
                checks: [
                    'Confirm HBM generation, bandwidth, stack count, capacity, package, and whether it is supplied for AI accelerator, server, data-center, or supercomputing use.',
                    'Screen ultimate consignee, parent entity, end user, end use, and re-export route before comparing duty or transit savings.',
                    'Do not use a transit market as a workaround unless origin transformation, re-export authorization, and end-use evidence are legally supportable.'
                ]
            },
            dram: {
                label: 'DRAM / memory-module export-control gate',
                summary: 'DRAM, LPDDR, GDDR, and memory modules require density, bandwidth, end-use, and origin evidence before route optimization, especially when linked to AI servers or advanced computing.',
                checks: [
                    'Identify DRAM type, density, bandwidth, module form factor, controller pairing, and target equipment.',
                    'Confirm wafer-fab origin, module assembly, end user, and whether the memory supports AI, data-center, defense, or surveillance systems.',
                    'Keep re-export and restricted-party evidence with the quote file before relying on tariff advantages.'
                ]
            },
            nand: {
                label: 'NAND / flash-memory export-control gate',
                summary: 'NAND and flash-memory ICs are usually lower than HBM risk, but storage density, controller pairing, encryption, origin, and data-center end use still require review.',
                checks: [
                    'Confirm NAND type, capacity, layer count where known, controller pairing, and whether the product is a component or finished SSD/storage device.',
                    'Check end-use/end-user, data-center or restricted-party exposure, and whether encryption or secure storage functions are present.',
                    'Separate component export controls from finished storage customs treatment before route comparison.'
                ]
            },
            ssd_controller: {
                label: 'SSD controller / storage-controller export-control gate',
                summary: 'SSD and storage controller ICs need firmware, encryption, controller origin, and end-use review before tariff or market-route recommendations.',
                checks: [
                    'Identify controller model, firmware, encryption/security functions, interface, and whether the IC is paired with NAND or sold as a module.',
                    'Screen storage, AI server, data-center, military, surveillance, and restricted-party end-use exposure.',
                    'Confirm re-export authorization and origin evidence before treating a transit route as commercially viable.'
                ]
            }
        };
        return profiles[memorySubtype?.id] || {
            label: 'memory IC export-control gate',
            summary: 'HBM, advanced DRAM, NAND flash, and storage ICs may require bandwidth, density, origin, end-use, and re-export review before route optimization.',
            checks: [
                'Confirm memory type, bandwidth, density, stack/module configuration, and whether HBM or advanced DRAM thresholds apply.',
                'Verify wafer-fab origin, packaging/test location, end user, end use, and customer sector before treating the route as ordinary electronics.',
                'Do not use a transit market to bypass memory-related export controls unless origin transformation and re-export authorization are defensible.'
            ]
        };
    }
    const profiles = {
        semiconductor: {
            label: 'advanced-computing / semiconductor export-control gate',
            summary: 'AI GPUs, advanced ICs, HBM, chip design, and semiconductor equipment may trigger export-control classification, license, end-use, or restricted-party review.',
            checks: [
                'Confirm ECCN / performance threshold classification, including 3A090 / 4A090 / semiconductor-equipment controls where applicable.',
                'Screen ultimate consignee, parent entity, end user, and end use against Entity List, military end-use, and advanced-computing restrictions.',
                'Do not treat transit through another market as a clean workaround unless origin transformation, re-export authorization, and end-use evidence are defensible.'
            ]
        },
        memory_ic: {
            label: 'memory IC export-control gate',
            summary: 'HBM, advanced DRAM, NAND flash, and storage ICs may require bandwidth, density, origin, end-use, and re-export review before route optimization.',
            checks: [
                'Confirm memory type, bandwidth, density, stack/module configuration, and whether HBM or advanced DRAM thresholds apply.',
                'Verify wafer-fab origin, packaging/test location, end user, end use, and customer sector before treating the route as ordinary electronics.',
                'Do not use a transit market to bypass memory-related export controls unless origin transformation and re-export authorization are defensible.'
            ]
        },
        ai_compute: {
            label: 'AI server / accelerator-system export-control gate',
            summary: 'AI servers, GPU servers, edge AI computers, and accelerator systems may include controlled GPUs, 4A090-class advanced-computing systems, encryption, software, or restricted end-use exposure.',
            checks: [
                'Identify embedded GPU/accelerator models, compute performance, memory bandwidth, interconnects, encryption, software, and data-center end-use.',
                'Screen end user, cloud/data-center operator, parent entity, and restricted-country exposure before quoting.',
                'Confirm whether the shipment includes 4A090 hardware, controlled software, technology, service support, or re-export content.'
            ]
        },
        data_center: {
            label: 'data-center network/storage export-control gate',
            summary: 'Network appliances, firewalls, storage servers, and enterprise data-center systems may require encryption, cybersecurity, or end-use screening even when the base equipment is not an AI accelerator.',
            checks: [
                'Identify encryption/security functions, network access controls, storage encryption, firmware, and remote-management software.',
                'Screen data-center operator, restricted-party exposure, government/military end-use, and re-export conditions.',
                'Keep hardware, software, and technology classification separate from ordinary customs tariff review.'
            ]
        },
        optical_module: {
            label: 'high-speed optics / telecom export-control gate',
            summary: 'High-speed optical modules, coherent optics, silicon photonics, and telecom interconnects can require telecom, laser, encryption, and end-use review.',
            checks: [
                'Confirm data rate, coherent/laser capability, encryption/security functions, and telecom end-use.',
                'Screen destination, end user, military/telecom infrastructure use, and restricted-party exposure.',
                'Keep source classification, laser safety, and re-export evidence attached to the quote file.'
            ]
        },
        network_equipment: {
            label: 'network / encryption export-control gate',
            summary: 'Routers, gateways, telecom equipment, base stations, and network security appliances may require encryption, telecom, cybersecurity, or end-use screening.',
            checks: [
                'Confirm encryption/VPN/security functions, radio/telecom capability, and software/firmware export classification.',
                'Screen destination, operator, government/military end-use, and restricted-party exposure.',
                'Separate normal type approval from export-control classification before treating this as a simple market-access item.'
            ]
        },
        surveillance_imaging: {
            label: 'surveillance / sensitive-imaging export-control gate',
            summary: 'IP cameras, thermal imaging, night vision, surveillance analytics, and drone payload cameras can trigger sensor, surveillance, encryption, and end-use controls.',
            checks: [
                'Confirm thermal/infrared/night-vision capability, resolution, frame rate, analytics, storage, and encryption features.',
                'Screen police, military, border-security, critical-infrastructure, and sanctioned end-use or end-user exposure.',
                'Keep customer-use statements and technical datasheets before recommending a route.'
            ]
        },
        drone: {
            label: 'UAV / drone export-control gate',
            summary: 'Drones, flight controllers, payload cameras, and UAV systems may trigger dual-use controls based on range, payload, autonomy, sensors, and end use.',
            checks: [
                'Confirm range, endurance, payload, autonomous flight, communication link, camera/sensor, and control software capability.',
                'Screen military, police, surveillance, border-security, and restricted-country use before quoting.',
                'Check origin-country UAV export catalog, dual-use license, and battery/dangerous-goods documentation together.'
            ]
        },
        industrial_automation: {
            label: 'industrial automation / controlled-technology gate',
            summary: 'Robotics, CNC controllers, PLCs, machine vision, factory gateways, and servo systems can require dual-use or controlled-technology review in sensitive routes.',
            checks: [
                'Confirm precision, payload, controlled software, machine-vision capability, remote access, and end-use industry.',
                'Screen semiconductor, defense, aerospace, nuclear, and restricted-party end-use before treating it as ordinary machinery.',
                'Keep controller/software classification and end-user declaration with the route file.'
            ]
        }
    };
    return profiles[productSignal.id] || null;
}

function buildExportControlGate({ from, to, market, productSignal }) {
    const profile = exportControlProfile(productSignal);
    if (!profile) {
        return null;
    }
    const origin = normalizeCountry(from);
    const destination = normalizeCountry(to);
    const candidateMarket = normalizeCountry(market);
    const agency = exportControlAgency(origin);
    const chinaDestination = destination === 'CN' || candidateMarket === 'CN';
    const restrictedDestination = destination === 'RU' || candidateMarket === 'RU';
    const memorySubtypeId = productSignal.memorySubtype?.id || '';
    const criticalMemory = productSignal.id === 'memory_ic' && ['hbm', 'ssd_controller'].includes(memorySubtypeId);
    const highMemory = productSignal.id === 'memory_ic' && ['dram', 'nand'].includes(memorySubtypeId);
    const verySensitive = productSignal.id === 'semiconductor' || productSignal.id === 'ai_compute' || criticalMemory;
    const severity = restrictedDestination || (origin === 'US' && chinaDestination && (verySensitive || highMemory))
        ? 'Critical'
        : 'Review Required';
    if (origin !== 'US' || !chinaDestination) {
        return {
            label: `${agency} ${profile.label}`,
            severity,
            summary: profile.summary,
            checks: profile.checks
        };
    }
    return {
        label: `${agency} ${profile.label}`,
        severity,
        summary: profile.summary,
        checks: profile.checks
    };
}

function conciseConclusion({ cardLabel, tag, dutyBreakdown, coverage }) {
    const duty = dutyBreakdown.totalRate && dutyBreakdown.totalRate !== 'Not covered'
        ? `${dutyBreakdown.totalRate} total duty/tax signal`
        : 'rate coverage still pending';
    return `${cardLabel} is a ${tag.toLowerCase()} route with ${duty} and ${coverage.label.toLowerCase()} coverage.`;
}

function rateSourceDate(dutyRates = {}) {
    return dutyRates.updated_at || String(dutyRates.last_usitc_sync_at || '').slice(0, 10) || 'not dated';
}

function buildTrustSummary({
    coverage,
    dutyBreakdown,
    dutyRates,
    exportControlGate,
    quoteReadiness,
    routeLabel,
    transitComparison
}) {
    const sourceDate = rateSourceDate(dutyRates);
    const controlText = exportControlGate?.severity === 'Critical'
        ? `${exportControlGate.label} must clear before commercial use`
        : 'No default control gate from maintained product signal';
    const tariffText = coverage?.label || 'Coverage pending';
    const directCost = dutyBreakdown?.totalRate || 'not covered';
    const twoLegText = transitComparison
        ? `${transitComparison.combinedRate || 'not covered'} combined; ${transitComparison.firstLegRate || 'not covered'} first leg + ${transitComparison.secondLegRate || 'not covered'} second leg`
        : `${directCost} direct route signal`;
    return {
        summaryLine: `${tariffText}; rates refreshed ${sourceDate}; ${controlText}.`,
        tariffSource: tariffText,
        rateLastUpdated: sourceDate,
        routeCost: twoLegText,
        controlStatus: controlText,
        quoteStatus: quoteReadiness || 'Quote status pending',
        routeLabel
    };
}

function complianceBlockerText(exportControlGate) {
    if (exportControlGate?.severity !== 'Critical') {
        return '';
    }
    return 'Not a commercial opportunity until export-control, end-use, restricted-party, and re-export clearance is resolved.';
}

function directRouteVerdict({ exportControlGate, benchmarkOnly, dutySignal, commercialOpportunity }) {
    if (exportControlGate?.severity === 'Critical') {
        return {
            label: 'Control first',
            tone: 'critical',
            action: 'Do not treat this as a commercial opportunity until export-control, end-use, restricted-party, and re-export clearance is resolved.'
        };
    }
    if (benchmarkOnly || !dutySignal) {
        return {
            label: 'Data pending',
            tone: 'caution',
            action: 'Do not quote final landed cost until official tariff coverage is upgraded.'
        };
    }
    if (commercialOpportunity?.landedCostRisk === 'High') {
        return {
            label: 'Selective route',
            tone: 'caution',
            action: 'Use only if demand or margin can absorb the maintained duty/tax signal.'
        };
    }
    return {
        label: 'Prefer direct route',
        tone: 'favorable',
        action: 'Use as the primary comparison route while keeping entry-date tax and evidence refreshed.'
    };
}

function transitRouteVerdict({ transitCostStatus, delta, controlGate, viaLabel }) {
    if (controlGate?.severity === 'Critical') {
        return {
            label: 'Control first',
            tone: 'critical',
            action: `${viaLabel} cannot be used as a workaround; export-control, end-use, restricted-party, and re-export clearance must come first.`
        };
    }
    if (transitCostStatus === 'second_leg_not_covered') {
        return {
            label: 'Do not recommend yet',
            tone: 'blocked',
            action: 'Second-leg duty/tax coverage is missing.'
        };
    }
    if (transitCostStatus === 'second_leg_baseline') {
        return {
            label: 'Benchmark only',
            tone: 'caution',
            action: 'Use only as a cost benchmark until route-specific second-leg evidence is maintained.'
        };
    }
    if (Number.isFinite(delta) && delta <= -0.02) {
        return {
            label: 'Compare transit',
            tone: 'favorable',
            action: 'Potential cost advantage, but logistics, origin transformation, and re-export evidence must support the route.'
        };
    }
    if (Number.isFinite(delta) && delta >= 0.02) {
        return {
            label: 'Do not use for cost reduction',
            tone: 'unfavorable',
            action: 'Combined maintained duty/tax is higher than direct routing.'
        };
    }
    return {
        label: 'Operational only',
        tone: 'neutral',
        action: 'Use only if lead time, inventory, buyer access, or evidence readiness improves.'
    };
}

function buildBusinessDecisionSummary({ selectedMarket, transitRoutes, best, productSignal }) {
    const rows = [];
    const directVerdict = selectedMarket?.opportunityVerdict || {};
    const directCost = selectedMarket?.dutyBreakdown?.totalRate || 'not covered';
    rows.push({
        type: 'Direct route',
        route: selectedMarket?.routeScopeLabel || selectedMarket?.route || '',
        label: directVerdict.label || 'Review direct route',
        tone: directVerdict.tone || 'neutral',
        cost: directCost,
        action: directVerdict.action || selectedMarket?.businessAction || 'Compare tariff and compliance evidence before quoting.',
        gate: selectedMarket?.exportControlGate?.severity === 'Critical'
            ? `${selectedMarket.exportControlGate.label} must clear first.`
            : `${selectedMarket?.coverageLabel || 'Coverage pending'}; ${selectedMarket?.parserNextAction || 'keep tariff and route evidence refreshed.'}`,
        evidence: selectedMarket?.trustSummary?.summaryLine || ''
    });

    (transitRoutes || []).slice(0, 2).forEach((route) => {
        const transit = route.transitComparison || {};
        const verdict = route.opportunityVerdict || {};
        rows.push({
            type: 'Transit option',
            route: transit.route || route.routeScopeLabel || route.route || '',
            label: verdict.label || transit.decision?.label || 'Transit review',
            tone: verdict.tone || transit.decision?.tone || 'neutral',
            cost: transit.combinedRate || 'not covered',
            action: verdict.action || transit.decision?.reason || route.businessAction || 'Use only with route evidence.',
            gate: route.exportControlGate?.severity === 'Critical'
                ? `${route.exportControlGate.label} still applies; transit is not a workaround.`
                : transit.secondLegScopeNote || route.routeDecisionSummary || '',
            evidence: route.trustSummary?.summaryLine || ''
        });
    });

    const primary = rows.find((row) => row.type === 'Direct route') || rows[0];
    const controlFirst = rows.some((row) => row.label === 'Control first');
    return {
        headline: controlFirst
            ? `Control check comes before route optimization for ${productSignal.label.toLowerCase()}.`
            : best?.opportunityVerdict?.label === 'Prefer direct route'
            ? `Direct route is the cleanest starting point for ${productSignal.label.toLowerCase()}.`
            : `Use the direct route as the anchor and compare only evidence-backed transit options.`,
        primaryAction: controlFirst
            ? 'Do not use any route as a commercial recommendation until export-control, end-use, restricted-party, and re-export evidence is cleared.'
            : primary?.action || 'Compare duty/tax and evidence before quoting.',
        rows
    };
}

function buildRouteRecommendation({ selectedMarket, transitRoutes, best, productSignal, to }) {
    const selectedLabel = selectedMarket?.label || countryLabel(to);
    const bestTransit = (transitRoutes || [])[0];
    const favorableTransit = (transitRoutes || []).find((route) => route.transitCostStatus === 'cost_advantage');
    const controlGate = selectedMarket?.exportControlGate;
    const productLabel = productSignal?.label?.toLowerCase() || 'this product';

    if (controlGate?.severity === 'Critical') {
        return {
            decision: 'control_first',
            headline: 'Do not optimize route yet. Clear export-control and end-use evidence first.',
            recommendedRoute: selectedMarket?.routeScopeLabel || selectedMarket?.route || '',
            nextMove: 'Treat direct and transit routes as blocked for commercial recommendation until license, end-use, restricted-party, and re-export checks are resolved.',
            reason: `${controlGate.label} is the binding gate for ${productLabel}; a lower duty route is not a workaround.`
        };
    }

    if (favorableTransit && !favorableTransit.exportControlGate) {
        return {
            decision: 'compare_transit',
            headline: `Compare ${favorableTransit.label} transit only if legal origin transformation is supportable.`,
            recommendedRoute: favorableTransit.routeScopeLabel,
            nextMove: 'Validate logistics cost, title transfer, origin transformation, re-export evidence, and second-leg entry cost before quoting.',
            reason: favorableTransit.transitComparison?.costConclusion || favorableTransit.routeDecisionSummary || ''
        };
    }

    if (bestTransit && bestTransit.transitCostStatus === 'second_leg_not_covered') {
        return {
            decision: 'direct_anchor_data_gap',
            headline: `Use ${selectedLabel} direct route as the anchor; transit cost is not covered enough yet.`,
            recommendedRoute: selectedMarket?.routeScopeLabel || selectedMarket?.route || '',
            nextMove: 'Do not present transit as a savings route until both duty legs and re-export evidence are maintained.',
            reason: bestTransit.transitReason || 'Second-leg duty/tax coverage is missing.'
        };
    }

    if (bestTransit && bestTransit.transitCostStatus === 'cost_disadvantage') {
        return {
            decision: 'direct_anchor',
            headline: `Use ${selectedLabel} direct route as the cost anchor; transit is not cheaper on maintained data.`,
            recommendedRoute: selectedMarket?.routeScopeLabel || selectedMarket?.route || '',
            nextMove: 'Only consider transit for supply availability, lead time, customer access, or documented origin transformation, not simple duty savings.',
            reason: bestTransit.transitReason || 'Combined maintained duty/tax is higher than direct routing.'
        };
    }

    if (best?.market === selectedMarket?.market) {
        return {
            decision: 'direct_preferred',
            headline: `Start with ${selectedLabel} direct route.`,
            recommendedRoute: selectedMarket?.routeScopeLabel || selectedMarket?.route || '',
            nextMove: selectedMarket?.businessAction || 'Attach tariff, compliance, and ESG evidence before quoting.',
            reason: selectedMarket?.routeDecisionSummary || `${selectedLabel} remains the maintained route with the strongest evidence for ${productLabel}.`
        };
    }

    return {
        decision: 'compare_market',
        headline: `Compare ${best?.label || selectedLabel} against the selected route before quoting.`,
        recommendedRoute: best?.routeScopeLabel || best?.route || selectedMarket?.routeScopeLabel || '',
        nextMove: best?.businessAction || 'Compare duty/tax, route evidence, and compliance friction before committing.',
        reason: best?.routeDecisionSummary || selectedMarket?.routeDecisionSummary || ''
    };
}

function buildRateCoverageSummary({ selectedMarket, transitRoutes }) {
    const transitCovered = (transitRoutes || []).filter((row) => row.transitComparison?.secondLegRouteSpecific).length;
    const transitCosted = (transitRoutes || []).filter((row) => Number.isFinite(row.transitComparison?.secondDutyBreakdown?.totalRateNumber) || row.transitComparison?.combinedRate !== 'not covered').length;
    return {
        directCoverage: selectedMarket?.coverageLabel || 'Pending',
        directRate: selectedMarket?.dutyBreakdown?.totalRate || 'not covered',
        transitOptions: (transitRoutes || []).length,
        transitCosted,
        transitEvidenceBacked: transitCovered,
        summary: `${transitCosted}/${(transitRoutes || []).length} transit options have combined duty/tax signals; ${transitCovered}/${(transitRoutes || []).length} have maintained second-leg evidence.`
    };
}

function isBenchmarkOnlyCoverage(coverage) {
    return ['precheck_estimate', 'benchmark_source_checked', 'indicative', 'not_covered'].includes(coverage?.sourceTrust || '');
}

function tagText(tag = {}) {
    return [
        tag.tag_id,
        tag.country,
        tag.category,
        tag.category_label,
        tag.short_name,
        tag.short_description,
        tag.description,
        tag.content_en,
        ...(Array.isArray(tag.related_keywords) ? tag.related_keywords : []),
        ...(Array.isArray(tag.related_hs_codes) ? tag.related_hs_codes : [])
    ].filter(Boolean).join(' ').toLowerCase();
}

function greenProductTerms(productSignal = {}) {
    const map = {
        solar: ['solar', 'photovoltaic', 'pv', 'inverter'],
        battery: ['battery', 'lithium', 'ess', 'storage'],
        ev_charger: ['ev charger', 'charger', 'charging'],
        semiconductor: ['gpu', 'ai accelerator', 'semiconductor', 'chip', 'processor'],
        memory_ic: ['hbm', 'dram', 'nand', 'memory chip', 'memory module', 'ssd controller', 'storage ic'],
        ai_compute: ['gpu', 'ai server', 'accelerator', 'data center'],
        data_center: ['data center', 'server', 'storage', 'network'],
        optical_module: ['optical', 'transceiver', 'telecom', 'network'],
        network_equipment: ['router', 'switch', 'telecom', 'network'],
        smartphone: ['smartphone', 'cellular', 'mobile', 'battery'],
        tablet: ['tablet', 'computer', 'battery'],
        industrial_automation: ['robot', 'automation', 'electrical equipment'],
        general: ['electronics', 'electronic', 'electrical equipment']
    };
    return [
        productSignal.id,
        productSignal.label,
        productSignal.green,
        ...(map[productSignal.id] || map.general)
    ].filter(Boolean).map((term) => String(term).toLowerCase());
}

function buildGreenComplianceSignal({ market, productSignal, ruleTags = [] }) {
    const country = normalizeCountry(market);
    const greenTags = (Array.isArray(ruleTags) ? ruleTags : []).filter((tag) => (
        normalizeCountry(tag.country || 'GLOBAL') === country
        && String(tag.route_focus || '').toLowerCase() !== 'export'
        && (
            tag.category === 'ENVIRONMENT_BATTERY'
            || /green compliance|esg|e-waste|electronic waste|recycling|producer responsibility|battery|weee|cbam|carbon/i.test([
                tag.category_label,
                tag.short_name,
                tag.short_description,
                tag.description,
                tag.content_en
            ].filter(Boolean).join(' '))
        )
    ));
    const terms = greenProductTerms(productSignal);
    const matched = greenTags.filter((tag) => {
        const text = tagText(tag);
        return terms.some((term) => term && text.includes(term));
    });
    const usable = matched.length ? matched : greenTags.filter((tag) => /electronics|electronic|electrical equipment|battery|eee|esg/i.test(tagText(tag)));

    if (usable.length) {
        const primary = usable[0];
        return {
            status: 'covered',
            readiness: 'ESG covered',
            scoreBoost: 3,
            ruleCount: usable.length,
            ruleIds: usable.slice(0, 3).map((tag) => tag.tag_id).filter(Boolean),
            summary: `${countryLabel(country)} has ${usable.length} Green Compliance & ESG rule(s) for this product route.`,
            source: primary.source_citation || primary.short_name || 'Green Compliance & ESG rule'
        };
    }

    if (['solar', 'battery', 'ev_charger', 'smartphone', 'tablet', 'data_center', 'ai_compute', 'semiconductor', 'memory_ic', 'network_equipment', 'optical_module'].includes(productSignal.id)) {
        return {
            status: 'gap',
            readiness: 'ESG gap',
            scoreBoost: -2,
            ruleCount: 0,
            ruleIds: [],
            summary: `${countryLabel(country)} Green Compliance & ESG coverage is not maintained for this product route yet.`,
            source: ''
        };
    }

    return {
        status: 'neutral',
        readiness: 'ESG not material',
        scoreBoost: 0,
        ruleCount: 0,
        ruleIds: [],
        summary: 'No product-specific ESG signal is required by the maintained product profile.',
        source: ''
    };
}

function scoreMarket({ market, from, to, focus, productSignal, dutySignal, priorityRoute, greenCompliance }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    let score = profile.score;
    score += productMarketFit(productSignal.id, market);
    score += Number(greenCompliance?.scoreBoost || 0);
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
        if (priorityRoute.expected_source_trust === 'official_exact') score += 8;
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
    if ((productSignal.id === 'semiconductor' || productSignal.id === 'ai_compute') && ['US', 'JP', 'KR', 'SG', 'NL'].includes(market)) {
        score += market === 'SG' ? 1 : 3;
    }
    if (focus === 'export' && market === from) {
        score += 8;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function buildMarketCard({ market, from, to, focus, productSignal, dutyRates, priorityMatrix, ruleTags }) {
    const profile = MARKET_PROFILES[market] || MARKET_PROFILES.US;
    const marketLabel = countryLabel(market);
    const fromLabel = countryLabel(from);
    const toLabel = countryLabel(to);
    const priorityRoute = findPriorityRoute({ from, to: market, productSignal, priorityMatrix });
    const dutySignal = findDutySignal({ from, to: market, productSignal, dutyRates, hsCode: priorityRoute?.hs_code || '' });
    const coverage = classifyCoverage({ dutySignal, priorityRoute });
    const readiness = coverageReadiness(coverage);
    const dutyBreakdown = summarizeDutyBreakdown(dutySignal);
    const greenCompliance = buildGreenComplianceSignal({ market, productSignal, ruleTags });
    const rawScore = scoreMarket({ market, from, to, focus, productSignal, dutySignal, priorityRoute, greenCompliance });
    const benchmarkOnly = isBenchmarkOnlyCoverage(coverage);
    const score = benchmarkOnly ? Math.min(rawScore, 55) : rawScore;
    const route = `${fromLabel} -> ${marketLabel}`;
    const isSelectedMarket = market === to;
    const routeScopeLabel = isSelectedMarket ? route : `Alternative market: ${route}`;
    const transitWarning = isSelectedMarket
        ? ''
        : `${marketLabel} is an alternative market comparison, not a transit route to ${toLabel}; this excludes ${marketLabel} -> ${toLabel} duty, tax, logistics, and origin-change analysis.`;
    const rateText = benchmarkOnly
        ? 'Data pending: official tariff source/parser is not strong enough for recommendation'
        : dutySignal
        ? `${rateLabel(dutySignal.totalRate)} estimated import duty signal`
        : 'No maintained exact duty signal yet';
    const tag = benchmarkOnly ? 'Data pending' : score >= 80 ? 'Strong opportunity' : score >= 68 ? 'Worth reviewing' : score >= 50 ? 'Watch carefully' : 'High-friction route';
    const recommendationReasonsList = recommendationReasons({ market, from, to, productSignal, dutySignal, coverage, readiness, profile });
    const commercialOpportunity = buildCommercialOpportunity({ market, productSignal, dutySignal, coverage, profile });
    const opportunitySignal = buildOpportunitySignal({ cardLabel: marketLabel, market, tag, dutySignal, coverage, productSignal, profile, readiness });
    const exportControlGate = buildExportControlGate({ from, to, market, productSignal });
    const rejectionReasons = [];
    if (benchmarkOnly) {
        rejectionReasons.push('Official/hybrid tariff source is not strong enough for quoting yet.');
    }
    if (!dutySignal) {
        rejectionReasons.push('No maintained duty/tax signal exists for this route and HS basis yet.');
    }
    if (exportControlGate?.severity === 'Critical') {
        rejectionReasons.push(`${exportControlGate.label} is critical and must be cleared before commercial routing.`);
    } else if (exportControlGate) {
        rejectionReasons.push(`${exportControlGate.label} must be reviewed before quoting.`);
    }
    if (commercialOpportunity.landedCostRisk === 'High') {
        rejectionReasons.push('Landed-cost risk is high; attach tariff and add-on evidence before pricing.');
    }
    if (!rejectionReasons.length) {
        rejectionReasons.push('No blocking issue from maintained data; keep source refresh and route evidence with the quote.');
    }
    const routeDecisionSummary = exportControlGate?.severity === 'Critical'
        ? `Control-first route: ${exportControlGate.label} must be cleared before quote comparison.`
        : benchmarkOnly || !dutySignal
        ? 'Data-first route: do not recommend commercially until maintained tariff coverage improves.'
        : exportControlGate
        ? `${tag}: ${commercialOpportunity.quickDecision} ${exportControlGate.label} must be reviewed before quote.`
        : `${tag}: ${commercialOpportunity.quickDecision}`;
    const opportunityVerdict = directRouteVerdict({
        exportControlGate,
        benchmarkOnly,
        dutySignal,
        commercialOpportunity
    });
    const sourceEvidence = [
        {
            label: 'Data source',
            detail: `${coverage.label}; ${readiness.parserPriority}. ${coverage.parserNextAction}`
        },
        {
            label: 'Tariff basis',
            detail: `${priorityRoute?.hs_code || 'HS pending'}; ${dutyBreakdown.sourceBasis}`
        },
        {
            label: 'Route cost',
            detail: `${route}: ${dutyBreakdown.totalRate} maintained duty/tax signal.`
        },
        {
            label: 'Control gate',
            detail: exportControlGate
                ? `${exportControlGate.severity}: ${exportControlGate.label}`
                : 'No default export-control gate triggered by the maintained product signal.'
        },
        {
            label: 'Green / ESG',
            detail: greenCompliance.ruleCount
                ? `${greenCompliance.readiness}: ${greenCompliance.summary} ${greenCompliance.ruleIds.join(', ')}`
                : greenCompliance.summary
        }
    ];
    const trustSummary = buildTrustSummary({
        coverage,
        dutyBreakdown,
        dutyRates,
        exportControlGate,
        quoteReadiness: commercialOpportunity.quoteReadiness,
        routeLabel: route
    });
    return {
        market,
        label: marketLabel,
        route,
        routeKind: isSelectedMarket ? 'direct' : 'market_comparison',
        isSelectedMarket,
        routeScopeLabel,
        transitWarning,
        score,
        rawScore,
        tag,
        routeDecisionSummary,
        opportunityVerdict,
        rejectionReasons,
        recommendationGate: benchmarkOnly ? 'compare_later_data_pending' : 'recommendable',
        rateText,
        dutyBreakdown,
        totalRateNumber: Number.isFinite(dutySignal?.totalRate) ? dutySignal.totalRate : null,
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
        opportunitySignal,
        commercialDecision: exportControlGate?.severity === 'Critical'
            ? `${opportunityVerdict.label}: ${opportunityVerdict.action}`
            : commercialOpportunity.quickDecision,
        complianceBlocker: complianceBlockerText(exportControlGate),
        exportControlGate,
        marginSignal: commercialOpportunity.marginSignal,
        salesAngle: commercialOpportunity.salesAngle,
        quoteGate: commercialOpportunity.quoteGate,
        quoteReadiness: commercialOpportunity.quoteReadiness,
        landedCostRisk: commercialOpportunity.landedCostRisk,
        marketRole: commercialOpportunity.marketRole,
        opportunityType: commercialOpportunity.opportunityType,
        routeStrategy: commercialOpportunity.routeStrategy,
        demandStrength: commercialOpportunity.demandStrength,
        complianceFriction: commercialOpportunity.complianceFriction,
        routeFeasibility: commercialOpportunity.routeFeasibility,
        greenSupplyChainAdvantage: commercialOpportunity.greenSupplyChainAdvantage,
        greenCompliance,
        esgReadiness: greenCompliance.readiness,
        esgRuleCount: greenCompliance.ruleCount,
        opportunityTags: commercialOpportunity.opportunityTags,
        strategicNote: commercialOpportunity.strategicNote,
        riskNote: commercialOpportunity.riskNote,
        tradeOpportunityThesis: commercialOpportunity.thesis,
        valueLever: commercialOpportunity.valueLever,
        executionGate: commercialOpportunity.executionGate,
        evidenceEdge: commercialOpportunity.evidenceEdge,
        opportunityEvidence: commercialOpportunity.evidence,
        trustSummary,
        sourceEvidence,
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

function coveragePhrase(card) {
    if (!card) {
        return 'coverage is not available yet';
    }
    const coverage = card.coverageLabel || 'coverage pending';
    const quote = card.quoteReadiness || 'Research only';
    return `${coverage.toLowerCase()} and ${quote.toLowerCase()} status`;
}

function buildRouteChoiceNarrative({ best, selectedMarket, productSignal, to }) {
    const selectedLabel = selectedMarket?.label || countryLabel(to);
    const productLabel = productSignal?.label?.toLowerCase() || 'this product';
    if (!best || !selectedMarket) {
        return {
            whyThisRoute: `Use the selected market as the starting point for ${productLabel}; compare maintained tariff and compliance evidence before quoting.`,
            whyNotSelectedRoute: 'No stronger comparison market is available from the maintained route matrix yet.'
        };
    }

    const bestReasons = [
        coveragePhrase(best),
        `${String(best.demandStrength || 'market demand').toLowerCase()} demand`,
        `${String(best.complianceFriction || 'medium').toLowerCase()} compliance friction`
    ];

    if (best.market === selectedMarket.market) {
        return {
            whyThisRoute: `${best.label} stays first because it matches the selected market with ${bestReasons.join(', ')} for ${productLabel}.`,
            whyNotSelectedRoute: `No alternate market beats ${selectedLabel} enough to replace it; keep checking duty, tax, and compliance evidence before quoting.`
        };
    }

    const selectedReasons = [
        coveragePhrase(selectedMarket),
        `${String(selectedMarket.landedCostRisk || 'unknown').toLowerCase()} landed-cost risk`,
        `${String(selectedMarket.complianceFriction || 'medium').toLowerCase()} compliance friction`
    ];
    return {
        whyThisRoute: `${best.label} outranks ${selectedLabel} because it has ${bestReasons.join(', ')} for ${productLabel}.`,
        whyNotSelectedRoute: `${selectedLabel} is still shown, but it has ${selectedReasons.join(', ')}; compare against ${best.label} before pricing or committing supply.`
    };
}

function buildTransitComparison({ card, from, to, productSignal, dutyRates, priorityMatrix, directMarket }) {
    if (!card || card.market === to) {
        return card;
    }
    const via = card.market;
    const viaLabel = countryLabel(via);
    const fromLabel = countryLabel(from);
    const toLabel = countryLabel(to);
    const secondPriorityRoute = findPriorityRoute({ from: via, to, productSignal, priorityMatrix });
    const secondDutySignal = findDutySignal({ from: via, to, productSignal, dutyRates, hsCode: secondPriorityRoute?.hs_code || card.hsCode || '', strictOrigin: true });
    const secondCoverage = classifyCoverage({ dutySignal: secondDutySignal, priorityRoute: secondPriorityRoute });
    const transitEvidence = transitSecondLegEvidence(via, to);
    const secondReadiness = transitEvidence
        ? {
            ...coverageReadiness(secondCoverage),
            parserPriority: transitEvidence.parserPriority,
            businessAction: transitEvidence.nextAction
        }
        : coverageReadiness(secondCoverage);
    const secondLegRouteSpecific = Boolean(secondPriorityRoute) || secondDutySignal?.routeSpecific === true || Boolean(transitEvidence);
    const secondLegCoverageLabel = secondLegRouteSpecific
        ? transitEvidence ? `${secondCoverage.label} · transit evidence` : secondCoverage.label
        : `${secondCoverage.label} · baseline route check`;
    const secondBreakdown = summarizeDutyBreakdown(secondDutySignal);
    const firstRate = Number.isFinite(card.totalRateNumber) ? card.totalRateNumber : null;
    const secondRate = Number.isFinite(secondDutySignal?.totalRate) ? secondDutySignal.totalRate : null;
    const directRate = Number.isFinite(directMarket?.totalRateNumber) ? directMarket.totalRateNumber : null;
    const combinedRate = Number.isFinite(firstRate) && Number.isFinite(secondRate)
        ? firstRate + secondRate
        : null;
    const delta = Number.isFinite(combinedRate) && Number.isFinite(directRate)
        ? combinedRate - directRate
        : null;
    const originSavingsCaveat = 'Potential savings only if origin transformation is legally supported.';
    const costConclusion = !Number.isFinite(combinedRate)
        ? 'Combined cost is not covered yet.'
        : Number.isFinite(delta) && delta <= -0.02
        ? `Potential duty-cost advantage versus direct route: ${rateLabel(Math.abs(delta))} lower duty/tax signal. ${originSavingsCaveat}`
        : Number.isFinite(delta) && delta >= 0.02
        ? `No duty-cost advantage versus direct route: ${rateLabel(delta)} higher duty/tax signal.`
        : 'Similar duty/tax signal versus direct route; only use if logistics, supply, or compliance risk improves.';
    const originNote = `Transit only helps if ${viaLabel} adds real commercial value or valid origin transformation; otherwise ${viaLabel} -> ${toLabel} may still be treated under original-origin or re-export controls.`;
    const secondLegScopeNote = secondLegRouteSpecific
        ? transitEvidence?.note || `${viaLabel} -> ${toLabel} has maintained route-specific or priority-matrix coverage.`
        : `${viaLabel} -> ${toLabel} uses a destination baseline, not a route-specific origin rule; treat it as a comparison signal until exact route evidence is added.`;
    const controlGate = card.exportControlGate;
    const transitLegalGate = {
        origin_transformation_required: true,
        anti_circumvention_review_required: true,
        re_export_review_required: true,
        title_transfer_review_required: true,
        document_evidence_required: [
            'origin transformation support',
            'commercial value-add evidence',
            'title-transfer records',
            're-export / end-use clearance',
            'import entry and duty evidence for both legs'
        ],
        decision_basis: transitEvidence
            ? 'Maintained transit-route evidence exists, but legal origin and anti-circumvention support must still be checked.'
            : 'No maintained transit-route evidence yet; do not treat this as a recommended commercial route.'
    };
    const transitCostStatus = !Number.isFinite(combinedRate)
        ? 'second_leg_not_covered'
        : !secondLegRouteSpecific
        ? 'second_leg_baseline'
        : Number.isFinite(delta) && delta <= -0.02
        ? 'cost_advantage'
        : Number.isFinite(delta) && delta >= 0.02
        ? 'cost_disadvantage'
        : 'cost_similar';
    const transitReason = !Number.isFinite(combinedRate)
        ? `${viaLabel} is not usable as a recommended transit route until ${viaLabel} -> ${toLabel} duty/tax and re-export evidence are covered.`
        : !secondLegRouteSpecific
        ? `${viaLabel} is only a baseline comparison route right now: ${secondLegScopeNote}`
        : transitCostStatus === 'cost_advantage'
        ? `${viaLabel} only earns a transit recommendation if the lower combined duty/tax survives logistics, title-transfer, origin, and re-export checks.`
        : transitCostStatus === 'cost_disadvantage'
        ? `${viaLabel} is not cheaper than direct routing on maintained duty/tax data; use it only for supply availability or customer-access reasons.`
        : `${viaLabel} is cost-similar to direct routing; use it only if operations, lead time, or evidence readiness improves.`;
    const transitAuthenticityDecision = !Number.isFinite(combinedRate)
        ? 'Do not compare as an opportunity until both duty legs are covered.'
        : !secondLegRouteSpecific
            ? 'Baseline-only: not enough route-specific evidence for a transit recommendation.'
        : controlGate
            ? 'Control-gated: clear export-control, end-use, and re-export evidence before treating this as an opportunity.'
        : Number.isFinite(delta) && delta <= -0.02
            ? 'Conditional opportunity: cost signal is favorable only if origin transformation is legally supported.'
        : 'No cost-led transit opportunity; use only for supply availability, lead time, or customer-access reasons.';
    const transitDecision = !Number.isFinite(combinedRate)
        ? {
            tone: 'blocked',
            label: 'Do not recommend yet',
            headline: `Do not recommend ${viaLabel} transit until second-leg cost is covered.`,
            reason: `${viaLabel} can only be compared after the ${viaLabel} -> ${toLabel} duty/tax signal and re-export evidence are maintained.`
        }
        : !secondLegRouteSpecific
            ? {
                tone: 'caution',
                label: 'Baseline check only',
                headline: `${viaLabel} transit needs route-specific second-leg evidence before recommendation.`,
                reason: `${secondLegScopeNote} Use it only as a benchmark, not as a lower-cost route recommendation.`
            }
        : Number.isFinite(delta) && delta <= -0.02 && !controlGate
            ? {
                tone: 'favorable',
                label: 'Worth comparing',
                headline: `${viaLabel} transit may reduce maintained duty/tax by ${rateLabel(Math.abs(delta))}.`,
                reason: `Use only if logistics cost, title transfer, origin treatment, and ${viaLabel} -> ${toLabel} evidence support the routing.`
            }
        : Number.isFinite(delta) && delta <= -0.02
            ? {
                tone: 'caution',
                label: 'Cost possible, control first',
                headline: `${viaLabel} shows a ${rateLabel(Math.abs(delta))} duty/tax advantage, but export-control review comes first.`,
                reason: `${controlGate.label} still applies; do not treat transit as a workaround without license/re-export and end-use support.`
            }
        : Number.isFinite(delta) && delta >= 0.02
            ? {
                tone: 'unfavorable',
                label: 'Not cheaper',
                headline: `Do not use ${viaLabel} for cost reduction: combined duty/tax is ${rateLabel(delta)} higher than direct.`,
                reason: `Only consider this route for supply availability, service, customer access, or documented origin transformation, not simple tariff savings.`
            }
        : {
            tone: 'neutral',
            label: 'Only if operations improve',
            headline: `${viaLabel} is cost-similar to direct routing.`,
            reason: `Use it only if lead time, buyer access, local inventory, or compliance evidence is stronger than the direct route.`
        };
    const rejectionReasons = [];
    if (!Number.isFinite(combinedRate)) {
        rejectionReasons.push(`${viaLabel} -> ${toLabel} second-leg duty/tax is not covered yet.`);
    }
    if (Number.isFinite(delta) && delta >= 0.02) {
        rejectionReasons.push(`Combined duty/tax is ${rateLabel(delta)} higher than direct routing.`);
    }
    if (controlGate?.severity === 'Critical') {
        rejectionReasons.push(`${controlGate.label} is critical; transit cannot be used as a workaround.`);
    } else if (controlGate) {
        rejectionReasons.push(`${controlGate.label} must be cleared before quoting this route.`);
    }
    if (secondCoverage.sourceTrust === 'not_covered') {
        rejectionReasons.push(`No maintained source coverage for the ${viaLabel} -> ${toLabel} leg.`);
    }
    if (Number.isFinite(combinedRate) && !secondLegRouteSpecific) {
        rejectionReasons.push(`${viaLabel} -> ${toLabel} is based on destination baseline coverage, not route-specific origin evidence.`);
    }
    if (!rejectionReasons.length && Number.isFinite(delta) && delta <= -0.02) {
        rejectionReasons.push('No rejection from maintained cost data, but origin transformation and logistics evidence must support the route.');
    }
    if (!rejectionReasons.length) {
        rejectionReasons.push('Only use this route if operations or buyer access improve versus the direct route.');
    }
    const routeDecisionSummary = `${transitDecision.label}: ${transitDecision.reason}`;
    const opportunityVerdict = transitRouteVerdict({
        transitCostStatus,
        delta,
        controlGate,
        viaLabel
    });
    const transitScore = Math.max(0, Math.min(100, Math.round(
        card.score
        + (Number.isFinite(delta) && delta < 0 ? 8 : 0)
        - (Number.isFinite(delta) && delta > 0 ? 12 : 0)
        - (!Number.isFinite(combinedRate) ? 18 : 0)
        - (!secondLegRouteSpecific ? 14 : 0)
        - (secondCoverage.sourceTrust === 'not_covered' ? 15 : 0)
        - (controlGate?.severity === 'Critical' ? 8 : 0)
    )));
    const combinedLabel = Number.isFinite(combinedRate) ? rateLabel(combinedRate) : 'not covered';
    const firstLabel = Number.isFinite(firstRate) ? rateLabel(firstRate) : 'not covered';
    const secondLabel = Number.isFinite(secondRate) ? rateLabel(secondRate) : 'not covered';
    const directLabel = Number.isFinite(directRate) ? rateLabel(directRate) : 'not covered';
    const firstCostLabel = costPerThousandLabel(firstRate);
    const secondCostLabel = costPerThousandLabel(secondRate);
    const combinedCostLabel = costPerThousandLabel(combinedRate);
    const directCostLabel = costPerThousandLabel(directRate);
    const deltaCostLabel = costPerThousandLabel(delta, { signed: true });
    const deltaRateLabel = Number.isFinite(delta) ? `${delta >= 0 ? '+' : '-'}${rateLabel(Math.abs(delta))}` : 'not covered';
    const firstBreakdown = card.dutyBreakdown || summarizeDutyBreakdown(null);
    const firstSourceBasis = firstBreakdown.sourceBasis || card.coverageLabel || 'First-leg maintained signal.';
    const secondSourceBasis = secondBreakdown.sourceBasis || secondLegCoverageLabel || 'Second-leg maintained signal.';
    const firstSourceUrl = firstBreakdown.officialSourceUrl || '';
    const secondSourceUrl = secondBreakdown.officialSourceUrl || '';
    const sourceUrlText = [
        firstSourceUrl ? `first source ${firstSourceUrl}` : '',
        secondSourceUrl ? `second source ${secondSourceUrl}` : ''
    ].filter(Boolean).join('; ');
    const transitCostEvidence = [
        `Direct ${fromLabel} -> ${toLabel}: ${directLabel} (${directCostLabel})`,
        `First leg ${fromLabel} -> ${viaLabel}: ${firstLabel} (${firstCostLabel}) · ${firstSourceBasis}`,
        `Second leg ${viaLabel} -> ${toLabel}: ${secondLabel} (${secondCostLabel}) · ${secondSourceBasis}`
    ].join(' | ');
    const transitTrustSummary = buildTrustSummary({
        coverage: {
            label: `${card.coverageLabel}; second leg ${secondLegCoverageLabel}`
        },
        dutyBreakdown: card.dutyBreakdown,
        dutyRates,
        exportControlGate: controlGate,
        quoteReadiness: card.quoteReadiness,
        routeLabel: `${fromLabel} -> ${viaLabel} -> ${toLabel}`,
        transitComparison: {
            combinedRate: combinedLabel,
            firstLegRate: firstLabel,
            secondLegRate: secondLabel
        }
    });

    return {
        ...card,
        score: transitScore,
        marketScore: card.score,
        tag: transitDecision.label,
        routeDecisionSummary,
        opportunityVerdict,
        rejectionReasons,
        complianceBlocker: complianceBlockerText(controlGate),
        commercialDecision: `${opportunityVerdict.label}: ${transitDecision.headline}`,
        businessAction: opportunityVerdict.action,
        trustSummary: transitTrustSummary,
        sourceEvidence: [
            {
                label: 'Transit decision',
                detail: transitDecision.headline
            },
            {
                label: 'Combined cost',
                detail: `${fromLabel} -> ${viaLabel}: ${firstLabel} (${firstCostLabel}); ${viaLabel} -> ${toLabel}: ${secondLabel} (${secondCostLabel}); transit total ${combinedLabel} (${combinedCostLabel}); direct route ${directLabel} (${directCostLabel}); delta ${deltaRateLabel} (${deltaCostLabel}) per $1k vs direct.`
            },
            {
                label: 'Source coverage',
                detail: `First leg: ${card.coverageLabel} · ${firstSourceBasis}; second leg: ${secondLegCoverageLabel} · ${secondSourceBasis}. ${secondLegScopeNote}${sourceUrlText ? ` Sources: ${sourceUrlText}` : ''}`
            },
            {
                label: 'Origin / re-export gate',
                detail: `${originNote} ${transitAuthenticityDecision}`
            },
            {
                label: 'Control gate',
                detail: controlGate
                    ? `${controlGate.severity}: ${controlGate.label}`
                    : 'No default export-control gate triggered by the maintained product signal.'
            }
        ],
        routeScopeLabel: `Transit comparison: ${fromLabel} -> ${viaLabel} -> ${toLabel}`,
        transitWarning: `${costConclusion} First leg ${fromLabel} -> ${viaLabel}: ${firstLabel} (${firstCostLabel}); second leg ${viaLabel} -> ${toLabel}: ${secondLabel} (${secondCostLabel}); combined signal: ${combinedLabel} (${combinedCostLabel}); direct route: ${directLabel} (${directCostLabel}); delta: ${deltaRateLabel} (${deltaCostLabel}) per $1k. ${secondLegScopeNote} ${originNote}`,
        routeKind: 'transit',
        transitCostStatus,
        transitReason,
        originSavingsCaveat: transitCostStatus === 'cost_advantage' ? originSavingsCaveat : '',
        transitScore,
        transitComparison: {
            via,
            viaLabel,
            route: `${fromLabel} -> ${viaLabel} -> ${toLabel}`,
            firstLegRate: firstLabel,
            secondLegRate: secondLabel,
            combinedRate: combinedLabel,
            directRate: directLabel,
            deltaRate: deltaRateLabel,
            firstLegCostPer1000: firstCostLabel,
            secondLegCostPer1000: secondCostLabel,
            combinedCostPer1000: combinedCostLabel,
            directCostPer1000: directCostLabel,
            deltaCostPer1000: deltaCostLabel,
            costConclusion,
            originNote,
            decision: transitDecision,
            rejectionReasons,
            routeDecisionSummary,
            secondCoverageLabel: secondLegCoverageLabel,
            secondLegRouteSpecific,
            secondLegTransitEvidence: Boolean(transitEvidence),
            secondLegScopeNote,
            transitCostEvidence,
            transitLegalGate,
            transitAuthenticityDecision,
            firstSourceBasis,
            secondSourceBasis,
            firstSourceUrl,
            secondSourceUrl,
            secondParserPriority: secondReadiness.parserPriority,
            secondParserNextAction: transitEvidence?.nextAction || secondCoverage.parserNextAction,
            secondDutyBreakdown: secondBreakdown
        }
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
    const rawCards = candidates
        .map((market) => buildMarketCard({ market, from, to, focus, productSignal, dutyRates: input.dutyRates, priorityMatrix: input.priorityMatrix, ruleTags: input.ruleTags }))
        .sort((a, b) => b.score - a.score || b.readinessRank - a.readinessRank || a.label.localeCompare(b.label));
    const selectedMarket = buildMarketCard({ market: to, from, to, focus, productSignal, dutyRates: input.dutyRates, priorityMatrix: input.priorityMatrix, ruleTags: input.ruleTags });
    const cards = rawCards.map((card) => buildTransitComparison({
        card,
        from,
        to,
        productSignal,
        dutyRates: input.dutyRates,
        priorityMatrix: input.priorityMatrix,
        directMarket: selectedMarket
    }));
    const transitRoutes = cards
        .filter((card) => card.market !== to)
        .sort((a, b) => (b.transitScore ?? b.score) - (a.transitScore ?? a.score) || (b.marketScore ?? b.score) - (a.marketScore ?? a.score) || a.label.localeCompare(b.label))
        .slice(0, 2);
    const compared = [
        selectedMarket,
        ...transitRoutes
    ];
    const best = chooseFeaturedMarket({ cards: compared, selectedMarket, to });
    const lowerFriction = compared.find((card) => card.market !== to && card.score >= selectedMarket.score + 8);
    const controlSummary = selectedMarket.exportControlGate
        ? `${productSignal.label} is control-gated on this route; clear export-control, end-use, origin, and re-export evidence before tax or transit optimization.`
        : '';
    const summary = controlSummary || (lowerFriction
        ? `${lowerFriction.label} may be a lower-friction market to compare against ${countryLabel(to)} for ${productSignal.label.toLowerCase()}.`
        : `${countryLabel(to)} remains the primary route to review; compare tax, certification, and evidence readiness before committing.`);
    const readyRoutes = compared.filter((card) => card.readinessRank >= 3);
    const parserBacklog = compared.filter((card) => card.coverageTone === 'partial' || card.coverageTone === 'gap');
    const routeNarrative = buildRouteChoiceNarrative({ best, selectedMarket, productSignal, to });
    const businessDecisionSummary = buildBusinessDecisionSummary({ selectedMarket, transitRoutes, best, productSignal });
    const routeRecommendation = buildRouteRecommendation({ selectedMarket, transitRoutes, best, productSignal, to });
    const rateCoverageSummary = buildRateCoverageSummary({ selectedMarket, transitRoutes });
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
        transitRoutes,
        routeComparison: compared,
        parserTargets,
        readyRouteCount: readyRoutes.length,
        parserBacklogCount: parserBacklog.length,
        summary,
        businessDecisionSummary,
        routeRecommendation,
        rateCoverageSummary,
        whyThisRoute: routeNarrative.whyThisRoute,
        whyNotSelectedRoute: routeNarrative.whyNotSelectedRoute,
        insights: [
            {
                type: 'Best route',
                label: best.opportunitySignal.headline,
                text: best.commercialDecision || best.opportunitySignal.oneLine
            },
            {
                type: 'Trade opportunity',
                label: best.label,
                text: `${best.opportunitySignal.shortAction || best.opportunitySignal.action} ${best.marginSignal || best.valueLever}`
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

const PRIORITY_PRODUCT_QUERIES = {
    tablet: 'tablet computer wifi bluetooth battery',
    smartphone: 'smartphone 5G cellular wireless battery',
    router: 'wireless router wifi telecom equipment',
    ev_charger: 'EV charger wallbox power converter',
    battery: 'energy storage battery system lithium battery',
    solar: 'solar panel photovoltaic module',
    semiconductor: 'AI GPU accelerator chip advanced computing',
    monitor: 'computer monitor display electronics'
};

function opportunityPriorityPenalty(card = {}) {
    if (card.landedCostRisk === 'High') return 10;
    if (card.landedCostRisk === 'Unknown') return 14;
    if (card.landedCostRisk === 'Medium') return 4;
    return 0;
}

function classifyOpportunityWorkbenchBucket({ selected = {}, bestIsSelected = true, priorityScore = 0 }) {
    const sourceTrust = selected.sourceTrust || 'not_covered';
    const quoteReadiness = selected.quoteReadiness || 'Research only';
    const friction = selected.complianceFriction || 'Medium';
    const officialEnough = ['official_exact', 'official_duty_tax_estimate', 'mixed_official_estimate'].includes(sourceTrust);
    const weakCoverage = ['not_covered', 'precheck_estimate', 'benchmark_source_checked', 'indicative'].includes(sourceTrust);

    if (weakCoverage || quoteReadiness === 'Research only') {
        return {
            workbenchBucket: 'data_gap',
            workbenchBucketLabel: 'Data gap',
            workbenchAction: selected.parserNextAction || 'Upgrade tariff source and parser coverage before recommending this route.'
        };
    }
    if (!officialEnough || sourceTrust === 'official_link_estimate' || sourceTrust === 'official_heading_only') {
        return {
            workbenchBucket: 'need_tariff_upgrade',
            workbenchBucketLabel: 'Need tariff upgrade',
            workbenchAction: selected.parserNextAction || 'Convert official source coverage into exact HS duty/tax parsing.'
        };
    }
    if (['High', 'Very high', 'Medium-high'].includes(friction)) {
        return {
            workbenchBucket: 'need_rule_upgrade',
            workbenchBucketLabel: 'Need compliance rule upgrade',
            workbenchAction: selected.riskNote || 'Add product-specific compliance rules, cases, and approval gates for this route.'
        };
    }
    if (bestIsSelected && priorityScore >= 70) {
        return {
            workbenchBucket: 'top_opportunity',
            workbenchBucketLabel: 'Top opportunity',
            workbenchAction: selected.strategicNote || selected.commercialDecision || 'Promote as a quote-ready opportunity route.'
        };
    }
    return {
        workbenchBucket: bestIsSelected ? 'top_opportunity' : 'need_rule_upgrade',
        workbenchBucketLabel: bestIsSelected ? 'Top opportunity' : 'Need compliance rule upgrade',
        workbenchAction: bestIsSelected
            ? (selected.strategicNote || selected.commercialDecision || 'Use as a monitored commercial opportunity.')
            : 'Compare against better-ranked markets and strengthen the selected route explanation.'
    };
}

function buildOpportunityPriorityList({
    dutyRates,
    priorityMatrix,
    limit = 24
} = {}) {
    const routes = normalizePriorityRoutes(priorityMatrix)
        .filter((route) => route.origin_country && route.origin_country !== '*')
        .filter((route) => route.import_country && route.product_id);
    const seen = new Set();
    const rows = [];

    routes.forEach((route) => {
        const key = `${route.product_id}:${normalizeCountry(route.origin_country)}:${normalizeCountry(route.import_country)}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const product = PRIORITY_PRODUCT_QUERIES[route.product_id] || `${route.product_id || 'electronics'} product`;
        const model = buildOpportunityInsights({
            product,
            from: route.origin_country,
            to: route.import_country,
            focus: 'import',
            dutyRates,
            priorityMatrix
        });
        const selected = model.selectedMarket || {};
        const best = model.best || selected;
        const bestIsSelected = best.market === selected.market;
        const selectedReadiness = selected.quoteReadiness || 'Research only';
        const selectedScore = Number(selected.score || 0);
        const bestScore = Number(best.score || selectedScore);
        const priorityScore = Math.max(0, Math.min(100, Math.round(
            (bestScore * 0.55)
            + (selectedScore * 0.35)
            + (selected.sourceTrust === 'official_exact' ? 8 : selected.sourceTrust === 'official_duty_tax_estimate' ? 6 : selected.sourceTrust === 'mixed_official_estimate' ? 4 : 0)
            - opportunityPriorityPenalty(selected)
        )));
        const workbench = classifyOpportunityWorkbenchBucket({ selected, bestIsSelected, priorityScore });
        rows.push({
            id: `${route.product_id}-${normalizeCountry(route.origin_country).toLowerCase()}-${normalizeCountry(route.import_country).toLowerCase()}`,
            product_id: route.product_id,
            product,
            from: normalizeCountry(route.origin_country),
            to: normalizeCountry(route.import_country),
            route: model.routeLabel,
            hs_code: route.hs_code || selected.hsCode || '',
            priority_score: priorityScore,
            selected_market: selected.label || countryLabel(route.import_country),
            selected_market_score: selectedScore,
            selected_source_trust: selected.sourceTrust || 'not_covered',
            selected_total_rate: selected.dutyBreakdown?.totalRate || 'Not covered',
            best_market: best.label || '',
            best_market_code: best.market || '',
            best_market_score: bestScore,
            best_total_rate: best.dutyBreakdown?.totalRate || 'Not covered',
            best_is_selected: bestIsSelected,
            quote_readiness: selectedReadiness,
            landed_cost_risk: selected.landedCostRisk || 'Unknown',
            market_role: selected.marketRole || '',
            opportunity_type: selected.opportunityType || '',
            route_strategy: selected.routeStrategy || '',
            demand_strength: selected.demandStrength || '',
            compliance_friction: selected.complianceFriction || '',
            route_feasibility: selected.routeFeasibility || '',
            green_supply_chain_advantage: selected.greenSupplyChainAdvantage || '',
            opportunity_tags: selected.opportunityTags || [],
            workbench_bucket: workbench.workbenchBucket,
            workbench_bucket_label: workbench.workbenchBucketLabel,
            workbench_action: workbench.workbenchAction,
            commercial_action: bestIsSelected
                ? (selected.commercialDecision || selected.businessAction || '')
                : `Compare ${best.label} against ${selected.label}; ${best.quoteReadiness || 'review'} route may offer better commercial fit.`,
            coverage_label: selected.coverageLabel || '',
            parser_priority: selected.parserPriority || '',
            next_action: selected.parserNextAction || ''
        });
    });

    const sortedRows = rows
        .sort((a, b) => (
            b.priority_score - a.priority_score
            || b.best_market_score - a.best_market_score
            || a.route.localeCompare(b.route)
            || a.product_id.localeCompare(b.product_id)
        ));

    const selectedRows = [];
    const selectedIds = new Set();
    const pushRow = (row) => {
        if (!row || selectedIds.has(row.id)) {
            return;
        }
        selectedRows.push(row);
        selectedIds.add(row.id);
    };

    const byDestination = new Map();
    const byRoute = new Map();
    sortedRows.forEach((row) => {
        if (!byDestination.has(row.to)) {
            byDestination.set(row.to, row);
        }
        const routeKey = `${row.from}->${row.to}`;
        if (!byRoute.has(routeKey)) {
            byRoute.set(routeKey, row);
        }
    });

    byDestination.forEach(pushRow);
    [
        'CN->IN',
        'US->CN',
        'CN->US',
        'US->SG',
        'SG->CN',
        'US->MY',
        'MY->CN',
        'CN->EU',
        'CN->DE',
        'CN->NL'
    ].forEach((routeKey) => pushRow(byRoute.get(routeKey)));
    sortedRows.forEach(pushRow);

    return selectedRows.slice(0, limit);
}

const api = {
    MARKET_PROFILES,
    PRODUCT_SIGNALS,
    detectProductSignal,
    buildOpportunityInsights,
    buildOpportunityPriorityList
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyOpportunity = api;
}
