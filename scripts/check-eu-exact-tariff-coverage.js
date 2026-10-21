#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function normalizeCode(value) {
    return String(value || '').replace(/\D/g, '');
}

function buildEuExactCoverageHealth(payload, { now = new Date(), staleAfterDays = 7 } = {}) {
    const rules = (payload.rules || []).filter((rule) => ['EU', 'DE', 'NL'].includes(rule.import_country));
    const maintainedPrefixes = [...new Set(rules
        .flatMap((rule) => rule.hs_prefixes || [])
        .map(normalizeCode)
        .filter(Boolean))].sort();
    const exactCodes = [...new Set(rules
        .flatMap((rule) => rule.exact_code_overrides || [])
        .filter((row) => String(row.confidence || '').toLowerCase() === 'official exact tariff line')
        .map((row) => normalizeCode(row.hs_code))
        .filter((code) => code.length === 10))].sort();
    const missingPrefixes = maintainedPrefixes.filter((prefix) => !exactCodes.some((code) => code.startsWith(prefix)));
    const checkedValue = payload.last_eu_taric_benchmark_sync_at
        || rules.map((rule) => rule.last_checked_at).filter(Boolean).sort().at(-1)
        || '';
    const checkedAt = new Date(checkedValue);
    const ageDays = Number.isNaN(checkedAt.getTime())
        ? null
        : Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / 86400000));
    const issues = [];
    if (payload.last_eu_taric_benchmark_sync?.ok === false) issues.push('latest official EU TARIC sync is not successful');
    if (!maintainedPrefixes.length) issues.push('no maintained EU tariff prefixes are configured');
    if (missingPrefixes.length) issues.push(`missing official exact TARIC coverage for maintained prefix(es): ${missingPrefixes.join(', ')}`);
    if (ageDays === null) issues.push('EU TARIC sync timestamp is missing');
    else if (ageDays > staleAfterDays) issues.push(`EU TARIC exact coverage is stale (${ageDays} days)`);
    return {
        ok: issues.length === 0,
        checked_at: Number.isNaN(checkedAt.getTime()) ? null : checkedAt.toISOString(),
        age_days: ageDays,
        stale_after_days: staleAfterDays,
        maintained_prefix_count: maintainedPrefixes.length,
        covered_prefix_count: maintainedPrefixes.length - missingPrefixes.length,
        exact_code_count: exactCodes.length,
        missing_prefixes: missingPrefixes,
        issues
    };
}

if (require.main === module) {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/duty-rates.json'), 'utf8'));
    const health = buildEuExactCoverageHealth(payload);
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.ok ? 0 : 1);
}

module.exports = { buildEuExactCoverageHealth };
