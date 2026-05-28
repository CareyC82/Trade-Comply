const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateRiskSignal, riskSignalToTag } = require('../lib/risk-signal');

describe('risk-signal', () => {
    it('validates and converts to searchable tag', () => {
        const raw = {
            hs_code: '8542.31',
            direction: 'export',
            country: 'US',
            risk_level: 'High',
            source: 'US BIS',
            content_en: 'Entity List additions affect advanced computing exports.',
            content_zh: '实体清单增补影响先进计算产品出口。'
        };
        const result = validateRiskSignal(raw);
        assert.equal(result.ok, true);
        const tag = riskSignalToTag(result.value);
        assert.equal(tag.country, 'US');
        assert.equal(tag.direction, 'export');
        assert.ok(tag.related_hs_codes.includes('8542.31'));
    });
});
