const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeCountryCode,
    getExportOptions,
    getImportOptions,
    getComplianceFocus
} = require('../lib/country-registry');

describe('country-registry', () => {
    it('maps frontend labels to canonical codes', () => {
        assert.equal(normalizeCountryCode('United States'), 'US');
        assert.equal(normalizeCountryCode('European Union'), 'EU');
        assert.equal(normalizeCountryCode('ASEAN (Vietnam / Malaysia)'), 'ASEAN');
        assert.equal(normalizeCountryCode('Russia'), 'RU');
        assert.equal(normalizeCountryCode('Taiwan (China)'), 'TW');
        assert.equal(normalizeCountryCode('Other'), 'GLOBAL');
    });

    it('export/import option values match registry', () => {
        const exportValues = getExportOptions().map((o) => o.value);
        const importValues = getImportOptions().map((o) => o.value);
        assert.deepEqual(exportValues, ['US', 'EU', 'ASEAN', 'RU', 'GLOBAL']);
        assert.deepEqual(importValues, ['TW', 'JP', 'KR', 'US', 'GLOBAL']);
    });

    it('provides regional compliance focus for RU and TW', () => {
        assert.match(getComplianceFocus('RU', 'export'), /sanctions/i);
        assert.match(getComplianceFocus('TW', 'import'), /semiconductor/i);
        assert.match(getComplianceFocus('ASEAN', 'export'), /origin/i);
    });
});
