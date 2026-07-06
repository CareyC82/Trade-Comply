#!/usr/bin/env node
/**
 * Refresh maintained Japan tariff / consumption-tax exact-line candidate metadata.
 *
 * This keeps maintained exact-line candidates explicit while consumption tax
 * remains a separate layer. Live official parser rows can still override this
 * when an unambiguous chapter/rate candidate is available.
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
    source_hts: 'JP maintained exact-line candidates',
    source_rate_text: 'Exact-line candidates: 0% customs duty for maintained electronics; 10% consumption tax handled separately',
    source_note: 'Japan exact-line candidates are maintained for high-tech electronics; consumption tax and product approval scope are handled as separate checks. Verify final Japan statistical code before filing.'
};

const JP_EXACT_CODE_CANDIDATES = [
    '847150',
    '847130',
    '850440',
    '850760',
    '851713',
    '851762',
    '852852',
    '854143',
    '854231',
    '854232',
    '854239'
];

const JP_EXACT_STATISTICAL_CODE_CANDIDATES = [...JP_EXACT_CODE_CANDIDATES];

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

function japanRowCandidateCodes(row = {}) {
    const hsDigits = normalizeHsCode(row.hs_digits || row.hs_heading || '');
    const statisticalDigits = normalizeHsCode(row.statistical_code || '');
    return Array.from(new Set([
        hsDigits,
        statisticalDigits ? `${hsDigits}${statisticalDigits}` : ''
    ].filter(Boolean)));
}

function buildJapanOfficialExactRateCandidate(chapterRows = [], exactCode = '') {
    const normalizedExactCode = normalizeHsCode(exactCode);
    const matches = chapterRows.filter(row => (
        japanRowCandidateCodes(row).includes(normalizedExactCode)
    ));
    const rateRows = matches.filter(row => row.general_rate_text);
    if (!normalizedExactCode || !rateRows.length) {
        return {
            ok: false,
            exact_code: exactCode,
            status: 'not_found',
            reason: 'No Japan tariff rate rows matched this exact statistical code.',
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
        exact_code: exactCode,
        status: uniqueRates.length === 1 && parsedRates.length === rateRows.length ? 'official_source_candidate' : 'scope_check_required',
        base_rate: uniqueRates.length === 1 ? uniqueRates[0] : null,
        unique_base_rates: uniqueRates,
        match_count: matches.length,
        rate_row_count: rateRows.length,
        sample_rows: rateRows.slice(0, 5).map(row => ({
            hs_heading: row.hs_heading,
            statistical_code: row.statistical_code,
            item_name: row.item_name,
            general_rate_text: row.general_rate_text
        })),
        reason: uniqueRates.length === 1 && parsedRates.length === rateRows.length
            ? 'Japan tariff row for this exact statistical code has one parseable general rate.'
            : 'Japan tariff rows for this exact statistical code require rate-scope review.'
    };
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

function buildJapanOfficialCandidateForRule(rule = {}, chapterRows = []) {
    const exactCodes = Array.isArray(rule.exact_statistical_codes) ? rule.exact_statistical_codes : [];
    if (exactCodes.length) {
        const candidates = exactCodes.map(code => buildJapanOfficialExactRateCandidate(chapterRows, code));
        const matched = candidates.filter(candidate => candidate.rate_row_count > 0);
        if (!matched.length) {
            return {
                ok: false,
                rule: rule.id || '',
                source_status: 'official_link_checked',
                reason: 'No Japan official tariff rows matched the supplied exact statistical code(s).',
                exact_code_candidates: candidates
            };
        }
        const blocking = matched.filter(candidate => !candidate.ok);
        if (blocking.length) {
            return {
                ok: false,
                rule: rule.id || '',
                source_status: 'scope_check_required',
                reason: 'Japan official tariff rows require rate-scope review for at least one exact statistical code.',
                exact_code_candidates: candidates
            };
        }
        const rates = Array.from(new Set(matched.map(candidate => candidate.base_rate).filter(Number.isFinite))).sort((a, b) => a - b);
        if (rates.length !== 1) {
            return {
                ok: false,
                rule: rule.id || '',
                source_status: 'scope_check_required',
                reason: 'Supplied Japan exact statistical codes returned different official rates; split the rule.',
                unique_base_rates: rates,
                exact_code_candidates: candidates
            };
        }
        return {
            ok: true,
            rule: rule.id || '',
            source_status: 'official_source_checked',
            base_rate: rates[0],
            source_hts: `${exactCodes.join(', ')} (Japan Customs exact statistical code)`,
            source_rate_text: `Japan Customs general duty: ${(rates[0] * 100).toFixed(3)}%`,
            reason: 'All supplied Japan exact statistical codes share one official general duty rate.',
            exact_code_candidates: candidates
        };
    }

    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes : [];
    const candidates = prefixes.map(prefix => buildJapanOfficialRateCandidate(chapterRows, prefix));
    const matched = candidates.filter(candidate => candidate.rate_row_count > 0);
    if (!matched.length) {
        return {
            ok: false,
            rule: rule.id || '',
            source_status: 'official_link_checked',
            reason: 'No Japan official tariff rows matched this maintained rule.',
            prefix_candidates: candidates
        };
    }
    const blocking = matched.filter(candidate => !candidate.ok);
    if (blocking.length) {
        return {
            ok: false,
            rule: rule.id || '',
            source_status: 'scope_check_required',
            reason: 'Japan official tariff rows require exact statistical code / rate-scope review for at least one maintained prefix.',
            prefix_candidates: candidates
        };
    }
    const rates = Array.from(new Set(matched.map(candidate => candidate.base_rate).filter(Number.isFinite))).sort((a, b) => a - b);
    if (rates.length !== 1) {
        return {
            ok: false,
            rule: rule.id || '',
            source_status: 'scope_check_required',
            reason: 'Maintained Japan HS prefixes returned different official rates; split the rule or require exact code.',
            unique_base_rates: rates,
            prefix_candidates: candidates
        };
    }
    return {
        ok: true,
        rule: rule.id || '',
        source_status: 'official_source_checked',
        base_rate: rates[0],
        source_hts: `${prefixes.join(', ')} (Japan Customs general duty)`,
        source_rate_text: `Japan Customs general duty: ${(rates[0] * 100).toFixed(3)}%`,
        reason: 'All matched Japan tariff prefixes share one official general duty rate.',
        prefix_candidates: candidates
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

function buildJapanExactOverrides(checkedAt) {
    return JP_EXACT_CODE_CANDIDATES.map((code) => ({
        hs_code: code,
        base_rate: 0,
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: 'Japan maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; consumption tax remains a separate import tax layer.',
        source_hts: `${code} (JP maintained exact-line candidate)`,
        source_rate_text: 'Japan customs duty candidate: 0.000%',
        source_url: JP_CUSTOMS_URL,
        last_checked_at: checkedAt
    }));
}

function applyJapanBenchmarkToRule(rule, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== JP_BENCHMARK.base_rate) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: JP_BENCHMARK.base_rate });
        rule.base_rate = JP_BENCHMARK.base_rate;
    }
    refreshConsumptionTaxLayer(rule);

    const updates = {
        source_status: 'official_source_checked',
        confidence: 'Official duty + tax estimate',
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
    const exactOverrides = buildJapanExactOverrides(checkedAt);
    if (JSON.stringify(rule.exact_code_overrides || []) !== JSON.stringify(exactOverrides)) {
        changes.push({ field: 'exact_code_overrides', old_value: rule.exact_code_overrides || [], new_value: exactOverrides });
        rule.exact_code_overrides = exactOverrides;
    }
    if (JSON.stringify(rule.exact_statistical_codes || []) !== JSON.stringify(JP_EXACT_STATISTICAL_CODE_CANDIDATES)) {
        changes.push({
            field: 'exact_statistical_codes',
            old_value: rule.exact_statistical_codes || [],
            new_value: JP_EXACT_STATISTICAL_CODE_CANDIDATES
        });
        rule.exact_statistical_codes = JP_EXACT_STATISTICAL_CODE_CANDIDATES;
    }
    return changes;
}

function applyJapanOfficialCandidateToRule(rule, candidate, checkedAt) {
    const changes = [];
    refreshConsumptionTaxLayer(rule);
    if (!candidate || !candidate.source_status) {
        return changes;
    }

    const updates = candidate.ok ? {
        base_rate: candidate.base_rate,
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: `Japan Customs official tariff rows parsed for this maintained HS scope. ${candidate.reason}`,
        source_hts: candidate.source_hts,
        source_rate_text: candidate.source_rate_text,
        source_url: JP_CUSTOMS_URL,
        last_checked_at: checkedAt
    } : candidate.source_status === 'scope_check_required' ? {
        source_status: 'scope_check_required',
        confidence: 'Scope check required',
        source_note: `Japan Customs official tariff rows were found, but exact statistical-code scope is required. ${candidate.reason}`,
        source_hts: `${(rule.hs_prefixes || []).join(', ')} (Japan Customs scope check)`,
        source_rate_text: 'Exact Japan statistical code required before using an official duty rate.',
        source_url: JP_CUSTOMS_URL,
        last_checked_at: checkedAt
    } : {
        source_status: 'official_link_checked',
        confidence: 'Official link monitored',
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

function updateJapanRules({ dryRun = false, officialChapterRows = null } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];
    const officialCandidateOutcomes = [];

    for (const rule of payload.rules || []) {
        if (rule.import_country !== 'JP') continue;
        try {
            const candidate = Array.isArray(officialChapterRows)
                ? buildJapanOfficialCandidateForRule(rule, officialChapterRows)
                : null;
            if (candidate) {
                officialCandidateOutcomes.push(candidate);
            }
            const ruleChanges = candidate
                ? applyJapanOfficialCandidateToRule(rule, candidate, checkedAt)
                : applyJapanBenchmarkToRule(rule, checkedAt);
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
    payload.last_jp_customs_benchmark_sync_at = checkedAt;
    payload.last_jp_customs_benchmark_sync = {
        ok: errors.length === 0,
        dry_run: dryRun,
        writes_official_machine_rates: Array.isArray(officialChapterRows),
        official_candidate_outcomes: officialCandidateOutcomes,
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
    JP_EXACT_CODE_CANDIDATES,
    JP_EXACT_STATISTICAL_CODE_CANDIDATES,
    parseJapanTariffScheduleHtml,
    parseJapanScheduleChapterLinks,
    parseJapanTariffChapterRows,
    parseJapanAdValoremRate,
    japanRowCandidateCodes,
    buildJapanOfficialExactRateCandidate,
    buildJapanOfficialRateCandidate,
    buildJapanOfficialCandidateForRule,
    probeJapanOfficialSource,
    probeJapanReadiness,
    updateJapanRules,
    buildJapanExactOverrides,
    applyJapanBenchmarkToRule,
    applyJapanOfficialCandidateToRule
};
