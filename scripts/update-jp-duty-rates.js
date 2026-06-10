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
const REQUEST_TIMEOUT_MS = 15000;

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

function fetchText(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
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

function toAbsoluteUrl(href, baseUrl = JP_CUSTOMS_URL) {
    try {
        return new URL(href, baseUrl).toString();
    } catch (error) {
        return href;
    }
}

function stripHtml(value = '') {
    return String(value)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseJapanTariffScheduleHtml(html = '', { baseUrl = JP_CUSTOMS_URL } = {}) {
    const scheduleLinks = [];
    const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        const label = stripHtml(match[2]);
        if (!/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(label)) {
            continue;
        }
        scheduleLinks.push({
            label,
            url: toAbsoluteUrl(match[1], baseUrl)
        });
    }
    const latest = scheduleLinks[0] || null;
    return {
        ok: /Japan'?s Tariff Schedule/i.test(html) && Boolean(latest),
        latest_schedule_date: latest?.label || '',
        latest_schedule_url: latest?.url || '',
        schedule_count: scheduleLinks.length,
        machine_parser_ready: false,
        parser_note: latest
            ? 'Japan Customs tariff schedule index is reachable; exact chapter/rate parsing is not auto-applied yet.'
            : 'Japan Customs tariff schedule index did not expose a dated schedule link.'
    };
}

function parseJapanScheduleChapterLinks(html = '', { baseUrl = JP_CUSTOMS_URL } = {}) {
    const chapters = [];
    const linkPattern = /<a\b[^>]*href=["']([^"']*data\/e_(\d{2})\.htm)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        chapters.push({
            chapter: match[2],
            label: stripHtml(match[3]) || `Chapter ${match[2]}`,
            url: toAbsoluteUrl(match[1], baseUrl)
        });
    }
    return chapters;
}

function normalizeHsCode(value = '') {
    return String(value).replace(/\D/g, '');
}

function parseJapanAdValoremRate(rateText = '') {
    const normalized = stripHtml(rateText);
    if (!normalized) {
        return null;
    }
    if (/^free$/i.test(normalized) || /^\(free\)$/i.test(normalized)) {
        return 0;
    }
    const percent = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percent) {
        return Number(percent[1]) / 100;
    }
    return null;
}

function parseJapanTariffChapterRows(html = '') {
    const rows = [];
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
        const cellPattern = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(match[1])) !== null) {
            cells.push(stripHtml(cellMatch[1]));
        }
        const heading = cells[0] || '';
        const normalizedHeading = normalizeHsCode(heading);
        if (!/^\d{4,}/.test(normalizedHeading) || cells.length < 4) {
            continue;
        }
        const generalRateText = cells[3] || '';
        rows.push({
            hs_heading: heading,
            hs_digits: normalizedHeading,
            statistical_code: cells[1] || '',
            item_name: cells[2] || '',
            general_rate_text: generalRateText,
            parsed_base_rate: parseJapanAdValoremRate(generalRateText)
        });
    }
    return rows;
}

function buildJapanOfficialRateCandidate(chapterRows = [], prefix = '') {
    const normalizedPrefix = normalizeHsCode(prefix);
    const matches = chapterRows.filter(row => row.hs_digits.startsWith(normalizedPrefix));
    const rateRows = matches.filter(row => row.general_rate_text);
    if (!normalizedPrefix || !rateRows.length) {
        return {
            ok: false,
            hs_prefix: prefix,
            status: 'not_found',
            reason: 'No Japan tariff rate rows matched this maintained HS prefix.',
            match_count: matches.length,
            rate_row_count: 0
        };
    }
    const parsedRates = rateRows
        .map(row => row.parsed_base_rate)
        .filter(rate => Number.isFinite(rate));
    const uniqueRates = Array.from(new Set(parsedRates)).sort((a, b) => a - b);
    return {
        ok: uniqueRates.length === 1 && parsedRates.length === rateRows.length,
        hs_prefix: prefix,
        status: uniqueRates.length === 1 && parsedRates.length === rateRows.length ? 'official_source_candidate' : 'scope_check_required',
        base_rate: uniqueRates.length === 1 ? uniqueRates[0] : null,
        unique_base_rates: uniqueRates,
        match_count: matches.length,
        rate_row_count: rateRows.length,
        sample_rows: rateRows.slice(0, 5).map(row => ({
            hs_heading: row.hs_heading,
            item_name: row.item_name,
            general_rate_text: row.general_rate_text
        })),
        reason: uniqueRates.length === 1 && parsedRates.length === rateRows.length
            ? 'Japan tariff chapter rows under this prefix share one parseable general rate.'
            : 'Japan tariff rows under this prefix require exact statistical code / rate-scope review.'
    };
}

