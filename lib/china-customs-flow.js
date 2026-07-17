'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { INDUSTRIES } = require('./trade-flow');

const SOURCE_ID = 'china-customs-major-industries';
const DEFAULT_SOURCE_URL = 'http://stats.customs.gov.cn/';
const VALID_INDUSTRIES = new Set(INDUSTRIES.map((row) => row.id));
const INDUSTRY_ALIASES = {
    semiconductor: 'semiconductor_ai',
    semiconductors: 'semiconductor_ai',
    integrated_circuits: 'semiconductor_ai',
    ai_hardware: 'semiconductor_ai',
    memory_components: 'memory',
    data_processing: 'computing',
    computers: 'computing',
    connected_devices: 'telecom',
    telecommunications: 'telecom',
    batteries: 'battery_energy',
    energy_storage: 'battery_energy',
    photovoltaic: 'solar',
    photovoltaics: 'solar',
    robotics: 'industrial_automation',
    automation: 'industrial_automation',
    laboratory_equipment: 'healthcare_lab',
    medical_devices: 'healthcare_lab',
    interactive_electronics: 'gaming'
};

function normalizeIndustryId(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const industryId = INDUSTRY_ALIASES[raw] || raw;
    if (!VALID_INDUSTRIES.has(industryId)) throw new Error(`Unknown industry_id: ${value || '(empty)'}`);
    return industryId;
}

function normalizeMonth(value, label = 'month') {
    const month = String(value || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid ${label}: ${month || '(empty)'}`);
    return month;
}

function normalizeValue(value, label, industryId, month) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid ${label} for ${industryId} ${month}`);
    return number;
}

function normalizeRow(row) {
    const month = normalizeMonth(row?.month);
    const industryId = normalizeIndustryId(row?.industry_id || row?.industry || row?.category);
    const imports = normalizeValue(row?.imports_value_usd, 'imports_value_usd', industryId, month);
    const exports = normalizeValue(row?.exports_value_usd, 'exports_value_usd', industryId, month);
    if (imports === null && exports === null) throw new Error(`Both trade directions are missing for ${industryId} ${month}`);
    return {
        market: 'CN',
        partner: String(row?.partner || 'WORLD').trim().toUpperCase(),
        industry_id: industryId,
        month,
        imports_value_usd: imports,
        exports_value_usd: exports,
        imports_available: imports !== null,
        exports_available: exports !== null,
        aggregation_level: 'industry',
        scope_label: String(row?.scope_label || INDUSTRIES.find((item) => item.id === industryId)?.label || industryId),
        source_id: SOURCE_ID,
        source_url: String(row?.source_url || DEFAULT_SOURCE_URL),
        status: 'official'
    };
}

function rowKey(row) {
    return [row.market, row.partner, row.industry_id, row.month].join('|');
}

function mergePayload(current, incoming, now = new Date()) {
    const rows = Array.isArray(incoming?.series) ? incoming.series.map(normalizeRow) : [];
    if (!rows.length) throw new Error('Official export contains no series rows');
    const existing = new Map((current.series || []).map((row) => [rowKey(row), row]));
    rows.forEach((row) => existing.set(rowKey(row), row));
    const latestPeriod = rows.map((row) => row.month).sort().at(-1);
    const officialPeriod = normalizeMonth(incoming.official_platform_latest_period || latestPeriod, 'official_platform_latest_period');
    if (officialPeriod < latestPeriod) throw new Error(`Official platform period ${officialPeriod} is older than synchronized data ${latestPeriod}`);
    const coveredIndustries = [...new Set([...rows.map((row) => row.industry_id)])].sort();
    let foundSource = false;
    const sources = (current.sources || []).map((source) => {
        if (source.id !== SOURCE_ID) return source;
        foundSource = true;
        return {
            ...source,
            status: 'official_current',
            supported_industries: INDUSTRIES.map((row) => row.id),
            covered_industries: [...new Set([...(source.covered_industries || []), ...coveredIndustries])].sort(),
            latest_period: latestPeriod,
            synchronized_through: latestPeriod,
            official_platform_latest_period: officialPeriod,
            connector_status: latestPeriod >= officialPeriod ? 'current' : 'update_required',
            source_url: String(incoming.source_url || source.source_url || DEFAULT_SOURCE_URL)
        };
    });
    if (!foundSource) throw new Error(`Missing source metadata: ${SOURCE_ID}`);
    return {
        ...current,
        updated_at: now.toISOString(),
        sources,
        series: [...existing.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)))
    };
}

function atomicWriteJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporaryPath, filePath);
}

function sourceMetadata(payload = {}) {
    return (payload.sources || []).find((source) => source.id === SOURCE_ID) || {};
}

module.exports = {
    DEFAULT_SOURCE_URL,
    INDUSTRY_ALIASES,
    SOURCE_ID,
    atomicWriteJson,
    mergePayload,
    normalizeIndustryId,
    normalizeMonth,
    normalizeRow,
    rowKey,
    sourceMetadata
};
