'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildPreScreenReport, resolveRiskLevel } = require('../lib/pre-screen-report');

describe('pre-screen-report', () => {
    const sampleTags = [
        {
            tag_id: 'CL-GLPOL-132',
            country: 'CN',
            category: 'EXPORT_CTRL',
            short_name: '[Global Policy · CN · Semiconductor]',
            short_description: 'BIS extended IC designer application timeline to December 2026.',
            content_en: 'BIS extended IC designer application timeline to December 2026.',
            source_url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom',
            source_citation: 'US BIS newsroom',
            jurisdiction: 'US',
            source_type: 'ministry_announcement',
            confidence_score: 0.91
        }
    ];

    it('maps review_required profile to CRITICAL risk level', () => {
        assert.equal(resolveRiskLevel({ risk: 'review_required' }, sampleTags), 'CRITICAL');
    });

    it('builds six core report sections in English', () => {
        const report = buildPreScreenReport({
            productQuery: 'advanced GPU',
            tags: sampleTags,
            profile: {
                risk: 'high',
                signals: ['Export control'],
                nextChecks: ['Confirm end-user statement.'],
                matchedRuleCount: 1
            },
            directionRaw: 'export',
            directionLabel: 'Export from China',
            destination: 'US',
            destinationLabel: 'United States',
            flowLabel: 'Export from China → United States',
            precheckSelections: [{ id: 'semiconductor', label: 'Semiconductor' }]
        });

        assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(report.risk_level));
        assert.match(report.trigger_reason, /advanced GPU/i);
        assert.ok(report.missing_information.length >= 2);
        assert.ok(report.verification_objects.length >= 2);
        assert.equal(report.official_sources.length, 1);
        assert.match(report.legal_disclaimer, /not legal advice/i);
        assert.match(report.executive_summary, /risk rating/i);
        assert.equal(report.inputs.origin_label, 'China (PRC)');
    });
});
