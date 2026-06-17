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
    calculateDutyImpact,
    classifyRateSourceTrust
} = require('../lib/post-entry-value');
const {
    summarizeDutyRateCoverage
} = require('./update-us-duty-rates');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const SAMPLES_PATH = path.join(ROOT, 'data', 'post-entry-samples.json');
const PRIORITY_MATRIX_PATH = path.join(ROOT, 'data', 'post-entry-rate-priority-matrix.json');
const PRIORITY_IMPORT_MARKETS = ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW', 'RU'];
const PRIORITY_HS_PREFIXES = ['847130', '850440', '850760', '8517', '8525', '8528', '8541', '8542', '8543'];

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
    const sourceTrust = classifyRateSourceTrust(duty.sourceBreakdown || []);
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
    if (sample.expect_source_trust && sourceTrust.level !== sample.expect_source_trust) {
        failures.push(`source trust expected ${sample.expect_source_trust} but got ${sourceTrust.level}`);
    }

    return {
        id: sample.id,
        product: sample.product,
        route: `${sample.origin_country}->${sample.import_country}`,
        hs_code: sample.hs_code,
        covered: duty.covered,
        total_rate: duty.totalRate,
        source_statuses: sourceStatuses,
        source_trust: sourceTrust.level,
        failures
    };
}

function runPriorityMatrixRoute(route) {
    const value = calculatePostEntryValue({
        incoterm: route.incoterm || 'FOB',
        declaredAmount: route.declared_amount || 1000,
        freight: route.freight || 100,
        insurance: route.insurance || 20,
        otherCharges: route.other_charges || 0
    });
    const duty = calculateDutyImpact(value, {
        importCountryCode: route.import_country,
        originCountryCode: route.origin_country,
        hsCode: route.hs_code,
        entryDate: route.entry_date || '06 / 13 / 26'
    }, {
        declaredDuty: route.declared_duty || 0
    });
    const sourceStatuses = Array.from(new Set((duty.sourceBreakdown || []).map(item => item.status)));
    const sourceTrust = classifyRateSourceTrust(duty.sourceBreakdown || []);
    const failures = [];

    if (!duty.covered) {
        failures.push('priority route is not covered by maintained duty-rate rules');
    }
    if (route.expected_source_trust && sourceTrust.level !== route.expected_source_trust) {
        failures.push(`source trust expected ${route.expected_source_trust} but got ${sourceTrust.level}`);
    }
    if (!route.automation_level) {
        failures.push('automation_level is required');
    }

    return {
        id: route.id,
        product_id: route.product_id,
        route: `${route.origin_country}->${route.import_country}`,
        origin_country: route.origin_country,
        import_country: route.import_country,
        hs_code: route.hs_code,
        automation_level: route.automation_level || '',
        expected_source_trust: route.expected_source_trust || '',
        source_trust: sourceTrust.level,
        source_statuses: sourceStatuses,
        covered: duty.covered,
        total_rate: duty.totalRate,
        failures
    };
}

