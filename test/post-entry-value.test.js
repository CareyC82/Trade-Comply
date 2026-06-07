const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculatePostEntryValue,
    calculateDutyImpact,
    normalizeIncoterm,
    loadDutyRules,
    buildReviewChecklist,
    buildValuationMethod,
    buildComplianceMeaning,
    buildRecommendedAction,
    buildExportPostEntryReview,
    buildEvidenceList
} = require('../lib/post-entry-value');

test('normalizes unsupported incoterm to FOB', () => {
    assert.equal(normalizeIncoterm('bad'), 'FOB');
    assert.equal(normalizeIncoterm(' cif '), 'CIF');
});

test('calculates EXW customs value with freight insurance and other charges', () => {
    const result = calculatePostEntryValue({
        incoterm: 'EXW',
        declaredAmount: 1000,
        freight: 120,
        insurance: 20,
        otherCharges: 30
    });

    assert.equal(result.customsValue, 1170);
    assert.equal(result.exportRebateBase, 1000);
    assert.equal(result.difference, 170);
    assert.equal(result.risk.level, 'High');
});

test('calculates FOB customs value and keeps FOB rebate base', () => {
    const result = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 2000,
        freight: 100,
        insurance: 20,
        otherCharges: 0
    });

    assert.equal(result.customsValue, 2120);
    assert.equal(result.exportRebateBase, 2000);
    assert.equal(result.risk.level, 'Review Required');
});

test('calculates CIF customs value and FOB-equivalent rebate base', () => {
    const result = calculatePostEntryValue({
        incoterm: 'CIF',
        declaredAmount: 5000,
        freight: 300,
        insurance: 50,
        otherCharges: 40
    });

    assert.equal(result.customsValue, 5040);
    assert.equal(result.exportRebateBase, 4650);
    assert.equal(result.risk.level, 'Low Variance');
});

test('checklist reminds user to verify HS code first', () => {
    const checklist = buildReviewChecklist({
        hsCode: '850760',
        entryDate: '2026-06-06'
    });

    assert.match(checklist[0], /HS Code tool/);
    assert.match(checklist[1], /2026-06-06/);
});

test('adds valuation and evidence context for US import review', () => {
    const result = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 2000,
        freight: 100,
        insurance: 20,
        otherCharges: 0
    });
    const context = {
        importCountryCode: 'US',
        importCountry: 'United States'
    };

    assert.match(buildValuationMethod(result, context), /transaction-value/i);
    assert.match(buildComplianceMeaning(result), /reconciled/i);
    assert.match(buildRecommendedAction(result), /Amend/i);
    assert.match(buildEvidenceList(context).join(' '), /Customs entry/);
});

test('calculates indicative duty impact for US imports from China', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 2000,
        freight: 100,
        insurance: 20,
        otherCharges: 0
    });
    const duty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '850760',
        entryDate: '2026-06-06'
    }, {
        declaredDuty: 0
    });

    assert.equal(duty.covered, true);
    assert.equal(duty.totalRate, 0.109);
    assert.equal(duty.baseRate, 0.034);
    assert.equal(duty.additionalRate, 0.075);
    assert.equal(Number(duty.baseDuty.toFixed(2)), 72.08);
    assert.equal(Number(duty.addOnDuty.toFixed(2)), 159);
    assert.equal(Number(duty.estimatedDuty.toFixed(2)), 231.08);
    assert.equal(duty.addOnLayers[0].type, 'section_301');
    assert.match(duty.tradeRemedy, /Section 301/);
    assert.ok(duty.sourceBreakdown.some(source => source.label === 'Base duty' && source.status === 'official_source_checked'));
    assert.ok(duty.sourceBreakdown.some(source => /Section 301/.test(source.label) && source.status === 'indicative'));
});

test('keeps AD/CVD as a flag-only add-on layer', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 10000
    });
    const duty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '854143'
    });

    assert.equal(duty.covered, true);
    assert.equal(duty.addOnLayers.some(layer => layer.type === 'section_301' && layer.amount === 2500), true);
    assert.equal(duty.flagOnlyLayers.some(layer => layer.type === 'ad_cvd'), true);
    assert.equal(duty.estimatedDuty, 2500);
    assert.ok(duty.sourceBreakdown.some(source => /AD\/CVD/.test(source.label) && source.status === 'scope_check_required'));
});

test('loads duty rules from maintainable data file', () => {
    const rules = loadDutyRules();
    assert.ok(rules.some(rule => rule.id === 'US-CN-850760-LIB-INDICATIVE'));
    assert.ok(rules.every(rule => Array.isArray(rule.hsPrefixes)));
});

test('returns explicit not covered duty result for unknown route', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 1000
    });
    const duty = calculateDutyImpact(valueResult, {
        importCountryCode: 'NL',
        originCountryCode: 'MX',
        hsCode: '830140'
    });

    assert.equal(duty.covered, false);
    assert.match(duty.conclusion, /cannot be estimated/);
    assert.equal(duty.sourceBreakdown[0].status, 'not_covered');
});

test('builds US export-side post-entry review without treating it as import duty', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'CIF',
        declaredAmount: 5000,
        freight: 300,
        insurance: 50
    });
    const review = buildExportPostEntryReview(valueResult, {
        originCountryCode: 'US',
        originCountry: 'United States',
        importCountry: 'Germany',
        hsCode: '8542',
        entryDate: '2026-06-06'
    });

    assert.equal(review.covered, true);
    assert.match(review.impact, /AES\/EEI/);
    assert.match(review.complianceMeaning, /ECCN\/license/);
    assert.match(review.action, /AES correction/);
    assert.ok(review.evidence.some(item => /ITN/.test(item)));
});
