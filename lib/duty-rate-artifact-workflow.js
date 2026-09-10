'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importMalaysiaDutyRates, REQUIRED_PRIORITY_PREFIXES: MY_PRIORITY_PREFIXES } = require('../scripts/import-my-duty-rates');
const { importP2DutyRates } = require('../scripts/import-p2-duty-rates');
const { parseArtifact: parseMalaysiaArtifact } = require('../scripts/import-my-duty-rates');
const { parseArtifact: parseP2Artifact, MARKET_CONFIG, priorityPrefixesFor } = require('../scripts/import-p2-duty-rates');
const { activeOn } = require('./versioned-duty-overrides');

const SUPPORTED = new Set(['MY', 'IN', 'KR', 'VN', 'TW', 'RU']);
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.txt', '.html', '.htm', '.json', '.pdf']);
const MAX_ARTIFACT_BYTES = 80 * 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = Math.ceil(MAX_ARTIFACT_BYTES * 4 / 3) + (2 * 1024 * 1024);

function readJson(filePath, fallback = null) {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}
function atomicWrite(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
    fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(temp, filePath);
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizeCode(value) { return String(value || '').replace(/\D/g, ''); }
function rateKey(row) { return `${Number(row.base_rate)}|${row.effective_from || ''}|${row.effective_to || ''}`; }

function decodeArtifact({ fileName, contentBase64 }) {
    const safeName = path.basename(String(fileName || ''));
    const extension = path.extname(safeName).toLowerCase();
    if (!safeName || !ALLOWED_EXTENSIONS.has(extension)) throw new Error('Unsupported artifact filename or extension');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(String(contentBase64 || ''))) throw new Error('Artifact must be base64 encoded');
    const buffer = Buffer.from(String(contentBase64 || ''), 'base64');
    if (!buffer.length || buffer.length > MAX_ARTIFACT_BYTES) throw new Error('Artifact must be between 1 byte and 80 MB');
    return { safeName, extension, buffer, sha256: digest(buffer) };
}

function marketOverrides(payload, country) {
    return (payload.rules || []).filter((rule) => rule.import_country === country)
        .flatMap((rule) => (rule.exact_code_overrides || []).map((row) => ({ ...row, rule_id: rule.id })))
        .filter((row) => normalizeCode(row.hs_code));
}

function buildDiff(before, after, country, effectiveAt = new Date().toISOString().slice(0, 10)) {
    const previous = marketOverrides(before, country).filter((row) => activeOn(row, effectiveAt));
    const next = marketOverrides(after, country).filter((row) => activeOn(row, effectiveAt));
    const oldMap = new Map(previous.map((row) => [`${row.rule_id}|${normalizeCode(row.hs_code)}`, row]));
    const newMap = new Map(next.map((row) => [`${row.rule_id}|${normalizeCode(row.hs_code)}`, row]));
    const added = [];
    const removed = [];
    const changed = [];
    for (const [key, row] of newMap) {
        if (!oldMap.has(key)) added.push(row);
        else if (rateKey(oldMap.get(key)) !== rateKey(row)) changed.push({ before: oldMap.get(key), after: row });
    }
    for (const [key, row] of oldMap) if (!newMap.has(key)) removed.push(row);
    const priorOfficial = previous.filter((row) => /official/i.test(`${row.confidence || ''} ${row.source_status || ''}`));
    const removedOfficial = removed.filter((row) => /official/i.test(`${row.confidence || ''} ${row.source_status || ''}`));
    const largeRemoval = priorOfficial.length >= 4 && removedOfficial.length / priorOfficial.length > 0.25;
    const extremeChanges = changed.filter(({ before: oldRow, after: newRow }) => Math.abs(Number(newRow.base_rate) - Number(oldRow.base_rate)) > 0.5);
    return {
        added_count: added.length,
        removed_count: removed.length,
        changed_count: changed.length,
        added: added.slice(0, 100),
        removed: removed.slice(0, 100),
        changed: changed.slice(0, 100),
        anomalies: [
            ...(largeRemoval ? [`More than 25% of prior official exact lines would be removed (${removedOfficial.length}/${priorOfficial.length}).`] : []),
            ...(extremeChanges.length ? [`${extremeChanges.length} base-duty change(s) exceed 50 percentage points.`] : [])
        ]
    };
}

