const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseHsCodeClassificationPayload,
    parseModelJsonPayload
} = require('../lib/parse-model-json');

describe('parse-model-json', () => {
    it('parses fenced ```json blocks', () => {
        const text = 'Here is the result:\n```json\n{"hscode":"8542310000","official_name":"Processors","confidence":"90%","reasoning":"GIR 1 applies."}\n```';
        const parsed = parseHsCodeClassificationPayload(text);
        assert.equal(parsed.hscode, '8542310000');
        assert.equal(parsed.official_name, 'Processors');
        assert.match(parsed.reasoning, /GIR 1/);
    });

    it('parses raw JSON without fences', () => {
        const text = '{"hs_code":"850760","officialName":"Battery","reasoning":"Chemistry rule."}';
        const parsed = parseHsCodeClassificationPayload(text);
        assert.equal(parsed.hscode, '850760');
        assert.equal(parsed.official_name, 'Battery');
    });

    it('parses dual-country HS fields', () => {
        const text = JSON.stringify({
            hscode: '8542.39.00.00',
            hs6: '854239',
            china_export_hscode: '8542.39.00.00',
            destination_import_code: '8542.39.00.00',
            destination_country: 'US',
            official_name: 'ICs',
            reasoning: 'GIR 1.'
        });
        const parsed = parseHsCodeClassificationPayload(text);
        assert.equal(parsed.china_export_hscode, '8542.39.00.00');
        assert.equal(parsed.destination_import_code, '8542.39.00.00');
        assert.equal(parsed.hs6, '854239');
    });

    it('extracts outer object when surrounded by prose', () => {
        const text = 'Sure! {"hscode":"9617001900","official_name":"Electrodes","confidence":"80%","reasoning":"GIR 6."} Thanks.';
        const parsed = parseHsCodeClassificationPayload(text);
        assert.equal(parsed.hscode, '9617001900');
    });

    it('throws when required fields missing', () => {
        assert.throws(() => {
            parseModelJsonPayload('{"hscode":"123"}', { requiredFields: ['hscode', 'reasoning'] });
        }, /missing required field/i);
    });
});
