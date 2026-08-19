#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadLocalEnvFiles } = require('../lib/load-local-env');

loadLocalEnvFiles(path.join(__dirname, '..'));
const { ConsumerService } = require('../lib/consumer-service');
const { runMaintenance, runRecoveryDrill } = require('../lib/consumer-operations');
const { FccEasClient } = require('../lib/fcc-eas-client');
const { productionPreflight } = require('../lib/consumer-runtime');

function usage() {
    console.error('Usage: node scripts/manage-consumer-workspace.js <preflight|health|audit|repair|cleanup|backup|restore|recovery-drill|maintain|fcc-probe> [--confirm-restore]');
    process.exitCode = 2;
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
    const [command] = argv;
    if (!command) return usage();
    let result;
    if (command === 'preflight') result = productionPreflight();
    else if (command === 'recovery-drill') result = runRecoveryDrill();
    else if (command === 'fcc-probe') {
        const client = dependencies.fccClient || new FccEasClient();
        try {
            const lookup = await client.lookup(process.env.FCC_EAS_PROBE_ID || 'OPS10');
            result = { ok: true, available: true, status: lookup.status, checkedAt: lookup.checkedAt, source: lookup.source };
        } catch (error) {
            result = { ok: false, available: false, upstreamStatus: error.upstreamStatus || null, error: error.message, fallback: 'Keep official manual EAS search visible and treat IDs as unverified.' };
        }
    } else {
        const service = dependencies.service || new ConsumerService();
        if (command === 'health') result = service.health();
    else if (command === 'audit') result = service.auditStorage();
    else if (command === 'repair') result = service.auditStorage({ repair: true });
    else if (command === 'cleanup') result = service.cleanupExpiredFiles();
    else if (command === 'backup') result = service.createBackup();
    else if (command === 'maintain') result = runMaintenance(service);
    else if (command === 'restore') {
        if (!argv.includes('--confirm-restore')) throw new Error('Restore replaces the primary database. Re-run with --confirm-restore after verifying the backup.');
        result = service.restoreBackup();
    } else return usage();
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.ok === false || (command === 'health' && !result.productionReady)) process.exitCode = 1;
    return result;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { main };
