'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
    parseImportRate,
    parseMexicoTigieWorkbook
} = require('../lib/mexico-tigie-nico');

test('parses Mexico exempt and percentage IGI rates', () => {
    assert.equal(parseImportRate('Ex.'), 0);
    assert.equal(parseImportRate(15), 0.15);
    assert.equal(parseImportRate('10%'), 0.1);
    assert.equal(parseImportRate(''), null);
});

test('expands official TIGIE lines to filing-grade 10-digit NICO codes', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        [null, null, 'Fracción Arancelaria', 'Descripción', 'Unidad', 'IMP.'],
        [null, null, '8517.62.17', 'Network equipment', 'Pza', 'Ex.'],
        [null, null, '8504.40.99', 'Other converters', 'Pza', 10]
    ]), 'FA');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        [null, null, 'FRACCIÓN ARANCELARIA', 'NICO', 'DESCRIPCIÓN'],
        [null, null, '8517.62.17', '01', 'LAN equipment'],
        [null, null, '8517.62.17', 99, 'Other'],
        [null, null, '8504.40.99', '00', 'Other converters']
    ]), 'NICO');
    const result = parseMexicoTigieWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
        prefixes: ['851762'],
        checkedAt: '2026-07-25T00:00:00.000Z'
    });

    assert.deepEqual(result.rows.map((row) => row.hs_code), ['8517621701', '8517621799']);
    assert.ok(result.rows.every((row) => row.base_rate === 0));
    assert.ok(result.rows.every((row) => row.source_status === 'official_machine_synced'));
});
