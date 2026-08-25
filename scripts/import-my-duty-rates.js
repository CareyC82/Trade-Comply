#!/usr/bin/env node
/**
 * Import a complete Royal Malaysian Customs tariff artifact into maintained MY
 * exact-code overrides. The importer is deliberately local/manual: it never
 * downloads a file and it never replaces last-good rates unless every trust
 * gate passes.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { parseMalaysiaTariffRows } = require('./update-static-duty-rates');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const STATUS_PATH = path.join(ROOT, 'data', 'my-duty-rate-import-status.json');
const OFFICIAL_HOST_RE = /(^|\.)customs\.gov\.my$/i;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeHeader(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function normalizeCode(value) {
    return String(value ?? '').replace(/[^0-9]/g, '');
}

function parseRate(value) {
    const text = String(value ?? '').trim();
    if (!text || /free|nil/i.test(text)) return /free|nil/i.test(text) ? 0 : null;
    const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    if (!Number.isFinite(number) || number < 0) return null;
    return text.includes('%') || number > 1 ? number / 100 : number;
}

function rowValue(row, names) {
    for (const name of names) {
        if (Object.hasOwn(row, name) && String(row[name] ?? '').trim()) return row[name];
    }
    return '';
}

function parseStructuredRows(rows) {
    return rows.map((raw) => {
        const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
        let code = normalizeCode(rowValue(row, ['hs_code', 'ahtn_code', 'tariff_code', 'commodity_code', 'code']));
        if (!code) {
            code = [
                rowValue(row, ['header', 'heading']),
                rowValue(row, ['sub', 'subheading']),
                rowValue(row, ['item', 'tariff_item'])
            ].map(normalizeCode).join('');
        }
        const rateText = rowValue(row, ['import_rate', 'mfn_rate', 'customs_duty', 'duty_rate', 'rate']);
        return {
            hs_code: code,
            base_rate: parseRate(rateText),
            description: String(rowValue(row, ['description', 'goods_description', 'commodity_description']) || '').trim(),
            source_rate_text: String(rateText || '').trim()
        };
    }).filter((row) => row.hs_code || row.source_rate_text);
}

function parseArtifact(filePath, buffer = fs.readFileSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
        return parseMalaysiaTariffRows(buffer.toString('utf8')).map((row) => ({
            ...row,
            source_rate_text: row.source_rate_text || `${Number(row.base_rate) * 100}%`
        }));
    }
    if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
        return workbook.SheetNames.flatMap((name) => parseStructuredRows(
            XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
        ));
    }
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
        const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
        return workbook.SheetNames.flatMap((name) => parseStructuredRows(
            XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
        ));
    }
    throw new Error(`Unsupported MY artifact type: ${ext || '(none)'}`);
}

function validateManifest(manifest, artifactBuffer, rows) {
    const errors = [];
    if (!/royal malaysian customs/i.test(String(manifest.authority || ''))) {
        errors.push('authority must identify Royal Malaysian Customs');
    }
    if (manifest.coverage_scope !== 'full_tariff') {
        errors.push('coverage_scope must be full_tariff');
    }
    let sourceUrl;
    try {
        sourceUrl = new URL(String(manifest.source_url || ''));
        if (sourceUrl.protocol !== 'https:' || !OFFICIAL_HOST_RE.test(sourceUrl.hostname)) {
            errors.push('source_url must be an HTTPS Royal Malaysian Customs domain');
        }
    } catch {
        errors.push('source_url must be a valid official URL');
    }
    if (!manifest.complete) errors.push('manifest.complete must be true');
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(manifest.published_at || ''))) errors.push('published_at is required');
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(manifest.effective_at || ''))) errors.push('effective_at is required');
    const actualHash = sha256(artifactBuffer);
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || '')) || actualHash !== String(manifest.sha256).toLowerCase()) {
        errors.push('artifact sha256 does not match manifest');
    }
    const expectedRows = Number(manifest.expected_rows);
    if (!Number.isInteger(expectedRows) || expectedRows <= 0 || expectedRows !== rows.length) {
        errors.push(`expected_rows must equal parsed row count (${rows.length})`);
    }
    return { errors, actualHash, sourceUrl: sourceUrl?.toString() || '' };
}

function validateRows(rows) {
    const errors = [];
    const byCode = new Map();
    rows.forEach((row, index) => {
        if (!/^\d{10}$/.test(row.hs_code)) errors.push(`row ${index + 1}: exact 10-digit AHTN code required`);
        if (!Number.isFinite(row.base_rate) || row.base_rate < 0 || row.base_rate > 10) errors.push(`row ${index + 1}: explicit valid import rate required`);
        if (!/^\d{10}$/.test(row.hs_code) || !Number.isFinite(row.base_rate)) return;
        if (byCode.has(row.hs_code) && byCode.get(row.hs_code).base_rate !== row.base_rate) {
            errors.push(`conflicting rates for ${row.hs_code}`);
            return;
        }
        byCode.set(row.hs_code, row);
    });
    if (!byCode.size) errors.push('artifact contains no exact 10-digit AHTN rows');
    return { errors, rows: [...byCode.values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code)) };
}

function buildOverride(row, manifest, checkedAt, hash) {
    return {
        hs_code: row.hs_code,
        base_rate: row.base_rate,
        source_status: 'official_source_checked',
        confidence: 'Official exact tariff line',
        source_note: 'Imported from a complete Royal Malaysian Customs artifact. SST, preferential origin, exemptions and SIRIM/MCMC/ST approvals remain separate checks.',
        source_hts: `${row.hs_code}${row.description ? ` · ${row.description}` : ''}`,
        source_rate_text: row.source_rate_text || `${(row.base_rate * 100).toFixed(3)}%`,
        source_url: manifest.source_url,
        last_checked_at: checkedAt,
        effective_from: String(manifest.effective_at).slice(0, 10),
        artifact_sha256: hash
    };
}

function applyRows(payload, rows, manifest, checkedAt, hash) {
    const changedRules = [];
    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'MY') continue;
        const prefixes = (rule.hs_prefixes || []).map(normalizeCode).filter(Boolean);
        const matched = rows.filter((row) => prefixes.some((prefix) => row.hs_code.startsWith(prefix)));
        if (!matched.length) continue;
        rule.exact_code_overrides = matched.map((row) => buildOverride(row, manifest, checkedAt, hash));
        rule.last_checked_at = checkedAt;
        changedRules.push({ rule: rule.id, exact_row_count: matched.length });
    }
    if (!changedRules.length) throw new Error('complete artifact has no rows matching maintained MY product coverage');
    payload.updated_at = checkedAt.slice(0, 10);
    payload.last_my_official_artifact_sync_at = checkedAt;
    payload.last_my_official_artifact_sync = {
        ok: true,
        source_url: manifest.source_url,
        published_at: manifest.published_at,
        effective_at: manifest.effective_at,
        artifact_sha256: hash,
        parsed_row_count: rows.length,
        changed_rules: changedRules
    };
    return changedRules;
}

function importMalaysiaDutyRates({ artifactPath, manifestPath, dutyRatesPath = DUTY_RATES_PATH, statusPath = STATUS_PATH, dryRun = false, now = new Date() }) {
    const checkedAt = now.toISOString();
    const previousStatus = fs.existsSync(statusPath) ? readJson(statusPath) : {};
    try {
        if (!artifactPath || !manifestPath) throw new Error('--file and --manifest are required');
        const artifactBuffer = fs.readFileSync(artifactPath);
        const manifest = readJson(manifestPath);
        const parsedRows = parseArtifact(artifactPath, artifactBuffer);
        const manifestCheck = validateManifest(manifest, artifactBuffer, parsedRows);
        const rowCheck = validateRows(parsedRows);
        const errors = [...manifestCheck.errors, ...rowCheck.errors];
        if (errors.length) throw new Error(errors.join('; '));
        const payload = readJson(dutyRatesPath);
        const changedRules = applyRows(payload, rowCheck.rows, manifest, checkedAt, manifestCheck.actualHash);
        const status = {
            schema_version: 1,
            ok: true,
            checked_at: checkedAt,
            last_good_at: dryRun ? previousStatus.last_good_at || null : checkedAt,
            dry_run: dryRun,
        artifact: {
                file_name: path.basename(artifactPath),
                sha256: manifestCheck.actualHash,
                source_url: manifest.source_url,
                published_at: manifest.published_at,
                effective_at: manifest.effective_at,
                parsed_row_count: rowCheck.rows.length,
                coverage_scope: manifest.coverage_scope
            },
            changed_rules: changedRules,
            trust_gate: 'passed'
        };
        if (!dryRun) {
            atomicWriteJson(dutyRatesPath, payload);
            atomicWriteJson(statusPath, status);
        }
        return status;
    } catch (error) {
        const status = {
            schema_version: 1,
            ok: false,
            checked_at: checkedAt,
            last_good_at: previousStatus.last_good_at || null,
            dry_run: dryRun,
            trust_gate: 'blocked_last_good_preserved',
            error: error.message
        };
        if (!dryRun) atomicWriteJson(statusPath, status);
        return status;
    }
}

function argValue(name) {
    const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
    if (direct) return direct.slice(name.length + 1);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function main() {
    const result = importMalaysiaDutyRates({
        artifactPath: argValue('--file'),
        manifestPath: argValue('--manifest'),
        dryRun: process.argv.includes('--dry-run')
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
    parseArtifact,
    parseStructuredRows,
    validateManifest,
    validateRows,
    applyRows,
    importMalaysiaDutyRates,
    sha256
};
