'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
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
    interactive_electronics: 'gaming',
    '半导体': 'semiconductor_ai',
    '集成电路': 'semiconductor_ai',
    '人工智能硬件': 'semiconductor_ai',
    '存储器': 'memory',
    '内存组件': 'memory',
    '计算机': 'computing',
    '数据处理设备': 'computing',
    '通信设备': 'telecom',
    '互联设备': 'telecom',
    '电池': 'battery_energy',
    '储能': 'battery_energy',
    '光伏': 'solar',
    '太阳能': 'solar',
    '工业自动化': 'industrial_automation',
    '机器人': 'industrial_automation',
    '医疗设备': 'healthcare_lab',
    '实验室设备': 'healthcare_lab',
    '游戏设备': 'gaming',
    '交互式电子产品': 'gaming'
};

function normalizeIndustryId(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const raw = /[\u3400-\u9fff]/.test(normalizedValue)
        ? normalizedValue.replace(/\s+/g, '')
        : normalizedValue.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const industryId = INDUSTRY_ALIASES[raw] || raw;
    if (!VALID_INDUSTRIES.has(industryId)) throw new Error(`Unknown industry_id: ${value || '(empty)'}`);
    return industryId;
}

function normalizeMonth(value, label = 'month') {
    const raw = String(value || '').trim();
    const match = raw.match(/^(20\d{2})\s*(?:[-/.年]\s*)?(0?[1-9]|1[0-2])(?:\s*月)?(?:\s*[-/.]\s*\d{1,2})?$/)
        || raw.match(/^(20\d{2})(0[1-9]|1[0-2])$/);
    if (!match) throw new Error(`Invalid ${label}: ${raw || '(empty)'}`);
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
}

