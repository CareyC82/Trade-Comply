'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'consumer-regulatory-coverage.json');
const SNAPSHOTS = path.join(ROOT, 'data', 'consumer-regulatory-snapshots.json');
const MARKETS = ['US', 'EU', 'JP', 'SG'];
const ATTRIBUTE_SCENARIOS = [
    { id: 'wired_no_battery', attributes: { bluetooth: false, wifi: false, cellular: false, radioTransmitter: false, battery: false, mainsPowered: false, cameraMic: false, childUse: false, medicalClaim: false } },
    { id: 'wireless_battery', attributes: { bluetooth: true, wifi: true, cellular: false, radioTransmitter: true, battery: true, mainsPowered: false, cameraMic: false, childUse: false, medicalClaim: false } },
    { id: 'cellular_camera', attributes: { bluetooth: false, wifi: false, cellular: true, battery: true, mainsPowered: false, cameraMic: true, childUse: false, medicalClaim: false } },
    { id: 'ac_mains', attributes: { bluetooth: false, wifi: false, cellular: false, battery: false, mainsPowered: true, ratedVoltage: 230, ratedPower: 45, cameraMic: false, childUse: false, medicalClaim: false } },
    { id: 'child_directed', attributes: { bluetooth: true, battery: true, childUse: true, medicalClaim: false } },
    { id: 'medical_claim', attributes: { bluetooth: true, battery: true, childUse: false, medicalClaim: true } },
    { id: 'unknown_material_facts', attributes: {} }
];

function buildAttributeScenarioAudit(products) {
    const rows = products.flatMap(product => MARKETS.flatMap(market => ATTRIBUTE_SCENARIOS.map(scenario => {
        const profile = { productType: product.id, ...(product.defaults || {}), ...scenario.attributes };
        const requirements = engine.marketRequirements(market, profile);
        const ids = requirements.map(item => item.id);
        const issues = [];
        if (scenario.id === 'wired_no_battery' && ids.some(id => ['fcc', 'red', 'red_cybersecurity', 'jp_radio', 'sg_imda', 'battery', 'eu_battery_future'].includes(id))) issues.push('negative_attribute_leak');
        if (scenario.id === 'wireless_battery' && (!ids.includes('battery') || !ids.some(id => ({ US: ['fcc'], EU: ['red'], JP: ['jp_radio'], SG: ['sg_imda'] }[market] || []).includes(id)))) issues.push('wireless_or_battery_requirement_missing');
        const assessment = engine.assess({ description: product.label, market, origin: 'CN', platform: 'Other', attributes: profile, assessmentMode: 'quick', blockingQuestionKeys: [] });
        if (['child_directed', 'medical_claim'].includes(scenario.id) && assessment.sellerConclusion.code !== 'high_risk') issues.push('specialist_review_not_triggered');
        return { product_id: product.id, market, scenario: scenario.id, requirement_ids: ids, conclusion: assessment.sellerConclusion.code, issues };
    })));
    return { scenario_count: ATTRIBUTE_SCENARIOS.length, matrix_cell_count: rows.length, issue_count: rows.reduce((sum, row) => sum + row.issues.length, 0), issues: rows.filter(row => row.issues.length) };
}

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
        const bindingRequirements = requirements.filter((item) => ['mandatory', 'scope_check'].includes(item.requirementClass));
        const productSpecificRequirements = bindingRequirements.filter((item) => item.id !== 'classification');
        const evidenceDepth = productSpecificRequirements.length
            ? 'product_and_attribute_specific'
            : bindingRequirements.length ? 'baseline_market_safety' : 'advisory_only';
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
            evidence_depth: evidenceDepth,
            binding_requirement_ids: bindingRequirements.map((item) => item.id),
            product_specific_requirement_ids: productSpecificRequirements.map((item) => item.id),
            coverage_limitation: ['JP', 'SG'].includes(market) && evidenceDepth === 'baseline_market_safety'
                ? 'Only baseline market-safety evidence applies to the current known attributes; confirm exact model, power and radio configuration before relying on the result.'
                : null,
            material_attribute_gaps: materialUnknowns,
            issues: [
                ...unsourced.map((id) => `unsourced_requirement:${id}`),
                ...degradedSources.map((id) => `last_good_source:${id}`),
                ...(marketCoverage.level === 'limited' ? ['limited_market_coverage'] : []),
                ...(['JP', 'SG'].includes(market) && evidenceDepth === 'advisory_only' ? ['insufficient_binding_evidence'] : [])
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
                product_specific_cells: rows.filter((cell) => cell.evidence_depth === 'product_and_attribute_specific').length,
                baseline_only_cells: rows.filter((cell) => cell.evidence_depth === 'baseline_market_safety').length,
                limited_cells: rows.filter((cell) => cell.coverage === 'limited').length
            }];
        })),
        remediation_queue: cells.filter((cell) => cell.issues.length).map((cell) => ({
            product_id: cell.product_id, market: cell.market, issues: cell.issues,
            next_action: cell.unsourced_requirements.length ? 'Add a maintained official source before deepening the conclusion.'
                : cell.degraded_source_ids.length ? 'Restore automated official capture or complete the scheduled manual source review.'
                    : 'Keep the result explicitly limited until product-specific official evidence is maintained.'
        })),
        attribute_scenario_audit: buildAttributeScenarioAudit(products),
        cells
    };
}

if (require.main === module) {
    fs.writeFileSync(OUTPUT, `${JSON.stringify(buildReport(), null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

module.exports = { ATTRIBUTE_SCENARIOS, buildAttributeScenarioAudit, buildReport };
