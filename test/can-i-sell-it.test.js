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

test('quick questions do not preselect Not sure', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.doesNotMatch(script, /profile\[key\]\s*===\s*['"]unknown['"][\s\S]{0,80}checked/);
});

test('quick assessment only blocks on questions actually shown to the user', () => {
    const common = {
        description: 'Bluetooth smart watch with heart-rate tracking',
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: ['childUse']
    };
    const adult = engine.assess({
        ...common,
        attributes: { productType: 'smart_watch', childUse: 'no' }
    });
    const child = engine.assess({
        ...common,
        attributes: { productType: 'smart_watch', childUse: 'yes' }
    });

    assert.notEqual(adult.verdict, 'information_missing');
    assert.equal(child.verdict, 'high_risk');
    assert.notEqual(adult.procurement.label, child.procurement.label);
    assert.ok(adult.deferredQuestions.length > 0);
});

test('quick battery answer changes the small-parcel result', () => {
    const common = {
        description: 'Portable consumer electronic accessory',
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: ['battery']
    };
    const battery = engine.assess({ ...common, attributes: { productType: 'general_electronics', battery: 'yes' } });
    const noBattery = engine.assess({ ...common, attributes: { productType: 'general_electronics', battery: 'no' } });

    assert.notEqual(battery.shipping, noBattery.shipping);
});

test('different electronics produce product-specific market and procurement decisions', () => {
    const common = {
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: []
    };
    const wireless = engine.assess({
        ...common,
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' }
    });
    const batteryOnly = engine.assess({
        ...common,
        description: 'Power bank with rechargeable lithium battery',
        attributes: { productType: 'power_bank', bluetooth: 'no', wifi: 'no', cellular: 'no', battery: 'yes' }
    });
    const passive = engine.assess({
        ...common,
        description: 'Consumer electronic accessory without battery or wireless connection',
        attributes: { productType: 'wearable_other', bluetooth: 'no', wifi: 'no', cellular: 'no', battery: 'no' }
    });

    assert.equal(wireless.marketDecision.code, 'radio_approval');
    assert.equal(batteryOnly.marketDecision.code, 'battery_controls');
    assert.equal(passive.marketDecision.code, 'classification_review');
    assert.notEqual(wireless.verdictLabel, batteryOnly.verdictLabel);
    assert.notEqual(batteryOnly.verdictLabel, passive.verdictLabel);
    assert.match(wireless.procurement.label, /FCC/i);
    assert.match(batteryOnly.procurement.label, /Lithium-battery transport/i);
    assert.match(passive.procurement.label, /customs classification/i);
});

test('consumer conclusion is driven by exact-model evidence answers', () => {
    const common = {
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: [],
        attributes: {
            productType: 'smart_watch', bluetooth: 'yes', battery: 'yes',
            medicalClaim: 'no', childUse: 'no'
        }
    };
    const verified = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    });
    const missing = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'no' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    });
    const unknown = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'unknown' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    });

    assert.equal(verified.consumerConclusion.code, 'yes_precheck');
    assert.equal(missing.consumerConclusion.code, 'not_yet');
    assert.equal(unknown.consumerConclusion.code, 'unable_to_confirm');
    assert.match(missing.consumerConclusion.reason, /FCC ID/);
});

test('commercial conclusion distinguishes profitable, low-margin and loss-making products', () => {
    const assessCosts = (saleUnit) => engine.assess({
        description: 'Simple electronic accessory without battery',
        market: 'US',
        platform: 'Amazon',
        attributes: { productType: 'wearable_other', battery: 'no', bluetooth: 'no', wifi: 'no', cellular: 'no' },
        costs: {
            currency: 'USD', quantity: 100, purchaseUnit: 10, saleUnit,
            freightTotal: 100, otherImportTotal: 0, dutyRate: 0,
            importTaxRate: 0, platformFeeRate: 10, otherSellingUnit: 1
        }
    });

    assert.equal(assessCosts(25).commercialConclusion.code, 'profitable');
    assert.equal(assessCosts(14).commercialConclusion.code, 'low_margin');
    assert.equal(assessCosts(12).commercialConclusion.code, 'loss_making');
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
    assert.equal(models.listProducts().filter((item) => item.id !== 'wearable_other').length, 10);
});

test('detects the four adjacent consumer-electronics categories', () => {
    assert.equal(engine.detectProductType('65W GaN wall charger'), 'charger');
    assert.equal(engine.detectProductType('10000mAh power bank portable charger'), 'power_bank');
    assert.equal(engine.detectProductType('rechargeable LED facial beauty device'), 'beauty_device');
    assert.equal(engine.detectProductType("children's electronic camera"), 'kids_electronics');
});

test('Japan and Singapore screens attach local official requirements', () => {
    const japan = engine.assess({
        description: 'Bluetooth 65W wall charger with AC input and no battery',
        market: 'JP', origin: 'CN', platform: 'Amazon',
        attributes: { productType: 'charger', bluetooth: 'yes', wifi: 'no', mainsPowered: 'yes' },
        documents: []
    });
    const singapore = engine.assess({
        description: 'Bluetooth smart watch with lithium battery and no medical claims',
        market: 'SG', origin: 'CN', platform: 'TikTok Shop',
        attributes: {
            bluetooth: 'yes', wifi: 'no', cellular: 'no', battery: 'yes',
            healthMonitoring: 'no', medicalClaim: 'no', childUse: 'no', cameraMic: 'no'
        },
        documents: []
    });
    assert.equal(japan.coverage, 'deep');
    assert.ok(japan.requirements.some((item) => item.id === 'jp_radio' && item.sources[0].authority.includes('Japan')));
    assert.ok(japan.requirements.some((item) => item.id === 'jp_pse'));
    assert.equal(singapore.coverage, 'deep');
    assert.ok(singapore.requirements.some((item) => item.id === 'sg_imda' && item.sources[0].url.includes('imda.gov.sg')));
});

test('supplier evidence remains unverified unless model text matches and flags mismatches', () => {
    const matched = engine.analyzeSupplierEvidence({
        files: [{ name: 'FCC-report.pdf', type: 'application/pdf', size: 1200 }],
        requiredModel: 'TW-01',
        supplierModel: 'TW-01'
    });
    const mismatch = engine.analyzeSupplierEvidence({
        files: [{ name: 'UN38.3.pdf', type: 'application/pdf', size: 1200 }],
        requiredModel: 'TW-01',
        supplierModel: 'TW-02'
    });
    assert.equal(matched[0].status, 'model_matched');
    assert.match(matched[0].note, /authenticity.*verification/);
    assert.equal(mismatch[0].status, 'suspected_mismatch');
});

test('platform rules are separated from legal market-access requirements', () => {
    const result = engine.assess({
        description: 'Bluetooth earbuds with lithium battery',
        market: 'US', origin: 'CN', platform: 'TikTok Shop',
        attributes: { productType: 'earbuds', bluetooth: 'yes', wifi: 'no', battery: 'yes', cameraMic: 'yes', wirelessCharging: 'no', noiseCancellation: 'no' },
        documents: []
    });
    assert.ok(result.platformRules.some((rule) => rule.id === 'tiktok-electronics'));
    assert.ok(result.platformRules.some((rule) => rule.id === 'tiktok-battery'));
    assert.ok(result.requirements.some((rule) => rule.id === 'fcc'));
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