function runImporter({ country, artifactPath, manifestPath, dutyRatesPath, statusPath, dryRun, now }) {
    return country === 'MY'
        ? importMalaysiaDutyRates({ artifactPath, manifestPath, dutyRatesPath, statusPath, dryRun, now })
        : importP2DutyRates({ country, artifactPath, manifestPath, dutyRatesPath, statusPath, dryRun, now });
}

function withTempArtifact(artifact, manifest, callback) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'duty-artifact-preview-'));
    const artifactPath = path.join(directory, artifact.safeName);
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(artifactPath, artifact.buffer);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    try { return callback({ artifactPath, manifestPath }); }
    finally {
        fs.rmSync(artifactPath, { force: true });
        fs.rmSync(manifestPath, { force: true });
        fs.rmdirSync(directory);
    }
}

function inspectArtifact({ country, fileName, contentBase64 }) {
    country = String(country || '').toUpperCase();
    if (!SUPPORTED.has(country)) throw new Error('country must be IN, KR, MY, VN, TW or RU');
    const artifact = decodeArtifact({ fileName, contentBase64 });
    return withTempArtifact(artifact, {}, ({ artifactPath }) => {
        const rows = country === 'MY'
            ? parseMalaysiaArtifact(artifactPath, artifact.buffer)
            : parseP2Artifact(country, artifactPath, artifact.buffer);
        const codeLength = country === 'MY' ? 10 : MARKET_CONFIG[country].codeLength;
        const exactRows = rows.filter((row) => new RegExp(`^\\d{${codeLength}}$`).test(String(row.hs_code || '')) && Number.isFinite(row.base_rate));
        const counts = new Map();
        exactRows.forEach((row) => counts.set(row.hs_code, (counts.get(row.hs_code) || 0) + 1));
        const duplicateCodes = [...counts.entries()].filter(([, count]) => count > 1).map(([code, count]) => ({ code, count }));
        const requiredPrefixes = country === 'MY'
            ? MY_PRIORITY_PREFIXES
            : priorityPrefixesFor(country);
        const priorityCoverage = Object.fromEntries(requiredPrefixes.map((prefix) => [prefix,
            exactRows.some((row) => row.hs_code.startsWith(prefix))]));
        return {
            ok: exactRows.length > 0,
            country,
            file_name: artifact.safeName,
            artifact_sha256: artifact.sha256,
            parsed_row_count: rows.length,
            exact_row_count: exactRows.length,
            invalid_row_count: rows.length - exactRows.length,
            expected_code_length: codeLength,
            duplicate_codes: duplicateCodes.slice(0, 50),
            priority_coverage: priorityCoverage,
            sample_rows: exactRows.slice(0, 8).map((row) => ({
                hs_code: row.hs_code,
                description: row.description || '',
                base_rate: row.base_rate,
                ...(country === 'IN' ? { sws_rate: row.sws_rate, igst_rate: row.igst_rate } : {})
            }))
        };
    });
}

function previewArtifact({ country, fileName, contentBase64, manifest, dutyRatesPath, statusPath, now = new Date() }) {
    country = String(country || '').toUpperCase();
    if (!SUPPORTED.has(country)) throw new Error('country must be IN, KR, MY, VN, TW or RU');
    const artifact = decodeArtifact({ fileName, contentBase64 });
    if (String(manifest?.sha256 || '').toLowerCase() !== artifact.sha256) throw new Error('Uploaded artifact hash does not match manifest');
    const before = readJson(dutyRatesPath, { rules: [] });
    return withTempArtifact(artifact, manifest, ({ artifactPath, manifestPath }) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duty-preview-data-'));
        const tempDuty = path.join(tempDir, 'duty-rates.json');
        const tempStatus = path.join(tempDir, 'status.json');
        atomicWrite(tempDuty, before);
        if (statusPath && fs.existsSync(statusPath)) fs.copyFileSync(statusPath, tempStatus);
        const result = runImporter({ country, artifactPath, manifestPath, dutyRatesPath: tempDuty, statusPath: tempStatus, dryRun: false, now });
        const after = result.ok ? readJson(tempDuty) : before;
        fs.rmSync(tempDir, { recursive: true, force: true });
        const diff = result.ok ? buildDiff(before, after, country, manifest.effective_at) : { added_count: 0, removed_count: 0, changed_count: 0, added: [], removed: [], changed: [], anomalies: [] };
        const preview = {
            ok: result.ok && diff.anomalies.length === 0,
            import_valid: result.ok,
            blocked: !result.ok || diff.anomalies.length > 0,
            country,
            file_name: artifact.safeName,
            artifact_sha256: artifact.sha256,
            manifest,
            importer_result: result,
            diff,
            generated_at: now.toISOString()
        };
        preview.preview_digest = digest(JSON.stringify({
            country,
            sha256: artifact.sha256,
            manifest,
            diff: {
                added_count: diff.added_count,
                removed_count: diff.removed_count,
                changed_count: diff.changed_count,
                anomalies: diff.anomalies
            }
        }));
        return preview;
    });
}

