const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    formatTenDigitHs,
    formatUsHtsCode,
    formatCounterpartyHsCode,
    enrichClassification,
    buildCrossBorderNote
} = require('../lib/hscode-dual');

describe('hscode-dual', () => {
    it('formats 6-digit input to 10-digit China style', () => {
        assert.equal(formatTenDigitHs('854239'), '8542.39.00.00');
        assert.equal(formatTenDigitHs('8542.39'), '8542.39.00.00');
    });

    it('formats US HTS separately from China customs style', () => {
        assert.equal(formatUsHtsCode('8542390000'), '8542.39.0000');
        assert.equal(formatCounterpartyHsCode('854239', 'US'), '8542.39.0000');
        assert.equal(formatCounterpartyHsCode('854239', 'EU'), '8542.39.00.00');
    });

    it('enriches export result with dual codes for US', () => {
        const result = enrichClassification(
            {
                hscode: '854239',
                official_name: 'Electronic integrated circuits',
                confidence: '92%',
                reasoning: 'Classified under heading 8542 per GIR 1 and GIR 6.'
            },
            { direction: 'export', counterpartyCountry: 'US' }
        );

        assert.equal(result.china_code, '8542.39.00.00');
        assert.equal(result.counterparty_code, '8542.39.0000');
        assert.match(result.china_code_label, /China Export/);
        assert.match(result.counterparty_code_label, /United States Import HTS/);
        assert.match(result.reasoning, /globally harmonized/i);
        assert.match(result.reasoning, /Section 301/i);
    });

    it('buildCrossBorderNote mentions harmonized digits', () => {
        const note = buildCrossBorderNote('854239', 'US', 'HTS');
        assert.match(note, /8542\.39/);
        assert.match(note, /Section 301/i);
    });
});
