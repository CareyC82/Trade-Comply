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
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const EU_TARIC_URL = 'https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en';
const EU_TARIC_CONSULTATION_URL = 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en';
const EU_TARIC_FULL_DATABASE_URL = 'https://circabc.europa.eu/ui/group/0e5f18c2-4b2f-42e9-aed4-dfe50ae1263b/library/64db9d0f-e7c9-4084-afe9-f47e70e53c10?p=1&n=-1&sort=name_ASC';
const EU_TARIC_FULL_DATABASE_FOLDER_ID = '64db9d0f-e7c9-4084-afe9-f47e70e53c10';
const CIRCABC_SERVICE_BASE = 'https://circabc.europa.eu/service/circabc';
const CIRCABC_DIRECT_DOWNLOAD_BASE = 'https://circabc.europa.eu/d/a/workspace/SpacesStore';

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

function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseEuTaricConsultationHtml(html) {
    const body = String(html || '');
    const lastUpdateMatch = body.match(/Last\s+TARIC\s+update:\s*(?:&nbsp;)?\s*<\/span>\s*<span>\s*([\d-]+)/i)
        || body.match(/Last\s+TARIC\s+update:\s*(?:&nbsp;)?\s*([\d-]+)/i);
    const fullDatabaseMatch = body.match(/href="([^"]+)"[^>]*>\s*TARIC\s+Full\s+database/i);
    return {
        last_taric_update: lastUpdateMatch ? lastUpdateMatch[1] : '',
        full_database_url: fullDatabaseMatch ? fullDatabaseMatch[1].replace(/&amp;/g, '&') : '',
        title: normalizeWhitespace((body.match(/<title>([^<]+)<\/title>/i) || [])[1] || '')
    };
}

function fetchText(url, { timeoutMs = 25000 } = {}) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
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
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                    return;
                }
                resolve({
                    status_code: response.statusCode,
                    body
                });
            });
        });
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url}`));
        });
        request.on('error', reject);
    });
}

async function fetchJson(url, { fetcher = fetchText } = {}) {
    const response = await fetcher(url);
    try {
        return JSON.parse(response.body);
    } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${error.message}`);
    }
}

function buildCircabcChildrenUrl(folderId) {
    const params = new URLSearchParams({
        language: 'en',
        guest: 'true',
        limit: '100',
        page: '1',
        order: 'name_ASC',
        folderOnly: 'false',
        fileOnly: 'false',
        skipExpiredItems: 'true'
    });
    return `${CIRCABC_SERVICE_BASE}/spaces/${encodeURIComponent(folderId)}/children?${params.toString()}`;
}

function getCircabcItems(payload) {
    return Array.isArray(payload?.data) ? payload.data : [];
}

function pickLatestNumberedFolder(items) {
    return getCircabcItems({ data: items })
        .filter(item => item?.type && /folder/i.test(item.type))
        .map(item => ({
            ...item,
            sort_number: Number((String(item.name || '').match(/^(\d{2,4})/) || [])[1])
        }))
        .filter(item => Number.isFinite(item.sort_number))
        .sort((a, b) => b.sort_number - a.sort_number)[0] || null;
}

function pickTaricImportDutiesFile(items) {
    return getCircabcItems({ data: items })
        .filter(item => item?.type && /content/i.test(item.type))
        .find(item => /^Duties Import 01-99\.xlsx$/i.test(String(item.name || ''))) || null;
}

function buildCircabcDirectDownloadUrl(file) {
    if (!file?.id || !file?.name) return '';
    return `${CIRCABC_DIRECT_DOWNLOAD_BASE}/${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`;
}

