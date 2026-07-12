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
    buildOriginEvidenceGate,
    buildSpecialProgramDutyAdjustment,
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

test('adds EU Article 59a evidence for US-origin EU imports only', () => {
    const context = {
        importCountryCode: 'EU',
        importCountry: 'European Union',
        originCountryCode: 'US',
        originCountry: 'United States',
        hsCode: '854231',
        entryDate: '2026-07-10'
    };
    const gate = buildOriginEvidenceGate(context);
    assert.ok(gate);
    assert.match(gate.summary, /Article 59a|2026\/1455/);
    assert.equal(gate.annexMatched, true);
    assert.equal(gate.treatmentConfirmed, true);
    assert.equal(gate.annexConfirmationRequired, false);
    assert.equal(gate.scopeStatus, 'annex_matched');
    assert.ok(gate.annexMatches.some((row) => row.annex === 'I' && row.cnCode === '85'));
    assert.equal(gate.hsCode, '854231');
    assert.deepEqual(gate.declarationCodes.measureTypes, ['142', '145']);
    assert.equal(gate.declarationCodes.preferenceCode, '300');
    assert.equal(gate.declarationCodes.supportingDocument, 'U190');
    assert.equal(gate.treatments.length, 3);
    assert.match(gate.checklist.join(' '), /Annex I|direct-transport|non-alteration|ELAN|U190/i);
    assert.match(buildReviewChecklist(context).join(' '), /customs supervision|ELAN/i);
    assert.match(buildEvidenceList(context).join(' '), /official Annex|non-preferential|non-alteration|ELAN|U190/i);

    assert.equal(buildOriginEvidenceGate({ ...context, originCountryCode: 'CN' }), null);
    assert.equal(buildOriginEvidenceGate({ ...context, importCountryCode: 'US' }), null);

    const unlisted = buildOriginEvidenceGate({ ...context, hsCode: '010121' });
    assert.equal(unlisted.annexMatched, false);
    assert.equal(unlisted.treatmentConfirmed, false);
    assert.equal(unlisted.scopeStatus, 'not_listed_in_annex');
});

test('calculates a conditional Annex I duty saving without replacing the conservative duty result', () => {
    const value = calculatePostEntryValue({ incoterm: 'FOB', declaredAmount: 10000 });
    const duty = calculateDutyImpact(value, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '850760',
        entryDate: '07 / 10 / 26'
    }, { declaredDuty: 0 });

    assert.equal(duty.baseRate, 0.027);
    assert.equal(Number(duty.estimatedDuty.toFixed(2)), 2170);
    assert.equal(duty.specialProgramAdjustment.annex, 'I');
    assert.equal(duty.specialProgramAdjustment.adjustedBaseRate, 0);
    assert.equal(Number(duty.specialProgramAdjustment.adjustedEstimatedDuty.toFixed(2)), 1900);
    assert.equal(Number(duty.specialProgramAdjustment.potentialSavings.toFixed(2)), 270);
    assert.equal(duty.specialProgramAdjustment.calculationComplete, true);
    assert.match(duty.specialProgramAdjustment.summary, /Article 59a|2\.70% to 0%/i);
    assert.equal(duty.specialProgramAdjustment.eligibility.status, 'potentially_eligible');
});

test('promotes EU-US special treatment to eligible only when filing evidence is confirmed', () => {
    const value = calculatePostEntryValue({ incoterm: 'FOB', declaredAmount: 10000 });
    const duty = calculateDutyImpact(value, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '850760',
        entryDate: '07 / 10 / 26',
        originEvidenceConfirmed: true,
        transportEvidenceConfirmed: true,
        declarationCodesConfirmed: true,
        descriptionConfirmed: true
    }, { declaredDuty: 0 });

    assert.equal(duty.specialProgramAdjustment.eligibility.status, 'eligible');
    assert.equal(duty.specialProgramAdjustment.eligibility.missing.length, 0);
});

test('does not apply Regulation 2026/1455 before its effective date', () => {
    const value = calculatePostEntryValue({ incoterm: 'FOB', declaredAmount: 10000 });
    const duty = calculateDutyImpact(value, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '850760',
        entryDate: '06 / 30 / 26'
    }, { declaredDuty: 0 });

    assert.equal(duty.specialProgramAdjustment.scopeStatus, 'not_effective_on_entry_date');
    assert.equal(duty.specialProgramAdjustment.calculationComplete, false);
    assert.equal(duty.specialProgramAdjustment.adjustedEstimatedDuty, null);
});

