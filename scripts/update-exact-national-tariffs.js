#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
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
    MX: 'MX_TIGIE_NICO_EXACT_TARIFF_URL'
};

async function fetchOfficialPayload(url, fetchImpl = global.fetch) {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
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
        const directOfficial = country === 'CN';
        if (!url && !directOfficial) {
            results.push({ country, ok: true, skipped: true, reason: `${envName} is not configured` });
            continue;
        }
        try {
            let raw;
            if (url) {
                raw = await fetchOfficialPayload(url, fetchImpl);
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
    const status = {
        ok: results.every((row) => row.ok),
        checked_at: checkedAt,
        dry_run: dryRun,
        results
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

module.exports = { FEEDS, fetchOfficialPayload, syncExactNationalTariffs };