async function probeJapanOfficialSource({ fetcher = fetchText, maintainedPrefixes = [] } = {}) {
    try {
        const response = await fetcher(JP_CUSTOMS_URL);
        const parsed = parseJapanTariffScheduleHtml(response.body || '');
        let chapter_links = [];
        let prefix_candidates = [];
        if (parsed.ok && parsed.latest_schedule_url && maintainedPrefixes.length) {
            const scheduleResponse = await fetcher(parsed.latest_schedule_url);
            chapter_links = parseJapanScheduleChapterLinks(scheduleResponse.body || '', {
                baseUrl: parsed.latest_schedule_url
            });
            const chapterMap = new Map(chapter_links.map(link => [link.chapter, link]));
            const rowsByChapter = new Map();
            for (const prefix of maintainedPrefixes) {
                const chapter = String(prefix || '').slice(0, 2);
                const chapterLink = chapterMap.get(chapter);
                if (!chapterLink) {
                    prefix_candidates.push({
                        ok: false,
                        hs_prefix: prefix,
                        status: 'chapter_not_found',
                        reason: `No Japan schedule chapter link found for chapter ${chapter}.`,
                        match_count: 0
                    });
                    continue;
                }
                if (!rowsByChapter.has(chapter)) {
                    const chapterResponse = await fetcher(chapterLink.url);
                    rowsByChapter.set(chapter, parseJapanTariffChapterRows(chapterResponse.body || ''));
                }
                prefix_candidates.push(buildJapanOfficialRateCandidate(rowsByChapter.get(chapter), prefix));
            }
        }
        return {
            checked: true,
            ok: response.status_code >= 200 && response.status_code < 400 && parsed.ok,
            status_code: response.status_code,
            official_url: JP_CUSTOMS_URL,
            ...parsed,
            chapter_links,
            prefix_candidates,
            machine_parser_ready: false,
            parser_note: prefix_candidates.length
                ? 'Japan schedule and chapter pages are parseable for candidate review; exact rates are not auto-applied yet.'
                : parsed.parser_note
        };
    } catch (error) {
        return {
            checked: true,
            ok: false,
            status_code: null,
            official_url: JP_CUSTOMS_URL,
            latest_schedule_date: '',
            latest_schedule_url: '',
            schedule_count: 0,
            chapter_links: [],
            prefix_candidates: [],
            machine_parser_ready: false,
            error: error.message
        };
    }
}

async function probeJapanReadiness({ live = false, fetcher = fetchText } = {}) {
    const source = getSource('JP');
    const rules = getJapanDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    const officialProbe = live
        ? await probeJapanOfficialSource({ fetcher, maintainedPrefixes: prefixes })
        : { checked: false, ok: null, machine_parser_ready: false };
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
        official_probe: officialProbe,
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

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const probeLive = process.argv.includes('--probe-live');
    const result = probeOnly || probeLive
        ? await probeJapanReadiness({ live: probeLive })
        : updateJapanRules({ dryRun });
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
    JP_BENCHMARK,
    JP_CUSTOMS_URL,
    parseJapanTariffScheduleHtml,
    parseJapanScheduleChapterLinks,
    parseJapanTariffChapterRows,
    parseJapanAdValoremRate,
    buildJapanOfficialRateCandidate,
    probeJapanOfficialSource,
    probeJapanReadiness,
    updateJapanRules,
    applyJapanBenchmarkToRule
};
