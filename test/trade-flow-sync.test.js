'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    buildComtradeUrl,
    latestPeriodFromSingStat,
    latestPeriodFromText,
    mergeSeries,
    monthList,
    nationalConnectorState,
    parseCensusRows,
    parseComtradeRows,
    probeConnectorOfficialLatest,
    syncCensus,
    syncComtrade,
    syncNationalOfficialConnectors,
    syncOfficialBatches,
    validateOfficialManifest
} = require('../scripts/update-trade-flow');

test('official month parser accepts customs and statistical month formats', () => {
    assert.equal(latestPeriodFromText('May 2026; 2026 Apr; 2026M03; 202602'), '2026-05');
    assert.equal(latestPeriodFromText('<baseYm>202604</baseYm>'), '2026-04');
    assert.equal(latestPeriodFromText('Released: Sept. 2025'), '2025-09');
});

test('SingStat month parser finds the newest nested official period', () => {
    const latest = latestPeriodFromSingStat({ Data: { row: [{ columns: [{ key: '2026 Mar' }, { key: '2026 Apr' }] }] } });
    assert.equal(latest, '2026-04');
});

test('official period probe uses environment override without a network request', async () => {
    const probe = await probeConnectorOfficialLatest({ latest_period_env: 'JP_LATEST' }, {
        env: { JP_LATEST: '2026-05' },
        fetchImpl: async () => { throw new Error('network should not be called'); }
    });
    assert.equal(probe.status, 'environment_override');
    assert.equal(probe.latest_period, '2026-05');
});

test('monthList keeps a thirty-month official reporting window', () => {
    const months = monthList(new Date('2026-07-14T00:00:00Z'));
    assert.equal(months.length, 30);
    assert.equal(months[0], '202312');
    assert.equal(months.at(-1), '202605');
});

test('parseCensusRows converts official import rows', () => {
    const rows = parseCensusRows([
        ['GEN_VAL_MO', 'I_COMMODITY', 'time'],
        ['12345', '8542', '2026-01']
    ], { flow: 'import', industryId: 'semiconductor_ai', hsCode: '8542' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].imports_value_usd, 12345);
    assert.equal(rows[0].exports_value_usd, 0);
    assert.equal(rows[0].status, 'official');
});

test('mergeSeries combines import and export rows for the same official key', () => {
    const merged = mergeSeries([], [
        { market: 'US', partner: 'WORLD', industry_id: 'memory', hs_code: '8542', month: '2026-01', imports_value_usd: 10, exports_value_usd: 0, source_id: 'source' },
        { market: 'US', partner: 'WORLD', industry_id: 'memory', hs_code: '8542', month: '2026-01', imports_value_usd: 0, exports_value_usd: 4, source_id: 'source' }
    ], 'source');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].imports_value_usd, 10);
    assert.equal(merged[0].exports_value_usd, 4);
});

test('missing Census key leaves prior official series intact', async () => {
    const payload = {
        sources: [{ id: 'us-census-international-trade', status: 'official_current' }],
        series: [{ source_id: 'us-census-international-trade', month: '2026-01', status: 'official' }]
    };
    const result = await syncCensus(payload, { apiKey: '' });
    assert.equal(result.skipped, true);
    assert.equal(payload.series.length, 1);
    assert.equal(payload.sources[0].status, 'key_required');
});

test('buildComtradeUrl batches reporters, exact HS codes, and both trade flows', () => {
    const url = new URL(buildComtradeUrl({ period: '202412', reporters: { CN: 156 }, hsCodes: ['854232'] }));
    assert.equal(url.searchParams.get('period'), '202412');
    assert.equal(url.searchParams.get('reporterCode'), '156');
    assert.equal(url.searchParams.get('cmdCode'), '854232');
    assert.equal(url.searchParams.get('flowCode'), 'M,X');
});

test('parseComtradeRows maps exact memory imports to official monthly rows', () => {
    const rows = parseComtradeRows({ data: [{
        period: '202412', reporterCode: 156, flowCode: 'M', cmdCode: '854232', primaryValue: 8192854446
    }] });
    const memory = rows.find((row) => row.industry_id === 'memory');
    assert.equal(memory.market, 'CN');
    assert.equal(memory.month, '2024-12');
    assert.equal(memory.imports_value_usd, 8192854446);
    assert.equal(memory.exports_value_usd, 0);
    assert.equal(memory.status, 'official');
});

