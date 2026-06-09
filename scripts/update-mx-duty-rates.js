#!/usr/bin/env node
/**
 * Refresh maintained Mexico TIGIE/VAT benchmark metadata.
 *
 * This updater is deliberately conservative: it keeps the local Mexico
 * benchmark explicit until a verified machine-readable TIGIE/SNICE parser is
 * added. It does not claim official live rates.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const MX_SNICE_URL = 'https://www.snice.gob.mx/';

const MX_BENCHMARK = {
    base_rate: 0,
    vat_rate: 0.16,
    source_hts: 'MX electronics benchmark',
    source_rate_text: 'Benchmark: VAT 16%; IGI depends on TIGIE tariff line',
    source_note: 'Mexico benchmark refreshed locally. Verify exact TIGIE tariff line, VAT base, NOM scope, and preferential origin before filing.'
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function getSource(country) {
    const payload = readJson(SOURCES_PATH);
    return (payload.sources || []).find(source => source.country === country) || null;
}

function getMexicoDutyRules(payload = readJson(DUTY_RATES_PATH)) {
    return (payload.rules || []).filter(rule => rule.import_country === 'MX');
}

function probeMexicoReadiness() {
    const source = getSource('MX');
    const rules = getMexicoDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'MX',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || MX_SNICE_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        next_action: source?.next_action || 'Add Mexico source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function refreshVatLayer(rule) {
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    const vatLayer = layers.find(layer => /import_vat/i.test(layer.type || ''));
    if (vatLayer) {
        vatLayer.rate = MX_BENCHMARK.vat_rate;
        vatLayer.status = 'indicative';
    }
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyMexicoBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== MX_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: MX_BENCHMARK.base_rate });
        rule.base_rate = MX_BENCHMARK.base_rate;
    }
    refreshVatLayer(rule);

    const updates = {
        source_status: 'benchmark_source_checked',
        confidence: 'Indicative',
        source_note: MX_BENCHMARK.source_note,
        source_hts: MX_BENCHMARK.source_hts,
        source_rate_text: MX_BENCHMARK.source_rate_text,
        source_url: MX_SNICE_URL,
        last_checked_at: checkedAt
    };
    Object.entries(updates).forEach(([field, value]) => {
        if (rule[field] !== value) {
            changes.push({ field, old_value: rule[field], new_value: value });
            rule[field] = value;
        }
    });
    return changes;
}

function updateMexicoRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'MX') continue;
        try {
            const ruleChanges = applyMexicoBenchmarkToRule(rule, checkedAt);
            if (ruleChanges.length) {
                changes.push({
                    rule: rule.id,
                    import_country: rule.import_country,
                    changes: ruleChanges
                });
            }
        } catch (error) {
            errors.push({ rule: rule.id, error: error.message });
        }
    }

    payload.updated_at = checkedAt.slice(0, 10);
    payload.last_mx_snice_benchmark_sync_at = checkedAt;
    payload.last_mx_snice_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: false,
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_mx_snice_benchmark_sync;
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const result = probeOnly ? probeMexicoReadiness() : updateMexicoRules({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    MX_BENCHMARK,
    probeMexicoReadiness,
    updateMexicoRules,
    applyMexicoBenchmarkToRule
};
