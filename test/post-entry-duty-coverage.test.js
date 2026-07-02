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
const {
    buildExactTariffParserPriorities
} = require('../scripts/update-exact-tariff-parser-priorities');

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
    assert.equal(qualityByCountry.get('US').official_source_checked, qualityByCountry.get('US').rule_count);
    ['EU', 'DE', 'NL'].forEach((country) => {
        assert.equal(qualityByCountry.get(country).coverage_level, 'official_or_scope_all', country);
        assert.ok(qualityByCountry.get(country).official_source_checked > 0, `${country} should have official TARIC candidates`);
        assert.ok(qualityByCountry.get(country).scope_check_required > 0, `${country} should retain exact-code gates`);
    });
    ['CN', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW'].forEach((country) => {
        assert.equal(qualityByCountry.get(country).coverage_level, 'official_all', country);
        assert.ok(qualityByCountry.get(country).official_source_checked > 0, `${country} should have maintained exact-line candidates`);
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
        'ai_compute',
        'battery',
        'data_center_infrastructure',
        'drone',
        'ev_charger',
        'industrial_automation',
        'memory_dram',
        'memory_hbm',
        'memory_nand',
        'memory_ssd_controller',
        'monitor',
        'optical_module',
        'router',
        'semiconductor',
        'smartphone',
        'solar',
        'surveillance_imaging',
        'tablet'
    ]);
    ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW'].forEach((country) => {
        assert.ok(matrix.import_markets.includes(country), `${country} should be in high-frequency rate matrix`);
    });
    assert.ok(matrix.official_or_hybrid_count > 50, 'official/hybrid/link-monitored coverage should cover the full high-frequency matrix');
    assert.equal(matrix.benchmark_count, 0, 'priority routes should no longer rely on benchmark-only rows');
    assert.equal(matrix.automation_counts.official_auto > 0, true);
    assert.equal(matrix.automation_counts.hybrid_official > 0, true);
    assert.equal(matrix.automation_counts.official_link_monitor, 2);
    assert.equal(matrix.automation_counts.benchmark_auto || 0, 0);
    assert.equal(matrix.trust_counts.official_link_estimate || 0, 0);
    assert.equal(matrix.trust_counts.mixed_official_estimate, 5);
    assert.equal(matrix.trust_counts.official_duty_tax_estimate, 181);
    assert.equal(matrix.trust_counts.precheck_estimate || 0, 0);
    assert.equal(matrix.trust_counts.official_heading_only, 2);
    assert.equal(matrix.trust_counts.official_exact, 54);
    assert.equal(matrix.exact_base_rate_covered_count, matrix.route_count);
    assert.equal(matrix.parser_priority_count, matrix.priority_upgrade_queue.length);
    assert.ok(matrix.priority_upgrade_queue.length > 0, 'parser upgrade queue should expose next exact-rate work');
    assert.ok(matrix.priority_upgrade_queue.every((row) => row.parser_target && row.next_action), 'upgrade queue should show parser target and next action');
    assert.ok(matrix.priority_upgrade_queue.every((row) => row.priority_band), 'upgrade queue should show business priority band');
    assert.ok(matrix.priority_upgrade_queue.every((row) => row.why_priority), 'upgrade queue should explain why the route is a priority');
    assert.ok(matrix.priority_upgrade_queue.every((row) => Array.isArray(row.rate_change_drivers) && row.rate_change_drivers.length > 0), 'upgrade queue should expose rate-change drivers');
    assert.ok(
        matrix.priority_upgrade_queue
            .filter(row => row.id === 'solar-cn-us' || row.id === 'drone-cn-us')
            .every(row => row.exact_base_rate_covered && row.parser_target === 'Add-on duty / case-scope resolver'),
        'US solar and drone should show official base duty covered while scope layers remain pending'
    );
    assert.ok(
        matrix.priority_upgrade_queue
            .filter(row => row.import_country === 'US' && row.origin_country === 'CN')
            .every(row => Array.isArray(row.scope_components) && row.scope_components.includes('chapter_99_section_301')),
        'US origin China routes should expose Section 301 as a parser scope component'
    );
    assert.ok(
        matrix.priority_upgrade_queue
            .find(row => row.id === 'solar-cn-us')
            .scope_components.includes('ad_cvd_scope'),
        'US solar backlog should expose AD/CVD scope as a parser component'
    );
    assert.ok(matrix.priority_upgrade_queue.some((row) => (
        row.import_country === 'US'
        && `${row.why_priority} ${row.rate_change_drivers.join(' ')}`.includes('Section 301')
    )), 'US backlog should explain Section 301 / add-on duty risk');
    assert.ok(matrix.priority_upgrade_queue.some((row) => (
        row.import_country === 'US'
        && row.product_id === 'solar'
        && /AD\/CVD/.test(row.us_backlog_focus)
    )), 'US solar backlog should call out AD/CVD scope before filing-grade use');
    assert.ok(matrix.priority_upgrade_queue.every((row) => Number.isFinite(row.impact_score)));
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'IN'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'MY'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'TW'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'SG'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'MX'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'JP'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'KR'), false);
    assert.equal(matrix.priority_upgrade_queue.some((row) => row.import_country === 'VN'), false);
});

