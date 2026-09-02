'use strict';

const ABF_TARIFF_LANDING_URL = 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff';
const ABF_CHAPTERS = {
    84: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xvi/chapter-84',
    85: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xvi/chapter-85',
    90: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xviii/chapter-90',
    94: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xx/chapter-94',
    95: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xx/chapter-95'
};

function normalizeCode(value = '') {
    return String(value).replace(/\D/g, '');
}

function decodeHtml(value = '') {
    return String(value)
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'")
        .replace(/&colon;/gi, ':')
        .replace(/\s+/g, ' ')
        .trim();
}

function currentAdValoremRate(value = '') {
    const matches = decodeHtml(value).match(/Free|Nil|\d+(?:\.\d+)?%/gi) || [];
    if (!matches.length) return null;
    const latest = matches[matches.length - 1];
    if (/^(free|nil)$/i.test(latest)) return 0;
    return Number(latest.replace('%', '')) / 100;
}

function parseAbfChapterHtml(html, { prefixes = [], sourceUrl = ABF_TARIFF_LANDING_URL, effectiveFrom = null } = {}) {
    const wanted = prefixes.map(normalizeCode).filter(Boolean);
    const rows = [];
    for (const rowHtml of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...rowHtml[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((match) => match[1]);
        if (cells.length < 5) continue;
        const hsCode = normalizeCode(decodeHtml(cells[0]));
        if (hsCode.length !== 8) continue;
        if (wanted.length && !wanted.some((prefix) => hsCode.startsWith(prefix))) continue;
        const rate = currentAdValoremRate(cells[4]);
        if (rate === null) continue;
        rows.push({
            hs_code: hsCode,
            general_rate: rate,
            description: decodeHtml(cells[3]),
            measure_type: 'general_base_duty',
            origin_scope: 'ERGA_OMNES',
            effective_from: effectiveFrom,
            source_url: sourceUrl,
            source_name: 'Australian Border Force Current Tariff Schedule 3'
        });
    }
    return [...new Map(rows.map((row) => [row.hs_code, row])).values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code));
}

async function buildAustraliaExactPayload(prefixes, { fetchImpl = global.fetch, checkedAt = new Date().toISOString() } = {}) {
    const normalized = [...new Set(prefixes.map(normalizeCode).filter(Boolean))];
    const chapters = [...new Set(normalized.map((prefix) => Number(prefix.slice(0, 2))))];
    const unsupported = chapters.filter((chapter) => !ABF_CHAPTERS[chapter]);
    if (unsupported.length) throw new Error(`Australia parser has no official chapter mapping for: ${unsupported.join(', ')}`);
    const rows = [];
    for (const chapter of chapters) {
        const url = ABF_CHAPTERS[chapter];
        const response = await fetchImpl(url, { headers: { accept: 'text/html' } });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ABF chapter ${chapter}`);
        rows.push(...parseAbfChapterHtml(await response.text(), {
            prefixes: normalized.filter((prefix) => Number(prefix.slice(0, 2)) === chapter),
            sourceUrl: url,
            effectiveFrom: String(checkedAt).slice(0, 10)
        }));
    }
    const missing = normalized.filter((prefix) => !rows.some((row) => row.hs_code.startsWith(prefix)));
    if (missing.length) throw new Error(`ABF exact tariff parser returned no rows for maintained prefix(es): ${missing.join(', ')}`);
    return {
        complete: true,
        country: 'AU',
        revision: `Current Tariff checked ${String(checkedAt).slice(0, 10)}`,
        source: { name: 'Australian Border Force Current Tariff Schedule 3', url: ABF_TARIFF_LANDING_URL },
        rows
    };
}

module.exports = {
    ABF_TARIFF_LANDING_URL,
    ABF_CHAPTERS,
    currentAdValoremRate,
    parseAbfChapterHtml,
    buildAustraliaExactPayload
};
