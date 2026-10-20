const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parsePercentRate,
    formatHtsQuery,
    extractHtsNumber,
    extractGeneralRate,
    parseExactAdValoremRate,
    extractExactRateRows,
    chooseMostSpecificRate,
    chooseBestRulePrefix,
    consumerCatalogPrefixes,
    ensureConsumerCatalogRule,
    buildUniformPlanningRows,
    mergeExactOverrides
} = require('../scripts/update-us-duty-rates');

test('formats HS prefixes for USITC query ranges', () => {
    assert.equal(formatHtsQuery('8542'), '8542');
    assert.equal(formatHtsQuery('850760'), '8507.60');
    assert.equal(formatHtsQuery('85076000'), '8507.60.00');
    assert.equal(formatHtsQuery('8507600090'), '8507.60.00.90');
});

test('parses simple ad-valorem duty rates', () => {
    assert.equal(parsePercentRate(''), null);
    assert.equal(parsePercentRate('Free'), 0);
    assert.equal(parsePercentRate('3.4%'), 0.034);
    assert.ok(Math.abs(parsePercentRate('2.6% + 1.1¢/kg') - 0.026) < 0.000001);
    assert.equal(parsePercentRate('$1/kg'), null);
});

test('filing-grade rows exclude compound rates that cannot be represented safely', () => {
    assert.equal(parseExactAdValoremRate('Free'), 0);
    assert.equal(parseExactAdValoremRate('3.4%'), 0.034);
    assert.equal(parseExactAdValoremRate('2.6% + 1.1¢/kg'), null);
    assert.equal(parseExactAdValoremRate('$1/kg'), null);
});

test('extracts complete HTS10 rows and inherits a clean parent rate', () => {
    const rows = [
        { htsno: '8518.21', indent: '1', description: 'Single loudspeakers', general: '4.9%' },
        { htsno: '8518.21.00.40', indent: '2', description: 'Other', general: '' },
        { htsno: '8518.21.00.80', indent: '2', description: 'Other', general: 'Free' },
        { htsno: '8518.22.00.00', indent: '2', description: 'Multiple loudspeakers', general: '2.6% + 1.1¢/kg' }
    ];
    assert.deepEqual(extractExactRateRows(rows, '851821'), [
        { hsCode: '8518210040', baseRate: 0.049, rateText: '4.9%', description: 'Other' },
        { hsCode: '8518210080', baseRate: 0, rateText: 'Free', description: 'Other' }
    ]);
});

test('extracts HTS number and general rate from flexible row fields', () => {
    const row = {
        'HTS Number': '8507.60',
        'Stat Suffix': '0020',
        'General Rate of Duty': '3.4%'
    };

    assert.equal(extractHtsNumber(row), '8507600020');
    assert.equal(extractGeneralRate(row), '3.4%');
});

test('chooses most specific matching HTS rate', () => {
    const rows = [
        { htsno: '8507.60', general: '3.4%' },
        { htsno: '8507.60.00', general: '2.5%' }
    ];
    const match = chooseMostSpecificRate(rows, '850760');

    assert.equal(match.rate, 0.025);
    assert.equal(match.hts, '85076000');
});

test('chooses the longest rule prefix before querying USITC', () => {
    assert.equal(chooseBestRulePrefix(['847950', '8479']), '847950');
    assert.equal(chooseBestRulePrefix(['8806', '880622']), '880622');
});

test('US exact coverage follows the maintained consumer-electronics catalog', () => {
    const prefixes = consumerCatalogPrefixes();
    assert.ok(prefixes.includes('851821'));
    assert.ok(prefixes.includes('850440'));
    assert.ok(prefixes.includes('847130'));
    const rules = [];
    const rule = ensureConsumerCatalogRule(rules);
    assert.equal(rules.length, 1);
    assert.equal(rule.origin_country, '*');
    assert.deepEqual(rule.hs_prefixes, prefixes);
    assert.match(rule.trade_remedy, /Chapter 99/);
});

test('US sync can retain shorter planning rows beside filing-grade HTS10 rows', () => {
    const merged = mergeExactOverrides(
        [{ hs_code: '847950', base_rate: 0.025, source_status: 'official_source_checked' }],
        [{ hsCode: '8479500000', baseRate: 0.025, description: 'Industrial robots', rateText: '2.5%', sourceUrl: 'https://hts.usitc.gov/' }],
        '2026-10-20T00:00:00.000Z',
        ['847950']
    );
    assert.deepEqual(merged.map((row) => row.hs_code), ['847950', '8479500000']);
    assert.equal(merged[1].confidence, 'Official exact HTS10 line');
});

test('uniform HTS10 children produce a planning prefix but mixed rates do not', () => {
    const exactRows = [
        { hsCode: '8479500000', baseRate: 0.025, sourceUrl: 'https://hts.usitc.gov/' },
        { hsCode: '8504400001', baseRate: 0, sourceUrl: 'https://hts.usitc.gov/' },
        { hsCode: '8504400002', baseRate: 0.03, sourceUrl: 'https://hts.usitc.gov/' }
    ];
    const rows = buildUniformPlanningRows(['847950', '850440'], exactRows, '2026-10-20T00:00:00.000Z');
    assert.deepEqual(rows.map((row) => row.hs_code), ['847950']);
    assert.equal(rows[0].base_rate, 0.025);
    assert.match(rows[0].confidence, /planning signal/);
});
