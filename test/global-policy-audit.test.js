'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isGlobalPolicyTag,
    resolveRegulatoryBodyId,
    buildRegulatoryBodyBadgeHtml,
    buildGlobalPolicyAuditTrailHtml
} = require('../js/global-policy-audit');

describe('global-policy-audit', () => {
    const sampleTag = {
        tag_id: 'CL-GLPOL-132',
        source_url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom',
        effective_date: '2026-05-30',
        policy_tracker: {
            source_id: 'us-bis',
            fetched_at: '2026-05-30T07:51:01.181Z',
            updated_at: '2026-05-30T07:51:07.653Z'
        }
    };

    it('detects global policy tags', () => {
        assert.equal(isGlobalPolicyTag(sampleTag), true);
        assert.equal(isGlobalPolicyTag({ tag_id: 'CL-CN-1' }), false);
    });

    it('resolves regulatory body from policy_tracker', () => {
        assert.equal(resolveRegulatoryBodyId(sampleTag), 'us-bis');
    });

    it('renders regulatory badge with bracket label', () => {
        global.escapeHtml = (v) => String(v);
        const html = buildRegulatoryBodyBadgeHtml(sampleTag);
        assert.match(html, /\[US-BIS\]/);
        assert.match(html, /regulatory-body-badge--us-bis/);
    });

    it('renders audit trail with timestamps and official source link', () => {
        global.escapeHtml = (v) => String(v);
        global.sanitizeUrl = (u) => u;
        global.t = (key) => key;
        const html = buildGlobalPolicyAuditTrailHtml(sampleTag);
        assert.match(html, /policy-audit-trail/);
        assert.match(html, /auditTrailLastVerified/);
        assert.match(html, /auditTrailEffectiveDate/);
        assert.match(html, /policy-official-source-btn/);
        assert.match(html, /bis\.doc\.gov/);
    });
});
