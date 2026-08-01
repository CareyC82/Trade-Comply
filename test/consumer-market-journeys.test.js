'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');

function positiveEvidence(requirements) {
    return Object.fromEntries(engine.evidenceQuestionsForRequirements(requirements).map((question) => [
        question.key,
        { label: question.label, value: 'yes' }
    ]));
}

function assessJourney(input) {
    const detected = engine.extractProfile(input.description);
    const profile = { ...detected, ...input.attributes };
    const requirements = engine.marketRequirements(input.market, Object.fromEntries(
        Object.entries(profile).map(([key, value]) => [key, value === 'yes' ? true : value === 'no' ? false : value])
    ));
    return engine.assess({
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: [],
        ...input,
        evidenceAnswers: positiveEvidence(requirements)
    });
}

test('US adult smart watch reaches provisional readiness with claimed FCC and battery evidence', () => {
    const result = assessJourney({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US',
        attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' }
    });
    assert.equal(result.consumerConclusion.code, 'provisionally_ready');
    assert.ok(result.requirements.some((item) => item.id === 'fcc'));
    assert.ok(result.requirements.some((item) => item.id === 'battery'));
});

test('EU kids GPS watch remains specialist-gated despite positive supplier evidence claims', () => {
    const result = assessJourney({
        description: 'Kids GPS watch with eSIM and rechargeable lithium battery',
        market: 'EU',
        attributes: { productType: 'kids_gps_watch', cellular: 'yes', battery: 'yes', childUse: 'yes', medicalClaim: 'no' }
    });
    assert.equal(result.consumerConclusion.code, 'specialist_review');
    assert.ok(result.requirements.some((item) => item.id === 'children'));
    assert.ok(result.requirements.some((item) => item.id === 'red'));
    assert.ok(result.requirements.some((item) => item.id === 'gpsr'));
});

test('Japan power bank asks for PSE-scope and battery transport evidence', () => {
    const result = assessJourney({
        description: '10000mAh lithium-ion power bank',
        market: 'JP',
        attributes: { productType: 'power_bank', battery: 'yes', bluetooth: 'no', wifi: 'no' }
    });
    assert.equal(result.consumerConclusion.code, 'provisionally_ready');
    assert.ok(result.requirements.some((item) => item.id === 'jp_pse'));
    assert.ok(result.requirements.some((item) => item.id === 'battery'));
});

test('Singapore mains charger asks for SAFETY Mark evidence without inventing battery controls', () => {
    const result = assessJourney({
        description: '65W GaN wall charger with AC input and no battery',
        market: 'SG',
        attributes: { productType: 'charger', mainsPowered: 'yes', battery: 'no', bluetooth: 'no', wifi: 'no' }
    });
    assert.equal(result.consumerConclusion.code, 'provisionally_ready');
    assert.ok(result.requirements.some((item) => item.id === 'sg_safety'));
    assert.ok(!result.requirements.some((item) => item.id === 'battery'));
});

test('medical-claim beauty devices are specialist-gated in every deep market', () => {
    ['US', 'EU', 'JP', 'SG'].forEach((market) => {
        const result = assessJourney({
            description: 'Rechargeable facial beauty device that claims to treat acne',
            market,
            attributes: { productType: 'beauty_device', battery: 'yes', medicalClaim: 'yes', childUse: 'no' }
        });
        assert.equal(result.consumerConclusion.code, 'specialist_review', market);
    });
});
