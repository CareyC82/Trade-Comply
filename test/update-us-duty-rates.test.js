const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parsePercentRate,
    formatHtsQuery,
    extractHtsNumber,
    extractGeneralRate,
    chooseMostSpecificRate,
    chooseBestRulePrefix
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
