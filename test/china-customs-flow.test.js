'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    SOURCE_ID,
    atomicWriteJson,
    mergePayload,
    normalizeIndustryId,
    normalizeRow
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
    assert.equal(source.connector_status, 'current');
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
