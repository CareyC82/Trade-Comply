'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseExactTariffRows,
    selectExactTariffLine,
    applyExactTariffRows
} = require('../lib/exact-tariff-lines');
const { syncExactNationalTariffs } = require('../scripts/update-exact-national-tariffs');

test('parses official EU, China, Singapore, and Mexico exact tariff line fields', () => {
    const fixtures = [
        ['EU', { taric_code: '8542319000', third_country_duty: '3.2%' }],
        ['CN', { 税则号列: '8542319000', mfn_rate: 0 }],
        ['SG', { ahtn_code: '85423100', customs_duty_rate: 'Free' }],
        ['MX', { tigie_code: '85423101', igi_rate: '5%' }]
    ];
    fixtures.forEach(([country, row]) => {
        const parsed = parseExactTariffRows({
            complete: true,
            source: { name: 'Official customs authority', url: 'https://official.example/tariff' },
            effective_from: '2026-01-01',
            rows: [row]
        }, { country, checkedAt: '2026-07-25T00:00:00.000Z' });
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].source_status, 'official_source_checked');
        assert.equal(parsed[0].effective_from, '2026-01-01');
    });
});

test('rejects heading-only and conflicting tariff rows from filing-grade promotion', () => {
    assert.throws(() => parseExactTariffRows({
        complete: true,
        source: { url: 'https://official.example/tariff' },
        rows: [{ hs_code: '854231', duty_rate: 0 }]
    }, { country: 'SG' }), /exact 8\/10 digit/);
    assert.throws(() => parseExactTariffRows({
        complete: true,
        source: { url: 'https://official.example/tariff' },
        rows: [
            { hs_code: '85423100', duty_rate: 0 },
            { hs_code: '85423100', duty_rate: '5%' }
        ]
    }, { country: 'SG' }), /conflicting rates/);
});

test('selects only one exact effective tariff line', () => {
    const rows = parseExactTariffRows({
        complete: true,
        source: { url: 'https://official.example/tariff' },
        rows: [{ hs_code: '85423100', duty_rate: '2%', effective_from: '2026-01-01' }]
    }, { country: 'SG' });
    assert.equal(selectExactTariffLine(rows, '85423100', { entryDate: '2026-07-01' }).base_rate, 0.02);
    assert.equal(selectExactTariffLine(rows, '854231', { entryDate: '2026-07-01' }), null);
    assert.equal(selectExactTariffLine(rows, '85423100', { entryDate: '2025-12-31' }), null);
});

test('official national sync applies exact rows only to matching market rules', async () => {
    const dutyPayload = {
        rules: [
            { id: 'sg-chip', import_country: 'SG', hs_prefixes: ['854231'], exact_code_overrides: [] },
            { id: 'mx-chip', import_country: 'MX', hs_prefixes: ['854231'], exact_code_overrides: [] }
        ]
    };
    const result = await syncExactNationalTariffs({
        dutyPayload,
        env: { SG_AHTN_EXACT_TARIFF_URL: 'https://official.example/sg.json' },
        countries: ['SG'],
        dryRun: true,
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                complete: true,
                source: { url: 'https://tablebuilder.singstat.gov.sg/' },
                rows: [{ ahtn_code: '85423100', duty_rate: 0 }]
            })
        })
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.results[0].changed_rules, ['sg-chip']);
    assert.equal(dutyPayload.rules[0].exact_code_overrides[0].hs_code, '85423100');
    assert.deepEqual(dutyPayload.rules[1].exact_code_overrides, []);
});

test('official exact sync preserves shorter maintained search candidates', () => {
    const payload = {
        rules: [{
            id: 'CN-RULE',
            import_country: 'CN',
            hs_prefixes: ['8542'],
            exact_code_overrides: [{
                hs_code: '854231',
                base_rate: 0,
                confidence: 'Official source checked'
            }]
        }]
    };
    applyExactTariffRows(payload, 'CN', [{
        hs_code: '8542311100',
        base_rate: 0,
        confidence: 'Official exact tariff line'
    }]);
    assert.deepEqual(
        payload.rules[0].exact_code_overrides.map((row) => row.hs_code),
        ['854231', '8542311100']
    );
});

test('applies exact rows without promoting unrelated prefixes', () => {
    const payload = { rules: [{ id: 'cn-computing', import_country: 'CN', hs_prefixes: ['8471'] }] };
    const changed = applyExactTariffRows(payload, 'CN', [{
        hs_code: '8542319000', base_rate: 0, source_status: 'official_source_checked'
    }]);
    assert.deepEqual(changed, []);
});

test('EU TARIC exact rows apply to EU, Germany, and Netherlands rules', () => {
    const payload = {
        rules: ['EU', 'DE', 'NL', 'SG'].map((country) => ({
            id: `${country}-chip`,
            import_country: country,
            hs_prefixes: ['8542']
        }))
    };
    const changed = applyExactTariffRows(payload, 'EU', [{
        hs_code: '8542319000',
        base_rate: 0.032,
        source_status: 'official_source_checked'
    }]);
    assert.deepEqual(changed, ['EU-chip', 'DE-chip', 'NL-chip']);
    assert.equal(payload.rules.find((rule) => rule.import_country === 'SG').exact_code_overrides, undefined);
});
