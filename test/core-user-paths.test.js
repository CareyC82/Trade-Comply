'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');

function readFile(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
    return JSON.parse(readFile(relativePath));
}

test('primary user pages expose the shared bottom workflow navigation', () => {
    [
        'index.html',
        'electronics.html',
        'semiconductor.html',
        'new-energy.html',
        'data-center.html',
        'healthcare-lab.html',
        'industrial-automation.html',
        'hscode.html',
        'post-entry.html',
        'post-entry-result.html',
        'opportunity.html'
    ].forEach((file) => {
        const html = readFile(file);

        assert.match(html, /TraceWize/, `${file} should use the current brand`);
        assert.match(html, /nav-hscode/, `${file} should expose HS Code navigation`);
        assert.match(html, /nav-post-entry/, `${file} should expose Post-Entry navigation`);
        assert.match(html, /nav-opportunity/, `${file} should expose Opportunity navigation`);
    });
});

test('category pages keep product feedback and result handoff available', () => {
    [
        'electronics.html',
        'semiconductor.html',
        'new-energy.html',
        'data-center.html',
        'healthcare-lab.html',
        'industrial-automation.html'
    ].forEach((file) => {
        const html = readFile(file);

        assert.match(html, /Can't find your product\? Tell us/, `${file} should show the Formspree feedback entry`);
        assert.match(html, /search-input/, `${file} should keep the product search box`);
        assert.match(html, /category-quick-select-container/, `${file} should expose the dynamic category mount point`);
        assert.match(html, /data-app="category"/, `${file} should boot the category search flow`);
    });
});

test('high-value route matrix covers direct and two-leg opportunity paths', () => {
    const matrix = readJson('data/post-entry-rate-priority-matrix.json');
    const routeKeys = new Set(matrix.routes.map((route) => [
        route.origin_country,
        route.import_country,
        route.product_id,
        route.hs_code
    ].join(':')));

    [
        'US:CN:semiconductor:854239',
        'US:CN:ai_compute:847150',
        'US:SG:semiconductor:854231',
        'SG:CN:semiconductor:854239',
        'US:MY:semiconductor:854231',
        'MY:CN:semiconductor:854239',
        'JP:US:smartphone:851713',
        'KR:US:router:851762',
        'SG:US:battery:850760',
        'IN:US:solar:854143',
        'MX:US:industrial_automation:847950'
    ].forEach((key) => {
        assert.equal(routeKeys.has(key), true, `${key} should be covered in the maintained route matrix`);
    });
});

test('maintained duty rules cover US non-China imports and China AI compute imports', () => {
    const dutyRates = readJson('data/duty-rates.json');
    const usGeneral = dutyRates.rules.find((rule) => rule.id === 'US-NONCN-HIGHTECH-GENERAL-DUTY');
    const chinaImport = dutyRates.rules.find((rule) => (
        rule.import_country === 'CN'
        && rule.origin_country === '*'
        && Array.isArray(rule.hs_prefixes)
        && rule.hs_prefixes.includes('847150')
    ));

    assert.ok(usGeneral, 'US non-China high-tech import baseline should be maintained');
    assert.equal(usGeneral.source_status, 'official_source_checked');
    assert.ok(usGeneral.exact_code_overrides.some((row) => row.hs_code === '847950' && row.base_rate === 0.025));
    assert.ok(usGeneral.exact_code_overrides.some((row) => row.hs_code === '854231' && row.base_rate === 0));
    assert.ok(chinaImport, 'China import high-tech duty rule should cover AI compute HS 847150');
    assert.ok(chinaImport.exact_code_overrides.some((row) => row.hs_code === '847150'));
});
