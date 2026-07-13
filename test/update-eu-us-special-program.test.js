'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseQuotaStatusHtml,
    quotaLookupUrl,
    diffAnnexes,
    classifyQuotaAvailability,
    attachQuotaAlerts,
    parseSimpleSpecificDuty,
    buildSpecificDutyStatus
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

test('classifies live quota balances against the official initial volume', () => {
    assert.equal(classifyQuotaAvailability(0, '1000 Kilogram').status, 'exhausted');
    assert.equal(classifyQuotaAvailability(50, '1000 Kilogram').status, 'critical');
    assert.equal(classifyQuotaAvailability(200, '1000 Kilogram').status, 'low');
    assert.equal(classifyQuotaAvailability(201, '1000 Kilogram').status, 'available');
    assert.equal(classifyQuotaAvailability(10, 'not published').status, 'unknown');

    const rows = attachQuotaAlerts([
        { order_number: '09.9001', balance: 40 }
    ], [
        { order_number: '09.9001', quota_volume: '1 000 kg' }
    ]);
    assert.equal(rows[0].status, 'critical');
    assert.equal(rows[0].remaining_ratio, 0.04);
});

test('keeps conditional TARIC formulas manual while exposing safe simple formulas', () => {
    assert.deepEqual(parseSimpleSpecificDuty('0.000 %'), {
        amount: 0,
        currency: 'EUR',
        unit: 'NONE',
        rate_per_100kg: 0
    });
    assert.equal(parseSimpleSpecificDuty('12.500 EUR DTN').rate_per_100kg, 12.5);
    assert.equal(parseSimpleSpecificDuty('Cond: 12.500 EUR DTN'), null);

    const status = buildSpecificDutyStatus([
        {
            goods_code: '0702000000',
            origin_code: 'US',
            measure_type_code: '142',
            measure_type: 'Autonomous suspension',
            legal_base: 'R1455/26',
            duty: '12.500 EUR DTN',
            start_date: '01-07-2026',
            end_date: '31-12-2026'
        },
        {
            goods_code: '0702000010',
            origin_code: 'US',
            measure_type_code: '142',
            measure_type: 'Autonomous suspension',
            legal_base: 'R1455/26',
            duty: 'Cond: 4.000 EUR DTN',
            start_date: '01-07-2026',
            end_date: '31-12-2026'
        },
        {
            goods_code: '0702000020',
            origin_code: 'CA',
            measure_type_code: '142',
            legal_base: 'R1455/26',
            duty: '1.000 EUR DTN'
        }
    ], [{ cn_code: '0702', normalized_code: '0702' }]);

    assert.equal(status.matched_rows, 2);
    assert.equal(status.exact_goods_codes, 2);
    assert.equal(status.simple_auto_rows, 1);
    assert.equal(status.conditional_rows, 1);
});
