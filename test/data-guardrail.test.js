const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateDataSchema, partitionByGuardrail } = require('../lib/data-guardrail');

const VALID_SIGNAL = {
    hs_code: '8542.31',
    direction: 'export',
    country: 'US',
    risk_level: 'High',
    source: 'US BIS',
    content_en: 'Entity List additions affect advanced computing exports to China.',
    content_zh: '实体清单增补影响先进计算产品对华出口。'
};

describe('data-guardrail', () => {
    it('accepts valid risk signal', () => {
        const result = validateDataSchema(VALID_SIGNAL, 'risk_signal');
        assert.equal(result.ok, true);
        assert.equal(result.value.country, 'US');
    });

    it('maps Other label to GLOBAL country code', () => {
        const result = validateDataSchema({ ...VALID_SIGNAL, country: 'Other' }, 'risk_signal');
        assert.equal(result.ok, true);
        assert.equal(result.value.country, 'GLOBAL');
    });

    it('accepts Russia and Taiwan canonical codes', () => {
        const ru = validateDataSchema({ ...VALID_SIGNAL, country: 'RU' }, 'risk_signal');
        const tw = validateDataSchema({ ...VALID_SIGNAL, country: 'TW', direction: 'import' }, 'risk_signal');
        assert.equal(ru.ok, true);
        assert.equal(tw.ok, true);
    });

    it('rejects empty hs_code', () => {
        const result = validateDataSchema({ ...VALID_SIGNAL, hs_code: '' }, 'risk_signal');
        assert.equal(result.ok, false);
    });

    it('rejects AI hallucination phrases', () => {
        const result = validateDataSchema(
            { ...VALID_SIGNAL, content_en: "I'm sorry, I cannot find relevant trade content." },
            'risk_signal'
        );
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.includes('hallucination')));
    });

    it('partitions batch into passed and intercepted', () => {
        const { passed, intercepted } = partitionByGuardrail(
            [VALID_SIGNAL, { ...VALID_SIGNAL, country: 'XX', hs_code: '' }],
            'risk_signal'
        );
        assert.equal(passed.length, 1);
        assert.equal(intercepted.length, 1);
    });
});
