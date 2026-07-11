'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    findAnnexMatches,
    resolveProgramTreatment
} = require('../lib/eu-us-special-program');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const program = dutyRates.special_programs.find((row) => row.id === 'EU-US-2026-1455');

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
