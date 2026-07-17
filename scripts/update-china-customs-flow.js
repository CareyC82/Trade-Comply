#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    SOURCE_ID,
    atomicWriteJson,
    buildCoveragePlan,
    combineOfficialPayloads,
    coverageDiagnostics,
    mergePayload,
    normalizeIndustryId,
    parseOfficialExport,
    parseOfficialFile,
    parseOfficialWorkbook,
    sourceMetadata
} = require('../lib/china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'china-industry-flow.json');
const STATUS_PATH = path.join(ROOT, 'data', 'china-customs-sync-status.json');
const PLAN_PATH = path.join(ROOT, 'data', 'china-customs-sync-plan.json');
const DEFAULT_INBOX_PATH = path.join(ROOT, 'data', 'inbox', 'china-customs');
const DEFAULT_MANIFEST_NAMES = ['manifest.json', 'china-customs-manifest.json'];
const dryRun = process.argv.includes('--dry-run');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const manifestArg = process.argv.find((arg) => arg.startsWith('--manifest='));

function fileEvidence(filePath) {
    const body = fs.readFileSync(filePath);
    return {
        path: path.relative(ROOT, filePath),
        bytes: body.length,
        sha256: crypto.createHash('sha256').update(body).digest('hex')
    };
}

function parseExportFile(filePath) {
    return parseOfficialFile(filePath, {
        official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || undefined
    });
}

function isManifestFileName(fileName) {
    return DEFAULT_MANIFEST_NAMES.includes(String(fileName || '').toLowerCase());
}

function discoverInboxManifest(directoryPath) {
    const absolutePath = path.resolve(directoryPath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) return null;
    for (const fileName of DEFAULT_MANIFEST_NAMES) {
        const manifestPath = path.join(absolutePath, fileName);
        if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) return manifestPath;
    }
    return null;
}

function loadExportDirectory(directoryPath) {
    const absolutePath = path.resolve(directoryPath);
    if (!fs.existsSync(absolutePath)) return null;
    const files = fs.readdirSync(absolutePath)
        .filter((name) => !name.startsWith('.') && !isManifestFileName(name) && /\.(csv|json|xlsx|xls)$/i.test(name))
        .sort()
        .map((name) => path.join(absolutePath, name));
    if (!files.length) return null;
    return {
        payload: combineOfficialPayloads(files.map(parseExportFile)),
        mode: 'directory',
        location: directoryPath,
        files: files.map((filePath) => path.relative(ROOT, filePath)),
        evidence: files.map(fileEvidence)
    };
}

async function loadInbox(directoryPath) {
    const manifestPath = discoverInboxManifest(directoryPath);
    if (manifestPath) return loadExportManifest(manifestPath);
    return loadExportDirectory(directoryPath);
}

async function fetchOfficialExport(url, timeoutMs = 30000, values = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/json;q=0.9, text/csv;q=0.8, text/plain;q=0.7', 'user-agent': 'TraceWize-China-Customs-Flow/1.2' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} from configured China Customs adapter`);
        const contentType = response.headers.get('content-type') || '';
        const isWorkbook = /spreadsheet|excel/i.test(contentType) || /\.xlsx?(?:$|\?)/i.test(url);
        const body = Buffer.from(await response.arrayBuffer());
        if (isWorkbook) {
            return parseOfficialWorkbook(body, {
                official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || undefined,
                source_url: url,
                ...values
            });
        }
        return parseOfficialExport(body, {
            official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || undefined,
            source_url: url,
            ...values
        });
    } finally {
        clearTimeout(timer);
    }
}

function normalizeManifestDirection(value, label = 'direction') {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (['import', 'imports', '进口'].includes(normalized)) return 'imports';
    if (['export', 'exports', '出口'].includes(normalized)) return 'exports';
    throw new Error(`China Customs manifest ${label} must be imports or exports: ${value}`);
}