function summarizePriorityRateMatrix(matrixPayload = {}) {
    const routes = Array.isArray(matrixPayload.routes) ? matrixPayload.routes : [];
    const products = new Set((matrixPayload.priority_products || []).map(product => product.id));
    const results = routes.map(runPriorityMatrixRoute);
    const failures = results.filter(result => result.failures.length);
    const productIds = Array.from(new Set(routes.map(route => route.product_id).filter(Boolean))).sort();
    const importMarkets = Array.from(new Set(routes.map(route => route.import_country).filter(Boolean))).sort();
    const trustCounts = results.reduce((counts, row) => {
        counts[row.source_trust] = (counts[row.source_trust] || 0) + 1;
        return counts;
    }, {});
    const automationCounts = results.reduce((counts, row) => {
        counts[row.automation_level] = (counts[row.automation_level] || 0) + 1;
        return counts;
    }, {});
    const missingProductDefinitions = productIds.filter(productId => !products.has(productId));
    const trustRank = {
        precheck_estimate: 10,
        official_link_estimate: 20,
        official_heading_only: 30,
        mixed_official_estimate: 40,
        official_duty_tax_estimate: 90,
        official_exact_rate: 100
    };
    const marketRank = {
        IN: 1,
        SG: 2,
        MX: 3,
        JP: 4,
        KR: 5,
        VN: 6,
        MY: 7,
        TW: 8,
        EU: 9,
        DE: 10,
        NL: 11,
        US: 12,
        CN: 13
    };
    const productRank = {
        semiconductor: 1,
        router: 2,
        smartphone: 3,
        battery: 4,
        ev_charger: 5,
        solar: 6,
        tablet: 7,
        monitor: 8
    };
    const upgradeQueue = results
        .filter(result => !['official_exact_rate', 'official_duty_tax_estimate'].includes(result.source_trust))
        .map(result => ({
            id: result.id,
            product_id: result.product_id,
            route: result.route,
            origin_country: result.origin_country,
            import_country: result.import_country,
            hs_code: result.hs_code,
            source_trust: result.source_trust,
            automation_level: result.automation_level,
            priority: trustRank[result.source_trust] || 80,
            priority_band: result.source_trust === 'precheck_estimate'
                ? 'P1'
                : result.source_trust === 'official_link_estimate'
                    ? 'P1'
                    : result.source_trust === 'official_heading_only'
                        ? 'P2'
                        : 'P3',
            market_priority: marketRank[result.import_country] || 99,
            product_priority: productRank[result.product_id] || 99,
            parser_target: result.source_trust === 'official_link_estimate'
                ? `${result.route.split('->')[1] || 'market'} exact tariff-line parser`
                : result.source_trust === 'official_heading_only'
                    ? 'Exact HS / tariff-line scope resolver'
                    : result.source_trust === 'mixed_official_estimate'
                        ? 'Add-on duty and trade-remedy scope parser'
                        : 'Official source mapping',
            next_action: result.source_trust === 'official_link_estimate'
                ? 'Connect exact machine-readable tariff-line parser for this official source.'
                : result.source_trust === 'official_heading_only'
                    ? 'Require exact tariff line / scope before promoting to official exact rate.'
                    : result.source_trust === 'mixed_official_estimate'
                        ? 'Separate official base duty from trade-remedy or add-on scope and confirm active filing period.'
                        : 'Find official source or parser before using this route beyond screening.'
        }))
        .sort((a, b) => (
            a.priority - b.priority
            || a.market_priority - b.market_priority
            || a.product_priority - b.product_priority
            || a.route.localeCompare(b.route)
            || a.product_id.localeCompare(b.product_id)
        ));

    missingProductDefinitions.forEach((productId) => {
        failures.push({
            id: `product:${productId}`,
            failures: [`priority product ${productId} is used by a route but missing from priority_products`]
        });
    });

    return {
        ok: failures.length === 0,
        updated_at: matrixPayload.updated_at || null,
        product_count: productIds.length,
        import_market_count: importMarkets.length,
        route_count: routes.length,
        covered_route_count: results.filter(result => result.covered).length,
        official_or_hybrid_count: results.filter(result => (
            result.source_trust === 'official_duty_tax_estimate'
            || result.source_trust === 'mixed_official_estimate'
            || result.source_trust === 'official_exact_rate'
            || result.source_trust === 'official_heading_only'
            || result.source_trust === 'official_link_estimate'
        )).length,
        benchmark_count: results.filter(result => result.source_trust === 'precheck_estimate').length,
        parser_priority_count: upgradeQueue.length,
        priority_upgrade_queue: upgradeQueue,
        trust_counts: trustCounts,
        automation_counts: automationCounts,
        products: productIds,
        import_markets: importMarkets,
        failures,
        rows: results
    };
}

