'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConsumerService } = require('../lib/consumer-service');
const { runMaintenance, runRecoveryDrill } = require('../lib/consumer-operations');

test('recovery drill restores isolated records and encrypted evidence without touching production data', () => {
    const result = runRecoveryDrill();
    assert.equal(result.ok, true);
    assert.equal(result.isolated, true);
    assert.equal(result.productionDataTouched, false);
    assert.equal(Object.values(result.checks).every(Boolean), true);
});

test('maintenance performs cleanup, audit, backup and readiness as one observable task', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-maintenance-test-'));
    const service = new ConsumerService({
        root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long',
        parseDocument: async () => ({ text: '', engine: 'fixture-parser' })
    });
    const result = runMaintenance(service);
    assert.equal(result.ok, true);
    assert.equal(result.audit.ok, true);
    assert.equal(result.backup.created, true);
    assert.equal(result.health.productionReady, true);
});
