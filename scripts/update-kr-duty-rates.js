#!/usr/bin/env node
/**
 * Refresh maintained Korea tariff / VAT exact-line candidate metadata.
 *
 * This updater keeps maintained exact-line candidates explicit while VAT, KC
 * scope, and preferential origin remain separate review layers.
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
    source_hts: 'KR maintained exact-line candidates',
    source_rate_text: 'Exact-line candidates: 0% customs duty for maintained electronics; 10% VAT handled separately',
    source_note: 'Korea exact-line candidates are maintained for high-tech electronics; VAT, KC scope, and preferential-origin treatment are handled as separate checks. Verify final Korea 10-digit HS line before filing.'
};

const KR_EXACT_CODE_CANDIDATES = [
    '847130',
    '850440',
    '850760',
    '851713',
    '851762',
    '852852',
    '854143',
    '854231'
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

function parseKoreaAdValoremRate(value = '') {
    const text = stripHtml(value);
    if (!text || /free|免税|무세/i.test(text) || /^0(?:\.0+)?\s*%$/i.test(text)) return 0;
    const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
    return percent ? Number(percent[1]) / 100 : null;
}

function parseKoreaTariffRateRows(html = '') {
    const rowMatches = String(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];
    return rowMatches.map((rowHtml) => {
        const cells = (rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(stripHtml);
        const hsCode = cells.find(cell => /\b\d{6,10}\b/.test(cell))?.match(/\b\d{6,10}\b/)?.[0] || '';
        const rateCell = cells.find(cell => /free|무세|免税|\d+(?:\.\d+)?\s*%/i.test(cell)) || '';
        const parsedRate = parseKoreaAdValoremRate(rateCell);
        if (!hsCode || parsedRate === null) return null;
        return {
            hs_code: hsCode,
            hs_prefix: hsCode.slice(0, 6),
            item_name: cells.find(cell => cell !== hsCode && cell !== rateCell) || '',
            base_rate_text: rateCell,
            parsed_base_rate: parsedRate
        };
    }).filter(Boolean);
}

function parseKoreaTariffDbHtml(html = '') {
    const text = stripHtml(html);
    const hasTariffDb = /KCS\s*Tariff\s*D\/B/i.test(text);
    const hasHsLookup = hasTariffDb || /HS\s*Code|10\s*digits|Tariff\s*Item/i.test(text);
    const tariffRows = parseKoreaTariffRateRows(html);
    return {
        ok: hasTariffDb && hasHsLookup,
        lookup_title: hasTariffDb ? 'KCS Tariff D/B(Inquiry)' : '',
        supports_hs_lookup: hasHsLookup,
        machine_parser_ready: tariffRows.length > 0,
        parsed_rate_rows: tariffRows.length,
        parser_note: hasTariffDb
            ? tariffRows.length
                ? 'Korea Customs tariff rows were parsed into official candidates; exact promotion remains guarded by one-rate-per-prefix validation.'
                : 'Korea Customs tariff inquiry page is reachable; exact 10-digit tariff-line parsing is not auto-applied yet.'
            : 'Korea Customs tariff inquiry markers were not found.'
    };
}

async function fetchKoreaOfficialRows({ fetcher = fetchText, url = KR_TARIFF_DB_URL } = {}) {
    const response = await fetcher(url);
    const rows = parseKoreaTariffRateRows(response.body || '');
    return {
        ok: response.status_code >= 200 && response.status_code < 400 && rows.length > 0,
        status_code: response.status_code,
        official_url: url,
        rows,
        row_count: rows.length
    };
}

function buildKoreaOfficialRateCandidate(rows = [], hsPrefix = '') {
    const prefix = String(hsPrefix || '').replace(/\D/g, '');
    const matched = rows.filter(row => String(row.hs_code || row.hs_prefix || '').replace(/\D/g, '').startsWith(prefix));
    const rates = Array.from(new Set(matched
        .map(row => row.parsed_base_rate)
        .filter(rate => Number.isFinite(rate))
        .map(rate => Number(rate.toFixed(6)))))
        .sort((a, b) => a - b);

    if (!matched.length) {
        return {
            ok: false,
            source_status: 'official_link_checked',
            status: 'no_matching_rows',
            hs_prefix: prefix,
            matched_rows: 0,
            reason: `No Korea official tariff row matched ${prefix}.`
        };
    }
    if (rates.length === 1) {
        return {
            ok: true,
            source_status: 'official_source_checked',
            status: 'official_source_candidate',
            hs_prefix: prefix,
            matched_rows: matched.length,
            base_rate: rates[0],
            source_hts: `${prefix} (Korea Customs tariff candidate)`,
            source_rate_text: `Korea official tariff candidate: ${(rates[0] * 100).toFixed(3)}%`,
            source_url: KR_TARIFF_DB_URL
        };
    }
    return {
        ok: false,
        source_status: 'scope_check_required',
        status: 'multiple_rates_need_hs10',
        hs_prefix: prefix,
        matched_rows: matched.length,
        unique_base_rates: rates,
        reason: `${prefix} has multiple Korea official rates; exact 10-digit HS is required.`
    };
}

function buildKoreaOfficialCandidateForRule(rule, rows = []) {
    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes : [];
    const candidates = prefixes.map(prefix => buildKoreaOfficialRateCandidate(rows, prefix));
    const okCandidates = candidates.filter(candidate => candidate.ok);
    const scopeCandidates = candidates.filter(candidate => candidate.source_status === 'scope_check_required');
    const uniqueRates = Array.from(new Set(okCandidates.map(candidate => Number(candidate.base_rate.toFixed(6)))));

    if (okCandidates.length === prefixes.length && uniqueRates.length === 1) {
        return {
            ...okCandidates[0],
            candidates,
            source_hts: `${prefixes.join(', ')} (Korea Customs tariff candidate)`,
            source_rate_text: `Korea official tariff candidate: ${(uniqueRates[0] * 100).toFixed(3)}%`
        };
    }
    if (scopeCandidates.length || uniqueRates.length > 1) {
        return {
            ok: false,
            source_status: 'scope_check_required',
            status: 'exact_hs_required',
            candidates,
            reason: `${rule.id || 'rule'} needs exact Korea 10-digit HS before official duty can be used.`
        };
    }
    return {
        ok: false,
        source_status: 'official_link_checked',
        status: 'no_matching_rows',
        candidates,
        reason: `${rule.id || 'rule'} has no matched Korea official tariff rows.`
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
        live_row_count: officialProbe.parsed_rate_rows || 0,
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

function buildKoreaExactOverrides(checkedAt) {
    return KR_EXACT_CODE_CANDIDATES.map((code) => ({
        hs_code: code,
        base_rate: 0,
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: 'Korea maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; VAT and origin-preference scope remain separate checks.',
        source_hts: `${code} (KR maintained exact-line candidate)`,
        source_rate_text: 'Korea customs duty candidate: 0.000%',
        source_url: KR_CUSTOMS_URL,
        last_checked_at: checkedAt
    }));
}

function applyKoreaBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== KR_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: KR_BENCHMARK.base_rate });
        rule.base_rate = KR_BENCHMARK.base_rate;
    }
    refreshVatLayer(rule);

    const updates = {
        source_status: 'official_source_checked',
        confidence: 'Official duty + tax estimate',
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
    const exactOverrides = buildKoreaExactOverrides(checkedAt);
    if (JSON.stringify(rule.exact_code_overrides || []) !== JSON.stringify(exactOverrides)) {
        changes.push({ field: 'exact_code_overrides', old_value: rule.exact_code_overrides || [], new_value: exactOverrides });
        rule.exact_code_overrides = exactOverrides;
    }
    return changes;
}

function applyKoreaOfficialCandidateToRule(rule, candidate, checkedAt) {
    const changes = [];
    refreshVatLayer(rule);

    if (candidate.ok && Number(rule.base_rate) !== Number(candidate.base_rate)) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: candidate.base_rate });
        rule.base_rate = candidate.base_rate;
    }

    const updates = candidate.ok ? {
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: 'Korea Customs tariff candidate selected because maintained official rows produced one unambiguous base-duty rate. Verify exact 10-digit HS, VAT basis, KC scope, and origin preference before filing.',
        source_hts: candidate.source_hts,
        source_rate_text: candidate.source_rate_text,
        source_url: candidate.source_url || KR_TARIFF_DB_URL,
        last_checked_at: checkedAt
    } : candidate.source_status === 'scope_check_required' ? {
        source_status: 'scope_check_required',
        confidence: 'Scope check required',
        source_note: 'Korea official rows show that the exact 10-digit HS or product scope can change the duty result.',
        source_hts: `${(rule.hs_prefixes || []).join(', ')} (Korea Customs scope check required)`,
        source_rate_text: 'Exact Korea 10-digit HS required before using an official duty rate.',
        source_url: KR_TARIFF_DB_URL,
        last_checked_at: checkedAt
    } : {
        source_status: 'official_link_checked',
        confidence: 'Official link monitored',
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

function updateKoreaRules({ dryRun = false, officialRows = null } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];
    const officialOutcomes = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'KR') continue;
        try {
            const candidate = Array.isArray(officialRows)
                ? buildKoreaOfficialCandidateForRule(rule, officialRows)
                : null;
            if (candidate) {
                officialOutcomes.push({
                    rule: rule.id,
                    ok: candidate.ok,
                    status: candidate.status,
                    source_status: candidate.source_status,
                    reason: candidate.reason || ''
                });
            }
            const ruleChanges = candidate
                ? applyKoreaOfficialCandidateToRule(rule, candidate, checkedAt)
                : applyKoreaBenchmarkToRule(rule, checkedAt);
            if (ruleChanges.length) {
                changes.push({
                    rule: rule.id,
                    import_country: rule.import_country,
                    mode: candidate ? 'official-candidate' : 'benchmark',
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
        writes_official_machine_rates: Boolean(officialRows),
        changes,
        errors
    };
    if (officialRows) {
        payload.last_kr_customs_benchmark_sync.official_candidate_outcomes = officialOutcomes;
    }

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_kr_customs_benchmark_sync;
}

async function updateKoreaRulesFromOfficialSource({ dryRun = false, fetcher = fetchText } = {}) {
    let official;
    try {
        official = await fetchKoreaOfficialRows({ fetcher });
    } catch (error) {
        official = {
            ok: false,
            status_code: null,
            official_url: KR_TARIFF_DB_URL,
            rows: [],
            row_count: 0,
            error: error.message
        };
    }
    const degradedReason = official.ok
        ? ''
        : official.error
            ? 'official_fetch_failed'
            : official.status_code && official.status_code >= 400
                ? 'official_http_error'
                : 'official_source_returned_no_rate_rows';
    const result = updateKoreaRules({
        dryRun,
        officialRows: official.rows.length ? official.rows : null
    });
    result.official_fetch = {
        ok: official.ok,
        status_code: official.status_code,
        official_url: official.official_url,
        row_count: official.row_count,
        error: official.error || ''
    };
    result.official_fetch_degraded = !official.ok;
    result.official_fetch_degraded_reason = degradedReason;
    result.official_fetch_degraded_detail = official.error || (
        degradedReason === 'official_http_error'
            ? `HTTP ${official.status_code}`
            : 'Official source was reachable but no machine-readable tariff rows were parsed.'
    );
    result.writes_official_machine_rates = official.ok;
    return result;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const probeLive = process.argv.includes('--probe-live');
    const officialLive = process.argv.includes('--official-live');
    const result = probeOnly || probeLive
        ? await probeKoreaReadiness({ live: probeLive })
        : officialLive
            ? await updateKoreaRulesFromOfficialSource({ dryRun })
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
    KR_EXACT_CODE_CANDIDATES,
    parseKoreaTariffDbHtml,
    parseKoreaAdValoremRate,
    parseKoreaTariffRateRows,
    fetchKoreaOfficialRows,
    buildKoreaOfficialRateCandidate,
    buildKoreaOfficialCandidateForRule,
    applyKoreaOfficialCandidateToRule,
    probeKoreaOfficialSource,
    probeKoreaReadiness,
    updateKoreaRules,
    updateKoreaRulesFromOfficialSource,
    buildKoreaExactOverrides,
    applyKoreaBenchmarkToRule
};
