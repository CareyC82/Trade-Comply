#!/usr/bin/env node
/**
 * Update indicative US duty rules from the official USITC HTS REST export API.
 *
 * The script intentionally keeps additional duties (e.g. Section 301 / AD-CVD flags)
 * in data/duty-rates.json because those layers often require separate Chapter 99,
 * USTR, CBP, and case-scope review. It updates only the HTS general base rate
 * when a clean ad-valorem rate can be parsed from USITC HTS data.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const USITC_EXPORT_URL = 'https://hts.usitc.gov/reststop/exportList';
const CONSUMER_MODELS_PATH = path.join(ROOT, 'lib', 'wearable-product-models.js');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalizeHs(value) {
    return String(value || '').replace(/\D/g, '');
}

function formatHtsQuery(value) {
    const hs = normalizeHs(value);
    if (hs.length <= 4) return hs;
    if (hs.length <= 6) return `${hs.slice(0, 4)}.${hs.slice(4)}`;
    if (hs.length <= 8) return `${hs.slice(0, 4)}.${hs.slice(4, 6)}.${hs.slice(6)}`;
    return `${hs.slice(0, 4)}.${hs.slice(4, 6)}.${hs.slice(6, 8)}.${hs.slice(8)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
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
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
                }
            });
        }).on('error', reject);
    });
}

function buildExportUrl(from, to) {
    const params = new URLSearchParams({
        from,
        to,
        format: 'JSON',
        styles: 'false'
    });
    return `${USITC_EXPORT_URL}?${params.toString()}`;
}

function parsePercentRate(rateText) {
    const text = String(rateText || '').trim();
    if (!text) return null;
    if (/^free$/i.test(text)) return 0;
    const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!match) return null;
    return Number(match[1]) / 100;
}

function pickRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
}

function pickField(row, names) {
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(row, name)) {
            return row[name];
        }
    }
    const entries = Object.entries(row);
    for (const [key, value] of entries) {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (names.some(name => normalized === name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
            return value;
        }
    }
    return '';
}

function extractHtsNumber(row) {
    const base = pickField(row, [
        'htsno',
        'hts_number',
        'HTS Number',
        'heading_subheading',
        'Heading/Subheading'
    ]);
    const suffix = pickField(row, [
        'stat_suffix',
        'Stat Suffix',
        'statistical_suffix'
    ]);
    return normalizeHs(`${base}${suffix}`);
}

function extractGeneralRate(row) {
    return pickField(row, [
        'general',
        'general_rate',
        'General Rate of Duty',
        'general_rate_of_duty'
    ]);
}

function extractDescription(row) {
    return String(pickField(row, ['description', 'Description', 'article_description']) || '').trim();
}

function parseExactAdValoremRate(rateText) {
    const text = String(rateText || '').trim();
    if (!text) return null;
    if (/^free$/i.test(text)) return 0;
    const match = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
    return match ? Number(match[1]) / 100 : null;
}

function extractExactRateRows(rows, hsPrefix) {
    const prefix = normalizeHs(hsPrefix);
    const inheritedRates = [];
    const exactRows = [];
    for (const row of rows) {
        const indent = Math.max(0, Number(pickField(row, ['indent', 'Indent'])) || 0);
        inheritedRates.length = indent + 1;
        const rawRateText = String(extractGeneralRate(row) || '').trim();
        const ownRate = parseExactAdValoremRate(rawRateText);
        if (rawRateText) inheritedRates[indent] = ownRate === null ? undefined : { rate: ownRate, rateText: rawRateText };
        const inherited = ownRate !== null
            ? { rate: ownRate, rateText: rawRateText }
            : (rawRateText ? null : [...inheritedRates].reverse().find(Boolean) || null);
        const hts = extractHtsNumber(row);
        if (hts.length !== 10 || !hts.startsWith(prefix) || !inherited) continue;
        exactRows.push({
            hsCode: hts,
            baseRate: inherited.rate,
            rateText: inherited.rateText,
            description: extractDescription(row)
        });
    }
    return exactRows.filter((item, index, items) => items.findIndex((other) => other.hsCode === item.hsCode) === index);
}

function chooseMostSpecificRate(rows, hsPrefix) {
    const target = normalizeHs(hsPrefix);
    const candidates = rows
        .map(row => ({
            row,
            hts: extractHtsNumber(row),
            rateText: extractGeneralRate(row)
        }))
        .filter(item => item.hts.startsWith(target) || target.startsWith(item.hts))
        .map(item => ({
            ...item,
            rate: parsePercentRate(item.rateText)
        }))
        .filter(item => item.rate !== null)
        .sort((a, b) => b.hts.length - a.hts.length);
    return candidates[0] || null;
}

function chooseBestRulePrefix(prefixes = []) {
    return (Array.isArray(prefixes) ? prefixes : [])
        .map(prefix => normalizeHs(prefix))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length || a.localeCompare(b))[0] || '';
}

function consumerCatalogPrefixes() {
    const models = require(CONSUMER_MODELS_PATH);
    return Array.from(new Set(Object.values(models.products || {})
        .flatMap((product) => product.candidateHs || [])
        .map(normalizeHs)
        .filter(Boolean))).sort();
}

function ensureConsumerCatalogRule(rules) {
    const id = 'US-GLOBAL-CONSUMER-ELECTRONICS-GENERAL-DUTY';
    let rule = rules.find((item) => item.id === id);
    const hsPrefixes = consumerCatalogPrefixes();
    if (!rule) {
        rule = {
            id,
            import_country: 'US',
            origin_country: '*',
            hs_prefixes: hsPrefixes,
            label: 'US current electronics catalog general duty',
            base_rate: null,
            additional_rate: 0,
            add_on_layers: [],
            trade_remedy: 'General Column 1 duty only. Confirm origin-specific Chapter 99 duties, exclusions, AD/CVD scope and special-program eligibility separately.',
            confidence: 'Official exact HTS10 lines',
            source_status: 'official_source_checked',
            source_note: 'USITC exact 10-digit tariff lines maintained for the current TraceWize electronics catalog. Product classification remains a user or professional determination.',
            source_url: 'https://hts.usitc.gov/',
            exact_code_overrides: []
        };
        rules.push(rule);
    } else {
        rule.hs_prefixes = hsPrefixes;
    }
    return rule;
}

function buildUniformPlanningRows(prefixes, exactRows, checkedAt) {
    return (prefixes || []).map(normalizeHs).filter(Boolean).flatMap((prefix) => {
        const matches = exactRows.filter((row) => row.hsCode.startsWith(prefix));
        const rates = [...new Set(matches.map((row) => row.baseRate))];
        if (!matches.length || rates.length !== 1) return [];
        return [{
            hs_code: prefix,
            base_rate: rates[0],
            source_status: 'official_source_checked',
            confidence: 'Official subheading planning signal',
            source_note: 'All currently parsed USITC HTS10 children under this prefix share the same simple general Column 1 rate. The prefix remains a planning signal, not a filing-grade classification.',
            source_hts: `${formatHtsQuery(prefix)} (planning prefix)`,
            source_rate_text: `${rates[0] === 0 ? 'Free' : `${(rates[0] * 100).toFixed(3)}%`} across parsed HTS10 children`,
            source_url: matches[0].sourceUrl,
            last_checked_at: checkedAt
        }];
    });
}

function mergeExactOverrides(existingRows, exactRows, checkedAt, prefixes = []) {
    const retainedPlanningRows = (existingRows || [])
        .filter((row) => normalizeHs(row.hs_code).length < 10);
    const generatedPlanningRows = buildUniformPlanningRows(prefixes, exactRows, checkedAt)
        .filter((row) => !retainedPlanningRows.some((existing) => normalizeHs(existing.hs_code) === row.hs_code));
    return [...retainedPlanningRows, ...generatedPlanningRows, ...exactRows.map((row) => ({
        hs_code: row.hsCode,
        base_rate: row.baseRate,
        description: row.description,
        source_status: 'official_source_checked',
        confidence: 'Official exact HTS10 line',
        source_note: 'Current USITC general Column 1 rate for this exact 10-digit HTS line. Origin-specific Chapter 99 duties, trade remedies, exclusions and special rates remain separate.',
        source_hts: formatHtsQuery(row.hsCode),
        source_rate_text: row.rateText,
        source_url: row.sourceUrl,
        last_checked_at: checkedAt
    }))];
}

async function fetchRateForPrefix(prefix) {
    const normalized = normalizeHs(prefix);
    const rangeStart = formatHtsQuery(normalized);
    const rangeEnd = normalized.length <= 4
        ? `${normalized}.99`
        : `${formatHtsQuery(normalized)}.99`;
    const payload = await fetchJson(buildExportUrl(rangeStart, rangeEnd));
    const rows = pickRows(payload);
    const match = chooseMostSpecificRate(rows, normalized);
    return match ? {
        baseRate: match.rate,
        hts: match.hts,
        rateText: String(match.rateText || '').trim()
    } : null;
}

async function fetchExactRatesForPrefix(prefix) {
    const normalized = normalizeHs(prefix);
    const rangeStart = formatHtsQuery(normalized);
    const rangeEnd = normalized.length <= 4
        ? `${normalized}.99`
        : `${formatHtsQuery(normalized)}.99`;
    const sourceUrl = buildExportUrl(rangeStart, rangeEnd);
    const payload = await fetchJson(sourceUrl);
    const rows = pickRows(payload);
    return { sourceUrl, rows: extractExactRateRows(rows, normalized) };
}

async function updateUsRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const rules = payload.rules || [];
    ensureConsumerCatalogRule(rules);
    const changes = [];
    const errors = [];
    const exactCoverage = [];
    const prefixCache = new Map();
    const checkedAt = new Date().toISOString();

    async function exactPayload(prefix) {
        const normalized = normalizeHs(prefix);
        if (!prefixCache.has(normalized)) {
            prefixCache.set(normalized, fetchExactRatesForPrefix(normalized).then(async (result) => {
                await sleep(150);
                return result;
            }));
        }
        return prefixCache.get(normalized);
    }

    for (const rule of rules) {
        if (rule.import_country !== 'US') continue;
        const prefix = chooseBestRulePrefix(rule.hs_prefixes || []);
        if (!prefix) {
            errors.push({ rule: rule.id, prefix: '', error: 'No HS prefix configured' });
            continue;
        }
        if (rule.id !== 'US-GLOBAL-CONSUMER-ELECTRONICS-GENERAL-DUTY') {
            try {
                const rate = await fetchRateForPrefix(prefix);
                await sleep(150);
                if (!rate) {
                    errors.push({ rule: rule.id, prefix, error: 'No parseable general rate found' });
                    continue;
                }
                if (Number(rule.base_rate) !== rate.baseRate) {
                    changes.push({
                        rule: rule.id,
                        prefix,
                        old_base_rate: rule.base_rate,
                        new_base_rate: rate.baseRate,
                        source_hts: rate.hts,
                        source_rate_text: rate.rateText
                    });
                    rule.base_rate = rate.baseRate;
                }
                rule.last_checked_at = new Date().toISOString();
                rule.source_status = 'official_source_checked';
                rule.source_hts = rate.hts;
                rule.source_rate_text = rate.rateText;
                rule.source_url = buildExportUrl(prefix, `${normalizeHs(prefix)}99`);
            } catch (error) {
                errors.push({ rule: rule.id, prefix, error: error.message });
            }
        }
        const exactRows = [];
        const exactErrors = [];
        const prefixCoverage = [];
        for (const configuredPrefix of rule.hs_prefixes || []) {
            try {
                const result = await exactPayload(configuredPrefix);
                exactRows.push(...result.rows.map((row) => ({ ...row, sourceUrl: result.sourceUrl })));
                prefixCoverage.push({ prefix: normalizeHs(configuredPrefix), exact_hts10_count: result.rows.length });
            } catch (error) {
                exactErrors.push({ prefix: normalizeHs(configuredPrefix), error: error.message });
            }
        }
        const dedupedExactRows = exactRows
            .filter((row, index, rows) => rows.findIndex((other) => other.hsCode === row.hsCode) === index)
            .sort((a, b) => a.hsCode.localeCompare(b.hsCode));
        if (dedupedExactRows.length) {
            const nextOverrides = mergeExactOverrides(rule.exact_code_overrides, dedupedExactRows, checkedAt, rule.hs_prefixes);
            if (JSON.stringify(rule.exact_code_overrides || []) !== JSON.stringify(nextOverrides)) {
                changes.push({
                    rule: rule.id,
                    field: 'exact_code_overrides',
                    old_count: (rule.exact_code_overrides || []).length,
                    new_count: nextOverrides.length
                });
                rule.exact_code_overrides = nextOverrides;
            }
            rule.last_checked_at = checkedAt;
        }
        exactCoverage.push({
            rule: rule.id,
            exact_hts10_count: dedupedExactRows.length,
            covered_prefix_count: prefixCoverage.filter((item) => item.exact_hts10_count > 0).length,
            configured_prefix_count: prefixCoverage.length,
            uncovered_prefixes: prefixCoverage.filter((item) => item.exact_hts10_count === 0).map((item) => item.prefix),
            retained_last_good: dedupedExactRows.length === 0 && (rule.exact_code_overrides || []).length > 0,
            errors: exactErrors
        });
        errors.push(...exactErrors.map((item) => ({ rule: rule.id, ...item })));
    }

    payload.updated_at = new Date().toISOString().slice(0, 10);
    payload.last_usitc_sync_at = new Date().toISOString();
    payload.last_usitc_sync = {
        ok: errors.length === 0,
        changes,
        errors,
        exact_coverage: exactCoverage
    };

    if (!dryRun) {
        writeJson(DUTY_RATES_PATH, payload);
    }

    return payload.last_usitc_sync;
}

function summarizeDutyRateCoverage(payload = readJson(DUTY_RATES_PATH)) {
    const rules = payload.rules || [];
    const countries = new Map();
    for (const rule of rules) {
        const country = rule.import_country || 'UNKNOWN';
        const current = countries.get(country) || {
            import_country: country,
            rule_count: 0,
            hs_prefixes: new Set(),
            official_source_count: 0,
            indicative_count: 0
        };
        current.rule_count += 1;
        (rule.hs_prefixes || []).forEach(prefix => current.hs_prefixes.add(prefix));
        if (rule.source_status === 'official_source_checked') {
            current.official_source_count += 1;
        } else {
            current.indicative_count += 1;
        }
        countries.set(country, current);
    }

    return {
        updated_at: payload.updated_at || '',
        last_usitc_sync_at: payload.last_usitc_sync_at || '',
        country_count: countries.size,
        rule_count: rules.length,
        countries: Array.from(countries.values()).map(item => ({
            ...item,
            hs_prefixes: Array.from(item.hs_prefixes).sort()
        })).sort((a, b) => a.import_country.localeCompare(b.import_country))
    };
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const result = await updateUsRules({ dryRun });
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
    parsePercentRate,
    formatHtsQuery,
    pickRows,
    extractHtsNumber,
    extractGeneralRate,
    extractDescription,
    parseExactAdValoremRate,
    extractExactRateRows,
    chooseMostSpecificRate,
    chooseBestRulePrefix,
    consumerCatalogPrefixes,
    ensureConsumerCatalogRule,
    buildUniformPlanningRows,
    mergeExactOverrides,
    fetchExactRatesForPrefix,
    updateUsRules,
    summarizeDutyRateCoverage
};
