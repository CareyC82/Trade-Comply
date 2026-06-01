const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCountryCode,
    getCountryOptionsForDirection,
    countryMatchesSelection,
    filterTagsForSelectedCountry,
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

    it('filters out non-selected countries but keeps GLOBAL baseline', () => {
        const tags = [
            { tag_id: 'CL-KR-001', country: 'KR' },
            { tag_id: 'CL-JP-001', country: 'JP' },
            { tag_id: 'CL-TW-001', country: 'TW' },
            { tag_id: 'CL-GLOBAL-001', country: 'GLOBAL' }
        ];
        const filtered = filterTagsForSelectedCountry(tags, 'KR');
        assert.deepEqual(filtered.map((t) => t.tag_id), ['CL-KR-001', 'CL-GLOBAL-001']);
        assert.equal(countryMatchesSelection({ country: 'JP' }, 'KR'), false);
    });

    it('uses tag_id regional prefix when country field is wrong', () => {
        assert.equal(countryMatchesSelection({ tag_id: 'CL-TW-001', country: 'GLOBAL' }, 'KR'), false);
        assert.equal(countryMatchesSelection({ tag_id: 'CL-KR-001', country: 'GLOBAL' }, 'KR'), true);
    });

    it('normalizes aliases', () => {
        assert.equal(normalizeCountryCode('united states'), 'US');
        assert.equal(normalizeCountryCode('Taiwan'), 'TW');
        assert.equal(normalizeCountryCode('Other'), 'GLOBAL');
        assert.equal(normalizeCountryCode('OTHER'), 'GLOBAL');
    });

    it('maps GLOBAL rules to CN badge for export baseline', () => {
        const tag = { country: 'GLOBAL', short_name: 'Test' };
        assert.equal(getTagCountryBadgeCode(tag, 'export'), 'CN');
    });

    it('builds fallback context when only baseline rules', () => {
        const tags = [{ country: 'GLOBAL' }, { country: 'GLOBAL' }];
        const coverage = analyzeCountryCoverage(tags, 'US', 'export');
        const message = buildCountryContextMessage(coverage);
        assert.match(message, /No product-specific United States destination rule matched yet/i);
        assert.match(message, /2 China export baseline/i);
    });
});
