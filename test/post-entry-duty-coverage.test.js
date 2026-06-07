const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    runDutyRateHealthCheck
} = require('../scripts/check-duty-rates');
const {
    summarizeDutyRateCoverage
} = require('../scripts/update-us-duty-rates');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'post-entry-samples.json'), 'utf8'));

test('duty-rate table covers priority import markets', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const markets = new Set(summary.countries.map(country => country.import_country));

    ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
        assert.equal(markets.has(country), true, `${country} should have post-entry duty-rate coverage`);
    });
    assert.ok(summary.rule_count >= 16);
});

test('priority Post-Entry sample set has no coverage failures', () => {
    const result = runDutyRateHealthCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.sample_count, samples.samples.length);
    assert.equal(result.failed_sample_count, 0);
});

test('US samples preserve official and scope-review source statuses', () => {
    const result = runDutyRateHealthCheck();
    const battery = result.samples.find(sample => sample.id === 'PE-US-CN-LIB-850760');
    const solar = result.samples.find(sample => sample.id === 'PE-US-CN-SOLAR-854143');

    assert.ok(battery.source_statuses.includes('official_source_checked'));
    assert.ok(battery.source_statuses.includes('indicative'));
    assert.ok(solar.source_statuses.includes('scope_check_required'));
});

test('Russia sample keeps sanctions scope as a review-only flag', () => {
    const result = runDutyRateHealthCheck();
    const russia = result.samples.find(sample => sample.id === 'PE-RU-CN-ELECTRONICS-851762');

    assert.ok(russia.source_statuses.includes('indicative'));
    assert.ok(russia.source_statuses.includes('scope_check_required'));
});

test('non-US benchmark samples stay marked as indicative, not official', () => {
    const result = runDutyRateHealthCheck();
    const nonUsSamples = result.samples.filter(sample => !sample.id.startsWith('PE-US-'));

    assert.ok(nonUsSamples.length > 0);
    nonUsSamples.forEach((sample) => {
        assert.ok(sample.source_statuses.includes('indicative'), `${sample.id} should remain indicative`);
        assert.equal(sample.source_statuses.includes('official_source_checked'), false, `${sample.id} should not be official`);
    });
});
