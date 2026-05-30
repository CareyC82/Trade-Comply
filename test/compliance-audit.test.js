'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveSourceType,
    resolveJurisdiction,
    buildCrawlComplianceAudit,
    stampManualReviewAudit,
    normalizeConfidenceScore
} = require('../lib/compliance-audit');

describe('compliance-audit', () => {
    it('maps source ids to source_type', () => {
        assert.equal(resolveSourceType('zh-gac'), 'customs_notice');
        assert.equal(resolveSourceType('eu-lex'), 'official_gazette');
        assert.equal(resolveSourceType('us-bis'), 'ministry_announcement');
    });

    it('builds crawl audit fields from AI verdict', () => {
        const audit = buildCrawlComplianceAudit({
            sourceId: 'us-bis',
            publisherCountry: 'US',
            aiVerdict: {
                relevant: true,
                effective_status: 'pending_effective',
                confidence_score: 0.76,
                evaluated_at: '2026-05-30T08:00:00.000Z'
            },
            fetchedAt: '2026-05-30T07:59:00.000Z'
        });
        assert.equal(audit.jurisdiction, 'US');
        assert.equal(audit.review_status, 'ai_verified');
        assert.equal(audit.effective_status, 'pending_effective');
        assert.equal(audit.confidence_score, 0.76);
        assert.match(audit.last_verified_at, /^2026-05-30/);
    });

    it('stamps manual approval audit on publish', () => {
        const stamped = stampManualReviewAudit({
            tag_id: 'CL-TEST-1',
            country: 'CN',
            confidence_score: 0.5,
            policy_tracker: { source_id: 'zh-mofcom' }
        });
        assert.equal(stamped.review_status, 'manually_approved');
        assert.equal(stamped.source_type, 'ministry_announcement');
        assert.equal(stamped.jurisdiction, 'CN');
        assert.ok(stamped.last_verified_at);
    });

    it('normalizes percentage confidence to 0-1', () => {
        assert.equal(normalizeConfidenceScore(92, { relevant: true }), 0.92);
    });
});
