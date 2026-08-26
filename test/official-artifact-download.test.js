'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildResumableCurlArgs, validateDownloadedArtifact } = require('../lib/official-artifact-download');

test('official tariff downloader uses retry and resume without importing automatically', () => {
    const args = buildResumableCurlArgs('https://customs.example/tariff.pdf', '/tmp/tariff.pdf');
    assert.ok(args.includes('--continue-at'));
    assert.ok(args.includes('--retry-all-errors'));
});

test('official artifact validation rejects truncated PDFs and hashes complete PDFs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'official-artifact-'));
    try {
        const file = path.join(dir, 'tariff.pdf');
        fs.writeFileSync(file, '%PDF-1.7\nbody');
        assert.throws(() => validateDownloadedArtifact(file), /EOF marker missing/);
        fs.writeFileSync(file, '%PDF-1.7\nbody\n%%EOF\n');
        const result = validateDownloadedArtifact(file);
        assert.equal(result.ok, true);
        assert.match(result.sha256, /^[a-f0-9]{64}$/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
