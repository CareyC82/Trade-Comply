'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

test('extracts material smart-wearable facts without inventing unknown answers', () => {
    const profile = engine.extractProfile('Bluetooth smart ring with a rechargeable lithium battery and sleep tracking. No medical claims.');
    assert.equal(profile.productType, 'smart_ring');
    assert.equal(profile.bluetooth, true);
    assert.equal(profile.battery, true);
    assert.equal(profile.healthMonitoring, true);
    assert.equal(profile.medicalClaim, false);
    assert.equal(profile.cellular, engine.UNKNOWN);
});

test('US connected battery wearable produces FCC and transport requirements', () => {
    const result = engine.assess({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US',
        platform: 'Amazon',
        attributes: {
            bluetooth: 'yes', wifi: 'no', cellular: 'no', battery: 'yes',
            healthMonitoring: 'no', medicalClaim: 'no', childUse: 'no', cameraMic: 'no'
        },
        documents: []
    });
    const ids = result.requirements.map((item) => item.id);
    assert.ok(ids.includes('fcc'));
    assert.ok(ids.includes('battery'));
    assert.equal(result.verdict, 'conditional');
    assert.match(result.shipping, /Restricted battery shipment/);
});

test('medical claims and child-directed use cannot receive a simple feasible verdict', () => {
    const result = engine.assess({
        description: 'Kids watch that diagnoses heart problems',
        market: 'EU',
        platform: 'TikTok Shop',
        attributes: {
            bluetooth: 'no', wifi: 'no', cellular: 'yes', battery: 'yes',
            healthMonitoring: 'yes', medicalClaim: 'yes', childUse: 'yes', cameraMic: 'yes'
        },
        documents: ['classification', 'red', 'rohs', 'mdr', 'battery', 'privacy', 'privacy_features']
    });
    assert.equal(result.verdict, 'high_risk');
    assert.ok(result.requirements.some((item) => item.id === 'mdr' && item.severity === 'high'));
});

test('consumer page is reachable from the primary navigation and declares the dedicated app', () => {
    const root = path.join(__dirname, '..');
    const page = fs.readFileSync(path.join(root, 'can-i-sell-it.html'), 'utf8');
    assert.match(page, /data-app="can-i-sell-it"/);
    assert.match(page, /Small Parcel Check/);
    [
        'index.html', 'electronics.html', 'new-energy.html', 'semiconductor.html',
        'data-center.html', 'industrial-automation.html', 'healthcare-lab.html',
        'hscode.html', 'post-entry.html', 'post-entry-result.html',
        'opportunity.html', 'tariff-watch.html', 'trade-flow.html'
    ].forEach((file) => {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(html, /nav-can-i-sell-it/, `${file} should link to the consumer pre-check`);
    });
});

test('distinguishes all six supported wearable product models', () => {
    const samples = {
        smart_watch: 'Bluetooth smart watch',
        smart_ring: 'sleep tracking smart ring',
        fitness_tracker: 'fitness band activity tracker',
        kids_gps_watch: 'kids GPS watch with eSIM',
        earbuds: 'Bluetooth noise cancelling earbuds',
        smart_glasses: 'AR smart glasses with projected display'
    };
    Object.entries(samples).forEach(([expected, description]) => {
        assert.equal(engine.extractProfile(description).productType, expected);
    });
    assert.equal(models.listProducts().filter((item) => item.id !== 'wearable_other').length, 6);
});

test('official evidence is attached to applicable US and EU requirements', () => {
    const us = engine.assess({
        description: 'Bluetooth earbuds with rechargeable battery',
        market: 'US',
        origin: 'CN',
        attributes: { wifi: 'no', bluetooth: 'yes', battery: 'yes', cameraMic: 'yes', wirelessCharging: 'no', noiseCancellation: 'yes' },
        documents: []
    });
    const eu = engine.assess({
        description: 'Bluetooth fitness tracker with battery and no medical claims',
        market: 'EU',
        origin: 'CN',
        attributes: { wifi: 'no', cellular: 'no', bluetooth: 'yes', battery: 'yes', healthMonitoring: 'yes', medicalClaim: 'no', childUse: 'no', gps: 'no', display: 'yes' },
        documents: []
    });
    assert.ok(us.requirements.find((item) => item.id === 'fcc').sources.some((source) => source.authority.includes('Federal Communications Commission')));
    assert.ok(eu.requirements.find((item) => item.id === 'red').sources.some((source) => source.url.includes('ec.europa.eu')));
    assert.ok(eu.requirements.find((item) => item.id === 'gpsr'));
});

test('estimates landed cost, platform fees, contribution and break-even price', () => {
    const economics = engine.estimateEconomics({
        currency: 'USD',
        quantity: 100,
        purchaseUnit: 20,
        saleUnit: 50,
        freightTotal: 200,
        otherImportTotal: 100,
        dutyRate: 10,
        importTaxRate: 0,
        platformFeeRate: 15,
        otherSellingUnit: 5
    });
    assert.equal(economics.customsValue, 2200);
    assert.equal(economics.duty, 220);
    assert.equal(economics.landedUnit, 25.2);
    assert.equal(economics.platformFeeUnit, 7.5);
    assert.equal(economics.profitUnit, 12.3);
    assert.ok(economics.breakEvenPrice > 35 && economics.breakEvenPrice < 36);
});

test('uses maintained candidate duty evidence but preserves classification warning', () => {
    const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/duty-rates.json'), 'utf8'));
    const result = engine.assess({
        description: 'Bluetooth smart watch with lithium battery and no medical claims',
        origin: 'CN',
        market: 'EU',
        platform: 'Amazon',
        dutyRates,
        attributes: {
            bluetooth: 'yes', wifi: 'no', cellular: 'yes', battery: 'yes',
            healthMonitoring: 'no', medicalClaim: 'no', childUse: 'no', cameraMic: 'no'
        },
        documents: [],
        costs: { quantity: 10, purchaseUnit: 20, saleUnit: 50, platformFeeRate: 10 }
    });
    assert.ok(result.tariffOptions.some((row) => row.hsCode === '8517.13' && row.rate !== null));
    assert.match(result.product.hsNote, /Classification depends/);
    assert.ok(result.economics);
    assert.equal(result.procurement.code, 'conditional_buy');
    assert.ok(result.contractConditions.some((line) => /exact ordered model/.test(line)));
});
