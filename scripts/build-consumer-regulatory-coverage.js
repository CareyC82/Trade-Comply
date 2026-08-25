'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'consumer-regulatory-coverage.json');
const SNAPSHOTS = path.join(ROOT, 'data', 'consumer-regulatory-snapshots.json');
const MARKETS = ['US', 'EU', 'JP', 'SG'];

function buildReport() {
    const snapshotPayload = fs.existsSync(SNAPSHOTS) ? JSON.parse(fs.readFileSync(SNAPSHOTS, 'utf8')) : { sources: [] };
    const sourceStatus = Object.fromEntries((snapshotPayload.sources || []).map((source) => [source.id, source.status]));
    const products = models.listProducts().filter((item) => item.id !== 'wearable_other');
    const cells = products.flatMap((product) => MARKETS.map((market) => {
        const profile = { productType: product.id, ...(product.defaults || {}) };
        const requirements = engine.marketRequirements(market, profile);
        const marketCoverage = engine.marketCoverageForProfile(market, profile, true, requirements);
        const unsourced = requirements
            .filter((item) => item.id !== 'classification' && !(item.sources || []).length)
            .map((item) => item.id);
        const officialSourceIds = Array.from(new Set(requirements.flatMap((item) => (item.sources || []).map((source) => source.id)))).sort();
        const degradedSources = officialSourceIds.filter((id) => sourceStatus[id] === 'last_good_degraded');
        const materialUnknowns = engine.materialQuestionKeys(product.id).filter((key) => profile[key] === engine.UNKNOWN).slice(0, 6);
        return {
            product_id: product.id,
            product: product.label,
            market,
            coverage: marketCoverage.level,
            requirements: requirements.map((item) => item.id),
            official_source_ids: officialSourceIds,
            unsourced_requirements: unsourced,
            degraded_source_ids: degradedSources,
            material_attribute_gaps: materialUnknowns,
            issues: [
                ...unsourced.map((id) => `unsourced_requirement:${id}`),
                ...degradedSources.map((id) => `last_good_source:${id}`),
                ...(marketCoverage.level === 'limited' ? ['limited_market_coverage'] : [])
            ]
        };
    }));
    return {
        schema_version: 1,
        reviewed_at: models.reviewedAt,
        basis: 'Maintained product models and official-source rules; this is not derived from user-search frequency.',
        markets: MARKETS,
        product_count: products.length,
        matrix_cell_count: cells.length,
        market_summary: Object.fromEntries(MARKETS.map((market) => {
            const rows = cells.filter((cell) => cell.market === market);
            return [market, {
                deep: rows.filter((cell) => cell.coverage === 'deep').length,
                limited: rows.filter((cell) => cell.coverage === 'limited').length,
                cells_with_unsourced_requirements: rows.filter((cell) => cell.unsourced_requirements.length).length,
                cells_using_last_good_sources: rows.filter((cell) => cell.degraded_source_ids.length).length,
                limited_cells: rows.filter((cell) => cell.coverage === 'limited').length
            }];
        })),
        remediation_queue: cells.filter((cell) => cell.issues.length).map((cell) => ({
            product_id: cell.product_id, market: cell.market, issues: cell.issues,
            next_action: cell.unsourced_requirements.length ? 'Add a maintained official source before deepening the conclusion.'
                : cell.degraded_source_ids.length ? 'Restore automated official capture or complete the scheduled manual source review.'
                    : 'Keep the result explicitly limited until product-specific official evidence is maintained.'
        })),
        cells
    };
}

if (require.main === module) {
    fs.writeFileSync(OUTPUT, `${JSON.stringify(buildReport(), null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

module.exports = { buildReport };
