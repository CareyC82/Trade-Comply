'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../scripts/build-consumer-regulatory-coverage');
const engine = require('../lib/can-i-sell-it');

test('regulatory coverage report spans thirty products and four markets', () => {
    const report = buildReport();
    assert.equal(report.product_count, 30);
    assert.equal(report.matrix_cell_count, 120);
    assert.deepEqual(report.markets, ['US', 'EU', 'JP', 'SG']);
    assert.equal(report.market_summary.US.deep, 30);
    assert.equal(report.market_summary.EU.deep, 30);
});

test('EU connected devices receive current RED cybersecurity evidence without market leakage', () => {
    const profile = engine.extractProfile('Wi-Fi video doorbell with camera and rechargeable battery');
    const eu = engine.marketRequirements('EU', profile);
    const us = engine.marketRequirements('US', profile);
    const cyber = eu.find((item) => item.id === 'red_cybersecurity');
    assert.ok(cyber);
    assert.ok(cyber.sources.some((source) => source.url.includes('CELEX:32022R0030')));
    assert.ok(!us.some((item) => item.id === 'red_cybersecurity'));
    assert.ok(!engine.marketRequirements('EU', engine.extractProfile('Wired-only USB webcam without Wi-Fi, Bluetooth, radio or battery.')).some((item) => item.id === 'red_cybersecurity'));
});

test('EU battery and Japan online-seller evidence are specific and date-bounded', () => {
    const euBattery = engine.marketRequirements('EU', engine.extractProfile('Bluetooth speaker with rechargeable lithium battery'))
        .find((item) => item.id === 'battery');
    assert.match(euBattery.reason, /18 February 2027/);
    assert.ok(euBattery.sources.some((source) => /batteries/i.test(source.title)));

    const jpPse = engine.marketRequirements('JP', engine.extractProfile('65W mains-powered wall charger'))
        .find((item) => item.id === 'jp_pse');
    assert.ok(jpPse.sources.some((source) => /overseas sellers/i.test(source.title)));
    assert.ok(jpPse.docs.some((doc) => /Domestic responsible-person/i.test(doc)));
});

test('new adjacent electronics aliases resolve without conflicting with existing models', () => {
    const samples = {
        webcam: ['USB webcam', 'computer camera'],
        dash_camera: ['dash cam', 'driving recorder'],
        video_doorbell: ['Wi-Fi video doorbell', 'doorbell camera'],
        baby_monitor: ['baby video monitor', 'nursery audio monitor'],
        robot_vacuum: ['robot vacuum', 'robotic cleaner']
    };
    Object.entries(samples).forEach(([expected, aliases]) => aliases.forEach((description) => {
        assert.equal(engine.detectProductType(description), expected, description);
    }));
    assert.equal(engine.detectProductType('Wi-Fi IP security camera'), 'security_camera');
    assert.equal(engine.detectProductType('Bluetooth smart watch'), 'smart_watch');
});

test('FCC marketplace change is disclosed as pending and does not become a legal requirement', () => {
    const result = engine.assess({
        description: 'Bluetooth speaker with rechargeable battery',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    const readiness = result.platformRules.find((rule) => rule.id === 'amazon-fcc-id-readiness');
    assert.equal(readiness.source.confidence, 'official_pending_effective_date');
    assert.match(readiness.action, /verify the effective date/i);
    assert.ok(!result.requirements.some((item) => item.id === 'fcc_marketplace_2026'));
    const eu = engine.assess({
        description: 'Bluetooth speaker with rechargeable battery',
        market: 'EU', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.ok(!eu.platformRules.some((rule) => rule.id === 'amazon-fcc-id-readiness'));
});
