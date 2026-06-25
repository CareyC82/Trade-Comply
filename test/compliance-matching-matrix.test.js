const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const { search, searchWithPrecheck } = require('../js/search');

const PRODUCTS = [
    'gpu ai accelerator chip',
    'solar panel photovoltaic',
    'lithium battery pack',
    'drone uav under 2kg',
    'ip camera network storage',
    'wireless router',
    'ev charger',
    'semiconductor lithography equipment'
];

const EXPORT_MARKETS = ['US', 'EU', 'ASEAN', 'RU'];
const IMPORT_ORIGINS = ['US', 'TW', 'JP', 'KR', 'GLOBAL'];
const ROUTE_COUNTRIES = ['US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'ASEAN', 'RU', 'TW', 'JP', 'KR'];

function setupSearch(direction, selectedCountry, route = {}) {
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

function runSearch(query, direction, selectedCountry, focus = '', route = {}) {
    setupSearch(direction, selectedCountry, { ...route, focus });
    if (focus) {
        globalThis.AppState.complianceFocus = focus;
    }
    return search(query);
}

function effectiveCountry(tag) {
    const regional = /^CL-(TW|JP|KR|RU|VN|MY|ASEAN)-/i.exec(String(tag.tag_id || ''));
    if (regional) {
        return country.normalizeCountryCode(regional[1]);
    }
    return country.normalizeCountryCode(tag.country || 'GLOBAL');
}

function assertNoWrongMarketRules(result, selectedCountry, direction, query) {
    const selected = country.normalizeCountryCode(selectedCountry);
    const wrong = result.tags.filter((tag) => {
        const code = effectiveCountry(tag);
        return code !== selected && code !== 'GLOBAL';
    });
    assert.deepEqual(
        wrong.map((tag) => `${tag.tag_id}:${effectiveCountry(tag)}`),
        [],
        `${direction} ${selected} ${query} should not include non-selected market rules`
    );
}

function assertHasSelectedMarketRule(result, selectedCountry, direction, query) {
    const selected = country.normalizeCountryCode(selectedCountry);
    if (selected === 'GLOBAL') {
        assert.ok(
            result.tags.some((tag) => effectiveCountry(tag) === 'GLOBAL'),
            `${direction} ${selected} ${query} should include China baseline rules`
        );
        return;
    }
    assert.ok(
        result.tags.some((tag) => effectiveCountry(tag) === selected),
        `${direction} ${selected} ${query} should include at least one selected-market rule`
    );
}

function ids(result) {
    return result.tags.map((tag) => tag.tag_id);
}

function haystack(result) {
    return result.tags.map((tag) => [
        tag.tag_id,
        tag.short_name,
        tag.short_description,
        tag.description,
        tag.category_label
    ].filter(Boolean).join(' ')).join('\n');
}

function assertNoOppositeRouteFocus(result, expectedFocus, label) {
    const wrong = result.tags.filter((tag) => {
        const tagFocus = tag.route_focus || tag.compliance_focus || '';
        return tagFocus && tagFocus !== expectedFocus;
    });
    assert.deepEqual(
        wrong.map((tag) => `${tag.tag_id}:${tag.route_focus || tag.compliance_focus}`),
        [],
        `${label} should not include rules from the opposite route focus`
    );
}

describe('compliance matching matrix', () => {
    for (const market of EXPORT_MARKETS) {
        it(`keeps export-from-China matches focused on ${market}`, () => {
            for (const product of PRODUCTS) {
                const result = runSearch(product, 'export', market);
                assert.ok(result.tags.length > 0, `expected matches for ${product} to ${market}`);
                assertHasSelectedMarketRule(result, market, 'export', product);
                assertNoWrongMarketRules(result, market, 'export', product);
            }
        });
    }

    for (const origin of IMPORT_ORIGINS) {
        it(`keeps import-into-China matches focused on ${origin}`, () => {
            for (const product of PRODUCTS) {
                const result = runSearch(product, 'import', origin);
                assert.ok(result.tags.length > 0, `expected matches for ${product} from ${origin}`);
                assertHasSelectedMarketRule(result, origin, 'import', product);
                assertNoWrongMarketRules(result, origin, 'import', product);
            }
        });
    }

    it('surfaces US solar import controls for China-to-US photovoltaic products', () => {
        const result = runSearch('solar panel photovoltaic', 'export', 'US');
        const tagIds = ids(result);
        assert.ok(tagIds.includes('CL-USSOLARUFLPA-001'), 'expected UFLPA solar rule');
        assert.ok(tagIds.includes('CL-USSOLARTHREEOONE-001'), 'expected Section 301 solar rule');
        assert.ok(tagIds.includes('CL-USSOLARADCV-001'), 'expected AD/CVD solar rule');
    });

    it('surfaces green compliance signals for electronics and battery market access', () => {
        const usResult = runSearch('ai server gpu data center battery', 'export', 'US', 'import', { from: 'CN', to: 'US' });
        assert.ok(ids(usResult).includes('CL-USGREEN-001'), 'expected US e-waste / battery stewardship rule');
        assert.match(haystack(usResult), /Green Compliance & ESG|e-waste|battery stewardship/i);
        assertNoOppositeRouteFocus(usResult, 'import', 'US green compliance import focus');

        const sgResult = runSearch('network switch data center electronics battery', 'export', 'SG', 'import', { from: 'US', to: 'SG' });
        assert.ok(ids(sgResult).includes('CL-SGGREEN-001'), 'expected Singapore e-waste EPR rule');
        assert.match(haystack(sgResult), /Green Compliance & ESG|e-waste|producer responsibility/i);
        assertNoOppositeRouteFocus(sgResult, 'import', 'Singapore green compliance import focus');
    });

    it('surfaces Vietnam / Malaysia solar routing risk for ASEAN photovoltaic products', () => {
        const result = runSearch('solar panel photovoltaic', 'export', 'ASEAN');
        const text = haystack(result);
        assert.ok(ids(result).includes('CL-ASEANSOLAR-001'), 'expected ASEAN solar routing rule');
        assert.match(text, /Vietnam|Malaysia/i);
        assert.match(text, /transshipment|anti-circumvention|circumvention/i);
    });

    it('surfaces Russia sanctions and dual-use review for AI GPU shipments', () => {
        const result = runSearch('gpu ai accelerator chip', 'export', 'RU');
        const text = haystack(result);
        assert.ok(ids(result).includes('CL-RUMARKET-001'), 'expected Russia market rule');
        assert.match(text, /sanctions|dual-use|end-use/i);
        assert.match(text, /Russia|RU/i);
    });

    it('treats H200 model-only queries as AI GPU / advanced computing exports to China', () => {
        const result = runSearch('H200', 'export', 'US', 'export', { from: 'US', to: 'CN' });
        const text = haystack(result);

        assert.ok(result.tags.length > 0, 'expected H200 to trigger export-control matches');
        assert.match(text, /BIS|advanced computing|semiconductor|Entity List|license/i);
        assert.ok(
            result.tags.some((tag) => effectiveCountry(tag) === 'US' || tag.country === 'US'),
            'expected US-origin export-control rules for H200'
        );
        assertNoOppositeRouteFocus(result, 'export', 'US to China H200 export');
    });

    it('surfaces China import origin checks for US, Taiwan, Japan, and Korea semiconductor products', () => {
        const expectedByOrigin = {
            US: 'CL-USORIGIN-001',
            TW: 'CL-TWORIGIN-001',
            JP: 'CL-JPORIGIN-001',
            KR: 'CL-KRORIGIN-001'
        };
        for (const [origin, expectedTagId] of Object.entries(expectedByOrigin)) {
            const result = runSearch('gpu ai accelerator chip', 'import', origin);
            assert.ok(
                ids(result).includes(expectedTagId),
                `expected ${expectedTagId} for China import from ${origin}`
            );
        }
    });

    it('uses route_focus so destination-import rules do not appear as origin-export rules', () => {
        const mxImport = runSearch('ev charger', 'export', 'MX', 'import');
        assert.ok(ids(mxImport).includes('CL-MX-001'), 'expected Mexico NOM import rule');

        const mxExport = runSearch('ev charger', 'export', 'MX', 'export');
        assert.equal(
            ids(mxExport).includes('CL-MX-001'),
            false,
            'Mexico NOM import rule should not appear for origin export focus'
        );
    });

    it('keeps Japan origin-export baseline out of Japan destination-import smartphone checks', () => {
        const result = runSearch('smartphone 5G cellular', 'export', 'JP', 'import', { from: 'US', to: 'JP' });
        assert.ok(ids(result).includes('CL-JP-003'), 'expected Japan wireless import rule');
        assert.equal(
            ids(result).includes('CL-JPORIGEXP-001'),
            false,
            'Japan origin-export baseline should not appear for Japan destination-import focus'
        );
    });

    it('applies route_focus after precheck result merging', () => {
        setupSearch('export', 'JP', { from: 'US', to: 'JP', focus: 'import' });
        const result = searchWithPrecheck('smartphone 5G cellular', [], search, 'smartphone 5G cellular');
        assert.equal(
            ids(result).includes('CL-JPORIGEXP-001'),
            false,
            'precheck merge should keep export-only Japan rules out of import focus'
        );
    });

    it('keeps route focus clean across maintained countries and representative products', () => {
        for (const focus of ['import', 'export']) {
            for (const market of ROUTE_COUNTRIES) {
                for (const product of PRODUCTS) {
                    const route = focus === 'import'
                        ? { from: market === 'US' ? 'CN' : 'US', to: market }
                        : { from: market, to: market === 'US' ? 'CN' : 'US' };
                    const result = runSearch(product, 'export', market, focus, route);
                    assertNoOppositeRouteFocus(result, focus, `${focus} ${route.from}->${route.to} ${product}`);
                }
            }
        }
    });

    it('does not include China baseline rules for non-China origin export focus', () => {
        const result = runSearch('solar panel photovoltaic', 'export', 'DE', 'export', { from: 'DE', to: 'US' });
        assert.equal(
            result.tags.some((tag) => effectiveCountry(tag) === 'GLOBAL'),
            false,
            'Germany origin export focus should not include China baseline rules'
        );
    });

    it('does not include unrelated China cases for non-China origin export focus', () => {
        const result = runSearch('solar panel photovoltaic', 'export', 'DE', 'export', { from: 'DE', to: 'US' });
        assert.deepEqual(
            result.cases.map((caseItem) => caseItem.case_id),
            [],
            'Germany origin export focus should not show China or unlinked penalty cases'
        );
    });

    it('keeps Vietnam and Malaysia import rules as independent countries', () => {
        const vietnam = runSearch('wireless router wifi telecom equipment', 'export', 'VN', 'import', { from: 'CN', to: 'VN' });
        assert.ok(ids(vietnam).includes('CL-VN-001'), 'expected Vietnam MIC rule');
        assert.equal(ids(vietnam).includes('CL-MY-001'), false, 'Vietnam route should not include Malaysia SIRIM rule');
        assert.ok(vietnam.cases.some((caseItem) => caseItem.case_id === 'CASE-VN-MIC-ICT'));
        assert.equal(vietnam.cases.some((caseItem) => caseItem.case_id === 'CASE-MY-SIRIM-MCMC'), false);

        const malaysia = runSearch('wireless router wifi telecom equipment', 'export', 'MY', 'import', { from: 'CN', to: 'MY' });
        assert.ok(ids(malaysia).includes('CL-MY-001'), 'expected Malaysia SIRIM rule');
        assert.equal(ids(malaysia).includes('CL-VN-001'), false, 'Malaysia route should not include Vietnam MIC rule');
        assert.ok(malaysia.cases.some((caseItem) => caseItem.case_id === 'CASE-MY-SIRIM-MCMC'));
        assert.equal(malaysia.cases.some((caseItem) => caseItem.case_id === 'CASE-VN-MIC-ICT'), false);
    });
});