test('syncComtrade replaces its own rows and marks official source current', async () => {
    const payload = {
        sources: [{ id: 'un-comtrade-monthly', status: 'connector_ready' }],
        series: [{ source_id: 'other-source', market: 'US', month: '2024-12' }]
    };
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({ data: [{
            period: '202412', reporterCode: 156, flowCode: 'X', cmdCode: '854232', primaryValue: 100
        }] })
    });
    const result = await syncComtrade(payload, { fetchImpl, periods: ['202412'], concurrency: 1 });
    assert.equal(result.ok, true);
    assert.equal(payload.sources[0].status, 'official_current');
    assert.equal(payload.series.some((row) => row.source_id === 'other-source'), true);
    assert.equal(payload.series.some((row) => row.source_id === 'un-comtrade-monthly' && row.exports_value_usd === 100), true);
});

test('syncComtrade rejects a partial month batch and retains last-good rows', async () => {
    const lastGood = {
        source_id: 'un-comtrade-monthly', market: 'CN', partner: 'WORLD', industry_id: 'memory',
        hs_code: '854232', month: '2024-12', imports_value_usd: 90, exports_value_usd: 10
    };
    const payload = {
        sources: [{ id: 'un-comtrade-monthly', status: 'official_current' }],
        series: [lastGood]
    };
    const fetchImpl = async (url) => ({
        ok: true,
        json: async () => ({ data: new URL(url).searchParams.get('period') === '202412' ? [{
            period: '202412', reporterCode: 156, flowCode: 'M', cmdCode: '854232', primaryValue: 200
        }] : [] })
    });
    const result = await syncComtrade(payload, { fetchImpl, periods: ['202412', '202501'], concurrency: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error, /Incomplete official batch/);
    assert.deepEqual(payload.series, [lastGood]);
    assert.equal(payload.sources[0].status, 'degraded');
});

test('syncComtrade replaces requested months but preserves older official history', async () => {
    const payload = {
        sources: [{ id: 'un-comtrade-monthly', status: 'official_current' }],
        series: [{
            source_id: 'un-comtrade-monthly', market: 'CN', partner: 'WORLD', industry_id: 'memory',
            hs_code: '854232', month: '2023-12', imports_value_usd: 50, exports_value_usd: 5
        }]
    };
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({ data: [{
            period: '202412', reporterCode: 156, flowCode: 'X', cmdCode: '854232', primaryValue: 100
        }] })
    });
    const result = await syncComtrade(payload, { fetchImpl, periods: ['202412'], concurrency: 1 });
    assert.equal(result.ok, true);
    assert.equal(payload.series.some((row) => row.month === '2023-12' && row.imports_value_usd === 50), true);
    assert.equal(payload.series.some((row) => row.month === '2024-12' && row.exports_value_usd === 100), true);
});

test('national official manifest accepts industry rows without exact HS codes', () => {
    const validated = validateOfficialManifest({
        complete: true,
        source: { id: 'jp-customs-monthly', name: 'Japan Customs', source_url: 'https://www.customs.go.jp/' },
        expected: { markets: ['JP'], months: ['2026-04'], industry_ids: ['memory'], directions: ['import', 'export'] },
        series: [{ market: 'JP', industry_id: 'memory', month: '2026-04', imports_value_usd: 100, exports_value_usd: 80 }]
    });
    assert.equal(validated.rows[0].hs_code, 'INDUSTRY');
    assert.equal(validated.rows[0].imports_value_usd, 100);
});

