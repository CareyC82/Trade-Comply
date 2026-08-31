'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');
const country = require('../lib/country-registry');

function assess(market, description, attributes = {}) {
    return engine.assess({
        description,
        origin: 'CN',
        market,
        platform: 'Amazon',
        attributes,
        assessmentMode: 'quick',
        blockingQuestionKeys: []
    });
}

test('Australia Bluetooth speaker applies ACMA, RCM and battery evidence without claiming approval', () => {
    const result = assess('AU', 'Portable Bluetooth speaker with rechargeable lithium battery. For general consumers.');
    const ids = result.requirements.map((item) => item.id);
    assert.ok(ids.includes('au_radio'));
    assert.ok(ids.includes('au_rcm'));
    assert.ok(ids.includes('battery'));
    assert.equal(result.marketCoverage.level, 'deep');
    assert.notEqual(result.sellerConclusion.code, 'likely_eligible');
    assert.ok(result.requirements.every((item) => item.coverageLevel));
});

test('New Zealand Bluetooth speaker applies RSM, supplier licence and SDoC evidence', () => {
    const result = assess('NZ', 'Portable Bluetooth speaker with rechargeable lithium battery. For general consumers.');
    const ids = result.requirements.map((item) => item.id);
    assert.ok(ids.includes('nz_radio'));
    assert.ok(ids.includes('nz_radio_supplier'));
    assert.ok(ids.includes('nz_sdoc_label'));
    assert.ok(ids.includes('nz_mutual_recognition'));
    assert.ok(result.requirements.find((item) => item.id === 'nz_mutual_recognition').reason.includes('not automatically transferable'));
});

test('ANZ comparison separates shared evidence and jurisdiction-specific actions', () => {
    const result = engine.assessAnz({
        description: 'Portable Bluetooth speaker with rechargeable lithium battery. For general consumers.',
        origin: 'CN', market: 'ANZ', platform: 'Amazon',
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.deepEqual(Object.keys(result.jurisdictionResults), ['AU', 'NZ']);
    assert.ok(result.anzComparison.sharedEvidence.some((item) => /UN38\.3/.test(item)));
    assert.ok(result.anzComparison.australiaActions.some((item) => /ACMA|RCM/.test(item)));
    assert.ok(result.anzComparison.newZealandActions.some((item) => /RSM|SDoC|licence/i.test(item)));
    assert.ok(result.anzComparison.notAutomaticallyTransferable.some((item) => /supplier|registration/i.test(item)));
    assert.match(result.disclaimer, /separate jurisdictions/i);
});

test('ANZ mains products treat the host and adaptor as separate evidence objects', () => {
    const australia = assess('AU', '65W GaN USB-C charger with 100-240V AC input and no battery.');
    const nz = assess('NZ', '65W GaN USB-C charger with 100-240V AC input and no battery.');
    assert.ok(australia.requirements.some((item) => item.id === 'au_eess' && item.docs.some((doc) => /Separate adaptor/i.test(doc))));
    assert.ok(nz.requirements.some((item) => item.id === 'nz_electrical' && item.docs.some((doc) => /adaptor/i.test(doc))));
    assert.equal(australia.requirements.some((item) => item.id === 'battery'), false);
    assert.equal(nz.requirements.some((item) => item.id === 'battery'), false);
});

test('ANZ power bank retains common UN38.3 evidence and local electrical classification', () => {
    const result = engine.assessAnz({
        description: '10000mAh lithium-ion power bank with USB-C, no wireless and no AC mains input.',
        origin: 'CN', market: 'ANZ', platform: 'Other marketplace', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.ok(result.requirements.some((item) => item.id === 'battery'));
    assert.ok(result.jurisdictionResults.NZ.requirements.some((item) => item.id === 'nz_electrical'));
    assert.ok(result.supplierRequest.message.includes('Australia + New Zealand'));
});

test('wired ordinary electronics do not inherit radio or lithium requirements', () => {
    for (const market of ['AU', 'NZ']) {
        const result = assess(market, 'Wired USB hub with no wireless, no Bluetooth, no radio, no battery and no AC adapter.');
        const ids = result.requirements.map((item) => item.id);
        assert.equal(ids.some((id) => ['au_radio', 'nz_radio', 'nz_radio_supplier', 'battery'].includes(id)), false, market);
        assert.ok(ids.includes(market === 'AU' ? 'au_emc' : 'nz_emc'));
    }
});

test('child and medical claims remain specialist gates in both ANZ markets', () => {
    for (const market of ['AU', 'NZ']) {
        const child = assess(market, 'Kids GPS watch with Bluetooth and rechargeable lithium battery.', { childUse: true });
        const medical = assess(market, 'Smart watch that diagnoses heart disease.', { medicalClaim: true });
        assert.equal(child.sellerConclusion.code, 'high_risk', `${market} child`);
        assert.equal(medical.sellerConclusion.code, 'high_risk', `${market} medical`);
    }
});

test('unsupported goods exit safely and ANZ options are present across route and consumer UI', () => {
    const unsupported = assess('AU', 'Cotton summer dress for adults.');
    assert.equal(unsupported.coverageStatus.supported, false);
    assert.equal(unsupported.sellerConclusion.code, 'not_enough_information');
    assert.ok(country.getRouteOptions().some((item) => item.value === 'AU'));
    assert.ok(country.getRouteOptions().some((item) => item.value === 'NZ'));
    const html = fs.readFileSync(path.join(__dirname, '..', 'can-i-sell-it.html'), 'utf8');
    assert.match(html, /value="AU">Australia/);
    assert.match(html, /value="NZ">New Zealand/);
    assert.match(html, /value="ANZ">Australia \+ New Zealand comparison/);
});

test('ANZ official sources carry authority, review date, confidence and verification scope', () => {
    const sourceIds = Object.keys(models.sources).filter((id) => id.startsWith('au') || id.startsWith('nz'));
    assert.ok(sourceIds.length >= 15);
    sourceIds.forEach((id) => {
        const source = models.sources[id];
        assert.match(source.url, /^https:\/\//, id);
        assert.ok(source.authority, id);
        assert.equal(source.reviewedAt, '2026-08-31', id);
        assert.ok(source.confidence, id);
        assert.ok(source.scope, id);
    });
});
