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
});

