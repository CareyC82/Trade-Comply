#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PATH = path.join(ROOT, 'data', 'regulatory-accuracy-status.json');

function snapshotFreshness(timestamp, now = new Date(), maxAgeDays = 2) {
    const parsed = Date.parse(timestamp || '');
    const ageDays = Number.isFinite(parsed) ? Math.max(0, (now.getTime() - parsed) / 86400000) : null;
    return { timestamp: timestamp || null, age_days: ageDays === null ? null : Number(ageDays.toFixed(2)), current: ageDays !== null && ageDays <= maxAgeDays };
}

function evaluateRegulatoryAccuracyHealth(payload = {}, options = {}) {
    const now = options.now || new Date();
    const maxAgeDays = options.maxAgeDays || 2;
    const source = payload.source_control || {};
    const checks = [
        ['Global official-source transport health', source.global_transport_health?.freshness?.timestamp],
        ['Automation launch status', source.automation_launch_freshness?.timestamp]
    ].map(([label, timestamp]) => ({ label, ...snapshotFreshness(timestamp, now, maxAgeDays) }));
    return { ok: checks.every((check) => check.current), max_age_days: maxAgeDays, checks };
}

function run(filePath = DEFAULT_PATH) {
    let payload;
    try { payload = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) {
        console.error(`::error title=Regulatory accuracy status unavailable::${error.message}`);
        return false;
    }
    const result = evaluateRegulatoryAccuracyHealth(payload);
    for (const check of result.checks) {
        const age = check.age_days === null ? 'unknown' : `${check.age_days} day(s)`;
        if (!check.current) console.error(`::error title=Regulatory health snapshot stale::${check.label} is ${age} old; maximum is ${result.max_age_days} days. Last-good data remains protected.`);
        else console.log(`${check.label}: current (${age} old)`);
    }
    return result.ok;
}

if (require.main === module && !run(process.argv[2] || DEFAULT_PATH)) process.exitCode = 1;

module.exports = { evaluateRegulatoryAccuracyHealth, snapshotFreshness, run };
