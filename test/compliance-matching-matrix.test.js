const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const { search } = require('../js/search');

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

function setupSearch(direction, selectedCountry) {
    globalThis.AppState = {
        data: { tags, cases },
        currentDirection: direction,
        currentCountry: selectedCountry
    };
    globalThis.TradeComplyCountry = country;
    globalThis.TradeComplyMatchedResults = matchedResults;
}

function runSearch(query, direction, selectedCountry) {
    setupSearch(direction, selectedCountry);
    return search(query);
}

function effectiveCountry(tag) {
    const regional = /^CL-(TW|JP|KR|RU|ASEAN)-/i.exec(String(tag.tag_id || ''));
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
});
