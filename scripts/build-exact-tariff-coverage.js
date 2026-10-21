#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runDutyRateHealthCheck } = require('./check-duty-rates');
const { buildExactTariffCoverageReport } = require('../lib/exact-tariff-coverage');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'exact-tariff-coverage.json');

function main() {
    const dutyPayload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'duty-rates.json'), 'utf8'));
    const health = runDutyRateHealthCheck();
    const report = buildExactTariffCoverageReport({ dutyPayload, priorityMatrix: health.priority_rate_matrix });
    if (process.argv.includes('--check')) {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.ok ? 0 : 1;
        return report;
    }
    fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: report.ok, output: path.relative(ROOT, OUTPUT), summary: report.summary }, null, 2));
    return report;
}

if (require.main === module) main();

module.exports = { main };
