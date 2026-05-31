const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');
const cases = require('../data/cases.json');

describe('data link integrity', () => {
    it('keeps tag and case references valid and bidirectional', () => {
        const tagIds = new Set(tags.map((tag) => tag.tag_id));
        const caseIds = new Set(cases.map((caseItem) => caseItem.case_id));
        const caseById = new Map(cases.map((caseItem) => [caseItem.case_id, caseItem]));
        const tagById = new Map(tags.map((tag) => [tag.tag_id, tag]));
        const errors = [];

        tags.forEach((tag) => {
            (tag.related_cases || []).forEach((caseId) => {
                const caseItem = caseById.get(caseId);
                if (!caseIds.has(caseId)) {
                    errors.push(`${tag.tag_id} references missing case ${caseId}`);
                } else if (!(caseItem.related_tags || []).includes(tag.tag_id)) {
                    errors.push(`${tag.tag_id} references ${caseId}, but the case does not link back`);
                }
            });
        });

        cases.forEach((caseItem) => {
            (caseItem.related_tags || []).forEach((tagId) => {
                const tag = tagById.get(tagId);
                if (!tagIds.has(tagId)) {
                    errors.push(`${caseItem.case_id} references missing tag ${tagId}`);
                } else if (!(tag.related_cases || []).includes(caseItem.case_id)) {
                    errors.push(`${caseItem.case_id} references ${tagId}, but the tag does not link back`);
                }
            });
        });

        assert.deepEqual(errors, []);
    });

    it('does not store free-text keywords in related_hs_codes', () => {
        const badCodes = tags.flatMap((tag) => (tag.related_hs_codes || [])
            .filter((code) => /[A-Za-z\s]/.test(String(code)) && String(code) !== 'ALL')
            .map((code) => `${tag.tag_id}:${code}`));

        assert.deepEqual(badCodes, []);
    });
});
