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

test('consumer page shows preliminary value before optional supplier evidence', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'can-i-sell-it.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.match(page, /Initial coverage/);
    assert.match(page, /consumer electronics, smart devices, wireless and battery products/i);
    assert.match(script, /renderFactQuestions/);
    assert.match(script, /renderEvidenceQuestions\(preliminary\.profile\)/);
    assert.match(script, /renderAssessment\(preliminary\)/);
    assert.match(page, /Improve accuracy/);
});

test('result page uses preliminary seller language and direct sales-channel comparison', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.match(script, /Preliminary market-access result/);
    assert.doesNotMatch(script, /Can I legally sell it\?/);
    assert.match(script, /Can I list it on this channel\?/);
    assert.match(script, /What should I verify before paying\?/);
    assert.match(script, /id="sell-result-platform"/);
    assert.match(script, /latestAssessmentInput\s*=\s*\{\s*\.\.\.latestAssessmentInput,\s*platform\s*\}/);
});

test('seller conclusion uses four bounded result states and warns outside initial coverage', () => {
    const unsupported = engine.assess({
        description: 'cotton summer dress', market: 'US', platform: 'Amazon',
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
    const child = engine.assess({
        description: 'children smart watch with GPS and battery', market: 'US', platform: 'Amazon',
        assessmentMode: 'quick', blockingQuestionKeys: [], attributes: { childUse: 'yes' }
    });
    assert.equal(unsupported.coverageStatus.supported, false);
    assert.equal(unsupported.sellerConclusion.code, 'not_enough_information');
    assert.equal(child.sellerConclusion.code, 'high_risk');
    assert.match(unsupported.disclaimer, /not customs or legal advice/i);
});

test('non-electronic launch exclusions never inherit an electronics sellability result', () => {
    ['cotton summer dress', 'red lipstick cosmetic', 'wooden toy building blocks'].forEach((description) => {
        const result = engine.assess({ description, market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] });
        assert.equal(result.coverageStatus.supported, false, description);
        assert.equal(result.coverageStatus.code, 'outside_initial_scope', description);
        assert.equal(result.sellerConclusion.code, 'not_enough_information', description);
        assert.match(result.coverageStatus.detail, /outside the current electronics and smart-device models/i);
    });
});

test('complimentary review CTA copies only a non-confidential local summary', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.match(script, /Request a complimentary review/);
    assert.match(script, /Nothing is uploaded or sent automatically/);
    const library = fs.readFileSync(path.join(__dirname, '..', 'lib', 'can-i-sell-it.js'), 'utf8');
    assert.match(library, /intentionally excludes supplier identity, pricing and uploaded files/);
    assert.match(script, /carey@tracewize\.com/);
    assert.match(script, /mailto:/);
    assert.match(script, /reviewContact\.mailto/);
    assert.match(script, /review and send it yourself in your email app/i);
    assert.doesNotMatch(script, /api\(['"]\/review/);
});

test('complimentary review contact is local, encoded and inspectable before sending', () => {
    const contact = engine.buildReviewContact({
        description: 'Bluetooth watch & charger', origin: 'CN', market: 'US',
        platform: 'Amazon', productLabel: 'Smart watch', resultLabel: 'Conditional — evidence required'
    });
    assert.equal(contact.email, 'carey@tracewize.com');
    assert.match(contact.mailto, /^mailto:carey@tracewize\.com\?subject=/);
    assert.match(contact.mailto, /&body=/);
    assert.equal(decodeURIComponent(contact.mailto.split('&body=')[1]), contact.text);
    assert.match(contact.text, /intentionally excludes supplier identity, pricing and uploaded files/);
});

test('review CTA has a one-column mobile action layout without fixed-width overflow', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    assert.match(css, /\.sell-review-actions\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
    assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.sell-review-actions\s*\{[^}]*grid-template-columns:\s*1fr/s);
    assert.match(css, /\.sell-review-actions button,\s*\.sell-review-actions a\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/s);
});

test('consumer result matrix stays differentiated across ten products, four markets and four channels', () => {
    const products = engine.buildAssessmentMatrix();
    const channels = ['Amazon', 'TikTok Shop', 'Shopify / own store', 'Other marketplace'];
    const results = products.flatMap((entry) => channels.map((platform) => engine.assess({
        description: entry.label,
        market: entry.market,
        platform,
        assessmentMode: 'quick',
        blockingQuestionKeys: [],
        attributes: { productType: entry.productType, childUse: entry.productType.startsWith('kids_') ? 'yes' : 'no' }
    })));
    assert.equal(results.length, 160);
    assert.ok(results.every((result) => ['likely_eligible', 'conditional', 'high_risk'].includes(result.sellerConclusion.code)));
    assert.deepEqual(new Set(results.map((result) => result.platformDecision.code)), new Set(['evidence_needed', 'ready', 'policy_unknown', 'not_ready']));
});

test('known wireless and battery requirements lead the preliminary result before unanswered facts', () => {
    const result = engine.assess({
        description: 'Smart watch with Bluetooth, rechargeable lithium battery, heart-rate tracking and no medical claims.',
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: ['childUse', 'cellular']
    });
    assert.equal(result.sellerConclusion.code, 'conditional');
    assert.match(result.sellerConclusion.reason, /FCC authorization and RF-exposure evidence/);
    assert.match(result.sellerConclusion.reason, /UN38\.3 and carrier battery-shipping evidence/);
    assert.ok(result.unanswered.some((item) => item.key === 'childUse'));
    assert.doesNotMatch(result.sellerConclusion.reason, /^Is it designed for children\??$/i);
});

test('result page exposes a copyable supplier evidence request', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'can-i-sell-it.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    assert.match(page, /Supplier \/ manufacturer legal name/);
    assert.match(script, /sell-copy-supplier-request/);
    assert.match(script, /supplierRequest\.message/);
    assert.match(script, /navigator\.clipboard\.writeText/);
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

test('confirmed no-wireless and no-battery facts remove FCC and UN38.3 evidence questions', () => {
    const profile = {
        productType: 'smart_glasses', bluetooth: false, wifi: false, cellular: false,
        battery: false, medicalClaim: false, childUse: false, cameraMic: false
    };
    const requirements = engine.marketRequirements('US', profile);
    const evidence = engine.evidenceQuestionsForRequirements(requirements);
    assert.ok(!requirements.some((item) => item.id === 'fcc'));
    assert.ok(!requirements.some((item) => item.id === 'battery'));
    assert.ok(!evidence.some((item) => ['fccGrant', 'rfExposure', 'batteryTransport'].includes(item.key)));
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

    assert.equal(verified.consumerConclusion.code, 'provisionally_ready');
    assert.match(verified.consumerConclusion.reason, /answers only/i);
    assert.equal(missing.consumerConclusion.code, 'not_yet');
    assert.equal(unknown.consumerConclusion.code, 'unable_to_confirm');
    assert.match(missing.consumerConclusion.reason, /FCC ID/);
});

test('uploaded exact-model files can upgrade a supplier claim to document-match checked', () => {
    const result = engine.assess({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: {
            productType: 'smart_watch', bluetooth: 'yes', battery: 'yes',
            medicalClaim: 'no', childUse: 'no'
        },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        },
        supplierEvidence: {
            requiredModel: 'SW-100', supplierModel: 'SW-100',
            files: [
                { name: 'SW-100-FCC-report.pdf', type: 'application/pdf', status: 'parsed', parsing: { model: 'SW-100', manufacturer: 'Example Electronics', reportNumber: 'FCC-100', reportDate: '2026-06-01', standards: ['FCC Part 15'], modelMatch: true, documentKind: 'FCC', missingFields: [] } },
                { name: 'SW-100-UN38.3.pdf', type: 'application/pdf', status: 'parsed', parsing: { model: 'SW-100', manufacturer: 'Example Electronics', reportNumber: 'UN-100', reportDate: '2026-06-01', standards: ['UN38.3'], modelMatch: true, documentKind: 'UN38.3', missingFields: [] } }
            ]
        }
    });

    assert.equal(result.consumerConclusion.code, 'evidence_checked');
    assert.match(result.consumerConclusion.reason, /model-reference check/i);
});

test('assessment matrix covers ten products across all four deep markets', () => {
    const matrix = engine.buildAssessmentMatrix();
    assert.equal(matrix.length, 40);
    assert.deepEqual(new Set(matrix.map((item) => item.market)), new Set(['US', 'EU', 'JP', 'SG']));
    assert.equal(new Set(matrix.map((item) => item.productType)).size, 10);

    const smartWatch = Object.fromEntries(matrix
        .filter((item) => item.productType === 'smart_watch')
        .map((item) => [item.market, item.evidenceQuestions.map((question) => question.key)]));
    assert.ok(smartWatch.US.includes('fccGrant'));
    assert.ok(smartWatch.EU.includes('redEvidence'));
    assert.ok(smartWatch.EU.includes('rohsEvidence'));
    assert.ok(smartWatch.EU.includes('euResponsiblePerson'));
    assert.ok(smartWatch.JP.includes('jpRadioEvidence'));
    assert.ok(smartWatch.SG.includes('sgImdaEvidence'));
    Object.values(smartWatch).forEach((questions) => assert.ok(questions.includes('batteryTransport')));
});

test('child-directed answer explains why specialist review overrides positive evidence answers', () => {
    const result = engine.assess({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US',
        platform: 'Amazon',
        assessmentMode: 'quick',
        blockingQuestionKeys: [],
        attributes: {
            productType: 'smart_watch', bluetooth: 'yes', battery: 'yes',
            medicalClaim: 'no', childUse: 'yes'
        },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3 test summary', value: 'yes' }
        }
    });

    assert.equal(result.consumerConclusion.code, 'specialist_review');
    assert.match(result.consumerConclusion.label, /Children’s product/);
    assert.match(result.consumerConclusion.reason, /Designed for children.*Yes/);
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

test('decision trace explains facts, evidence claims and final conclusion', () => {
    const result = engine.assess({
        description: 'Bluetooth smart watch with rechargeable lithium battery. No medical claims.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'smart_watch', bluetooth: 'yes', battery: 'yes', medicalClaim: 'no', childUse: 'no' },
        evidenceAnswers: {
            fccGrant: { label: 'FCC ID / Grant', value: 'yes' },
            rfExposure: { label: 'RF exposure / SAR evidence', value: 'yes' },
            batteryTransport: { label: 'UN38.3', value: 'unknown' }
        }
    });
    assert.ok(result.decisionTrace.some((step) => /Bluetooth.*FCC/.test(step)));
    assert.ok(result.decisionTrace.some((step) => /UN38\.3/.test(step)));
    assert.ok(result.decisionTrace.some((step) => /2 Yes.*1 Not sure/.test(step)));
    assert.match(result.decisionTrace.at(-1), /UNABLE TO CONFIRM/);
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
        files: [{ name: 'FCC-report.pdf', type: 'application/pdf', size: 1200, status: 'parsed', parsing: { model: 'TW-01', modelMatch: true, documentKind: 'FCC', missingFields: ['report/issue date'] } }],
        requiredModel: 'TW-01',
        supplierModel: 'TW-01'
    });
    const mismatch = engine.analyzeSupplierEvidence({
        files: [{ name: 'UN38.3.pdf', type: 'application/pdf', size: 1200 }],
        requiredModel: 'TW-01',
        supplierModel: 'TW-02'
    });
    assert.equal(matched[0].status, 'incomplete_verification');
    assert.match(matched[0].note, /missing report\/issue date/i);
    assert.equal(mismatch[0].status, 'suspected_mismatch');
});

test('supplier request names missing and failed exact-model evidence', () => {
    const result = engine.assess({
        description: 'Bluetooth earbuds with rechargeable lithium battery.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [],
        attributes: { productType: 'earbuds', bluetooth: 'yes', battery: 'yes', childUse: 'no' },
        evidenceAnswers: {
            amazonListingApproval: { value: 'yes' }, amazonDangerousGoods: { value: 'yes' },
            fccGrant: { value: 'yes' }, rfExposure: { value: 'yes' }, batteryTransport: { value: 'yes' }
        },
        supplierEvidence: {
            requiredModel: 'EB-10', supplierName: 'Example Electronics',
            files: [{
                name: 'fcc.pdf', type: 'application/pdf', status: 'parsed',
                parsing: { model: 'EB-10', manufacturer: 'Different Factory', reportNumber: 'R-1', reportDate: '2026-01-01', standards: ['FCC Part 15'], documentKind: 'FCC', modelMatch: true, missingFields: [] }
            }]
        }
    });
    assert.equal(result.supplierEvidence[0].status, 'verification_failed');
    assert.match(result.supplierEvidence[0].note, /holder does not match/i);
    assert.equal(result.consumerConclusion.code, 'not_yet');
    assert.equal(result.procurement.code, 'market_not_ready');
    assert.ok(result.supplierRequest.items.some((item) => /FCC/.test(item.document)));
    assert.ok(result.supplierRequest.items.some((item) => /UN38/.test(item.document)));
    assert.match(result.supplierRequest.message, /EB-10/);
});

test('supplier request is complete only when all reviewable files pass', () => {
    const requirements = engine.marketRequirements('US', { productType: 'earbuds', bluetooth: true, wifi: false, cellular: false, battery: true });
    const evidenceAnswers = Object.fromEntries(engine.evidenceQuestionsForRequirements(requirements).map((question) => [question.key, { value: 'yes' }]));
    const files = ['FCC', 'UN38.3'].map((documentKind) => ({
        name: `${documentKind}.pdf`, type: 'application/pdf', status: 'parsed',
        parsing: { model: 'EB-10', manufacturer: 'Example Electronics', reportNumber: `R-${documentKind}`, reportDate: '2026-01-01', standards: ['Applicable standard'], documentKind, modelMatch: true, missingFields: [] }
    }));
    const checked = engine.analyzeSupplierEvidence({ files, requiredModel: 'EB-10', supplierName: 'Example Electronics', market: 'US' });
    const request = engine.buildSupplierRequest({ requirements, evidenceAnswers, supplierEvidence: checked, requiredModel: 'EB-10', market: 'US', platform: 'Shopify / own store', profile: { battery: true } });
    assert.equal(request.complete, true);
    assert.equal(request.items.length, 0);
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

test('sales channels produce distinct visible listing decisions', () => {
    const common = {
        description: 'Bluetooth earbuds with lithium battery',
        market: 'US', origin: 'CN',
        attributes: { productType: 'earbuds', bluetooth: 'yes', wifi: 'no', battery: 'yes' },
        documents: []
    };
    const amazon = engine.assess({ ...common, platform: 'Amazon' });
    const tiktok = engine.assess({ ...common, platform: 'TikTok Shop' });
    const ownStore = engine.assess({ ...common, platform: 'Shopify / own store' });
    const other = engine.assess({ ...common, platform: 'Other marketplace' });

    assert.equal(amazon.platformGateDecision.code, 'evidence_needed');
    assert.match(amazon.platformGateDecision.reason, /dangerous-goods/i);
    assert.equal(tiktok.platformGateDecision.code, 'evidence_needed');
    assert.match(tiktok.platformGateDecision.reason, /battery-declaration/i);
    assert.equal(ownStore.platformGateDecision.code, 'ready');
    assert.match(ownStore.platformGateDecision.reason, /legal market access/i);
    assert.equal(other.platformGateDecision.code, 'policy_unknown');
    assert.ok([amazon, tiktok, ownStore, other].every((item) => item.platformDecision.code === 'not_ready'));
});

test('platform evidence answers produce ready, evidence-needed and not-ready states', () => {
    const common = {
        description: 'Bluetooth earbuds with lithium battery',
        market: 'US', origin: 'CN', platform: 'Amazon',
        attributes: { productType: 'earbuds', bluetooth: 'yes', wifi: 'no', battery: 'yes' },
        documents: [], assessmentMode: 'quick', blockingQuestionKeys: []
    };
    const questions = engine.platformEvidenceQuestions('Amazon', engine.assess(common).profile);
    assert.deepEqual(questions.map((item) => item.key), ['amazonListingApproval', 'amazonDangerousGoods']);

    const ready = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: 'yes', rfExposure: 'yes', batteryTransport: 'yes',
            amazonListingApproval: 'yes', amazonDangerousGoods: 'yes'
        }
    });
    const blocked = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: 'yes', rfExposure: 'yes', batteryTransport: 'yes',
            amazonListingApproval: 'no', amazonDangerousGoods: 'yes'
        }
    });
    const uncertain = engine.assess({
        ...common,
        evidenceAnswers: {
            fccGrant: 'yes', rfExposure: 'yes', batteryTransport: 'yes',
            amazonListingApproval: 'yes', amazonDangerousGoods: 'unknown'
        }
    });

    assert.equal(ready.platformDecision.answer, 'READY TO LIST');
    assert.equal(blocked.platformDecision.answer, 'NOT READY TO LIST');
    assert.equal(uncertain.platformDecision.answer, 'MORE EVIDENCE NEEDED');
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
    assert.equal(result.procurement.code, 'market_not_ready');
    assert.ok(result.contractConditions.some((line) => /exact ordered model/.test(line)));
});
