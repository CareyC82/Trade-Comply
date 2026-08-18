'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');

const REAL_PRODUCT_CASES = [
    ['Bluetooth speaker with no battery, AC powered', 'bluetooth_speaker'],
    ['portable bluetooth loudspeaker rechargeable', 'bluetooth_speaker'],
    ['wireless lavalier microphone 2.4GHz', 'wireless_microphone'],
    ['cordless mic with receiver', 'wireless_microphone'],
    ['IP security camera with Wi-Fi', 'security_camera'],
    ['wired CCTV camera no wifi', 'security_camera'],
    ['dual-band WiFi router', 'wifi_router'],
    ['wireless access point router', 'wifi_router'],
    ['Wi-Fi smart plug', 'smart_plug'],
    ['connected wall socket', 'smart_plug'],
    ['smart LED bulb with wifi', 'smart_light'],
    ['connected light bulb bluetooth', 'smart_light'],
    ['wireless keyboard 2.4GHz', 'wireless_keyboard'],
    ['bluetooth computer keyboard', 'wireless_keyboard'],
    ['wireless mouse with USB dongle', 'wireless_mouse'],
    ['bluetooth mouse', 'wireless_mouse'],
    ['wireless gaming controller', 'gaming_controller'],
    ['USB wired gamepad no battery', 'gaming_controller'],
    ['portable mini projector with wifi', 'mini_projector'],
    ['pocket video projector', 'mini_projector'],
    ['USB C docking station', 'usb_hub'],
    ['type-c multiport hub', 'usb_hub'],
    ['Android tablet computer wifi', 'tablet'],
    ['tablet PC with cellular LTE', 'tablet'],
    ['Kindle style e reader', 'e_reader'],
    ['electronic book reader wifi', 'e_reader'],
    ['USB desk fan no battery', 'portable_fan'],
    ['rechargeable handheld fan', 'portable_fan'],
    ['cordless electric shaver', 'electric_shaver'],
    ['mains powered beard trimmer no battery', 'electric_shaver']
];

test('thirty realistic consumer-electronics descriptions resolve to maintained products', () => {
    REAL_PRODUCT_CASES.forEach(([description, expected]) => {
        assert.equal(engine.extractProfile(description).productType, expected, description);
    });
});

test('explicit wired and no-battery facts do not create radio or lithium requirements', () => {
    const result = engine.assess({
        description: 'USB wired gamepad with no wireless, no Bluetooth and no battery',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.equal(result.profile.productType, 'gaming_controller');
    assert.equal(result.profile.battery, false);
    assert.equal(result.profile.bluetooth, false);
    assert.equal(result.profile.wifi, false);
    assert.ok(!result.requirements.some((item) => ['fcc', 'battery'].includes(item.id)));
});

test('wireless, battery, mains and recording facts produce product-specific gates', () => {
    const scenarios = [
        ['Bluetooth loudspeaker with rechargeable lithium battery', 'US', ['fcc', 'battery']],
        ['Wi-Fi smart plug for AC mains', 'EU', ['red', 'eu_electrical']],
        ['IP security camera with Wi-Fi and microphone', 'JP', ['jp_radio', 'privacy_features']],
        ['rechargeable handheld fan with lithium battery', 'SG', ['battery']]
    ];
    scenarios.forEach(([description, market, expected]) => {
        const result = engine.assess({ description, market, platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] });
        const ids = new Set(result.requirements.map((item) => item.id));
        expected.forEach((id) => assert.ok(ids.has(id), `${description}/${market} missing ${id}`));
    });
});

test('unsupported products remain a safe exit instead of receiving a sellability answer', () => {
    ['cotton summer dress', 'organic face cream', 'canned tuna food'].forEach((description) => {
        const result = engine.assess({ description, market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] });
        assert.equal(result.marketCoverage.level, 'unsupported', description);
        assert.equal(result.sellerConclusion.code, 'not_enough_information', description);
    });
});

test('unsupported review requests use the described product instead of a fallback electronics label', () => {
    const description = 'cotton summer dress';
    const result = engine.assess({ description, market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] });
    const contact = engine.buildReviewContact({
        description, origin: 'CN', market: 'US', platform: 'Amazon',
        productLabel: result.coverageStatus.supported ? result.product.label : description,
        resultLabel: result.sellerConclusion.label
    });
    assert.match(contact.subject, /cotton summer dress/i);
    assert.doesNotMatch(contact.subject, /wearable/i);
    assert.match(contact.mailto, /^mailto:carey@tracewize\.com/);
});
