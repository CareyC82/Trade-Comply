/**
 * Industry compliance baseline engine — deterministic fallback when AI returns empty checklist.
 * Mirrors the HS-code system prompt industry matrix for server-side enforcement.
 */

const PHASE_TECH = 'technical';
const PHASE_ENV = 'environmental';
const PHASE_DOC = 'documentation';

function normalizeCountryCode(value) {
    const raw = String(value || 'US').trim().toUpperCase();
    if (raw === 'OTHER') {
        return 'GLOBAL';
    }
    return raw;
}

function detectProductProfile(description = '', hsCode = '') {
    const text = `${description} ${hsCode}`.toLowerCase();

    const isSmartPhone = /smart\s*phone|smartphone|mobile phone|cellular phone|手机|8517\.13/.test(text);
    const isSolar = /solar panel|pv module|photovoltaic|solar cell|8541/.test(text);
    const isInverter = /solar inverter|grid-?tie inverter|inverter/.test(text);
    const isLithiumBattery = /lithium battery|li-ion|air freight|un38\.3|dangerous goods/i.test(text)
        && /battery|8507|energy storage|ess/i.test(text);
    const isEnergyStorage = /energy storage|battery system|ess|powerwall|commercial ess|8507/.test(text)
        || isLithiumBattery;
    const isPowerBank = /power bank|portable charger|powerbank/.test(text);
    const isEvCharger = /ev charger|wallbox|charging station|8504\.40/.test(text);
    const isEScooter = /e-?scooter|electric scooter|kick scooter|8711/.test(text);
    const isOpticalModule = /optical module|transceiver|8517\.70|silicon photonics/.test(text);
    const isDrone = /drone|uav|unmanned aerial/.test(text);
    const isGpuChip = /gpu|ai chip|accelerator|8542\.31/.test(text);
    const isIndustrialRobot = /industrial robot|8479\.50/.test(text);
    const isDataCenterSystem = /\b(ai\s*server|gpu\s*server|edge\s*ai\s*(computer|box)|data\s*center|server\s*rack|storage\s*server|nas|san|network appliance|firewall appliance|liquid cooling|pdu|ups)\b/.test(text);
    const isIndustrialAutomation = /\b(plc|programmable logic controller|servo motor|servo drive|industrial robot|robot arm|cnc controller|machine vision|industrial sensor|factory gateway|industrial iot)\b/.test(text);
    const isHealthcareLab = /\b(patient monitor|medical monitor|medical device|diagnostic device|lab analyzer|laboratory analyzer|ivd|wearable health|electronic thermometer|cold[-\s]?chain|medical power supply)\b/.test(text);
    const isConsumerElectronics = /earbud|speaker|smart watch|dash cam|vr headset|3d printer|smartphone|smart phone|wifi|bluetooth|8517|8518|8525|8528|8485|8711/.test(text)
        || isSmartPhone;

    let vertical = 'electronics';
    if (isDataCenterSystem) {
        vertical = 'data-center';
    } else if (isIndustrialAutomation) {
        vertical = 'industrial-automation';
    } else if (isHealthcareLab) {
        vertical = 'healthcare-lab';
    } else if (isGpuChip || isOpticalModule || isDrone || isIndustrialRobot || /\b(semiconductor|gpu|accelerator|optical module)\b/.test(text) || /8542|8486|8479/.test(text)) {
        vertical = 'semiconductor';
    } else if (isSolar || isInverter || isEnergyStorage || isEvCharger || isEScooter || isPowerBank
        || /solar|photovoltaic|8541|8507\.60|energy storage|lithium battery/.test(text)) {
        vertical = 'new-energy';
    }

    return {
        text,
        vertical,
        isSmartPhone,
        isSolar,
        isInverter,
        isEnergyStorage,
        isPowerBank,
        isEvCharger,
        isEScooter,
        isOpticalModule,
        isDrone,
        isGpuChip,
        isIndustrialRobot,
        isDataCenterSystem,
        isIndustrialAutomation,
        isHealthcareLab,
        isConsumerElectronics
    };
}

function item(phase, task, desc) {
    return { phase, task, desc, source: 'industry-baseline' };
}

