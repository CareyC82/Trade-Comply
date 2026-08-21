'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

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

test('multiple Not sure evidence answers produce an unable-to-confirm result with named gaps', () => {
    const result = engine.assess({
        description: 'Bluetooth earbuds with rechargeable lithium battery',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'earbuds', bluetooth: 'yes', battery: 'yes' },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'unknown' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'unknown' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    });
    assert.equal(result.consumerConclusion.code, 'unable_to_confirm');
    assert.match(result.consumerConclusion.reason, /FCC ID.*RF exposure/);
});

test('a parsed model mismatch blocks otherwise positive supplier claims', () => {
    const result = engine.assess({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        },
        supplierEvidence: {
            requiredModel: 'SW-100',
            files: [{
                name: 'FCC-report.pdf', type: 'application/pdf', status: 'model_mismatch',
                parsing: { model: 'SW-200', modelMatch: false, documentKind: 'FCC', missingFields: [] }
            }]
        }
    });
    assert.equal(result.consumerConclusion.code, 'not_yet');
    assert.equal(result.procurement.code, 'change_supplier');
    assert.ok(result.decisionTrace.some((step) => /1 mismatched/.test(step)));
});

test('expired and wrong-market supplier files fail closed', () => {
    const base = {
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    };
    const expired = engine.assess({ ...base, supplierEvidence: {
        requiredModel: 'SW-100',
        files: [{
            name: 'FCC-report.pdf', type: 'application/pdf', status: 'parsed',
            parsing: {
                model: 'SW-100', modelMatch: true, manufacturer: 'Example Labs', reportNumber: 'FCC-1',
                reportDate: '2020-01-01', expiryDate: '2021-01-01', documentKind: 'FCC', missingFields: []
            }
        }]
    } });
    assert.equal(expired.consumerConclusion.code, 'not_yet');
    assert.match(expired.consumerConclusion.reason, /expired/i);

    const wrongMarket = engine.assess({ ...base, supplierEvidence: {
        requiredModel: 'SW-100',
        files: [{
            name: 'RED-report.pdf', type: 'application/pdf', status: 'parsed',
            parsing: {
                model: 'SW-100', modelMatch: true, manufacturer: 'Example Labs', reportNumber: 'RED-1',
                reportDate: '2026-08-01', documentKind: 'CE / RED', missingFields: []
            }
        }]
    } });
    assert.equal(wrongMarket.consumerConclusion.code, 'not_yet');
    assert.match(wrongMarket.consumerConclusion.reason, /not applicable to US/i);
});

test('consumer product, market and channel matrix never reports a ready platform when market access is blocked', () => {
    const products = [
        { description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.', attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' } },
        { description: 'Bluetooth earbuds with rechargeable lithium battery', attributes: { productType: 'earbuds', bluetooth: 'yes', wifi: 'no', battery: 'yes' } },
        { description: '65W GaN wall charger with AC input and no battery', attributes: { productType: 'charger', mainsPowered: 'yes', battery: 'no', bluetooth: 'no', wifi: 'no' } },
        { description: '10000mAh lithium-ion power bank', attributes: { productType: 'power_bank', battery: 'yes', bluetooth: 'no', wifi: 'no' } },
        { description: 'Children’s Wi-Fi electronic camera with a rechargeable battery', attributes: { productType: 'kids_electronics', childUse: 'yes', wifi: 'yes', battery: 'yes', cameraMic: 'yes' } },
        { description: 'Rechargeable facial beauty device with no medical claims', attributes: { productType: 'beauty_device', battery: 'yes', medicalClaim: 'no', childUse: 'no' } }
    ];
    const markets = ['US', 'EU', 'JP', 'SG'];
    const platforms = ['Amazon', 'TikTok Shop', 'Shopify / own store', 'Other marketplace'];
    let checked = 0;

    products.forEach((product) => markets.forEach((market) => platforms.forEach((platform) => {
        const preliminary = engine.assess({
            ...product, market, platform, assessmentMode: 'quick', blockingQuestionKeys: []
        });
        const questions = [
            ...engine.evidenceQuestionsForRequirements(preliminary.requirements),
            ...engine.platformEvidenceQuestions(platform, preliminary.profile)
        ];
        const evidenceAnswers = Object.fromEntries(questions.map((question) => [
            question.key, { label: question.label, value: 'yes' }
        ]));
        const result = engine.assess({
            ...product, market, platform, evidenceAnswers,
            assessmentMode: 'quick', blockingQuestionKeys: []
        });
        const marketReady = ['basic_ready', 'provisionally_ready', 'evidence_checked'].includes(result.consumerConclusion.code);
        if (!marketReady) {
            assert.equal(result.platformDecision.code, 'not_ready', `${product.attributes.productType}/${market}/${platform}`);
            assert.notEqual(result.procurement.code, 'ready_for_po_review', `${product.attributes.productType}/${market}/${platform}`);
        }
        if (marketReady && ['Amazon', 'TikTok Shop', 'Shopify / own store'].includes(platform)) {
            assert.equal(result.platformDecision.code, 'ready', `${product.attributes.productType}/${market}/${platform}`);
        }
        if (marketReady && platform === 'Other marketplace') {
            assert.equal(result.platformDecision.code, 'policy_unknown', `${product.attributes.productType}/${market}/${platform}`);
        }
        checked += 1;
    })));

    assert.equal(checked, 96);
});

test('all thirty maintained products stay market-separated across four sales channels', () => {
    const products = models.listProducts().filter((product) => product.id !== 'wearable_other');
    const markets = ['US', 'EU', 'JP', 'SG'];
    const platforms = ['Amazon', 'TikTok Shop', 'Shopify / own store', 'Other marketplace'];
    const forbiddenByMarket = {
        US: new Set(['red', 'jp_radio', 'jp_pse', 'sg_imda', 'sg_safety']),
        EU: new Set(['fcc', 'jp_radio', 'jp_pse', 'sg_imda', 'sg_safety']),
        JP: new Set(['fcc', 'red', 'sg_imda', 'sg_safety']),
        SG: new Set(['fcc', 'red', 'jp_radio', 'jp_pse'])
    };
    let checked = 0;

    products.forEach((product) => markets.forEach((market) => platforms.forEach((platform) => {
        const result = engine.assess({
            description: product.label,
            market,
            platform,
            attributes: { productType: product.id, ...(product.defaults || {}) },
            assessmentMode: 'quick',
            blockingQuestionKeys: []
        });
        assert.equal(result.coverageStatus.supported, true, `${product.id}/${market}/${platform}`);
        assert.notEqual(result.sellerConclusion.code, 'not_enough_information', `${product.id}/${market}/${platform}`);
        forbiddenByMarket[market].forEach((id) => {
            assert.ok(!result.requirements.some((item) => item.id === id), `${product.id}/${market} leaked ${id}`);
        });
        const expectedPlatform = platform === 'Amazon' || platform === 'TikTok Shop'
            ? 'evidence_needed'
            : platform === 'Shopify / own store' ? 'ready' : 'policy_unknown';
        assert.equal(result.platformGateDecision.code, expectedPlatform, `${product.id}/${market}/${platform}`);
        assert.ok(result.productGuidance.risk && result.productGuidance.supplier, product.id);
        checked += 1;
    })));

    assert.equal(checked, 480);
});