function validateManifestCoverage(payload, manifest = {}) {
    if (Array.isArray(manifest)) return;
    const requiredMonths = [...new Set(manifest.required_months || [])].map(String).sort();
    const requiredDirections = [...new Set((manifest.required_directions || [])
        .map((direction, index) => normalizeManifestDirection(direction, `required_directions[${index}]`)))]
        .sort();
    const requiredIndustries = [...new Set((manifest.required_industries || [])
        .map((industry, index) => {
            try {
                return normalizeIndustryId(industry);
            } catch (error) {
                throw new Error(`China Customs manifest required_industries[${index}] is invalid: ${error.message}`);
            }
        }))]
        .sort();
    for (const month of requiredMonths) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            throw new Error(`China Customs manifest required month must use YYYY-MM: ${month}`);
        }
    }
    if (!requiredMonths.length && !requiredDirections.length && !requiredIndustries.length) return;

    const rowsByMonth = new Map();
    for (const row of payload.series || []) {
        if (!rowsByMonth.has(row.month)) rowsByMonth.set(row.month, []);
        rowsByMonth.get(row.month).push(row);
    }
    const targetMonths = requiredMonths.length ? requiredMonths : [...rowsByMonth.keys()].sort();
    const missing = [];
    for (const month of targetMonths) {
        const rows = rowsByMonth.get(month) || [];
        if (!rows.length) {
            missing.push(month);
            continue;
        }
        for (const direction of requiredDirections) {
            const field = direction === 'imports' ? 'imports_value_usd' : 'exports_value_usd';
            if (!rows.some((row) => row[field] !== null && row[field] !== undefined)) {
                missing.push(`${month}:${direction}`);
            }
        }
        for (const industryId of requiredIndustries) {
            const industryRows = rows.filter((row) => row.industry_id === industryId);
            if (!industryRows.length) {
                missing.push(`${month}:${industryId}`);
                continue;
            }
            for (const direction of requiredDirections) {
                const field = direction === 'imports' ? 'imports_value_usd' : 'exports_value_usd';
                if (!industryRows.some((row) => row[field] !== null && row[field] !== undefined)) {
                    missing.push(`${month}:${industryId}:${direction}`);
                }
            }
        }
    }
    if (missing.length) {
        throw new Error(`China Customs manifest batch is incomplete: ${missing.join(', ')}`);
    }
}

