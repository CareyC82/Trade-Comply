'use strict';

const CHINA_CUSTOMS_TARIFF_URL = 'https://online.customs.gov.cn/ociswebserver/ocis/taxRateQuery/query/queryImpTariffRate';
const CHINA_CUSTOMS_SOURCE_URL = 'https://online.customs.gov.cn/ociswebserver/pages/jckspsl/index.html';

function parseChinaCustomsEnvelope(payload) {
    const raw = String(payload?.res || '').trim();
    if (!raw) throw new Error('China Customs tariff response is missing res.');
    const json = raw.replace(/([{,])\s*([A-Za-z][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    const parsed = JSON.parse(json);
    if (String(parsed.statue) !== '1') {
        throw new Error(`China Customs tariff query failed: ${parsed.message || 'unknown error'}`);
    }
    return parsed;
}

async function queryChinaCustomsTariffs(prefix, {
    fetchImpl = global.fetch,
    date = new Date().toISOString().slice(0, 10),
    pageSize = 100
} = {}) {
    const rows = [];
    let page = 1;
    let total = Infinity;
    while (rows.length < total) {
        const param = JSON.stringify({
            gName: '',
            codeTs: String(prefix),
            sysDate: date,
            nextPage: page,
            pageSize: String(pageSize)
        });
        const response = await fetchImpl(CHINA_CUSTOMS_TARIFF_URL, {
            method: 'POST',
            headers: {
                accept: 'application/json, text/javascript, */*; q=0.01',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'user-agent': 'TraceWize duty-rate updater (+https://tracewize.com)'
            },
            body: new URLSearchParams({ param }).toString()
        });
        if (!response.ok) throw new Error(`China Customs tariff query HTTP ${response.status} for ${prefix}`);
        const envelope = parseChinaCustomsEnvelope(await response.json());
        total = Number(envelope.totalCount || 0);
        const pageRows = Array.isArray(envelope.data) ? envelope.data : [];
        rows.push(...pageRows);
        if (!pageRows.length || rows.length >= total) break;
        page += 1;
    }
    if (rows.length !== total) {
        throw new Error(`China Customs tariff query incomplete for ${prefix}: received ${rows.length}/${total}`);
    }
    return rows;
}

async function buildChinaCustomsExactPayload(prefixes, options = {}) {
    const allRows = [];
    for (const prefix of prefixes) {
        allRows.push(...await queryChinaCustomsTariffs(prefix, options));
    }
    const unique = new Map();
    allRows.forEach((row) => unique.set(String(row.codeTs), row));
    return {
        complete: true,
        country: 'CN',
        effective_from: options.date || new Date().toISOString().slice(0, 10),
        source: {
            name: 'General Administration of Customs of China tariff query',
            url: CHINA_CUSTOMS_SOURCE_URL
        },
        rows: [...unique.values()].map((row) => ({
            hs_code: row.codeTs,
            description: row.gName,
            mfn_rate: row.impDiscountRate,
            ordinary_rate: row.impOrdinaryRate,
            temporary_rate: row.impTempRate,
            measure_type: 'mfn_base_duty',
            origin_scope: 'MFN'
        }))
    };
}

module.exports = {
    CHINA_CUSTOMS_TARIFF_URL,
    CHINA_CUSTOMS_SOURCE_URL,
    parseChinaCustomsEnvelope,
    queryChinaCustomsTariffs,
    buildChinaCustomsExactPayload
};