test('national official batches publish complete scopes and reject incomplete scopes without overwriting last-good', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-flow-batch-'));
    const acceptedPath = path.join(tempDir, 'accepted.json');
    const rejectedPath = path.join(tempDir, 'rejected.json');
    fs.writeFileSync(acceptedPath, JSON.stringify({
        complete: true,
        source: { id: 'jp-customs-monthly', name: 'Japan Customs', source_url: 'https://www.customs.go.jp/' },
        expected: { markets: ['JP'], months: ['2026-04'], industry_ids: ['memory'], directions: ['import', 'export'] },
        series: [{ market: 'JP', industry_id: 'memory', month: '2026-04', imports_value_usd: 100, exports_value_usd: 80 }]
    }));
    fs.writeFileSync(rejectedPath, JSON.stringify({
        complete: true,
        source: { id: 'kr-customs-monthly', name: 'Korea Customs', source_url: 'https://www.customs.go.kr/' },
        expected: { markets: ['KR'], months: ['2026-04'], industry_ids: ['memory'], directions: ['import', 'export'] },
        series: [{ market: 'KR', industry_id: 'memory', month: '2026-04', imports_value_usd: 100 }]
    }));
    const krLastGood = {
        source_id: 'kr-customs-monthly', market: 'KR', partner: 'WORLD', industry_id: 'memory', hs_code: 'INDUSTRY',
        month: '2026-04', imports_value_usd: 40, exports_value_usd: 30
    };
    const payload = { sources: [], series: [krLastGood] };
    const result = syncOfficialBatches(payload, { manifestPaths: [acceptedPath, rejectedPath] });
    assert.equal(result.ok, false);
    assert.equal(result.batches.find((batch) => batch.source_id === 'jp-customs-monthly').ok, true);
    assert.match(result.batches.find((batch) => !batch.ok).error, /incomplete/i);
    assert.equal(payload.series.some((row) => row.source_id === 'jp-customs-monthly' && row.exports_value_usd === 80), true);
    assert.equal(payload.series.some((row) => row.source_id === 'kr-customs-monthly' && row.exports_value_usd === 30), true);
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('national connector publishes a complete Japan official batch', async () => {
    const payload = { sources: [], series: [] };
    const connector = {
        market: 'JP', id: 'jp-customs-monthly', name: 'Japan Customs',
        official_url: 'https://www.customs.go.jp/', feed_env: 'JP_URL'
    };
    const manifest = {
        complete: true,
        source: { id: 'jp-customs-monthly', name: 'Japan Customs', source_url: 'https://www.customs.go.jp/' },
        expected: { markets: ['JP'], months: ['2026-04'], industry_ids: ['memory'], directions: ['import', 'export'] },
        series: [{ market: 'JP', industry_id: 'memory', month: '2026-04', imports_value_usd: 100, exports_value_usd: 80 }]
    };
    const result = await syncNationalOfficialConnectors(payload, {
        registry: { connectors: [connector] },
        env: { JP_URL: 'https://feed.test/jp.json' },
        fetchImpl: async () => ({ ok: true, json: async () => manifest }),
        referenceDate: new Date('2026-05-15T00:00:00Z')
    });
    assert.equal(result.ok, true);
    assert.equal(result.status.markets.JP.status, 'national_official_current');
    assert.equal(payload.series.some((row) => row.source_id === 'jp-customs-monthly' && row.exports_value_usd === 80), true);
});

test('national connector retains Korea last-good rows when a new batch is incomplete', async () => {
    const lastGood = {
        source_id: 'kr-customs-monthly', market: 'KR', partner: 'WORLD', industry_id: 'memory',
        hs_code: 'INDUSTRY', month: '2026-04', imports_value_usd: 40, exports_value_usd: 30
    };
    const payload = { sources: [{ id: 'kr-customs-monthly', status: 'official_current' }], series: [lastGood] };
    const connector = {
        market: 'KR', id: 'kr-customs-monthly', name: 'Korea Customs',
        official_url: 'https://www.customs.go.kr/', feed_env: 'KR_URL'
    };
    const manifest = {
        complete: true,
        source: { id: 'kr-customs-monthly', name: 'Korea Customs', source_url: 'https://www.customs.go.kr/' },
        expected: { markets: ['KR'], months: ['2026-04'], industry_ids: ['memory'], directions: ['import', 'export'] },
        series: [{ market: 'KR', industry_id: 'memory', month: '2026-04', imports_value_usd: 50 }]
    };
    const result = await syncNationalOfficialConnectors(payload, {
        registry: { connectors: [connector] },
        env: { KR_URL: 'https://feed.test/kr.json' },
        fetchImpl: async () => ({ ok: true, json: async () => manifest }),
        referenceDate: new Date('2026-05-15T00:00:00Z')
    });
    assert.equal(result.ok, false);
    assert.equal(result.status.markets.KR.status, 'last_good_degraded');
    assert.deepEqual(payload.series, [lastGood]);
});

test('national connector reports Singapore historical fallback without a configured feed', async () => {
    const fallback = {
        source_id: 'un-comtrade-monthly', market: 'SG', partner: 'WORLD', industry_id: 'memory',
        hs_code: '854232', month: '2025-12', imports_value_usd: 10, exports_value_usd: 5
    };
    const payload = { sources: [{ id: 'un-comtrade-monthly', status: 'official_current' }], series: [fallback] };
    const connector = {
        market: 'SG', id: 'sg-singstat-monthly', name: 'Singapore SingStat',
        official_url: 'https://www.singstat.gov.sg/', feed_env: 'SG_URL'
    };
    const result = await syncNationalOfficialConnectors(payload, {
        registry: { connectors: [connector] },
        env: {},
        referenceDate: new Date('2026-05-15T00:00:00Z')
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.status.markets.SG.status, 'un_comtrade_fallback');
    assert.equal(result.status.markets.SG.fallback_row_count, 1);
});

test('national connector marks a market delayed when the official release is newer than synchronized data', () => {
    const connector = { market: 'JP', id: 'jp-customs-monthly', name: 'Japan Customs', official_url: 'https://www.customs.go.jp/' };
    const state = nationalConnectorState({
        series: [{
            source_id: 'jp-customs-monthly', market: 'JP', partner: 'WORLD', industry_id: 'memory',
            hs_code: 'INDUSTRY', month: '2026-03', imports_value_usd: 40, exports_value_usd: 30
        }]
    }, connector, {
        referenceDate: new Date('2026-06-15T00:00:00Z'),
        probe: { status: 'official_probe_ok', latest_period: '2026-05', checked_at: '2026-06-15T00:00:00Z' }
    });
    assert.equal(state.status, 'official_delayed');
    assert.equal(state.official_latest_period, '2026-05');
    assert.equal(state.synchronized_through, '2026-03');
    assert.equal(state.active_data_tier, 'national_official');
});

test('Korea connector reports configuration required when the official API key is missing', async () => {
    const connector = {
        market: 'KR', id: 'kr-customs-monthly', name: 'Korea Customs',
        official_url: 'https://www.data.go.kr/en/data/15102108/openapi.do',
        adapter: 'korea-data-go-kr', latest_probe_url: 'https://apis.data.go.kr/1220000/Newtrade/getNewtradeList',
        latest_period_env: 'KR_LATEST', api_key_env: 'KR_DATA_GO_KR_SERVICE_KEY', feed_env: 'KR_FEED'
    };
    const result = await syncNationalOfficialConnectors({ sources: [], series: [] }, {
        registry: { connectors: [connector] }, env: {}, referenceDate: new Date('2026-06-15T00:00:00Z')
    });
    assert.equal(result.ok, true);
    assert.equal(result.status.markets.KR.status, 'configuration_required');
    assert.equal(result.status.markets.KR.probe_status, 'configuration_required');
});

test('Singapore connector reports an official feed pending after a successful official period probe', async () => {
    const connector = {
        market: 'SG', id: 'sg-singstat-monthly', name: 'Singapore SingStat',
        official_url: 'https://tablebuilder.singstat.gov.sg/table/TR/T010001',
        adapter: 'singstat', latest_probe_url: 'https://tablebuilder.singstat.gov.sg/api/table/tabledata/T010001',
        latest_period_env: 'SG_LATEST', feed_env: 'SG_FEED'
    };
    const result = await syncNationalOfficialConnectors({ sources: [], series: [] }, {
        registry: { connectors: [connector] }, env: {},
        fetchImpl: async () => ({ ok: true, json: async () => ({ Data: { row: [{ columns: [{ key: '2026 Apr' }] }] } }) }),
        referenceDate: new Date('2026-06-15T00:00:00Z')
    });
    assert.equal(result.ok, true);
    assert.equal(result.status.markets.SG.status, 'official_feed_pending');
    assert.equal(result.status.markets.SG.official_latest_period, '2026-04');
    assert.equal(result.status.markets.SG.synchronized_through, '');
});
