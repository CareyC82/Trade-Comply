'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');

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
