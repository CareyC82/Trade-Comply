/**
 * Industry-specific actionable checklist — single source of truth for PDF/UI tasks.
 * Never inject FCC / Part 15 / Part 18 outside the electronics channel.
 */
'use strict';

const VALID_INDUSTRIES = new Set([
    'electronics',
    'new-energy',
    'semiconductor',
    'data-center',
    'industrial-automation',
    'healthcare-lab'
]);

function normalizeIndustry(industry) {
    const raw = String(industry || '').trim().toLowerCase();
    if (!raw) {
        return null;
    }
    if (raw === 'electronics' || raw === 'electronic' || raw === 'consumer electronics') {
        return 'electronics';
    }
    if (
        raw === 'new-energy'
        || raw === 'new_energy'
        || raw === 'new energy'
        || raw === 'newenergy'
        || raw === 'new energy & clean tech'
        || raw === 'clean tech'
        || raw === 'new-energy-view'
    ) {
        return 'new-energy';
    }
    if (raw === 'semiconductor' || raw === 'semiconductors' || raw === 'semi' || raw === 'advanced semiconductor') {
        return 'semiconductor';
    }
    if (
        raw === 'data-center'
        || raw === 'data_center'
        || raw === 'data center'
        || raw === 'edge computing'
        || raw === 'data center & edge computing equipment'
    ) {
        return 'data-center';
    }
    if (
        raw === 'industrial-automation'
        || raw === 'industrial_automation'
        || raw === 'industrial automation'
        || raw === 'robotics'
        || raw === 'industrial automation & robotics'
    ) {
        return 'industrial-automation';
    }
    if (
        raw === 'healthcare-lab'
        || raw === 'healthcare_lab'
        || raw === 'healthcare lab'
        || raw === 'healthcare'
        || raw === 'medical electronics'
        || raw === 'healthcare & lab electronics'
    ) {
        return 'healthcare-lab';
    }
    if (raw.includes('new energy') || raw.includes('clean tech') || raw.includes('photovoltaic') || raw.includes('battery')) {
        return 'new-energy';
    }
    if (raw.includes('semiconductor') || raw.includes('chip control')) {
        return 'semiconductor';
    }
    if (raw.includes('data center') || raw.includes('edge computing') || raw.includes('server')) {
        return 'data-center';
    }
    if (raw.includes('industrial automation') || raw.includes('robot')) {
        return 'industrial-automation';
    }
    if (raw.includes('healthcare') || raw.includes('medical') || raw.includes('lab')) {
        return 'healthcare-lab';
    }
    if (raw.includes('electronic')) {
        return 'electronics';
    }
    return VALID_INDUSTRIES.has(raw) ? raw : null;
}

function task(phase, taskText, desc, source = 'actionable-base') {
    return { phase, task: taskText, desc, source };
}

function sharedBaseTasks(country, direction) {
    const isExport = direction !== 'import';
    const tasks = [
        task(
            'documentation',
            'Prepare commercial invoice & conformity documentation pack',
            'Bundle invoice, packing list, conformity certificates, and test reports for customs clearance.',
            'actionable-shared'
        ),
        task(
            'documentation',
            'Validate HS classification & tariff exposure',
            'Cross-check declared HS code against product function and screen destination tariff / trade-remedy lists before filing.',
            'actionable-shared'
        )
    ];

    if (isExport && country === 'US') {
        tasks.push(task(
            'documentation',
            'Perform BIS / Entity List restricted-party screening',
            'Run denied-party screening and retain end-user / end-use statements where export controls may apply.',
            'actionable-shared'
        ));
    }

    return tasks;
}

function electronicsTasks(country, direction) {
    const isExport = direction !== 'import';
    const tasks = [];

    if (isExport && country === 'US') {
        tasks.push(task(
            'technical',
            'Verify FCC ID conformity & technical labeling (FCC Part 15/18)',
            'Confirm intentional radiator FCC Part 15/18 authorization, supplier FCC ID on label, and RF exposure compliance for US market entry.',
            'actionable-electronics'
        ));
        tasks.push(task(
            'documentation',
            'Screen Section 301 & HTS tariff exposure',
            'Map the 10-digit HTS line against Section 301 lists and additional duties; document country of origin and value build-up.',
            'actionable-electronics'
        ));
    }

    if (isExport && country === 'EU') {
        tasks.push(task(
            'technical',
            'Complete CE Marking (RED Directive)',
            'Verify radio equipment meets EU Radio Equipment Directive essential requirements with Declaration of Conformity and technical file.',
            'actionable-electronics'
        ));
        tasks.push(task(
            'environmental',
            'Submit RoHS & WEEE compliance dossier',
            'Prepare RoHS substance documentation, REACH SVHC disclosures, and WEEE producer registration where applicable.',
            'actionable-electronics'
        ));
    }

    tasks.push(task(
        'technical',
        'Verify product safety & wireless conformity for destination market',
        'Screen SRRC, labeling, battery transport, and consumer product safety requirements before shipment.',
        'actionable-electronics'
    ));

    return tasks;
}

