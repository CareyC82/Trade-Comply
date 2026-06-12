const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCountryCode,
    getExportOptions,
    getImportOptions,
    getRouteContext,
    getConfiguredCoverageLevel,
    setCoverageMatrix,
    getComplianceFocus
} = require('../lib/country-registry');

describe('country-registry', () => {
    it('maps frontend labels to canonical codes', () => {
        assert.equal(normalizeCountryCode('United States'), 'US');
        assert.equal(normalizeCountryCode('European Union'), 'EU');
        assert.equal(normalizeCountryCode('ASEAN (Vietnam / Malaysia)'), 'ASEAN');
        assert.equal(normalizeCountryCode('Vietnam'), 'VN');
        assert.equal(normalizeCountryCode('Malaysia'), 'MY');
        assert.equal(normalizeCountryCode('Russia'), 'RU');
        assert.equal(normalizeCountryCode('Taiwan (China)'), 'TW');
        assert.equal(normalizeCountryCode('Other'), 'GLOBAL');
    });

    it('export/import option values match registry', () => {
        const exportValues = getExportOptions().map((o) => o.value);
        const importValues = getImportOptions().map((o) => o.value);
        assert.deepEqual(exportValues, ['US', 'EU', 'VN', 'MY', 'ASEAN', 'RU', 'GLOBAL']);
        assert.deepEqual(importValues, ['TW', 'JP', 'KR', 'VN', 'MY', 'US', 'GLOBAL']);
    });

    it('provides regional compliance focus for RU and TW', () => {
        assert.match(getComplianceFocus('RU', 'export'), /sanctions/i);
        assert.match(getComplianceFocus('TW', 'import'), /semiconductor/i);
        assert.match(getComplianceFocus('ASEAN', 'export'), /origin/i);
        assert.match(getComplianceFocus('VN', 'import'), /Vietnam MIC/i);
        assert.match(getComplianceFocus('MY', 'import'), /SIRIM/i);
    });

    it('maps route focus to the legacy matching context', () => {
        const importFocus = getRouteContext({ from: 'NL', to: 'US', focus: 'import' });
        assert.equal(importFocus.direction, 'export');
        assert.equal(importFocus.country, 'US');
        assert.equal(importFocus.fromLabel, 'Netherlands');
        assert.equal(importFocus.toLabel, 'United States');

        const exportFocus = getRouteContext({ from: 'NL', to: 'US', focus: 'export' });
        assert.equal(exportFocus.direction, 'export');
        assert.equal(exportFocus.country, 'NL');
    });

    it('loads and overrides the maintainable coverage matrix', () => {
        assert.equal(getConfiguredCoverageLevel('US', 'import'), 'full');
        assert.equal(getConfiguredCoverageLevel('SG', 'export'), 'partial');
        assert.equal(getConfiguredCoverageLevel('MX', 'export'), 'partial');

        setCoverageMatrix({ matrix: { import: { US: 'partial' }, export: { GLOBAL: 'none' } } });
        assert.equal(getConfiguredCoverageLevel('US', 'import'), 'partial');
        assert.equal(getConfiguredCoverageLevel('MX', 'export'), 'partial');
    });
});
