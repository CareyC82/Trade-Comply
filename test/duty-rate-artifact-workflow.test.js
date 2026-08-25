'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { previewArtifact, publishArtifact, rollbackArtifact } = require('../lib/duty-rate-artifact-workflow');

function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-workflow-test-'));
    const dutyRatesPath = path.join(directory, 'duty-rates.json');
    const csv = 'hs_code,import_rate,description\n8517620000,5%,Router\n';
    const sha256 = crypto.createHash('sha256').update(csv).digest('hex');
    fs.writeFileSync(dutyRatesPath, JSON.stringify({ rules: [{ id: 'my-router', import_country: 'MY', hs_prefixes: ['851762'], exact_code_overrides: [] }] }));
    return { directory, dutyRatesPath, statusPath: path.join(directory, 'status.json'), auditPath: path.join(directory, 'audit.json'), versionsDir: path.join(directory, 'versions'), country: 'MY', fileName: 'official.csv', contentBase64: Buffer.from(csv).toString('base64'), manifest: { authority: 'Royal Malaysian Customs', source_url: 'https://www.customs.gov.my/tariff.csv', coverage_scope: 'full_tariff', complete: true, published_at: '2026-08-20', effective_at: '2026-09-01', expected_rows: 1, sha256 } };
}

test('artifact workflow previews without mutation, versions publishes, and supports audited rollback', () => {
    const files = fixture();
    try {
        const before = fs.readFileSync(files.dutyRatesPath, 'utf8');
        const preview = previewArtifact(files);
        assert.equal(preview.ok, true);
        assert.deepEqual(JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')), JSON.parse(before));
        assert.throws(() => publishArtifact({ ...files, previewDigest: 'wrong' }), /Preview changed/);
        const published = publishArtifact({ ...files, previewDigest: preview.preview_digest });
        assert.equal(JSON.parse(fs.readFileSync(files.auditPath)).events.length, 1);
        assert.notEqual(fs.readFileSync(files.dutyRatesPath, 'utf8'), before);
        assert.equal(rollbackArtifact({ versionId: published.version_id, dutyRatesPath: files.dutyRatesPath, versionsDir: files.versionsDir, auditPath: files.auditPath }).ok, true);
        assert.deepEqual(JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')), JSON.parse(before));
        assert.equal(JSON.parse(fs.readFileSync(files.auditPath)).events[0].rollback_available, false);
    } finally { fs.rmSync(files.directory, { recursive: true, force: true }); }
});
