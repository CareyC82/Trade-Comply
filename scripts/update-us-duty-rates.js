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

async function updateUsRules({ dryRun = false } = {}) {
    const payload = readJson(DUTY_RATES_PATH);
    const rules = payload.rules || [];
    const changes = [];
    const errors = [];

    for (const rule of rules) {
        if (rule.import_country !== 'US') continue;
        const prefix = chooseBestRulePrefix(rule.hs_prefixes || []);
        if (!prefix) {
            errors.push({ rule: rule.id, prefix: '', error: 'No HS prefix configured' });
            continue;
        }
        {
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
    }

    payload.updated_at = new Date().toISOString().slice(0, 10);
    payload.last_usitc_sync_at = new Date().toISOString();
    payload.last_usitc_sync = {
        ok: errors.length === 0,
        changes,
        errors
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
    chooseMostSpecificRate,
    chooseBestRulePrefix,
    updateUsRules,
    summarizeDutyRateCoverage
};
