#!/usr/bin/env node
/**
 * Refresh maintained Korea tariff / VAT benchmark metadata.
 *
 * This updater is conservative: it keeps Korea import VAT and common
 * electronics duty assumptions source-checked while exact UNI-PASS tariff-line
 * parsing remains a future upgrade.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const KR_CUSTOMS_URL = 'https://www.customs.go.kr/english/main.do';
const KR_TARIFF_DB_URL = 'https://www.customs.go.kr/english/cm/cntnts/cntntsView.do?mi=10806&cntntsId=5502';
const REQUEST_TIMEOUT_MS = 15000;

const KR_BENCHMARK = {
    base_rate: 0,
    vat_rate: 0.1,
    source_hts: 'KR electronics benchmark',
    source_rate_text: 'Benchmark: 0% duty for many electronics + 10% VAT',
    source_note: 'Korea benchmark refreshed locally. Verify exact tariff line, VAT basis, KC scope, and origin preference before filing.'
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

function getKoreaDutyRules(payload = readJson(DUTY_RATES_PATH)) {
    return (payload.rules || []).filter(rule => rule.import_country === 'KR');
}

function fetchText(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    if (typeof fetch === 'function') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 TraceWize duty-rate updater (+https://tracewize.com)',
                'Accept': 'text/html,application/xhtml+xml'
            }
        })
            .then(async (response) => ({
                status_code: response.status,
                body: await response.text()
            }))
            .finally(() => clearTimeout(timer));
    }
    return new Promise((resolve, reject) => {
        const client = url.startsWith('http://') ? require('http') : require('https');
        const request = client.get(url, {
            headers: {
                'User-Agent': 'TraceWize duty-rate updater (+https://tracewize.com)'
            }
        }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({
                    status_code: response.statusCode,
                    body
                });
            });
        });
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        request.on('error', reject);
    });
}

function stripHtml(value = '') {
    return String(value)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseKoreaTariffDbHtml(html = '') {
    const text = stripHtml(html);
    const hasTariffDb = /KCS\s*Tariff\s*D\/B/i.test(text);
    const hasHsLookup = hasTariffDb || /HS\s*Code|10\s*digits|Tariff\s*Item/i.test(text);
    return {
        ok: hasTariffDb && hasHsLookup,
        lookup_title: hasTariffDb ? 'KCS Tariff D/B(Inquiry)' : '',
        supports_hs_lookup: hasHsLookup,
        machine_parser_ready: false,
        parser_note: hasTariffDb
            ? 'Korea Customs tariff inquiry page is reachable; exact 10-digit tariff-line parsing is not auto-applied yet.'
            : 'Korea Customs tariff inquiry markers were not found.'
    };
}

async function probeKoreaOfficialSource({ fetcher = fetchText } = {}) {
    try {
        const response = await fetcher(KR_TARIFF_DB_URL);
        const parsed = parseKoreaTariffDbHtml(response.body || '');
        return {
            checked: true,
            ok: response.status_code >= 200 && response.status_code < 400 && parsed.ok,
            status_code: response.status_code,
            official_url: KR_TARIFF_DB_URL,
            ...parsed
        };
    } catch (error) {
        return {
            checked: true,
            ok: false,
            status_code: null,
            official_url: KR_TARIFF_DB_URL,
            lookup_title: '',
            supports_hs_lookup: false,
            machine_parser_ready: false,
            error: error.message
        };
    }
}

async function probeKoreaReadiness({ live = false, fetcher = fetchText } = {}) {
    const source = getSource('KR');
    const rules = getKoreaDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    const officialProbe = live
        ? await probeKoreaOfficialSource({ fetcher })
        : { checked: false, ok: null, machine_parser_ready: false };
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'KR',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || KR_TARIFF_DB_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        official_probe: officialProbe,
        next_action: source?.next_action || 'Add Korea source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function refreshVatLayer(rule) {
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    const vatLayer = layers.find(layer => /import_vat/i.test(layer.type || ''));
    if (vatLayer) {
        vatLayer.rate = KR_BENCHMARK.vat_rate;
        vatLayer.status = 'indicative';
    }
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyKoreaBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== KR_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: KR_BENCHMARK.base_rate });
        rule.base_rate = KR_BENCHMARK.base_rate;
    }
    refreshVatLayer(rule);

    const updates = {
        source_status: 'benchmark_source_checked',
        confidence: 'Benchmark source checked',
        source_note: KR_BENCHMARK.source_note,
        source_hts: KR_BENCHMARK.source_hts,
        source_rate_text: KR_BENCHMARK.source_rate_text,
        source_url: KR_CUSTOMS_URL,
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

function updateKoreaRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'KR') continue;
        try {
            const ruleChanges = applyKoreaBenchmarkToRule(rule, checkedAt);
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
    payload.last_kr_customs_benchmark_sync_at = checkedAt;
    payload.last_kr_customs_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: false,
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_kr_customs_benchmark_sync;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const probeLive = process.argv.includes('--probe-live');
    const result = probeOnly || probeLive
        ? await probeKoreaReadiness({ live: probeLive })
        : updateKoreaRules({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    KR_BENCHMARK,
    KR_CUSTOMS_URL,
    KR_TARIFF_DB_URL,
    parseKoreaTariffDbHtml,
    probeKoreaOfficialSource,
    probeKoreaReadiness,
    updateKoreaRules,
    applyKoreaBenchmarkToRule
};
