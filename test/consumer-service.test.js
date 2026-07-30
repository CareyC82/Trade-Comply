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
    const parsed = extractFields('Model No: SG-RING-02\nManufacturer: Example Labs\nReport No: REP-42\nStandard IEC 62368-1', 'SG-RING-01');
    assert.equal(parsed.model, 'SG-RING-02');
    assert.equal(parsed.modelMatch, false);
    assert.match(parsed.standards.join(' '), /IEC 62368-1/);
});

test('health makes missing production secrets explicit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({ root });
    assert.equal(app.health().productionReady, false);
    assert.ok(app.health().warnings.length >= 1);
});
