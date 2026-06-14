#!/usr/bin/env node
/**
 * Refresh maintained benchmark metadata for countries where an official source
 * is identified but exact machine-readable tariff extraction is not wired yet.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DEFAULT_COUNTRIES = ['CN', 'VN', 'MY', 'TW', 'RU', 'IN'];

const COUNTRY_NOTES = {
    CN: 'China benchmark refreshed locally. Confirm exact customs tariff line, import VAT basis, origin preference, and any licensing condition before filing.',
    VN: 'Vietnam benchmark refreshed locally. Confirm exact tariff line, VAT basis, preferential origin, and MIC/MOIT product triggers before filing.',
    MY: 'Malaysia benchmark refreshed locally. Confirm exact tariff line, SST/duty exemption, and SIRIM/MCMC/ST approval scope before filing.',
    TW: 'Taiwan benchmark refreshed locally. Confirm exact customs duty, business tax basis, and tariff-line treatment before filing.',
    RU: 'Russia/EAEU benchmark refreshed locally. Confirm exact EAEU tariff line, VAT basis, sanctions, restricted-party, and licensing scope before filing.',
    IN: 'India official-link estimate refreshed locally. Confirm exact HS line, BCD, Social Welfare Surcharge, IGST, exemption, BIS/QCO, WPC, e-waste, and battery-rule scope before filing.'
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function getSource(country, sourcesPayload = readJson(SOURCES_PATH)) {
    return (sourcesPayload.sources || []).find(source => source.country === country) || null;
}

function getStaticBenchmarkRules(country, dutyPayload = readJson(DUTY_RATES_PATH)) {
    return (dutyPayload.rules || []).filter(rule => rule.import_country === country);
}

function getMaintainedPrefixes(rules = []) {
    return Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
}

function normalizeCountries(countries = DEFAULT_COUNTRIES) {
    return countries
        .map(country => String(country || '').trim().toUpperCase())
        .filter(Boolean);
}

function probeStaticBenchmarkReadiness(country, {
    sourcesPayload = readJson(SOURCES_PATH),
    dutyPayload = readJson(DUTY_RATES_PATH)
} = {}) {
    const code = String(country || '').toUpperCase();
    const source = getSource(code, sourcesPayload);
    const rules = getStaticBenchmarkRules(code, dutyPayload);
    const prefixes = getMaintainedPrefixes(rules);
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: code,
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || '',
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        next_action: source?.next_action || `Add ${code} source roadmap before updating.`,
        status_reason: source?.status_reason || ''
    };
}

function refreshLayerStatuses(rule) {
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    layers.forEach((layer) => {
        if (layer.rate === null || layer.status === 'flag_only') {
            layer.status = 'flag_only';
            return;
        }
        layer.status = 'indicative';
    });
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyStaticBenchmarkToRule(rule, { source, checkedAt }) {
    const changes = [];
    refreshLayerStatuses(rule);

    const country = rule.import_country;
    const updates = {
        source_status: 'benchmark_source_checked',
        confidence: 'Indicative',
        source_note: COUNTRY_NOTES[country] || `${country} benchmark refreshed locally. Confirm exact tariff-line treatment before filing.`,
        source_url: source?.official_url || rule.source_url || '',
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

function updateStaticBenchmarkRules({ countries = DEFAULT_COUNTRIES, dryRun = false } = {}) {
    const targetCountries = normalizeCountries(countries);
    const sourcesPayload = readJson(SOURCES_PATH);
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];
    const readiness = {};

    targetCountries.forEach((country) => {
        const source = getSource(country, sourcesPayload);
        const rules = getStaticBenchmarkRules(country, payload);
        readiness[country] = probeStaticBenchmarkReadiness(country, { sourcesPayload, dutyPayload: payload });

        if (!source) {
            errors.push({ country, error: 'Missing duty-rate source roadmap row.' });
            return;
        }
        if (!rules.length) {
            errors.push({ country, error: 'Missing maintained duty-rate rules.' });
            return;
        }

        rules.forEach((rule) => {
            try {
                const ruleChanges = applyStaticBenchmarkToRule(rule, { source, checkedAt });
                if (ruleChanges.length) {
                    changes.push({
                        rule: rule.id,
                        import_country: rule.import_country,
                        changes: ruleChanges
                    });
                }
            } catch (error) {
                errors.push({ rule: rule.id, import_country: country, error: error.message });
            }
        });
    });

    payload.updated_at = checkedAt.slice(0, 10);
    payload.last_static_benchmark_sync_at = checkedAt;
    payload.last_static_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        countries: targetCountries,
        writes_official_machine_rates: false,
        changes,
        errors,
        readiness
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_static_benchmark_sync;
}

function parseCountriesArg(argv = process.argv.slice(2)) {
    const countryArg = argv.find(arg => arg.startsWith('--countries='));
    if (!countryArg) return DEFAULT_COUNTRIES;
    return countryArg
        .replace(/^--countries=/, '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const countries = parseCountriesArg();
    const result = probeOnly
        ? countries.map(country => probeStaticBenchmarkReadiness(country))
        : updateStaticBenchmarkRules({ countries, dryRun });
    console.log(JSON.stringify(result, null, 2));
    const ok = Array.isArray(result) ? result.every(row => row.ok) : result.ok;
    process.exit(ok ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_COUNTRIES,
    COUNTRY_NOTES,
    applyStaticBenchmarkToRule,
    getMaintainedPrefixes,
    probeStaticBenchmarkReadiness,
    updateStaticBenchmarkRules
};
