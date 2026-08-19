'use strict';

const OFFICIAL_ENDPOINT = 'https://apps.fcc.gov/OETLabServices/getFCCIDList';
const OFFICIAL_SEARCH = 'https://apps.fcc.gov/oetcf/eas/reports/GenericSearch.cfm';

function normalizeFccId(value) {
    return String(value || '').trim().toUpperCase().replace(/^FCC\s*ID\s*:?\s*/i, '').replace(/\s+/g, '');
}

function validFccId(value) {
    return /^[A-Z0-9]{3,5}[A-Z0-9-]{1,14}$/.test(normalizeFccId(value));
}

class FccEasClient {
    constructor(options = {}) {
        this.fetch = options.fetch || globalThis.fetch;
        this.endpoint = options.endpoint || process.env.FCC_EAS_API_URL || OFFICIAL_ENDPOINT;
        this.now = options.now || (() => Date.now());
        this.cacheMs = Number(options.cacheMs || process.env.FCC_EAS_CACHE_SECONDS || 21600) * 1000;
        this.cache = new Map();
    }

    async lookup(value) {
        const fccId = normalizeFccId(value);
        if (!validFccId(fccId)) throw Object.assign(new Error('Enter a complete FCC ID using 3–5 grantee characters plus the product code.'), { status: 400 });
        const cached = this.cache.get(fccId);
        if (cached && this.now() - cached.at < this.cacheMs) return { ...cached.value, cached: true };
        let response;
        try {
            const url = new URL(this.endpoint); url.searchParams.set('fccId', fccId);
            response = await this.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TraceWize/1.0 FCC-ID-verification' }, signal: AbortSignal.timeout(10000) });
        } catch {
            throw Object.assign(new Error('The FCC official lookup is temporarily unavailable. Treat this FCC ID as unverified and check it manually.'), { status: 503 });
        }
        if (!response.ok) throw Object.assign(new Error('The FCC official lookup is temporarily unavailable. Treat this FCC ID as unverified and check it manually.'), { status: 503 });
        let rows;
        try { rows = await response.json(); } catch { rows = null; }
        if (!Array.isArray(rows)) throw Object.assign(new Error('The FCC returned an unexpected response. Treat this FCC ID as unverified.'), { status: 502 });
        const exact = rows.filter((row) => normalizeFccId(row.fccid || row.FCCId) === fccId);
        const result = {
            fccId,
            status: exact.length ? 'official_match' : 'not_found',
            verified: exact.length > 0,
            checkedAt: new Date(this.now()).toISOString(),
            source: { authority: 'Federal Communications Commission (FCC)', url: OFFICIAL_SEARCH },
            records: exact.slice(0, 10).map((row) => ({
                fccId: normalizeFccId(row.fccid || row.FCCId),
                grantee: String(row.grantee || row.granteeName || '').slice(0, 160),
                grantDate: String(row.grantDate || '').slice(0, 30),
                applicationPurpose: String(row.applicationPurpose || '').slice(0, 120),
                country: String(row.country || '').slice(0, 80)
            })),
            disclaimer: exact.length
                ? 'Official database match found. Confirm the grant belongs to the exact product, radio configuration and model; a database match is not full product approval.'
                : 'No exact approved FCC ID match was returned. Do not treat the supplier claim as verified; confirm the ID format and search the FCC EAS manually.'
        };
        this.cache.set(fccId, { at: this.now(), value: result });
        return result;
    }
}

module.exports = { FccEasClient, OFFICIAL_ENDPOINT, OFFICIAL_SEARCH, normalizeFccId, validFccId };
