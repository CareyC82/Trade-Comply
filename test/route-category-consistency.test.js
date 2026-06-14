const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');

const IMPORT_INCOMPATIBLE = new Set([
    'EXPORT_CONTROL',
    'EXPORT_CTRL',
    'EXPORT_DECLARATION',
    'ORIGIN_DOC'
]);

const EXPORT_INCOMPATIBLE = new Set([
    'IMPORT_CONTROL',
    'IMPORT_REG'
]);

function focusOf(tag) {
    return tag.route_focus || tag.compliance_focus || '';
}

function describeTag(tag) {
    return `${tag.tag_id}:${tag.country || 'GLOBAL'}:${focusOf(tag) || 'legacy'}:${tag.category}:${tag.category_label || ''}`;
}

describe('route/category consistency', () => {
    it('uses the canonical export-control category code', () => {
        const wrong = tags.filter((tag) => tag.category === 'EXPORT_CONTROL');

        assert.deepEqual(wrong.map(describeTag), []);
    });

    it('does not place destination-import rules under export-side card categories', () => {
        const wrong = tags.filter((tag) => (
            focusOf(tag) === 'import'
            && IMPORT_INCOMPATIBLE.has(tag.category)
        ));

        assert.deepEqual(wrong.map(describeTag), []);
    });

    it('does not place origin-export rules under import-side card categories', () => {
        const wrong = tags.filter((tag) => (
            focusOf(tag) === 'export'
            && EXPORT_INCOMPATIBLE.has(tag.category)
        ));

        assert.deepEqual(wrong.map(describeTag), []);
    });
});
