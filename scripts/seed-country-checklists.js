#!/usr/bin/env node
/**
 * Attach baseline checklist[] to regional tags in data/tags.json.
 */

const fs = require('fs');
const path = require('path');
const { buildSessionChecklist } = require('../lib/checklist');

const ROOT = path.join(__dirname, '..');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');

const REGIONAL_PREFIXES = ['CL-RU-', 'CL-ASEAN-', 'CL-TW-', 'CL-JP-', 'CL-KR-'];

function main() {
    const tags = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
    let updated = 0;

    tags.forEach((tag) => {
        if (!REGIONAL_PREFIXES.some((prefix) => String(tag.tag_id || '').startsWith(prefix))) {
            return;
        }
        const country = tag.country || 'GLOBAL';
        const direction = tag.direction === 'import' ? 'import' : 'export';
        const checklist = buildSessionChecklist({
            tags: [],
            aiChecklist: [],
            country,
            direction,
            includeBaseline: true
        }).slice(0, 4);
        tag.checklist = checklist;
        updated += 1;
    });

    fs.writeFileSync(TAGS_PATH, `${JSON.stringify(tags, null, 2)}\n`, 'utf8');
    console.log(`Seeded checklist on ${updated} regional tag(s).`);
}

main();
