'use strict';

const { spawn } = require('node:child_process');

const SG_STCCED_PDF_URL = 'https://file.go.gov.sg/stcced2022.pdf';
const SG_DUTIABLE_GOODS_URL = 'https://www.customs.gov.sg/doing-business/valuation-duties-and-fees/duties-and-dutiable-goods/list-of-dutiable-goods/';
const REQUIRED_DUTIABLE_CLASSES = [
    'intoxicating liquors',
    'tobacco products',
    'motor vehicles',
    'petroleum products'
];

function normalizeCode(value = '') {
    return String(value).replace(/\D/g, '');
}

function verifySingaporeDutiableScope(html = '') {
    const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const missing = REQUIRED_DUTIABLE_CLASSES.filter((label) => !text.includes(label));
    return {
        ok: missing.length === 0 && text.includes('dutiable'),
        missing
    };
}

function parseStccedText(text, { prefixes = [] } = {}) {
    const wanted = prefixes.map(normalizeCode).filter(Boolean);
    const rows = [];
    for (const line of String(text || '').split(/\r?\n/)) {
        const match = line.match(/^\s*(\d{4}\.\d{2}\.\d{2})\s+(.+?)\s+(?:NMB|KGM|LTR|TNE|MTK|MTQ|MIL|CCT|CTM|KWH|MTR|DZN|SET|PCE)\s*$/);
        if (!match) continue;
        const hsCode = normalizeCode(match[1]);
        if (wanted.length && !wanted.some((prefix) => hsCode.startsWith(prefix))) continue;
        rows.push({
            hs_code: hsCode,
            description: match[2].replace(/^\s*-\s*/, '').trim()
        });
    }
    return [...new Map(rows.map((row) => [row.hs_code, row])).values()]
        .sort((a, b) => a.hs_code.localeCompare(b.hs_code));
}

function extractPdfText(pdfPath, {
    command = process.env.PDFTOTEXT_BIN || 'pdftotext'
} = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, ['-layout', pdfPath, '-']);
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`STCCED PDF extraction failed: ${stderr.trim() || `pdftotext exited ${code}`}`));
                return;
            }
            resolve(stdout);
        });
    });
}

function buildSingaporeExactPayload({ text, dutiableHtml, prefixes = [], checkedAt } = {}) {
    const scope = verifySingaporeDutiableScope(dutiableHtml);
    if (!scope.ok) {
        throw new Error(`Singapore dutiable-goods scope verification failed: ${scope.missing.join(', ')}`);
    }
    const rows = parseStccedText(text, { prefixes });
    if (!rows.length) throw new Error('STCCED parser returned no maintained 8-digit AHTN rows.');
    return {
        complete: true,
        country: 'SG',
        revision: 'STCCED 2022',
        source: {
            name: 'Singapore Customs STCCED 2022 and List of Dutiable Goods',
            url: SG_DUTIABLE_GOODS_URL
        },
        rows: rows.map((row) => ({
            ...row,
            customs_duty_rate: 0,
            measure_type: 'non_dutiable_goods_base_duty',
            origin_scope: 'ERGA_OMNES',
            effective_from: checkedAt ? String(checkedAt).slice(0, 10) : null
        }))
    };
}

module.exports = {
    SG_STCCED_PDF_URL,
    SG_DUTIABLE_GOODS_URL,
    REQUIRED_DUTIABLE_CLASSES,
    verifySingaporeDutiableScope,
    parseStccedText,
    extractPdfText,
    buildSingaporeExactPayload
};