function pushUnique(target, entry) {
    const key = `${entry.phase}::${entry.task}`.toLowerCase();
    if (!target._seen) {
        target._seen = new Set();
    }
    if (target._seen.has(key)) {
        return;
    }
    target._seen.add(key);
    target.push({ phase: entry.phase, task: entry.task, desc: entry.desc, source: entry.source || 'industry-baseline' });
}

function fillToMinimum(out, extras, minimum = 4) {
    extras.forEach((entry) => {
        if (out.length >= minimum) {
            return;
        }
        pushUnique(out, entry);
    });
}

function buildConsumerElectronicsBaseline(profile, country, direction) {
    const out = [];
    const isExport = direction !== 'import';

    if (isExport && country === 'US') {
        pushUnique(out, item(
            PHASE_TECH,
            'Verify FCC ID conformity & technical labeling',
            'Confirm intentional radiator FCC Part 15/18 authorization, supplier FCC ID on label, and RF exposure compliance for US market entry.'
        ));
    }
    if (isExport && country === 'EU') {
        pushUnique(out, item(
            PHASE_TECH,
            'Complete CE Marking (RED Directive)',
            'Verify radio equipment meets EU Radio Equipment Directive essential requirements with Declaration of Conformity and technical file.'
        ));
        pushUnique(out, item(
            PHASE_ENV,
            'Submit RoHS & WEEE Compliance',
            'Prepare RoHS substance dossier, REACH SVHC disclosures, and confirm WEEE producer registration in the destination EU member state.'
        ));
    }
    if (profile.isSmartPhone) {
        pushUnique(out, item(
            PHASE_TECH,
            'Execute Regulatory SAR (Specific Absorption Rate) Testing',
            'Obtain SAR test reports for cellular/Wi-Fi antennas per destination market limits before shipment.'
        ));
        pushUnique(out, item(
            PHASE_DOC,
            'Register IMEI Number with local Telecom Authority',
            'Activate IMEI/device whitelist with destination telecom authority — unregistered devices may be blocked from network access.'
        ));
        pushUnique(out, item(
            PHASE_TECH,
            'Verify Commercial Cryptography & Encryption Control',
            'Confirm China commercial cryptography export filing if hardware ships with strong encryption (VPN, secure element, encrypted storage).'
        ));
    }

    fillToMinimum(out, [
        item(
            PHASE_TECH,
            'Verify product safety & market-access conformity',
            'Screen wireless, battery, labeling, and consumer product safety requirements for the destination market even when no export-control hit is found.'
        ),
        item(
            PHASE_ENV,
            'Confirm battery & chemical substance compliance',
            'Check lithium battery UN38.3, RoHS/REACH substance limits, and recycling labeling obligations where applicable.'
        ),
        item(
            PHASE_DOC,
            'Prepare commercial invoice & conformity documentation pack',
            'Bundle invoice, packing list, conformity certificates, and test reports for customs clearance.'
        ),
        item(
            PHASE_DOC,
            'Validate HS classification & tariff exposure',
            'Cross-check declared HS code against product function and screen destination tariff / trade-remedy lists before filing.'
        )
    ]);

    return out;
}

