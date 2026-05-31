const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCrawlSummary } = require('../lib/crawl-summary');

function writeJson(root, relativePath, value) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe('crawl-summary', () => {
    it('summarizes fetch sources, published routes, and pipeline signals', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-crawl-summary-'));
        writeJson(root, 'data/global-crawl-manifest.json', {
            updated_at: '2026-05-31T02:00:00Z',
            routes: {
                'bis::CL-1': {
                    route_key: 'bis::CL-1',
                    tag_id: 'CL-GLPOL-001',
                    source_id: 'us-bis',
                    impact_country: 'US',
                    industry: 'Semiconductor',
                    direction: 'EXPORT',
                    summary_en: 'BIS update',
                    updated_at: '2026-05-31T02:01:00Z'
                }
            }
        });
        writeJson(root, 'data/inbox/manifest.json', {
            updated_at: '2026-05-31T02:02:00Z',
            sources: {
                'us-bis': {
                    id: 'us-bis',
                    label: 'US BIS',
                    fetched_at: '2026-05-31T02:02:00Z',
                    ai_filter: { relevant: true, industry: 'Semiconductor', summary_en: 'Relevant BIS item' }
                }
            }
        });
        writeJson(root, 'data/pending_data/pipeline_batch.json', {
            pipeline_run: '2026-05-31T02:03:00Z',
            signals: [{ hs_code: '8542', country: 'US', content_en: 'Signal text' }]
        });
        writeJson(root, 'data/pending_data/guardrail_report.json', {
            passed_count: 1,
            intercepted_count: 0
        });

        const summary = buildCrawlSummary(root);
        assert.equal(summary.ok, true);
        assert.equal(summary.counts.published_routes, 1);
        assert.equal(summary.counts.source_fetches, 1);
        assert.equal(summary.counts.relevant_sources, 1);
        assert.equal(summary.counts.pipeline_signals, 1);
        assert.equal(summary.published_routes[0].tag_id, 'CL-GLPOL-001');
        assert.equal(summary.source_fetches[0].ai_summary_en, 'Relevant BIS item');
    });
});
