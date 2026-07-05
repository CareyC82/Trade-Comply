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
const { dutyAutomationStage } = require('./build-automation-launch-status');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const SAMPLES_PATH = path.join(ROOT, 'data', 'post-entry-samples.json');
const PRIORITY_MATRIX_PATH = path.join(ROOT, 'data', 'post-entry-rate-priority-matrix.json');
const PRIORITY_IMPORT_MARKETS = ['US', 'CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'JP', 'KR', 'IN', 'VN', 'MY', 'TW', 'RU'];
const PRIORITY_HS_PREFIXES = [
    '847130',
    '8479',
    '850440',
    '850760',
    '8517',
    '8525',
    '8528',
    '8541',
    '8542',
    '8543',
    '9018',
    '9027'
];

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

function getRatePriorityBand(sourceTrust) {
    if (sourceTrust === 'precheck_estimate' || sourceTrust === 'official_link_estimate') return 'P1';
    if (sourceTrust === 'official_heading_only') return 'P2';
    return 'P3';
}

function getRateParserTarget(result = {}) {
    if (result.source_trust === 'official_link_estimate') {
        return `${result.import_country || 'market'} exact tariff-line parser`;
    }
    if (result.source_trust === 'official_heading_only') {
        if (result.exact_base_rate_covered) {
            return 'Add-on duty / case-scope resolver';
        }
        return 'Exact HS / tariff-line scope resolver';
    }
    if (result.source_trust === 'mixed_official_estimate') {
        return 'Add-on duty and trade-remedy scope parser';
    }
    return 'Official source mapping';
}

function getRateNextAction(result = {}) {
    if (result.source_trust === 'official_link_estimate') {
        return 'Connect exact machine-readable tariff-line parser for this official source.';
    }
    if (result.source_trust === 'official_heading_only') {
        if (result.exact_base_rate_covered) {
            return 'Keep the official base duty; resolve Chapter 99, trade-remedy, exclusion, or case-scope layers before filing-grade use.';
        }
        return 'Require exact tariff line / scope before promoting to official exact rate.';
    }
    if (result.source_trust === 'mixed_official_estimate') {
        return 'Separate official base duty from trade-remedy or add-on scope and confirm active filing period.';
    }
    return 'Find official source or parser before using this route beyond screening.';
}

function getRateChangeDrivers(result = {}) {
    const drivers = [];
    const text = [
        result.id,
        result.product_id,
        result.route,
        result.hs_code,
        result.source_trust,
        ...(result.source_statuses || [])
    ].join(' ').toLowerCase();

    if (result.source_trust === 'official_heading_only') {
        drivers.push(result.exact_base_rate_covered
            ? 'Official base duty is covered, but add-on or case-scope layers can still change the final payable rate.'
            : 'Exact tariff-line scope can change the final payable rate.');
    }
    if (result.source_trust === 'mixed_official_estimate') {
        drivers.push('Trade-remedy scope, add-on duty, or exclusion period can change payable duty.');
    }
    if (result.source_trust === 'official_link_estimate') {
        drivers.push('Official page is monitored, but the exact machine-readable tariff line is not wired yet.');
    }
    if (result.source_trust === 'precheck_estimate') {
        drivers.push('Official source mapping is not wired yet, so this route remains screening-only.');
    }
    if (result.import_country === 'US' && result.origin_country === 'CN') {
        drivers.push('US Section 301 Chapter 99 coverage and exclusion status can change add-on duty.');
    }
    if (matchesScopeText(text, [/\bsolar\b/, /\b8541\b/, /\bphotovoltaic\b/])) {
        drivers.push('Solar AD/CVD scope, origin evidence, and deposit period can change the duty exposure.');
    }
    if (matchesScopeText(text, [/\bbatter(?:y|ies)\b/, /\b850760\b/])) {
        drivers.push('Battery chemistry, capacity, and origin can change duty, tax, or trade-remedy treatment.');
    }
    if (matchesTechnologyScope(text)) {
        drivers.push('Semiconductor scope can depend on exact HS line, end-use, and technology classification.');
    }
    if (matchesScopeText(text, [/\b8517\b/, /\brouter\b/, /\bsmartphone\b/, /\btelecom\b/, /\btelecommunications?\b/])) {
        drivers.push('Telecom electronics may need exact subheading, wireless module scope, and local tax treatment.');
    }

    return Array.from(new Set(drivers));
}

function matchesScopeText(text = '', patterns = []) {
    const normalized = String(text || '').toLowerCase();
    return patterns.some((pattern) => pattern.test(normalized));
}

function matchesTechnologyScope(text = '') {
    return matchesScopeText(text, [
        /\bsemiconductor(s)?\b/,
        /\b8542\b/,
        /\bgpu(s)?\b/,
        /\bai\s+(chip|accelerator|hardware|compute|computing|server|processor|gpu)\b/,
        /\badvanced\s+comput(?:e|ing)\b/,
        /\bhbm(?:2|3|3e)?\b/,
        /\bhigh\s+bandwidth\s+memory\b/,
        /\bmemory\s+(chip|component|module|device)\b/
    ]);
}

function getRateScopeComponents(result = {}) {
    const components = [];
    const text = [
        result.id,
        result.product_id,
        result.route,
        result.hs_code,
        result.source_trust,
        ...(result.source_statuses || [])
    ].join(' ').toLowerCase();

    if (result.exact_base_rate_covered) {
        components.push('official_base_duty');
    }
    if (result.import_country === 'US' && result.origin_country === 'CN') {
        components.push('chapter_99_section_301');
    }
    if (matchesScopeText(text, [/\bsolar\b/, /\b8541\b/, /\bphotovoltaic\b/])) {
        components.push('ad_cvd_scope');
        components.push('origin_route_evidence');
    }
    if (matchesScopeText(text, [/\bbatter(?:y|ies)\b/, /\b850760\b/])) {
        components.push('battery_chemistry_scope');
    }
    if (matchesScopeText(text, [/\b850440\b/, /\bpower\b/, /\bcharger\b/, /\badapter\b/, /\binverter\b/])) {
        components.push('power_conversion_scope');
    }
    if (matchesScopeText(text, [/\b847130\b/, /\btablet\b/, /\bportable\b/, /\bcomputer\b/, /\blaptop\b/])) {
        components.push('portable_adp_scope');
    }
    if (matchesScopeText(text, [/\b8525\b/, /\bcamera\b/, /\bsurveillance\b/, /\bnvr\b/, /\bvideo\b/])) {
        components.push('camera_transmission_scope');
    }
    if (matchesScopeText(text, [/\b9018\b/, /\b9027\b/, /\bmedical\b/, /\bdiagnostic\b/, /\blaborator(?:y|ies)\b/, /\banaly[sz]er\b/, /\bpatient\b/])) {
        components.push('medical_device_scope');
    }
    if (matchesScopeText(text, [/\b8517\b/, /\brouter\b/, /\bsmartphone\b/, /\btelecom\b/, /\btelecommunications?\b/])) {
        components.push('telecom_subheading_scope');
        components.push('wireless_module_scope');
    }
    if (matchesTechnologyScope(text)) {
        components.push('technology_end_use_scope');
    }
    if (/taric/.test(text) || ['EU', 'DE', 'NL'].includes(result.import_country)) {
        components.push('taric_exact_code_scope');
    }
    if (matchesScopeText(text, [/\bru\b/, /\brussia\b/, /\beaeu\b/, /\bsanctions?\b/, /\brestricted-party\b/]) || result.import_country === 'RU') {
        components.push('eaeu_tariff_scope');
        components.push('sanctions_scope');
    }
    if (result.source_trust === 'official_heading_only' || result.source_trust === 'mixed_official_estimate') {
        components.push('active_exclusion_or_case_period');
    }

    return Array.from(new Set(components));
}

function getRuleScopeComponents({ rule = {}, route = '', importCountry = '', originCountry = '', hsCode = '', sourceStatus = '', sourceTrust = '' } = {}) {
    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes.map(String) : [];
    const text = [
        rule.id,
        rule.label,
        rule.source_note,
        rule.trade_remedy,
        sourceStatus
    ].join(' ').toLowerCase();

    if (importCountry === 'RU' && prefixes.length > 4) {
        const routeLevelComponents = ['official_source_link', 'tariff_exact_code_scope', 'eaeu_tariff_scope', 'sanctions_scope'];
        if (sourceTrust === 'official_heading_only') {
            routeLevelComponents.push('active_exclusion_or_case_period');
        }
        return Array.from(new Set(routeLevelComponents));
    }

    const components = getRateScopeComponents({
        id: rule.id,
        product_id: rule.label || '',
        route,
        hs_code: hsCode,
        import_country: importCountry,
        origin_country: originCountry,
        source_trust: sourceTrust,
        source_statuses: [sourceStatus, text],
        exact_base_rate_covered: false
    });

    if (sourceStatus === 'official_link_checked') {
        components.push('official_source_link');
    }
    if (sourceStatus === 'scope_check_required' || sourceTrust === 'official_heading_only') {
        components.push('tariff_exact_code_scope');
    }
    if (/ad\/cvd|anti|countervailing|trade remedy|remedy|case/.test(text)) {
        components.push('trade_remedy_scope');
    }
    if (sourceStatus === 'benchmark_source_checked') {
        components.push('official_rate_source_mapping');
    }
    if (!components.length) {
        components.push('tariff_exact_code_scope');
    }

    return Array.from(new Set(components));
}

function getRatePriorityReason(result = {}) {
    const drivers = getRateChangeDrivers(result);
    const route = result.route || `${result.origin_country || '?'}->${result.import_country || '?'}`;
    const product = result.product_id || 'route';
    if (result.import_country === 'US') {
        return `${route} ${product} remains a high-impact backlog because US exact duty may change with Section 301, trade-remedy scope, or exclusion status.`;
    }
    if (result.source_trust === 'official_heading_only') {
        return `${route} ${product} has official heading support, but exact tariff-line scope is still the blocker.`;
    }
    if (result.source_trust === 'mixed_official_estimate') {
        return `${route} ${product} has official base-rate support, but add-on duty or scope must be split before filing-grade use.`;
    }
    return drivers[0] || `${route} ${product} needs exact-rate parser coverage before filing-grade use.`;
}

function getUsBacklogFocus(result = {}) {
    if (result.import_country !== 'US' || result.origin_country !== 'CN') return '';
    const product = String(result.product_id || '').toLowerCase();
    const hsCode = String(result.hs_code || '');

    if (product === 'solar' || hsCode.startsWith('8541')) {
        return 'Resolve exact HTS 854143 line, AD/CVD case scope, origin-route evidence, and Section 301 Chapter 99/exclusion before using the rate for filing.';
    }
    if (product === 'battery' || hsCode.startsWith('850760')) {
        return 'Resolve battery chemistry, capacity, exact 850760 subheading, Section 301 coverage, and any battery-specific trade-remedy scope.';
    }
    if (product === 'router' || product === 'smartphone' || hsCode.startsWith('8517')) {
        return 'Resolve exact 8517 telecom subheading, wireless module scope, FCC/entry classification evidence, and Section 301 exclusion status.';
    }
    if (product === 'ev_charger' || hsCode.startsWith('850440')) {
        return 'Resolve exact power-conversion subheading, EV-charger function scope, origin evidence, and Section 301 add-on duty treatment.';
    }
    if (product === 'tablet' || hsCode.startsWith('847130')) {
        return 'Resolve exact portable ADP/tablet classification, origin evidence, and Section 301 add-on duty or exclusion status.';
    }
    if (product === 'semiconductor' || hsCode.startsWith('8542')) {
        return 'Resolve exact semiconductor line, technology/end-use scope, and any Chapter 99/add-on duty treatment.';
    }
    return 'Resolve exact HTS line, country of origin evidence, Section 301 coverage, and active exclusion status.';
}

function getRateParserSubtasks(result = {}) {
    const subtasks = [];
    const product = String(result.product_id || '').toLowerCase();
    const hsCode = String(result.hs_code || '');

    if (result.import_country === 'US' && result.origin_country === 'CN') {
        subtasks.push('Map exact HTS line to current Section 301 Chapter 99 coverage and exclusion status.');
        if (product === 'solar' || hsCode.startsWith('8541')) {
            subtasks.push('Attach AD/CVD case-scope resolver for solar module origin, cell source, and deposit period.');
            subtasks.push('Keep UFLPA / forced-labor evidence separate from customs-duty math.');
        }
        if (product === 'battery' || hsCode.startsWith('850760')) {
            subtasks.push('Split lithium battery chemistry, capacity, and ESS pack scope before add-on duty review.');
        }
        if (product === 'router' || product === 'smartphone' || hsCode.startsWith('8517')) {
            subtasks.push('Resolve exact 8517 telecom subheading and wireless module scope before add-on duty use.');
        }
        if (product === 'ev_charger' || hsCode.startsWith('850440')) {
            subtasks.push('Resolve power-conversion function, EV charger scope, and active add-on duty layer.');
        }
        if (product === 'tablet' || hsCode.startsWith('847130')) {
            subtasks.push('Resolve portable ADP/tablet classification and origin evidence before Section 301 treatment.');
        }
        if (product === 'drone' || hsCode.startsWith('8806') || hsCode.startsWith('8525')) {
            subtasks.push('Resolve UAV aircraft/camera classification and active tariff-exclusion scope.');
        }
    }

    if (result.source_trust === 'official_heading_only') {
        subtasks.push('Keep official base duty, but block filing-grade use until case/exclusion scope is resolved.');
    }
    if (result.source_trust === 'mixed_official_estimate') {
        subtasks.push('Separate official base duty from maintained estimate layers before promoting to filing-grade.');
    }
    if (!subtasks.length) {
        subtasks.push(result.next_action || 'Attach official exact-rate source mapping before filing-grade use.');
    }

    return Array.from(new Set(subtasks));
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
    const exactBaseRateCovered = (duty.sourceBreakdown || []).some(item => (
        item.component === 'base_duty'
        && item.status === 'official_source_checked'
        && item.hts
    ));
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

    const result = {
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
        exact_base_rate_covered: exactBaseRateCovered,
        covered: duty.covered,
        total_rate: duty.totalRate,
        impact_score: Math.round(Number(duty.totalRate || 0) * 10000),
        failures
    };
    result.rate_change_drivers = getRateChangeDrivers(result);
    result.scope_components = getRateScopeComponents(result);
    result.why_priority = getRatePriorityReason(result);
    result.parser_target = getRateParserTarget(result);
    result.next_action = getRateNextAction(result);
    result.priority_band = getRatePriorityBand(result.source_trust);
    result.us_backlog_focus = getUsBacklogFocus(result);
    result.parser_subtasks = getRateParserSubtasks(result);
    return result;
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
        official_exact: 100
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
        ai_compute: 1,
        semiconductor: 2,
        optical_module: 3,
        router: 4,
        smartphone: 5,
        battery: 6,
        ev_charger: 7,
        solar: 8,
        industrial_automation: 9,
        drone: 10,
        surveillance_imaging: 11,
        tablet: 12,
        monitor: 13
    };
    const upgradeQueue = results
        .filter(result => !['official_exact', 'official_duty_tax_estimate'].includes(result.source_trust))
        .map(result => ({
            id: result.id,
            product_id: result.product_id,
            route: result.route,
            origin_country: result.origin_country,
            import_country: result.import_country,
            hs_code: result.hs_code,
            source_trust: result.source_trust,
            automation_level: result.automation_level,
            exact_base_rate_covered: result.exact_base_rate_covered,
            estimated_total_rate: result.total_rate,
            impact_score: result.impact_score || 0,
            priority: trustRank[result.source_trust] || 80,
            priority_band: result.priority_band,
            market_priority: marketRank[result.import_country] || 99,
            product_priority: productRank[result.product_id] || 99,
            parser_target: result.parser_target,
            next_action: result.next_action,
            why_priority: result.why_priority,
            rate_change_drivers: result.rate_change_drivers,
            scope_components: result.scope_components,
            parser_subtasks: result.parser_subtasks,
            us_backlog_focus: result.us_backlog_focus
        }))
        .sort((a, b) => (
            a.priority - b.priority
            || b.impact_score - a.impact_score
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
            || result.source_trust === 'official_exact'
            || result.source_trust === 'official_heading_only'
            || result.source_trust === 'official_link_estimate'
        )).length,
        exact_base_rate_covered_count: results.filter(result => result.exact_base_rate_covered).length,
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
    const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
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
    const maintenancePriorityGroups = rows.reduce((groups, source) => {
        const band = source.maintenance_priority || 'Unassigned';
        groups[band] ||= [];
        groups[band].push({
            country: source.country,
            source_status: source.source_status,
            machine_readable: source.machine_readable,
            updater_script: source.updater_script || '',
            update_command: source.update_command || '',
            next_action: source.next_action || ''
        });
        return groups;
    }, {});
    Object.values(maintenancePriorityGroups).forEach((group) => {
        group.sort((a, b) => String(a.country || '').localeCompare(String(b.country || '')));
    });
    const nextSourcePriorities = rows
        .filter(source => source.maintenance_priority && source.maintenance_priority !== 'P3')
        .sort((a, b) => (
            (priorityRank[a.maintenance_priority] ?? 9) - (priorityRank[b.maintenance_priority] ?? 9)
            || String(a.country || '').localeCompare(String(b.country || ''))
        ))
        .slice(0, 12)
        .map(source => ({
            country: source.country,
            maintenance_priority: source.maintenance_priority,
            source_status: source.source_status,
            updater_script: source.updater_script || '',
            update_command: source.update_command || '',
            next_action: source.next_action || ''
        }));
    const automationBacklog = rows
        .map((source) => {
            const stage = dutyAutomationStage(source);
            const covered = coveredCountries.has(source.country);
            let workstream = 'parser';
            if (stage.rate_automation_stage === 'official_hybrid_parser') {
                workstream = 'exact-code parser';
            } else if (stage.rate_automation_stage === 'official_probe_candidate') {
                workstream = 'official probe promotion';
            } else if (stage.rate_automation_stage === 'maintained_exact_map') {
                workstream = 'machine-readable source connector';
            } else if (stage.rate_automation_stage === 'official_link_monitor') {
                workstream = 'official-link parser discovery';
            } else if (stage.rate_automation_stage === 'official_machine_sync') {
                workstream = 'monitor';
            }
            return {
                country: source.country,
                maintenance_priority: source.maintenance_priority || 'Unassigned',
                rate_automation_stage: stage.rate_automation_stage,
                workstream,
                parser_gap: Boolean(stage.parser_gap),
                covered_by_rules: covered,
                public_claim: stage.public_claim,
                update_command: source.update_command || '',
                probe_command: source.probe_command || '',
                next_action: stage.parser_gap
                    ? stage.next_upgrade
                    : 'Keep official machine-readable sync running and monitor upstream schema changes.'
            };
        })
        .filter(row => row.parser_gap)
        .sort((a, b) => (
            (priorityRank[a.maintenance_priority] ?? 9) - (priorityRank[b.maintenance_priority] ?? 9)
            || (a.parser_gap === b.parser_gap ? 0 : a.parser_gap ? -1 : 1)
            || String(a.country || '').localeCompare(String(b.country || ''))
        ));

    return {
        source_count: rows.length,
        status_counts: statusCounts,
        maintenance_priority_groups: maintenancePriorityGroups,
        next_source_priorities: nextSourcePriorities,
        automation_backlog: automationBacklog,
        automation_backlog_summary: {
            parser_gap_count: automationBacklog.filter(row => row.parser_gap).length,
            filing_grade_auto_count: rows
                .filter(source => dutyAutomationStage(source).rate_automation_stage === 'official_machine_sync')
                .length,
            workstreams: automationBacklog.reduce((acc, row) => {
                acc[row.workstream] = (acc[row.workstream] || 0) + 1;
                return acc;
            }, {})
        },
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
    priorityMatrix = {},
    exactRateProgress = {}
} = {}) {
    const exceptions = Array.isArray(syncStatus.exceptions) ? syncStatus.exceptions : [];
    const upgradeQueue = Array.isArray(priorityMatrix.priority_upgrade_queue) ? priorityMatrix.priority_upgrade_queue : [];
    const ruleScopeBacklog = Array.isArray(exactRateProgress.rule_scope_backlog_rows)
        ? exactRateProgress.rule_scope_backlog_rows
        : [];
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
            reason: item.why_priority || `${item.source_trust || 'unknown'} coverage; ${item.parser_target || 'parser target pending'}.`,
            next_action: item.next_action || 'Connect exact tariff-line parser or official source mapping.',
            details: item
        });
    });

    ruleScopeBacklog.slice(0, 50).forEach((item) => {
        rows.push({
            id: item.id,
            source: item.parser_target || 'rule-scope-backlog',
            country: item.import_country || item.market || '',
            route: item.route || '',
            hs_code: item.hs_code || '',
            severity: item.priority_band === 'P1' ? 'high' : item.priority_band === 'P2' ? 'medium' : 'low',
            type: 'rule_scope_backlog',
            reason: item.why_priority || 'Maintained duty rule still requires exact tariff-line scope.',
            next_action: item.next_action || 'Add exact-code override or official parser support for this maintained rule.',
            details: item
        });
    });

    return rows;
}

