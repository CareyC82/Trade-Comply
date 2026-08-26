'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validateDownloadedArtifact(filePath, { maxBytes = 80 * 1024 * 1024 } = {}) {
    if (!fs.existsSync(filePath)) throw new Error('Downloaded artifact is missing');
    const stat = fs.statSync(filePath);
    if (!stat.size || stat.size > maxBytes) throw new Error('Downloaded artifact size is outside the allowed range');
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.pdf') {
        const buffer = fs.readFileSync(filePath);
        if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Downloaded PDF header is invalid');
        if (!buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'))) throw new Error('Downloaded PDF is incomplete (EOF marker missing)');
    }
    return { ok: true, byte_length: stat.size, sha256: sha256File(filePath) };
}

function buildResumableCurlArgs(url, outputPath, { retries = 4, timeoutSeconds = 300 } = {}) {
    return ['--location', '--fail', '--show-error', '--silent', '--continue-at', '-', '--retry', String(retries),
        '--retry-all-errors', '--connect-timeout', '20', '--max-time', String(timeoutSeconds), '--output', outputPath, url];
}

module.exports = { sha256File, validateDownloadedArtifact, buildResumableCurlArgs };
