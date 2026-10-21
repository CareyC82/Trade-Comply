'use strict';

const DEFAULT_MARKETS = ['EU', 'US', 'SG', 'JP'];
const MARKET_LABELS = {
    EU: 'European Union',
    US: 'United States',
    SG: 'Singapore',
    JP: 'Japan'
};

function digits(value) {
    return String(value || '').replace(/\D/g, '');
}

function officialExactRows(rule = {}) {
    return (rule.exact_code_overrides || []).filter((row) => (
        digits(row.hs_code).length >= 8
        && String(row.source_status || '').toLowerCase() === 'official_source_checked'
        && /official exact .*line/i.test(String(row.confidence || ''))
    ));
}

function buildMarketCoverage(dutyPayload = {}, market, routeRows = [], { staleAfterDays = 7, now = new Date() } = {}) {
    const rules = (dutyPayload.rules || []).filter((rule) => rule.import_country === market);
    const prefixes = [...new Set(rules.flatMap((rule) => rule.hs_prefixes || []).map(digits).filter(Boolean))].sort();
    const exactRows = rules.flatMap(officialExactRows);
    const exactCodes = [...new Set(exactRows.map((row) => digits(row.hs_code)).filter(Boolean))].sort();
    const coveredPrefixes = prefixes.filter((prefix) => exactCodes.some((code) => code.startsWith(prefix) || prefix.startsWith(code)));
    const mixedPrefixes = prefixes.filter((prefix) => {
        const rates = new Set(exactRows
            .filter((row) => digits(row.hs_code).startsWith(prefix) || prefix.startsWith(digits(row.hs_code)))
            .map((row) => Number(row.base_rate))
            .filter(Number.isFinite));
        return rates.size > 1;
    });
    const checkedValues = rules.map((rule) => rule.last_checked_at).filter(Boolean).sort();
    const lastCheckedAt = checkedValues.at(-1) || null;
    const checkedDate = new Date(lastCheckedAt || '');
    const ageDays = Number.isNaN(checkedDate.getTime()) ? null : Math.max(0, Math.floor((now - checkedDate) / 86400000));
    const productRows = routeRows.filter((row) => row.import_country === market);
    const gaps = productRows.filter((row) => !row.exact_base_rate_covered);
    const sourceScopeRows = productRows.filter((row) => row.source_trust !== 'official_exact');

    return {
        market,
        label: MARKET_LABELS[market] || market,
        rule_count: rules.length,
        maintained_prefix_count: prefixes.length,
        covered_prefix_count: coveredPrefixes.length,
        exact_code_count: exactCodes.length,
        missing_prefixes: prefixes.filter((prefix) => !coveredPrefixes.includes(prefix)),
        mixed_rate_prefixes: mixedPrefixes,
        product_route_count: productRows.length,
        exact_product_route_count: productRows.length - gaps.length,
        product_route_gap_count: gaps.length,
        scope_review_route_count: sourceScopeRows.length,
        last_checked_at: lastCheckedAt,
        age_days: ageDays,
        stale: ageDays === null || ageDays > staleAfterDays,
        status: prefixes.length && coveredPrefixes.length === prefixes.length && ageDays !== null && ageDays <= staleAfterDays
            ? (mixedPrefixes.length || sourceScopeRows.length ? 'exact_with_scope_gates' : 'exact_ready')
            : 'coverage_gap',
        next_action: market === 'US'
            ? 'Keep HTS10 base duty separate from Section 301, AD/CVD, exclusions, and effective periods.'
            : market === 'SG'
                ? 'Monitor current Singapore 8-digit AHTN lines and retain GST as a separate import-tax layer.'
                : market === 'JP'
                    ? 'Monitor current Japan 9-digit statistical lines and keep preferential origin outside the base-rate result.'
                    : 'Require an exact TARIC line whenever a maintained prefix contains mixed rates.'
    };
}

function buildExactTariffCoverageReport({ dutyPayload = {}, priorityMatrix = {}, now = new Date(), staleAfterDays = 7, markets = DEFAULT_MARKETS } = {}) {
    const routeRows = Array.isArray(priorityMatrix.rows) ? priorityMatrix.rows : [];
    const marketRows = markets.map((market) => buildMarketCoverage(dutyPayload, market, routeRows, { now, staleAfterDays }));
    const productRows = routeRows
        .filter((row) => markets.includes(row.import_country))
        .map((row) => ({
            product_id: row.product_id,
            market: row.import_country,
            route: row.route,
            hs_code: row.hs_code,
            source_trust: row.source_trust,
            exact_base_rate_covered: Boolean(row.exact_base_rate_covered),
            parser_target: row.parser_target,
            next_action: row.next_action
        }));
    const gaps = productRows.filter((row) => !row.exact_base_rate_covered);
    return {
        schema_version: 1,
        generated_at: now.toISOString(),
        stale_after_days: staleAfterDays,
        ok: marketRows.every((row) => row.status !== 'coverage_gap'),
        summary: {
            market_count: marketRows.length,
            maintained_prefix_count: marketRows.reduce((sum, row) => sum + row.maintained_prefix_count, 0),
            covered_prefix_count: marketRows.reduce((sum, row) => sum + row.covered_prefix_count, 0),
            exact_code_count: marketRows.reduce((sum, row) => sum + row.exact_code_count, 0),
            product_route_count: productRows.length,
            product_route_gap_count: gaps.length
        },
        markets: marketRows,
        product_rows: productRows,
        gaps,
        rollout_order: ['US scope/add-on layers', 'Singapore exact-line monitoring', 'Japan exact-line monitoring']
    };
}

module.exports = { DEFAULT_MARKETS, buildMarketCoverage, buildExactTariffCoverageReport };