function buildRuleScopeBacklog(dutyPayload = {}) {
    const rules = Array.isArray(dutyPayload?.rules) ? dutyPayload.rules : [];
    const trustRank = {
        benchmark_source_checked: 1,
        official_link_checked: 2,
        scope_check_required: 3,
        indicative: 4
    };
    const countryRank = {
        US: 1,
        EU: 2,
        DE: 3,
        NL: 4,
        CN: 5,
        SG: 6,
        MX: 7,
        JP: 8,
        KR: 9,
        IN: 10,
        VN: 11,
        MY: 12,
        TW: 13,
        RU: 14
    };

    return rules
        .filter((rule) => rule.source_status && rule.source_status !== 'official_source_checked')
        .map((rule) => {
            const importCountry = String(rule.import_country || '').toUpperCase();
            const originCountry = String(rule.origin_country || '*').toUpperCase();
            const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes.map(String) : [];
            const hsCode = prefixes.join(' / ') || rule.source_hts || '';
            const exactOverrides = Array.isArray(rule.exact_code_overrides) ? rule.exact_code_overrides : [];
            const hasOverrides = exactOverrides.length > 0;
            const sourceStatus = rule.source_status || 'indicative';
            const route = `${originCountry || '*'}->${importCountry}`;
            const sourceTrust = sourceStatus === 'benchmark_source_checked' ? 'precheck_estimate' : 'official_heading_only';
            const drivers = [];

            if (sourceStatus === 'scope_check_required') {
                drivers.push('Broad HS prefix has multiple possible official tariff lines.');
            }
            if (sourceStatus === 'benchmark_source_checked') {
                drivers.push('Only benchmark coverage exists; exact official parser/source mapping is not attached.');
            }
            if (hasOverrides) {
                drivers.push('Some exact-code overrides already exist; remaining product scopes still need parser coverage.');
            }
            if (['EU', 'DE', 'NL'].includes(importCountry)) {
                drivers.push('TARIC exact 10-digit goods-code scope can change the final duty rate.');
            }
            if (importCountry === 'RU') {
                drivers.push('Russia/EAEU duty and sanctions scope should stay review-only until official machine-readable coverage is available.');
            }

            return {
                id: `rule-${rule.id}`,
                rule_id: rule.id,
                product_id: rule.label || '',
                market: importCountry,
                import_country: importCountry,
                origin_country: originCountry,
                route,
                hs_code: hsCode,
                source_trust: sourceTrust,
                source_status: sourceStatus,
                automation_level: sourceStatus === 'benchmark_source_checked' ? 'benchmark_auto' : 'hybrid_official',
                estimated_total_rate: Number(rule.base_rate || 0) + Number(rule.additional_rate || 0),
                impact_score: Math.round((Number(rule.base_rate || 0) + Number(rule.additional_rate || 0)) * 10000),
                priority: trustRank[sourceStatus] || 9,
                priority_band: sourceStatus === 'benchmark_source_checked' ? 'P1' : 'P2',
                market_priority: countryRank[importCountry] || 99,
                product_priority: prefixes.includes('8542') ? 1 : prefixes.includes('8517') ? 2 : prefixes.includes('8525') ? 3 : 9,
                parser_target: sourceStatus === 'benchmark_source_checked'
                    ? `${importCountry} official tariff source mapping`
                    : `${importCountry} exact tariff-line scope resolver`,
                next_action: sourceStatus === 'benchmark_source_checked'
                    ? 'Replace benchmark coverage with official machine-readable tariff-line mapping before filing-grade use.'
                    : 'Add exact-code overrides or parser support for the maintained HS prefix before promoting this rule.',
                why_priority: `${route} ${hsCode} remains a rule-level exact-rate gap: ${rule.label || 'duty rule'} is ${sourceStatus}.`,
                rate_change_drivers: Array.from(new Set(drivers)),
                scope_components: getRuleScopeComponents({
                    rule,
                    route,
                    importCountry,
                    originCountry,
                    hsCode,
                    sourceStatus,
                    sourceTrust
                }),
                parser_scope: rule.source_note || rule.trade_remedy || 'Exact tariff-line scope is required before using a final rate.'
            };
        })
        .sort((a, b) => (
            a.priority - b.priority
            || a.market_priority - b.market_priority
            || a.product_priority - b.product_priority
            || b.impact_score - a.impact_score
            || a.id.localeCompare(b.id)
        ));
}

