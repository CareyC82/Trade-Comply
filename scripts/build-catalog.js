#!/usr/bin/env node
/**
 * Build data/catalog.json from tags, cases, categories, and scope-keywords.json.
 * Usage:
 *   node scripts/build-catalog.js
 *   node scripts/build-catalog.js --check
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'catalog.json');

require(path.join(ROOT, 'js', 'catalog.js'));

const {
    validateCatalogData,
    serializeScopeCatalog,
    catalogArtifactsMatch
} = globalThis.Catalog;

function readJson(relativePath, fallback) {
    const fullPath = path.join(ROOT, relativePath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function loadSources() {
    return {
        tags: readJson('data/tags.json', []),
        cases: readJson('data/cases.json', []),
        categories: readJson('data/categories.json', []),
        scopeConfig: readJson('data/scope-keywords.json', {}),
        catalogSchema: readJson('data/catalog.schema.json', {})
    };
}

function buildCatalogArtifact(sources) {
    const validation = validateCatalogData(sources);
    if (!validation.ok) {
        validation.errors.forEach(message => console.error(`ERROR: ${message}`));
        throw new Error('Catalog validation failed before build.');
    }

    validation.warnings.forEach(message => console.warn(`WARN: ${message}`));

    const tagIds = sources.tags.map(tag => tag.tag_id).filter(Boolean);
    const caseIds = sources.cases.map(caseItem => caseItem.case_id).filter(Boolean);

    return serializeScopeCatalog({
        catalog: validation.catalog,
        catalogSchema: sources.catalogSchema,
        tagIds,
        caseIds,
        generatedAt: new Date().toISOString()
    });
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const sources = loadSources();
    const artifact = buildCatalogArtifact(sources);

    if (checkOnly) {
        if (!fs.existsSync(OUTPUT_PATH)) {
            console.error('ERROR: data/catalog.json is missing. Run: node scripts/build-catalog.js');
            process.exit(1);
        }

        const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
        if (!catalogArtifactsMatch(existing, artifact)) {
            console.error('ERROR: data/catalog.json is out of date. Run: node scripts/build-catalog.js');
            process.exit(1);
        }

        console.log('Catalog artifact check passed.');
        console.log(`Scope keywords: ${artifact.stats.total}`);
        return;
    }

    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
    console.log(`Scope keywords: ${artifact.stats.total}`);
    console.log(`Tag IDs: ${artifact.tag_ids.length}`);
    console.log(`Case IDs: ${artifact.case_ids.length}`);
}

main();
