'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');

function compare(markets) {
    return engine.assessMarkets({
        description: 'Portable Bluetooth speaker with a rechargeable lithium battery and USB-C charging.',
        origin: 'CN', market: 'MULTI', markets, platform: 'Amazon',
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
}

test('multi-market comparison accepts two to four supported markets only', () => {
    assert.throws(() => compare(['US']), /between 2 and 4/);
    assert.throws(() => compare(['US', 'EU', 'AU', 'NZ', 'JP']), /between 2 and 4/);
    assert.throws(() => compare(['US', 'XX']), /between 2 and 4/);
    assert.deepEqual(compare(['US', 'EU']).marketTargets, ['US', 'EU']);
});

test('multi-market comparison keeps jurisdiction results and local actions separate', () => {
    const result = compare(['US', 'EU', 'AU']);
    assert.deepEqual(Object.keys(result.jurisdictionResults), ['US', 'EU', 'AU']);
    assert.equal(result.multiMarketComparison.marketSummaries.length, 3);
    assert.ok(result.multiMarketComparison.sharedEvidence.some((item) => /UN38\.3/.test(item)));
    assert.ok(result.multiMarketComparison.marketSpecificActions.US.some((item) => /FCC/.test(item)));
    assert.ok(result.multiMarketComparison.marketSpecificActions.EU.some((item) => /CE|RED/.test(item)));
    assert.ok(result.multiMarketComparison.marketSpecificActions.AU.some((item) => /ACMA|RCM/.test(item)));
    assert.ok(result.multiMarketComparison.notAutomaticallyTransferable.some((item) => /registration|responsible-party/i.test(item)));
    assert.equal(result.selectedTariff, null);
    assert.match(result.disclaimer, /separate jurisdictions/i);
});

test('multi-market comparison deduplicates selected destinations', () => {
    const result = compare(['US', 'US', 'EU']);
    assert.deepEqual(result.marketTargets, ['US', 'EU']);
    assert.equal(result.multiMarketComparison.marketSummaries.length, 2);
});

test('multi-market comparison applies each destination exact code and calculates costs independently', () => {
    const result = engine.assessMarkets({
        description: 'Portable Bluetooth speaker with rechargeable lithium battery.',
        origin: 'CN', market: 'MULTI', markets: ['US', 'EU'], platform: 'Amazon',
        exactHsCodes: { US: '8518210000', EU: '8518210000' },
        dutyRates: { rules: [
            { import_country: 'US', origin_country: '*', hs_prefixes: ['8518'], base_rate: null, import_tax_benchmark_rate: 0,
                exact_code_overrides: [{ hs_code: '8518210000', base_rate: 0.07, source_status: 'official_source_checked' }] },
            { import_country: 'EU', origin_country: '*', hs_prefixes: ['8518'], base_rate: null, import_tax_benchmark_rate: 0.20,
                exact_code_overrides: [{ hs_code: '8518210000', base_rate: 0.03, source_status: 'official_source_checked' }] }
        ] },
        costs: { currency: 'USD', quantity: 10, purchaseUnit: 100, saleUnit: 180 },
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.equal(result.jurisdictionResults.US.selectedTariff.exact, true);
    assert.equal(result.jurisdictionResults.EU.selectedTariff.exact, true);
    assert.equal(result.economicsByMarket.US.dutyRate, 0.07);
    assert.equal(result.economicsByMarket.EU.dutyRate, 0.03);
    assert.notEqual(result.economicsByMarket.US.duty, result.economicsByMarket.EU.duty);
});

test('shorter official headings never masquerade as exact national tariff lines', () => {
    const result = engine.assessMarkets({
        description: 'Portable Bluetooth speaker with rechargeable lithium battery.',
        origin: 'CN', market: 'MULTI', markets: ['US', 'EU'], platform: 'Amazon',
        exactHsCodes: { US: '8518210000', EU: '85182100' },
        dutyRates: { rules: [
            { import_country: 'US', origin_country: '*', hs_prefixes: ['8518'], base_rate: 0.07,
                exact_code_overrides: [{ hs_code: '851821', base_rate: 0.07, source_status: 'official_source_checked' }] },
            { import_country: 'EU', origin_country: '*', hs_prefixes: ['8518'], base_rate: 0.03,
                exact_code_overrides: [{ hs_code: '8518210000', base_rate: 0.03, source_status: 'official_source_checked' }] }
        ] },
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
    const us = result.jurisdictionResults.US.selectedTariff;
    const eu = result.jurisdictionResults.EU.selectedTariff;
    assert.equal(us.exact, false);
    assert.equal(us.exactRateMissing, true);
    assert.equal(us.classificationRequired, true);
    assert.equal(eu.exact, false);
    assert.equal(eu.exactRateMissing, true);
    assert.equal(eu.classificationRequired, true);
});

test('each maintained market uses its own filing-grade exact-code length', () => {
    const cases = [
        ['US', '8518210000'], ['EU', '8518210000'], ['AU', '85182100'],
        ['NZ', '85182190'], ['JP', '851821000'], ['SG', '85182100']
    ];
    for (const [market, code] of cases) {
        const result = engine.assess({
            description: 'Portable Bluetooth speaker with rechargeable lithium battery.',
            origin: 'CN', market, platform: 'Amazon', exactHsCode: code,
            dutyRates: { rules: [{
                import_country: market, origin_country: '*', hs_prefixes: ['8518'], base_rate: null,
                exact_code_overrides: [{ hs_code: code, base_rate: 0.04, source_status: 'official_source_checked' }]
            }] },
            assessmentMode: 'quick', blockingQuestionKeys: []
        });
        assert.equal(result.selectedTariff.exact, true, `${market} should accept ${code} as filing-grade`);
        assert.equal(result.selectedTariff.classificationRequired, false);
    }
});

test('consumer UI requires explicit comparison selection and exposes comparison sections', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'can-i-sell-it.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.match(html, /value="compare">Compare 2–4 markets/);
    assert.match(html, /No market is selected automatically/);
    assert.equal((html.match(/name="comparisonMarket"/g) || []).length, 6);
    assert.doesNotMatch(html, /name="comparisonMarket"[^>]*checked/);
    assert.match(script, /Select between 2 and 4 markets to compare/);
    assert.match(script, /Shared \/ reusable evidence/);
    assert.match(script, /Not automatically transferable/);
    assert.match(html, /id="sell-comparison-hs-fields"/);
    assert.match(script, /United States HTS code/);
    assert.match(script, /European Union CN \/ TARIC code/);
    assert.match(script, /EU: \{ label: 'European Union CN \/ TARIC code', lengths: \[8, 10\]/);
    assert.match(script, /exactHsCodes: comparing \? comparisonExactHsValues\(\)/);
});