function buildExactRouteScopeBacklog(rows = []) {
    const exactScopeProducts = new Set([
        'ai_compute',
        'optical_module',
        'data_center_infrastructure'
    ]);
    const exactScopeMarkets = new Set(['EU', 'DE', 'NL']);
    const marketRank = { EU: 1, DE: 2, NL: 3 };
    const productRank = { ai_compute: 1, optical_module: 2, data_center_infrastructure: 3 };

    return rows
        .filter((row) => (
            exactScopeMarkets.has(row.import_country)
            && exactScopeProducts.has(row.product_id)
            && row.source_trust === 'official_duty_tax_estimate'
        ))
        .map((row) => {
            const route = row.route || `${row.origin_country || '?'}->${row.import_country || '?'}`;
            const isAiCompute = row.product_id === 'ai_compute';
            const isOptical = row.product_id === 'optical_module';
            const isDataCenter = row.product_id === 'data_center_infrastructure';
            const scopeComponents = Array.from(new Set([
                ...(row.scope_components || []),
                'taric_exact_code_scope',
                isAiCompute ? 'dual_use_end_use_scope' : '',
                isOptical ? 'telecom_security_scope' : '',
                isDataCenter ? 'electrical_safety_scope' : '',
                'ce_rohs_market_surveillance',
                'member_state_vat'
            ].filter(Boolean)));
            const rateDrivers = Array.from(new Set([
                ...(row.rate_change_drivers || []),
                'Exact TARIC goods-code scope can change whether the official estimate is filing-grade.',
                isAiCompute ? 'AI server configuration, accelerator content, and end-use scope can change classification and control review.' : '',
                isOptical ? 'Optical-module speed, telecom/security function, and exact subheading can change certification and tariff evidence.' : '',
                isDataCenter ? 'Power/cooling function, installation use, CE safety, and RoHS evidence can change filing support.' : ''
            ].filter(Boolean)));

            return {
                id: `exact-route-${row.id}`,
                route_id: row.id,
                product_id: row.product_id,
                market: row.import_country,
                import_country: row.import_country,
                origin_country: row.origin_country,
                route,
                hs_code: row.hs_code,
                source_trust: row.source_trust,
                automation_level: row.automation_level,
                estimated_total_rate: row.total_rate,
                impact_score: row.impact_score || 0,
                priority: 5,
                priority_band: 'P2',
                market_priority: marketRank[row.import_country] || 99,
                product_priority: productRank[row.product_id] || 99,
                parser_target: `${row.import_country} exact TARIC route-scope parser`,
                next_action: `Add exact TARIC-code input and route-scope evidence checks for ${route} ${row.product_id} before treating this as filing-grade.`,
                why_priority: `${route} ${row.product_id} already has official duty/tax estimate coverage, but exact TARIC code, product scope, CE/RoHS, and member-state VAT evidence should be automated next.`,
                rate_change_drivers: rateDrivers,
                scope_components: scopeComponents,
                parser_scope: row.next_action || 'Confirm exact TARIC line, CE/RoHS evidence, product function, origin, and member-state VAT before filing.'
            };
        })
        .sort((a, b) => (
            a.market_priority - b.market_priority
            || a.product_priority - b.product_priority
            || String(a.route).localeCompare(String(b.route))
        ));
}

