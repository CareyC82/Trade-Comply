#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function buildExactTariffHealth(payload, { now = new Date(), required = ['AU', 'NZ'] } = {}) {
    const results = new Map((payload.last_exact_national_tariff_sync?.results || []).map((row) => [row.country, row]));
    const checkedAt = new Date(payload.last_exact_national_tariff_sync?.checked_at || payload.last_exact_national_tariff_sync_at || '');
    const ageDays = Number.isNaN(checkedAt.getTime()) ? null : Math.floor((now.getTime() - checkedAt.getTime()) / 86400000);
    const markets = required.map((country) => {
        const result = results.get(country);
        const exactRows = new Set((payload.rules || [])
            .filter((rule) => rule.import_country === country)
            .flatMap((rule) => rule.exact_code_overrides || [])
            .map((row) => String(row.hs_code || '').replace(/\D/g, ''))
            .filter((code) => code.length === 8 || code.length === 10)).size;
        const minimum = country === 'AU' ? 100 : 150;
        const issues = [];
        if (!result || result.ok !== true || result.skipped) issues.push('latest official connector result is not successful');
        if (exactRows < minimum) issues.push(`only ${exactRows} exact rows are retained; expected at least ${minimum}`);
        return { country, ok: issues.length === 0, exact_rows: exactRows, latest_row_count: result?.row_count || 0, issues };
    });
    const issues = markets.flatMap((row) => row.issues.map((issue) => `${row.country}: ${issue}`));
    if (ageDays === null) issues.push('exact tariff sync timestamp is missing');
    else if (ageDays > 7) issues.push(`exact tariff sync is stale (${ageDays} days)`);
    return { ok: issues.length === 0, checked_at: Number.isNaN(checkedAt.getTime()) ? null : checkedAt.toISOString(), age_days: ageDays, markets, issues };
}

if (require.main === module) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'duty-rates.json'), 'utf8'));
    const health = buildExactTariffHealth(payload);
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.ok ? 0 : 1);
}

module.exports = { buildExactTariffHealth };
