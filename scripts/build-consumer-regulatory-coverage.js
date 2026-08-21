'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'consumer-regulatory-coverage.json');
const MARKETS = ['US', 'EU', 'JP', 'SG'];

function buildReport() {
    const products = models.listProducts().filter((item) => item.id !== 'wearable_other');
    const cells = products.flatMap((product) => MARKETS.map((market) => {
        const profile = { productType: product.id, ...(product.defaults || {}) };
        const requirements = engine.marketRequirements(market, profile);
        const marketCoverage = engine.marketCoverageForProfile(market, profile, true, requirements);
        const unsourced = requirements
            .filter((item) => item.id !== 'classification' && !(item.sources || []).length)
            .map((item) => item.id);
        return {
            product_id: product.id,
            product: product.label,
            market,
            coverage: marketCoverage.level,
            requirements: requirements.map((item) => item.id),
            official_source_ids: Array.from(new Set(requirements.flatMap((item) => (item.sources || []).map((source) => source.id)))).sort(),
            unsourced_requirements: unsourced
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
                cells_with_unsourced_requirements: rows.filter((cell) => cell.unsourced_requirements.length).length
            }];
        })),
        cells
    };
}

if (require.main === module) {
    fs.writeFileSync(OUTPUT, `${JSON.stringify(buildReport(), null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

module.exports = { buildReport };
