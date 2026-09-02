#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    parseExactTariffRows,
    applyExactTariffRows
} = require('../lib/exact-tariff-lines');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const FEEDS = {
    EU: 'EU_TARIC_EXACT_LINES_URL',
    CN: 'CN_CUSTOMS_EXACT_TARIFF_URL',
    SG: 'SG_AHTN_EXACT_TARIFF_URL',
    MX: 'MX_TIGIE_NICO_EXACT_TARIFF_URL',
    AU: 'AU_ABF_EXACT_TARIFF_URL',
    NZ: 'NZ_WORKING_TARIFF_EXACT_URL'
};

async function fetchOfficialPayload(url, fetchImpl = global.fetch) {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
}

async function fetchSingaporeOfficialPayload({ dutyPayload, fetchImpl, checkedAt }) {
    const {
        SG_STCCED_PDF_URL,
        SG_DUTIABLE_GOODS_URL,
        extractPdfText,
        buildSingaporeExactPayload
    } = require('../lib/singapore-stcced');
    const [pdfResponse, scopeResponse] = await Promise.all([
        fetchImpl(SG_STCCED_PDF_URL),
        fetchImpl(SG_DUTIABLE_GOODS_URL, { headers: { accept: 'text/html' } })
    ]);
    if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status} for Singapore STCCED PDF`);
    if (!scopeResponse.ok) throw new Error(`HTTP ${scopeResponse.status} for Singapore dutiable-goods scope`);
    const tempPath = path.join(os.tmpdir(), `tracewize-stcced-${process.pid}-${Date.now()}.pdf`);
    try {
        fs.writeFileSync(tempPath, Buffer.from(await pdfResponse.arrayBuffer()));
        const text = await extractPdfText(tempPath);
        const prefixes = [...new Set((dutyPayload.rules || [])
            .filter((rule) => rule.import_country === 'SG')
            .flatMap((rule) => rule.hs_prefixes || []))].sort();
        return buildSingaporeExactPayload({
            text,
            dutiableHtml: await scopeResponse.text(),
            prefixes,
            checkedAt
        });
    } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
}

async function fetchMexicoOfficialPayload({ dutyPayload, fetchImpl, checkedAt }) {
    const {
        MX_TIGIE_NICO_URL,
        parseMexicoTigieWorkbook
    } = require('../lib/mexico-tigie-nico');
    const response = await fetchImpl(MX_TIGIE_NICO_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status} for Mexico TIGIE/NICO workbook`);
    const prefixes = [...new Set((dutyPayload.rules || [])
        .filter((rule) => rule.import_country === 'MX')
        .flatMap((rule) => rule.hs_prefixes || []))].sort();
    return parseMexicoTigieWorkbook(Buffer.from(await response.arrayBuffer()), { prefixes, checkedAt });
}

async function fetchAustraliaOfficialPayload({ dutyPayload, fetchImpl, checkedAt }) {
    const { buildAustraliaExactPayload } = require('../lib/australia-abf-tariff');
    const prefixes = [...new Set((dutyPayload.rules || [])
        .filter((rule) => rule.import_country === 'AU')
        .flatMap((rule) => rule.hs_prefixes || []))].sort();
    return buildAustraliaExactPayload(prefixes, { fetchImpl, checkedAt });
}