function newEnergyTasks(country, direction, productQuery = '') {
    const isExport = direction !== 'import';
    const text = String(productQuery || '').toLowerCase();
    const isAirFreight = /air freight|air-freight|iata|aviation|air transport/i.test(text);
    const isEnergyStorageSystem = /\b(ess|bess)\b|energy storage|storage system|stationary storage|battery cabinet|battery rack|powerwall|ul\s*9540/i.test(text);
    const isGridConnected = /solar|photovoltaic|pv module|8541|inverter|charger|charging station|evse|grid|interconnection/i.test(text)
        || isEnergyStorageSystem;
    const tasks = [
        task(
            'environmental',
            'Confirm battery & chemical substance compliance',
            'Check lithium battery UN38.3 test summary, SDS/MSDS reports, RoHS/REACH substance limits, and battery recycling labeling obligations.',
            'actionable-new-energy'
        )
    ];

    if (isAirFreight) {
        tasks.push(task(
            'documentation',
            'Obtain air-freight dangerous goods approval (IATA DGR / UN38.3)',
            'Confirm proper shipping name and UN number (UN3480/UN3481 or UN3090/UN3091 as applicable); attach UN38.3 summary, SDS/MSDS, package marks/labels, and shipper declaration where required.',
            'actionable-new-energy'
        ));
    } else {
        tasks.push(task(
            'documentation',
            'Obtain Class 9 dangerous goods booking approval & UN38.3 report',
            'Secure carrier approval for lithium batteries, UN38.3 test summary, SDS/MSDS, and proper shipping marks.',
            'actionable-new-energy'
        ));
    }

    if (isExport && country === 'US' && /solar|photovoltaic|pv module|8541/i.test(text)) {
        tasks.push(task(
            'documentation',
            'Run UFLPA supply chain tracing for polysilicon raw materials',
            'Document polysilicon origin and supplier attestations to defend against forced-labor detention risk.',
            'actionable-new-energy'
        ));
    }

    if (isExport && country === 'US' && isEnergyStorageSystem) {
        tasks.push(task(
            'technical',
            'Verify UL 9540 / energy storage fire-safety evidence (if ESS)',
            'Confirm thermal runaway and fire propagation test documentation for North American energy storage deployment.',
            'actionable-new-energy'
        ));
    }

    if (isGridConnected) {
        tasks.push(task(
            'technical',
            'Screen renewable-energy product conformity & grid interconnection rules',
            'Confirm inverter, PV, storage, charger, or grid-connected equipment certifications required in the destination market.',
            'actionable-new-energy'
        ));
    }

    return tasks;
}

function semiconductorTasks(country, direction) {
    const isExport = direction !== 'import';
    const tasks = [
        task(
            'documentation',
            'Review BIS ECCN classification & export controls',
            'Screen advanced computing, semiconductor, and telecom items against BIS ECCN lists, Entity List, and license requirements.',
            'actionable-semiconductor'
        ),
        task(
            'technical',
            'Screen Entity List & restricted-party lists',
            'Run denied-party screening on buyer, consignee, and end-user before releasing controlled technology.',
            'actionable-semiconductor'
        )
    ];

    if (isExport) {
        tasks.push(task(
            'technical',
            'Verify encryption & technology transfer restrictions',
            'Screen embedded cryptography, foundry flow, and re-export conditions on controlled components.',
            'actionable-semiconductor'
        ));
        tasks.push(task(
            'documentation',
            'Validate HS / ECCN rationale & license determination',
            'Document HS/ECCN classification and any export license or exception relied upon before shipment.',
            'actionable-semiconductor'
        ));
    }

    if (!isExport && country === 'US') {
        tasks.push(task(
            'documentation',
            'Collect US supplier ECCN / license trace for inbound tooling',
            'Gather manufacturer ECCN classifications and BIS license references for semiconductor equipment imports.',
            'actionable-semiconductor'
        ));
    }

    return tasks;
}

