'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, productionPreflight, validateConsumerEnvironment } = require('../lib/consumer-runtime');

test('production configuration requires persistent storage and independent secrets', () => {
    assert.throws(() => validateConsumerEnvironment({ NODE_ENV: 'production', CONSUMER_DATA_DIR: 'relative' }), /SESSION_SECRET.*FILE_ENCRYPTION_KEY.*absolute persistent/s);
    const config = validateConsumerEnvironment({ NODE_ENV: 'production', CONSUMER_DATA_DIR: '/data/consumer', CONSUMER_PORT: '8790', CONSUMER_SESSION_SECRET: 's'.repeat(32), CONSUMER_FILE_ENCRYPTION_KEY: 'f'.repeat(32) });
    assert.equal(config.host, '0.0.0.0');
});

test('production preflight requires HTTPS and verifies persistent storage without exposing secrets', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-preflight-test-'));
    const base = { NODE_ENV: 'production', CONSUMER_DATA_DIR: dataDir, CONSUMER_PORT: '8790', CONSUMER_SESSION_SECRET: 's'.repeat(32), CONSUMER_FILE_ENCRYPTION_KEY: 'f'.repeat(32), PDFTOTEXT_BIN: process.execPath, TESSERACT_BIN: process.execPath };
    assert.equal(productionPreflight(base).ok, false);
    const passed = productionPreflight({ ...base, CONSUMER_PUBLIC_URL: 'https://consumer.example.com' });
    assert.equal(passed.ok, true);
    assert.equal(JSON.stringify(passed).includes('s'.repeat(32)), false);
});

test('structured logger drops sensitive fields', () => {
    const stream = new PassThrough(); let output = '';
    stream.on('data', (chunk) => { output += chunk; });
    createLogger(stream)('info', 'test_event', { path: '/health', email: 'private@example.com', token: 'secret' });
    const row = JSON.parse(output);
    assert.equal(row.path, '/health');
    assert.equal(row.email, undefined);
    assert.equal(row.token, undefined);
});
