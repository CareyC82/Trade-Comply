const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    collectCasesForMatchedTags,
    mergeCasesById
} = require('../lib/matched-results');

describe('matched-results', () => {
    it('links cases when related_tags overlap matched tag ids', () => {
        const tags = [{ tag_id: 'CL-CHIP-001' }];
        const allCases = [
            {
                case_id: 'CASE-050',
                direction: 'export',
                related_tags: ['CL-CHIP-001']
            },
            {
                case_id: 'CASE-099',
                direction: 'export',
                related_tags: ['CL-OTHER']
            }
        ];
        const linked = collectCasesForMatchedTags(tags, allCases, 'export');
        assert.equal(linked.length, 1);
        assert.equal(linked[0].case_id, 'CASE-050');
    });

    it('merges keyword and tag-linked cases without duplicates', () => {
        const merged = mergeCasesById(
            [{ case_id: 'CASE-050', title: 'a' }],
            [{ case_id: 'CASE-050', title: 'b' }, { case_id: 'CASE-051', title: 'c' }]
        );
        assert.equal(merged.length, 2);
    });
});
