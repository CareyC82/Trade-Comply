'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { upsertIndustryPulseTag } = require('../lib/policy-industry-tags');

describe('policy-industry-tags', () => {
    it('upserts pulse tag for semiconductor industry', () => {
        const tags = [];
        const result = upsertIndustryPulseTag(tags, {
            industry: 'Semiconductor',
            summaryEn: 'MOFCOM tightened dual-use export licensing for advanced chips.',
            sourceId: 'mofcom-export-control',
            sourceLabel: 'MOFCOM',
            sourceUrl: 'https://www.mofcom.gov.cn/',
            fetchedAt: '2026-05-30T00:00:00.000Z'
        });
        assert.equal(result.tag_id, 'CL-POLICY-PULSE-SEMICONDUCTOR');
        assert.equal(tags.length, 1);
        assert.match(tags[0].content_en, /dual-use/);

        upsertIndustryPulseTag(tags, {
            industry: 'Semiconductor',
            summaryEn: 'Updated summary for the same pulse tag.',
            sourceId: 'mofcom-export-control',
            sourceLabel: 'MOFCOM',
            sourceUrl: 'https://www.mofcom.gov.cn/',
            fetchedAt: '2026-05-30T01:00:00.000Z'
        });
        assert.equal(tags.length, 1);
        assert.match(tags[0].short_description, /Updated summary/);
    });
});
