'use strict';

const XLSX = require('xlsx');

const MX_TIGIE_NICO_URL =
    'https://www.snice.gob.mx/~oracle/SNICE_DOCS/FRACCIONESARANCELARIAS-LIGIE_20260420-20260420.xlsx';
const MX_TIGIE_INFO_URL = 'https://www.snice.gob.mx/cs/avi/snice/ligie.info22.html';

function cleanCode(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 8 ? digits : '';
}

function parseImportRate(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (/^(ex\.?|exento)$/i.test(text)) return 0;
    const numeric = Number(text.replace(',', '.').replace('%', ''));
    return Number.isFinite(numeric) ? numeric / 100 : null;
}

function sheetRows(workbook, name) {
    const sheet = workbook.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) : [];
}

function parseMexicoTigieWorkbook(input, { prefixes = [], checkedAt = new Date().toISOString() } = {}) {
    const workbook = Buffer.isBuffer(input)
        ? XLSX.read(input, { type: 'buffer' })
        : XLSX.readFile(input);
    const wanted = prefixes.map((value) => String(value).replace(/\D/g, '')).filter(Boolean);
    const matchesPrefix = (code) => !wanted.length || wanted.some((prefix) => code.startsWith(prefix));
    const tariffLines = new Map();

    for (const row of sheetRows(workbook, 'FA')) {
        const code = cleanCode(row[2]);
        const rate = parseImportRate(row[5]);
        if (!code || rate === null || !matchesPrefix(code)) continue;
        tariffLines.set(code, {
            rate,
            description: String(row[3] || '').trim(),
            rateText: String(row[5] || '').trim()
        });
    }

    const nicoRows = [];
    for (const row of sheetRows(workbook, 'NICO')) {
        const tariffCode = cleanCode(row[2]);
        const nico = String(row[3] ?? '').replace(/\D/g, '').padStart(2, '0');
        const tariff = tariffLines.get(tariffCode);
        if (!tariff || nico.length !== 2) continue;
        nicoRows.push({
            hs_code: `${tariffCode}${nico}`,
            base_rate: tariff.rate,
            source_status: 'official_machine_synced',
            confidence: 'Official machine-synced duty',
            source_note: `SNICE TIGIE/NICO: ${String(row[4] || tariff.description).trim()}`,
            source_hts: `${tariffCode}.${nico}`,
            source_rate_text: `IGI ${tariff.rateText}`,
            source_url: MX_TIGIE_INFO_URL,
            last_checked_at: checkedAt
        });
    }

    const rows = nicoRows.length ? nicoRows : [...tariffLines].map(([code, tariff]) => ({
        hs_code: code,
        base_rate: tariff.rate,
        description: tariff.description
    }));
    return {
        complete: true,
        country: 'MX',
        revision: 'SNICE LIGIE 2026-04-20',
        source: {
            name: 'SNICE Fracciones Arancelarias LIGIE',
            url: MX_TIGIE_INFO_URL
        },
        rows: rows.map((row) => ({
            ...row,
            igi_rate: row.base_rate,
            effective_from: String(checkedAt).slice(0, 10)
        }))
    };
}

module.exports = {
    MX_TIGIE_NICO_URL,
    MX_TIGIE_INFO_URL,
    parseImportRate,
    parseMexicoTigieWorkbook
};
