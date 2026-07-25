'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    verifySingaporeDutiableScope,
    parseStccedText,
    buildSingaporeExactPayload
} = require('../lib/singapore-stcced');

const scopeHtml = `
    <h1>List of Dutiable Goods</h1>
    <p>Intoxicating liquors</p><p>Tobacco products</p>
    <p>Motor vehicles</p><p>Petroleum products</p>
`;

test('Singapore dual-source gate requires all official dutiable classes', () => {
    assert.equal(verifySingaporeDutiableScope(scopeHtml).ok, true);
    const failed = verifySingaporeDutiableScope('<p>Motor vehicles are dutiable.</p>');
    assert.equal(failed.ok, false);
    assert.ok(failed.missing.includes('tobacco products'));
});

test('STCCED text parser extracts maintained 8-digit AHTN rows', () => {
    const rows = parseStccedText(`
        8517.13.00    - - Smartphones                                      NMB
        8517.62.43    - - - - Control and adaptor units                    NMB
        2203.00.11    - Beer                                               LTR
    `, { prefixes: ['8517'] });
    assert.deepEqual(rows.map((row) => row.hs_code), ['85171300', '85176243']);
});

test('Singapore exact payload requires both classification and dutiable-scope evidence', () => {
    const payload = buildSingaporeExactPayload({
        text: '  8542.31.00    - - Processors and controllers                 MIL',
        dutiableHtml: scopeHtml,
        prefixes: ['8542'],
        checkedAt: '2026-07-25T00:00:00.000Z'
    });
    assert.equal(payload.complete, true);
    assert.equal(payload.rows[0].hs_code, '85423100');
    assert.equal(payload.rows[0].customs_duty_rate, 0);
    assert.match(payload.source.url, /^https:\/\/www\.customs\.gov\.sg\//);
});
