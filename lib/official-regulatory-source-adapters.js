'use strict';

const crypto = require('node:crypto');

function stripHtml(html) {
    const raw = String(html || '');
    const regions = [...raw.matchAll(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/gi)].map((match) => match[1]);
    const main = regions.sort((a, b) => b.length - a.length)[0] || raw;
    return main
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:nbsp|#160);/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function adapterFor(source, contentType = '') {
    const url = new URL(source.url);
    if (/pdf/i.test(contentType) || /\.pdf(?:$|\?)/i.test(source.url)) return 'official_pdf_fingerprint';
    if (url.hostname === 'eur-lex.europa.eu') return 'eur_lex_html';
    if (url.hostname.endsWith('meti.go.jp')) return 'jp_meti_html';
    if (url.hostname.endsWith('consumerproductsafety.gov.sg')) return 'sg_cpso_html';
    if (url.hostname.endsWith('fcc.gov')) return 'us_fcc_html';
    return 'official_html';
}

function parseOfficialPayload({ source, body, contentType = '' }) {
    const adapter = adapterFor(source, contentType);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
    if (adapter === 'official_pdf_fingerprint') {
        if (buffer.length < 500 || !buffer.subarray(0, 5).toString().startsWith('%PDF')) return { ok: false, adapter, error: 'invalid_pdf_payload' };
        const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');
        return { ok: true, adapter, content: `${source.authority}. ${source.title}. ${source.scope || ''} Official PDF bytes ${buffer.length}. SHA256 ${fingerprint}.`, binaryHash: fingerprint };
    }
    const text = stripHtml(buffer.toString('utf8'));
    if (text.length < 80) return { ok: false, adapter, error: 'empty_or_unusable_content' };
    return { ok: true, adapter, content: text };
}

module.exports = { adapterFor, parseOfficialPayload, stripHtml };
