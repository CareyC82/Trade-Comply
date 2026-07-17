#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_ID, atomicWriteJson, mergePayload, normalizeRow, parseOfficialFile } = require('../lib/china-customs-flow');
const { isManifestFileName, loadExportManifest, loadInbox } = require('./update-china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');

function usage() {
    console.error('Usage: node scripts/import-china-customs-flow.js <official-export|directory|manifest.json>');
    console.error('CSV/Excel requires month, industry, and explicit USD import/export values (wide or direction/value format).');
}

const importPayload = mergePayload;

async function loadImport(inputPath) {
    const absolutePath = path.resolve(inputPath);
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
        const loaded = await loadInbox(absolutePath);
        if (!loaded) throw new Error(`No supported China Customs exports found in ${inputPath}`);
        return loaded.payload;
    }
    if (isManifestFileName(path.basename(absolutePath))) {
        return (await loadExportManifest(absolutePath)).payload;
    }
    return parseOfficialFile(absolutePath);
}

async function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        usage();
        process.exitCode = 1;
        return;
    }
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const incoming = await loadImport(inputPath);
    const next = importPayload(current, incoming);
    atomicWriteJson(DATA_PATH, next);
    console.log(`Imported China Customs industry data through ${next.sources.find((row) => row.id === SOURCE_ID)?.synchronized_through}.`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { importPayload, loadImport, main, normalizeRow };