function buildNewEnergyBaseline(profile, country, direction) {
    const out = [];
    const isExport = direction !== 'import';
    const isNorthAmerica = country === 'US';
    const isEu = country === 'EU';

    if ((profile.isSolar || profile.isInverter) && isExport && isNorthAmerica) {
        pushUnique(out, item(
            PHASE_TECH,
            'Run UFLPA supply chain tracing for polysilicon raw materials',
            'Document polysilicon origin and supplier attestations to defend against UFLPA forced-labor detention risk.'
        ));
        pushUnique(out, item(
            PHASE_DOC,
            'Verify Anti-Dumping/Countervailing Duties (AD/CVD) exposure',
            'Map HS line against active AD/CVD orders on solar cells/modules and budget duty deposit if applicable.'
        ));
    }
    if ((profile.isSolar || profile.isInverter) && isExport && isEu) {
        pushUnique(out, item(
            PHASE_ENV,
            'Register WEEE for Photovoltaic modules',
            'Complete EU WEEE producer registration pathway for photovoltaic modules placed on the EU market.'
        ));
    }
    if (profile.isEnergyStorage || profile.isPowerBank) {
        pushUnique(out, item(
            PHASE_DOC,
            'Obtain Class 9 Dangerous Goods maritime booking approval & UN38.3 report',
            'Secure carrier approval for lithium batteries, UN38.3 test summary, MSDS/SDS, and proper shipping marks.'
        ));
        if (isNorthAmerica) {
            pushUnique(out, item(
                PHASE_TECH,
                'Verify UL 9540/9540A fire safety standard',
                'Confirm ESS fire propagation and thermal runaway test evidence for North American deployment.'
            ));
        }
        if (isEu) {
            pushUnique(out, item(
                PHASE_ENV,
                'Prepare Battery Passport under New EU Battery Regulation',
                'Assemble carbon footprint, recycled content, and supply chain due diligence for EU Battery Regulation compliance.'
            ));
        }
    }
    if (profile.isEvCharger || profile.isEScooter) {
        if (isNorthAmerica) {
            pushUnique(out, item(
                PHASE_TECH,
                profile.isEScooter ? 'Verify UL 2272 electrical & fire safety' : 'Verify UL 2202 EV charging equipment safety',
                profile.isEScooter
                    ? 'Confirm e-scooter battery and electrical safety testing to UL 2272 for US/Canada retail and import.'
                    : 'Confirm EV supply equipment safety testing to UL 2202 (or equivalent) for North American installation.'
            ));
        }
        if (isEu) {
            pushUnique(out, item(
                PHASE_TECH,
                'Complete RED Cybersecurity (Article 3(3)) review for smart charging',
                'Assess connected charger cybersecurity essential requirements under EU RED delegated acts for network-connected devices.'
            ));
        }
    }
    fillToMinimum(out, [
        item(
            PHASE_TECH,
            'Screen renewable-energy product conformity & grid interconnection rules',
            'Verify grid-code, labeling, and product safety requirements for PV, inverter, or mobility products in the destination market.'
        ),
        item(
            PHASE_DOC,
            'Prepare origin, tariff, and dangerous-goods documentation',
            'Bundle commercial documents, AD/CVD screening memo, and battery DG paperwork where applicable.'
        ),
        item(
            PHASE_ENV,
            'Confirm environmental & recycling registration obligations',
            'Screen WEEE, battery passport, and extended producer responsibility rules for the destination market.'
        ),
        item(
            PHASE_DOC,
            'Validate HS classification & duty exposure',
            'Cross-check HS line, AD/CVD orders, and preferential origin claims before customs filing.'
        )
    ]);

    return out;
}

function buildSemiconductorBaseline(profile, country, direction) {
    const out = [];

    pushUnique(out, item(
        PHASE_TECH,
        'Perform BIS ECCN & dual-use export control screening',
        'Determine ECCN, license exception eligibility, and Entity List / MEU screening before any controlled technology shipment.'
    ));

    if (profile.isOpticalModule) {
        pushUnique(out, item(
            PHASE_TECH,
            'Verify FDA Class 1 Laser Safety certification',
            'Confirm laser class labeling and FDA/CDRH registration for optical modules with active laser emitters entering the US.'
        ));
    }
    if (profile.isDrone) {
        pushUnique(out, item(
            PHASE_DOC,
            'Check MOFCOM UAV dual-use export control catalog thresholds',
            'Measure endurance, payload, and control range against China MOFCOM 2024 UAV export control thresholds and licensing duties.'
        ));
    }
    if (profile.isGpuChip) {
        pushUnique(out, item(
            PHASE_TECH,
            'Screen advanced computing & AI accelerator export thresholds',
            'Map chip TOPS, interconnect bandwidth, and end-use against US/EU advanced computing control lists.'
        ));
    }
    fillToMinimum(out, [
        item(
            PHASE_DOC,
            'Collect end-user & end-use statements',
            'Obtain signed end-user certificates and commodity classification worksheets for customs and export audit trail.'
        ),
        item(
            PHASE_TECH,
            'Verify encryption & technology transfer restrictions',
            'Screen embedded cryptography, foundry flow, and re-export conditions on controlled components.'
        ),
        item(
            PHASE_DOC,
            'Validate HS classification & license determination',
            'Document HS/ECCN rationale and any export license or exception relied upon before shipment.'
        ),
        item(
            PHASE_TECH,
            'Screen Entity List & restricted party lists',
            'Run denied-party screening on buyer, consignee, and end-user before releasing controlled technology.'
        )
    ]);

    return out;
}

