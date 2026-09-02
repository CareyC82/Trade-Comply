'use strict';

const { spawn } = require('node:child_process');

const NZ_WORKING_TARIFF_URL = 'https://www.customs.govt.nz/business/tariffs/working-tariff-document';
const NZ_SECTIONS = {
    XVI: 'https://www.customs.govt.nz/media/is1dyugy/section-xvi.pdf',
    XVIII: 'https://www.customs.govt.nz/media/extfe0h3/section-xviii.pdf',
    XX: 'https://www.customs.govt.nz/media/n4mpnwys/section-xx.pdf'
};
const CHAPTER_SECTION = { 84: 'XVI', 85: 'XVI', 90: 'XVIII', 94: 'XX', 95: 'XX' };

function normalizeCode(value = '') {
    return String(value).replace(/\D/g, '');
}

function normalizeNzRate(value = '') {
    const text = String(value).trim();
    if (/^free$/i.test(text)) return 0;
    if (!/^\d+(?:\.\d+)?%?$/.test(text)) return null;
    const number = Number(text.replace('%', ''));
    return number > 1 || text.includes('%') ? number / 100 : number;
}

function parseNzWorkingTariffText(text, { prefixes = [], sourceUrl = NZ_WORKING_TARIFF_URL, effectiveFrom = null } = {}) {
    const wanted = prefixes.map(normalizeCode).filter(Boolean);
    const rows = [];
    const sourceText = String(text || '');
    const starts = [...sourceText.matchAll(/^\s*(\d{4}\.\d{2}\.\d{2})\b/gm)];
    for (let index = 0; index < starts.length; index += 1) {
        const start = starts[index];
        const block = sourceText.slice(start.index, starts[index + 1]?.index || sourceText.length);
        const rateMatch = block.match(/\s(Free|\d+(?:\.\d+)?%?)\s+(Free|\d+(?:\.\d+)?%?)\s*(?:\r?\n|$)/i);
        if (!rateMatch) continue;
        const hsCode = normalizeCode(start[1]);
        if (wanted.length && !wanted.some((prefix) => hsCode.startsWith(prefix))) continue;
        const normalRate = normalizeNzRate(rateMatch[1]);
        if (normalRate === null) continue;
        rows.push({
            hs_code: hsCode,
            normal_rate: normalRate,
            preferential_rate_text: rateMatch[2],
            description: block.slice(start[0].length, rateMatch.index).replace(/\s+/g, ' ').replace(/^.*?\s[–-]\s/, '').trim(),
            measure_type: 'normal_base_duty',
            origin_scope: 'ERGA_OMNES',
            effective_from: effectiveFrom,
            source_url: sourceUrl,
            source_name: 'New Zealand Customs Service Working Tariff'
        });
    }
    return [...new Map(rows.map((row) => [row.hs_code, row])).values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code));
}

function extractPdfText(pdfPath, { command = process.env.PDFTOTEXT_BIN || 'pdftotext' } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, ['-layout', pdfPath, '-']);
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => code === 0
            ? resolve(stdout)
            : reject(new Error(`NZ Working Tariff PDF extraction failed: ${stderr.trim() || `pdftotext exited ${code}`}`)));
    });
}

module.exports = {
    NZ_WORKING_TARIFF_URL,
    NZ_SECTIONS,
    CHAPTER_SECTION,
    normalizeNzRate,
    parseNzWorkingTariffText,
    extractPdfText
};
