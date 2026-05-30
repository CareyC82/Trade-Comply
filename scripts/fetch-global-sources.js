#!/usr/bin/env node
/**
 * Smoke-test the global crawl registry (in-memory raw text only).
 *
 *   node scripts/fetch-global-sources.js
 */

const { runGlobalSourceFetchLoop } = require('../lib/global-crawl-main');

/** Step 1 only (in-memory fetch). For Step 3 use: npm run fetch:global:pipeline */

async function main() {
    const result = await runGlobalSourceFetchLoop();
    console.log(JSON.stringify({
        ok: result.ok,
        errors: result.errors,
        ids: Object.keys(result.rawTextStore),
        sources: result.sources.map((row) => ({
            id: row.id,
            ok: row.ok,
            country: row.country,
            transport: row.transport,
            error: row.error
        }))
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(`GLOBAL CRAWL FAILED: ${error.message}`);
    process.exit(1);
});
