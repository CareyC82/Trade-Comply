#!/usr/bin/env node
/**
 * Smoke-test the global crawl registry (in-memory raw text only).
 *
 *   node scripts/fetch-global-sources.js
 */

const { runGlobalSourceFetchLoop } = require('../lib/global-crawl-main');
const { summarizeFetchHealth } = require('../lib/global-crawl-health');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HEALTH_PATH = path.join(ROOT, 'data', 'global-crawl-source-health.json');

/** Step 1 only (in-memory fetch). For Step 3 use: npm run fetch:global:pipeline */

async function main() {
    const writeHealth = process.argv.includes('--write-health');
    const result = await runGlobalSourceFetchLoop();
    const health = summarizeFetchHealth(result);
    if (writeHealth) {
        fs.writeFileSync(HEALTH_PATH, `${JSON.stringify(health, null, 2)}\n`);
    }
    console.log(JSON.stringify({
        ok: result.ok,
        errors: result.errors,
        ids: Object.keys(result.rawTextStore),
        health: {
            source_count: health.source_count,
            ok_count: health.ok_count,
            countries: health.countries
        },
        health_path: writeHealth ? path.relative(ROOT, HEALTH_PATH) : null,
        sources: result.sources.map((row) => ({
            id: row.id,
            ok: row.ok,
            country: row.country,
            transport: row.transport,
            fetched_at: row.fetched_at || null,
            byte_length: row.byte_length || 0,
            error: row.error
        }))
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(`GLOBAL CRAWL FAILED: ${error.message}`);
    process.exit(1);
});
