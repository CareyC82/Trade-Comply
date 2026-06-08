#!/usr/bin/env node
/**
 * Probe framework for Singapore duty/GST automation.
 *
 * Singapore's electronics duty result is often about confirming duty-free status
 * and GST/value basis rather than parsing a large ad-valorem tariff table. This
 * probe verifies that the source roadmap and maintained HS prefixes are ready
 * before any future updater writes stored rates.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getSource(country) {
    const payload = readJson(SOURCES_PATH);
    return (payload.sources || []).find(source => source.country === country) || null;
}

function getSingaporeDutyRules() {
    const payload = readJson(DUTY_RATES_PATH);
    return (payload.rules || []).filter(rule => rule.import_country === 'SG');
}

function probeSingaporeReadiness() {
    const source = getSource('SG');
    const rules = getSingaporeDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'SG',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || '',
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: false,
        next_action: source?.next_action || 'Add Singapore source roadmap before probing.'
    };
}

function main() {
    const result = probeSingaporeReadiness();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    probeSingaporeReadiness
};