async function loadExportManifest(manifestPath) {
    const absoluteManifestPath = path.resolve(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf8'));
    const entries = Array.isArray(manifest) ? manifest : manifest.entries;
    if (!Array.isArray(entries) || !entries.length) throw new Error('China Customs manifest contains no entries');
    const payloads = [];
    const evidence = [];
    const entryKeys = new Set();
    for (const [index, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object') throw new Error(`China Customs manifest entry ${index + 1} must be an object`);
        const direction = normalizeManifestDirection(entry.direction, `entry ${index + 1} direction`);
        const entryKey = JSON.stringify([
            entry.file || null,
            entry.url || null,
            entry.month || null,
            direction || null,
            entry.industry_id || entry.industry || null,
            entry.hs_code || null,
            entry.partner || null
        ]);
        if (entryKeys.has(entryKey)) throw new Error(`China Customs manifest entry ${index + 1} duplicates an earlier entry`);
        entryKeys.add(entryKey);
        const values = {
            default_month: entry.month,
            default_industry: entry.industry_id || entry.industry,
            default_hs_code: entry.hs_code,
            default_direction: direction,
            default_partner: entry.partner,
            official_platform_latest_period: entry.official_platform_latest_period || manifest.official_platform_latest_period,
            source_url: entry.source_url || manifest.source_url
        };
        if (entry.file) {
            const filePath = path.resolve(path.dirname(absoluteManifestPath), entry.file);
            if (!fs.existsSync(filePath)) throw new Error(`China Customs manifest entry ${index + 1} file not found: ${entry.file}`);
            payloads.push(parseOfficialFile(filePath, values));
            evidence.push({
                ...fileEvidence(filePath),
                source_url: values.source_url || null,
                month: entry.month || null,
                direction: direction || null
            });
        } else if (entry.url) {
            payloads.push(await fetchOfficialExport(entry.url, 30000, values));
            evidence.push({ url: entry.url });
        } else {
            throw new Error(`China Customs manifest entry ${index + 1} requires file or url`);
        }
    }
    const payload = combineOfficialPayloads(payloads);
    validateManifestCoverage(payload, manifest);
    return {
        payload,
        mode: 'manifest',
        location: manifestPath,
        files: evidence.filter((row) => row.path).map((row) => row.path),
        evidence
    };
}

async function loadIncoming() {
    const manifestPath = manifestArg?.slice('--manifest='.length) || process.env.CHINA_CUSTOMS_FLOW_MANIFEST;
    if (manifestPath) return loadExportManifest(manifestPath);
    const inputPath = inputArg?.slice('--input='.length) || process.env.CHINA_CUSTOMS_FLOW_FILE;
    if (inputPath) {
        const absolutePath = path.resolve(inputPath);
        if (fs.statSync(absolutePath).isDirectory()) return loadInbox(absolutePath);
        return { payload: parseExportFile(absolutePath), mode: 'file', location: inputPath, files: [inputPath] };
    }
    if (process.env.CHINA_CUSTOMS_FLOW_URL) {
        return { payload: await fetchOfficialExport(process.env.CHINA_CUSTOMS_FLOW_URL), mode: 'url', location: process.env.CHINA_CUSTOMS_FLOW_URL };
    }
    return loadInbox(process.env.CHINA_CUSTOMS_FLOW_DIR || DEFAULT_INBOX_PATH);
}

function writePlan(payload) {
    const source = sourceMetadata(payload);
    const plan = buildCoveragePlan(payload, process.env.CHINA_CUSTOMS_LATEST_PERIOD || source.official_platform_latest_period || null);
    if (!dryRun) atomicWriteJson(PLAN_PATH, plan);
    return plan;
}

function buildStatus(current, values = {}) {
    const source = sourceMetadata(current);
    const diagnostics = coverageDiagnostics(current, process.env.CHINA_CUSTOMS_LATEST_PERIOD || source.official_platform_latest_period || null);
    return {
        schema_version: 1,
        source_id: SOURCE_ID,
        attempted_at: new Date().toISOString(),
        ok: false,
        data_updated: false,
        connector_status: source.connector_status || 'source_action_required',
        source_mode: 'not_configured',
        official_platform_latest_period: process.env.CHINA_CUSTOMS_LATEST_PERIOD || source.official_platform_latest_period || null,
        synchronized_through: source.synchronized_through || source.latest_period || null,
        supported_industries: source.supported_industries || [],
        covered_industries: source.covered_industries || [],
        coverage: diagnostics,
        reason: 'Add normalized official exports to data/inbox/china-customs, or configure CHINA_CUSTOMS_FLOW_URL / CHINA_CUSTOMS_FLOW_FILE. Last-good data was preserved.',
        ...values
    };
}

async function main() {
    const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let status = buildStatus(current);
    try {
        const incoming = await loadIncoming();
        if (!incoming) {
            const plan = writePlan(current);
            status.coverage_plan = {
                path: path.relative(ROOT, PLAN_PATH),
                missing_direction_count: plan.missing_direction_count
            };
            if (!dryRun) atomicWriteJson(STATUS_PATH, status);
            console.log(status.reason);
            return status;
        }
        if (process.env.CHINA_CUSTOMS_LATEST_PERIOD && !incoming.payload.official_platform_latest_period) {
            incoming.payload.official_platform_latest_period = process.env.CHINA_CUSTOMS_LATEST_PERIOD;
        }
        const next = mergePayload(current, incoming.payload);
        const source = sourceMetadata(next);
        const diagnostics = coverageDiagnostics(next, source.official_platform_latest_period);
        const receivedIndustries = [...new Set(incoming.payload.series.map((row) => (
            normalizeIndustryId(row.industry_id || row.industry || row.category)
        )))].sort();
        status = buildStatus(next, {
            ok: true,
            data_updated: true,
            connector_status: diagnostics.complete ? 'current' : 'partial_coverage',
            source_mode: incoming.mode,
            source_location: incoming.location,
            source_files: incoming.files || [],
            source_evidence: incoming.evidence || [],
            official_platform_latest_period: source.official_platform_latest_period,
            synchronized_through: source.synchronized_through,
            rows_received: incoming.payload.series.length,
            industries_received: receivedIndustries,
            supported_industries: source.supported_industries || [],
            covered_industries: source.covered_industries || [],
            coverage: diagnostics,
            last_success_at: new Date().toISOString(),
            reason: diagnostics.complete
                ? 'China Customs industry data is synchronized through the latest declared official platform month with all maintained industries and directions.'
                : `Official rows were imported and last-good history was preserved. Remaining gaps: ${diagnostics.missing_periods.length} month(s), ${diagnostics.missing_industries_at_target.length} industry category/categories, ${diagnostics.missing_directions_at_target.length} trade direction(s).`
        });
        if (!dryRun) {
            atomicWriteJson(DATA_PATH, next);
            const plan = writePlan(next);
            status.coverage_plan = {
                path: path.relative(ROOT, PLAN_PATH),
                missing_direction_count: plan.missing_direction_count
            };
            atomicWriteJson(STATUS_PATH, status);
        }
        console.log(`China Customs flow sync: ${source.synchronized_through} (${status.connector_status}).`);
        return status;
    } catch (error) {
        status = buildStatus(current, {
            source_mode: process.env.CHINA_CUSTOMS_FLOW_URL ? 'url' : 'file',
            connector_status: 'failed_last_attempt',
            error: error.message,
            reason: 'Configured China Customs sync failed validation or transport. Last-good data was preserved.'
        });
        const plan = writePlan(current);
        status.coverage_plan = {
            path: path.relative(ROOT, PLAN_PATH),
            missing_direction_count: plan.missing_direction_count
        };
        if (!dryRun) atomicWriteJson(STATUS_PATH, status);
        console.error(error.stack || error.message);
        process.exitCode = 1;
        return status;
    }
}

if (require.main === module) main();

module.exports = { buildStatus, discoverInboxManifest, fetchOfficialExport, isManifestFileName, loadExportDirectory, loadExportManifest, loadInbox, loadIncoming, main, normalizeManifestDirection, parseExportFile, validateManifestCoverage, writePlan };
