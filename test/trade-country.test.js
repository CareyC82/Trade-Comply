const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCountryCode,
    getCountryOptionsForDirection,
    countryPriorityScore,
    getTagCountryBadgeCode,
    analyzeCountryCoverage,
    buildCountryContextMessage
} = require('../lib/trade-country');

describe('trade-country', () => {
    it('limits export vs import option sets', () => {
        const exportOpts = getCountryOptionsForDirection('export').map((o) => o.value);
        const importOpts = getCountryOptionsForDirection('import').map((o) => o.value);
        assert.ok(exportOpts.includes('EU'));
        assert.ok(importOpts.includes('TW'));
        assert.ok(!importOpts.includes('RU'));
    });

    it('prioritizes matching country tags', () => {
        const tag = { country: 'US', tag_type: 'MATCHED' };
        const other = { country: 'JP', tag_type: 'MATCHED' };
        assert.ok(countryPriorityScore(tag, 'US') > countryPriorityScore(other, 'US'));
    });

    it('normalizes aliases', () => {
        assert.equal(normalizeCountryCode('united states'), 'US');
        assert.equal(normalizeCountryCode('Taiwan'), 'TW');
    });

    it('maps GLOBAL rules to CN badge for export baseline', () => {
        const tag = { country: 'GLOBAL', short_name: 'Test' };
        assert.equal(getTagCountryBadgeCode(tag, 'export'), 'CN');
    });

    it('builds fallback context when only baseline rules', () => {
        const tags = [{ country: 'GLOBAL' }, { country: 'GLOBAL' }];
        const coverage = analyzeCountryCoverage(tags, 'US', 'export');
        const message = buildCountryContextMessage(coverage);
        assert.match(message, /No United States-specific destination/i);
        assert.match(message, /2 China export baseline/i);
    });
});
