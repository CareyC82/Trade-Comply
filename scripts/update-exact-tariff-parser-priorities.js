#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    runDutyRateHealthCheck
} = require('./check-duty-rates');

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'exact-tariff-parser-priorities.json');

function buildParserScope(row = {}) {
    if (row.us_backlog_focus) {
        return row.us_backlog_focus;
    }
    if (row.source_trust === 'official_heading_only') {
        return 'Resolve the exact tariff line and product scope before promoting this route to official exact rate.';
    }
    if (row.source_trust === 'mixed_official_estimate') {
        return 'Separate official base duty from add-on duty, trade-remedy scope, exclusion period, and local tax layers before filing-grade use.';
    }
    return row.next_action || 'Connect official tariff source mapping before using this route beyond screening.';
}

function buildExactTariffParserPriorities({ generatedAt = new Date().toISOString() } = {}) {
    const health = runDutyRateHealthCheck();
    const priorities = (health.priority_rate_matrix?.priority_upgrade_queue || []).map((row) => ({
        id: row.id,
        route: row.route,
        product_id: row.product_id,
        import_country: row.import_country,
        origin_country: row.origin_country,
        hs_code: row.hs_code,
        source_trust: row.source_trust,
        parser_target: row.parser_target,
        next_action: row.next_action,
        priority_band: row.priority_band,
        impact_score: row.impact_score,
        why_priority: row.why_priority,
        rate_change_drivers: row.rate_change_drivers || [],
        parser_scope: buildParserScope(row)
    }));

    return {
        version: generatedAt.slice(0, 10),
        generated_at: generatedAt,
        scope: 'Exact tariff parser backlog for routes where official source coverage still needs tariff-line, add-on duty, trade-remedy, exclusion, or case-scope resolution.',
        generated_from: 'scripts/check-duty-rates.js priority_rate_matrix.priority_upgrade_queue',
        priorities
    };
}

function main() {
    const payload = buildExactTariffParserPriorities();
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify({
        ok: true,
        output: path.relative(ROOT, OUTPUT_PATH),
        count: payload.priorities.length,
        ids: payload.priorities.map((row) => row.id)
    }, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    buildExactTariffParserPriorities
};