async function probeEuTaricFullDatabase({ fetcher = fetchText } = {}) {
    const checkedAt = new Date().toISOString();
    try {
        const years = await fetchJson(buildCircabcChildrenUrl(EU_TARIC_FULL_DATABASE_FOLDER_ID), { fetcher });
        const latestYear = pickLatestNumberedFolder(getCircabcItems(years));
        if (!latestYear?.id) {
            throw new Error('No year folder found in TARIC full database.');
        }
        const months = await fetchJson(buildCircabcChildrenUrl(latestYear.id), { fetcher });
        const latestMonth = pickLatestNumberedFolder(getCircabcItems(months));
        if (!latestMonth?.id) {
            throw new Error(`No month folder found under TARIC year ${latestYear.name}.`);
        }
        const files = await fetchJson(buildCircabcChildrenUrl(latestMonth.id), { fetcher });
        const importDutiesFile = pickTaricImportDutiesFile(getCircabcItems(files));
        if (!importDutiesFile?.id) {
            throw new Error(`Duties Import 01-99.xlsx not found under ${latestYear.name}/${latestMonth.name}.`);
        }
        return {
            checked: true,
            ok: true,
            checked_at: checkedAt,
            root_folder_id: EU_TARIC_FULL_DATABASE_FOLDER_ID,
            latest_year: {
                id: latestYear.id,
                name: latestYear.name,
                modified: latestYear.properties?.modified || ''
            },
            latest_month: {
                id: latestMonth.id,
                name: latestMonth.name,
                modified: latestMonth.properties?.modified || ''
            },
            import_duties_file: {
                id: importDutiesFile.id,
                name: importDutiesFile.name,
                size: Number(importDutiesFile.properties?.size || 0),
                modified: importDutiesFile.properties?.modified || '',
                mimetype: importDutiesFile.properties?.mimetype || '',
                download_url: buildCircabcDirectDownloadUrl(importDutiesFile)
            },
            parser_candidate: true,
            reason: 'Official CIRCABC folder is reachable and the latest Duties Import 01-99.xlsx file can be located anonymously.'
        };
    } catch (error) {
        return {
            checked: true,
            ok: false,
            checked_at: checkedAt,
            root_folder_id: EU_TARIC_FULL_DATABASE_FOLDER_ID,
            parser_candidate: false,
            error: error.message,
            reason: 'Could not locate the latest TARIC full database import duties file.'
        };
    }
}

function buildOfficialProbeBase() {
    return {
        checked: false,
        ok: null,
        consultation_url: EU_TARIC_CONSULTATION_URL,
        full_database_url: EU_TARIC_FULL_DATABASE_URL,
        full_database_probe: {
            checked: false,
            ok: null,
            parser_candidate: false,
            reason: 'Full database folder probe not requested.'
        },
        last_taric_update: '',
        status_code: null,
        machine_parser_ready: false,
        reason: 'Live TARIC probe not requested.'
    };
}

async function probeEuTaricOfficialSource({ fetcher = fetchText, inspectFullDatabase = false } = {}) {
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetcher(EU_TARIC_CONSULTATION_URL);
        const parsed = parseEuTaricConsultationHtml(response.body);
        const fullDatabaseUrl = parsed.full_database_url || EU_TARIC_FULL_DATABASE_URL;
        const fullDatabaseProbe = inspectFullDatabase
            ? await probeEuTaricFullDatabase({ fetcher })
            : buildOfficialProbeBase().full_database_probe;
        return {
            ...buildOfficialProbeBase(),
            checked: true,
            ok: Boolean(parsed.last_taric_update && fullDatabaseUrl) && (!inspectFullDatabase || fullDatabaseProbe.ok),
            checked_at: checkedAt,
            status_code: response.status_code || 200,
            full_database_url: fullDatabaseUrl,
            full_database_probe: fullDatabaseProbe,
            last_taric_update: parsed.last_taric_update,
            page_title: parsed.title,
            machine_parser_ready: Boolean(fullDatabaseProbe.parser_candidate),
            reason: parsed.last_taric_update
                ? 'Official TARIC consultation page is reachable and exposes an update date. Exact duty extraction still needs a verified TARIC database parser.'
                : 'Official TARIC consultation page is reachable, but the update date could not be parsed.'
        };
    } catch (error) {
        return {
            ...buildOfficialProbeBase(),
            checked: true,
            ok: false,
            checked_at: checkedAt,
            error: error.message,
            reason: 'Official TARIC consultation page could not be reached by the updater.'
        };
    }
}

async function probeEuTaricReadiness({ live = false, inspectFullDatabase = false, fetcher = fetchText } = {}) {
    const source = getSource('EU');
    const rules = getEuDutyRules();
    const prefixes = Array.from(new Set(rules.flatMap(rule => rule.hs_prefixes || []))).sort();
    const officialProbe = live
        ? await probeEuTaricOfficialSource({ fetcher, inspectFullDatabase })
        : buildOfficialProbeBase();
    return {
        ok: Boolean(source) && rules.length > 0 && prefixes.length > 0,
        country: 'EU',
        source_status: source?.source_status || 'missing',
        official_url: source?.official_url || EU_TARIC_URL,
        consultation_url: EU_TARIC_CONSULTATION_URL,
        machine_readable: source?.machine_readable || false,
        maintained_rule_count: rules.length,
        maintained_hs_prefixes: prefixes,
        writes_rates: true,
        writes_official_machine_rates: false,
        official_probe: officialProbe,
        next_action: source?.next_action || 'Add EU source roadmap before updating.',
        status_reason: source?.status_reason || ''
    };
}

