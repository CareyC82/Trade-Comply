'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { aggregateSeries, buildTradeFlowModel, percentChange, sourceStatus } = require('../lib/trade-flow');

const ROOT = path.join(__dirname, '..');
const readFile = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('aggregateSeries combines HS rows by month without mixing directions', () => {
    const result = aggregateSeries([
        { month: '2026-01', imports_value_usd: 100, exports_value_usd: 20 },
        { month: '2026-01', imports_value_usd: 50, exports_value_usd: 30 }
    ]);
    assert.deepEqual(result, [{
        month: '2026-01', imports: 150, exports: 50, importsAvailable: true, exportsAvailable: true
    }]);
});

test('industry summaries preserve unpublished flows instead of converting them to zero', () => {
    const result = aggregateSeries([{
        month: '2026-02',
        imports_value_usd: null,
        imports_available: false,
        exports_value_usd: 100,
        exports_available: true
    }]);
    assert.deepEqual(result, [{
        month: '2026-02', imports: 0, exports: 100, importsAvailable: false, exportsAvailable: true
    }]);
});

test('China selection prefers current official industry summaries over historical exact HS rows', () => {
    const model = buildTradeFlowModel({
        updated_at: '2026-07-15T00:00:00Z',
        sources: [{ markets: ['CN'], status: 'official_current' }],
        series: [
            { market: 'CN', partner: 'WORLD', industry_id: 'semiconductor_ai', month: '2024-12', imports_value_usd: 10, exports_value_usd: 5, status: 'official' },
            { market: 'CN', partner: 'WORLD', industry_id: 'semiconductor_ai', month: '2026-02', imports_value_usd: null, imports_available: false, exports_value_usd: 20, exports_available: true, aggregation_level: 'industry', scope_label: 'Integrated circuits', status: 'official' }
        ]
    }, { market: 'CN', industry: 'semiconductor_ai' });
    assert.equal(model.latestMonth, '2026-02');
    assert.equal(model.importsAvailable, false);
    assert.equal(model.exports, 20);
    assert.equal(model.aggregationLevel, 'industry');
    assert.equal(model.scopeLabel, 'Integrated circuits');
});

test('buildTradeFlowModel only uses official rows for the selected market and industry', () => {
    const model = buildTradeFlowModel({
        sources: [{ markets: ['US'], status: 'official_current' }],
        series: [
            { market: 'US', partner: 'WORLD', industry_id: 'memory', month: '2026-04', imports_value_usd: 100, exports_value_usd: 20, status: 'official' },
            { market: 'US', partner: 'WORLD', industry_id: 'memory', month: '2026-05', imports_value_usd: 125, exports_value_usd: 30, status: 'official' },
            { market: 'US', partner: 'WORLD', industry_id: 'memory', month: '2026-05', imports_value_usd: 999, exports_value_usd: 999, status: 'estimate' }
        ]
    }, { market: 'US', industry: 'memory', referenceDate: '2026-07-15T00:00:00Z' });
    assert.equal(model.hasData, true);
    assert.equal(model.imports, 125);
    assert.equal(model.exports, 30);
    assert.equal(model.importMoM, 25);
    assert.equal(model.source.label, 'Official data current');
});

test('selection-level freshness does not label old official rows as current', () => {
    const model = buildTradeFlowModel({
        updated_at: '2026-07-15T00:00:00Z',
        sources: [{ markets: ['CN'], status: 'official_current' }],
        series: [
            { market: 'CN', partner: 'WORLD', industry_id: 'semiconductor_ai', month: '2024-12', imports_value_usd: 100, exports_value_usd: 20, status: 'official' }
        ]
    }, { market: 'CN', industry: 'semiconductor_ai' });
    assert.equal(model.source.label, 'Official historical data');
    assert.match(model.source.detail, /2024-12/);
    assert.match(model.source.detail, /19 months/);
});

test('empty official series is not presented as zero trade', () => {
    const model = buildTradeFlowModel({ sources: [{ markets: ['US'], status: 'key_required' }], series: [] }, { market: 'US', industry: 'memory' });
    assert.equal(model.hasData, false);
    assert.equal(model.source.label, 'API key required');
});

test('partner filtering never adds WORLD totals to a selected bilateral partner', () => {
    const model = buildTradeFlowModel({
        sources: [{ markets: ['US'], status: 'official_current' }],
        series: [
            { market: 'US', partner: 'WORLD', industry_id: 'memory', month: '2026-02', imports_value_usd: 1000, exports_value_usd: 500, status: 'official' },
            { market: 'US', partner: 'CN', industry_id: 'memory', month: '2026-02', imports_value_usd: 125, exports_value_usd: 30, status: 'official' }
        ]
    }, { market: 'US', industry: 'memory', partner: 'CN' });
    assert.equal(model.imports, 125);
    assert.equal(model.exports, 30);
});

test('all-partner view prefers official WORLD totals over bilateral row sums', () => {
    const model = buildTradeFlowModel({
        sources: [{ markets: ['US'], status: 'official_current' }],
        series: [
            { market: 'US', partner: 'WORLD', industry_id: 'memory', month: '2026-02', imports_value_usd: 1000, exports_value_usd: 500, status: 'official' },
            { market: 'US', partner: 'CN', industry_id: 'memory', month: '2026-02', imports_value_usd: 125, exports_value_usd: 30, status: 'official' }
        ]
    }, { market: 'US', industry: 'memory' });
    assert.equal(model.imports, 1000);
    assert.equal(model.exports, 500);
});

test('percentChange rejects a zero baseline', () => {
    assert.equal(percentChange(20, 0), null);
});

test('sourceStatus reports missing markets honestly', () => {
    assert.equal(sourceStatus({ sources: [] }, 'RU').tone, 'missing');
});

test('sourceStatus distinguishes an active connector from returned exact-HS data', () => {
    const status = sourceStatus({ sources: [{ markets: ['CN'], status: 'official_current' }] }, 'CN', false);
    assert.equal(status.label, 'Official connector active');
    assert.match(status.detail, /no monthly rows/i);
});

test('trade flow is exposed as a dedicated page and primary workflow link', () => {
    assert.match(readFile('trade-flow.html'), /data-app="trade-flow"/);
    assert.match(readFile('js/main.js'), /TRADE_FLOW_MODULES/);
    assert.match(readFile('index.html'), /href="trade-flow\.html"/);
});
