'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const {
    INDUSTRIES,
    SOURCE_ID,
    atomicWriteJson,
    buildCoveragePlan,
    combineOfficialPayloads,
    coverageDiagnostics,
    mergePayload,
    normalizeIndustryId,
    industryForHsCode,
    normalizeRow,
    parseOfficialCsv,
    parseOfficialExport,
    parseOfficialFile,
    parseOfficialWorkbook
} = require('../lib/china-customs-flow');
const {
    configuredRequiredPeriods,
    discoverInboxManifest,
    emptyPendingBatch,
    loadExportDirectory,
    loadExportManifest,
    loadInbox,
    promotionStatusMetadata
} = require('../scripts/update-china-customs-flow');

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

test('China Customs raw commodity-code exports map into maintained industries', () => {
    const payload = parseOfficialExport([
        '统计年月,商品编码,商品名称,进出口类型,金额（美元）,平台最新月份',
        '2026-05,8542320000,存储器,进口,100,2026-05',
        '2026-05,8471500000,数据处理设备,出口,200,2026-05',
        '2026-05,8507600000,锂离子蓄电池,进口,300,2026-05'
    ].join('\n'));
    assert.equal(industryForHsCode('8542.32'), 'memory');
    assert.equal(payload.series.find((row) => row.industry_id === 'memory').imports_value_usd, 100);
    assert.equal(payload.series.find((row) => row.industry_id === 'computing').exports_value_usd, 200);
    assert.equal(payload.series.find((row) => row.industry_id === 'battery_energy').imports_value_usd, 300);
});

test('China Customs raw exports deduplicate identical HS value rows and retain evidence', () => {
    const payload = parseOfficialCsv([
        '统计月份,进出口类型,商品编码,商品名称,金额（美元）',
        '2026-05,进口,85423210,动态随机存取存储器,100',
        '2026-05,进口,85423210,DRAM memory,100',
        '2026-05,进口,85423290,其他存储器,50'
    ].join('\n'));
    assert.equal(payload.series.length, 1);
    assert.equal(payload.series[0].industry_id, 'memory');
    assert.equal(payload.series[0].imports_value_usd, 150);
    assert.deepEqual(payload.series[0].hs_codes, ['85423210', '85423290']);
    assert.deepEqual(payload.series[0].product_names, ['动态随机存取存储器', '其他存储器']);
});

test('China Customs native Excel accepts title rows and Chinese long-form trade values', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
        ['中华人民共和国海关总署统计数据'],
        ['统计年月', '行业类别', '进出口类型', '金额（美元）', '贸易伙伴', '平台最新月份'],
        ['2026年5月', '半导体', '进口', '1,200.50', '世界', '2026-05'],
        ['2026年5月', '半导体', '出口', 2500, '世界', '2026-05'],
        ['2026/05', '存储器', '出口', 700, '美国', '2026-05']
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, '统计结果');
    const payload = parseOfficialWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    assert.equal(payload.official_platform_latest_period, '2026-05');
    assert.equal(payload.series.length, 2);
    const semiconductor = payload.series.find((row) => row.industry_id === 'semiconductor_ai');
    assert.equal(semiconductor.imports_value_usd, 1200.5);
    assert.equal(semiconductor.exports_value_usd, 2500);
    assert.equal(payload.series.find((row) => row.industry_id === 'memory').partner, '美国');
});

test('China Customs legacy XLS uses filename metadata when month, industry, and direction are absent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-xls-'));
    const file = path.join(directory, '2026-05_memory_import.xls');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['官方导出'],
        ['金额（美元）'],
        [345]
    ]), '进口');
    fs.writeFileSync(file, XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }));
    const payload = parseOfficialFile(file);
    assert.equal(payload.series[0].month, '2026-05');
    assert.equal(payload.series[0].industry_id, 'memory');
    assert.equal(payload.series[0].imports_value_usd, 345);
});

test('China Customs Excel refuses ambiguous RMB-only columns', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['月份', '行业', '进口金额（人民币）'],
        ['2026-05', '半导体', 100]
    ]), '统计');
    assert.throws(
        () => parseOfficialWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })),
        /No usable China Customs worksheet|explicit USD|missing month\/industry metadata/
    );
});

