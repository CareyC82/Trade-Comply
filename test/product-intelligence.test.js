'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const {
    classifyMemorySubtype,
    inferProductAttributes,
    buildEnhancedProductQuery,
    prepareIntelligentSearch
} = require('../lib/product-intelligence');
const { search, searchWithPrecheck, dedupeTagsByPolicySignal } = require('../js/search');

const FACTORS = {
    wireless: { label: 'Wireless', keywords: ['wireless', 'wifi', 'radio'], nextChecks: [], signals: [], risk: 'medium' },
    battery: { label: 'Battery', keywords: ['battery', 'lithium', 'UN38.3'], nextChecks: [], signals: [], risk: 'medium' },
    encryption: { label: 'Encryption', keywords: ['encryption', 'dual-use'], nextChecks: [], signals: [], risk: 'high' },
    uav: { label: 'UAV', keywords: ['drone', 'uav', 'dual-use'], nextChecks: [], signals: [], risk: 'high' },
    semiconductor: { label: 'Semiconductor', keywords: ['chip', 'semiconductor'], nextChecks: [], signals: [], risk: 'high' },
    advanced_manufacturing: { label: 'Advanced manufacturing', keywords: ['semiconductor equipment', 'foundry'], nextChecks: [], signals: [], risk: 'high' },
    ai_chip: { label: 'AI chip', keywords: ['ai chip', 'gpu', 'accelerator'], nextChecks: [], signals: [], risk: 'high' },
    memory_ic: { label: 'Memory IC', keywords: ['hbm', 'dram', 'nand'], nextChecks: [], signals: [], risk: 'high' },
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
    it('dedupes repeated auto-crawled policy variants from the same source', () => {
        const duplicateSourceTags = [
            {
                tag_id: 'RS-US-847130-A',
                country: 'US',
                direction: 'import',
                category: 'OTHER',
                category_label: 'Export Control',
                source_url: 'https://ustr.gov/issue-areas/enforcement/section-301-investigations/tariff-actions',
                short_name: '[US High]',
                short_description: 'The U.S. Trade Representative has initiated a forced labor Section 301 investigation and proposed additional tariffs.'
            },
            {
                tag_id: 'RS-US-847130-B',
                country: 'US',
                direction: 'import',
                category: 'OTHER',
                category_label: 'Export Control',
                source_url: 'https://ustr.gov/issue-areas/enforcement/section-301-investigations/tariff-actions?utm=copy',
                short_name: '[US High]',
                short_description: 'The U.S. Trade Representative has initiated a forced labor Section 301 investigation and proposed additional tariffs. This action may lead to increased scrutiny.'
            }
        ];

        const deduped = dedupeTagsByPolicySignal(duplicateSourceTags);

        assert.equal(deduped.length, 1);
        assert.equal(deduped[0].tag_id, 'RS-US-847130-A');
    });

    it('infers AI accelerator attributes from short natural-language input', () => {
        const profile = inferProductAttributes('NVIDIA style AI GPU accelerator card with HBM');
        assert.equal(profile.vertical, 'semiconductor');
        assert.ok(profile.precheckIds.includes('ai_chip'));
        assert.ok(profile.precheckIds.includes('semiconductor'));
        assert.ok(profile.expansionTerms.includes('advanced computing'));
    });

    it('keeps chips in semiconductor but routes system-level AI servers to data center', () => {
        const chipProfile = inferProductAttributes('AI GPU accelerator chip with HBM package');
        const serverProfile = inferProductAttributes('AI server GPU server rack with storage and redundant power');

        assert.equal(chipProfile.vertical, 'semiconductor');
        assert.ok(chipProfile.precheckIds.includes('ai_chip'));
        assert.equal(serverProfile.vertical, 'data-center');
        assert.ok(serverProfile.precheckIds.includes('data_center_system'));
        assert.match(serverProfile.expansionTerms.join(' '), /data center equipment|server|edge computing/i);
    });

    it('promotes memory ICs as a distinct semiconductor subtype', () => {
        const hbmProfile = inferProductAttributes('HBM3E DRAM memory chip for AI accelerator board');
        const nandProfile = inferProductAttributes('NAND flash memory IC for enterprise storage device');

        assert.equal(hbmProfile.vertical, 'semiconductor');
        assert.ok(hbmProfile.precheckIds.includes('memory_ic'));
        assert.ok(hbmProfile.precheckIds.includes('semiconductor'));
        assert.equal(hbmProfile.memorySubtype.id, 'hbm');
        assert.match(hbmProfile.expansionTerms.join(' '), /HBM|DRAM|memory chip/i);

        assert.equal(nandProfile.vertical, 'semiconductor');
        assert.ok(nandProfile.precheckIds.includes('memory_ic'));
        assert.equal(nandProfile.memorySubtype.id, 'nand');
        assert.match(nandProfile.expansionTerms.join(' '), /NAND flash/i);

        assert.equal(classifyMemorySubtype('DDR5 memory module').id, 'dram');
        assert.equal(classifyMemorySubtype('SSD controller storage IC').id, 'ssd_controller');
    });

    it('detects industrial automation and healthcare lab product verticals', () => {
        const industrial = inferProductAttributes('PLC controller industrial automation machine vision gateway');
        const healthcare = inferProductAttributes('patient monitor medical electronics bluetooth battery');

        assert.equal(industrial.vertical, 'industrial-automation');
        assert.ok(industrial.precheckIds.includes('industrial_automation'));
        assert.match(industrial.expansionTerms.join(' '), /robotics|industrial control/i);

        assert.equal(healthcare.vertical, 'healthcare-lab');
        assert.ok(healthcare.precheckIds.includes('healthcare_lab'));
        assert.match(healthcare.expansionTerms.join(' '), /medical electronics|diagnostic device/i);
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

    it('adds destination import terms when the selected focus is import requirements', () => {
        const prepared = prepareIntelligentSearch('wireless router', [], FACTORS, {
            from: 'SG',
            to: 'US',
            focus: 'import',
            vertical: 'electronics'
        });
        assert.match(prepared.expandedQuery, /cbp|hts|fcc/i);
        assert.doesNotMatch(prepared.expandedQuery, /strategic goods|singapore customs/i);
        assert.deepEqual(prepared.profile.route, {
            from: 'SG',
            to: 'US',
            focus: 'import',
            direction: 'export',
            country: 'US',
            fromLabel: 'Singapore',
            toLabel: 'United States'
        });
    });

    it('adds origin export terms when the selected focus is export requirements', () => {
        const prepared = prepareIntelligentSearch('solar panel photovoltaic', [], FACTORS, {
            from: 'DE',
            to: 'US',
            focus: 'export',
            vertical: 'new-energy'
        });
        assert.match(prepared.expandedQuery, /germany export|bafa|dual-use|export customs/i);
        assert.doesNotMatch(prepared.expandedQuery, /cbp|hts/i);
        assert.equal(prepared.profile.route.country, 'DE');
    });

    it('supports legacy direction and country context without forcing the default US route', () => {
        const prepared = prepareIntelligentSearch('PV module for Vietnam', [], FACTORS, {
            direction: 'export',
            country: 'ASEAN',
            vertical: 'new-energy'
        });
        assert.match(prepared.expandedQuery, /asean import|rcep|origin|customs/i);
        assert.equal(prepared.profile.route.country, 'ASEAN');
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