test('keeps Annex II specific duty and Annex III quota availability as explicit gates', () => {
    const value = calculatePostEntryValue({ incoterm: 'FOB', declaredAmount: 10000 });
    const annexII = buildSpecialProgramDutyAdjustment(value, { baseRate: 0.088 }, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '07020000',
        entryDate: '2026-07-10'
    }, 0);
    assert.equal(annexII.annex, 'II');
    assert.equal(annexII.adjustedBaseRate, 0);
    assert.equal(Number(annexII.potentialSavings.toFixed(2)), 880);
    assert.equal(annexII.calculationComplete, false);
    assert.match(annexII.summary, /specific duty remains/i);

    const annexIIComplete = buildSpecialProgramDutyAdjustment(value, { baseRate: 0.088 }, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '07020000',
        entryDate: '2026-07-10',
        specificDutyConfirmed: true,
        netWeightKg: 500,
        specificDutyRatePer100Kg: 12
    }, 0);
    assert.equal(annexIIComplete.calculationComplete, true);
    assert.equal(annexIIComplete.specificDutyAmount, 60);
    assert.equal(annexIIComplete.adjustedEstimatedDuty, 60);
    assert.match(annexIIComplete.summary, /retained TARIC specific duty is 60\.00/i);

    const annexIIDutyImpact = calculateDutyImpact(value, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '07020000',
        entryDate: '2026-07-10',
        originEvidenceConfirmed: true,
        transportEvidenceConfirmed: true,
        declarationCodesConfirmed: true,
        specificDutyConfirmed: true,
        netWeightKg: 500,
        specificDutyRatePer100Kg: 12
    }, { declaredDuty: 0 });
    assert.equal(annexIIDutyImpact.covered, true);
    assert.equal(annexIIDutyImpact.estimatedDuty, 60);
    assert.equal(annexIIDutyImpact.sourceBreakdown.at(-1).status, 'conditional_program');

    const quotaPending = buildSpecialProgramDutyAdjustment(value, { baseRate: 0.12 }, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '02032219',
        entryDate: '2026-07-10'
    }, 0);
    assert.equal(quotaPending.annex, 'III');
    assert.equal(quotaPending.calculationComplete, true);
    assert.equal(quotaPending.adjustedEstimatedDuty, 0);
    assert.equal(quotaPending.eligibility.status, 'potentially_eligible');
    assert.ok(quotaPending.quotaStatus.some((row) => row.order_number === '09.9001' && row.available));
    assert.match(quotaPending.summary, /first-come, first-served/i);

    const quotaConfirmed = buildSpecialProgramDutyAdjustment(value, { baseRate: 0.12 }, {
        importCountryCode: 'EU',
        originCountryCode: 'US',
        hsCode: '02032219',
        entryDate: '2026-07-10',
        quotaAvailable: true
    }, 0);
    assert.equal(quotaConfirmed.calculationComplete, true);
    assert.equal(quotaConfirmed.adjustedBaseRate, 0);
    assert.equal(quotaConfirmed.adjustedEstimatedDuty, 0);
    assert.equal(quotaConfirmed.potentialSavings, 1200);
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

test('builds filing-grade focus for power, tablet, and chip tariff scopes', () => {
    const valueResult = calculatePostEntryValue({
        incoterm: 'FOB',
        declaredAmount: 10000
    });
    const context = {
        importCountryCode: 'US',
        originCountryCode: 'CN'
    };
    const powerDuty = calculateDutyImpact(valueResult, {
        ...context,
        hsCode: '850440'
    });
    const tabletDuty = calculateDutyImpact(valueResult, {
        ...context,
        hsCode: '847130'
    });
    const chipDuty = calculateDutyImpact(valueResult, {
        ...context,
        hsCode: '854231'
    });

    assert.match(powerDuty.filingGradeFocus, /power-conversion line/);
    assert.ok(powerDuty.filingGradeChecklist.some(item => /EV charger/.test(item)));
    assert.match(tabletDuty.filingGradeFocus, /portable ADP\/tablet/);
    assert.ok(tabletDuty.filingGradeChecklist.some(item => /wireless\/FCC/.test(item)));
    assert.match(chipDuty.filingGradeFocus, /integrated-circuit line/);
    assert.ok(chipDuty.filingGradeChecklist.some(item => /end-use/.test(item)));
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
    const programIndex = html.indexOf('id="post-entry-program-card"');
    const scopeIndex = html.indexOf('id="post-entry-scope-card"');
    const syncIndex = html.indexOf('id="post-entry-duty-sync-card"');
    const detailsIndex = html.indexOf('<details class="post-entry-detail-panel">');

    assert.ok(confidenceIndex > -1, 'rate confidence card should exist');
    assert.ok(programIndex > -1, 'special tariff treatment card should exist');
    assert.ok(scopeIndex > -1, 'scope checklist card should exist');
    assert.ok(syncIndex > -1, 'duty sync status card should exist');
    assert.ok(detailsIndex > -1, 'details panel should exist');
    assert.ok(confidenceIndex < detailsIndex, 'rate confidence card should appear before the collapsible details panel');
    assert.ok(programIndex < scopeIndex, 'special tariff treatment should appear before the supporting scope checklist');
    assert.ok(scopeIndex < detailsIndex, 'scope checklist card should appear before the collapsible details panel');
    assert.ok(syncIndex < detailsIndex, 'duty sync status should appear before the collapsible details panel');
});

test('Post-Entry exposes EU-US evidence inputs and three-state eligibility result', () => {
    const formHtml = fs.readFileSync(path.join(__dirname, '..', 'post-entry.html'), 'utf8');
    const resultHtml = fs.readFileSync(path.join(__dirname, '..', 'post-entry-result.html'), 'utf8');
    assert.match(formHtml, /post-entry-origin-evidence/);
    assert.match(formHtml, /post-entry-transport-evidence/);
    assert.match(formHtml, /post-entry-declaration-codes/);
    assert.match(resultHtml, /post-entry-program-eligibility/);
    assert.match(resultHtml, /Potentially eligible/);
});