test('China Customs CSV refuses ambiguous non-USD value columns', () => {
    assert.throws(() => parseOfficialExport([
        '月份,行业,进口金额,出口金额',
        '2026-05,semiconductor,100,200'
    ].join('\n')), /explicit USD trade-value columns/);
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

test('China Customs coverage plan lists all nine industries and missing directions', () => {
    const plan = buildCoveragePlan(currentPayload(), '2026-05');
    assert.equal(plan.required_industry_count, 9);
    assert.equal(plan.required_direction_count, 18);
    assert.equal(plan.missing_direction_count, 18);
    assert.equal(plan.required_rows.length, 9);
    assert.equal(plan.required_rows.find((row) => row.industry_id === 'memory').imports_required, true);
    assert.equal(plan.complete, false);
});

test('China Customs strict diagnostics require every month, industry, and direction', () => {
    const diagnostics = coverageDiagnostics(currentPayload(), '2026-05', {
        requiredPeriods: ['2026-03', '2026-04', '2026-05']
    });
    assert.equal(INDUSTRIES.length, 9);
    assert.deepEqual(diagnostics.required_periods, ['2026-03', '2026-04', '2026-05']);
    assert.equal(diagnostics.required_combination_count, 54);
    assert.equal(diagnostics.completed_combination_count, 0);
    assert.equal(diagnostics.missing_combinations.length, 54);
    assert.deepEqual(diagnostics.missing_combinations[0], {
        month: '2026-03',
        industry_id: 'semiconductor_ai',
        direction: 'imports',
        key: '2026-03:semiconductor_ai:imports'
    });
    assert.equal(diagnostics.batch_complete, false);
});

test('China Customs strict coverage plan exposes all 27 monthly industry rows', () => {
    const plan = buildCoveragePlan(currentPayload(), '2026-05', {
        requiredPeriods: ['2026-03', '2026-04', '2026-05']
    });
    assert.equal(plan.required_rows.length, 27);
    assert.equal(plan.required_direction_count, 54);
    assert.equal(plan.completed_direction_count, 0);
    assert.equal(plan.missing_direction_count, 54);
    assert.equal(plan.required_rows.at(-1).month, '2026-05');
    assert.equal(plan.required_rows.at(-1).industry_id, 'gaming');
    assert.equal(plan.complete, false);
});

test('China Customs required periods default to the unsynchronized month range', () => {
    const previous = process.env.CHINA_CUSTOMS_REQUIRED_MONTHS;
    delete process.env.CHINA_CUSTOMS_REQUIRED_MONTHS;
    try {
        assert.deepEqual(configuredRequiredPeriods(currentPayload(), '2026-05'), ['2026-03', '2026-04', '2026-05']);
        process.env.CHINA_CUSTOMS_REQUIRED_MONTHS = '2026-05, 2026-03,2026-05';
        assert.deepEqual(configuredRequiredPeriods(currentPayload(), '2026-05'), ['2026-03', '2026-05']);
    } finally {
        if (previous === undefined) delete process.env.CHINA_CUSTOMS_REQUIRED_MONTHS;
        else process.env.CHINA_CUSTOMS_REQUIRED_MONTHS = previous;
    }
});

test('China Customs pending batch starts inactive and last-good metadata is retained until promotion', () => {
    assert.deepEqual(emptyPendingBatch(), {
        schema_version: 1,
        active: false,
        updated_at: null,
        required_periods: [],
        payload: null,
        source_evidence: []
    });
    const current = currentPayload();
    const candidate = mergePayload(current, {
        official_platform_latest_period: '2026-05',
        series: [{ industry: 'memory', month: '2026-05', imports_value_usd: 3, exports_value_usd: 4 }]
    });
    const staged = promotionStatusMetadata(current, candidate, false);
    assert.equal(staged.synchronized_through, '2026-02');
    assert.equal(staged.staged_synchronized_through, '2026-05');
    assert.deepEqual(staged.covered_industries, ['computing']);
    assert.equal(staged.staged_covered_industries.includes('memory'), true);

    const promoted = promotionStatusMetadata(current, candidate, true);
    assert.equal(promoted.synchronized_through, '2026-05');
    assert.equal(promoted.staged_synchronized_through, null);
    assert.deepEqual(promoted.staged_covered_industries, []);
});

test('China Customs payload combiner retains rows and newest declared platform month', () => {
    const payload = combineOfficialPayloads([
        { official_platform_latest_period: '2026-04', series: [{ month: '2026-04', industry: 'memory', imports_value_usd: 1 }] },
        { official_platform_latest_period: '2026-05', series: [{ month: '2026-05', industry: 'computing', exports_value_usd: 2 }] }
    ]);
    assert.equal(payload.official_platform_latest_period, '2026-05');
    assert.equal(payload.series.length, 2);
});

test('China Customs payload combiner preserves import and export values delivered in separate files', () => {
    const payload = combineOfficialPayloads([
        { official_platform_latest_period: '2026-05', series: [{ month: '2026-05', industry: 'memory', imports_value_usd: 10 }] },
        { official_platform_latest_period: '2026-05', series: [{ month: '2026-05', industry: 'memory', exports_value_usd: 20 }] }
    ]);
    assert.equal(payload.series.length, 1);
    assert.equal(payload.series[0].imports_value_usd, 10);
    assert.equal(payload.series[0].exports_value_usd, 20);
});

test('China Customs inbox loader combines multiple normalized export files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-inbox-'));
    fs.writeFileSync(path.join(directory, 'imports.csv'), [
        'month,industry,imports_value_usd,official_platform_latest_period',
        '2026-05,memory components,10,2026-05'
    ].join('\n'));
    fs.writeFileSync(path.join(directory, 'exports.json'), JSON.stringify({
        official_platform_latest_period: '2026-05',
        series: [{ month: '2026-05', industry: 'computing', exports_value_usd: 20 }]
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['统计月份', '行业', '出口金额（美元）', '平台最新月份'],
        ['2026-05', '光伏', 30, '2026-05']
    ]), '统计');
    fs.writeFileSync(path.join(directory, 'solar.xlsx'), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const incoming = loadExportDirectory(directory);
    assert.equal(incoming.mode, 'directory');
    assert.equal(incoming.files.length, 3);
    assert.equal(incoming.payload.series.length, 3);
});