function buildExactRateProgress({
    priorityMatrix = {},
    sourceRoadmap = {},
    sourceQuality = [],
    dutyPayload = {}
} = {}) {
    const rows = Array.isArray(priorityMatrix.rows) ? priorityMatrix.rows : [];
    const sourceQualityByCountry = new Map((sourceQuality || []).map(row => [row.country, row]));
    const priorityMarkets = Array.from(new Set(rows.map(row => row.import_country).filter(Boolean))).sort();
    const exactTrust = new Set(['official_exact', 'official_duty_tax_estimate']);
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
        const backlog_rows = marketRows
            .filter(row => !exactTrust.has(row.source_trust))
            .map(row => ({
                id: row.id,
                product_id: row.product_id,
                hs_code: row.hs_code,
                source_trust: row.source_trust,
                automation_level: row.automation_level,
                estimated_total_rate: row.total_rate,
                impact_score: row.impact_score || 0,
                why_priority: row.why_priority || getRatePriorityReason(row),
                rate_change_drivers: row.rate_change_drivers || getRateChangeDrivers(row),
                us_backlog_focus: row.us_backlog_focus || getUsBacklogFocus(row),
                next_action: row.next_action || getRateNextAction(row)
            }))
            .slice(0, 6);
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
            backlog_rows,
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
    const trustBacklogRank = {
        precheck_estimate: 1,
        official_link_estimate: 2,
        official_heading_only: 3,
        mixed_official_estimate: 4
    };
    const ruleScopeBacklogRows = buildRuleScopeBacklog(dutyPayload);
    const exactRouteScopeRows = buildExactRouteScopeBacklog(rows);
    const matrixBacklogRows = marketRows
        .flatMap(row => (row.backlog_rows || []).map(item => ({
            ...item,
            market: row.market
        })));
    const topBacklogRows = matrixBacklogRows
        .concat(ruleScopeBacklogRows)
        .concat(exactRouteScopeRows)
        .sort((a, b) => (
            (trustBacklogRank[a.source_trust] || 9) - (trustBacklogRank[b.source_trust] || 9)
            || (b.impact_score || 0) - (a.impact_score || 0)
            || String(a.market || '').localeCompare(String(b.market || ''))
            || String(a.product_id || '').localeCompare(String(b.product_id || ''))
            || String(a.hs_code || '').localeCompare(String(b.hs_code || ''))
        ))
        .slice(0, 12);

    return {
        totals,
        roadmap_status: roadmapStatus,
        top_backlog_rows: topBacklogRows,
        rule_scope_backlog_rows: ruleScopeBacklogRows,
        exact_route_scope_rows: exactRouteScopeRows,
        rows: marketRows
    };
}

