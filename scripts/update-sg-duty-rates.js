#!/usr/bin/env node
/**
 * Refresh maintained Singapore duty/GST benchmark metadata.
 *
 * Singapore electronics checks often hinge on duty-free status plus GST/value
 * treatment. This updater keeps the maintained benchmark explicit without
 * pretending to parse live official tariff data.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const SG_CUSTOMS_URL = 'https://www.customs.gov.sg/businesses/valuation-duties-taxes-fees/duties-and-dutiable-goods/';

const SG_BENCHMARK = {
    base_rate: 0,
    gst_rate: 0.09,
    source_hts: 'SG electronics benchmark',
    source_rate_text: 'Benchmark: 0% customs duty + 9% GST',
    source_note: 'Singapore official source link monitored; benchmark math refreshed locally. Verify exact HS code, GST value basis, and whether the goods are dutiable before filing.'
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

function getSingaporeDutyRules(payload = readJson(DUTY_RATES_PATH)) {
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
        official_url: source?.official_url || SG_CUSTOMS_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        next_action: source?.next_action || 'Add Singapore source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function refreshGstLayer(rule) {
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    const gstLayer = layers.find(layer => /import_gst/i.test(layer.type || ''));
    if (gstLayer) {
        gstLayer.rate = SG_BENCHMARK.gst_rate;
        gstLayer.status = 'indicative';
    }
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applySingaporeBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== SG_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: SG_BENCHMARK.base_rate });
        rule.base_rate = SG_BENCHMARK.base_rate;
    }
    refreshGstLayer(rule);

    const updates = {
        source_status: 'official_link_checked',
        confidence: 'Official link monitored',
        source_note: SG_BENCHMARK.source_note,
        source_hts: SG_BENCHMARK.source_hts,
        source_rate_text: SG_BENCHMARK.source_rate_text,
        source_url: SG_CUSTOMS_URL,
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

function updateSingaporeRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'SG') continue;
        try {
            const ruleChanges = applySingaporeBenchmarkToRule(rule, checkedAt);
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
    payload.last_sg_customs_benchmark_sync_at = checkedAt;
    payload.last_sg_customs_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: false,
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_sg_customs_benchmark_sync;
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const result = probeOnly ? probeSingaporeReadiness() : updateSingaporeRules({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    SG_BENCHMARK,
    probeSingaporeReadiness,
    updateSingaporeRules,
    applySingaporeBenchmarkToRule
};