function decodeXmlText(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function parseTaricSheetRows(sheetXml, { prefixes = [] } = {}) {
    const wanted = prefixes.map(prefix => String(prefix || ''));
    const rows = [];
    const rowRegex = /<row\b[\s\S]*?<\/row>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(String(sheetXml || '')))) {
        const rowXml = rowMatch[0];
        const values = {};
        const cellRegex = /<c\b[^>]*r="([A-Z]+)\d+"[^>]*(?:>([\s\S]*?)<\/c>|\/>)/g;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowXml))) {
            const textMatch = String(cellMatch[2] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
            values[cellMatch[1]] = decodeXmlText(textMatch ? textMatch[1] : '').trim();
        }
        const goodsCode = values.A || '';
        if (!wanted.length || wanted.some(prefix => goodsCode.startsWith(prefix))) {
            rows.push({
                goods_code: goodsCode,
                additional_code: values.B || '',
                order_number: values.C || '',
                start_date: values.D || '',
                end_date: values.E || '',
                reduction_indicator: values.F || '',
                origin: values.G || '',
                measure_type: values.H || '',
                legal_base: values.I || '',
                duty: values.J || '',
                origin_code: values.K || '',
                measure_type_code: values.L || ''
            });
        }
    }
    return rows;
}

function parseTaricPercentDuty(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
    return match ? Number((Number(match[1]) / 100).toFixed(8)) : null;
}

function summarizeThirdCountryDutyRates(rows, hsPrefix) {
    const matching = (rows || []).filter(row => (
        String(row.goods_code || '').startsWith(String(hsPrefix || ''))
        && row.origin_code === '1011'
        && row.measure_type_code === '103'
        && /third country duty/i.test(row.measure_type || '')
    )).map(row => ({
        goods_code: row.goods_code,
        duty: row.duty,
        base_rate: parseTaricPercentDuty(row.duty)
    })).filter(row => row.base_rate !== null);
    const uniqueRates = Array.from(new Set(matching.map(row => row.base_rate))).sort((a, b) => a - b);
    return {
        hs_prefix: String(hsPrefix || ''),
        ok: matching.length > 0,
        exact_single_rate: uniqueRates.length === 1,
        unique_base_rates: uniqueRates,
        rows: matching
    };
}

function selectEuThirdCountryDutyRate(rows, hsPrefix) {
    const summary = summarizeThirdCountryDutyRates(rows, hsPrefix);
    const sampleCodes = Array.from(new Set(summary.rows.map(row => row.goods_code).filter(Boolean))).slice(0, 8);
    if (!summary.rows.length) {
        return {
            ...summary,
            selected: false,
            scope_check_required: true,
            status: 'no_third_country_duty_found',
            reason: 'No ERGA OMNES third-country-duty row was found for this HS prefix in the parsed TARIC import duties rows.',
            sample_goods_codes: sampleCodes
        };
    }
    if (summary.unique_base_rates.length === 1) {
        const baseRate = summary.unique_base_rates[0];
        return {
            ...summary,
            selected: true,
            scope_check_required: false,
            status: 'exact_single_rate',
            base_rate: baseRate,
            source_rate_text: `TARIC third-country duty: ${(baseRate * 100).toFixed(3)}%`,
            source_hts: `${String(hsPrefix || '')} (TARIC ERGA OMNES third-country duty)`,
            reason: 'All parsed ERGA OMNES third-country-duty rows under this prefix share one duty rate.',
            sample_goods_codes: sampleCodes
        };
    }
    return {
        ...summary,
        selected: false,
        scope_check_required: true,
        status: 'multiple_rates_need_taric10',
        reason: 'Multiple ERGA OMNES third-country-duty rates were found under this HS prefix; require the exact TARIC goods code before using a rate.',
        sample_goods_codes: sampleCodes
    };
}

