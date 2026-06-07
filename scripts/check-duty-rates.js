#!/usr/bin/env node
/**
 * Local health check for Post-Entry duty-rate coverage.
 *
 * This script does not fetch the internet. It verifies that the maintainable
 * duty-rate table covers the high-frequency Post-Entry sample set and prints a
 * compact coverage summary for the admin/operator workflow.
 */
const fs = require('fs');
const path = require('path');

const {
    calculatePostEntryValue,
    calculateDutyImpact
} = require('../lib/post-entry-value');
const {
    summarizeDutyRateCoverage
} = require('./update-us-duty-rates');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const SAMPLES_PATH = path.join(ROOT, 'data', 'post-entry-samples.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runSample(sample) {
    const value = calculatePostEntryValue({
        incoterm: sample.incoterm,
        declaredAmount: sample.declared_amount,
        freight: sample.freight,
        insurance: sample.insurance,
        otherCharges: sample.other_charges
    });
    const duty = calculateDutyImpact(value, {
        importCountryCode: sample.import_country,
        originCountryCode: sample.origin_country,
        hsCode: sample.hs_code,
        entryDate: sample.entry_date || '06 / 07 / 26'
    }, {
        declaredDuty: sample.declared_duty
    });
    const sourceStatuses = Array.from(new Set((duty.sourceBreakdown || []).map(item => item.status)));
    const failures = [];

    if (Boolean(duty.covered) !== Boolean(sample.expect_covered)) {
        failures.push(`coverage expected ${sample.expect_covered} but got ${duty.covered}`);
    }
    if (duty.covered && typeof sample.expect_min_total_rate === 'number' && duty.totalRate < sample.expect_min_total_rate) {
        failures.push(`total rate ${duty.totalRate} is below expected minimum ${sample.expect_min_total_rate}`);
    }
    (sample.expect_source_statuses || []).forEach((status) => {
        if (!sourceStatuses.includes(status)) {
            failures.push(`missing source status ${status}`);
        }
    });

    return {
        id: sample.id,
        product: sample.product,
        route: `${sample.origin_country}->${sample.import_country}`,
        hs_code: sample.hs_code,
        covered: duty.covered,
        total_rate: duty.totalRate,
        source_statuses: sourceStatuses,
        failures
    };
}

function runDutyRateHealthCheck() {
    const dutyPayload = readJson(DUTY_RATES_PATH);
    const samplesPayload = readJson(SAMPLES_PATH);
    const samples = samplesPayload.samples || [];
    const sampleResults = samples.map(runSample);
    const failures = sampleResults.filter(result => result.failures.length);

    return {
        ok: failures.length === 0,
        duty_rate_summary: summarizeDutyRateCoverage(dutyPayload),
        sample_count: samples.length,
        failed_sample_count: failures.length,
        failures,
        samples: sampleResults
    };
}

function main() {
    const result = runDutyRateHealthCheck();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    runDutyRateHealthCheck,
    runSample
};
