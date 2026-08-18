'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConsumerService, MAX_FILES_PER_ACCOUNT, detectType, executableStatus, extractFields } = require('../lib/consumer-service');

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

test('malformed Base64 is rejected before a private file is created', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    assert.throws(() => app.saveFile(owner.id, {
        name: 'fake.pdf', type: 'application/pdf', data: '%%%not-base64%%%'
    }), /valid Base64/);
    assert.equal(app.listFiles(owner.id).length, 0);
});

test('private workspace applies a bounded active-file quota', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    for (let index = 0; index < MAX_FILES_PER_ACCOUNT; index += 1) {
        const pdf = Buffer.from(`%PDF-1.4\nfixture-${index}\n%%EOF`).toString('base64');
        app.saveFile(owner.id, { name: `report-${index}.pdf`, type: 'application/pdf', data: pdf });
    }
    assert.throws(() => app.saveFile(owner.id, {
        name: 'one-too-many.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\none-more\n%%EOF').toString('base64')
    }), /Delete an existing file/);
    assert.equal(app.listFiles(owner.id).length, MAX_FILES_PER_ACCOUNT);
});

test('duplicate private evidence is rejected without creating another encrypted blob', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const pdf = Buffer.from('%PDF-1.4\nsame-file\n%%EOF').toString('base64');
    app.saveFile(owner.id, { name: 'first.pdf', type: 'application/pdf', data: pdf });
    assert.throws(() => app.saveFile(owner.id, { name: 'copy.pdf', type: 'application/pdf', data: pdf }), /already stored/);
    assert.equal(app.listFiles(owner.id).length, 1);
    assert.equal(fs.readdirSync(app.fileRoot).length, 1);
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
    assert.ok(parsed.missingFields.includes('battery model'));
});

test('UN38.3 extraction recognizes its standard and exact battery-model requirement', () => {
    const parsed = extractFields('Model: PB-01\nBattery Model: BAT-01\nManufacturer: Example Power Ltd\nReport No: UN-42\nIssue Date: 2026-08-01\nUN 38.3 test summary', 'PB-01');
    assert.equal(parsed.documentKind, 'UN38.3');
    assert.equal(parsed.modelMatch, true);
    assert.match(parsed.standards.join(' '), /UN\s*38\.3/i);
    assert.deepEqual(parsed.missingFields, []);
});

test('document-type validators require authority-specific evidence fields', () => {
    const fcc = extractFields('Model: SW-1\nManufacturer: Example\nReport No: R-1\nIssue Date: 2026-08-01\nEquipment authorization', 'SW-1');
    assert.equal(fcc.documentKind, 'FCC');
    assert.ok(fcc.missingFields.includes('FCC ID'));
    assert.ok(fcc.missingFields.includes('FCC rule / test standard'));

    const red = extractFields('Model: CAM-1\nManufacturer: Example\nReport No: R-2\nIssue Date: 2026-08-01\nRadio Equipment Directive 2014/53/EU', 'CAM-1');
    assert.equal(red.documentKind, 'CE / RED');
    assert.ok(red.missingFields.includes('ETSI / EN radio standard'));

    const pse = extractFields('Model: PSU-1\nManufacturer: Example\nCertificate No: P-1\nIssue Date: 2026-08-01\nPSE DENAN', 'PSU-1');
    assert.equal(pse.documentKind, 'PSE');
    assert.ok(!pse.missingFields.includes('PSE / DENAN scope reference'));

    const imda = extractFields('Model: AP-1\nManufacturer: Example\nIssue Date: 2026-08-01\nIMDA telecommunication equipment registration', 'AP-1');
    assert.equal(imda.documentKind, 'IMDA');
    assert.ok(imda.missingFields.includes('IMDA registration / certificate number'));
});

test('server parser records a complete exact-model result without treating a supplier claim as proof', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({
        root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long',
        parseDocument: async () => ({
            engine: 'fixture-parser',
            text: 'Model: SW-01\nManufacturer: Example Labs\nReport No: FCC-42\nIssue Date: 2026-08-01\nFCC ID: ABC-SW01\nStandard FCC Part 15'
        })
    });
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const saved = app.saveFile(owner.id, { name: 'fcc.pdf', type: 'application/pdf', data: pdf.toString('base64'), expectedModel: 'SW-01' });
    const parsed = await app.parseFile(owner.id, saved.id);
    assert.equal(parsed.status, 'parsed');
    assert.equal(parsed.parsing.modelMatch, true);
    assert.equal(parsed.parsing.missingFields.length, 0);
});

test('parser failures persist a fail-closed status and actionable remediation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({
        root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long',
        parseDocument: async () => { throw new Error('fixture unreadable'); }
    });
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const saved = app.saveFile(owner.id, { name: 'blurred.pdf', type: 'application/pdf', data: pdf.toString('base64'), expectedModel: 'SW-01' });
    await assert.rejects(() => app.parseFile(owner.id, saved.id), /No file was approved.*searchable PDF/i);
    const failed = app.listFiles(owner.id)[0];
    assert.equal(failed.status, 'parse_failed');
    assert.equal(failed.parsing.errorCode, 'unreadable_document');
    assert.match(failed.parsing.remediation, /clear, upright image/i);
});