function buildEuOfficialRateCandidate(rows, hsPrefix) {
    const selection = selectEuThirdCountryDutyRate(rows, hsPrefix);
    if (!selection.selected) {
        return {
            ok: false,
            hs_prefix: selection.hs_prefix,
            source_status: 'scope_check_required',
            status: selection.status,
            reason: selection.reason,
            unique_base_rates: selection.unique_base_rates,
            sample_goods_codes: selection.sample_goods_codes
        };
    }
    return {
        ok: true,
        hs_prefix: selection.hs_prefix,
        source_status: 'official_source_candidate',
        base_rate: selection.base_rate,
        source_rate_text: selection.source_rate_text,
        source_hts: selection.source_hts,
        reason: selection.reason,
        sample_goods_codes: selection.sample_goods_codes
    };
}

function parseTaricWorkbookRows(workbookPath, { prefixes = [] } = {}) {
    if (!workbookPath) {
        return [];
    }
    const sheetXml = execFileSync('unzip', ['-p', workbookPath, 'xl/worksheets/sheet1.xml'], {
        encoding: 'utf8',
        maxBuffer: 150 * 1024 * 1024
    });
    return parseTaricSheetRows(sheetXml, { prefixes });
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

function buildEuOfficialCandidateForRule(rule, taricRows = []) {
    const prefixes = rule.hs_prefixes || [];
    if (!taricRows.length || !prefixes.length) {
        return null;
    }
    const candidates = prefixes.map(prefix => buildEuOfficialRateCandidate(taricRows, prefix));
    const successful = candidates.filter(candidate => candidate.ok);
    if (!successful.length) {
        return {
            ok: false,
            rule: rule.id,
            reason: 'No HS prefix on this rule produced an unambiguous official TARIC candidate.',
            candidates
        };
    }
    if (successful.length !== candidates.length) {
        return {
            ok: false,
            rule: rule.id,
            reason: 'At least one HS prefix on this rule still requires exact TARIC scope, so the rule remains on benchmark status.',
            candidates
        };
    }
    const uniqueRates = Array.from(new Set(successful.map(candidate => candidate.base_rate))).sort((a, b) => a - b);
    if (uniqueRates.length !== 1) {
        return {
            ok: false,
            rule: rule.id,
            reason: 'Multiple HS prefixes in this rule produced different official TARIC rates. Split the rule before auto-applying official rates.',
            candidates
        };
    }
    return {
        ok: true,
        rule: rule.id,
        base_rate: uniqueRates[0],
        candidates,
        reason: 'All maintained HS prefixes on this rule produced one consistent official TARIC candidate rate.',
        source_hts: successful.map(candidate => candidate.source_hts).join(' / '),
        source_rate_text: successful[0].source_rate_text,
        source_note: 'Official TARIC ERGA OMNES third-country-duty candidate selected because each maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.'
    };
}

function applyOfficialCandidateToRule(rule, candidate, checkedAt) {
    const changes = [];
    if (Number(rule.base_rate) !== candidate.base_rate) {
        changes.push({
            field: 'base_rate',
            old_value: rule.base_rate,
            new_value: candidate.base_rate
        });
        rule.base_rate = candidate.base_rate;
    }
    const updates = {
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_note: candidate.source_note,
        source_hts: candidate.source_hts,
        source_rate_text: candidate.source_rate_text,
        source_url: EU_TARIC_CONSULTATION_URL,
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

function formatCandidateScopeRateText(candidate) {
    const rows = candidate?.candidates || [];
    const row = rows[0] || candidate || {};
    const rates = Array.isArray(row.unique_base_rates) ? row.unique_base_rates : [];
    if (rates.length) {
        return `Exact TARIC code required; parsed ERGA OMNES third-country-duty rates include ${rates.map(rate => `${(rate * 100).toFixed(3)}%`).join(', ')}.`;
    }
    return 'Exact TARIC code required before using an official EU duty rate.';
}

function applyTaricScopeCheckToRule(rule, candidate, benchmark, checkedAt) {
    const changes = [];
    refreshVatLayer(rule, benchmark);

    const prefix = (rule.hs_prefixes || [])[0] || '';
    const updates = {
        source_status: 'scope_check_required',
        confidence: 'Scope check required',
        source_note: candidate.reason || 'Official TARIC workbook was parsed, but this HS prefix needs a more exact TARIC code before an official rate can be used.',
        source_hts: prefix ? `${prefix} (TARIC scope check required)` : 'TARIC scope check required',
        source_rate_text: formatCandidateScopeRateText(candidate),
        source_url: EU_TARIC_CONSULTATION_URL,
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

function compactOfficialCandidateOutcome(outcome) {
    if (!outcome) {
        return null;
    }
    return {
        ok: Boolean(outcome.ok),
        rule: outcome.rule || '',
        base_rate: Number.isFinite(outcome.base_rate) ? outcome.base_rate : null,
        reason: outcome.reason || '',
        candidates: (outcome.candidates || []).map(candidate => ({
            hs_prefix: candidate.hs_prefix || '',
            ok: Boolean(candidate.ok),
            status: candidate.status || candidate.source_status || '',
            base_rate: Number.isFinite(candidate.base_rate) ? candidate.base_rate : null,
            unique_base_rates: candidate.unique_base_rates || [],
            sample_goods_codes: (candidate.sample_goods_codes || []).slice(0, 3)
        }))
    };
}

function updateEuRules({ dryRun = false, taricRows = null, taricWorkbookPath = '' } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const checkedAt = new Date().toISOString();
    const changes = [];
    const errors = [];
    const candidateOutcomes = [];
    const euRules = getEuDutyRules(payload);
    const prefixes = Array.from(new Set(euRules.flatMap(rule => rule.hs_prefixes || []))).sort();
    let parsedTaricRows = Array.isArray(taricRows) ? taricRows : [];

    if (!parsedTaricRows.length && taricWorkbookPath) {
        try {
            parsedTaricRows = parseTaricWorkbookRows(taricWorkbookPath, { prefixes });
        } catch (error) {
            errors.push({
                source: 'EU TARIC workbook',
                error: `Could not parse TARIC workbook: ${error.message}`
            });
        }
    }

    for (const rule of payload.rules || []) {
        const benchmark = EU_BENCHMARKS[rule.import_country];
        if (!benchmark) continue;
        try {
            const officialCandidate = buildEuOfficialCandidateForRule(rule, parsedTaricRows);
            const shouldApplyScopeCheck = Boolean(parsedTaricRows.length && officialCandidate && !officialCandidate.ok && (rule.hs_prefixes || []).length === 1);
            const ruleChanges = officialCandidate?.ok
                ? applyOfficialCandidateToRule(rule, officialCandidate, checkedAt)
                : shouldApplyScopeCheck
                    ? applyTaricScopeCheckToRule(rule, officialCandidate, benchmark, checkedAt)
                    : applyBenchmarkToRule(rule, benchmark, checkedAt);
            if (officialCandidate) {
                candidateOutcomes.push(officialCandidate);
            }
            if (ruleChanges.length) {
                changes.push({
                    rule: rule.id,
                    import_country: rule.import_country,
                    mode: officialCandidate?.ok ? 'official-candidate' : shouldApplyScopeCheck ? 'scope-check' : 'benchmark',
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
        writes_official_machine_rates: candidateOutcomes.some(outcome => outcome.ok),
        official_candidate_rows: parsedTaricRows.length,
        official_candidate_outcomes: candidateOutcomes.map(compactOfficialCandidateOutcome),
        changes,
        errors
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_eu_taric_benchmark_sync;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const probeOnly = process.argv.includes('--probe');
    const probeLive = process.argv.includes('--probe-live');
    const probeFull = process.argv.includes('--probe-full');
    const taricWorkbookIndex = process.argv.indexOf('--taric-workbook');
    const taricWorkbookPath = taricWorkbookIndex >= 0 ? process.argv[taricWorkbookIndex + 1] : '';
    const result = probeOnly || probeLive
        ? await probeEuTaricReadiness({ live: probeLive, inspectFullDatabase: probeFull })
        : updateEuRules({ dryRun, taricWorkbookPath });
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
    EU_BENCHMARKS,
    EU_TARIC_CONSULTATION_URL,
    EU_TARIC_FULL_DATABASE_URL,
    EU_TARIC_FULL_DATABASE_FOLDER_ID,
    buildCircabcChildrenUrl,
    pickLatestNumberedFolder,
    pickTaricImportDutiesFile,
    buildCircabcDirectDownloadUrl,
    parseEuTaricConsultationHtml,
    parseTaricSheetRows,
    parseTaricPercentDuty,
    summarizeThirdCountryDutyRates,
    selectEuThirdCountryDutyRate,
    buildEuOfficialRateCandidate,
    parseTaricWorkbookRows,
    buildEuOfficialCandidateForRule,
    applyOfficialCandidateToRule,
    applyTaricScopeCheckToRule,
    formatCandidateScopeRateText,
    compactOfficialCandidateOutcome,
    probeEuTaricFullDatabase,
    probeEuTaricOfficialSource,
    probeEuTaricReadiness,
    updateEuRules,
    applyBenchmarkToRule
};
