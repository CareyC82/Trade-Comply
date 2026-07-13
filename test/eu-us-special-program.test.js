'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    findAnnexMatches,
    findSpecificDutyRows,
    selectAutoSpecificDuty,
    resolveProgramTreatment
} = require('../lib/eu-us-special-program');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const program = dutyRates.special_programs.find((row) => row.id === 'EU-US-2026-1455');
const regression = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'eu-us-special-program-regression.json'), 'utf8'));

test('keeps high-risk product, date, route, and evidence eligibility regression cases stable', () => {
    assert.ok(regression.cases.length >= 15);
    regression.cases.forEach((row) => {
        const evidence = row.allEvidence ? {
            originEvidenceConfirmed: true,
            transportEvidenceConfirmed: true,
            declarationCodesConfirmed: true,
            descriptionConfirmed: row.descriptionConfirmed !== false,
            specificDutyConfirmed: true,
            quotaAvailable: row.quotaAvailable === undefined ? true : row.quotaAvailable
        } : {
            quotaAvailable: row.quotaAvailable === true,
            descriptionConfirmed: row.descriptionConfirmed === true
        };
        const result = resolveProgramTreatment({
            programs: dutyRates.special_programs,
            importCountry: row.importCountry,
            originCountry: row.originCountry,
            hsCode: row.hsCode,
            entryDate: row.entryDate,
            ...evidence
        });
        assert.equal(result.eligibility.status, row.expected, row.id);
    });
});

test('stores the complete official Regulation 2026/1455 Annex inventory', () => {
    assert.ok(program);
    assert.equal(program.scope_status, 'official_annex_parsed');
    assert.deepEqual(program.annex_counts, {
        annex_i: 150,
        annex_ii: 21,
        annex_iii: 71,
        quotas: 20
    });
    assert.equal(program.annexes.I.entries.length, 150);
    assert.equal(program.annexes.II.entries.length, 21);
    assert.equal(program.annexes.III.entries.length, 71);
    assert.match(program.annex_content_hash, /^[a-f0-9]{64}$/);
    assert.match(program.annex_source_url, /CELEX:32026R1455/);
});

test('resolves high-tech chapters and agricultural treatments without broad inference', () => {
    const highTech = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        importCountry: 'EU',
        originCountry: 'US',
        hsCode: '854231'
    });
    assert.equal(highTech.eligible, true);
    assert.equal(highTech.scopeStatus, 'annex_matched');
    assert.ok(highTech.matches.some((row) => row.annex === 'I' && row.cnCode === '85'));

    const tomatoes = findAnnexMatches(program, '07020000');
    assert.ok(tomatoes.some((row) => row.annex === 'II' && row.cnCode === '0702'));
    assert.ok(tomatoes.some((row) => Math.abs(row.suspendedAdValoremRate - 0.088) < 0.000001));

    const quota = findAnnexMatches(program, '02032219');
    assert.ok(quota.some((row) => row.annex === 'III' && row.orderNumber === '09.9001'));

    const unlisted = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        importCountry: 'EU',
        originCountry: 'US',
        hsCode: '010121'
    });
    assert.equal(unlisted.matched, false);
    assert.equal(unlisted.eligible, false);
    assert.equal(unlisted.scopeStatus, 'not_listed_in_annex');
});

test('requires product-description confirmation for ex CN entries', () => {
    const result = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        importCountry: 'DE',
        originCountry: 'US',
        hsCode: '290110'
    });
    assert.equal(result.matched, true);
    assert.equal(result.eligible, false);
    assert.equal(result.requiresDescriptionConfirmation, true);
    assert.equal(result.scopeStatus, 'description_confirmation_required');
    assert.ok(result.matches.some((row) => row.annex === 'I' && row.cnCode === 'ex 29'));
});

test('honors the program effective date in ISO and UI date formats', () => {
    const before = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        importCountry: 'EU',
        originCountry: 'US',
        hsCode: '850760',
        entryDate: '06 / 30 / 26'
    });
    const after = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        importCountry: 'EU',
        originCountry: 'US',
        hsCode: '850760',
        entryDate: '2026-07-01'
    });
    assert.equal(before.eligible, false);
    assert.equal(before.scopeStatus, 'not_effective_on_entry_date');
    assert.equal(after.eligible, true);
    assert.equal(after.scopeStatus, 'annex_matched');
});

test('resolves synchronized TARIC specific-duty rows by CN code and entry date', () => {
    const fixture = {
        ...program,
        specific_duty_status: {
            checked_at: '2026-07-13T00:00:00.000Z',
            rows: [{
                goods_code: '0702000000',
                start_date: '01-07-2026',
                end_date: '31-12-2026',
                duty: '12.500 EUR DTN',
                simple_specific_duty: {
                    amount: 12.5,
                    currency: 'EUR',
                    unit: 'DTN',
                    rate_per_100kg: 12.5
                }
            }]
        }
    };
    const rows = findSpecificDutyRows(fixture, '07020000', '07 / 13 / 26');
    assert.equal(rows.length, 1);
    assert.equal(selectAutoSpecificDuty(rows).rate_per_100kg, 12.5);

    const result = resolveProgramTreatment({
        programs: [fixture],
        importCountry: 'EU',
        originCountry: 'US',
        hsCode: '07020000',
        entryDate: '2026-07-13',
        originEvidenceConfirmed: true,
        transportEvidenceConfirmed: true,
        declarationCodesConfirmed: true
    });
    assert.equal(result.autoSpecificDuty.rate_per_100kg, 12.5);
    assert.equal(result.eligibility.missing.includes('Annex II TARIC specific-duty amount'), false);
});

test('keeps committed Annex II exact, Annex III quota, and conditional-duty paths distinct', () => {
    const commonEvidence = {
        importCountry: 'EU',
        originCountry: 'US',
        entryDate: '2026-07-13',
        originEvidenceConfirmed: true,
        transportEvidenceConfirmed: true,
        declarationCodesConfirmed: true,
        descriptionConfirmed: true
    };

    const exactAnnexIi = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        ...commonEvidence,
        hsCode: '0806101005'
    });
    assert.ok(exactAnnexIi.matches.some((row) => row.annex === 'II'));
    assert.equal(exactAnnexIi.autoSpecificDuty?.rate_per_100kg, 0);
    assert.equal(exactAnnexIi.eligibility.status, 'eligible');

    const quotaAnnexIii = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        ...commonEvidence,
        hsCode: '02032219',
        quotaAvailable: true
    });
    assert.ok(quotaAnnexIii.matches.some((row) => row.annex === 'III' && row.orderNumber === '09.9001'));
    assert.equal(quotaAnnexIii.quotaAlert, 'available');
    assert.equal(quotaAnnexIii.eligibility.status, 'eligible');

    const conditionalAnnexIi = resolveProgramTreatment({
        programs: dutyRates.special_programs,
        ...commonEvidence,
        hsCode: '07020000'
    });
    assert.ok(conditionalAnnexIi.matches.some((row) => row.annex === 'II'));
    assert.equal(conditionalAnnexIi.autoSpecificDuty, null);
    assert.equal(conditionalAnnexIi.eligibility.status, 'potentially_eligible');
    assert.ok(conditionalAnnexIi.eligibility.missing.includes('Annex II TARIC specific-duty amount'));
});
