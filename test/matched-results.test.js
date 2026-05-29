const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    collectCasesForMatchedTags,
    mergeCasesById,
    scoreCaseAgainstQuery,
    filterCasesByQueryRelevance
} = require('../lib/matched-results');

describe('matched-results', () => {
    it('links cases when related_tags overlap matched tag ids', () => {
        const tags = [{ tag_id: 'CL-CHIP-001' }];
        const allCases = [
            {
                case_id: 'CASE-050',
                direction: 'export',
                related_tags: ['CL-CHIP-001'],
                title: 'GPU design export',
                related_keywords: ['GPU', 'GDSII']
            },
            {
                case_id: 'CASE-099',
                direction: 'export',
                related_tags: ['CL-OTHER']
            }
        ];
        const linked = collectCasesForMatchedTags(tags, allCases, 'export', '');
        assert.equal(linked.length, 1);
        assert.equal(linked[0].case_id, 'CASE-050');
    });

    it('filters tag-linked cases that do not match the product query', () => {
        const tags = [{ tag_id: 'CL-CHIP-001' }];
        const allCases = [
            {
                case_id: 'CASE-050',
                direction: 'export',
                related_tags: ['CL-CHIP-001'],
                title: 'Shanghai chip design company fined for exporting advanced GPU design files',
                related_keywords: ['GPU', 'GDSII', 'chip design']
            },
            {
                case_id: 'CASE-051',
                direction: 'export',
                related_tags: ['CL-CHIP-001'],
                title: 'Shenzhen AI chip exporter fined for incorrect HS classification',
                related_keywords: ['AI chip', 'inference accelerator']
            }
        ];
        const linked = collectCasesForMatchedTags(tags, allCases, 'export', 'NAND flash memory');
        assert.equal(linked.length, 0);
    });

    it('keeps cases with query overlap in title or keywords', () => {
        const caseItem = {
            case_id: 'CASE-NAND-01',
            title: 'Exporter fined for misdeclaring NAND flash under HS 8542',
            summary: 'Customs flagged NAND memory chips.',
            related_keywords: ['nand flash', 'memory chip']
        };
        assert.ok(scoreCaseAgainstQuery(caseItem, 'NAND flash memory') >= 4);
        const filtered = filterCasesByQueryRelevance([caseItem], 'NAND flash memory');
        assert.equal(filtered.length, 1);
    });

    it('merges keyword and tag-linked cases without duplicates', () => {
        const merged = mergeCasesById(
            [{ case_id: 'CASE-050', title: 'a' }],
            [{ case_id: 'CASE-050', title: 'b' }, { case_id: 'CASE-051', title: 'c' }]
        );
        assert.equal(merged.length, 2);
    });
});
