#!/usr/bin/env node
/**
 * Ingest pipeline batch → guardrail → auto-publish to prod or pending_data.json.
 */

const fs = require('fs');
const path = require('path');
const { autoPublishBatch, appendInterceptedRows } = require('../lib/auto-publish');

const ROOT = path.join(__dirname, '..');
const BATCH_PATH = path.join(ROOT, 'data', 'pending_data', 'pipeline_batch.json');
const GUARDRAIL_REPORT_PATH = path.join(ROOT, 'data', 'pending_data', 'guardrail_report.json');

function main() {
    console.log('=== CRON JOB: Node 自动发布批次 (auto-publish-pipeline) ===');
    if (!fs.existsSync(BATCH_PATH)) {
        console.log('No pipeline batch file; nothing to publish.');
        return;
    }

    const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
    const signals = Array.isArray(batch.signals) ? batch.signals : [];
    const hasReport = fs.existsSync(GUARDRAIL_REPORT_PATH);

    if (signals.length === 0 && !hasReport) {
        console.log('Pipeline batch is empty.');
        return;
    }

    const result = signals.length > 0 ? autoPublishBatch({
        risk_signals: signals,
        source: 'global-compliance-pipeline',
        meta: {
            pipeline_run: batch.pipeline_run || new Date().toISOString(),
            batch_path: path.relative(ROOT, BATCH_PATH)
        }
    }) : {
        ok: true,
        published: { tags: [], cases: [] },
        counts: { published_tags: 0, published_cases: 0, intercepted: 0 },
        intercepted: [],
        catalog_warning: null
    };

    if (signals.length > 0) {
        console.log(`Auto-publish: ${result.counts.published_tags} tag(s), ${result.counts.published_cases} case(s).`);
        console.log(`Guardrail intercepted: ${result.counts.intercepted} row(s).`);

        if (result.published.tags.length) {
            console.log('Published tag IDs:', result.published.tags.join(', '));
        }
        if (result.intercepted.length) {
            result.intercepted.forEach((row) => {
                const id = row.raw?.signal_id || row.raw?.tag_id || row.raw?.hs_code || 'unknown';
                console.log(`  INTERCEPTED ${id}: ${row.reasons.join('; ')}`);
            });
        }
        if (result.catalog_warning) {
            console.warn(`WARN: catalog rebuild: ${result.catalog_warning}`);
        }
    }

    if (fs.existsSync(GUARDRAIL_REPORT_PATH)) {
        const report = JSON.parse(fs.readFileSync(GUARDRAIL_REPORT_PATH, 'utf8'));
        const pythonIntercepted = Array.isArray(report.intercepted) ? report.intercepted : [];
        if (pythonIntercepted.length > 0) {
            const mapped = pythonIntercepted.map((row) => ({
                kind: row.kind || 'risk_signal',
                reasons: row.reasons || [],
                raw: row.raw || row
            }));
            const extra = appendInterceptedRows(mapped, {
                source: 'global-compliance-pipeline',
                meta: { from: 'python-guardrail-report' }
            });
            console.log(`Recorded ${extra.appended} Python-guardrail intercept(s) in pending_data.json.`);
        }
    }

    const totalIntercepted = result.counts.intercepted
        + (fs.existsSync(GUARDRAIL_REPORT_PATH)
            ? (JSON.parse(fs.readFileSync(GUARDRAIL_REPORT_PATH, 'utf8')).intercepted_count || 0)
            : 0);

    if (result.counts.published_tags === 0 && totalIntercepted > 0 && signals.length === 0) {
        process.exit(2);
    }

    console.log('=== CRON JOB SUCCESS: auto-publish-pipeline 完成 ===');
}

try {
    main();
} catch (error) {
    console.error('=== CRON JOB FAILED: auto-publish-pipeline ===');
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}