function dataCenterTasks(country, direction) {
    const isExport = direction !== 'import';
    const tasks = [
        task(
            'technical',
            'Screen AI compute, encryption, and controlled performance thresholds',
            'Confirm whether servers, edge AI boxes, network appliances, or storage systems include controlled accelerators, cryptography, or high-performance compute functions.',
            'actionable-data-center'
        ),
        task(
            'documentation',
            'Collect component bill of materials and origin evidence',
            'Keep GPU/accelerator, storage, power, cooling, and network module origin details aligned with invoice and customs declaration data.',
            'actionable-data-center'
        )
    ];

    if (isExport) {
        tasks.push(task(
            'documentation',
            'Run end-user, data-center operator, and restricted-party screening',
            'Screen buyer, consignee, data-center operator, and ultimate end use before shipping system-level compute equipment.',
            'actionable-data-center'
        ));
    }

    return tasks;
}

function industrialAutomationTasks(country, direction) {
    const isExport = direction !== 'import';
    const tasks = [
        task(
            'technical',
            'Verify machinery safety, electrical conformity, and control-system documentation',
            'Prepare safety, EMC, electrical, and technical-file evidence for PLCs, robot controllers, CNC controls, sensors, and machine-vision systems.',
            'actionable-industrial'
        ),
        task(
            'technical',
            'Screen dual-use, robotics, and industrial-control end-use risk',
            'Check whether robot, motion-control, machine-vision, or factory gateway functions trigger dual-use, sanctions, or sensitive end-user review.',
            'actionable-industrial'
        )
    ];

    if (isExport) {
        tasks.push(task(
            'documentation',
            'Confirm export classification and software/technology-transfer limits',
            'Document HS/ECCN or local export classification for controllers, software, and remote-access functions before shipment.',
            'actionable-industrial'
        ));
    }

    return tasks;
}

function healthcareLabTasks(country, direction) {
    return [
        task(
            'technical',
            'Confirm medical-device or laboratory-equipment market access scope',
            'Determine whether the product is regulated as a medical device, IVD, laboratory instrument, or general electronic accessory in the destination market.',
            'actionable-healthcare'
        ),
        task(
            'documentation',
            'Prepare safety, EMC, labeling, and clinical-use documentation',
            'Bundle electrical safety, EMC, intended-use, labeling, importer, and user-manual evidence before filing or market placement.',
            'actionable-healthcare'
        ),
        task(
            'technical',
            'Screen wireless, battery, data, and cold-chain functions',
            'Check Bluetooth/Wi-Fi, lithium battery, patient data, calibration, and temperature-monitoring obligations where applicable.',
            'actionable-healthcare'
        )
    ];
}

/**
 * @param {string} industry - electronics | new-energy | semiconductor
 * @param {{ country?: string, direction?: string, productQuery?: string }} [context]
 */
function getActionableChecklist(industry, context = {}) {
    const safeIndustry = normalizeIndustry(industry) || 'electronics';
    const country = String(context.country || 'US').trim().toUpperCase();
    const direction = context.direction === 'import' ? 'import' : 'export';
    const productQuery = context.productQuery || context.description || '';

    let industryTasks = [];
    if (safeIndustry === 'new-energy') {
        industryTasks = newEnergyTasks(country, direction, productQuery);
    } else if (safeIndustry === 'semiconductor') {
        industryTasks = semiconductorTasks(country, direction);
    } else if (safeIndustry === 'data-center') {
        industryTasks = dataCenterTasks(country, direction);
    } else if (safeIndustry === 'industrial-automation') {
        industryTasks = industrialAutomationTasks(country, direction);
    } else if (safeIndustry === 'healthcare-lab') {
        industryTasks = healthcareLabTasks(country, direction);
    } else {
        industryTasks = electronicsTasks(country, direction);
    }

    const seen = new Set();
    const merged = [];
    [...industryTasks, ...sharedBaseTasks(country, direction)].forEach((row) => {
        const key = `${row.phase}::${row.task}`.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        merged.push(row);
    });

    return merged.slice(0, 8);
}

const actionableChecklistApi = {
    VALID_INDUSTRIES,
    normalizeIndustry,
    getActionableChecklist,
    /** @deprecated alias */
    getActionableChecklistForIndustry: getActionableChecklist
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = actionableChecklistApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyActionableChecklist = actionableChecklistApi;
    globalThis.getActionableChecklist = getActionableChecklist;
}
