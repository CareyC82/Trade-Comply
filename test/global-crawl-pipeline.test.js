'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    runGlobalCrawlPipeline,
    formatPolicySkipLog
} = require('../lib/global-crawl-pipeline');
const {
    readTags,
    loadMatrixManifest,
    buildCountryGroupedPolicyIndex
} = require('../lib/global-crawl-storage');

describe('global-crawl-pipeline', () => {
    it('uses Step 3 skip log format', () => {
        assert.equal(
            formatPolicySkipLog('zh-mofcom'),
            '[SKIP] [zh-mofcom] Non-relevant policy or administrative noise.'
        );
    });

    it('logs skip when AI marks non-relevant', async () => {
        const logs = [];
        const result = await runGlobalCrawlPipeline({
            persist: false,
            sources: [{
                id: 'test-source',
                country: 'US',
                type: 'export',
                label: 'Test',
                url: 'https://example.com/policy',
                method: 'fetch',
                enabled: true
            }],
            fetchResult: {
                ok: true,
                errors: 0,
                sources: [{
                    id: 'test-source',
                    country: 'US',
                    type: 'export',
                    ok: true
                }],
                rawTextStore: {
                    'test-source': {
                        rawText: 'Diplomatic visit 2026-05-29',
                        fetched_url: 'https://example.com/policy',
                        content_hash: 'hash-test'
                    }
                }
            },
            logger: {
                skip(message) {
                    logs.push(message);
                }
            },
            evaluateRelevance: async () => ({
                relevant: false,
                impact_countries: [],
                direction: 'BOTH',
                industry: 'None',
                summary_en: '',
                method: 'mock'
            })
        });

        assert.equal(result.skipped_noise, 1);
        assert.equal(result.changed_count, 0);
        assert.ok(logs.some((line) => line.includes('[test-source]') && line.includes('administrative noise')));
    });

    it('writes tags.json when relevant and hash changes', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pipeline-'));
        const tagsPath = path.join(tmp, 'tags.json');
        const manifestPath = path.join(tmp, 'global-crawl-manifest.json');
        fs.writeFileSync(tagsPath, '[]\n', 'utf8');

        const result = await runGlobalCrawlPipeline({
            persist: true,
            rebuildCatalog: false,
            tagsPath,
            manifestPath,
            sources: [{
                id: 'us-bis',
                country: 'US',
                type: 'export',
                label: 'US BIS newsroom',
                url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom',
                method: 'fetch',
                enabled: true
            }],
            fetchResult: {
                ok: true,
                errors: 0,
                sources: [{ id: 'us-bis', country: 'US', type: 'export', ok: true }],
                rawTextStore: {
                    'us-bis': {
                        rawText: '2026-05-27 Advanced semiconductor export license review tightened.',
                        fetched_url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom',
                        fetched_at: '2026-05-29T12:00:00.000Z',
                        content_hash: 'sha-new-content'
                    }
                }
            },
            evaluateRelevance: async () => ({
                relevant: true,
                impact_countries: ['US', 'CN'],
                direction: 'EXPORT',
                industry: 'Semiconductor',
                summary_en: 'BIS requires updated export licenses for advanced AI accelerators.',
                method: 'mock'
            })
        });

        assert.equal(result.changed_count, 2);
        const tags = readTags(tagsPath);
        const grouped = buildCountryGroupedPolicyIndex(tags);
        assert.ok(grouped.US.length >= 1);
        assert.ok(grouped.CN.length >= 1);

        const manifest = loadMatrixManifest(manifestPath);
        assert.ok(manifest.by_country?.US?.routes);
        assert.ok(manifest.by_country?.CN?.routes);

        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('skips tags.json write when route hash unchanged', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pipeline-'));
        const tagsPath = path.join(tmp, 'tags.json');
        const manifestPath = path.join(tmp, 'manifest.json');

        const first = await runGlobalCrawlPipeline({
            persist: true,
            rebuildCatalog: false,
            tagsPath,
            manifestPath,
            sources: [{
                id: 'eu-lex',
                country: 'EU',
                type: 'both',
                label: 'EUR-Lex',
                url: 'https://eur-lex.europa.eu/homepage.html?ihcl=en',
                method: 'fetch',
                enabled: true
            }],
            fetchResult: {
                ok: true,
                errors: 0,
                sources: [{ id: 'eu-lex', country: 'EU', type: 'both', ok: true }],
                rawTextStore: {
                    'eu-lex': {
                        rawText: '2026-05-28 PV import monitoring',
                        fetched_url: 'https://eur-lex.europa.eu/homepage.html?ihcl=en',
                        content_hash: 'stable-hash'
                    }
                }
            },
            evaluateRelevance: async () => ({
                relevant: true,
                impact_countries: ['EU'],
                direction: 'IMPORT',
                industry: 'New Energy',
                summary_en: 'EU customs requires enhanced PV import documentation.',
                method: 'mock'
            })
        });

        assert.equal(first.changed_count, 1);

        const second = await runGlobalCrawlPipeline({
            persist: true,
            rebuildCatalog: false,
            tagsPath,
            manifestPath,
            sources: [{
                id: 'eu-lex',
                country: 'EU',
                type: 'both',
                label: 'EUR-Lex',
                url: 'https://eur-lex.europa.eu/homepage.html?ihcl=en',
                method: 'fetch',
                enabled: true
            }],
            fetchResult: first.fetch,
            evaluateRelevance: async () => ({
                relevant: true,
                impact_countries: ['EU'],
                direction: 'IMPORT',
                industry: 'New Energy',
                summary_en: 'EU customs requires enhanced PV import documentation.',
                method: 'mock'
            })
        });

        assert.equal(second.changed_count, 0);
        assert.equal(second.routes_unchanged, 1);

        fs.rmSync(tmp, { recursive: true, force: true });
    });
});
