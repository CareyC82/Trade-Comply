#!/usr/bin/env node
/**
 * Validate tags/cases/categories against catalog.schema.json and scope-keywords.json.
 * Usage: node scripts/validate-catalog.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js', 'catalog.js'));

const {
    validateCatalogData,
    serializeScopeCatalog,
    catalogArtifactsMatch
} = globalThis.Catalog;

function readJson(relativePath, fallback) {
    const fullPath = path.join(ROOT, relativePath);
    try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
        if (fallback !== undefined) {
            console.warn(`Warning: could not read ${relativePath}: ${error.message}`);
            return fallback;
        }
        throw error;
    }
}

function main() {
    const tags = readJson('data/tags.json', []);
    const cases = readJson('data/cases.json', []);
    const categories = readJson('data/categories.json', []);
    const scopeConfig = readJson('data/scope-keywords.json', {});
    const catalogSchema = readJson('data/catalog.schema.json', {});

    const result = validateCatalogData({
        tags,
        cases,
        categories,
        scopeConfig,
        catalogSchema
    });

    result.warnings.forEach(message => console.warn(`WARN: ${message}`));

    if (!result.ok) {
        result.errors.forEach(message => console.error(`ERROR: ${message}`));
        process.exit(1);
    }

    console.log('Catalog validation passed.');
    console.log(`Scope keywords: ${result.catalog.stats.total}`);
    console.log(`  from tags: ${result.catalog.stats.fromTags}`);
    console.log(`  from cases: ${result.catalog.stats.fromCases}`);
    console.log(`  from categories: ${result.catalog.stats.fromCategories}`);
    console.log(`  supplemental/compliance adds: ${result.catalog.stats.supplemental + result.catalog.stats.compliance}`);
    console.log(`Semiconductor boost keywords: ${result.catalog.semiconductorKeywords.length}`);

    const tagIds = tags.map(tag => tag.tag_id).filter(Boolean);
    const caseIds = cases.map(caseItem => caseItem.case_id).filter(Boolean);
    const freshArtifact = serializeScopeCatalog({
        catalog: result.catalog,
        catalogSchema,
        tagIds,
        caseIds
    });

    const catalogPath = path.join(ROOT, 'data', 'catalog.json');
    if (!fs.existsSync(catalogPath)) {
        console.warn('WARN: data/catalog.json is missing. Run: node scripts/build-catalog.js');
        return;
    }

    const existingArtifact = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    if (!catalogArtifactsMatch(existingArtifact, freshArtifact)) {
        console.error('ERROR: data/catalog.json is out of date. Run: node scripts/build-catalog.js');
        process.exit(1);
    }

    console.log('Catalog artifact check passed.');
}

main();
