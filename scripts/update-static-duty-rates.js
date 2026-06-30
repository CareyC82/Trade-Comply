#!/usr/bin/env node
/**
 * Refresh maintained benchmark metadata for countries where an official source
 * is identified but exact machine-readable tariff extraction is not wired yet.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DEFAULT_COUNTRIES = ['CN', 'VN', 'MY', 'TW', 'RU', 'IN'];
const REQUEST_TIMEOUT_MS = 15000;
const INDIA_REQUEST_TIMEOUT_MS = 30000;
const OFFICIAL_PROBE_MARKERS = {
    CN: [/customs/i, /tariff/i, /海关|税则|关税/],
    VN: [/customs/i, /tariff/i, /vietnam/i, /hải quan|biểu thuế|thuế nhập khẩu/i],
    MY: [/customs/i, /tariff|sst/i, /malaysia|kastam/i],
    TW: [/customs/i, /tariff/i, /海關|稅則|關稅/],
    RU: [/customs|tariff|eaeu/i, /тамож|тариф/i],
    IN: [/icegate|cbic|customs/i, /tariff|duty|igst|bcd/i]
};

const COUNTRY_NOTES = {
    CN: 'China maintained exact-line candidates refreshed locally. Confirm final customs tariff line, import VAT basis, origin preference, and any licensing condition before filing.',
    VN: 'Vietnam official customs source link is monitored. Confirm exact tariff line, VAT basis, preferential origin, and MIC/MOIT product triggers before filing.',
    MY: 'Malaysia official customs/SST source link is monitored. Confirm exact tariff line, SST/duty exemption, and SIRIM/MCMC/ST approval scope before filing.',
    TW: 'Taiwan official customs source link is monitored. Confirm exact customs duty, business tax basis, and tariff-line treatment before filing.',
    RU: 'Russia/EAEU official source link is monitored. Confirm exact EAEU tariff line, VAT basis, sanctions, restricted-party, and licensing scope before filing.',
    IN: 'India official-link estimate refreshed locally. Confirm exact HS line, BCD, Social Welfare Surcharge, IGST, exemption, BIS/QCO, WPC, e-waste, and battery-rule scope before filing.'
};
const OFFICIAL_LINK_ESTIMATE_COUNTRIES = new Set(['RU']);
const STATIC_EXACT_CODE_CANDIDATES = [
    '847150',
    '847130',
    '850440',
    '850760',
    '851713',
    '851762',
    '852852',
    '854143',
    '854231'
];
const EXACT_CANDIDATE_COUNTRY_META = {
    CN: {
        source_hts: 'CN maintained exact-line candidates',
        source_rate_text: 'Exact-line candidates: 0% MFN duty for maintained high-tech electronics; 13% import VAT handled separately',
        source_note: 'China exact-line candidates are maintained for high-tech electronics; MFN duty is treated as 0% for covered candidates, while import VAT, licensing, CCC/SRRC, and origin treatment remain separate checks.',
        override_note: 'China maintained exact-line candidate for covered high-tech electronics. MFN duty is treated as 0% for pre-check; import VAT, licensing, CCC/SRRC, and origin treatment remain separate checks.',
        override_hts_label: 'CN maintained exact-line candidate',
        override_rate_text: 'China MFN duty candidate: 0.000%'
    },
    VN: {
        source_hts: 'VN maintained exact-line candidates',
        source_rate_text: 'Exact-line candidates: 0% base duty for maintained electronics; 10% VAT handled separately',
        source_note: 'Vietnam exact-line candidates are maintained for high-tech electronics; VAT, preferential tariff, and origin scope are handled as separate checks. Confirm VNACCS tariff line before filing.',
        override_note: 'Vietnam maintained exact-line candidate for covered high-tech electronics. Base duty is treated as 0% for pre-check; VAT and preferential-origin scope remain separate checks.',
        override_hts_label: 'Vietnam Customs exact-line candidate',
        override_rate_text: 'Vietnam customs duty candidate: 0.000%'
    },
    MY: {
        source_hts: 'MY maintained exact-line candidates',
        source_rate_text: 'Exact-line candidates: 0% customs duty for maintained electronics; SST/import tax handled separately',
        source_note: 'Malaysia exact-line candidates are maintained for high-tech electronics; SST, exemptions, SIRIM/MCMC/ST approval scope, and preferential-origin treatment are handled as separate checks. Verify final tariff line before filing.',
        override_note: 'Malaysia maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0% for pre-check; SST, exemptions, SIRIM/MCMC/ST scope, and preferential-origin treatment remain separate checks.',
        override_hts_label: 'MY maintained exact-line candidate',
        override_rate_text: 'Malaysia customs duty candidate: 0.000%'
    },
    TW: {
        source_hts: 'TW maintained exact-line candidates',
        source_rate_text: 'Exact-line candidates: 0% customs duty for maintained electronics; 5% business tax handled separately',
        source_note: 'Taiwan exact-line candidates are maintained for high-tech electronics; business tax, commodity inspection, telecom approval, and tariff-line treatment are handled as separate checks. Verify final customs tariff code before filing.',
        override_note: 'Taiwan maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0% for pre-check; business tax, inspection, telecom approval, and tariff-line treatment remain separate checks.',
        override_hts_label: 'TW maintained exact-line candidate',
        override_rate_text: 'Taiwan customs duty candidate: 0.000%'
    },
    IN: {
        source_hts: 'IN maintained exact-line candidates',
        source_rate_text: 'Exact-line candidates: 0% BCD for maintained electronics; SWS on BCD and 18% IGST handled separately',
        source_note: 'India exact-line candidates are maintained for high-tech electronics; BCD is treated as 0% for covered candidates, SWS follows BCD, and IGST/exemption/product-control scope remains a separate check. Verify final HSN and notification treatment before filing.',
        override_note: 'India maintained exact-line candidate for covered high-tech electronics. BCD is treated as 0% for pre-check; SWS, IGST, exemption notification, BIS/QCO, WPC, and other product-control scope remain separate checks.',
        override_hts_label: 'IN maintained exact-line candidate',
        override_rate_text: 'India BCD candidate: 0.000%'
    }
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
            .catch((error) => {
                if (error?.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
                    return fetchTextWithCurl(url, { timeoutMs });
                }
                throw error;
            })
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

function fetchTextWithCurl(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    return new Promise((resolve, reject) => {
        execFile('curl', [
            '--location',
            '--silent',
            '--show-error',
            '--max-time',
            String(timeoutSeconds),
            '--user-agent',
            'Mozilla/5.0 TraceWize duty-rate updater (+https://tracewize.com)',
            '--write-out',
            '\n__TRACEWIZE_HTTP_STATUS__:%{http_code}',
            url
        ], {
            maxBuffer: 10 * 1024 * 1024
        }, (error, stdout, stderr) => {
            if (error) {
                const message = stderr || error.message || '';
                const partialBody = String(stdout || '');
                if (partialBody.trim() && /timed out|Operation timed out|timeout/i.test(message)) {
                    resolve({
                        status_code: 206,
                        body: partialBody,
                        partial: true,
                        error: message
                    });
                    return;
                }
                reject(new Error(stderr || error.message));
                return;
            }
            const marker = '\n__TRACEWIZE_HTTP_STATUS__:';
            const markerIndex = stdout.lastIndexOf(marker);
            if (markerIndex === -1) {
                reject(new Error('curl response did not include HTTP status marker.'));
                return;
            }
            const body = stdout.slice(0, markerIndex);
            const status_code = Number(stdout.slice(markerIndex + marker.length).trim());
            resolve({
                status_code: Number.isFinite(status_code) ? status_code : 0,
                body
            });
        });
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

function parsePercent(value = '') {
    const text = stripHtml(value);
    if (!text || /^(free|nil|exempt|0(?:\.0+)?\s*%)$/i.test(text)) return 0;
    const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) / 100 : null;
}

function parseIndiaTariffRows(html = '') {
    const rowMatches = String(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const tableRows = rowMatches.map((rowHtml) => {
        const cells = (rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(stripHtml);
        const hsCode = cells.find(cell => /\b\d{6,10}\b/.test(cell))?.match(/\b\d{6,10}\b/)?.[0] || '';
        if (!hsCode) return null;
        const bcdCell = cells.find(cell => /BCD|basic customs duty|basic duty/i.test(cell))
            || cells.find(cell => /\d+(?:\.\d+)?\s*%|nil|free|exempt/i.test(cell))
            || '';
        const swsCell = cells.find(cell => /SWS|social welfare/i.test(cell)) || '';
        const igstCell = cells.find(cell => /IGST|integrated tax/i.test(cell)) || '';
        const bcdRate = parsePercent(bcdCell);
        const swsRate = parsePercent(swsCell);
        const igstRate = parsePercent(igstCell);
        if (bcdRate === null) return null;
        return {
            hs_code: hsCode,
            hs_prefix: hsCode.slice(0, 6),
            item_name: cells.find(cell => cell !== hsCode && cell !== bcdCell && cell !== swsCell && cell !== igstCell) || '',
            bcd_rate_text: bcdCell,
            sws_rate_text: swsCell,
            igst_rate_text: igstCell,
            bcd_rate: bcdRate,
            sws_rate: swsRate,
            igst_rate: igstRate
        };
    }).filter(Boolean);
    if (tableRows.length) return tableRows;

    return stripHtml(html)
        .split(/(?=\b\d{6,10}\b)/)
        .map((line) => {
            const hsCode = line.match(/\b\d{6,10}\b/)?.[0] || '';
            if (!hsCode) return null;
            const bcdText = line.match(/(?:BCD|basic customs duty|basic duty)[:\s-]*(free|nil|exempt|\d+(?:\.\d+)?\s*%)/i)?.[0]
                || line.match(/\b(free|nil|exempt|\d+(?:\.\d+)?\s*%)\b/i)?.[0]
                || '';
            const swsText = line.match(/(?:SWS|social welfare(?: surcharge)?)[:\s-]*(free|nil|exempt|\d+(?:\.\d+)?\s*%)/i)?.[0] || '';
            const igstText = line.match(/(?:IGST|integrated(?: goods and services)? tax)[:\s-]*(free|nil|exempt|\d+(?:\.\d+)?\s*%)/i)?.[0] || '';
            const bcdRate = parsePercent(bcdText);
            if (bcdRate === null) return null;
            return {
                hs_code: hsCode,
                hs_prefix: hsCode.slice(0, 6),
                item_name: line.replace(hsCode, '').slice(0, 140).trim(),
                bcd_rate_text: bcdText,
                sws_rate_text: swsText,
                igst_rate_text: igstText,
                bcd_rate: bcdRate,
                sws_rate: parsePercent(swsText),
                igst_rate: parsePercent(igstText)
            };
        })
        .filter(Boolean);
}

function normalizeGenericRateText(value = '') {
    const text = stripHtml(value);
    const match = text.match(/\b(free|nil|exempt|\d+(?:\.\d+)?\s*%)\b/i);
    return match ? match[1] : '';
}

function buildGenericTariffRow({ hsCode = '', text = '', rateText = '' } = {}) {
    const normalizedRateText = normalizeGenericRateText(rateText || text);
    const baseRate = parsePercent(normalizedRateText);
    if (!hsCode || baseRate === null) return null;
    return {
        hs_code: hsCode,
        hs_prefix: hsCode.slice(0, 6),
        item_name: stripHtml(text).replace(hsCode, '').replace(normalizedRateText, '').slice(0, 140).trim(),
        rate_text: normalizedRateText,
        base_rate: baseRate
    };
}

function parseGenericTariffRows(html = '') {
    const rows = [];
    const rowMatches = String(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];
    rowMatches.forEach((rowHtml) => {
        const cells = (rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(stripHtml);
        const hsCode = cells.find(cell => /\b\d{6,10}\b/.test(cell))?.match(/\b\d{6,10}\b/)?.[0] || '';
        if (!hsCode) return;
        const rateCell = cells.find(cell => /\b(free|nil|exempt|\d+(?:\.\d+)?\s*%)\b/i.test(cell)) || '';
        const row = buildGenericTariffRow({
            hsCode,
            text: cells.join(' '),
            rateText: rateCell
        });
        if (row) rows.push(row);
    });

    if (!rows.length) {
        stripHtml(html)
            .split(/(?=\b\d{6,10}\b)/)
            .forEach((line) => {
                const hsCode = line.match(/\b\d{6,10}\b/)?.[0] || '';
                const row = buildGenericTariffRow({ hsCode, text: line });
                if (row) rows.push(row);
            });
    }

    const seen = new Set();
    return rows.filter((row) => {
        const key = `${row.hs_code}:${row.rate_text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getOfficialProbeUrls(source = {}, fallbackUrl = '') {
    const urls = [
        ...(Array.isArray(source?.official_probe_urls) ? source.official_probe_urls : []),
        source?.official_url,
        fallbackUrl
    ]
        .filter(Boolean)
        .map(url => String(url).trim())
        .filter(Boolean);
    return Array.from(new Set(urls));
}

function detectOfficialProbeMarkers(country, body = '') {
    const text = stripHtml(body).slice(0, 200000);
    const markers = OFFICIAL_PROBE_MARKERS[String(country || '').toUpperCase()] || [/customs/i, /tariff|duty/i];
    return markers
        .map((pattern) => {
            const match = text.match(pattern);
            return match ? String(match[0]).slice(0, 60) : '';
        })
        .filter(Boolean);
}

async function fetchStaticOfficialProbe({
    country,
    source = getSource(String(country || '').toUpperCase()),
    fetcher = fetchText,
    timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
    const code = String(country || source?.country || '').toUpperCase();
    const urls = getOfficialProbeUrls(source, source?.official_url || '');
    const attempts = [];
    let best = null;

    for (const url of urls) {
        try {
            const response = await fetcher(url, { timeoutMs });
            const ok = response.status_code >= 200 && response.status_code < 400;
            const markers = detectOfficialProbeMarkers(code, response.body || '');
            const rows = parseGenericTariffRows(response.body || '');
            const attempt = {
                ok,
                status_code: response.status_code,
                official_url: url,
                rows,
                row_count: rows.length,
                marker_count: markers.length,
                markers,
                partial: Boolean(response.partial),
                error: response.error || ''
            };
            attempts.push({
                official_url: url,
                status_code: response.status_code,
                row_count: rows.length,
                marker_count: markers.length,
                partial: Boolean(response.partial),
                error: response.error || ''
            });
            if (!best || attempt.row_count > best.row_count || attempt.marker_count > best.marker_count || (!best.ok && attempt.ok)) {
                best = attempt;
            }
        } catch (error) {
            const attempt = {
                ok: false,
                status_code: null,
                official_url: url,
                rows: [],
                row_count: 0,
                marker_count: 0,
                markers: [],
                partial: false,
                error: error.message
            };
            attempts.push(attempt);
            if (!best) best = attempt;
        }
    }

    const selected = best || {
        ok: false,
        status_code: null,
        official_url: source?.official_url || '',
        rows: [],
        row_count: 0,
        marker_count: 0,
        markers: [],
        partial: false,
        error: 'No official probe URL configured.'
    };

    return {
        ...selected,
        attempts,
        row_count: selected.row_count || 0,
        parser_note: selected.row_count
            ? `${code || 'Static'} official page contains machine-readable tariff-like rows; keep exact HS validation before promotion.`
            : `${code || 'Static'} official page reachable probe only; exact tariff-row parser is not promoted yet.`
    };
}

async function fetchIndiaOfficialRows({
    fetcher = fetchText,
    source = getSource('IN')
} = {}) {
    const urls = getOfficialProbeUrls(source, 'https://www.icegate.gov.in/');
    const attempts = [];
    let best = null;
    for (const url of urls) {
        try {
            const response = await fetcher(url, { timeoutMs: INDIA_REQUEST_TIMEOUT_MS });
            const rows = parseIndiaTariffRows(response.body || '');
            const acceptableStatus = response.status_code >= 200 && response.status_code < 400;
            const attempt = {
                ok: acceptableStatus && rows.length > 0,
                status_code: response.status_code,
                official_url: url,
                rows,
                row_count: rows.length,
                partial: Boolean(response.partial),
                error: response.error || ''
            };
            attempts.push({
                official_url: url,
                status_code: response.status_code,
                row_count: rows.length,
                partial: Boolean(response.partial),
                error: response.error || ''
            });
            if (attempt.ok) {
                return {
                    ...attempt,
                    attempts
                };
            }
            if (!best || attempt.row_count > best.row_count || (!best.status_code && attempt.status_code)) {
                best = attempt;
            }
        } catch (error) {
            attempts.push({
                official_url: url,
                status_code: null,
                row_count: 0,
                partial: false,
                error: error.message
            });
            if (!best) {
                best = {
                    ok: false,
                    status_code: null,
                    official_url: url,
                    rows: [],
                    row_count: 0,
                    partial: false,
                    error: error.message
                };
            }
        }
    }
    const selected = best || {
        ok: false,
        status_code: null,
        official_url: source?.official_url || 'https://www.icegate.gov.in/',
        rows: [],
        row_count: 0,
        partial: false,
        error: ''
    };
    return {
        ...selected,
        attempts
    };
}

function buildIndiaOfficialRateCandidate(rows = [], hsPrefix = '') {
    const prefix = String(hsPrefix || '').replace(/\D/g, '');
    const matched = rows.filter(row => String(row.hs_code || row.hs_prefix || '').replace(/\D/g, '').startsWith(prefix));
    const bcdRates = Array.from(new Set(matched
        .map(row => row.bcd_rate)
        .filter(rate => Number.isFinite(rate))
        .map(rate => Number(rate.toFixed(6)))))
        .sort((a, b) => a - b);
    const swsRates = Array.from(new Set(matched
        .map(row => row.sws_rate)
        .filter(rate => Number.isFinite(rate))
        .map(rate => Number(rate.toFixed(6)))))
        .sort((a, b) => a - b);
    const igstRates = Array.from(new Set(matched
        .map(row => row.igst_rate)
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
            reason: `No India official tariff row matched ${prefix}.`
        };
    }
    if (bcdRates.length === 1 && swsRates.length <= 1 && igstRates.length <= 1) {
        return {
            ok: true,
            source_status: 'official_source_checked',
            status: 'official_source_candidate',
            hs_prefix: prefix,
            matched_rows: matched.length,
            base_rate: bcdRates[0],
            sws_rate: swsRates[0] ?? null,
            igst_rate: igstRates[0] ?? null,
            source_hts: `${prefix} (India Customs tariff candidate)`,
            source_rate_text: `India official candidate: BCD ${(bcdRates[0] * 100).toFixed(3)}%${swsRates.length ? ` · SWS ${(swsRates[0] * 100).toFixed(3)}%` : ''}${igstRates.length ? ` · IGST ${(igstRates[0] * 100).toFixed(3)}%` : ''}`
        };
    }
    return {
        ok: false,
        source_status: 'scope_check_required',
        status: 'multiple_rates_need_exact_hs',
        hs_prefix: prefix,
        matched_rows: matched.length,
        unique_bcd_rates: bcdRates,
        unique_sws_rates: swsRates,
        unique_igst_rates: igstRates,
        reason: `${prefix} has multiple India tariff/tax rates; exact tariff line is required.`
    };
}

function buildIndiaOfficialCandidateForRule(rule, rows = []) {
    const prefixes = Array.isArray(rule.hs_prefixes) ? rule.hs_prefixes : [];
    const candidates = prefixes.map(prefix => buildIndiaOfficialRateCandidate(rows, prefix));
    const okCandidates = candidates.filter(candidate => candidate.ok);
    const scopeCandidates = candidates.filter(candidate => candidate.source_status === 'scope_check_required');
    const uniqueBcd = Array.from(new Set(okCandidates.map(candidate => Number(candidate.base_rate.toFixed(6)))));
    const uniqueSws = Array.from(new Set(okCandidates.map(candidate => candidate.sws_rate).filter(Number.isFinite).map(rate => Number(rate.toFixed(6)))));
    const uniqueIgst = Array.from(new Set(okCandidates.map(candidate => candidate.igst_rate).filter(Number.isFinite).map(rate => Number(rate.toFixed(6)))));

    if (okCandidates.length === prefixes.length && uniqueBcd.length === 1 && uniqueSws.length <= 1 && uniqueIgst.length <= 1) {
        return {
            ok: true,
            source_status: 'official_source_checked',
            status: 'official_source_candidate',
            candidates,
            base_rate: uniqueBcd[0],
            sws_rate: uniqueSws[0] ?? null,
            igst_rate: uniqueIgst[0] ?? null,
            source_hts: `${prefixes.join(', ')} (India Customs tariff candidate)`,
            source_rate_text: `India official candidate: BCD ${(uniqueBcd[0] * 100).toFixed(3)}%${uniqueSws.length ? ` · SWS ${(uniqueSws[0] * 100).toFixed(3)}%` : ''}${uniqueIgst.length ? ` · IGST ${(uniqueIgst[0] * 100).toFixed(3)}%` : ''}`
        };
    }
    if (scopeCandidates.length || uniqueBcd.length > 1 || uniqueSws.length > 1 || uniqueIgst.length > 1) {
        return {
            ok: false,
            source_status: 'scope_check_required',
            status: 'exact_hs_required',
            candidates,
            reason: `${rule.id || 'rule'} needs exact India tariff line before BCD/SWS/IGST can be used.`
        };
    }
    return {
        ok: false,
        source_status: 'official_link_checked',
        status: 'no_matching_rows',
        candidates,
        reason: `${rule.id || 'rule'} has no matched India tariff rows.`
    };
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
        live_row_count: 0,
        official_probe: {
            checked: false,
            ok: null,
            official_url: source?.official_url || '',
            official_probe_urls: getOfficialProbeUrls(source, source?.official_url || ''),
            parsed_rate_rows: 0,
            machine_parser_ready: false,
            source_use_cases: Array.isArray(source?.source_use_cases) ? source.source_use_cases : [],
            transit_route_priority: Boolean(source?.transit_route_priority)
        },
        next_action: source?.next_action || `Add ${code} source roadmap before updating.`,
        status_reason: source?.status_reason || ''
    };
}

async function probeStaticBenchmarkReadinessLive(country, {
    sourcesPayload = readJson(SOURCES_PATH),
    dutyPayload = readJson(DUTY_RATES_PATH),
    fetcher = fetchText
} = {}) {
    const readiness = probeStaticBenchmarkReadiness(country, { sourcesPayload, dutyPayload });
    const source = getSource(readiness.country, sourcesPayload);
    const officialProbe = await fetchStaticOfficialProbe({
        country: readiness.country,
        source,
        fetcher
    }).catch(error => ({
        ok: false,
        status_code: null,
        official_url: readiness.official_url,
        attempts: [],
        row_count: 0,
        marker_count: 0,
        markers: [],
        error: error.message,
        parser_note: `${readiness.country} official probe failed before parser readiness could be checked.`
    }));

    return {
        ...readiness,
        official_probe: {
            ...readiness.official_probe,
            checked: true,
            ok: officialProbe.ok,
            status_code: officialProbe.status_code,
            official_url: officialProbe.official_url || readiness.official_url,
            attempts: officialProbe.attempts || [],
            marker_count: officialProbe.marker_count || 0,
            markers: officialProbe.markers || [],
            parsed_rate_rows: officialProbe.row_count || 0,
            machine_parser_ready: Boolean(officialProbe.row_count),
            parser_note: officialProbe.parser_note || `${readiness.country} exact tariff-row parser is not promoted yet.`,
            error: officialProbe.error || ''
        },
        live_row_count: officialProbe.row_count || 0
    };
}

async function probeIndiaReadiness({ live = false, fetcher = fetchText } = {}) {
    const readiness = probeStaticBenchmarkReadiness('IN');
    const officialProbe = live
        ? await fetchIndiaOfficialRows({ fetcher }).catch(error => ({
            ok: false,
            status_code: null,
            official_url: readiness.official_url,
            rows: [],
            row_count: 0,
            error: error.message
        }))
        : { ok: null, row_count: 0, checked: false };
    return {
        ...readiness,
        official_probe: {
            checked: live,
            ok: officialProbe.ok,
            status_code: officialProbe.status_code,
            official_url: officialProbe.official_url || readiness.official_url,
            parsed_rate_rows: officialProbe.row_count || 0,
            machine_parser_ready: Boolean(officialProbe.row_count)
        },
        writes_official_machine_rates: false,
        live_row_count: officialProbe.row_count || 0
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

function refreshExactCandidateLayers(rule, country) {
    if (country !== 'IN') return;
    const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
    layers.forEach((layer) => {
        if (/sws|social_welfare/i.test(layer.type || layer.label || '')) {
            layer.rate = 0.1;
            layer.status = 'official_source_checked';
            layer.source = layer.source || 'CBIC / ICEGATE maintained SWS treatment; amount is zero when BCD is 0%';
        }
        if (/igst|integrated/i.test(layer.type || layer.label || '')) {
            layer.rate = 0.18;
            layer.status = 'indicative';
            layer.source = layer.source || 'India GST/IGST benchmark; verify HSN rate and exemption notification scope';
        }
        if (/basic_customs_duty/i.test(layer.type || layer.label || '')) {
            layer.rate = 0;
            layer.status = 'official_source_checked';
            layer.source = layer.source || 'ICEGATE/CIP maintained BCD candidate';
        }
    });
    rule.additional_rate = layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
}

function applyStaticBenchmarkToRule(rule, { source, checkedAt }) {
    const changes = [];
    refreshLayerStatuses(rule);

    const country = rule.import_country;
    const exactCandidateMeta = EXACT_CANDIDATE_COUNTRY_META[country];
    const exactCandidateCountry = Boolean(exactCandidateMeta);
    const officialLinkEstimate = OFFICIAL_LINK_ESTIMATE_COUNTRIES.has(country);
    const updates = {
        source_status: exactCandidateCountry ? 'official_source_checked' : officialLinkEstimate ? 'official_link_checked' : 'benchmark_source_checked',
        confidence: exactCandidateCountry ? 'Official duty + tax estimate' : officialLinkEstimate ? 'Official link monitored' : 'Indicative',
        source_note: exactCandidateMeta?.source_note || COUNTRY_NOTES[country] || `${country} benchmark refreshed locally. Confirm exact tariff-line treatment before filing.`,
        source_hts: exactCandidateMeta?.source_hts || rule.source_hts,
        source_rate_text: exactCandidateMeta?.source_rate_text || rule.source_rate_text,
        source_url: source?.official_url || rule.source_url || '',
        last_checked_at: checkedAt
    };

    Object.entries(updates).forEach(([field, value]) => {
        if (rule[field] !== value) {
            changes.push({ field, old_value: rule[field], new_value: value });
            rule[field] = value;
        }
    });

    if (exactCandidateCountry) {
        refreshExactCandidateLayers(rule, country);
        const exactOverrides = STATIC_EXACT_CODE_CANDIDATES.map((code) => ({
            hs_code: code,
            base_rate: 0,
            source_status: 'official_source_checked',
            confidence: 'Official source checked',
            source_note: exactCandidateMeta.override_note,
            source_hts: `${code} (${exactCandidateMeta.override_hts_label})`,
            source_rate_text: exactCandidateMeta.override_rate_text,
            source_url: source?.official_url || rule.source_url || '',
            last_checked_at: checkedAt
        }));
        if (JSON.stringify(rule.exact_code_overrides || []) !== JSON.stringify(exactOverrides)) {
            changes.push({ field: 'exact_code_overrides', old_value: rule.exact_code_overrides || [], new_value: exactOverrides });
            rule.exact_code_overrides = exactOverrides;
        }
    }

    return changes;
}

function applyIndiaOfficialCandidateToRule(rule, candidate, { source, checkedAt }) {
    const changes = [];
    refreshLayerStatuses(rule);
    if (candidate.ok && Number(rule.base_rate) !== Number(candidate.base_rate)) {
        changes.push({ field: 'base_rate', old_value: rule.base_rate, new_value: candidate.base_rate });
        rule.base_rate = candidate.base_rate;
    }
    if (candidate.ok && Number.isFinite(candidate.sws_rate)) {
        const sws = (rule.add_on_layers || []).find(layer => /sws|social_welfare/i.test(layer.type || layer.label || ''));
        if (sws && Number(sws.rate) !== Number(candidate.sws_rate)) {
            changes.push({ field: 'add_on_layers.sws.rate', old_value: sws.rate, new_value: candidate.sws_rate });
            sws.rate = candidate.sws_rate;
            sws.status = 'official_source_checked';
        }
    }
    if (candidate.ok && Number.isFinite(candidate.igst_rate)) {
        const igst = (rule.add_on_layers || []).find(layer => /igst|import_vat|integrated/i.test(layer.type || layer.label || ''));
        if (igst && Number(igst.rate) !== Number(candidate.igst_rate)) {
            changes.push({ field: 'add_on_layers.igst.rate', old_value: igst.rate, new_value: candidate.igst_rate });
            igst.rate = candidate.igst_rate;
            igst.status = 'official_source_checked';
        }
    }
    rule.additional_rate = (rule.add_on_layers || []).reduce((sum, layer) => sum + Number(layer.rate || 0), 0);

    const updates = candidate.ok ? {
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: 'India official candidate selected because maintained rows produced one unambiguous BCD basis. Verify exact tariff line, SWS/IGST applicability, exemptions, BIS/QCO, WPC, and origin before filing.',
        source_hts: candidate.source_hts,
        source_rate_text: candidate.source_rate_text,
        source_url: source?.official_url || rule.source_url || '',
        last_checked_at: checkedAt
    } : candidate.source_status === 'scope_check_required' ? {
        source_status: 'scope_check_required',
        confidence: 'Scope check required',
        source_note: 'India tariff/tax treatment depends on exact tariff line, exemption notification, SWS, IGST, and product-specific compliance scope.',
        source_hts: `${(rule.hs_prefixes || []).join(', ')} (India Customs scope check required)`,
        source_rate_text: 'Exact India tariff line required before using official BCD/SWS/IGST rates.',
        source_url: source?.official_url || rule.source_url || '',
        last_checked_at: checkedAt
    } : {
        source_status: 'benchmark_source_checked',
        confidence: 'Indicative',
        source_note: COUNTRY_NOTES.IN,
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

function updateStaticBenchmarkRules({ countries = DEFAULT_COUNTRIES, dryRun = false, indiaTariffRows = null } = {}) {
    const targetCountries = normalizeCountries(countries);
    const sourcesPayload = readJson(SOURCES_PATH);
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];
    const readiness = {};
    const officialCandidateOutcomes = [];

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
                const candidate = country === 'IN' && Array.isArray(indiaTariffRows)
                    ? buildIndiaOfficialCandidateForRule(rule, indiaTariffRows)
                    : null;
                if (candidate) {
                    officialCandidateOutcomes.push({
                        rule: rule.id,
                        ok: candidate.ok,
                        status: candidate.status,
                        source_status: candidate.source_status,
                        reason: candidate.reason || ''
                    });
                }
                const ruleChanges = candidate
                    ? applyIndiaOfficialCandidateToRule(rule, candidate, { source, checkedAt })
                    : applyStaticBenchmarkToRule(rule, { source, checkedAt });
                if (ruleChanges.length) {
                    changes.push({
                        rule: rule.id,
                        import_country: rule.import_country,
                        mode: candidate ? 'india-official-candidate' : 'benchmark',
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
        writes_official_machine_rates: Boolean(indiaTariffRows),
        changes,
        errors,
        readiness
    };
    if (indiaTariffRows) {
        payload.last_static_benchmark_sync.official_candidate_outcomes = officialCandidateOutcomes;
    }

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_static_benchmark_sync;
}

async function updateIndiaRulesFromOfficialSource({ dryRun = false, fetcher = fetchText } = {}) {
    let official;
    try {
        official = await fetchIndiaOfficialRows({ fetcher });
    } catch (error) {
        const source = getSource('IN');
        official = {
            ok: false,
            status_code: null,
            official_url: source?.official_url || 'https://www.icegate.gov.in/',
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
    const result = updateStaticBenchmarkRules({
        countries: ['IN'],
        dryRun,
        indiaTariffRows: official.rows.length ? official.rows : null
    });
    result.official_fetch = {
        ok: official.ok,
        status_code: official.status_code,
        official_url: official.official_url,
        row_count: official.row_count,
        partial: Boolean(official.partial),
        error: official.error || '',
        attempts: official.attempts || []
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
    const probeLive = process.argv.includes('--probe-live');
    const officialLive = process.argv.includes('--official-live');
    const countries = parseCountriesArg();
    Promise.resolve(
        probeLive
            ? Promise.all(countries.map(country => String(country).toUpperCase() === 'IN'
                ? probeIndiaReadiness({ live: true })
                : probeStaticBenchmarkReadinessLive(country)))
            : officialLive && countries.includes('IN')
                ? updateIndiaRulesFromOfficialSource({ dryRun })
                : probeOnly
                    ? countries.map(country => probeStaticBenchmarkReadiness(country))
                    : updateStaticBenchmarkRules({ countries, dryRun })
    ).then((result) => {
        console.log(JSON.stringify(result, null, 2));
        const ok = Array.isArray(result) ? result.every(row => row.ok) : result.ok;
        process.exit(ok ? 0 : 1);
    }).catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_COUNTRIES,
    COUNTRY_NOTES,
    STATIC_EXACT_CODE_CANDIDATES,
    EXACT_CANDIDATE_COUNTRY_META,
    applyStaticBenchmarkToRule,
    applyIndiaOfficialCandidateToRule,
    buildIndiaOfficialCandidateForRule,
    buildIndiaOfficialRateCandidate,
    fetchIndiaOfficialRows,
    fetchStaticOfficialProbe,
    fetchText,
    fetchTextWithCurl,
    getOfficialProbeUrls,
    getMaintainedPrefixes,
    parseGenericTariffRows,
    parseIndiaTariffRows,
    parsePercent,
    probeIndiaReadiness,
    probeStaticBenchmarkReadiness,
    probeStaticBenchmarkReadinessLive,
    updateIndiaRulesFromOfficialSource,
    updateStaticBenchmarkRules
};
