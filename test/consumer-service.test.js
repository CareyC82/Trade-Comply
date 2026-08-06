'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConsumerService, detectType, extractFields } = require('../lib/consumer-service');

function service() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    return new ConsumerService({ root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long' });
}

test('accounts use signed sessions and isolate assessment history', () => {
    const app = service();
    const first = app.register('first@example.com', 'long-password-one');
    const second = app.register('second@example.com', 'long-password-two');
    assert.equal(app.authenticate(first.token).email, 'first@example.com');
    app.saveAssessment(first.user.id, { productLabel: 'Smart ring', market: 'US', platform: 'Amazon', assessment: { verdict: 'conditional' } });
    assert.equal(app.listAssessments(first.user.id).length, 1);
    assert.equal(app.listAssessments(second.user.id).length, 0);
});

test('private evidence is signature checked, encrypted at rest and user scoped', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const other = app.register('other@example.com', 'long-password-other').user;
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const record = app.saveFile(owner.id, { name: 'report.pdf', type: 'application/pdf', data: pdf.toString('base64'), expectedModel: 'TW-01' });
    const stored = fs.readFileSync(path.join(app.fileRoot, `${record.id}.bin`));
    assert.equal(stored.includes(Buffer.from('%PDF-')), false);
    assert.equal(app.listFiles(other.id).length, 0);
    assert.equal(detectType(pdf), 'application/pdf');
});

test('active PDF content is rejected', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const pdf = Buffer.from('%PDF-1.4\n/JavaScript (alert)');
    assert.throws(() => app.saveFile(owner.id, { name: 'active.pdf', type: 'application/pdf', data: pdf.toString('base64') }), /Active or embedded/);
});

test('document extraction reports exact-model mismatches', () => {
    const parsed = extractFields('Model No: SG-RING-02\nManufacturer: Example Labs\nReport No: REP-42\nReport Date: 2026-07-12\nFCC ID: ABC-SGRING02\nBattery Model: BAT-02\nStandard IEC 62368-1', 'SG-RING-01');
    assert.equal(parsed.model, 'SG-RING-02');
    assert.equal(parsed.modelMatch, false);
    assert.match(parsed.standards.join(' '), /IEC 62368-1/);
    assert.equal(parsed.fccId, 'ABC-SGRING02');
    assert.equal(parsed.batteryModel, 'BAT-02');
    assert.equal(parsed.documentKind, 'FCC');
    assert.deepEqual(parsed.missingFields, []);
});

test('document extraction exposes incomplete reports instead of treating parse success as verification', () => {
    const parsed = extractFields('Model: TW-01\nUN38.3 test summary', 'TW-01');
    assert.equal(parsed.modelMatch, true);
    assert.equal(parsed.documentKind, 'UN38.3');
    assert.ok(parsed.missingFields.includes('manufacturer'));
    assert.ok(parsed.missingFields.includes('report/issue date'));
});

test('document extraction captures an explicit expiry date', () => {
    const parsed = extractFields('Model: TW-01\nManufacturer: Example Labs\nReport No: R-9\nIssue Date: 2025-01-01\nValid until: 2027-01-01\nStandard: FCC Part 15', 'TW-01');
    assert.equal(parsed.expiryDate, '2027-01-01');
});

test('health makes missing production secrets explicit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({ root });
    assert.equal(app.health().productionReady, false);
    assert.ok(app.health().warnings.length >= 1);
});
