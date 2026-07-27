#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getFeedbackStorageStatus } = require('../feedback-store');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'reports', 'unmet-search-production-readiness.json');

function buildReadiness({ env = process.env, now = new Date() } = {}) {
    const previous = {
        OSS_BUCKET: process.env.OSS_BUCKET,
        OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID,
        OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET,
        ALIBABA_CLOUD_ACCESS_KEY_ID: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
    };
    Object.keys(previous).forEach((key) => {
        if (env[key] === undefined) delete process.env[key];
        else process.env[key] = env[key];
    });
    const storage = getFeedbackStorageStatus();
    Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
    return {
        schema_version: '1.0',
        checked_at: now.toISOString(),
        ok: storage.configured,
        storage: storage.storage,
        missing: storage.missing,
        required_flow: [
            'search_gap event capture',
            'OSS persistence',
            'seven-day summary',
            'prioritized Top 10 backlog',
            'manual rule-ready review'
        ],
        next_action: storage.configured
            ? 'Run the seven-day summary and verify at least one real search-gap event before publishing Top 10.'
            : `Configure GitHub/FC secrets: ${storage.missing.join(', ')}.`
    };
}

function main() {
    const outputArg = process.argv.find(arg => arg.startsWith('--output='));
    const output = outputArg ? path.resolve(outputArg.slice('--output='.length)) : DEFAULT_OUTPUT;
    const payload = buildReadiness();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
    process.exitCode = payload.ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = { buildReadiness };
