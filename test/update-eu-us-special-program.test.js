'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseQuotaStatusHtml,
    quotaLookupUrl,
    diffAnnexes
} = require('../scripts/update-eu-us-special-program');

test('parses official EU QUOTA balance rows by order number', () => {
    const html = `
        <td data-ecl-table-header="Order number">099001</td>
        <td data-ecl-table-header="Origins"><div>United States</div></td>
        <td data-ecl-table-header="Start date">01-07-2026</td>
        <td data-ecl-table-header="End date">30-06-2027</td>
        <td data-ecl-table-header="Balance">25000000&nbsp; Kilogram</td>`;
    const row = parseQuotaStatusHtml(html, '09.9001');
    assert.equal(row.order_number, '09.9001');
    assert.equal(row.origin, 'United States');
    assert.equal(row.balance, 25000000);
    assert.equal(row.unit, 'Kilogram');
    assert.equal(row.available, true);
    assert.match(quotaLookupUrl('09.9001', 2026), /Code=099001.*Year=2026/);
});

test('diffs Annex CN additions, removals, and treatment changes', () => {
    const previous = { I: { entries: [{ cn_code: '85', normalized_code: '85', treatment: 'old' }] } };
    const next = { I: { entries: [
        { cn_code: '85', normalized_code: '85', treatment: 'new' },
        { cn_code: '84', normalized_code: '84', treatment: 'new' }
    ] } };
    const diff = diffAnnexes(previous, next);
    assert.deepEqual(diff.added.map((row) => row.cn_code), ['84']);
    assert.deepEqual(diff.changed.map((row) => row.cn_code), ['85']);
    assert.equal(diff.removed.length, 0);
});
