#!/usr/bin/env node
/**
 * Ensure each canonical region has >=2 electronics/semiconductor baseline tags in data/tags.json.
 */

const fs = require('fs');
const path = require('path');
const { getCanonicalCodes } = require('../lib/country-registry');

const ROOT = path.join(__dirname, '..');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');

const SEMI_KEYWORDS = [
    'semiconductor', 'chip', 'integrated circuit', '8542', '8541', '8471', '8517',
    'telecommunication', 'electronic', 'wafer', 'pcb', 'processor'
];

const BASELINES = [
    {
        tag_id: 'CL-RU-001',
        country: 'RU',
        direction: 'export',
        short_name: '[RU Export Control]',
        short_description: 'Russia-bound dual-use electronics export screening baseline',
        description: 'Exports of semiconductors, integrated circuits, and telecommunications equipment to Russia require enhanced dual-use and sanctions screening, including restricted party checks and embargoed component reviews.',
        source_citation: 'MOFCOM / BIS cross-reference baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8541', '8517']
    },
    {
        tag_id: 'CL-RU-002',
        country: 'RU',
        direction: 'export',
        short_name: '[RU Sanctions Risk]',
        short_description: 'Electronic component embargo and end-use certification for Russia',
        description: 'High-risk Russia shipments of advanced computing, AI accelerators, and fab-related equipment may trigger license requirements and end-use statements under international sanctions frameworks.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'MATCHED',
        related_hs_codes: ['8471', '8486', '8542']
    },
    {
        tag_id: 'CL-ASEAN-001',
        country: 'ASEAN',
        direction: 'export',
        short_name: '[ASEAN Origin]',
        short_description: 'ASEAN electronics export — rules of origin documentation',
        description: 'Shipments to Vietnam or Malaysia involving semiconductor assemblies should maintain origin documentation to defend against transshipment and anti-circumvention inquiries.',
        source_citation: 'Trade Comply regional baseline',
        category: 'OTHER',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8517']
    },
    {
        tag_id: 'CL-ASEAN-002',
        country: 'ASEAN',
        direction: 'export',
        short_name: '[ASEAN Re-export]',
        short_description: 'ASEAN hub re-export controls for ICs and modules',
        description: 'Electronics routed through ASEAN distribution hubs may face re-export licensing if US- or EU-controlled content exceeds de minimis thresholds.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8541', '8542', '9030']
    },
    {
        tag_id: 'CL-TW-001',
        country: 'TW',
        direction: 'import',
        short_name: '[TW Semiconductor]',
        short_description: 'Taiwan-origin semiconductor import licensing baseline',
        description: 'Imports from Taiwan of semiconductor manufacturing equipment, lithography tools, and advanced wafers may require cross-strait technology licensing review.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8486', '8542']
    },
    {
        tag_id: 'CL-TW-002',
        country: 'TW',
        direction: 'import',
        short_name: '[TW IC Import]',
        short_description: 'Taiwan-origin integrated circuits inbound compliance',
        description: 'Taiwan-sourced ICs and modules imported into China should be screened for encryption, dual-use, and cross-strait technology transfer restrictions.',
        source_citation: 'Trade Comply regional baseline',
        category: 'OTHER',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8541']
    },
    {
        tag_id: 'CL-JP-001',
        country: 'JP',
        direction: 'import',
        short_name: '[JP Equipment]',
        short_description: 'Japan-origin semiconductor equipment import controls',
        description: 'Japan-origin fab equipment and precision instruments under HS 8486/8542 may require import permits and end-user statements for China inbound clearance.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8486', '8542']
    },
    {
        tag_id: 'CL-JP-002',
        country: 'JP',
        direction: 'import',
        short_name: '[JP Components]',
        short_description: 'Japan-origin electronic components import baseline',
        description: 'Passive and active components from Japan used in telecommunications and computing products should be checked for export-restricted content re-imported into China.',
        source_citation: 'Trade Comply regional baseline',
        category: 'OTHER',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8541', '8517', '8542']
    },
    {
        tag_id: 'CL-KR-001',
        country: 'KR',
        direction: 'import',
        short_name: '[KR Memory IC]',
        short_description: 'Korea-origin memory and semiconductor import screening',
        description: 'Korea-origin DRAM, NAND, and advanced logic ICs imported into China may be subject to end-use and technology control reviews.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8541']
    },
    {
        tag_id: 'CL-KR-002',
        country: 'KR',
        direction: 'import',
        short_name: '[KR Fab Tools]',
        short_description: 'Korea-origin fab tool import compliance baseline',
        description: 'Semiconductor production equipment from Korea requires verification of export licenses issued by Korea and China import registration.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8486', '8542']
    },
    {
        tag_id: 'CL-GLOBAL-001',
        country: 'GLOBAL',
        direction: 'export',
        short_name: '[General Export]',
        short_description: 'General China electronics export declaration baseline',
        description: 'All electronics exports should maintain accurate HS classification, shipping documentation, and technology export compliance records for unspecified destinations.',
        source_citation: 'Trade Comply regional baseline',
        category: 'OTHER',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8517', '8471']
    },
    {
        tag_id: 'CL-GLOBAL-002',
        country: 'GLOBAL',
        direction: 'export',
        short_name: '[General Telecom]',
        short_description: 'Telecommunications equipment export documentation baseline',
        description: 'Radio transmission apparatus and network equipment exports require consistent HS codes and end-user statements across non-listed destinations.',
        source_citation: 'Trade Comply regional baseline',
        category: 'OTHER',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8517', '8525', '8542']
    },
    {
        tag_id: 'CL-US-901',
        country: 'US',
        direction: 'export',
        short_name: '[US BIS Baseline]',
        short_description: 'US-bound advanced computing export license awareness',
        description: 'Exports to the United States involving advanced AI accelerators, GPUs, or EDA tools may intersect with US BIS licensing and Entity List restrictions on re-exports from China.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8471']
    },
    {
        tag_id: 'CL-EU-901',
        country: 'EU',
        direction: 'export',
        short_name: '[EU Dual-use]',
        short_description: 'EU-bound electronics dual-use export screening',
        description: 'Shipments to the European Union with semiconductor content should be screened against EU dual-use list categories and CBAM reporting for embodied aluminum.',
        source_citation: 'Trade Comply regional baseline',
        category: 'EXPORT_CTRL',
        tag_type: 'CHECK_REQUIRED',
        related_hs_codes: ['8542', '8541']
    }
];