function buildDataCenterBaseline(profile, country, direction) {
    const out = [];
    const isExport = direction !== 'import';

    pushUnique(out, item(
        PHASE_TECH,
        'Screen system-level compute, encryption, and restricted end-use risk',
        'Confirm whether AI servers, edge AI computers, network appliances, or storage systems include controlled accelerators, cryptography, or sensitive end-use exposure.'
    ));
    pushUnique(out, item(
        PHASE_DOC,
        'Collect server BOM, origin, and component traceability evidence',
        'Keep GPU/accelerator, storage, power, cooling, and network module origin details aligned with invoice, packing list, and customs declaration data.'
    ));
    if (isExport) {
        pushUnique(out, item(
            PHASE_DOC,
            'Screen data-center operator, consignee, and ultimate end use',
            'Run restricted-party and end-use checks on buyer, consignee, data-center operator, cloud/AI workload owner, and any re-export path.'
        ));
    }
    fillToMinimum(out, [
        item(PHASE_TECH, 'Verify electrical safety, EMC, and network-equipment conformity', 'Check destination-market safety, EMC, telecom, and installation evidence for rack servers, switches, UPS/PDU, and cooling equipment.'),
        item(PHASE_DOC, 'Validate HS classification across server, storage, power, and cooling lines', 'Avoid bundling unrelated server, power, cooling, and network items under one HS code when separate customs lines are required.'),
        item(PHASE_TECH, 'Review cybersecurity and encryption features', 'Document encryption, secure boot, remote management, and network-security features that may trigger market access or export-control review.')
    ]);
    return out;
}

function buildIndustrialAutomationBaseline(profile, country, direction) {
    const out = [];
    const isExport = direction !== 'import';

    pushUnique(out, item(
        PHASE_TECH,
        'Verify machinery safety, EMC, and industrial-control conformity',
        'Prepare safety, EMC, electrical, and technical-file evidence for robots, PLCs, CNC controllers, sensors, machine vision, and industrial gateways.'
    ));
    pushUnique(out, item(
        PHASE_TECH,
        'Screen robotics, machine-vision, and control-system dual-use risk',
        'Check whether precision motion control, inspection, factory automation, or remote-access functions trigger dual-use, sanctions, or sensitive end-user review.'
    ));
    if (isExport) {
        pushUnique(out, item(
            PHASE_DOC,
            'Confirm export classification and software / technology transfer limits',
            'Document HS/ECCN or local export classification for controllers, software, remote diagnostics, and industrial automation technology.'
        ));
    }
    fillToMinimum(out, [
        item(PHASE_DOC, 'Prepare installation, safety, and user documentation pack', 'Bundle manuals, wiring diagrams, safety declarations, calibration records, and importer information for customs or market-surveillance review.'),
        item(PHASE_DOC, 'Validate HS classification and origin evidence', 'Separate robot, controller, servo, sensor, and spare-part lines where needed and keep origin records consistent.')
    ]);
    return out;
}

function buildHealthcareLabBaseline(profile, country, direction) {
    const out = [];

    pushUnique(out, item(
        PHASE_TECH,
        'Confirm medical-device or laboratory-equipment regulatory scope',
        'Determine whether the item is regulated as a medical device, IVD, lab instrument, cold-chain monitor, or general electronic accessory in the target market.'
    ));
    pushUnique(out, item(
        PHASE_DOC,
        'Prepare safety, EMC, labeling, and intended-use documentation',
        'Bundle electrical safety, EMC, intended-use, labeling, importer, user-manual, and certificate evidence before filing or market placement.'
    ));
    pushUnique(out, item(
        PHASE_TECH,
        'Screen wireless, battery, data, calibration, and cold-chain features',
        'Check Bluetooth/Wi-Fi, lithium battery, patient data, calibration, and temperature-monitoring obligations where applicable.'
    ));
    fillToMinimum(out, [
        item(PHASE_DOC, 'Validate HS classification and medical-use declaration', 'Confirm whether the declared HS code, product description, and intended medical/lab use are consistent across invoice and customs records.'),
        item(PHASE_DOC, 'Keep quality-system and traceability evidence available', 'Maintain manufacturer, lot/serial, calibration, and post-market evidence for inspection or customer audit requests.')
    ]);
    return out;
}