test('China Customs manifest batches official exports and records file evidence', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-manifest-'));
    fs.writeFileSync(path.join(directory, 'imports.csv'), ['金额（美元）', '125'].join('\n'));
    fs.writeFileSync(path.join(directory, 'exports.csv'), ['金额（美元）', '250'].join('\n'));
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
        official_platform_latest_period: '2026-05',
        entries: [
            { file: 'imports.csv', month: '2026-05', hs_code: '854232', direction: 'imports' },
            { file: 'exports.csv', month: '2026-05', hs_code: '854232', direction: 'exports' }
        ]
    }));
    const incoming = await loadExportManifest(path.join(directory, 'manifest.json'));
    assert.equal(incoming.mode, 'manifest');
    assert.equal(incoming.payload.series.length, 1);
    assert.equal(incoming.payload.series[0].imports_value_usd, 125);
    assert.equal(incoming.payload.series[0].exports_value_usd, 250);
    assert.equal(incoming.evidence.length, 2);
    assert.match(incoming.evidence[0].sha256, /^[a-f0-9]{64}$/);
});

test('China Customs inbox automatically discovers its manifest and excludes it from directory parsing', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-auto-manifest-'));
    fs.writeFileSync(path.join(directory, 'imports.csv'), [
        '统计月份,行业,进口金额（美元）',
        '2026-05,memory,125'
    ].join('\n'));
    fs.writeFileSync(path.join(directory, 'exports.csv'), [
        '统计月份,行业,出口金额（美元）',
        '2026-05,memory,250'
    ].join('\n'));
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
        official_platform_latest_period: '2026-05',
        source_url: 'http://stats.customs.gov.cn/',
        required_months: ['2026-05'],
        required_directions: ['imports', 'exports'],
        required_industries: ['memory'],
        entries: [
            { file: 'imports.csv', month: '2026-05', industry: 'memory', direction: 'imports' },
            { file: 'exports.csv', month: '2026-05', industry: 'memory', direction: 'exports' }
        ]
    }));

    assert.equal(discoverInboxManifest(directory), manifestPath);
    const incoming = await loadInbox(directory);
    assert.equal(incoming.mode, 'manifest');
    assert.equal(incoming.payload.series.length, 1);
    assert.equal(incoming.payload.series[0].month, '2026-05');
    assert.equal(incoming.payload.series[0].industry_id, 'memory');
    assert.equal(incoming.payload.series[0].imports_value_usd, 125);
    assert.equal(incoming.payload.series[0].exports_value_usd, 250);
    assert.equal(incoming.evidence[0].source_url, 'http://stats.customs.gov.cn/');

    const directoryOnly = loadExportDirectory(directory);
    assert.equal(directoryOnly.files.length, 2);
    assert.ok(directoryOnly.files.every((file) => !file.endsWith('manifest.json')));
});

test('China Customs manifest enforces required months and trade directions', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-manifest-contract-'));
    fs.writeFileSync(path.join(directory, 'imports.csv'), ['金额（美元）', '125'].join('\n'));
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
        required_months: ['2026-04', '2026-05'],
        required_directions: ['imports', 'exports'],
        entries: [{ file: 'imports.csv', month: '2026-05', hs_code: '854232', direction: 'imports' }]
    }));
    await assert.rejects(
        loadExportManifest(path.join(directory, 'manifest.json')),
        /batch is incomplete: 2026-04, 2026-05:exports/
    );
});

test('China Customs manifest enforces required industry coverage', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-industry-contract-'));
    fs.writeFileSync(path.join(directory, 'memory.csv'), ['金额（美元）', '125'].join('\n'));
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
        required_months: ['2026-05'],
        required_directions: ['imports'],
        required_industries: ['memory', 'computing'],
        entries: [{ file: 'memory.csv', month: '2026-05', industry: 'memory', direction: 'imports' }]
    }));
    await assert.rejects(
        loadExportManifest(path.join(directory, 'manifest.json')),
        /batch is incomplete: 2026-05:computing/
    );
});

test('China Customs manifest rejects invalid directions and duplicate entries', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-customs-manifest-invalid-'));
    fs.writeFileSync(path.join(directory, 'value.csv'), ['金额（美元）', '125'].join('\n'));
    fs.writeFileSync(path.join(directory, 'invalid.json'), JSON.stringify({
        entries: [{ file: 'value.csv', month: '2026-05', hs_code: '854232', direction: 'inbound' }]
    }));
    await assert.rejects(loadExportManifest(path.join(directory, 'invalid.json')), /must be imports or exports/);

    const duplicate = { file: 'value.csv', month: '2026-05', hs_code: '854232', direction: 'imports' };
    fs.writeFileSync(path.join(directory, 'duplicate.json'), JSON.stringify({ entries: [duplicate, duplicate] }));
    await assert.rejects(loadExportManifest(path.join(directory, 'duplicate.json')), /duplicates an earlier entry/);
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
