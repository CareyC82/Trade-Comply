/**
 * Alibaba FC bundle loader — verifies packaged lib/* files before require().
 * Keeps index.js bootable for AI/feedback routes even if HS libs fail (returns 503 on classify).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FC_LIB_FILES = [
    'lib/parse-model-json.js',
    'lib/hscode-dual.js',
    'lib/industry-checklist-baseline.js',
    'lib/checklist.js',
    'lib/country-registry.js',
    'lib/fc-deps.js'
];

const FC_DATA_FILES = [
    'data/country-registry.json'
];

function getFcRoot() {
    return path.join(__dirname, '..');
}

function verifyFcBundle(rootDir = getFcRoot()) {
    const missing = [];
    for (const rel of [...FC_LIB_FILES, ...FC_DATA_FILES]) {
        const abs = path.join(rootDir, rel);
        if (!fs.existsSync(abs)) {
            missing.push(rel);
        }
    }
    if (missing.length > 0) {
        console.error('=== FC BOOT FAILED: missing bundled files ===');
        missing.forEach((item) => console.error(`  MISSING: ${item}`));
        const error = new Error(`Missing FC dependencies: ${missing.join(', ')}`);
        error.code = 'FC_BUNDLE_INCOMPLETE';
        throw error;
    }
    console.log(`=== FC BUNDLE OK: ${FC_LIB_FILES.length} lib modules verified under ${rootDir} ===`);
}

let cachedMods = null;

function loadFcLibModules(rootDir = getFcRoot()) {
    if (cachedMods) {
        return cachedMods;
    }

    verifyFcBundle(rootDir);

    const parseModelJson = require(path.join(rootDir, 'lib/parse-model-json'));
    const hscodeDual = require(path.join(rootDir, 'lib/hscode-dual'));
    const industryBaseline = require(path.join(rootDir, 'lib/industry-checklist-baseline'));
    const checklist = require(path.join(rootDir, 'lib/checklist'));

    cachedMods = {
        parseHsCodeClassificationPayload: parseModelJson.parseHsCodeClassificationPayload,
        enrichClassification: hscodeDual.enrichClassification,
        buildHsCodeUserPrompt: hscodeDual.buildHsCodeUserPrompt,
        buildHsCodeSystemPrompt: hscodeDual.buildHsCodeSystemPrompt,
        normalizeCountryCode: hscodeDual.normalizeCountryCode,
        ensureIndustryChecklist: industryBaseline.ensureIndustryChecklist,
        buildSessionChecklist: checklist.buildSessionChecklist
    };

    console.log('=== FC LIB LOAD OK: hscode-dual + checklist modules ready ===');
    return cachedMods;
}

let cachedHsCodeSystemPrompt = null;

function getHsCodeSystemPrompt() {
    if (!cachedHsCodeSystemPrompt) {
        cachedHsCodeSystemPrompt = loadFcLibModules().buildHsCodeSystemPrompt();
    }
    return cachedHsCodeSystemPrompt;
}

function bundleIncompleteResponse(headers) {
    return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
            ok: false,
            error: 'HS classification modules are missing on the server. Redeploy FC with scripts/package-fc.sh (lib/hscode-dual.js must be in the zip).',
            code: 'FC_BUNDLE_INCOMPLETE'
        })
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FC_LIB_FILES,
        FC_DATA_FILES,
        verifyFcBundle,
        loadFcLibModules,
        getHsCodeSystemPrompt,
        bundleIncompleteResponse
    };
}
