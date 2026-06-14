const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { setCoverageMatrix } = require('../lib/country-registry');
const {
    normalizeCountryCode,
    getCountryOptionsForDirection,
    countryMatchesSelection,
    filterTagsForSelectedCountry,
    countryPriorityScore,
    getTagCountryBadgeCode,
    analyzeCountryCoverage,
    buildCountryContextMessage,
    buildCoverageIndicator
} = require('../lib/trade-country');

describe('trade-country', () => {
    it('limits export vs import option sets', () => {
        const exportOpts = getCountryOptionsForDirection('export').map((o) => o.value);
        const importOpts = getCountryOptionsForDirection('import').map((o) => o.value);
        assert.ok(exportOpts.includes('EU'));
        assert.ok(exportOpts.includes('IN'));
        assert.ok(importOpts.includes('TW'));
        assert.ok(importOpts.includes('IN'));
        assert.ok(!importOpts.includes('RU'));
    });

    it('prioritizes matching country tags', () => {
        const tag = { country: 'US', tag_type: 'MATCHED' };
        const other = { country: 'JP', tag_type: 'MATCHED' };
        assert.ok(countryPriorityScore(tag, 'US') > countryPriorityScore(other, 'US'));
    });

    it('filters out non-selected countries but keeps China baseline on China routes', () => {
        const tags = [
            { tag_id: 'CL-KR-001', country: 'KR' },
            { tag_id: 'CL-JP-001', country: 'JP' },
            { tag_id: 'CL-TW-001', country: 'TW' },
            { tag_id: 'CL-GLOBAL-001', country: 'GLOBAL' }
        ];
        const filtered = filterTagsForSelectedCountry(tags, 'KR', { from: 'US', to: 'CN', focus: 'import' });
        assert.deepEqual(filtered.map((t) => t.tag_id), ['CL-KR-001', 'CL-GLOBAL-001']);
        assert.equal(countryMatchesSelection({ country: 'JP' }, 'KR'), false);
    });

    it('does not show China baseline on non-China global routes', () => {
        const tags = [
            { tag_id: 'CL-DE-001', country: 'DE' },
            { tag_id: 'CL-GLOBAL-001', country: 'GLOBAL' }
        ];
        const filtered = filterTagsForSelectedCountry(tags, 'DE', { from: 'DE', to: 'US', focus: 'export' });
        assert.deepEqual(filtered.map((t) => t.tag_id), ['CL-DE-001']);
        assert.equal(countryMatchesSelection({ country: 'GLOBAL' }, 'DE', { from: 'DE', to: 'US', focus: 'export' }), false);
    });

    it('uses tag_id regional prefix when country field is wrong', () => {
        assert.equal(countryMatchesSelection({ tag_id: 'CL-TW-001', country: 'GLOBAL' }, 'KR'), false);
        assert.equal(countryMatchesSelection({ tag_id: 'CL-KR-001', country: 'GLOBAL' }, 'KR'), true);
    });

    it('normalizes aliases', () => {
        assert.equal(normalizeCountryCode('united states'), 'US');
        assert.equal(normalizeCountryCode('Taiwan'), 'TW');
        assert.equal(normalizeCountryCode('India'), 'IN');
        assert.equal(normalizeCountryCode('Bharat'), 'IN');
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

    it('builds route coverage indicators from exact and baseline matches', () => {
        const usCoverage = analyzeCountryCoverage([{ country: 'US' }, { country: 'GLOBAL' }], 'US', 'export');
        const usIndicator = buildCoverageIndicator(usCoverage, {
            from: 'NL',
            to: 'US',
            focus: 'import',
            fromLabel: 'Netherlands',
            toLabel: 'United States'
        });
        assert.equal(usIndicator.level, 'full');
        assert.match(usIndicator.routeLine, /Import requirements at destination: United States/);

        const cnCoverage = analyzeCountryCoverage([{ country: 'GLOBAL' }], 'CN', 'export');
        const cnIndicator = buildCoverageIndicator(cnCoverage, {
            from: 'CN',
            to: 'US',
            focus: 'export',
            fromLabel: 'China',
            toLabel: 'United States'
        });
        assert.equal(cnIndicator.level, 'baseline');
        assert.match(cnIndicator.message, /Only general baseline rules matched/i);
    });

    it('updates route coverage indicators when the maintainable matrix changes', () => {
        const coverage = analyzeCountryCoverage([{ country: 'US' }, { country: 'GLOBAL' }], 'US', 'export');
        const route = {
            from: 'NL',
            to: 'US',
            focus: 'import',
            fromLabel: 'Netherlands',
            toLabel: 'United States'
        };

        setCoverageMatrix({ matrix: { import: { US: 'full' }, export: { GLOBAL: 'baseline' } } });
        assert.equal(buildCoverageIndicator(coverage, route).level, 'full');

        setCoverageMatrix({ matrix: { import: { US: 'partial' }, export: { GLOBAL: 'baseline' } } });
        const partialIndicator = buildCoverageIndicator(coverage, route);
        assert.equal(partialIndicator.level, 'partial');
        assert.equal(partialIndicator.configuredLevel, 'partial');

        setCoverageMatrix(require('../data/coverage-matrix.json'));
    });

    it('shows not covered when a route has only baseline references and no maintained country coverage', () => {
        const coverage = analyzeCountryCoverage([{ country: 'GLOBAL' }, { country: 'GLOBAL' }], 'MX', 'export');
        setCoverageMatrix({ matrix: { export: { MX: 'none' } } });
        const indicator = buildCoverageIndicator(coverage, {
            from: 'MX',
            to: 'US',
            focus: 'export',
            fromLabel: 'Mexico',
            toLabel: 'United States'
        });

        assert.equal(indicator.level, 'none');
        assert.equal(indicator.label, 'Not covered yet');
        assert.equal(indicator.configuredLevel, 'none');
        assert.match(indicator.message, /Baseline references are shown below only as general context/i);
        setCoverageMatrix(require('../data/coverage-matrix.json'));
    });
});
