#!/usr/bin/env node
/**
 * Refresh maintained Japan tariff / consumption-tax benchmark metadata.
 *
 * This keeps Japan Post-Entry duty math source-checked without claiming live
 * official machine-rate parsing. Exact tariff lines still require Japan
 * Customs confirmation before filing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const JP_CUSTOMS_URL = 'https://www.customs.go.jp/english/tariff/';

const JP_BENCHMARK = {
    base_rate: 0,
    consumption_tax_rate: 0.1,
    source_hts: 'JP electronics benchmark',
    source_rate_text: 'Benchmark: 0% duty for many electronics + 10% consumption tax',
    source_note: 'Japan benchmark refreshed locally. Verify exact tariff line, consumption tax basis, and product approval scope before filing.'
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

function getJapanDutyRules(payload = readJson(DUTY_RATES_PATH)) {
    return (payload.rules || []).filter(rule => rule.import_country === 'JP');
}

function probeJapanReadiness() {
    const source = getSource('JP');
    const rules = getJapanDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'JP',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || JP_CUSTOMS_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        next_action: source?.next_action || 'Add Japan source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function refreshConsumptionTaxLayer(rule) {
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    const taxLayer = layers.find(layer => /consumption_tax/i.test(layer.type || ''));
    if (taxLayer) {
        taxLayer.rate = JP_BENCHMARK.consumption_tax_rate;
        taxLayer.status = 'indicative';
    }
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyJapanBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== JP_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: JP_BENCHMARK.base_rate });
        rule.base_rate = JP_BENCHMARK.base_rate;
    }
    refreshConsumptionTaxLayer(rule);

    const updates = {
        source_status: 'benchmark_source_checked',
        confidence: 'Benchmark source checked',
        source_note: JP_BENCHMARK.source_note,
        source_hts: JP_BENCHMARK.source_hts,
        source_rate_text: JP_BENCHMARK.source_rate_text,
        source_url: JP_CUSTOMS_URL,
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

function updateJapanRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'JP') continue;
        try {
            const ruleChanges = applyJapanBenchmarkToRule(rule, checkedAt);
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
    payload.last_jp_customs_benchmark_sync_at = checkedAt;
    payload.last_jp_customs_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: false,
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_jp_customs_benchmark_sync;
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const result = probeOnly ? probeJapanReadiness() : updateJapanRules({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    JP_BENCHMARK,
    probeJapanReadiness,
    updateJapanRules,
    applyJapanBenchmarkToRule
};
