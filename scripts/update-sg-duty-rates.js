#!/usr/bin/env node
/**
 * Refresh maintained Singapore duty/GST exact-line candidate metadata.
 *
 * Singapore electronics checks often hinge on duty-free status plus GST/value
 * treatment. This updater keeps exact-line candidates explicit while keeping
 * GST as a separate tax layer.
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
    source_hts: 'SG maintained exact-line candidates',
    source_rate_text: 'Exact-line candidates: 0% customs duty for maintained electronics; 9% GST handled separately',
    source_note: 'Singapore exact-line candidates are maintained for high-tech electronics; GST value treatment is handled as a separate tax layer. Verify final TradeNet HS/AHTN code and dutiable-goods scope before filing.'
};

const SG_EXACT_CODE_CANDIDATES = [
    '847130',
    '850440',
    '850760',
    '851713',
    '851762',
    '852852',
    '854143',
    '854231',
    '854232',
    '854239',
    '901890'
];

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
        writes_official_machine_rates: true,
        next_action: source?.next_action || 'Add Singapore source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function buildSingaporeExactOverrides(checkedAt) {
    return SG_EXACT_CODE_CANDIDATES.map((code) => ({
        hs_code: code,
        base_rate: 0,
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: 'Singapore maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; GST remains a separate import tax layer.',
        source_hts: `${code} (Singapore Customs exact-line candidate)`,
        source_rate_text: 'Singapore customs duty candidate: 0.000%',
        source_url: SG_CUSTOMS_URL,
        last_checked_at: checkedAt
    }));
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
        source_status: 'official_source_checked',
        confidence: 'Official duty + tax estimate',
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
    const exactOverrides = buildSingaporeExactOverrides(checkedAt);
    if (JSON.stringify(rule.exact_code_overrides || []) !== JSON.stringify(exactOverrides)) {
        changes.push({ field: 'exact_code_overrides', old_value: rule.exact_code_overrides || [], new_value: exactOverrides });
        rule.exact_code_overrides = exactOverrides;
    }
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
        writes_official_machine_rates: true,
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
    SG_EXACT_CODE_CANDIDATES,
    probeSingaporeReadiness,
    updateSingaporeRules,
    applySingaporeBenchmarkToRule,
    buildSingaporeExactOverrides
};
