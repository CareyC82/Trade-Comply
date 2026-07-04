#!/usr/bin/env node
'use strict';

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const { search } = require('../js/search');

const ROUTE_COUNTRIES = ['US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'JP', 'KR', 'IN', 'TW', 'RU', 'ASEAN'];
const PRODUCTS = [
    'gpu ai accelerator chip',
    'H200',
    'HBM3E high bandwidth memory',
    'NAND flash memory IC',
    'optical transceiver module',
    'solar panel photovoltaic',
    'lithium battery pack',
    'drone uav under 2kg',
    'ip camera network storage',
    'wireless router',
    'ev charger',
    'semiconductor lithography equipment',
    'industrial robot arm',
    'laboratory analyzer electronic diagnostic device'
];

function setupSearchState({ from, to, focus, country: selectedCountry }) {
    globalThis.AppState = {
        data: { tags, cases },
        currentDirection: 'export',
        currentCountry: selectedCountry,
        routeFromCountry: from,
        routeToCountry: to,
        complianceFocus: focus
    };
    globalThis.TradeComplyCountry = country;
    globalThis.TradeComplyMatchedResults = matchedResults;
}

function tagFocus(tag) {
    return tag?.route_focus || tag?.compliance_focus || '';
}

function summarizeRouteProduct({ market, focus, product }) {
    const selected = country.normalizeCountryCode(market);
    const route = focus === 'import'
        ? { from: selected === 'US' ? 'CN' : 'US', to: selected, focus, country: selected }
        : { from: selected, to: selected === 'US' ? 'CN' : 'US', focus, country: selected };
    setupSearchState(route);
    const result = search(product);
    const selectedRules = result.tags.filter((tag) => country.getEffectiveTagCountry(tag) === selected);
    const offRouteRules = result.tags.filter((tag) => {
        const effective = country.getEffectiveTagCountry(tag);
        return effective !== selected && effective !== 'GLOBAL';
    });
    const focusMismatchRules = result.tags.filter((tag) => {
        const focusValue = tagFocus(tag);
        return focusValue && focusValue !== focus;
    });
    const duplicateIds = [];
    const seen = new Set();
    result.tags.forEach((tag) => {
        if (!tag?.tag_id) return;
        if (seen.has(tag.tag_id)) duplicateIds.push(tag.tag_id);
        seen.add(tag.tag_id);
    });
    const failures = [];
    if (!result.tags.length) {
        failures.push('NO_MATCHED_RULES');
    }
    if (!selectedRules.length) {
        failures.push('NO_SELECTED_MARKET_RULE');
    }
    if (offRouteRules.length) {
        failures.push('OFF_ROUTE_RULES');
    }
    if (focusMismatchRules.length) {
        failures.push('FOCUS_MISMATCH');
    }
    if (duplicateIds.length) {
        failures.push('DUPLICATE_TAG_IDS');
    }

    return {
        market: selected,
        focus,
        route: `${route.from}->${route.to}`,
        product,
        matched_rules: result.tags.length,
        selected_market_rules: selectedRules.length,
        cases: result.cases.length,
        top_rules: result.tags.slice(0, 4).map((tag) => tag.tag_id),
        off_route_rules: offRouteRules.map((tag) => tag.tag_id),
        focus_mismatch_rules: focusMismatchRules.map((tag) => `${tag.tag_id}:${tagFocus(tag)}`),
        duplicate_tag_ids: duplicateIds,
        failures
    };
}

function runRouteCoverageMatrixCheck({
    markets = ROUTE_COUNTRIES,
    products = PRODUCTS
} = {}) {
    const rows = [];
    markets.forEach((market) => {
        products.forEach((product) => {
            rows.push(summarizeRouteProduct({ market, focus: 'import', product }));
            rows.push(summarizeRouteProduct({ market, focus: 'export', product }));
        });
    });

    const failures = rows.filter((row) => row.failures.length > 0);
    const focusSummary = rows.reduce((acc, row) => {
        const key = `${row.market}:${row.focus}`;
        acc[key] ||= {
            market: row.market,
            focus: row.focus,
            samples: 0,
            failed: 0,
            matched_rules: 0,
            selected_market_rules: 0
        };
        acc[key].samples += 1;
        acc[key].failed += row.failures.length ? 1 : 0;
        acc[key].matched_rules += row.matched_rules;
        acc[key].selected_market_rules += row.selected_market_rules;
        return acc;
    }, {});

    return {
        ok: failures.length === 0,
        generated_at: new Date().toISOString(),
        market_count: markets.length,
        product_count: products.length,
        sample_count: rows.length,
        failed_sample_count: failures.length,
        failure_types: failures.reduce((acc, row) => {
            row.failures.forEach((failure) => {
                acc[failure] = (acc[failure] || 0) + 1;
            });
            return acc;
        }, {}),
        focus_summary: Object.values(focusSummary).sort((a, b) => (
            a.market.localeCompare(b.market) || a.focus.localeCompare(b.focus)
        )),
        failures,
        rows
    };
}

function formatRouteCoverageReport(report) {
    const lines = [];
    lines.push('TraceWize Route Coverage Matrix');
    lines.push(`Markets: ${report.market_count} | Products: ${report.product_count} | Samples: ${report.sample_count}`);
    lines.push(`Failed samples: ${report.failed_sample_count}`);
    if (report.failed_sample_count) {
        lines.push('');
        report.failures.slice(0, 40).forEach((row) => {
            lines.push(`[FAIL] ${row.focus} ${row.route} ${row.product}: ${row.failures.join(', ')}`);
            lines.push(`  Top rules: ${row.top_rules.join(', ') || '-'}`);
        });
    }
    return lines.join('\n');
}

if (require.main === module) {
    const report = runRouteCoverageMatrixCheck();
    const wantsJson = process.argv.includes('--json');
    console.log(wantsJson ? JSON.stringify(report, null, 2) : formatRouteCoverageReport(report));
    process.exit(report.ok ? 0 : 1);
}

module.exports = {
    PRODUCTS,
    ROUTE_COUNTRIES,
    runRouteCoverageMatrixCheck,
    formatRouteCoverageReport
};
