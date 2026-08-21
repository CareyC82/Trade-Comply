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
    const euRequirements = engine.marketRequirements('EU', engine.extractProfile('Bluetooth speaker with rechargeable lithium battery'));
    const euBattery = euRequirements.find((item) => item.id === 'battery');
    const euBatteryFuture = euRequirements.find((item) => item.id === 'eu_battery_future');
    assert.equal(euBattery.requirementClass, 'mandatory');
    assert.match(euBatteryFuture.reason, /18 February 2027/);
    assert.equal(euBatteryFuture.requirementClass, 'future');
    assert.ok(euBatteryFuture.sources.some((source) => /batteries/i.test(source.title)));

    const jpPse = engine.marketRequirements('JP', engine.extractProfile('65W mains-powered wall charger'))
        .find((item) => item.id === 'jp_pse');
    assert.ok(jpPse.sources.some((source) => /overseas sellers/i.test(source.title)));
    assert.ok(jpPse.docs.some((doc) => /Domestic responsible-person/i.test(doc)));
    assert.equal(jpPse.requirementClass, 'scope_check');
});

test('Singapore controlled-goods mapping names the candidate scope without claiming approval', () => {
    const requirement = engine.marketRequirements('SG', engine.extractProfile('230V AC mains portable fan'))
        .find((item) => item.id === 'sg_safety');
    assert.equal(requirement.requirementClass, 'scope_check');
    assert.match(requirement.reason, /fan/i);
    assert.match(requirement.reason, /confirm/i);
    assert.match(requirement.reason, /230 V is within the 250 VAC category limit/);
    assert.equal(engine.marketRequirements('SG', engine.extractProfile('300V AC mains portable fan')).some((item) => item.id === 'sg_safety'), false);
    assert.equal(engine.marketRequirements('SG', engine.extractProfile('USB only rechargeable portable fan')).some((item) => item.id === 'sg_safety'), false);
});

test('Japan fan PSE candidate applies the official 300 W ceiling without overclaiming scope', () => {
    const within = engine.marketRequirements('JP', engine.extractProfile('100V AC mains portable fan 45W')).find((item) => item.id === 'jp_pse');
    assert.match(within.reason, /45 W is within the 300 W category limit/);
    assert.equal(engine.marketRequirements('JP', engine.extractProfile('100V AC mains portable fan 400W')).some((item) => item.id === 'jp_pse'), false);
});

test('JP and SG direct-mains candidate categories do not leak into battery-only configurations', () => {
    for (const [market, description] of [
        ['JP', 'USB only battery smart light without AC input'],
        ['JP', 'USB only rechargeable electric shaver without AC input'],
        ['SG', 'USB only battery security camera without AC input'],
        ['SG', 'USB only battery mini projector without AC input']
    ]) assert.equal(engine.marketRequirements(market, engine.extractProfile(description)).some((item) => ['jp_pse', 'sg_safety'].includes(item.id)), false, `${market}: ${description}`);
    const singapore = engine.marketRequirements('SG', engine.extractProfile('230V AC mains mini projector')).find((item) => item.id === 'sg_safety');
    assert.match(singapore.reason, /230 V is within the 250 VAC category limit/);
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