function summarizeSourceRoadmap(sourcesPayload, dutySummary) {
    const coveredCountries = new Set((dutySummary.countries || []).map(item => item.import_country));
    const rows = sourcesPayload.sources || [];
    const missingCoverage = rows
        .filter(source => !coveredCountries.has(source.country))
        .map(source => source.country);
    const missingRoadmap = (dutySummary.countries || [])
        .filter(country => !rows.some(source => source.country === country.import_country))
        .map(country => country.import_country);
    const statusCounts = rows.reduce((counts, source) => {
        counts[source.source_status] = (counts[source.source_status] || 0) + 1;
        return counts;
    }, {});

    return {
        source_count: rows.length,
        status_counts: statusCounts,
        auto_updatable: rows.filter(source => source.source_status === 'auto_updatable').map(source => source.country),
        hybrid_official_candidate: rows.filter(source => source.source_status === 'hybrid_official_candidate').map(source => source.country),
        benchmark_updatable: rows.filter(source => source.source_status === 'benchmark_updatable').map(source => source.country),
        updater_candidates: rows.filter(source => source.source_status === 'updater_candidate').map(source => source.country),
        official_link_only: rows.filter(source => source.source_status === 'official_link').map(source => source.country),
        benchmark_only: rows.filter(source => source.source_status === 'benchmark').map(source => source.country),
        missing_coverage: missingCoverage,
        missing_roadmap: missingRoadmap
    };
}

function summarizeRuleSourceQuality(dutyPayload) {
    const rows = Array.isArray(dutyPayload?.rules) ? dutyPayload.rules : [];
    const byCountry = {};
    rows.forEach((rule) => {
        const country = String(rule.import_country || '').toUpperCase();
        if (!country) return;
        byCountry[country] ||= {
            country,
            rule_count: 0,
            official_source_checked: 0,
            scope_check_required: 0,
            official_link_checked: 0,
            benchmark_source_checked: 0,
            indicative: 0,
            source_statuses: {}
        };
        const bucket = byCountry[country];
        const status = rule.source_status || 'indicative';
        bucket.rule_count += 1;
        bucket.source_statuses[status] = (bucket.source_statuses[status] || 0) + 1;
        if (status in bucket) {
            bucket[status] += 1;
        } else {
            bucket.indicative += 1;
        }
    });
    return Object.values(byCountry).map((row) => {
        const officialOrScope = row.official_source_checked + row.scope_check_required;
        const coverage_level = row.official_source_checked === row.rule_count
            ? 'official_all'
            : officialOrScope === row.rule_count
                ? 'official_or_scope_all'
                : row.official_link_checked === row.rule_count
                    ? 'official_link_all'
                    : row.benchmark_source_checked === row.rule_count
                    ? 'benchmark_all'
                    : 'mixed';
        return {
            ...row,
            coverage_level
        };
    }).sort((a, b) => a.country.localeCompare(b.country));
}

function buildDutyRateActionDetails({
    healthFailures = [],
    syncStatus = {},
    priorityMatrix = {}
} = {}) {
    const exceptions = Array.isArray(syncStatus.exceptions) ? syncStatus.exceptions : [];
    const upgradeQueue = Array.isArray(priorityMatrix.priority_upgrade_queue) ? priorityMatrix.priority_upgrade_queue : [];
    const rows = [];

    exceptions.forEach((item, index) => {
        rows.push({
            id: `sync-${index + 1}`,
            source: item.source || 'sync',
            country: item.country || '',
            route: item.route || '',
            hs_code: item.hs_code || '',
            severity: item.severity || 'medium',
            type: item.type || 'sync_exception',
            reason: item.reason || 'Duty-rate sync exception.',
            next_action: 'Review this source exception; normal sources do not need manual confirmation.',
            details: item.details || null
        });
    });

    healthFailures.forEach((item, index) => {
        rows.push({
            id: `health-${item.id || index + 1}`,
            source: 'coverage-health',
            country: item.country || '',
            route: item.route || '',
            hs_code: item.hs_code || '',
            severity: 'medium',
            type: 'health_check_failed',
            reason: (item.failures || []).join('; ') || 'Post-Entry health check failure.',
            next_action: 'Fix the failing route, source trust, or priority matrix row.',
            details: item
        });
    });

    upgradeQueue.slice(0, 50).forEach((item) => {
        rows.push({
            id: item.id || `${item.route}-${item.hs_code}`,
            source: item.parser_target || 'parser-backlog',
            country: item.import_country || '',
            route: item.route || '',
            hs_code: item.hs_code || '',
            severity: item.priority_band === 'P1' ? 'high' : item.priority_band === 'P2' ? 'medium' : 'low',
            type: 'exact_rate_backlog',
            reason: `${item.source_trust || 'unknown'} coverage; ${item.parser_target || 'parser target pending'}.`,
            next_action: item.next_action || 'Connect exact tariff-line parser or official source mapping.',
            details: item
        });
    });

    return rows;
}