async function fetchNewZealandOfficialPayload({ dutyPayload, fetchImpl, checkedAt, extractPdfTextImpl }) {
    const {
        NZ_WORKING_TARIFF_URL,
        NZ_SECTIONS,
        CHAPTER_SECTION,
        parseNzWorkingTariffText,
        extractPdfText
    } = require('../lib/new-zealand-working-tariff');
    const prefixes = [...new Set((dutyPayload.rules || [])
        .filter((rule) => rule.import_country === 'NZ')
        .flatMap((rule) => rule.hs_prefixes || []))].sort();
    const sections = [...new Set(prefixes.map((prefix) => CHAPTER_SECTION[Number(String(prefix).slice(0, 2))]))];
    if (sections.some((section) => !section)) throw new Error('NZ parser has an unsupported maintained tariff chapter.');
    const rows = [];
    for (const section of sections) {
        const url = NZ_SECTIONS[section];
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for NZ Working Tariff section ${section}`);
        const tempPath = path.join(os.tmpdir(), `tracewize-nz-${section}-${process.pid}-${Date.now()}.pdf`);
        try {
            fs.writeFileSync(tempPath, Buffer.from(await response.arrayBuffer()));
            const text = await (extractPdfTextImpl || extractPdfText)(tempPath);
            const scopedPrefixes = prefixes.filter((prefix) => CHAPTER_SECTION[Number(String(prefix).slice(0, 2))] === section);
            rows.push(...parseNzWorkingTariffText(text, {
                prefixes: scopedPrefixes,
                sourceUrl: url,
                effectiveFrom: String(checkedAt).slice(0, 10)
            }));
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    }
    const missing = prefixes.filter((prefix) => !rows.some((row) => row.hs_code.startsWith(String(prefix).replace(/\D/g, ''))));
    if (missing.length) throw new Error(`NZ exact tariff parser returned no rows for maintained prefix(es): ${missing.join(', ')}`);
    return {
        complete: true,
        country: 'NZ',
        revision: `Working Tariff checked ${String(checkedAt).slice(0, 10)}`,
        source: { name: 'New Zealand Customs Service Working Tariff', url: NZ_WORKING_TARIFF_URL },
        rows
    };
}

async function syncExactNationalTariffs({
    dutyPayload = JSON.parse(fs.readFileSync(DUTY_RATES_PATH, 'utf8')),
    env = process.env,
    fetchImpl = global.fetch,
    countries = Object.keys(FEEDS),
    dryRun = false
} = {}) {
    const checkedAt = new Date().toISOString();
    const results = [];
    for (const country of countries) {
        const envName = FEEDS[country];
        const url = String(env[envName] || '').trim();
        const directOfficial = ['CN', 'SG', 'MX', 'AU', 'NZ'].includes(country);
        if (!url && !directOfficial) {
            results.push({ country, ok: true, skipped: true, reason: `${envName} is not configured` });
            continue;
        }
        try {
            let raw;
            if (url) {
                raw = await fetchOfficialPayload(url, fetchImpl);
            } else if (country === 'SG') {
                raw = await fetchSingaporeOfficialPayload({ dutyPayload, fetchImpl, checkedAt });
            } else if (country === 'MX') {
                raw = await fetchMexicoOfficialPayload({ dutyPayload, fetchImpl, checkedAt });
            } else if (country === 'AU') {
                raw = await fetchAustraliaOfficialPayload({ dutyPayload, fetchImpl, checkedAt });
            } else if (country === 'NZ') {
                raw = await fetchNewZealandOfficialPayload({ dutyPayload, fetchImpl, checkedAt });
            } else {
                const { buildChinaCustomsExactPayload } = require('../lib/china-customs-tariff');
                const prefixes = [...new Set((dutyPayload.rules || [])
                    .filter((rule) => rule.import_country === 'CN')
                    .flatMap((rule) => rule.hs_prefixes || []))].sort();
                raw = await buildChinaCustomsExactPayload(prefixes, { fetchImpl });
            }
            const rows = parseExactTariffRows(raw, { country, checkedAt });
            const changedRules = applyExactTariffRows(dutyPayload, country, rows);
            results.push({ country, ok: true, skipped: false, row_count: rows.length, changed_rules: changedRules });
        } catch (error) {
            results.push({ country, ok: false, skipped: false, error: String(error.message || error) });
        }
    }
    const previousResults = new Map((dutyPayload.last_exact_national_tariff_sync?.results || [])
        .map((row) => [row.country, row]));
    results.forEach((row) => previousResults.set(row.country, row));
    const mergedResults = [...previousResults.values()]
        .sort((a, b) => Object.keys(FEEDS).indexOf(a.country) - Object.keys(FEEDS).indexOf(b.country));
    const status = {
        ok: results.every((row) => row.ok),
        checked_at: checkedAt,
        dry_run: dryRun,
        results: mergedResults
    };
    dutyPayload.last_exact_national_tariff_sync_at = checkedAt;
    dutyPayload.last_exact_national_tariff_sync = status;
    if (!dryRun && results.some((row) => row.ok && !row.skipped)) {
        fs.writeFileSync(DUTY_RATES_PATH, `${JSON.stringify(dutyPayload, null, 2)}\n`);
    }
    return { ...status, payload: dutyPayload };
}

if (require.main === module) {
    const selected = process.argv.find((arg) => arg.startsWith('--countries='));
    syncExactNationalTariffs({
        countries: selected ? selected.split('=')[1].split(',').map((value) => value.trim().toUpperCase()) : undefined,
        dryRun: process.argv.includes('--dry-run')
    }).then((result) => {
        console.log(JSON.stringify({ ...result, payload: undefined }, null, 2));
        process.exit(result.ok ? 0 : 1);
    });
}

module.exports = {
    FEEDS,
    fetchOfficialPayload,
    fetchSingaporeOfficialPayload,
    fetchMexicoOfficialPayload,
    fetchAustraliaOfficialPayload,
    fetchNewZealandOfficialPayload,
    syncExactNationalTariffs
};
