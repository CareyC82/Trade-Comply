#!/usr/bin/env node
/**
 * Refresh maintained EU TARIC benchmark metadata for Post-Entry checks.
 *
 * This is intentionally conservative: it does not claim live TARIC parsing yet.
 * It keeps EU/DE/NL duty rules synchronized with a maintained benchmark table
 * and stamps clear source notes so the UI can distinguish this from official
 * machine-readable updates such as USITC.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const EU_TARIC_URL = 'https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en';

const EU_BENCHMARKS = {
    EU: {
        base_rate: 0.027,
        source_hts: '850440 benchmark',
        source_rate_text: 'Benchmark: 2.7% common customs duty; VAT depends on member state',
        source_note: 'EU TARIC benchmark metadata refreshed locally. Verify exact TARIC code, origin preference, and import VAT member state before filing.'
    },
    DE: {
        base_rate: 0.027,
        vat_rate: 0.19,
        source_hts: 'EU electronics benchmark / Germany VAT',
        source_rate_text: 'Benchmark: 2.7% EU duty + 19% Germany VAT',
        source_note: 'Germany benchmark refreshed from maintained EU duty + Germany VAT table. Verify exact TARIC code and VAT treatment.'
    },
    NL: {
        base_rate: 0.027,
        vat_rate: 0.21,
        source_hts: 'EU electronics benchmark / Netherlands VAT',
        source_rate_text: 'Benchmark: 2.7% EU duty + 21% Netherlands VAT',
        source_note: 'Netherlands benchmark refreshed from maintained EU duty + Netherlands VAT table. Verify exact TARIC code and VAT treatment.'
    }
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

function getEuDutyRules(payload = readJson(DUTY_RATES_PATH)) {
    return (payload.rules || []).filter(rule => Object.prototype.hasOwnProperty.call(EU_BENCHMARKS, rule.import_country));
}

function probeEuTaricReadiness() {
    const source = getSource('EU');
    const rules = getEuDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'EU',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || EU_TARIC_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        next_action: source?.next_action || 'Add EU source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function refreshVatLayer(rule, benchmark) {
    if (typeof benchmark.vat_rate !== 'number') {
        return;
    }
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    const vatLayer = layers.find(layer => /import_vat/i.test(layer.type || ''));
    if (vatLayer) {
        vatLayer.rate = benchmark.vat_rate;
        vatLayer.status = 'indicative';
    }
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyBenchmarkToRule(rule, benchmark, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== benchmark.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: benchmark.base_rate });
        rule.base_rate = benchmark.base_rate;
    }
    refreshVatLayer(rule, benchmark);

    const updates = {
        source_status: 'benchmark_source_checked',
        confidence: 'Indicative',
        source_note: benchmark.source_note,
        source_hts: benchmark.source_hts,
        source_rate_text: benchmark.source_rate_text,
        source_url: EU_TARIC_URL,
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

function updateEuRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];

    for (const rule of payload.rules || []) {
        const benchmark = EU_BENCHMARKS[rule.import_country];
        if (!benchmark) continue;
        try {
            const ruleChanges = applyBenchmarkToRule(rule, benchmark, checkedAt);
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
    payload.last_eu_taric_benchmark_sync_at = checkedAt;
    payload.last_eu_taric_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: false,
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_eu_taric_benchmark_sync;
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const result = probeOnly ? probeEuTaricReadiness() : updateEuRules({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    EU_BENCHMARKS,
    probeEuTaricReadiness,
    updateEuRules,
    applyBenchmarkToRule
};
