'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');
const {
    currentAdValoremRate,
    parseAbfChapterHtml,
    buildAustraliaExactPayload
} = require('../lib/australia-abf-tariff');
const { parseNzWorkingTariffText } = require('../lib/new-zealand-working-tariff');
const { fetchNewZealandOfficialPayload } = require('../scripts/update-exact-national-tariffs');
const { assertHealthyExactBatch } = require('../scripts/update-exact-national-tariffs');

const AU_HTML = `
<table><tbody>
<tr><th scope="row">8518.21.00</th><td></td><td></td><td>Single loudspeakers, mounted in their enclosures</td><td>5%<br>From 1 July 2021:<br>Free</td><td></td></tr>
<tr><th scope="row">8518.22.00</th><td></td><td></td><td>Multiple loudspeakers, mounted in the same enclosure</td><td>5%</td><td></td></tr>
<tr><th scope="row">8518.2</th><td></td><td></td><td>Heading only</td><td></td><td></td></tr>
</tbody></table>`;

const NZ_TEXT = `
8518.21.90 00L No. – – Single loudspeakers, mounted in their enclosures Free Free
8518.22.90 00E No. – – Multiple loudspeakers, mounted in the same enclosure 5 Free
8518.30 – Headphones and earphones:
`;

test('ABF parser retains exact 8-digit lines and the current rate in a historical rate cell', () => {
    assert.equal(currentAdValoremRate('5% From 1 July 2020: 2.5% From 1 July 2021: Free'), 0);
    const rows = parseAbfChapterHtml(AU_HTML, { prefixes: ['851821', '851822'] });
    assert.deepEqual(rows.map((row) => [row.hs_code, row.general_rate]), [
        ['85182100', 0],
        ['85182200', 0.05]
    ]);
});

test('NZ Working Tariff parser keeps Normal duty separate from preferential duty', () => {
    const rows = parseNzWorkingTariffText(NZ_TEXT, { prefixes: ['8518'] });
    assert.deepEqual(rows.map((row) => [row.hs_code, row.normal_rate, row.preferential_rate_text]), [
        ['85182190', 0, 'Free'],
        ['85182290', 0.05, 'Free']
    ]);
});

test('NZ official connector checks every maintained prefix and returns section source URLs', async () => {
    const payload = await fetchNewZealandOfficialPayload({
        dutyPayload: { rules: [{ import_country: 'NZ', hs_prefixes: ['851821', '851822'] }] },
        checkedAt: '2026-09-02T00:00:00.000Z',
        fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
        extractPdfTextImpl: async () => NZ_TEXT
    });
    assert.equal(payload.complete, true);
    assert.deepEqual(payload.rows.map((row) => row.hs_code), ['85182190', '85182290']);
    assert.ok(payload.rows.every((row) => /customs\.govt\.nz/.test(row.source_url)));
});

test('ABF official payload fails closed when a maintained prefix is absent', async () => {
    await assert.rejects(() => buildAustraliaExactPayload(['851821', '850440'], {
        checkedAt: '2026-09-02T00:00:00.000Z',
        fetchImpl: async (url) => ({ ok: true, text: async () => url.includes('chapter-85') ? AU_HTML : '' })
    }), /850440/);
});

test('exact HS selection applies one official row and conflicts remain unresolved', () => {
    const baseRule = {
        import_country: 'AU', origin_country: '*', hs_prefixes: ['8518'], base_rate: null,
        exact_code_overrides: [
            { hs_code: '85182100', base_rate: 0, effective_from: '2026-01-01', source_status: 'official_source_checked' }
        ]
    };
    const exact = engine.findDutySignal({ origin: 'CN', market: 'AU', hsCode: '85182100', dutyRates: { rules: [baseRule] }, entryDate: '2026-09-02' });
    assert.equal(exact.exact, true);
    assert.equal(exact.rate, 0);

    const conflicting = engine.findDutySignal({
        origin: 'CN', market: 'AU', hsCode: '85182100', entryDate: '2026-09-02',
        dutyRates: { rules: [{ ...baseRule, exact_code_overrides: [
            ...baseRule.exact_code_overrides,
            { hs_code: '85182100', base_rate: 0.05, effective_from: '2026-01-01', source_status: 'official_source_checked' }
        ] }] }
    });
    assert.equal(conflicting.exact, false);
    assert.equal(conflicting.exactConflict, true);
    assert.equal(conflicting.rate, null);
});

test('entered national tariff code must remain compatible with the detected product family', () => {
    const result = engine.assess({
        description: 'Bluetooth speaker', origin: 'CN', market: 'AU', platform: 'Amazon',
        exactHsCode: '85044090', dutyRates: { rules: [] }, assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.equal(result.tariffOptions[0].classificationMismatch, true);
});

test('ANZ candidate tariff rows expose selectable exact lines and conditional measures without applying preference', () => {
    const dutyRates = {
        rules: [{
            import_country: 'AU', origin_country: '*', hs_prefixes: ['8518'], base_rate: null,
            exact_code_overrides: [
                { hs_code: '85182100', base_rate: 0, description: 'Single loudspeaker', effective_from: '2026-01-01', source_url: 'https://abf.example/851821' },
                { hs_code: '85182200', base_rate: 0.05, description: 'Multiple loudspeakers', effective_from: '2026-01-01', source_url: 'https://abf.example/851822' }
            ]
        }]
    };
    const result = engine.assess({
        description: 'Bluetooth speaker', origin: 'CN', market: 'AU', platform: 'Amazon', dutyRates,
        assessmentMode: 'quick', blockingQuestionKeys: []
    });
    const lines = result.tariffOptions.flatMap((item) => item.candidateExactLines);
    const row = result.tariffOptions[0];
    assert.deepEqual(lines.map((item) => item.hsCode), ['85182100', '85182200']);
    assert.equal(row.exact, false);
    assert.equal(row.classificationRequired, true);
    assert.ok(row.conditionalMeasures.some((item) => item.id === 'origin_preference' && item.status === 'not_applied'));
    assert.equal(row.conditionalMeasures[0].authority, 'Australian Border Force');
    assert.match(row.conditionalMeasures[0].reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(result.supplierRequest.items.some((item) => /rules-of-origin/.test(item.document)));
    assert.ok(result.supplierRequest.items.some((item) => /concession/i.test(item.document)));
});

test('unexpected official batch shrink is rejected before last-good exact rows are replaced', () => {
    const dutyPayload = { rules: [{
        import_country: 'AU',
        exact_code_overrides: Array.from({ length: 100 }, (_, index) => ({ hs_code: String(84000000 + index) }))
    }] };
    assert.throws(() => assertHealthyExactBatch(
        dutyPayload,
        'AU',
        Array.from({ length: 60 }, (_, index) => ({ hs_code: String(85000000 + index) }))
    ), /shrank unexpectedly.*last-good rows retained/);
});
