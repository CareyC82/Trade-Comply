const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    collectCasesForMatchedTags,
    filterCasesForMatchedTags,
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

    it('accepts both legacy direction and route focus when collecting linked cases', () => {
        const tags = [{ tag_id: 'CL-JPMED-001' }];
        const allCases = [
            {
                case_id: 'CASE-JP-PMD',
                direction: 'import',
                related_tags: ['CL-JPMED-001'],
                title: 'Japan patient monitor PMD Act review',
                related_keywords: ['patient monitor', 'medical device']
            },
            {
                case_id: 'CASE-US-LEGACY',
                direction: 'export',
                related_tags: ['CL-JPMED-001'],
                title: 'Legacy linked medical export review',
                related_keywords: ['patient monitor', 'medical device']
            }
        ];
        const linked = collectCasesForMatchedTags(tags, allCases, ['import', 'export'], 'patient monitor');
        assert.deepEqual(linked.map((caseItem) => caseItem.case_id), ['CASE-JP-PMD', 'CASE-US-LEGACY']);
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

    it('keeps only cases linked to currently visible matched tags', () => {
        const visibleTags = [{ tag_id: 'CL-DE-001' }];
        const cases = [
            { case_id: 'CASE-DE-001', related_tags: ['CL-DE-001'] },
            { case_id: 'CASE-CN-001', related_tags: ['CL-CN-001'] },
            { case_id: 'CASE-UNLINKED', related_tags: [] }
        ];
        const filtered = filterCasesForMatchedTags(cases, visibleTags);
        assert.deepEqual(filtered.map((caseItem) => caseItem.case_id), ['CASE-DE-001']);
    });
});
