#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildDiagnosticLines } = require('./print-duty-rate-sync-diagnostics');

const ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
const DUTY_TEST_PATTERN = /(?:duty|tariff|post-entry)/;

function dutyRateTestFiles(root = ROOT) {
    const testDir = path.join(root, 'test');
    return fs.readdirSync(testDir)
        .filter(name => name.endsWith('.test.js') && DUTY_TEST_PATTERN.test(name))
        .sort()
        .map(name => path.join('test', name));
}

function verificationChecks(root = ROOT) {
    return [
        {
            label: 'Maintained duty-rate coverage',
            command: process.execPath,
            args: ['scripts/check-duty-rates.js']
        },
        {
            label: 'Post-Entry tax coverage',
            command: process.execPath,
            args: ['scripts/check-post-entry-tax-coverage.js']
        },
        {
            label: 'ANZ exact tariff health',
            command: process.execPath,
            args: ['scripts/check-exact-tariff-sync-health.js']
        },
        {
            label: 'Duty-rate regression tests',
            command: process.execPath,
            args: ['--test', ...dutyRateTestFiles(root)]
        }
    ];
}

function readStatus(statusPath = STATUS_PATH) {
    try {
        return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function annotationValue(value = '') {
    return String(value)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}

function runVerification({ root = ROOT, runner = spawnSync, output = console } = {}) {
    const failures = [];

    verificationChecks(root).forEach(check => {
        output.log(`\n=== ${check.label} ===`);
        const result = runner(check.command, check.args, {
            cwd: root,
            encoding: 'utf8',
            env: process.env
        });
        if (result.stdout) output.log(result.stdout.trimEnd());
        if (result.stderr) output.error(result.stderr.trimEnd());

        if (result.error || result.status !== 0) {
            const exitCode = Number.isInteger(result.status) ? result.status : 'not started';
            const detail = result.error?.message || `${check.command} ${check.args.join(' ')}`;
            failures.push({ label: check.label, exit_code: exitCode, detail });
            output.error(`::error title=${annotationValue(check.label)}::${annotationValue(`Failed with exit code ${exitCode}. Command: ${detail}`)}`);
        }
    });

    if (failures.length) {
        output.error('\n=== Duty-rate source diagnostics ===');
        buildDiagnosticLines(readStatus(path.join(root, 'data', 'duty-rate-sync-status.json')))
            .forEach(line => output.error(line));
        output.error('\nFailed duty-rate verification checks:');
        failures.forEach((failure, index) => {
            output.error(`${index + 1}. ${failure.label} (exit ${failure.exit_code})`);
        });
    }

    return { ok: failures.length === 0, failures };
}

module.exports = {
    DUTY_TEST_PATTERN,
    annotationValue,
    dutyRateTestFiles,
    verificationChecks,
    runVerification
};

if (require.main === module) {
    const result = runVerification();
    process.exitCode = result.ok ? 0 : 1;
}
