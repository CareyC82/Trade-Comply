#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_ID, atomicWriteJson, mergePayload, normalizeRow, parseOfficialFile } = require('../lib/china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');

function usage() {
    console.error('Usage: node scripts/import-china-customs-flow.js <official-export.json|csv|xlsx|xls>');
    console.error('CSV/Excel requires month, industry, and explicit USD import/export values (wide or direction/value format).');
}

const importPayload = mergePayload;

if (require.main === module) {
    const inputPath = process.argv[2];
    if (!inputPath) {
        usage();
        process.exit(1);
    }
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const incoming = parseOfficialFile(path.resolve(inputPath));
    const next = importPayload(current, incoming);
    atomicWriteJson(DATA_PATH, next);
    console.log(`Imported China Customs industry data through ${next.sources.find((row) => row.id === SOURCE_ID)?.synchronized_through}.`);
}

module.exports = { importPayload, normalizeRow };
