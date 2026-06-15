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
const priorityMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'post-entry-rate-priority-matrix.json'), 'utf8'));

test('duty-rate table covers priority import markets', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const markets = new Set(summary.countries.map(country => country.import_country));

    ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW', 'RU'].forEach((country) => {
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

test('Post-Entry source quality summary separates official, hybrid, and benchmark markets', () => {
    const result = runDutyRateHealthCheck();
    const qualityByCountry = new Map(result.source_quality_summary.map(item => [item.country, item]));

    assert.equal(qualityByCountry.get('US').coverage_level, 'official_all');
    ['EU', 'DE', 'NL'].forEach((country) => {
        assert.equal(qualityByCountry.get(country).coverage_level, 'official_or_scope_all', country);
        assert.ok(qualityByCountry.get(country).official_source_checked > 0, `${country} should have official TARIC candidates`);
        assert.ok(qualityByCountry.get(country).scope_check_required > 0, `${country} should retain exact-code gates`);
    });
    ['SG', 'MX', 'JP', 'KR', 'IN'].forEach((country) => {
        assert.equal(qualityByCountry.get(country).coverage_level, 'official_link_all', country);
        assert.ok(qualityByCountry.get(country).official_link_checked > 0, `${country} should have monitored official links`);
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
        'CN->EU:8471300000',
        'CN->DE:850760',
        'US->DE:8528521000',
        'US->NL:8542',
        'US->NL:8542310000',
        'US->MX:850440',
        'US->JP:851713',
        'US->KR:851762',
        'CN->IN:851713',
        'US->IN:854231',
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

test('high-frequency exact-rate matrix covers priority products and routes', () => {
    const result = runDutyRateHealthCheck();
    const matrix = result.priority_rate_matrix;

    assert.equal(matrix.ok, true, JSON.stringify(matrix.failures, null, 2));
    assert.equal(matrix.route_count, priorityMatrix.routes.length);
    assert.ok(matrix.route_count >= 50, 'priority matrix should cover at least 50 high-frequency routes');
    assert.deepEqual(matrix.products, [
        'battery',
        'ev_charger',
        'monitor',
        'router',
        'semiconductor',
        'smartphone',
        'solar',
        'tablet'
    ]);
    ['US', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW'].forEach((country) => {
        assert.ok(matrix.import_markets.includes(country), `${country} should be in high-frequency rate matrix`);
    });
    assert.ok(matrix.official_or_hybrid_count > 50, 'official/hybrid/link-monitored coverage should cover the full high-frequency matrix');
    assert.equal(matrix.benchmark_count, 12, 'new VN/MY/TW priority routes should remain explicit benchmark rows until official parser work is complete');
    assert.equal(matrix.automation_counts.official_auto > 0, true);
    assert.equal(matrix.automation_counts.hybrid_official > 0, true);
    assert.equal(matrix.automation_counts.official_link_monitor > 0, true);
    assert.equal(matrix.automation_counts.benchmark_auto, 12);
    assert.equal(matrix.trust_counts.official_link_estimate, 32);
    assert.equal(matrix.trust_counts.precheck_estimate, 12);
    assert.ok(matrix.trust_counts.official_heading_only >= 8);
    assert.equal(matrix.parser_priority_count, matrix.priority_upgrade_queue.length);
    assert.ok(matrix.priority_upgrade_queue.length > 0, 'parser upgrade queue should expose next exact-rate work');
    assert.ok(matrix.priority_upgrade_queue.every((row) => row.parser_target && row.next_action), 'upgrade queue should show parser target and next action');
    assert.ok(matrix.priority_upgrade_queue.every((row) => row.priority_band), 'upgrade queue should show business priority band');
    assert.ok(matrix.priority_upgrade_queue.some((row) => row.parser_target.includes('SG exact tariff-line parser')));
    assert.ok(matrix.priority_upgrade_queue.some((row) => row.import_country === 'VN' && row.source_trust === 'precheck_estimate'));
});

test('high-frequency exact-rate matrix has source-trust expectations on every row', () => {
    priorityMatrix.routes.forEach((route) => {
        assert.ok(route.id, 'route id is required');
        assert.ok(route.product_id, `${route.id} should declare product_id`);
        assert.ok(route.origin_country, `${route.id} should declare origin_country`);
        assert.ok(route.import_country, `${route.id} should declare import_country`);
        assert.ok(route.hs_code, `${route.id} should declare hs_code`);
        assert.ok(route.expected_source_trust, `${route.id} should declare expected_source_trust`);
        assert.ok(route.automation_level, `${route.id} should declare automation_level`);
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

test('Singapore Mexico Japan Korea and India import routes are official-link monitored', () => {
    ['SG', 'MX', 'JP', 'KR', 'IN'].forEach((country) => {
        const rule = (dutyRates.rules || []).find(item => (
            item.import_country === country
            && (item.hs_prefixes || []).includes('8542')
        ));

        assert.ok(rule, `${country} electronics rule should exist`);
        assert.equal(rule.source_status, 'official_link_checked', `${country} should use official-link monitored status`);
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
            sample.source_statuses.includes('indicative')
                || sample.source_statuses.includes('benchmark_source_checked')
                || sample.source_statuses.includes('official_link_checked'),
            true,
            `${sample.id} should remain indicative, benchmark-checked, or official-link monitored`
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