function appendAudit(auditPath, event) {
    const audit = readJson(auditPath, { schema_version: 1, events: [] });
    audit.events ||= [];
    audit.events.push(event);
    audit.updated_at = event.created_at;
    atomicWrite(auditPath, audit);
    return event;
}

function publishArtifact(options) {
    const preview = previewArtifact(options);
    if (!preview.ok) throw new Error(preview.importer_result.error || preview.diff.anomalies.join(' '));
    if (!options.previewDigest || options.previewDigest !== preview.preview_digest) throw new Error('Preview changed or was not confirmed; run preview again');
    const now = options.now || new Date();
    const before = readJson(options.dutyRatesPath);
    const versionId = `${now.toISOString().replace(/[:.]/g, '-')}-${preview.country}-${preview.artifact_sha256.slice(0, 12)}`;
    const versionPath = path.join(options.versionsDir, `${versionId}.json`);
    atomicWrite(versionPath, before);
    const snapshotSha256 = digest(fs.readFileSync(versionPath));
    const artifact = decodeArtifact({ fileName: options.fileName, contentBase64: options.contentBase64 });
    const result = withTempArtifact(artifact, options.manifest, ({ artifactPath, manifestPath }) => runImporter({
        country: preview.country, artifactPath, manifestPath, dutyRatesPath: options.dutyRatesPath,
        statusPath: options.statusPath, dryRun: false, now
    }));
    if (!result.ok) throw new Error(result.error || 'Importer failed after preview');
    appendAudit(options.auditPath, { id: versionId, type: 'publish', country: preview.country, created_at: now.toISOString(),
        artifact_sha256: preview.artifact_sha256, snapshot_sha256: snapshotSha256,
        authority: options.manifest.authority, source_url: options.manifest.source_url,
        published_at: options.manifest.published_at, effective_at: options.manifest.effective_at,
        diff: preview.diff, rollback_available: true });
    return { ok: true, version_id: versionId, preview, importer_result: result };
}

function rollbackArtifact({ versionId, dutyRatesPath, versionsDir, auditPath, now = new Date() }) {
    const audit = readJson(auditPath, { events: [] });
    const sourceEvent = (audit.events || []).find((event) => event.id === versionId && event.type === 'publish');
    if (!sourceEvent) throw new Error('Unknown import version');
    const sourceIndex = (audit.events || []).indexOf(sourceEvent);
    if ((audit.events || []).slice(sourceIndex + 1).some((event) => event.type === 'publish')) {
        throw new Error('A newer tariff version exists; roll back the newest published version first');
    }
    const expectedPath = path.join(versionsDir, `${versionId}.json`);
    if (!fs.existsSync(expectedPath)) throw new Error('Version snapshot is unavailable');
    const snapshotSha256 = digest(fs.readFileSync(expectedPath));
    if (sourceEvent.snapshot_sha256 && sourceEvent.snapshot_sha256 !== snapshotSha256) throw new Error('Version snapshot hash mismatch; rollback blocked');
    const snapshot = readJson(expectedPath);
    atomicWrite(dutyRatesPath, snapshot);
    sourceEvent.rollback_available = false;
    const event = { id: `${versionId}-rollback-${now.toISOString()}`, type: 'rollback', country: sourceEvent.country,
        created_at: now.toISOString(), restored_version_id: versionId, restored_snapshot_sha256: snapshotSha256, rollback_available: false };
    audit.events.push(event);
    audit.updated_at = event.created_at;
    atomicWrite(auditPath, audit);
    return { ok: true, restored_version_id: versionId, event };
}

module.exports = { SUPPORTED, MAX_ARTIFACT_BYTES, MAX_UPLOAD_BODY_BYTES, decodeArtifact, inspectArtifact, buildDiff, previewArtifact, publishArtifact, rollbackArtifact };
