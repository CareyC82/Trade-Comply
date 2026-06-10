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

test('US electronics duty rules stay split by HS prefix for official sync', () => {
    const requiredPrefixes = ['8517', '8525', '8528', '8543'];
    const usRules = (dutyRates.rules || []).filter(rule => (
        rule.import_country === 'US'
        && rule.origin_country === 'CN'
        && (rule.hs_prefixes || []).some(prefix => requiredPrefixes.includes(prefix))
    ));
    const prefixes = new Map();

    usRules.forEach((rule) => {
        assert.equal(rule.hs_prefixes.length, 1, `${rule.id} should have one HS prefix`);
        prefixes.set(rule.hs_prefixes[0], rule);
    });
    requiredPrefixes.forEach((prefix) => {
        assert.ok(prefixes.has(prefix), `US ${prefix} duty rule should exist`);
        assert.equal(prefixes.get(prefix).source_status, 'official_source_checked');
    });
});

test('Russia sample keeps sanctions scope as a review-only flag', () => {
    const result = runDutyRateHealthCheck();
    const russia = result.samples.find(sample => sample.id === 'PE-RU-CN-ELECTRONICS-851762');

    assert.ok(russia.source_statuses.includes('indicative'));
    assert.ok(russia.source_statuses.includes('scope_check_required'));
});

test('non-US benchmark samples stay non-official except EU TARIC candidate rows', () => {
    const result = runDutyRateHealthCheck();
    const nonUsSamples = result.samples.filter(sample => !sample.id.startsWith('PE-US-'));
    const officialEuCandidate = result.samples.find(sample => sample.id === 'PE-EU-CN-EVCHARGER-850440');

    assert.ok(nonUsSamples.length > 0);
    assert.ok(officialEuCandidate.source_statuses.includes('official_source_checked'));
    nonUsSamples.forEach((sample) => {
        assert.equal(
            sample.source_statuses.includes('indicative') || sample.source_statuses.includes('benchmark_source_checked'),
            true,
            `${sample.id} should remain indicative or benchmark-checked`
        );
        if (sample.id === 'PE-EU-CN-EVCHARGER-850440') {
            return;
        }
        assert.equal(sample.source_statuses.includes('official_source_checked'), false, `${sample.id} should not be official`);
    });
});