function normalizeValue(value, label, industryId, month) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'number'
        ? value
        : String(value).trim().replace(/[$,，\s]/g, '');
    const number = Number(normalized);
    if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid ${label} for ${industryId} ${month}`);
    return number;
}

function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            values.push(value.trim());
            value = '';
        } else {
            value += character;
        }
    }
    if (quoted) throw new Error('Invalid CSV: unclosed quoted field');
    values.push(value.trim());
    return values;
}

function normalizeHeader(value) {
    return String(value || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[（）()]/g, '')
        .replace(/[^a-z0-9\u3400-\u9fff]+/g, '_')
        .replace(/^_|_$/g, '');
}

const CSV_HEADER_ALIASES = {
    month: ['month', 'period', '统计月份', '统计年月', '数据月份', '年月', '月份'],
    industry: ['industry', 'industry_id', 'category', '行业', '行业类别', '行业分类', '产品类别', '商品类别'],
    imports_value_usd: ['imports_value_usd', 'import_value_usd', '进口金额美元', '进口额美元', '进口美元金额'],
    exports_value_usd: ['exports_value_usd', 'export_value_usd', '出口金额美元', '出口额美元', '出口美元金额'],
    direction: ['direction', 'trade_direction', '进出口类型', '贸易方向', '进出口'],
    trade_value_usd: ['trade_value_usd', 'value_usd', 'amount_usd', '金额美元', '美元金额', '进出口金额美元', '进出口额美元'],
    partner: ['partner', 'trade_partner', '贸易伙伴', '贸易伙伴代码', '伙伴国家地区'],
    scope_label: ['scope_label', 'description', '统计范围', '说明'],
    official_platform_latest_period: ['official_platform_latest_period', 'platform_latest_period', '平台最新月份']
};

function csvHeaderIndex(headers, field) {
    const aliases = CSV_HEADER_ALIASES[field].map(normalizeHeader);
    return headers.findIndex((header) => aliases.includes(header));
}

function normalizeTradeDirection(value) {
    const direction = normalizeHeader(value);
    if (['import', 'imports', '进口'].includes(direction)) return 'imports';
    if (['export', 'exports', '出口'].includes(direction)) return 'exports';
    throw new Error(`Unknown trade direction: ${value || '(empty)'}`);
}

function findHeaderRow(rows, values = {}) {
    const limit = Math.min(rows.length, 30);
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
        const headers = (rows[rowIndex] || []).map(normalizeHeader);
        const indexes = Object.fromEntries(Object.keys(CSV_HEADER_ALIASES).map((field) => [field, csvHeaderIndex(headers, field)]));
        const hasIdentity = (indexes.month >= 0 || values.default_month) && (indexes.industry >= 0 || values.default_industry);
        const hasWideValues = indexes.imports_value_usd >= 0 || indexes.exports_value_usd >= 0;
        const hasLongValues = (indexes.direction >= 0 || values.default_direction) && indexes.trade_value_usd >= 0;
        if (hasIdentity && (hasWideValues || hasLongValues)) return { rowIndex, indexes };
    }
    return null;
}

function combineSeriesRows(rows = []) {
    const combined = new Map();
    rows.forEach((row) => {
        const month = normalizeMonth(row.month);
        const industry = normalizeIndustryId(row.industry_id || row.industry || row.category);
        const partner = String(row.partner || 'WORLD').trim().toUpperCase();
        const key = [month, industry, partner].join('|');
        const existing = combined.get(key) || {
            month,
            industry_id: industry,
            partner,
            imports_value_usd: null,
            exports_value_usd: null
        };
        combined.set(key, {
            ...existing,
            ...row,
            month,
            industry_id: industry,
            partner,
            imports_value_usd: row.imports_value_usd === null || row.imports_value_usd === undefined || row.imports_value_usd === ''
                ? existing.imports_value_usd
                : row.imports_value_usd,
            exports_value_usd: row.exports_value_usd === null || row.exports_value_usd === undefined || row.exports_value_usd === ''
                ? existing.exports_value_usd
                : row.exports_value_usd
        });
    });
    return [...combined.values()];
}

function parseOfficialRows(rows, values = {}) {
    const meaningfulRows = (rows || []).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
    if (meaningfulRows.length < 2) throw new Error('Official export contains no data rows');
    const header = findHeaderRow(meaningfulRows, values);
    if (!header) {
        throw new Error('Official export is missing month/industry metadata or explicit USD trade-value columns. RMB values require verified conversion before import.');
    }
    const { rowIndex, indexes } = header;
    const declaredPeriods = [];
    const grouped = new Map();
    const exactRows = new Set();
    meaningfulRows.slice(rowIndex + 1).forEach((columns, offset) => {
        const read = (field) => indexes[field] < 0 ? undefined : columns[indexes[field]];
        const hasValue = ['imports_value_usd', 'exports_value_usd', 'trade_value_usd'].some((field) => {
            const value = read(field);
            return value !== undefined && value !== null && String(value).trim() !== '';
        });
        if (!hasValue) return;
        const month = normalizeMonth(read('month') || values.default_month, `month at row ${rowIndex + offset + 2}`);
        const industryId = normalizeIndustryId(read('industry') || values.default_industry);
        const partner = String(read('partner') || values.default_partner || 'WORLD').trim().toUpperCase();
        const scopeLabel = read('scope_label') || values.scope_label;
        let imports = read('imports_value_usd');
        let exports = read('exports_value_usd');
        if (indexes.trade_value_usd >= 0) {
            const direction = normalizeTradeDirection(read('direction') || values.default_direction);
            const tradeValue = normalizeValue(read('trade_value_usd'), 'trade_value_usd', industryId, month);
            imports = direction === 'imports' ? tradeValue : null;
            exports = direction === 'exports' ? tradeValue : null;
        } else {
            imports = normalizeValue(imports, 'imports_value_usd', industryId, month);
            exports = normalizeValue(exports, 'exports_value_usd', industryId, month);
        }
        if (imports === null && exports === null) return;
        const signature = JSON.stringify([month, industryId, partner, imports, exports, scopeLabel || '']);
        if (exactRows.has(signature)) return;
        exactRows.add(signature);
        const key = [month, industryId, partner, scopeLabel || ''].join('|');
        const current = grouped.get(key) || {
            month,
            industry_id: industryId,
            partner,
            imports_value_usd: null,
            exports_value_usd: null,
            scope_label: scopeLabel
        };
        if (imports !== null) current.imports_value_usd = (current.imports_value_usd || 0) + imports;
        if (exports !== null) current.exports_value_usd = (current.exports_value_usd || 0) + exports;
        grouped.set(key, current);
        const declaredPeriod = read('official_platform_latest_period');
        if (declaredPeriod) declaredPeriods.push(normalizeMonth(declaredPeriod, 'official_platform_latest_period'));
    });
    const series = [...grouped.values()];
    if (!series.length) throw new Error('Official export contains no usable USD trade-value rows');
    return {
        official_platform_latest_period: values.official_platform_latest_period || declaredPeriods.sort().at(-1) || series.map((row) => row.month).sort().at(-1),
        source_url: values.source_url || DEFAULT_SOURCE_URL,
        series
    };
}

function parseOfficialCsv(text, values = {}) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
    return parseOfficialRows(lines.map(parseCsvLine), values);
}

function parseOfficialWorkbook(buffer, values = {}) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, dense: true });
    const payloads = [];
    const errors = [];
    workbook.SheetNames.forEach((sheetName) => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
        try {
            payloads.push(parseOfficialRows(rows, values));
        } catch (error) {
            if (/missing month\/industry metadata|contains no data rows/.test(error.message)) return;
            errors.push(`${sheetName}: ${error.message}`);
        }
    });
    if (!payloads.length) {
        throw new Error(errors[0] || 'No usable China Customs worksheet was found in the workbook');
    }
    return combineOfficialPayloads(payloads);
}

function inferFileDefaults(filePath) {
    const baseName = path.basename(filePath, path.extname(filePath));
    const normalizedName = baseName.toLowerCase().replace(/[\s-]+/g, '_');
    const monthMatch = baseName.match(/(20\d{2})\s*[-_年]?\s*(0?[1-9]|1[0-2])\s*月?/);
    const industryNames = [
        ...Object.entries(INDUSTRY_ALIASES),
        ...INDUSTRIES.map((industry) => [industry.id, industry.id])
    ];
    const alias = industryNames
        .sort((left, right) => right[0].length - left[0].length)
        .find(([name]) => normalizedName.includes(String(name).toLowerCase().replace(/[\s-]+/g, '_')));
    const direction = /(?:^|[_-])(import|imports)(?:[_-]|$)|进口/i.test(baseName)
        ? 'imports'
        : /(?:^|[_-])(export|exports)(?:[_-]|$)|出口/i.test(baseName) ? 'exports' : undefined;
    return {
        default_month: monthMatch ? `${monthMatch[1]}-${String(Number(monthMatch[2])).padStart(2, '0')}` : undefined,
        default_industry: alias?.[1],
        default_direction: direction
    };
}

function parseOfficialFile(filePath, values = {}) {
    const defaults = { ...inferFileDefaults(filePath), ...values };
    if (/\.xlsx?$/i.test(filePath)) return parseOfficialWorkbook(fs.readFileSync(filePath), defaults);
    return parseOfficialExport(fs.readFileSync(filePath, 'utf8'), defaults);
}

function parseOfficialExport(text, values = {}) {
    const input = String(text || '').trim();
    if (!input) throw new Error('Official export is empty');
    if (input.startsWith('{') || input.startsWith('[')) {
        const payload = JSON.parse(input);
        const overrides = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
        if (Array.isArray(payload)) return { ...overrides, series: payload };
        return { ...payload, ...overrides, series: payload.series };
    }
    return parseOfficialCsv(input, values);
}

function monthRange(start, end) {
    if (!start || !end || start > end) return [];
    const [startYear, startMonth] = normalizeMonth(start).split('-').map(Number);
    const [endYear, endMonth] = normalizeMonth(end).split('-').map(Number);
    const months = [];
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month === 13) {
            month = 1;
            year += 1;
        }
    }
    return months;
}

function nextMonth(value) {
    const [year, month] = normalizeMonth(value).split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function coverageDiagnostics(payload = {}, officialPeriodOverride) {
    const source = sourceMetadata(payload);
    const officialPeriod = officialPeriodOverride || source.official_platform_latest_period || null;
    const sourceRows = (payload.series || []).filter((row) => row.source_id === SOURCE_ID);
    const latestPeriod = sourceRows.map((row) => row.month).filter(Boolean).sort().at(-1) || null;
    const missingPeriods = latestPeriod && officialPeriod && latestPeriod < officialPeriod
        ? monthRange(nextMonth(latestPeriod), officialPeriod)
        : [];
    const targetPeriod = officialPeriod || latestPeriod;
    const targetRows = sourceRows.filter((row) => row.month === targetPeriod);
    const targetRowsByIndustry = new Map(targetRows.map((row) => [row.industry_id, row]));
    const coveredAtTarget = new Set(targetRowsByIndustry.keys());
    const missingIndustries = INDUSTRIES.map((row) => row.id).filter((id) => !coveredAtTarget.has(id));
    const missingDirections = INDUSTRIES.flatMap(({ id }) => {
        const row = targetRowsByIndustry.get(id);
        return [
            !row || row.imports_value_usd === null || row.imports_value_usd === undefined ? `${id}:imports` : null,
            !row || row.exports_value_usd === null || row.exports_value_usd === undefined ? `${id}:exports` : null
        ].filter(Boolean);
    });
    return {
        latest_period_in_data: latestPeriod,
        official_platform_latest_period: officialPeriod,
        missing_periods: missingPeriods,
        target_period: targetPeriod,
        industries_covered_at_target: [...coveredAtTarget].sort(),
        missing_industries_at_target: missingIndustries,
        missing_directions_at_target: missingDirections.sort(),
        complete: Boolean(targetPeriod) && missingPeriods.length === 0 && missingIndustries.length === 0 && missingDirections.length === 0
    };
}

function buildCoveragePlan(payload = {}, officialPeriodOverride) {
    const diagnostics = coverageDiagnostics(payload, officialPeriodOverride);
    const targetRows = new Map(
        (payload.series || [])
            .filter((row) => row.source_id === SOURCE_ID && row.month === diagnostics.target_period)
            .map((row) => [row.industry_id, row])
    );
    const requiredRows = INDUSTRIES.map(({ id, label }) => {
        const row = targetRows.get(id);
        const importsPresent = row?.imports_value_usd !== null && row?.imports_value_usd !== undefined;
        const exportsPresent = row?.exports_value_usd !== null && row?.exports_value_usd !== undefined;
        return {
            month: diagnostics.target_period,
            industry_id: id,
            industry: label,
            imports_required: !importsPresent,
            exports_required: !exportsPresent,
            status: importsPresent && exportsPresent ? 'complete' : 'missing_official_values'
        };
    });
    return {
        schema_version: 1,
        source_id: SOURCE_ID,
        generated_at: new Date().toISOString(),
        target_period: diagnostics.target_period,
        missing_periods: diagnostics.missing_periods,
        required_industry_count: INDUSTRIES.length,
        required_direction_count: INDUSTRIES.length * 2,
        completed_industry_count: requiredRows.filter((row) => row.status === 'complete').length,
        missing_direction_count: diagnostics.missing_directions_at_target.length,
        complete: diagnostics.complete,
        required_rows: requiredRows
    };
}

function combineOfficialPayloads(payloads = []) {
    if (!payloads.length) throw new Error('No China Customs official export files were found');
    const periods = payloads
        .map((payload) => payload.official_platform_latest_period)
        .filter(Boolean)
        .sort();
    return {
        official_platform_latest_period: periods.at(-1),
        source_url: payloads.find((payload) => payload.source_url)?.source_url || DEFAULT_SOURCE_URL,
        series: combineSeriesRows(payloads.flatMap((payload) => Array.isArray(payload.series) ? payload.series : []))
    };
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
    rows.forEach((row) => {
        const key = rowKey(row);
        const previous = existing.get(key);
        existing.set(key, {
            ...previous,
            ...row,
            imports_value_usd: row.imports_value_usd === null ? previous?.imports_value_usd ?? null : row.imports_value_usd,
            exports_value_usd: row.exports_value_usd === null ? previous?.exports_value_usd ?? null : row.exports_value_usd,
            imports_available: row.imports_value_usd === null ? previous?.imports_available ?? false : true,
            exports_available: row.exports_value_usd === null ? previous?.exports_available ?? false : true
        });
    });
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
    const next = {
        ...current,
        updated_at: now.toISOString(),
        sources,
        series: [...existing.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)))
    };
    const diagnostics = coverageDiagnostics(next, officialPeriod);
    next.sources = next.sources.map((source) => source.id === SOURCE_ID
        ? {
            ...source,
            connector_status: diagnostics.complete
                ? 'current'
                : latestPeriod >= officialPeriod ? 'partial_coverage' : 'update_required'
        }
        : source);
    return next;
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
    buildCoveragePlan,
    combineOfficialPayloads,
    coverageDiagnostics,
    mergePayload,
    normalizeIndustryId,
    normalizeMonth,
    normalizeRow,
    parseOfficialFile,
    parseOfficialCsv,
    parseOfficialExport,
    parseOfficialRows,
    parseOfficialWorkbook,
    rowKey,
    sourceMetadata
};
