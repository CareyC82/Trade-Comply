const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    PRIORITY_HS_PREFIXES,
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
    assert.ok(result.sample_count >= 24, 'priority Post-Entry sample set should cover at least 24 high-frequency scenarios');
});

test('priority Post-Entry samples carry explicit source quality expectations', () => {
    samples.samples.forEach((sample) => {
        assert.ok(Array.isArray(sample.expect_source_statuses), `${sample.id} should declare expected source statuses`);
        assert.ok(sample.expect_source_statuses.length > 0, `${sample.id} should declare at least one expected source status`);
        assert.ok(sample.expect_source_trust, `${sample.id} should declare expected source trust tier`);
    });
});

test('priority Post-Entry samples keep expected source trust tiers', () => {
    const result = runDutyRateHealthCheck();

    result.samples.forEach((sampleResult) => {
        const sample = samples.samples.find(item => item.id === sampleResult.id);
        assert.equal(sampleResult.source_trust, sample.expect_source_trust, sampleResult.id);
    });
});

test('priority Post-Entry samples cover common global electronics routes', () => {
    const routeKeys = new Set(samples.samples.map(sample => (
        `${sample.origin_country}->${sample.import_country}:${sample.hs_code}`
    )));

    [
        'CN->US:850760',
        'CN->US:851762',
        'CN->US:8525',
        'CN->EU:847130',
        'CN->DE:850760',
        'US->NL:8542',
        'US->MX:850440',
        'US->JP:851713',
        'US->KR:851762',
        'US->VN:847130',
        'US->MY:850440'
    ].forEach((key) => {
        assert.equal(routeKeys.has(key), true, `${key} should be in priority Post-Entry samples`);
    });
});

test('priority Post-Entry HS matrix has no uncovered cells', () => {
    const result = runDutyRateHealthCheck();
    const matrix = result.duty_rate_gap_matrix;

    assert.equal(matrix.missing_total, 0, JSON.stringify(matrix.rows.filter(row => row.missing.length), null, 2));
    assert.equal(matrix.full_count, matrix.rows.length);
    matrix.rows.forEach((row) => {
        assert.deepEqual(row.missing, [], `${row.market} should not have missing priority HS prefixes`);
        assert.deepEqual(row.covered, PRIORITY_HS_PREFIXES, `${row.market} should cover every priority HS prefix`);
    });
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

test('Germany and Netherlands EU duty rules stay split by HS prefix for TARIC sync', () => {
    ['DE', 'NL'].forEach((country) => {
        const rules = (dutyRates.rules || []).filter(rule => rule.import_country === country);
        const prefixes = new Map();

        rules.forEach((rule) => {
            if ((rule.hs_prefixes || []).some(prefix => ['847130', '850440', '850760', '8517', '8528', '8541', '8542'].includes(prefix))) {
                assert.equal(rule.hs_prefixes.length, 1, `${rule.id} should have one HS prefix`);
                prefixes.set(rule.hs_prefixes[0], rule);
            }
        });

        ['847130', '850440', '850760', '8517', '8528', '8541', '8542'].forEach((prefix) => {
            assert.ok(prefixes.has(prefix), `${country} ${prefix} duty rule should exist`);
        });
        assert.equal(prefixes.get('850440').source_status, 'official_source_checked');
        assert.equal(prefixes.get('8528').source_status, 'scope_check_required');
    });
});

test('European Union aggregate rules cover common electronics HS prefixes', () => {
    const rules = (dutyRates.rules || []).filter(rule => rule.import_country === 'EU');
    const prefixes = new Map();

    rules.forEach((rule) => {
        if ((rule.hs_prefixes || []).some(prefix => ['847130', '850440', '850760', '8517', '8528', '8541', '8542'].includes(prefix))) {
            assert.equal(rule.hs_prefixes.length, 1, `${rule.id} should have one HS prefix`);
            prefixes.set(rule.hs_prefixes[0], rule);
        }
    });

    ['847130', '850440', '850760', '8517', '8528', '8541', '8542'].forEach((prefix) => {
        assert.ok(prefixes.has(prefix), `EU ${prefix} duty rule should exist`);
    });
    assert.equal(prefixes.get('850760').source_status, 'official_source_checked');
    assert.equal(prefixes.get('8528').source_status, 'scope_check_required');
});

test('Singapore Mexico Japan and Korea import benchmarks stay source-checked', () => {
    ['SG', 'MX', 'JP', 'KR'].forEach((country) => {
        const rule = (dutyRates.rules || []).find(item => (
            item.import_country === country
            && (item.hs_prefixes || []).includes('8542')
        ));

        assert.ok(rule, `${country} electronics benchmark rule should exist`);
        assert.equal(rule.source_status, 'benchmark_source_checked', `${country} should use benchmark source checked status`);
        assert.ok(rule.last_checked_at, `${country} should carry checked timestamp when refreshed`);
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
    const officialTaricSamples = result.samples.filter(sample => (
        sample.id.startsWith('PE-EU-')
        || sample.id.startsWith('PE-DE-')
        || sample.id.startsWith('PE-NL-')
    ));

    assert.ok(nonUsSamples.length > 0);
    assert.ok(officialTaricSamples.some(sample => sample.source_statuses.includes('official_source_checked')));
    nonUsSamples.forEach((sample) => {
        assert.equal(
            sample.source_statuses.includes('indicative') || sample.source_statuses.includes('benchmark_source_checked'),
            true,
            `${sample.id} should remain indicative or benchmark-checked`
        );
        if (
            sample.id.startsWith('PE-EU-')
            || sample.id.startsWith('PE-DE-')
            || sample.id.startsWith('PE-NL-')
        ) {
            return;
        }
        assert.equal(sample.source_statuses.includes('official_source_checked'), false, `${sample.id} should not be official`);
    });
});
