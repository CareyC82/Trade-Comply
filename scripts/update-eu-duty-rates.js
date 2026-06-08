#!/usr/bin/env node
/**
 * Probe framework for EU TARIC duty-rate automation.
 *
 * This first pass intentionally does not write rates. TARIC automation needs a
 * stable mapping from the public source format to maintained HS prefixes, plus
 * member-state VAT separation. Keep it as a dry-run readiness probe until the
 * source parser is verified with real official payloads.
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

function getEuDutyRules() {
    const payload = readJson(DUTY_RATES_PATH);
    return (payload.rules || []).filter(rule => ['EU', 'DE', 'NL'].includes(rule.import_country));
}

function probeEuTaricReadiness() {
    const source = getSource('EU');
    const rules = getEuDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'EU',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || '',
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: false,
        next_action: source?.next_action || 'Add EU source roadmap before probing.'
    };
}

function main() {
    const result = probeEuTaricReadiness();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    probeEuTaricReadiness
};