test('expired files and account deletion remove private blobs and records', () => {
    let now = Date.parse('2026-08-01T00:00:00Z');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({ root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long', now: () => now });
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    app.saveAssessment(owner.id, { productLabel: 'Smart watch', market: 'US' });
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const first = app.saveFile(owner.id, { name: 'first.pdf', type: 'application/pdf', data: pdf.toString('base64') });
    now += 31 * 86400000;
    app.cleanupExpiredFiles();
    assert.equal(app.listFiles(owner.id).length, 0);
    assert.equal(fs.existsSync(path.join(app.fileRoot, `${first.id}.bin`)), false);
    const second = app.saveFile(owner.id, { name: 'second.pdf', type: 'application/pdf', data: pdf.toString('base64') });
    app.deleteAccount(owner.id);
    assert.equal(app.authenticate(app.createToken(owner)), null);
    assert.equal(app.listAssessments(owner.id).length, 0);
    assert.equal(fs.existsSync(path.join(app.fileRoot, `${second.id}.bin`)), false);
});

test('storage audit repairs orphan blobs, missing blobs and duplicate records', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const first = app.saveFile(owner.id, { name: 'first.pdf', type: 'application/pdf', data: pdf.toString('base64') });
    fs.writeFileSync(path.join(app.fileRoot, '11111111-1111-1111-1111-111111111111.bin'), 'orphan');
    fs.unlinkSync(path.join(app.fileRoot, `${first.id}.bin`));
    const duplicateBlobId = '22222222-2222-2222-2222-222222222222';
    fs.writeFileSync(path.join(app.fileRoot, `${duplicateBlobId}.bin`), 'duplicate');
    const db = app.read();
    db.files.push({ ...first, id: duplicateBlobId });
    app.write(db);

    const before = app.auditStorage();
    assert.equal(before.ok, false);
    assert.equal(before.orphanIds.length, 1);
    assert.equal(before.missingIds.length, 1);
    assert.equal(before.duplicateIds.length, 1);
    const repaired = app.auditStorage({ repair: true });
    assert.equal(repaired.repaired, true);
    assert.equal(app.auditStorage().ok, true);
    assert.equal(app.listFiles(owner.id).length, 0);
});

test('database updates create a schema-valid recovery snapshot', () => {
    const app = service();
    app.register('owner@example.com', 'long-password-owner');
    const backup = app.verifyBackup();
    assert.equal(backup.available, true);
    assert.equal(backup.valid, true);
});

test('a valid last-good snapshot can restore an unreadable primary database', () => {
    const app = service();
    const owner = app.register('owner@example.com', 'long-password-owner').user;
    app.saveAssessment(owner.id, { productLabel: 'Smart watch', market: 'US' });
    fs.writeFileSync(app.databaseFile, '{broken-json');
    const restored = app.restoreBackup();
    assert.equal(restored.restored, true);
    assert.equal(app.read().users.length, 1);
    assert.equal(app.read().users[0].email, 'owner@example.com');
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

test('health reports actual parser executability and treats the AI assistant as optional', () => {
    assert.equal(executableStatus('/definitely/not/a/parser').available, false);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
    const app = new ConsumerService({
        root,
        sessionSecret: 'session-secret-for-tests-32-bytes-long',
        fileKey: 'file-key-for-tests-32-bytes-long',
        parseDocument: async () => ({ text: '', engine: 'fixture-parser' })
    });
    const health = app.health();
    assert.equal(health.parsers.pdf.available, true);
    assert.equal(health.parsers.image.available, true);
    assert.equal(health.productionReady, true);
    assert.equal(health.openaiConfigured, false);
});

test('production refuses temporary session and file encryption keys', () => {
    const previous = process.env.NODE_ENV;
    const previousSessionSecret = process.env.CONSUMER_SESSION_SECRET;
    const previousFileKey = process.env.CONSUMER_FILE_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.CONSUMER_SESSION_SECRET;
    delete process.env.CONSUMER_FILE_ENCRYPTION_KEY;
    try {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-test-'));
        assert.throws(() => new ConsumerService({ root }), /Production requires/);
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
        if (previousSessionSecret === undefined) delete process.env.CONSUMER_SESSION_SECRET;
        else process.env.CONSUMER_SESSION_SECRET = previousSessionSecret;
        if (previousFileKey === undefined) delete process.env.CONSUMER_FILE_ENCRYPTION_KEY;
        else process.env.CONSUMER_FILE_ENCRYPTION_KEY = previousFileKey;
    }
});

test('corrupt consumer database fails closed instead of becoming an empty database', () => {
    const app = service();
    fs.writeFileSync(app.databaseFile, '{not-json');
    assert.throws(() => app.read(), /database is unreadable/i);
    assert.throws(() => app.register('new@example.com', 'long-password-new'), /database is unreadable/i);
});

test('consumer database lock prevents concurrent writers from overwriting data', () => {
    const app = service();
    const first = app.register('first@example.com', 'long-password-one');
    fs.writeFileSync(app.databaseLockFile, 'occupied');
    try {
        assert.throws(
            () => app.saveAssessment(first.user.id, { productLabel: 'Smart watch' }),
            /data is busy/i
        );
        assert.equal(app.listAssessments(first.user.id).length, 0);
    } finally {
        fs.unlinkSync(app.databaseLockFile);
    }
});
