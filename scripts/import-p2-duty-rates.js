#!/usr/bin/env node
/** Guarded official-artifact importer for IN, KR, VN, TW and RU tariff schedules. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const {
    parseIndiaTariffRows,
    parseIndiaOfficialJsonRows,
    parseVietnamTariffRows,
    parseTaiwanTariffRows
} = require('./update-static-duty-rates');
const { parseKoreaTariffRateRows, parseKoreaOfficialJsonRows } = require('./update-kr-duty-rates');
const { mergeEffectiveOverrides } = require('../lib/versioned-duty-overrides');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const STATUS_PATH = path.join(ROOT, 'data', 'p2-duty-rate-import-status.json');

const MARKET_CONFIG = {
    IN: {
        authority: /CBIC|Central Board of Indirect Taxes|ICEGATE/i,
        host: /(^|\.)(icegate\.gov\.in|cbic\.gov\.in)$/i,
        codeLength: 8,
        label: 'India Customs',
        separate: 'SWS, IGST, exemptions, BIS/QCO and WPC remain separate checks.'
    },
    KR: {
        authority: /Korea Customs Service/i,
        host: /(^|\.)(customs\.go\.kr)$/i,
        codeLength: 10,
        label: 'Korea Customs Service',
        separate: 'VAT, FTA preferences and KC/KCC approvals remain separate checks.'
    },
    VN: {
        authority: /Vietnam Customs|General Department of Customs/i,
        host: /(^|\.)(customs\.gov\.vn)$/i,
        codeLength: 8,
        label: 'Vietnam Customs',
        separate: 'VAT, preferential origin, licensing and MIC approvals remain separate checks.'
    },
    TW: {
        authority: /Customs Administration|Ministry of Finance/i,
        host: /(^|\.)(customs\.gov\.tw|nat\.gov\.tw)$/i,
        codeLength: 11,
        label: 'Taiwan Customs Administration',
        separate: 'Business tax, preferences, BSMI inspection and NCC approval remain separate checks.'
    },
    RU: {
        authority: /Eurasian Economic Commission|Federal Customs Service|EAEU/i,
        host: /(^|\.)(eec\.eaeunion\.org|customs\.gov\.ru)$/i,
        codeLength: 10,
        label: 'EAEU / Russia tariff authority',
        separate: 'Import VAT, sanctions, restricted-party controls, preferences and product approvals remain separate checks.'
    }
};

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function digits(value) { return String(value ?? '').replace(/\D/g, ''); }
function header(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function atomicWrite(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
    fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(temp, filePath);
}
function rate(value) {
    const text = String(value ?? '').trim();
    if (/^(free|nil|exempt|무세)$/i.test(text)) return 0;
    const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) return null;
    return text.includes('%') || number > 1 ? number / 100 : number;
}
function pick(row, names) {
    for (const name of names) if (String(row[name] ?? '').trim()) return row[name];
    return '';
}

function normalizeStructuredRows(country, rows) {
    return rows.map((raw) => {
        const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [header(key), value]));
        const code = digits(pick(row, ['hs_code', 'hsn', 'ahtn_code', 'ccc_code', 'tariff_code', 'commodity_code', 'code']));
        const baseText = country === 'IN'
            ? pick(row, ['bcd', 'bcd_rate', 'basic_customs_duty', 'basic_duty'])
            : pick(row, ['mfn_rate', 'import_rate', 'customs_duty', 'base_rate', 'duty_rate', 'rate']);
        return {
            hs_code: code,
            base_rate: rate(baseText),
            source_rate_text: String(baseText || ''),
            description: String(pick(row, ['description', 'goods_description', 'commodity_description', 'item_name']) || ''),
            sws_rate: country === 'IN' ? rate(pick(row, ['sws', 'sws_rate', 'social_welfare_surcharge'])) : null,
            igst_rate: country === 'IN' ? rate(pick(row, ['igst', 'igst_rate', 'integrated_tax'])) : null
        };
    }).filter((row) => row.hs_code || row.source_rate_text);
}

function adaptDelegatedRows(country, rows) {
    return rows.map((row) => ({
        hs_code: digits(row.hs_code),
        base_rate: country === 'IN' ? row.bcd_rate : country === 'KR' ? row.parsed_base_rate : row.base_rate,
        source_rate_text: String(country === 'IN' ? row.bcd_rate_text || '' : country === 'KR' ? row.base_rate_text || '' : row.rate_text || ''),
        description: String(row.item_name || ''),
        sws_rate: country === 'IN' ? row.sws_rate : null,
        igst_rate: country === 'IN' ? row.igst_rate : null
    }));
}

function parseArtifact(country, filePath, buffer = fs.readFileSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        const body = buffer.toString('utf8');
        const rows = country === 'IN' ? parseIndiaOfficialJsonRows(body)
            : country === 'KR' ? parseKoreaOfficialJsonRows(body) : [];
        return adaptDelegatedRows(country, rows);
    }
    if (['.html', '.htm'].includes(ext)) {
        const body = buffer.toString('utf8');
        const rows = country === 'IN' ? parseIndiaTariffRows(body)
            : country === 'KR' ? parseKoreaTariffRateRows(body)
                : country === 'VN' ? parseVietnamTariffRows(body)
                    : country === 'TW' ? parseTaiwanTariffRows(body) : [];
        if (country === 'RU') throw new Error('RU HTML is not accepted; use a complete official structured XLSX/CSV schedule');
        return adaptDelegatedRows(country, rows);
    }
    if (['.xlsx', '.xls', '.csv', '.tsv', '.txt'].includes(ext)) {
        const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
        return workbook.SheetNames.flatMap((name) => normalizeStructuredRows(country,
            XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })));
    }
    throw new Error(`Unsupported ${country} artifact type: ${ext || '(none)'}`);
}

function validate(country, manifest, buffer, parsedRows) {
    const config = MARKET_CONFIG[country];
    const errors = [];
    if (!config) return { errors: [`unsupported market ${country}`], rows: [], sha256: hash(buffer) };
    if (!config.authority.test(String(manifest.authority || ''))) errors.push(`authority must identify ${config.label}`);
    if (manifest.country !== country) errors.push(`manifest.country must be ${country}`);
    if (manifest.coverage_scope !== 'full_tariff') errors.push('coverage_scope must be full_tariff');
    if (manifest.complete !== true) errors.push('manifest.complete must be true');
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(manifest.published_at || ''))) errors.push('published_at is required');
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(manifest.effective_at || ''))) errors.push('effective_at is required');
    try {
        const url = new URL(String(manifest.source_url || ''));
        if (url.protocol !== 'https:' || !config.host.test(url.hostname)) errors.push('source_url must use the configured official HTTPS domain');
    } catch { errors.push('source_url must be a valid official URL'); }
    const sha256 = hash(buffer);
    if (String(manifest.sha256 || '').toLowerCase() !== sha256) errors.push('artifact sha256 does not match manifest');
    if (!Number.isInteger(Number(manifest.expected_rows)) || Number(manifest.expected_rows) !== parsedRows.length) {
        errors.push(`expected_rows must equal parsed row count (${parsedRows.length})`);
    }
    const unique = new Map();
    parsedRows.forEach((row, index) => {
        if (row.hs_code.length !== config.codeLength) errors.push(`row ${index + 1}: exact ${config.codeLength}-digit tariff code required`);
        if (!Number.isFinite(row.base_rate) || row.base_rate < 0 || row.base_rate > 10) errors.push(`row ${index + 1}: explicit base duty required`);
        if (country === 'IN' && (!Number.isFinite(row.sws_rate) || !Number.isFinite(row.igst_rate))) {
            errors.push(`row ${index + 1}: explicit SWS and IGST fields required`);
        }
        const prior = unique.get(row.hs_code);
        const signature = `${row.base_rate}|${row.sws_rate}|${row.igst_rate}`;
        if (prior && prior !== signature) errors.push(`conflicting rates for ${row.hs_code}`);
        else unique.set(row.hs_code, signature);
    });
    if (!parsedRows.length) errors.push('artifact contains no tariff rows');
    const rows = [...new Map(parsedRows.map((row) => [row.hs_code, row])).values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code));
    return { errors, rows, sha256 };
}

function buildOverride(country, row, manifest, checkedAt, sha256) {
    const config = MARKET_CONFIG[country];
    const taxText = country === 'IN' ? ` · SWS ${(row.sws_rate * 100).toFixed(3)}% · IGST ${(row.igst_rate * 100).toFixed(3)}%` : '';
    return {
        hs_code: row.hs_code,
        base_rate: row.base_rate,
        source_status: 'official_source_checked',
        confidence: 'Official exact tariff line',
        source_note: `Imported from a complete ${config.label} artifact. ${config.separate}`,
        source_hts: `${row.hs_code}${row.description ? ` · ${row.description}` : ''}`,
        source_rate_text: `${config.label} base duty ${(row.base_rate * 100).toFixed(3)}%${taxText}`,
        source_url: manifest.source_url,
        last_checked_at: checkedAt,
        effective_from: String(manifest.effective_at).slice(0, 10),
        artifact_sha256: sha256,
        ...(country === 'IN' ? { sws_rate: row.sws_rate, igst_rate: row.igst_rate } : {})
    };
}

function applyRows(country, payload, rows, manifest, checkedAt, sha256) {
    const changed = [];
    for (const rule of payload.rules || []) {
        if (rule.import_country !== country) continue;
        const prefixes = (rule.hs_prefixes || []).map(digits).filter(Boolean);
        const matched = rows.filter((row) => prefixes.some((prefix) => row.hs_code.startsWith(prefix)));
        if (!matched.length) continue;
        rule.exact_code_overrides = mergeEffectiveOverrides(
            rule.exact_code_overrides || [],
            matched.map((row) => buildOverride(country, row, manifest, checkedAt, sha256)),
            manifest.effective_at
        );
        rule.last_checked_at = checkedAt;
        changed.push({ rule: rule.id, exact_row_count: matched.length });
    }
    if (!changed.length) throw new Error(`artifact has no rows matching maintained ${country} product coverage`);
    payload.updated_at = checkedAt.slice(0, 10);
    payload[`last_${country.toLowerCase()}_official_artifact_sync_at`] = checkedAt;
    return changed;
}

function importP2DutyRates({ country, artifactPath, manifestPath, dutyRatesPath = DUTY_RATES_PATH, statusPath = STATUS_PATH, dryRun = false, now = new Date() }) {
    country = String(country || '').toUpperCase();
    const checkedAt = now.toISOString();
    const statusPayload = fs.existsSync(statusPath) ? readJson(statusPath) : { schema_version: 1, markets: {} };
    statusPayload.markets ||= {};
    const prior = statusPayload.markets[country] || {};
    try {
        if (!artifactPath || !manifestPath) throw new Error('--file and --manifest are required');
        const buffer = fs.readFileSync(artifactPath);
        const manifest = readJson(manifestPath);
        const parsed = parseArtifact(country, artifactPath, buffer);
        const gate = validate(country, manifest, buffer, parsed);
        if (gate.errors.length) throw new Error(gate.errors.join('; '));
        const payload = readJson(dutyRatesPath);
        const changedRules = applyRows(country, payload, gate.rows, manifest, checkedAt, gate.sha256);
        const marketStatus = {
            ok: true, checked_at: checkedAt, last_good_at: dryRun ? prior.last_good_at || null : checkedAt,
            dry_run: dryRun, trust_gate: 'passed', changed_rules: changedRules,
            artifact: { file_name: path.basename(artifactPath), sha256: gate.sha256, source_url: manifest.source_url,
                published_at: manifest.published_at, effective_at: manifest.effective_at, parsed_row_count: gate.rows.length }
        };
        if (!dryRun) {
            atomicWrite(dutyRatesPath, payload);
            statusPayload.updated_at = checkedAt;
            statusPayload.markets[country] = marketStatus;
            atomicWrite(statusPath, statusPayload);
        }
        return marketStatus;
    } catch (error) {
        const marketStatus = { ok: false, checked_at: checkedAt, last_good_at: prior.last_good_at || null,
            dry_run: dryRun, trust_gate: 'blocked_last_good_preserved', error: error.message };
        if (!dryRun && MARKET_CONFIG[country]) {
            statusPayload.updated_at = checkedAt;
            statusPayload.markets[country] = marketStatus;
            atomicWrite(statusPath, statusPayload);
        }
        return marketStatus;
    }
}

function arg(name) {
    const direct = process.argv.find((item) => item.startsWith(`${name}=`));
    if (direct) return direct.slice(name.length + 1);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}
if (require.main === module) {
    const result = importP2DutyRates({ country: arg('--country'), artifactPath: arg('--file'), manifestPath: arg('--manifest'), dryRun: process.argv.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

module.exports = { MARKET_CONFIG, parseArtifact, normalizeStructuredRows, validate, applyRows, importP2DutyRates, hash };
