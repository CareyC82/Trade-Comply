'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConsumerService } = require('./consumer-service');

function runRecoveryDrill(options = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-recovery-drill-'));
    const sessionSecret = 'drill-session-secret-isolated-32-bytes';
    const fileKey = 'drill-file-key-isolated-value-32-bytes';
    try {
        const service = new ConsumerService({ root, sessionSecret, fileKey });
        const owner = service.register('recovery-drill@example.invalid', 'recovery-drill-password').user;
        const assessment = service.saveAssessment(owner.id, { productLabel: 'Recovery drill smart watch', market: 'US', platform: 'Amazon' });
        const payload = Buffer.from('%PDF-1.4\nrecovery drill fixture\n%%EOF');
        const file = service.saveFile(owner.id, { name: 'recovery-drill.pdf', type: 'application/pdf', data: payload.toString('base64'), expectedModel: 'DRILL-01' });
        const encryptedBefore = fs.readFileSync(path.join(service.fileRoot, `${file.id}.bin`));
        service.createBackup();
        fs.writeFileSync(service.databaseFile, '{simulated-database-failure', { mode: 0o600 });
        const restored = service.restoreBackup();
        const database = service.read();
        const encryptedAfter = fs.readFileSync(path.join(service.fileRoot, `${file.id}.bin`));
        const checks = {
            userRestored: database.users.some((item) => item.id === owner.id),
            assessmentRestored: database.assessments.some((item) => item.id === assessment.id),
            fileRecordRestored: database.files.some((item) => item.id === file.id),
            encryptedBlobUnchanged: encryptedBefore.equals(encryptedAfter),
            storageConsistent: restored.storage.ok
        };
        return { ok: Object.values(checks).every(Boolean), isolated: true, productionDataTouched: false, checks };
    } finally {
        if (options.keepArtifacts !== true) fs.rmSync(root, { recursive: true, force: true });
    }
}

function runMaintenance(service = new ConsumerService()) {
    const cleanup = service.cleanupExpiredFiles();
    const audit = service.auditStorage();
    const backup = audit.ok ? service.createBackup() : { created: false, reason: 'Storage audit failed; backup was not refreshed.' };
    const health = service.health();
    return {
        ok: audit.ok && health.productionReady && backup.created,
        timestamp: new Date().toISOString(), cleanup, audit, backup,
        health: { productionReady: health.productionReady, disk: health.disk, parsers: health.parsers, warnings: health.warnings }
    };
}

module.exports = { runMaintenance, runRecoveryDrill };
