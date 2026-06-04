#!/usr/bin/env node
/**
 * Seed route/focus baseline coverage for global trade lanes.
 *
 * These are not full legal opinions. They give the matching engine a country-
 * specific starting point when a route has no maintained export or import
 * signal yet, so the UI can show a meaningful pre-check instead of an empty
 * route.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');
const CASES_PATH = path.join(ROOT, 'data', 'cases.json');
const EFFECTIVE_DATE = '2026-06-04';

const COMMON_HS_CODES = [
    '8471',
    '8479',
    '8486',
    '8504',
    '8507',
    '8517',
    '8525',
    '8528',
    '8541',
    '8542',
    '9030'
];

const COMMON_PRODUCT_KEYWORDS = [
    'electronics',
    'electronic components',
    'wireless',
    'wifi',
    'bluetooth',
    'router',
    'tablet',
    'tablet computer',
    'smartphone',
    'ip camera',
    'drone',
    'uav',
    'battery',
    'lithium battery',
    'energy storage',
    'ev charger',
    'solar',
    'photovoltaic',
    'semiconductor',
    'chip',
    'gpu',
    'ai accelerator',
    'optical transceiver',
    'industrial robot',
    'export control',
    'customs',
    'origin',
    're-export',
    'transshipment'
];

const ORIGIN_EXPORT_BASELINES = [
    {
        country: 'US',
        label: 'United States',
        tag_id: 'CL-USORIGEXP-001',
        case_id: 'CASE-US-EXPORT-BASELINE',
        short_name: '[US Export / EAR / AES]',
        source_citation: 'US BIS Export Administration Regulations and AES export filing baseline',
        source_url: 'https://www.bis.gov/regulations/ear/758',
        risk_level: 'High'
    },
    {
        country: 'EU',
        label: 'European Union',
        tag_id: 'CL-EUORIGEXP-001',
        case_id: 'CASE-EU-EXPORT-BASELINE',
        short_name: '[EU Dual-use / Export Customs]',
        source_citation: 'EU dual-use export controls and customs export baseline',
        source_url: 'https://policy.trade.ec.europa.eu/help-exporters-and-importers/exporting-goods/exporting-dual-use-items_en',
        risk_level: 'Medium'
    },
    {
        country: 'JP',
        label: 'Japan',
        tag_id: 'CL-JPORIGEXP-001',
        case_id: 'CASE-JP-EXPORT-BASELINE',
        short_name: '[JP METI Export Control]',
        source_citation: 'Japan METI security export control baseline',
        source_url: 'https://www.meti.go.jp/policy/anpo/englishpage.html',
        risk_level: 'Medium'
    },
    {
        country: 'KR',
        label: 'South Korea',
        tag_id: 'CL-KRORIGEXP-001',
        case_id: 'CASE-KR-EXPORT-BASELINE',
        short_name: '[KR Strategic Goods Export]',
        source_citation: 'Korea strategic trade control baseline',
        source_url: 'https://www.kosti.or.kr/',
        risk_level: 'Medium'
    },
    {
        country: 'MX',
        label: 'Mexico',
        tag_id: 'CL-MXORIGEXP-001',
        case_id: 'CASE-MX-EXPORT-BASELINE',
        short_name: '[MX Export Customs / Notices]',
        source_citation: 'Mexico customs export declaration and VUCEM baseline',
        source_url: 'https://www.ventanillaunica.gob.mx/',
        risk_level: 'Medium'
    },
    {
        country: 'VN',
        label: 'Vietnam',
        tag_id: 'CL-VNORIGEXP-001',
        case_id: 'CASE-VN-EXPORT-BASELINE',
        short_name: '[VN Export Customs / Origin]',
        source_citation: 'Vietnam customs export declaration and origin baseline',
        source_url: 'https://www.customs.gov.vn/',
        risk_level: 'Medium'
    },
    {
        country: 'MY',
        label: 'Malaysia',
        tag_id: 'CL-MYORIGEXP-001',
        case_id: 'CASE-MY-EXPORT-BASELINE',
        short_name: '[MY STA / Export Customs]',
        source_citation: 'Malaysia Strategic Trade Act and export customs declaration baseline',
        source_url: 'https://www.customs.gov.my/en/business/import-export/export/export-procedure',
        risk_level: 'Medium'
    },
    {
        country: 'RU',
        label: 'Russia',
        tag_id: 'CL-RUORIGEXP-001',
        case_id: 'CASE-RU-EXPORT-BASELINE',
        short_name: '[RU Export / Customs / Sanctions]',
        source_citation: 'Russia export customs and sanctions screening baseline',
        source_url: 'https://customs.gov.ru/',
        risk_level: 'High'
    },
    {
        country: 'TW',
        label: 'Taiwan (China)',
        tag_id: 'CL-TWORIGEXP-001',
        case_id: 'CASE-TW-EXPORT-BASELINE',
        short_name: '[TW SHTC Export Control]',
        source_citation: 'Taiwan BOFT strategic high-tech commodity export-control baseline',
        source_url: 'https://www.trade.gov.tw/',
        risk_level: 'Medium'
    }
];

const DESTINATION_IMPORT_BASELINES = [
    {
        country: 'RU',
        label: 'Russia',
        tag_id: 'CL-RUDESTIMP-001',
        case_id: 'CASE-RU-IMPORT-BASELINE',
        short_name: '[RU / EAEU Import Market Access]',
        source_citation: 'Russia / EAEU customs and technical regulation baseline',
        source_url: 'https://eec.eaeunion.org/',
        risk_level: 'Medium'
    },
    {
        country: 'TW',
        label: 'Taiwan (China)',
        tag_id: 'CL-TWDESTIMP-001',
        case_id: 'CASE-TW-IMPORT-BASELINE',
        short_name: '[TW BSMI / NCC / Customs]',
        source_citation: 'Taiwan BSMI, NCC, and customs import baseline',
        source_url: 'https://www.bsmi.gov.tw/',
        risk_level: 'Medium'
    }
];

const DESTINATION_IMPORT_CUSTOMS_BASELINES = [
    {
        country: 'US',
        label: 'United States',
        tag_id: 'CL-USIMPCUST-001',
        case_id: 'CASE-US-IMPORT-CUSTOMS',
        short_name: '[US CBP Import Entry / HTS]',
        source_citation: 'US CBP import entry, HTS classification, valuation, and entry summary baseline',
        source_url: 'https://www.cbp.gov/trade',
        risk_level: 'Medium'
    },
    {
        country: 'EU',
        label: 'European Union',
        tag_id: 'CL-EUIMPCUST-001',
        case_id: 'CASE-EU-IMPORT-CUSTOMS',
        short_name: '[EU Customs Import / TARIC]',
        source_citation: 'EU customs import declaration and TARIC classification baseline',
        source_url: 'https://taxation-customs.ec.europa.eu/customs-4_en',
        risk_level: 'Medium'
    },
    {
        country: 'DE',
        label: 'Germany',
        tag_id: 'CL-DEIMPCUST-001',
        case_id: 'CASE-DE-IMPORT-CUSTOMS',
        short_name: '[DE Zoll Import / ATLAS]',
        source_citation: 'German Customs import declaration and ATLAS baseline',
        source_url: 'https://www.zoll.de/EN/Home/home_node.html',
        risk_level: 'Medium'
    },
    {
        country: 'NL',
        label: 'Netherlands',
        tag_id: 'CL-NLIMPCUST-001',
        case_id: 'CASE-NL-IMPORT-CUSTOMS',
        short_name: '[NL Customs Import / Declaration]',
        source_citation: 'Netherlands Customs import declaration baseline',
        source_url: 'https://www.belastingdienst.nl/wps/wcm/connect/en/customs/customs',
        risk_level: 'Medium'
    },
    {
        country: 'SG',
        label: 'Singapore',
        tag_id: 'CL-SGIMPCUST-001',
        case_id: 'CASE-SG-IMPORT-CUSTOMS',
        short_name: '[SG Customs Import Permit]',
        source_citation: 'Singapore Customs import permit and declaration baseline',
        source_url: 'https://www.customs.gov.sg/businesses/importing-goods/import-procedures/',
        risk_level: 'Medium'
    },
    {
        country: 'ASEAN',
        label: 'ASEAN',
        tag_id: 'CL-ASEANIMP-001',
        case_id: 'CASE-ASEAN-IMPORT-BASELINE',
        short_name: '[ASEAN Member Import Baseline]',
        source_citation: 'ASEAN Trade Repository member-state import procedure baseline',
        source_url: 'https://atr.asean.org/',
        risk_level: 'Medium'
    }
];

const ORIGIN_EXPORT_CUSTOMS_BASELINES = [
    {
        country: 'ASEAN',
        label: 'ASEAN',
        tag_id: 'CL-ASEANEXPCUST-001',
        case_id: 'CASE-ASEAN-EXPORT-CUSTOMS',
        short_name: '[ASEAN Export Customs / Origin]',
        source_citation: 'ASEAN Trade Repository export procedure and origin documentation baseline',
        source_url: 'https://atr.asean.org/',
        risk_level: 'Medium'
    }
];

const EXISTING_TAG_CASE_ATTACHMENTS = [
    {
        tag_id: 'CL-DE-001',
        case_id: 'CASE-DE-EXPORT-BAFA-DUALUSE',
        country: 'DE',
        label: 'Germany',
        title: 'Germany BAFA dual-use export screening signal for electronics and semiconductor routes',
        category: 'Export Control / BAFA / Dual-use',
        summary: 'Germany-origin electronics, power electronics, batteries, semiconductor equipment, software, and controlled technology should be screened against EU dual-use controls, the German Export List, embargo rules, end-use/end-user risk, and BAFA licence or general-authorisation pathways before export.',
        source_url: 'https://www.bafa.de/DE/Aussenwirtschaft/Ausfuhrkontrolle/gueterlisten/gueterlisten_node.html',
        related_keywords: [
            'Germany',
            'BAFA',
            'dual-use',
            'export control',
            'export license',
            'electronics',
            'semiconductor',
            'battery',
            'power electronics'
        ]
    }
];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function hasId(items, key, id) {
    return items.some((item) => item[key] === id);
}

function buildOriginExportTag(seed) {
    return {
        tag_id: seed.tag_id,
        category: 'EXPORT_CTRL',
        category_label: 'Export Control',
        tag_type: 'CHECK_REQUIRED',
        short_name: seed.short_name,
        short_description: `${seed.label}-origin exports require export-control, origin, re-export, and customs declaration review.`,
        description: `Exports from ${seed.label} of electronics, wireless devices, batteries, photovoltaic products, semiconductor items, advanced computing products, and industrial equipment should be checked for export control classification, license or permit triggers, sanctions and end-use/end-user screening, origin and re-export or transshipment exposure, and outbound customs export declaration data before shipment.`,
        content_en: `${seed.label}-origin electronics and advanced-technology exports should be checked for export controls, license or permit triggers, sanctions, origin/re-export exposure, and outbound customs export declaration data.`,
        content_zh: `从${seed.label}出口电子和先进技术产品，应检查出口管制、许可证或许可触发点、制裁筛查、原产地/再出口或转运风险，以及出口报关资料。`,
        source_citation: seed.source_citation,
        source_url: seed.source_url,
        effective_date: EFFECTIVE_DATE,
        status: 'ACTIVE',
        direction: 'export',
        country: seed.country,
        route_focus: 'export',
        risk_level: seed.risk_level,
        hs_code: '8542',
        related_hs_codes: COMMON_HS_CODES,
        related_keywords: [
            seed.country.toLowerCase(),
            seed.label.toLowerCase(),
            ...COMMON_PRODUCT_KEYWORDS
        ],
        related_cases: [seed.case_id],
        display_order: 44,
        pipeline_source: 'coverage-baseline',
        checklist: [
            {
                id: 'Export control::Classify item and screen destination',
                phase: 'Export control',
                task: 'Classify item and screen destination',
                desc: 'Check export-control classification, license or permit triggers, restricted parties, sanctions exposure, and end-use/end-user red flags.',
                source: 'official-source'
            },
            {
                id: 'Origin / re-export::Document origin and controlled content',
                phase: 'Origin / re-export',
                task: 'Document origin and controlled content',
                desc: 'Keep origin, bill-of-materials, controlled-content, re-export, transshipment, and customer-routing evidence aligned with the shipment route.',
                source: 'official-source'
            },
            {
                id: 'Export customs::Prepare outbound declaration data',
                phase: 'Export customs',
                task: 'Prepare outbound declaration data',
                desc: 'Align HS classification, invoice value, origin, license/permit numbers, exporter records, consignee/end-user data, and export declaration fields.',
                source: 'official-source'
            }
        ]
    };
}

function buildOriginExportCase(seed) {
    return {
        case_id: seed.case_id,
        title: `${seed.label} origin-export baseline for electronics and advanced technology`,
        date: EFFECTIVE_DATE,
        category: 'Export Control / Customs / Origin',
        direction: 'export',
        country: seed.country,
        summary: `${seed.label}-origin exports should be screened for export-control classification, license or permit triggers, sanctions and end-use/end-user exposure, origin/re-export or transshipment risks, and outbound customs declaration data before shipment.`,
        source_url: seed.source_url,
        related_tags: [seed.tag_id],
        related_keywords: [
            seed.label,
            'export control',
            'export declaration',
            'origin',
            're-export',
            'transshipment',
            'electronics',
            'semiconductor'
        ]
    };
}

function buildDestinationImportTag(seed) {
    return {
        tag_id: seed.tag_id,
        category: 'IMPORT_REG',
        category_label: 'Import Regulation',
        tag_type: 'CHECK_REQUIRED',
        short_name: seed.short_name,
        short_description: `${seed.label}-destination imports require market-access, customs, labeling, wireless, battery, and electrical-safety review.`,
        description: `Imports into ${seed.label} of electronics, wireless devices, chargers, batteries, energy-storage systems, photovoltaic products, semiconductor items, and ICT equipment should be checked for customs import declaration, tariff classification, product safety or electrical certification, wireless/telecom approval, battery and ESS safety evidence, labeling or consumer information, and importer record obligations before market entry.`,
        content_en: `${seed.label}-destination imports should be checked for customs declaration, tariff classification, safety certification, wireless/telecom approval, battery/ESS evidence, labeling, and importer records.`,
        content_zh: `进入${seed.label}的电子、无线、充电器、电池、储能、新能源和半导体产品，应检查进口报关、税则归类、安全认证、无线/电信准入、电池/储能资料、标签和进口商记录。`,
        source_citation: seed.source_citation,
        source_url: seed.source_url,
        effective_date: EFFECTIVE_DATE,
        status: 'ACTIVE',
        direction: 'export',
        country: seed.country,
        route_focus: 'import',
        risk_level: seed.risk_level,
        hs_code: '8517',
        related_hs_codes: COMMON_HS_CODES,
        related_keywords: [
            seed.country.toLowerCase(),
            seed.label.toLowerCase(),
            ...COMMON_PRODUCT_KEYWORDS,
            'import declaration',
            'tariff classification',
            'labeling',
            'consumer information',
            'electrical safety',
            'wireless telecom',
            'battery safety'
        ],
        related_cases: [seed.case_id],
        display_order: 42,
        pipeline_source: 'coverage-baseline',
        checklist: [
            {
                id: 'Import customs::Prepare destination import declaration',
                phase: 'Import customs',
                task: 'Prepare destination import declaration',
                desc: 'Confirm HS classification, customs value, origin, importer record, invoice, packing list, and license/certificate fields before clearance.',
                source: 'official-source'
            },
            {
                id: 'Market access::Check certification and labeling scope',
                phase: 'Market access',
                task: 'Check certification and labeling scope',
                desc: 'Review wireless/telecom approval, electrical safety, battery/ESS evidence, labeling, manual, and model-coverage requirements.',
                source: 'official-source'
            }
        ]
    };
}

function buildDestinationImportCase(seed) {
    return {
        case_id: seed.case_id,
        title: `${seed.label} destination-import baseline for electronics and energy products`,
        date: EFFECTIVE_DATE,
        category: 'Import Regulation / Market Access',
        direction: 'export',
        country: seed.country,
        summary: `${seed.label}-bound imports should be screened for customs declaration, tariff classification, safety certification, wireless or telecom approval, battery/ESS evidence, labeling, and importer record obligations before market entry.`,
        source_url: seed.source_url,
        related_tags: [seed.tag_id],
        related_keywords: [
            seed.label,
            'import declaration',
            'customs',
            'tariff classification',
            'wireless',
            'electrical safety',
            'battery',
            'labeling',
            'electronics'
        ]
    };
}

function buildOriginExportCustomsTag(seed) {
    return {
        tag_id: seed.tag_id,
        category: 'IMPORT_REG',
        category_label: 'Export Customs',
        tag_type: 'CHECK_REQUIRED',
        short_name: seed.short_name,
        short_description: `${seed.label}-origin exports require customs export declaration and origin-document review.`,
        description: `Exports from ${seed.label} should align export customs declaration data, HS classification, invoice value, origin evidence, permits or certificates, exporter records, and re-export/transshipment documentation before shipment.`,
        content_en: `${seed.label}-origin exports should align customs export declaration data, HS classification, invoice value, origin evidence, permits, exporter records, and re-export/transshipment documentation.`,
        content_zh: `从${seed.label}出口应核对出口报关资料、HS 归类、发票金额、原产地证明、许可证/证书、出口商记录及再出口/转运文件。`,
        source_citation: seed.source_citation,
        source_url: seed.source_url,
        effective_date: EFFECTIVE_DATE,
        status: 'ACTIVE',
        direction: 'export',
        country: seed.country,
        route_focus: 'export',
        risk_level: seed.risk_level,
        hs_code: '8542',
        related_hs_codes: COMMON_HS_CODES,
        related_keywords: [
            seed.country.toLowerCase(),
            seed.label.toLowerCase(),
            ...COMMON_PRODUCT_KEYWORDS,
            'export declaration',
            'outbound customs',
            'customs export',
            'permit',
            'certificate of origin',
            'form d',
            'rcep'
        ],
        related_cases: [seed.case_id],
        display_order: 44,
        pipeline_source: 'coverage-baseline',
        checklist: [
            {
                id: 'Export customs::Prepare export declaration and origin file',
                phase: 'Export customs',
                task: 'Prepare export declaration and origin file',
                desc: 'Align HS classification, invoice value, origin certificate, permits/certificates, exporter records, consignee data, and export declaration fields.',
                source: 'official-source'
            }
        ]
    };
}

function buildOriginExportCustomsCase(seed) {
    return {
        case_id: seed.case_id,
        title: `${seed.label} export customs baseline for electronics routes`,
        date: EFFECTIVE_DATE,
        category: 'Export Customs / Origin',
        direction: 'export',
        country: seed.country,
        summary: `${seed.label}-origin exports should align export declaration data, HS classification, origin evidence, permits or certificates, exporter records, and re-export/transshipment documentation before shipment.`,
        source_url: seed.source_url,
        related_tags: [seed.tag_id],
        related_keywords: [
            seed.label,
            'export declaration',
            'customs',
            'origin',
            'permit',
            'electronics'
        ]
    };
}

function buildAttachedCase(seed) {
    return {
        case_id: seed.case_id,
        title: seed.title,
        date: EFFECTIVE_DATE,
        category: seed.category,
        direction: 'export',
        country: seed.country,
        summary: seed.summary,
        source_url: seed.source_url,
        related_tags: [seed.tag_id],
        related_keywords: seed.related_keywords
    };
}

function main() {
    const tags = readJson(TAGS_PATH);
    const cases = readJson(CASES_PATH);
    let addedTags = 0;
    let addedCases = 0;

    for (const seed of ORIGIN_EXPORT_BASELINES) {
        if (!hasId(tags, 'tag_id', seed.tag_id)) {
            tags.push(buildOriginExportTag(seed));
            addedTags += 1;
        }
        if (!hasId(cases, 'case_id', seed.case_id)) {
            cases.push(buildOriginExportCase(seed));
            addedCases += 1;
        }
    }

    for (const seed of DESTINATION_IMPORT_BASELINES) {
        if (!hasId(tags, 'tag_id', seed.tag_id)) {
            tags.push(buildDestinationImportTag(seed));
            addedTags += 1;
        }
        if (!hasId(cases, 'case_id', seed.case_id)) {
            cases.push(buildDestinationImportCase(seed));
            addedCases += 1;
        }
    }

    for (const seed of DESTINATION_IMPORT_CUSTOMS_BASELINES) {
        if (!hasId(tags, 'tag_id', seed.tag_id)) {
            tags.push(buildDestinationImportTag(seed));
            addedTags += 1;
        }
        if (!hasId(cases, 'case_id', seed.case_id)) {
            cases.push(buildDestinationImportCase(seed));
            addedCases += 1;
        }
    }

    for (const seed of ORIGIN_EXPORT_CUSTOMS_BASELINES) {
        if (!hasId(tags, 'tag_id', seed.tag_id)) {
            tags.push(buildOriginExportCustomsTag(seed));
            addedTags += 1;
        }
        if (!hasId(cases, 'case_id', seed.case_id)) {
            cases.push(buildOriginExportCustomsCase(seed));
            addedCases += 1;
        }
    }

    for (const seed of EXISTING_TAG_CASE_ATTACHMENTS) {
        const tag = tags.find((item) => item.tag_id === seed.tag_id);
        if (tag) {
            tag.related_cases = Array.from(new Set([...(tag.related_cases || []), seed.case_id]));
        }
        if (!hasId(cases, 'case_id', seed.case_id)) {
            cases.push(buildAttachedCase(seed));
            addedCases += 1;
        }
    }

    writeJson(TAGS_PATH, tags);
    writeJson(CASES_PATH, cases);
    console.log(`Seeded route coverage baselines: ${addedTags} tag(s), ${addedCases} case(s).`);
}

main();
