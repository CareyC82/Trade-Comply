const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');
const country = require('../lib/trade-country');

function hasSolarKeyword(tag) {
    return (tag.related_keywords || []).some((keyword) => /solar|photovoltaic|pv module/i.test(keyword));
}

describe('US solar destination rules', () => {
    it('keeps US-specific import controls for China-to-US solar screens', () => {
        const solarTags = tags.filter((tag) => (
            tag.direction === 'export'
            && tag.country === 'US'
            && hasSolarKeyword(tag)
            && (tag.related_hs_codes || []).includes('8541.43')
        ));

        assert.ok(
            solarTags.some((tag) => /UFLPA/i.test(`${tag.short_name} ${tag.short_description}`)),
            'expected UFLPA solar import-control signal'
        );
        assert.ok(
            solarTags.some((tag) => /Section 301/i.test(`${tag.short_name} ${tag.short_description}`)),
            'expected Section 301 solar tariff signal'
        );
        assert.ok(
            solarTags.some((tag) => /AD\/CVD|Anti-dumping/i.test(`${tag.short_name} ${tag.short_description}`)),
            'expected AD/CVD solar duty signal'
        );

        const filtered = country.filterTagsForSelectedCountry(solarTags, 'US');
        assert.equal(filtered.length, solarTags.length);
    });
});
