#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    DEFAULT_SOURCE_URL,
    INDUSTRIES,
    combineOfficialPayloads,
    normalizeMonth,
    parseOfficialFile
} = require('../lib/china-customs-flow');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INBOX = path.join(ROOT, 'data', 'inbox', 'china-customs');

function option(name) {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function supportedFiles(directory) {
    return fs.readdirSync(directory)
        .filter((name) => !name.startsWith('.') && !/^manifest(?:\.example)?\.json$/i.test(name))
        .filter((name) => /\.(csv|json|xlsx|xls)$/i.test(name))
        .sort();
}

function buildManifest(directory = DEFAULT_INBOX, values = {}) {
    const absoluteDirectory = path.resolve(directory);
    if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
        throw new Error(`China Customs inbox not found: ${directory}`);
    }
    const files = supportedFiles(absoluteDirectory);
    if (!files.length) throw new Error(`No official China Customs exports found in ${directory}`);

    const payloads = files.map((file) => parseOfficialFile(path.join(absoluteDirectory, file)));
    const payload = combineOfficialPayloads(payloads);
    const latestPeriod = normalizeMonth(
        values.latestPeriod || payload.official_platform_latest_period,
        'official platform latest period'
    );
    const requiredMonths = [...new Set(payload.series.map((row) => normalizeMonth(row.month)))].sort();
    const rows = new Map(payload.series.map((row) => [`${row.month}|${row.industry_id}`, row]));
    const missing = requiredMonths.flatMap((month) => INDUSTRIES.flatMap(({ id }) => {
        const row = rows.get(`${month}|${id}`);
        return [
            row?.imports_value_usd === null || row?.imports_value_usd === undefined ? `${month}:${id}:imports` : null,
            row?.exports_value_usd === null || row?.exports_value_usd === undefined ? `${month}:${id}:exports` : null
        ].filter(Boolean);
    }));
    if (missing.length) {
        throw new Error(`Official batch is incomplete (${missing.length} missing): ${missing.join(', ')}`);
    }
    if (requiredMonths.at(-1) !== latestPeriod) {
        throw new Error(`Latest imported month ${requiredMonths.at(-1)} does not match official platform month ${latestPeriod}`);
    }

    return {
        official_platform_latest_period: latestPeriod,
        source_url: values.sourceUrl || DEFAULT_SOURCE_URL,
        required_months: requiredMonths,
        required_directions: ['imports', 'exports'],
        required_industries: INDUSTRIES.map((row) => row.id),
        entries: files.map((file) => ({ file }))
    };
}

function main() {
    const directory = option('input') || DEFAULT_INBOX;
    const output = path.resolve(option('output') || path.join(directory, 'manifest.json'));
    const manifest = buildManifest(directory, {
        latestPeriod: option('latest') || process.env.CHINA_CUSTOMS_LATEST_PERIOD,
        sourceUrl: option('source-url')
    });
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Validated ${manifest.entries.length} official export file(s) for ${manifest.required_months.join(', ')}.`);
    console.log(`Wrote ${path.relative(ROOT, output)}.`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { buildManifest, supportedFiles };