test('memory subtype exact-rate routes stay official or hybrid covered', () => {
    const memoryRoutes = (priorityMatrix.routes || []).filter((route) => (
        ['memory_hbm', 'memory_dram', 'memory_nand', 'memory_ssd_controller'].includes(route.product_id)
    ));

    assert.equal(memoryRoutes.length, 52);
    memoryRoutes.forEach((route) => {
        assert.equal(
            ['official_duty_tax_estimate', 'mixed_official_estimate', 'official_exact'].includes(route.expected_source_trust),
            true,
            `${route.id} should not fall back to benchmark-only coverage`
        );
        assert.match(String(route.hs_code), /^85423[29]$/);
        assert.equal(
            ['hybrid_official', 'official_auto'].includes(route.automation_level),
            true,
            `${route.id} should stay in the automated official/hybrid queue`
        );
    });
});

test('exact tariff parser priorities mirror the live upgrade queue', () => {
    const result = runDutyRateHealthCheck();
    const payload = buildExactTariffParserPriorities({ generatedAt: '2026-06-22T00:00:00.000Z' });
    const liveIds = result.priority_rate_matrix.priority_upgrade_queue.map((row) => row.id);
    const payloadIds = payload.priorities.map((row) => row.id);
    const exactRouteScopeIds = payload.exact_route_scope_priorities.map((row) => row.route_id);

    assert.deepEqual(payloadIds, liveIds);
    assert.equal(payload.priorities.length, 7);
    assert.ok(payload.priorities.some((row) => row.id === 'drone-cn-us'));
    assert.equal(payload.priorities.some((row) => row.id === 'industrial-robot-de-us'), false);
    assert.ok(payload.priorities.every((row) => row.parser_scope && row.rate_change_drivers.length > 0));
    assert.equal(
        payload.rule_scope_priorities.length,
        result.exact_rate_progress.rule_scope_backlog_rows.length
    );
    assert.ok(payload.rule_scope_priorities.some((row) => row.rule_id === 'EU-GLOBAL-8525-CAMERA-IMPORT-SCOPE'));
    assert.ok(payload.rule_scope_priorities.some((row) => row.rule_id === 'DE-GLOBAL-8543-ELECTRICAL-MACHINES-IMPORT-SCOPE'));
    assert.ok(payload.rule_scope_priorities.some((row) => row.rule_id === 'RU-GLOBAL-ELECTRONICS-IMPORT-INDICATIVE'));
    assert.ok(payload.rule_scope_priorities.every((row) => row.parser_scope && row.parser_target && row.next_action));
    assert.deepEqual(
        exactRouteScopeIds.sort(),
        ['ai-server-rack-us-eu', 'data-center-infra-us-eu', 'optical-module-us-eu'].sort()
    );
    assert.ok(payload.exact_route_scope_priorities.every((row) => row.parser_target.includes('exact TARIC')));
    assert.ok(payload.exact_route_scope_priorities.every((row) => row.scope_components.includes('taric_exact_code_scope')));
    assert.ok(payload.exact_route_scope_priorities.every((row) => row.scope_components.includes('ce_rohs_market_surveillance')));
    assert.ok(payload.exact_route_scope_priorities.every((row) => row.scope_components.includes('member_state_vat')));
});

test('daily duty-rate sync refreshes exact tariff parser priorities', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'duty-rate-sync.yml'), 'utf8');

    assert.equal(
        packageJson.scripts['update:exact-tariff-parser-priorities'],
        'node scripts/update-exact-tariff-parser-priorities.js'
    );
    assert.match(workflow, /npm run update:exact-tariff-parser-priorities/);
    assert.match(workflow, /data\/exact-tariff-parser-priorities\.json/);
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

test('maintained exact candidates coexist with monitored import routes', () => {
    ['CN', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW'].forEach((country) => {
        const rule = (dutyRates.rules || []).find(item => (
            item.import_country === country
            && (item.hs_prefixes || []).includes('8542')
        ));

        assert.ok(rule, `${country} electronics rule should exist`);
        if (['CN', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW'].includes(country)) {
            assert.equal(rule.source_status, 'official_source_checked', `${country} should use maintained exact-line candidate status`);
            assert.ok((rule.exact_code_overrides || []).some(override => override.hs_code === '854231'));
        } else {
            assert.equal(rule.source_status, 'official_link_checked', `${country} should use official-link monitored status`);
        }
        assert.ok(rule.last_checked_at, `${country} should carry checked timestamp when refreshed`);
    });
});

test('Russia sample keeps sanctions scope as a review-only flag', () => {
    const result = runDutyRateHealthCheck();
    const russia = result.samples.find(sample => sample.id === 'PE-RU-CN-ELECTRONICS-851762');

    assert.ok(russia.source_statuses.includes('indicative'));
    assert.ok(russia.source_statuses.includes('scope_check_required'));
});

test('non-US samples stay non-official except maintained official candidate rows', () => {
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
            || sample.id.startsWith('PE-SG-')
            || sample.id.startsWith('PE-MX-')
            || sample.id.startsWith('PE-JP-')
            || sample.id.startsWith('PE-KR-')
            || sample.id.startsWith('PE-CN-')
            || sample.id.startsWith('PE-IN-')
            || sample.id.startsWith('PE-VN-')
            || sample.id.startsWith('PE-MY-')
            || sample.id.startsWith('PE-TW-')
        ) {
            return;
        }
        assert.equal(sample.source_statuses.includes('official_source_checked'), false, `${sample.id} should not be official`);
    });
});
