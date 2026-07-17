'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    SOURCE_ID,
    atomicWriteJson,
    coverageDiagnostics,
    mergePayload,
    normalizeIndustryId,
    normalizeRow,
    parseOfficialExport
} = require('../lib/china-customs-flow');

function currentPayload() {
    return {
        updated_at: '2026-07-01T00:00:00.000Z',
        sources: [{
            id: SOURCE_ID,
            status: 'official_current',
            covered_industries: ['computing'],
            synchronized_through: '2026-02',
            official_platform_latest_period: '2026-05'
        }],
        series: [{
            market: 'CN',
            partner: 'WORLD',
            industry_id: 'computing',
            month: '2026-02',
            exports_value_usd: 100,
            imports_value_usd: null,
            source_id: SOURCE_ID,
            status: 'official'
        }]
    };
}

test('China Customs industry aliases cover every maintained broad category', () => {
    assert.equal(normalizeIndustryId('integrated circuits'), 'semiconductor_ai');
    assert.equal(normalizeIndustryId('memory components'), 'memory');
    assert.equal(normalizeIndustryId('data processing'), 'computing');
    assert.equal(normalizeIndustryId('connected devices'), 'telecom');
    assert.equal(normalizeIndustryId('energy storage'), 'battery_energy');
    assert.equal(normalizeIndustryId('photovoltaics'), 'solar');
    assert.equal(normalizeIndustryId('robotics'), 'industrial_automation');
    assert.equal(normalizeIndustryId('laboratory equipment'), 'healthcare_lab');
    assert.equal(normalizeIndustryId('interactive electronics'), 'gaming');
});

test('China Customs rows preserve an unpublished trade direction', () => {
    const row = normalizeRow({
        industry: 'semiconductors',
        month: '2026-05',
        imports_value_usd: null,
        exports_value_usd: 250
    });
    assert.equal(row.imports_value_usd, null);
    assert.equal(row.imports_available, false);
    assert.equal(row.exports_value_usd, 250);
    assert.equal(row.exports_available, true);
    assert.throws(() => normalizeRow({ industry: 'memory', month: '2026-05' }), /Both trade directions are missing/);
});

test('China Customs merge updates new months without deleting last-good history', () => {
    const next = mergePayload(currentPayload(), {
        official_platform_latest_period: '2026-05',
        series: [
            { industry: 'integrated circuits', month: '2026-05', imports_value_usd: 300, exports_value_usd: 500 },
            { industry: 'batteries', month: '2026-05', imports_value_usd: 40, exports_value_usd: 60 }
        ]
    }, new Date('2026-07-17T00:00:00.000Z'));
    const source = next.sources.find((row) => row.id === SOURCE_ID);
    assert.equal(next.updated_at, '2026-07-17T00:00:00.000Z');
    assert.equal(next.series.some((row) => row.industry_id === 'computing' && row.month === '2026-02'), true);
    assert.equal(next.series.some((row) => row.industry_id === 'semiconductor_ai' && row.month === '2026-05'), true);
    assert.equal(source.synchronized_through, '2026-05');
    assert.equal(source.connector_status, 'partial_coverage');
    assert.equal(source.supported_industries.length, 9);
    assert.deepEqual(source.covered_industries, ['battery_energy', 'computing', 'semiconductor_ai']);
});

test('China Customs merge rejects a declared platform month older than received data', () => {
    assert.throws(() => mergePayload(currentPayload(), {
        official_platform_latest_period: '2026-04',
        series: [{ industry: 'memory', month: '2026-05', imports_value_usd: 1 }]
    }), /older than synchronized data/);
});

test('China Customs JSON writes replace the target atomically', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-'));
    const file = path.join(directory, 'status.json');
    atomicWriteJson(file, { ok: true, month: '2026-05' });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ok: true, month: '2026-05' });
    assert.equal(fs.readdirSync(directory).some((name) => name.endsWith('.tmp')), false);
});

test('China Customs official CSV accepts normalized and Chinese USD headers', () => {
    const payload = parseOfficialExport([
        '统计月份,行业,进口金额（美元）,出口金额（美元）,平台最新月份',
        '2026-03,半导体,100,200,2026-05',
        '2026-04,energy storage,50,75,2026-05',
        '2026-05,laboratory equipment,,125,2026-05'
    ].join('\n'));
    assert.equal(payload.official_platform_latest_period, '2026-05');
    assert.equal(payload.series.length, 3);
    const next = mergePayload(currentPayload(), payload);
    assert.equal(next.series.some((row) => row.industry_id === 'semiconductor_ai' && row.month === '2026-03'), true);
    assert.equal(next.series.some((row) => row.industry_id === 'healthcare_lab' && row.exports_value_usd === 125), true);
});

test('China Customs CSV refuses ambiguous non-USD value columns', () => {
    assert.throws(() => parseOfficialExport([
        '月份,行业,进口金额,出口金额',
        '2026-05,semiconductor,100,200'
    ].join('\n')), /must provide imports_value_usd or exports_value_usd/);
});

test('China Customs diagnostics expose the real March to May backlog', () => {
    const diagnostics = coverageDiagnostics(currentPayload(), '2026-05');
    assert.deepEqual(diagnostics.missing_periods, ['2026-03', '2026-04', '2026-05']);
    assert.equal(diagnostics.missing_industries_at_target.length, 9);
    assert.equal(diagnostics.missing_directions_at_target.length, 18);
    assert.equal(diagnostics.missing_directions_at_target.includes('memory:imports'), true);
    assert.equal(diagnostics.missing_directions_at_target.includes('memory:exports'), true);
    assert.equal(diagnostics.complete, false);
});

test('China Customs diagnostics only report current when all maintained categories and directions exist', () => {
    const series = [
        ...currentPayload().series,
        ...['semiconductor_ai', 'memory', 'computing', 'telecom', 'battery_energy', 'solar', 'industrial_automation', 'healthcare_lab', 'gaming']
            .map((industry_id) => ({
                market: 'CN', partner: 'WORLD', industry_id, month: '2026-05',
                imports_value_usd: 1, exports_value_usd: 2, source_id: SOURCE_ID, status: 'official'
            }))
    ];
    const diagnostics = coverageDiagnostics({ ...currentPayload(), series }, '2026-05');
    assert.deepEqual(diagnostics.missing_periods, []);
    assert.deepEqual(diagnostics.missing_industries_at_target, []);
    assert.deepEqual(diagnostics.missing_directions_at_target, []);
    assert.equal(diagnostics.complete, true);
});

test('China Customs invalid official export leaves last-good payload unchanged', () => {
    const current = currentPayload();
    const snapshot = JSON.stringify(current);
    assert.throws(() => mergePayload(current, {
        official_platform_latest_period: '2026-05',
        series: [{ industry: 'unknown category', month: '2026-05', imports_value_usd: 1 }]
    }), /Unknown industry_id/);
    assert.equal(JSON.stringify(current), snapshot);
});
