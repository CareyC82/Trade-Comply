#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadLocalEnvFiles } = require('../lib/load-local-env');

loadLocalEnvFiles(path.join(__dirname, '..'));
const { ConsumerService } = require('../lib/consumer-service');

function usage() {
    console.error('Usage: node scripts/manage-consumer-workspace.js <health|audit|repair|cleanup|backup|restore> [--confirm-restore]');
    process.exitCode = 2;
}

function main(argv = process.argv.slice(2)) {
    const [command] = argv;
    if (!command) return usage();
    const service = new ConsumerService();
    let result;
    if (command === 'health') result = service.health();
    else if (command === 'audit') result = service.auditStorage();
    else if (command === 'repair') result = service.auditStorage({ repair: true });
    else if (command === 'cleanup') result = service.cleanupExpiredFiles();
    else if (command === 'backup') result = service.createBackup();
    else if (command === 'restore') {
        if (!argv.includes('--confirm-restore')) throw new Error('Restore replaces the primary database. Re-run with --confirm-restore after verifying the backup.');
        result = service.restoreBackup();
    } else return usage();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.ok === false || (command === 'health' && !result.productionReady)) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

module.exports = { main };