function isSemiTag(tag) {
    const blob = JSON.stringify(tag).toLowerCase();
    return SEMI_KEYWORDS.some((kw) => blob.includes(kw.toLowerCase()));
}

function countRegionalSemi(tags, country) {
    return tags.filter((tag) => (tag.country || 'GLOBAL') === country && isSemiTag(tag)).length;
}

function buildTag(def) {
    return {
        tag_id: def.tag_id,
        category: def.category,
        category_label: def.category === 'EXPORT_CTRL' ? 'Export Control' : 'Other Requirements',
        tag_type: def.tag_type,
        short_name: def.short_name,
        short_description: def.short_description,
        description: def.description,
        content_en: def.description,
        content_zh: def.description,
        source_citation: def.source_citation,
        source_url: 'https://www.mofcom.gov.cn/',
        effective_date: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
        direction: def.direction,
        country: def.country,
        risk_level: def.tag_type === 'MATCHED' ? 'High' : 'Medium',
        hs_code: def.related_hs_codes[0],
        related_hs_codes: def.related_hs_codes,
        related_keywords: [
            ...def.related_hs_codes,
            'semiconductor',
            'electronic',
            'chip',
            def.country.toLowerCase()
        ],
        related_cases: [],
        display_order: 45,
        pipeline_source: 'regional-baseline'
    };
}

function main() {
    const tags = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
    const existingIds = new Set(tags.map((t) => t.tag_id));
    const added = [];

    for (const def of BASELINES) {
        if (existingIds.has(def.tag_id)) {
            continue;
        }
        const country = def.country;
        if (countRegionalSemi(tags, country) >= 2) {
            continue;
        }
        tags.push(buildTag(def));
        existingIds.add(def.tag_id);
        added.push(def.tag_id);
    }

    fs.writeFileSync(TAGS_PATH, `${JSON.stringify(tags, null, 2)}\n`, 'utf8');

    console.log('Regional baseline seed complete.');
    for (const code of getCanonicalCodes()) {
        console.log(`  ${code}: ${countRegionalSemi(tags, code)} electronics/semiconductor tag(s)`);
    }
    if (added.length) {
        console.log(`Added: ${added.join(', ')}`);
    } else {
        console.log('No new tags required.');
    }
}

main();