function buildExactRateProgress({
    priorityMatrix = {},
    sourceRoadmap = {},
    sourceQuality = []
} = {}) {
    const rows = Array.isArray(priorityMatrix.rows) ? priorityMatrix.rows : [];
    const sourceQualityByCountry = new Map((sourceQuality || []).map(row => [row.country, row]));
    const priorityMarkets = Array.from(new Set(rows.map(row => row.import_country).filter(Boolean))).sort();
    const exactTrust = new Set(['official_exact_rate', 'official_duty_tax_estimate']);
    const hybridTrust = new Set(['mixed_official_estimate', 'official_heading_only', 'official_link_estimate']);
    const benchmarkTrust = new Set(['precheck_estimate']);

    const marketRows = priorityMarkets.map((market) => {
        const marketRows = rows.filter(row => row.import_country === market);
        const exact = marketRows.filter(row => exactTrust.has(row.source_trust)).length;
        const hybrid = marketRows.filter(row => hybridTrust.has(row.source_trust)).length;
        const benchmark = marketRows.filter(row => benchmarkTrust.has(row.source_trust)).length;
        const missing = marketRows.filter(row => !row.covered).length;
        const backlog = marketRows.length - exact;
        const sourceQualityRow = sourceQualityByCountry.get(market) || {};
        const status = missing > 0
            ? 'source_gap'
            : backlog === 0
                ? 'exact_ready'
                : exact > 0 || hybrid > 0
                    ? 'hybrid_in_progress'
                    : 'benchmark_only';
        const nextAction = status === 'exact_ready'
            ? 'Keep daily sync and rate-change threshold monitoring enabled.'
            : status === 'hybrid_in_progress'
                ? 'Finish exact tariff-line parser for the remaining high-frequency HS rows.'
                : status === 'benchmark_only'
                    ? 'Connect official tariff source before using this market for filing-grade value review.'
                    : 'Add maintained duty-rate rule and official source mapping.';

        return {
            market,
            status,
            total_routes: marketRows.length,
            exact_routes: exact,
            hybrid_routes: hybrid,
            benchmark_routes: benchmark,
            missing_routes: missing,
            backlog_routes: backlog,
            official_rule_count: sourceQualityRow.official_source_checked || 0,
            scope_check_count: sourceQualityRow.scope_check_required || 0,
            official_link_count: sourceQualityRow.official_link_checked || 0,
            next_action: nextAction
        };
    });

    const totals = marketRows.reduce((acc, row) => {
        acc.total_routes += row.total_routes;
        acc.exact_routes += row.exact_routes;
        acc.hybrid_routes += row.hybrid_routes;
        acc.benchmark_routes += row.benchmark_routes;
        acc.missing_routes += row.missing_routes;
        acc.backlog_routes += row.backlog_routes;
        acc.exact_ready_markets += row.status === 'exact_ready' ? 1 : 0;
        acc.hybrid_markets += row.status === 'hybrid_in_progress' ? 1 : 0;
        acc.benchmark_markets += row.status === 'benchmark_only' ? 1 : 0;
        acc.source_gap_markets += row.status === 'source_gap' ? 1 : 0;
        return acc;
    }, {
        total_routes: 0,
        exact_routes: 0,
        hybrid_routes: 0,
        benchmark_routes: 0,
        missing_routes: 0,
        backlog_routes: 0,
        exact_ready_markets: 0,
        hybrid_markets: 0,
        benchmark_markets: 0,
        source_gap_markets: 0
    });

    const roadmapStatus = {
        auto_updatable: sourceRoadmap.auto_updatable || [],
        hybrid_official_candidate: sourceRoadmap.hybrid_official_candidate || [],
        benchmark_updatable: sourceRoadmap.benchmark_updatable || [],
        official_link_only: sourceRoadmap.official_link_only || [],
        benchmark_only: sourceRoadmap.benchmark_only || []
    };

    return {
        totals,
        roadmap_status: roadmapStatus,
        rows: marketRows
    };
}

function ruleMatchesPriority(rule, market, prefix) {
    const importCountry = String(rule.import_country || '').toUpperCase();
    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes.map(String) : [];
    return importCountry === market && prefixes.includes(prefix);
}

