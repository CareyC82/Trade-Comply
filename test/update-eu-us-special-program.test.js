'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    extractAnnexHtml,
    parseAnnexI,
    parseAnnexII,
    parseAnnexIII,
    hasReusableAnnexSnapshot,
    parseQuotaStatusHtml,
    quotaLookupUrl,
    diffAnnexes,
    classifyQuotaAvailability,
    attachQuotaAlerts,
    parseSimpleSpecificDuty,
    buildSpecificDutyStatus,
    updateEuUsSpecialProgram
} = require('../scripts/update-eu-us-special-program');

test('parses EUR-Lex annex variants without relying on one double-quoted id', () => {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'eu-us-1455-annex-variant.html'), 'utf8');
    assert.match(extractAnnexHtml(html, 'I', 'II'), /Electrical machinery/);
    assert.equal(parseAnnexI(html)[0].normalized_code, '85');
    assert.equal(parseAnnexII(html)[0].normalized_code, '0702');
    assert.equal(parseAnnexIII(html)[0].order_number, '09.9001');
});

test('accepts only complete last-good annex snapshots', () => {
    const entries = (count) => Array.from({ length: count }, (_, index) => ({ cn_code: String(index) }));
    const complete = {
        annex_content_hash: 'verified-hash',
        annex_counts: { annex_i: 100, annex_ii: 10, annex_iii: 50 },
        annexes: {
            I: { entries: entries(100) },
            II: { entries: entries(10) },
            III: { entries: entries(50) }
        }
    };
    assert.equal(hasReusableAnnexSnapshot(complete), true);
    assert.equal(hasReusableAnnexSnapshot({ ...complete, annex_content_hash: '' }), false);
    assert.equal(hasReusableAnnexSnapshot({ ...complete, annexes: { ...complete.annexes, III: { entries: entries(49) } } }), false);
});

test('keeps the last-good official annex active when EUR-Lex markup is temporarily unparseable', async () => {
    const result = await updateEuUsSpecialProgram({
        dryRun: true,
        fetcher: async () => '<html><body>Temporary EUR-Lex shell</body></html>',
        skipQuotaStatus: true,
        skipSpecificDutyStatus: true
    });
    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.official_fetch_degraded, true);
    assert.equal(result.official_fetch.reused_last_good, true);
    assert.match(result.official_fetch_degraded_detail, /Annex I container not found/);
});

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