function buildDutyRateBusinessSummary({
    syncStatus = {},
    priorityMatrix = {},
    exactRateProgress = {}
} = {}) {
    const counts = syncStatus.counts || {};
    const exceptions = Array.isArray(syncStatus.exceptions) ? syncStatus.exceptions : [];
    const rateChanges = Number(counts.total_rate_changes || 0);
    const totalChanges = Number(counts.total_changes || 0);
    const topPriorities = Array.isArray(exactRateProgress.top_backlog_rows)
        ? exactRateProgress.top_backlog_rows.slice(0, 5)
        : [];
    const upgradeQueue = Array.isArray(priorityMatrix.priority_upgrade_queue)
        ? priorityMatrix.priority_upgrade_queue
        : [];
    const usBacklog = upgradeQueue
        .filter(row => row.import_country === 'US')
        .slice(0, 6);

    const syncConclusion = exceptions.length
        ? `${exceptions.length} duty-rate sync exception(s) need attention; normal sources do not need manual review.`
        : rateChanges > 0
            ? `${rateChanges} material rate change(s) were detected; review affected routes before quoting or filing.`
            : totalChanges > 0
                ? `${totalChanges} source update(s) were applied, with no material duty-rate change detected.`
                : 'No material duty-rate change detected in the latest sync.';

    const firstPriority = topPriorities[0];
    const priorityConclusion = firstPriority
        ? `Highest priority: ${firstPriority.market || firstPriority.import_country || ''} ${firstPriority.product_id || ''} HS ${firstPriority.hs_code || ''}. ${firstPriority.why_priority || firstPriority.next_action || ''}`
        : 'No exact-rate backlog is currently blocking high-frequency routes.';

    const nextActions = [];
    if (exceptions.length) {
        nextActions.push('Review sync exceptions first; safe sources are already auto-applied.');
    }
    if (usBacklog.length) {
        nextActions.push('Finish US exact duty work by product: solar AD/CVD scope first, then Section 301/exclusion checks for battery and 8517 electronics.');
    }
    if (topPriorities.length) {
        nextActions.push('Use the top rate-priority rows below as the daily parser/backlog queue.');
    }
    if (!nextActions.length) {
        nextActions.push('Keep daily sync running and monitor material-rate-change alerts.');
    }

    return {
        status: exceptions.length ? 'review_required' : rateChanges > 0 ? 'rate_changed' : 'stable',
        sync_conclusion: syncConclusion,
        priority_conclusion: priorityConclusion,
        business_impact: rateChanges > 0
            ? 'Potential quote, landed-cost, or post-entry correction impact.'
            : exceptions.length
                ? 'Operational exception only; check listed source before relying on affected route.'
                : 'No immediate quote or filing impact detected from the latest sync.',
        next_actions: nextActions,
        top_priorities: topPriorities.map(row => ({
            market: row.market || row.import_country || '',
            product_id: row.product_id || '',
            hs_code: row.hs_code || '',
            impact_score: row.impact_score || 0,
            estimated_total_rate: row.estimated_total_rate,
            why_priority: row.why_priority || '',
            rate_change_drivers: row.rate_change_drivers || [],
            next_action: row.next_action || '',
            us_backlog_focus: row.us_backlog_focus || ''
        })),
        us_backlog: usBacklog.map(row => ({
            id: row.id,
            product_id: row.product_id,
            hs_code: row.hs_code,
            estimated_total_rate: row.estimated_total_rate,
            priority_band: row.priority_band,
            why_priority: row.why_priority,
            rate_change_drivers: row.rate_change_drivers,
            us_backlog_focus: row.us_backlog_focus
        }))
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
        sourceQuality: sourceQualitySummary,
        dutyPayload
    });
    const businessSummary = buildDutyRateBusinessSummary({
        syncStatus,
        priorityMatrix: priorityRateMatrix,
        exactRateProgress
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
        business_summary: businessSummary,
        action_details: buildDutyRateActionDetails({
            healthFailures: failures,
            syncStatus,
            priorityMatrix: priorityRateMatrix,
            exactRateProgress
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
    buildRuleScopeBacklog,
    buildExactRateProgress,
    buildDutyRateBusinessSummary,
    summarizeSourceRoadmap
};
