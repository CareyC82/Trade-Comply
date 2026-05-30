'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildMatrixTagId,
    isCatalogValidTagId,
    computeRouteHash,
    expandRoutesFromAiVerdict,
    applyRoutesToTags,
    migrateLegacyGlobalPolicyTags
} = require('../lib/global-policy-matrix');

const CATALOG_PATTERN = /^CL-[A-Z]+-\d+$/;

describe('global-policy-matrix', () => {
    it('builds catalog-valid tag ids (CL-[A-Z]+-\\d+)', () => {
        const cnSemiExp = buildMatrixTagId('CN', 'Semiconductor', 'EXPORT');
        const usEnergyImp = buildMatrixTagId('US', 'New Energy', 'IMPORT');
        assert.equal(cnSemiExp, 'CL-GLPOL-132');
        assert.equal(usEnergyImp, 'CL-GLPOL-221');
        assert.match(cnSemiExp, CATALOG_PATTERN);
        assert.match(usEnergyImp, CATALOG_PATTERN);
        assert.equal(isCatalogValidTagId('CL-GLOBAL-CN-SEMI-EXP'), false);
        assert.equal(isCatalogValidTagId('CL-GLPOL-132'), true);
    });

    it('detects route hash changes', () => {
        const a = computeRouteHash({
            contentHash: 'abc',
            summaryEn: 'Export license update',
            sourceUrl: 'https://example.com/a',
            industry: 'Semiconductor',
            direction: 'EXPORT',
            impactCountry: 'US'
        });
        const b = computeRouteHash({
            contentHash: 'abc',
            summaryEn: 'Export license tightened',
            sourceUrl: 'https://example.com/a',
            industry: 'Semiconductor',
            direction: 'EXPORT',
            impactCountry: 'US'
        });
        assert.notEqual(a, b);
    });

    it('applies matrix writes when hash changes', () => {
        const tags = [];
        const manifestRoutes = {};
        const entry = {
            id: 'us-bis',
            country: 'US',
            type: 'export',
            label: 'US BIS newsroom',
            url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom'
        };
        const ai = {
            relevant: true,
            impact_countries: ['US', 'EU'],
            direction: 'EXPORT',
            industry: 'Semiconductor',
            summary_en: 'BIS expands export controls on advanced computing chips.',
            effective_status: 'active',
            confidence_score: 0.91,
            evaluated_at: '2026-05-28T12:00:00.000Z'
        };
        const fetchPayload = {
            rawText: 'Advanced computing export rule 2026-05-28',
            fetched_url: entry.url,
            fetched_at: '2026-05-28T12:00:00.000Z',
            content_hash: 'hash-1'
        };

        const routes = expandRoutesFromAiVerdict(entry, ai, fetchPayload);
        assert.equal(routes.length, 2);

        const first = applyRoutesToTags(tags, routes, manifestRoutes);
        assert.equal(first.applied.length, 2);
        assert.equal(tags.length, 2);
        for (const tag of tags) {
            assert.match(tag.tag_id, CATALOG_PATTERN);
            assert.equal(tag.review_status, 'ai_verified');
            assert.equal(tag.jurisdiction, 'US');
            assert.equal(tag.source_type, 'ministry_announcement');
            assert.equal(tag.effective_status, 'active');
            assert.equal(tag.confidence_score, 0.91);
            assert.ok(tag.last_verified_at);
        }

        const second = applyRoutesToTags(tags, routes, manifestRoutes);
        assert.equal(second.applied.length, 0);
        assert.equal(second.skipped.length, 2);
    });

    it('migrates legacy CL-GLOBAL-* tag ids', () => {
        const tags = [{ tag_id: 'CL-GLOBAL-US-SEMI-EXP', country: 'US' }];
        const manifest = {
            routes: {
                'us-bis::CL-GLOBAL-US-SEMI-EXP': {
                    route_key: 'us-bis::CL-GLOBAL-US-SEMI-EXP',
                    tag_id: 'CL-GLOBAL-US-SEMI-EXP'
                }
            }
        };
        const result = migrateLegacyGlobalPolicyTags(tags, manifest);
        assert.equal(result.tagMigrations, 1);
        assert.equal(tags[0].tag_id, 'CL-GLPOL-232');
        assert.ok(manifest.routes['us-bis::CL-GLPOL-232']);
    });
});