function buildIndustryComplianceBaseline({
    description = '',
    hsCode = '',
    country = 'US',
    direction = 'export',
    vertical = null
} = {}) {
    const profile = detectProductProfile(description, hsCode);
    const resolvedVertical = vertical || profile.vertical;
    const normalizedCountry = normalizeCountryCode(country);

    let items = [];
    if (resolvedVertical === 'semiconductor') {
        items = buildSemiconductorBaseline(profile, normalizedCountry, direction);
    } else if (resolvedVertical === 'new-energy') {
        items = buildNewEnergyBaseline(profile, normalizedCountry, direction);
    } else if (resolvedVertical === 'data-center') {
        items = buildDataCenterBaseline(profile, normalizedCountry, direction);
    } else if (resolvedVertical === 'industrial-automation') {
        items = buildIndustrialAutomationBaseline(profile, normalizedCountry, direction);
    } else if (resolvedVertical === 'healthcare-lab') {
        items = buildHealthcareLabBaseline(profile, normalizedCountry, direction);
    } else {
        items = buildConsumerElectronicsBaseline(profile, normalizedCountry, direction);
    }

    delete items._seen;
    return items.slice(0, 8);
}

function filterMergedChecklistByVertical(rows, vertical) {
    let segmentApi = null;
    try {
        segmentApi = require('./checklist-industry-segment');
    } catch (e) {
        segmentApi = typeof globalThis !== 'undefined' ? globalThis.TradeComplyChecklistSegment : null;
    }
    if (segmentApi?.filterChecklistForVertical) {
        return segmentApi.filterChecklistForVertical(rows, vertical);
    }
    return rows;
}

function ensureIndustryChecklist(aiChecklist, context = {}) {
    const vertical = context.vertical
        || detectProductProfile(context.description || '', context.hsCode || context.hscode || '').vertical
        || 'electronics';

    const fromAi = Array.isArray(aiChecklist) ? aiChecklist.filter((row) => row && (row.task || row.title)) : [];
    const baseline = buildIndustryComplianceBaseline({
        description: context.description || '',
        hsCode: context.hsCode || context.hscode || '',
        country: context.counterpartyCountry || context.country || 'US',
        direction: context.direction || 'export',
        vertical
    });

    const merged = [];
    const seen = new Set();
    const seed = fromAi.length >= 4 ? fromAi : [...fromAi, ...baseline];
    seed.forEach((row) => {
        const task = String(row.task || row.title || '').trim();
        const phase = String(row.phase || row.stage || PHASE_DOC).trim();
        if (!task) {
            return;
        }
        const key = `${phase}::${task}`.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const isFromAi = fromAi.some((aiRow) => {
            const aiTask = String(aiRow.task || aiRow.title || '').trim().toLowerCase();
            return aiTask && aiTask === task.toLowerCase();
        });
        merged.push({
            phase,
            task,
            desc: String(row.desc || row.description || '').trim(),
            source: row.source || (isFromAi ? 'ai' : 'industry-baseline')
        });
    });

    const filtered = filterMergedChecklistByVertical(merged, vertical);
    if (filtered.length >= 4) {
        return filtered.slice(0, 8);
    }

    const topUp = filterMergedChecklistByVertical(baseline, vertical);
    topUp.forEach((row) => {
        const task = String(row.task || '').trim();
        const phase = String(row.phase || PHASE_DOC).trim();
        if (!task) {
            return;
        }
        const key = `${phase}::${task}`.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        merged.push(row);
    });

    return filterMergedChecklistByVertical(merged, vertical).slice(0, 8);
}

const industryChecklistBaselineApi = {
    PHASE_TECH,
    PHASE_ENV,
    PHASE_DOC,
    detectProductProfile,
    buildIndustryComplianceBaseline,
    ensureIndustryChecklist
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = industryChecklistBaselineApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyIndustryBaseline = industryChecklistBaselineApi;
}
