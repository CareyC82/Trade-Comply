'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const {
    inferProductAttributes,
    buildEnhancedProductQuery,
    prepareIntelligentSearch
} = require('../lib/product-intelligence');
const { search, searchWithPrecheck } = require('../js/search');

const FACTORS = {
    wireless: { label: 'Wireless', keywords: ['wireless', 'wifi', 'radio'], nextChecks: [], signals: [], risk: 'medium' },
    battery: { label: 'Battery', keywords: ['battery', 'lithium', 'UN38.3'], nextChecks: [], signals: [], risk: 'medium' },
    encryption: { label: 'Encryption', keywords: ['encryption', 'dual-use'], nextChecks: [], signals: [], risk: 'high' },
    uav: { label: 'UAV', keywords: ['drone', 'uav', 'dual-use'], nextChecks: [], signals: [], risk: 'high' },
    semiconductor: { label: 'Semiconductor', keywords: ['chip', 'semiconductor'], nextChecks: [], signals: [], risk: 'high' },
    advanced_manufacturing: { label: 'Advanced manufacturing', keywords: ['semiconductor equipment', 'foundry'], nextChecks: [], signals: [], risk: 'high' },
    ai_chip: { label: 'AI chip', keywords: ['ai chip', 'gpu', 'accelerator'], nextChecks: [], signals: [], risk: 'high' },
    destination_end_use: { label: 'End use', keywords: ['end use', 'restricted party'], nextChecks: [], signals: [], risk: 'high' }
};

function setupSearch(direction = 'export', selectedCountry = 'US', route = {}) {
    globalThis.AppState = {
        data: { tags, cases },
        currentDirection: direction,
        currentCountry: selectedCountry,
        routeFromCountry: route.from || (direction === 'import' ? selectedCountry : 'CN'),
        routeToCountry: route.to || (direction === 'import' ? 'CN' : selectedCountry),
        complianceFocus: route.focus || ''
    };
    globalThis.TradeComplyCountry = country;
    globalThis.TradeComplyMatchedResults = matchedResults;
}

function ids(result) {
    return result.tags.map((tag) => tag.tag_id);
}

describe('product intelligence', () => {
    it('infers AI accelerator attributes from short natural-language input', () => {
        const profile = inferProductAttributes('NVIDIA style AI GPU accelerator card with HBM');
        assert.equal(profile.vertical, 'semiconductor');
        assert.ok(profile.precheckIds.includes('ai_chip'));
        assert.ok(profile.precheckIds.includes('semiconductor'));
        assert.ok(profile.expansionTerms.includes('advanced computing'));
    });

    it('infers wireless, encryption, and surveillance risk for IP camera storage descriptions', () => {
        const profile = inferProductAttributes('IP camera with WiFi, encrypted NVR network storage');
        assert.ok(profile.precheckIds.includes('wireless'));
        assert.ok(profile.precheckIds.includes('encryption'));
        assert.match(profile.expansionTerms.join(' '), /surveillance|network storage/i);
    });

    it('expands photovoltaic descriptions for ASEAN routing checks', () => {
        const enhanced = buildEnhancedProductQuery('PV module for Vietnam customer');
        assert.match(enhanced.query, /photovoltaic|pv module|polysilicon/i);
        assert.equal(enhanced.profile.vertical, 'new-energy');
    });

    it('expands tablet descriptions into wireless, battery, and encryption terms', () => {
        const enhanced = buildEnhancedProductQuery('tablet computer wifi');
        assert.equal(enhanced.profile.vertical, 'electronics');
        assert.match(enhanced.query, /tablet computer/i);
        assert.match(enhanced.query, /battery|encryption|bluetooth/i);
    });

    it('merges inferred precheck selections without requiring manual checkbox input', () => {
        const prepared = prepareIntelligentSearch('drone with encrypted video link and lithium battery', [], FACTORS);
        assert.ok(prepared.selections.some((item) => item.id === 'uav'));
        assert.ok(prepared.selections.some((item) => item.id === 'encryption'));
        assert.ok(prepared.selections.some((item) => item.id === 'battery'));
        assert.match(prepared.expandedQuery, /dual-use|UN38\.3|wireless/i);
    });

    it('improves real matching for short ASEAN solar descriptions', () => {
        setupSearch('export', 'ASEAN');
        const prepared = prepareIntelligentSearch('PV module for Vietnam', [], FACTORS, {
            direction: 'export',
            country: 'ASEAN',
            vertical: 'new-energy'
        });
        const result = searchWithPrecheck(prepared.expandedQuery, prepared.selections, search);
        assert.ok(ids(result).includes('CL-ASEANSOLAR-001'));
    });

    it('does not let generic precheck terms pull unrelated policy cards into product results', () => {
        setupSearch('export', 'US', { from: 'CN', to: 'US', focus: 'import' });
        const result = searchWithPrecheck(
            'drone uav under 2kg',
            [{ id: 'export_control', keywords: ['export control', 'license requirements'] }],
            search
        );
        const resultIds = ids(result);
        assert.ok(resultIds.includes('CL-USMARKET-002'));
        assert.equal(
            result.tags.some((tag) => /syria/i.test(`${tag.short_description || ''} ${tag.description || ''}`)),
            false
        );
        assert.ok(result.tags.length <= 8);
    });
});
