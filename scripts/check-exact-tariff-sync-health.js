#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const productModels = require('../lib/wearable-product-models');

function normalizedCode(value) {
    return String(value || '').replace(/\D/g, '');
}

function maintainedProductFamilies() {
    return Object.entries(productModels.products || {})
        .filter(([id]) => id !== 'wearable_other')
        .map(([id, product]) => ({
            product: id,
            label: product.label,
            families: [...new Set((product.candidateHs || []).map(normalizedCode).filter(Boolean))]
        }))
        .filter((row) => row.families.length);
}

function exactFamilyCoverage(payload, country) {
    const exactCodes = (payload.rules || [])
        .filter((rule) => rule.import_country === country)
        .flatMap((rule) => rule.exact_code_overrides || [])
        .map((row) => normalizedCode(row.hs_code))
        .filter(Boolean);
    const products = maintainedProductFamilies().map((product) => {
        const families = product.families.map((family) => ({
            family,
            exact_rows: exactCodes.filter((code) => code.startsWith(family) || family.startsWith(code)).length
        }));
        return { ...product, ok: families.every((row) => row.exact_rows > 0), families };
    });
    return {
        product_count: products.length,
        covered_product_count: products.filter((row) => row.ok).length,
        missing_products: products.filter((row) => !row.ok).map((row) => row.product),
        products
    };
}

function buildExactTariffHealth(payload, { now = new Date(), required = ['AU', 'NZ'] } = {}) {
    const results = new Map((payload.last_exact_national_tariff_sync?.results || []).map((row) => [row.country, row]));
    const checkedAt = new Date(payload.last_exact_national_tariff_sync?.checked_at || payload.last_exact_national_tariff_sync_at || '');
    const ageDays = Number.isNaN(checkedAt.getTime()) ? null : Math.floor((now.getTime() - checkedAt.getTime()) / 86400000);
    const markets = required.map((country) => {
        const result = results.get(country);
        const exactRows = new Set((payload.rules || [])
            .filter((rule) => rule.import_country === country)
            .flatMap((rule) => rule.exact_code_overrides || [])
            .map((row) => String(row.hs_code || '').replace(/\D/g, ''))
            .filter((code) => code.length === 8 || code.length === 10)).size;
        const minimum = country === 'AU' ? 100 : 150;
        const familyCoverage = exactFamilyCoverage(payload, country);
        const issues = [];
        if (!result || result.ok !== true || result.skipped) issues.push('latest official connector result is not successful');
        if (exactRows < minimum) issues.push(`only ${exactRows} exact rows are retained; expected at least ${minimum}`);
        if (familyCoverage.missing_products.length) issues.push(`missing exact tariff families for maintained product(s): ${familyCoverage.missing_products.join(', ')}`);
        return { country, ok: issues.length === 0, exact_rows: exactRows, latest_row_count: result?.row_count || 0, family_coverage: familyCoverage, issues };
    });
    const issues = markets.flatMap((row) => row.issues.map((issue) => `${row.country}: ${issue}`));
    if (ageDays === null) issues.push('exact tariff sync timestamp is missing');
    else if (ageDays > 7) issues.push(`exact tariff sync is stale (${ageDays} days)`);
    return { ok: issues.length === 0, checked_at: Number.isNaN(checkedAt.getTime()) ? null : checkedAt.toISOString(), age_days: ageDays, markets, issues };
}

if (require.main === module) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'duty-rates.json'), 'utf8'));
    const health = buildExactTariffHealth(payload);
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.ok ? 0 : 1);
}

module.exports = { maintainedProductFamilies, exactFamilyCoverage, buildExactTariffHealth };
