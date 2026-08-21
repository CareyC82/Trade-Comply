'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

const expanded = [
    'security_camera', 'smart_light', 'gaming_controller', 'mini_projector', 'usb_hub',
    'portable_fan', 'electric_shaver', 'webcam', 'dash_camera', 'video_doorbell', 'baby_monitor'
];

test('all eleven former JP/SG gaps now have sourced baseline safety coverage', () => {
    expanded.forEach((productType) => {
        const profile = { productType, ...(models.getProduct(productType).defaults || {}) };
        const jp = engine.marketRequirements('JP', profile);
        const sg = engine.marketRequirements('SG', profile);
        assert.ok(jp.some((item) => item.id === 'jp_product_safety' && item.sources.length >= 2), `${productType}/JP`);
        assert.ok(sg.some((item) => item.id === 'sg_general_safety' && item.sources.length >= 2), `${productType}/SG`);
        assert.equal(engine.marketCoverageForProfile('JP', profile, true, jp).level, 'deep');
        assert.equal(engine.marketCoverageForProfile('SG', profile, true, sg).level, 'deep');
    });
});

test('PSE and SAFETY Mark scope follows power configuration instead of product name alone', () => {
    const jpMainsFan = engine.marketRequirements('JP', { productType: 'portable_fan', mainsPowered: true });
    const jpBatteryFan = engine.marketRequirements('JP', { productType: 'portable_fan', mainsPowered: false, battery: true });
    assert.ok(jpMainsFan.some((item) => item.id === 'jp_pse'));
    assert.ok(!jpBatteryFan.some((item) => item.id === 'jp_pse'));

    const sgMainsProjector = engine.marketRequirements('SG', { productType: 'mini_projector', mainsPowered: true });
    const sgBatteryProjector = engine.marketRequirements('SG', { productType: 'mini_projector', mainsPowered: false, battery: true });
    assert.ok(sgMainsProjector.some((item) => item.id === 'sg_safety'));
    assert.ok(!sgBatteryProjector.some((item) => item.id === 'sg_safety'));
    assert.ok(sgBatteryProjector.some((item) => item.id === 'sg_general_safety'));
});

test('radio and IoT security checks react to wireless facts and stay market-specific', () => {
    const wireless = { productType: 'video_doorbell', wifi: true, battery: true, cameraMic: true, mainsPowered: false };
    const wired = { ...wireless, wifi: false };
    const jpWireless = engine.marketRequirements('JP', wireless);
    const sgWireless = engine.marketRequirements('SG', wireless);
    assert.ok(jpWireless.some((item) => item.id === 'jp_radio'));
    assert.ok(jpWireless.some((item) => item.id === 'jp_iot_security' && item.severity === 'advisory'));
    assert.ok(sgWireless.some((item) => item.id === 'sg_imda'));
    assert.ok(sgWireless.some((item) => item.id === 'sg_iot_security' && item.severity === 'advisory'));
    assert.ok(!engine.marketRequirements('JP', wired).some((item) => ['jp_radio', 'jp_iot_security'].includes(item.id)));
    assert.ok(!engine.marketRequirements('SG', wired).some((item) => ['sg_imda', 'sg_iot_security'].includes(item.id)));
    assert.ok(!jpWireless.some((item) => item.id.startsWith('sg_')));
    assert.ok(!sgWireless.some((item) => item.id.startsWith('jp_')));
});

test('advisory cybersecurity labels do not become purchase-blocking evidence', () => {
    const result = engine.assess({
        description: 'Wi-Fi video doorbell with camera and rechargeable battery, no mains connection',
        market: 'JP', platform: 'Shopify / own store', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'video_doorbell', wifi: 'yes', battery: 'yes', cameraMic: 'yes', mainsPowered: 'no' }
    });
    assert.ok(result.requirements.some((item) => item.id === 'jp_iot_security' && item.severity === 'advisory'));
    assert.ok(!result.documentGaps.some((item) => item.requirementId === 'jp_iot_security'));
    assert.ok(!result.contractConditions.some((line) => /JC-STAR/.test(line)));
});

test('supplier requests differ by exact electronics configuration', () => {
    const cases = [
        ['webcam', /USB, camera, microphone/],
        ['dash_camera', /vehicle-power/],
        ['video_doorbell', /Ingress\/weather/],
        ['baby_monitor', /Child safety/],
        ['portable_fan', /Motor power/]
    ];
    cases.forEach(([productType, expected]) => {
        const request = engine.buildSupplierRequest({
            requirements: engine.marketRequirements('SG', { productType }),
            market: 'SG', platform: 'Amazon', profile: { productType }, requiredModel: 'MODEL-1'
        });
        assert.ok(request.items.some((item) => expected.test(item.document)), productType);
        assert.ok(request.items.some((item) => /Singapore supplier/.test(item.document)), productType);
    });
});
