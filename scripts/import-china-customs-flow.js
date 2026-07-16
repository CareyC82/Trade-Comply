#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { INDUSTRIES } = require('../lib/trade-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');
const SOURCE_ID = 'china-customs-major-industries';
const VALID_INDUSTRIES = new Set(INDUSTRIES.map((row) => row.id));

function usage() {
    console.error('Usage: node scripts/import-china-customs-flow.js <normalized-official-export.json>');
    console.error('JSON format: { "official_platform_latest_period": "YYYY-MM", "series": [...] }');
}

function rowKey(row) {
    return [row.market, row.partner, row.industry_id, row.month].join('|');
}

function normalizeRow(row) {
    const month = String(row?.month || '');
    const industryId = String(row?.industry_id || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month || '(empty)'}`);
    if (!VALID_INDUSTRIES.has(industryId)) throw new Error(`Unknown industry_id: ${industryId || '(empty)'}`);
    const normalizeValue = (value, label) => {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid ${label} for ${industryId} ${month}`);
        return number;
    };
    const imports = normalizeValue(row.imports_value_usd, 'imports_value_usd');
    const exports = normalizeValue(row.exports_value_usd, 'exports_value_usd');
    return {
        market: 'CN',
        partner: String(row.partner || 'WORLD').toUpperCase(),
        industry_id: industryId,
        month,
        imports_value_usd: imports,
        exports_value_usd: exports,
        imports_available: imports !== null,
        exports_available: exports !== null,
        aggregation_level: 'industry',
        scope_label: String(row.scope_label || INDUSTRIES.find((item) => item.id === industryId)?.label || industryId),
        source_id: SOURCE_ID,
        source_url: String(row.source_url || 'http://stats.customs.gov.cn/'),
        status: 'official'
    };
}

function importPayload(current, incoming) {
    const rows = Array.isArray(incoming?.series) ? incoming.series.map(normalizeRow) : [];
    if (!rows.length) throw new Error('Official export contains no series rows');
    const existing = new Map((current.series || []).map((row) => [rowKey(row), row]));
    rows.forEach((row) => existing.set(rowKey(row), row));
    const latestPeriod = rows.map((row) => row.month).sort().at(-1);
    const sources = (current.sources || []).map((source) => source.id === SOURCE_ID ? {
        ...source,
        latest_period: latestPeriod,
        synchronized_through: latestPeriod,
        official_platform_latest_period: String(incoming.official_platform_latest_period || latestPeriod),
        connector_status: 'current',
        source_url: 'http://stats.customs.gov.cn/'
    } : source);
    return {
        ...current,
        updated_at: new Date().toISOString(),
        sources,
        series: [...existing.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)))
    };
}

if (require.main === module) {
    const inputPath = process.argv[2];
    if (!inputPath) {
        usage();
        process.exit(1);
    }
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const incoming = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
    const next = importPayload(current, incoming);
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Imported China Customs industry data through ${next.sources.find((row) => row.id === SOURCE_ID)?.synchronized_through}.`);
}

module.exports = { importPayload, normalizeRow };