function buildDutyRateGapMatrix(dutyPayload, {
    markets = PRIORITY_IMPORT_MARKETS,
    prefixes = PRIORITY_HS_PREFIXES
} = {}) {
    const rules = Array.isArray(dutyPayload?.rules) ? dutyPayload.rules : [];
    const rows = markets.map((market) => {
        const covered = prefixes.filter((prefix) => rules.some((rule) => ruleMatchesPriority(rule, market, prefix)));
        const missing = prefixes.filter((prefix) => !covered.includes(prefix));
        const status = missing.length === 0 ? 'full' : covered.length > 0 ? 'partial' : 'missing';
        return {
            market,
            status,
            covered,
            missing
        };
    });
    return {
        markets,
        prefixes,
        full_count: rows.filter((row) => row.status === 'full').length,
        partial_count: rows.filter((row) => row.status === 'partial').length,
        missing_count: rows.filter((row) => row.status === 'missing').length,
        missing_total: rows.reduce((sum, row) => sum + row.missing.length, 0),
        rows
    };
}

function runDutyRateHealthCheck() {
    const dutyPayload = readJson(DUTY_RATES_PATH);
    const sourcesPayload = readJson(DUTY_RATE_SOURCES_PATH);
    const syncStatusPath = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
    const syncStatus = fs.existsSync(syncStatusPath) ? readJson(syncStatusPath) : { exceptions: [] };
    const samplesPayload = readJson(SAMPLES_PATH);
    const priorityMatrixPayload = readJson(PRIORITY_MATRIX_PATH);
    const samples = samplesPayload.samples || [];
    const sampleResults = samples.map(runSample);
    const failures = sampleResults.filter(result => result.failures.length);
    const priorityRateMatrix = summarizePriorityRateMatrix(priorityMatrixPayload);
    const dutySummary = summarizeDutyRateCoverage(dutyPayload);
    const dutyGapMatrix = buildDutyRateGapMatrix(dutyPayload);
    const sourceRoadmap = summarizeSourceRoadmap(sourcesPayload, dutySummary);
    const sourceQualitySummary = summarizeRuleSourceQuality(dutyPayload);
    const exactRateProgress = buildExactRateProgress({
        priorityMatrix: priorityRateMatrix,
        sourceRoadmap,
        sourceQuality: sourceQualitySummary
    });
    const sourceFailures = [];
    if (sourceRoadmap.missing_coverage.length) {
        sourceFailures.push(`source roadmap includes countries without duty rules: ${sourceRoadmap.missing_coverage.join(', ')}`);
    }
    if (sourceRoadmap.missing_roadmap.length) {
        sourceFailures.push(`duty rules include countries missing source roadmap: ${sourceRoadmap.missing_roadmap.join(', ')}`);
    }

    return {
        ok: failures.length === 0 && sourceFailures.length === 0 && priorityRateMatrix.ok,
        duty_rate_summary: dutySummary,
        duty_rate_gap_matrix: dutyGapMatrix,
        source_roadmap_summary: sourceRoadmap,
        source_quality_summary: sourceQualitySummary,
        priority_rate_matrix: priorityRateMatrix,
        exact_rate_progress: exactRateProgress,
        action_details: buildDutyRateActionDetails({
            healthFailures: failures,
            syncStatus,
            priorityMatrix: priorityRateMatrix
        }),
        sample_count: samples.length,
        failed_sample_count: failures.length,
        failures: failures
            .concat(sourceFailures.map(error => ({ id: 'source-roadmap', failures: [error] })))
            .concat(priorityRateMatrix.failures.map(row => ({
                id: row.id || 'priority-rate-matrix',
                failures: row.failures || ['priority rate matrix failure']
            }))),
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
    PRIORITY_IMPORT_MARKETS,
    PRIORITY_HS_PREFIXES,
    buildDutyRateGapMatrix,
    runDutyRateHealthCheck,
    runPriorityMatrixRoute,
    runSample,
    summarizePriorityRateMatrix,
    summarizeRuleSourceQuality,
    buildDutyRateActionDetails,
    buildExactRateProgress,
    summarizeSourceRoadmap
};
