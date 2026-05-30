#!/usr/bin/env node
/**
 * Run global crawl → AI filter → tags.json matrix (Step 3).
 *
 *   DEEPSEEK_API_KEY=sk-... node scripts/fetch-global-pipeline.js
 */

const { runGlobalComplianceNetwork } = require('../lib/global-compliance-crawler');

async function main() {
    const result = await runGlobalComplianceNetwork({ persist: true, label: 'fetch-global-pipeline' });
    console.log(JSON.stringify({
        ok: result.ok,
        message: result.message,
        changed_count: result.changed_count,
        tags_updated: result.tags_updated,
        skipped_noise: result.skipped_noise,
        routes_unchanged: result.routes_unchanged,
        fetch_errors: result.fetch_errors,
        catalog_warning: result.catalog_warning
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(`GLOBAL PIPELINE FAILED: ${error.message}`);
    process.exit(1);
});
