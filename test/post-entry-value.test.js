const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    calculatePostEntryValue,
    calculateDutyImpact,
    normalizeIncoterm,
    loadDutyRules,
    buildReviewChecklist,
    buildValuationMethod,
    buildComplianceMeaning,
    buildRecommendedAction,
    classifyRateSourceTrust,
    buildImportPostEntryDecision,
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
    assert.match(duty.filingGradeFocus, /battery chemistry/);
    assert.match(duty.filingGradeFocus, /Section 301/);
    assert.ok(duty.sourceBreakdown.some(source => source.label === 'General duty' && source.status === 'official_source_checked'));
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
    assert.match(duty.filingGradeFocus, /AD\/CVD/);
    assert.match(duty.filingGradeFocus, /UFLPA/);
    assert.ok(duty.sourceBreakdown.some(source => /AD\/CVD/.test(source.label) && source.status === 'scope_check_required'));
});

test('builds scope checklist for official-heading-only US product rates', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 10000
    });
    const solarDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '854143'
    });
    const droneDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '880622'
    });

    assert.match(solarDuty.filingGradeFocus, /AD\/CVD case scope/);
    assert.ok(solarDuty.filingGradeChecklist.some(item => /UFLPA/.test(item)));
    assert.match(droneDuty.filingGradeFocus, /Chapter 99/);
    assert.ok(droneDuty.filingGradeChecklist.some(item => /8806/.test(item)));
    assert.equal(classifyRateSourceTrust(droneDuty.sourceBreakdown).level, 'official_heading_only');
});

test('uses exact TARIC override when a precise EU code is entered', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 3000,
        freight: 120,
        insurance: 20
    });
    const prefixDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'DE',
        originCountryCode: 'CN',
        hsCode: '8528'
    });
    const exactDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'DE',
        originCountryCode: 'CN',
        hsCode: '8528521000'
    });

    assert.ok(prefixDuty.sourceBreakdown.some(source => source.status === 'scope_check_required'));
    assert.ok(exactDuty.sourceBreakdown.some(source => source.component === 'base_duty' && source.status === 'official_source_checked'));
    assert.equal(exactDuty.baseRate, 0);
    assert.equal(classifyRateSourceTrust(exactDuty.sourceBreakdown).level, 'official_duty_tax_estimate');
});

test('splits US duty source rows into general duty, Section 301, and scope flags', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 10000
    });
    const duty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '854143',
        entryDate: '2026-06-12'
    });

    const components = duty.sourceBreakdown.map(source => source.component);
    assert.ok(components.includes('base_duty'));
    assert.ok(components.includes('section_301'));
    assert.ok(components.includes('ad_cvd'));
    assert.ok(duty.sourceBreakdown.some(source => source.label === 'General duty' && source.hts));
    assert.ok(duty.sourceBreakdown.every(source => 'lastCheckedAt' in source));
});

test('classifies Post-Entry rate trust tiers', () => {
    assert.equal(classifyRateSourceTrust([{ status: 'official_source_checked' }]).level, 'official_exact');
    assert.equal(classifyRateSourceTrust([{ status: 'official_source_checked' }, { status: 'indicative' }]).level, 'mixed_official_estimate');
    assert.equal(classifyRateSourceTrust([
        { component: 'base_duty', status: 'official_source_checked' },
        { component: 'import_vat', status: 'indicative' }
    ]).level, 'official_duty_tax_estimate');
    assert.equal(classifyRateSourceTrust([{ status: 'scope_check_required' }]).level, 'official_heading_only');
    assert.equal(classifyRateSourceTrust([{ status: 'official_link_checked' }]).level, 'official_link_estimate');
    assert.equal(classifyRateSourceTrust([{ status: 'benchmark_source_checked' }]).level, 'precheck_estimate');
    assert.equal(classifyRateSourceTrust([{ status: 'not_covered' }]).level, 'not_covered');
});

test('builds direct import decision for official and benchmark rate sources', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 2000,
        freight: 100,
        insurance: 20
    });
    const usDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'US',
        originCountryCode: 'CN',
        hsCode: '850760'
    }, {
        declaredDuty: 0
    });
    const usDecision = buildImportPostEntryDecision(valueResult, usDuty, { currency: 'USD' });
    assert.match(usDecision.coreConclusion, /Estimated duty shortfall/);
    assert.match(usDecision.coreConclusion, /value gap/);
    assert.equal(usDecision.trust.level, 'mixed_official_estimate');
    assert.match(usDecision.nextAction, /battery chemistry/);
    assert.match(usDecision.nextAction, /Section 301/);

    const sgDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'SG',
        originCountryCode: 'CN',
        hsCode: '851762'
    }, {
        declaredDuty: 0
    });
    const sgDecision = buildImportPostEntryDecision(valueResult, sgDuty, { currency: 'USD' });
    assert.equal(sgDecision.trust.level, 'official_duty_tax_estimate');
    assert.match(sgDecision.coreConclusion, /Official duty \+ tax estimate/);

    const euDuty = calculateDutyImpact(valueResult, {
        importCountryCode: 'EU',
        originCountryCode: 'CN',
        hsCode: '850760'
    }, {
        declaredDuty: 0
    });
    const euDecision = buildImportPostEntryDecision(valueResult, euDuty, { currency: 'EUR' });
    assert.equal(euDecision.trust.level, 'official_duty_tax_estimate');
    assert.match(euDecision.coreConclusion, /Official duty \+ tax estimate/);
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

test('Post-Entry result shows rate confidence without opening details', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'post-entry-result.html'), 'utf8');
    const confidenceIndex = html.indexOf('id="post-entry-confidence-card"');
    const scopeIndex = html.indexOf('id="post-entry-scope-card"');
    const syncIndex = html.indexOf('id="post-entry-duty-sync-card"');
    const detailsIndex = html.indexOf('<details class="post-entry-detail-panel">');

    assert.ok(confidenceIndex > -1, 'rate confidence card should exist');
    assert.ok(scopeIndex > -1, 'scope checklist card should exist');
    assert.ok(syncIndex > -1, 'duty sync status card should exist');
    assert.ok(detailsIndex > -1, 'details panel should exist');
    assert.ok(confidenceIndex < detailsIndex, 'rate confidence card should appear before the collapsible details panel');
    assert.ok(scopeIndex < detailsIndex, 'scope checklist card should appear before the collapsible details panel');
    assert.ok(syncIndex < detailsIndex, 'duty sync status should appear before the collapsible details panel');
});
