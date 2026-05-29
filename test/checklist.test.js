const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeChecklist,
    buildSessionChecklist,
    collectChecklistsFromTags
} = require('../lib/checklist');

describe('checklist', () => {
    it('merges AI and baseline items for KR import', () => {
        const items = buildSessionChecklist({
            tags: [],
            aiChecklist: [{ phase: '技术核查', task: 'KC trace', desc: 'Verify KC cert' }],
            country: 'KR',
            direction: 'import'
        });
        assert.ok(items.length >= 2);
        assert.ok(items.some((i) => i.task.includes('KC')));
    });

    it('collects checklist from matching tags only', () => {
        const tags = [
            { tag_id: 'CL-KR-001', country: 'KR', direction: 'import', checklist: [{ phase: '单证准备', task: 'KR pack', desc: 'docs' }] },
            { tag_id: 'CL-JP-001', country: 'JP', direction: 'import', checklist: [{ phase: '单证准备', task: 'JP pack', desc: 'docs' }] }
        ];
        const collected = collectChecklistsFromTags(tags, 'KR', 'import');
        assert.equal(collected.length, 1);
        assert.equal(collected[0].task, 'KR pack');
    });

    it('dedupes by phase+task', () => {
        const merged = normalizeChecklist([
            { phase: '技术核查', task: 'FCC', desc: 'a' },
            { phase: '技术核查', task: 'FCC', desc: 'b' }
        ]);
        assert.equal(merged.length, 1);
    });
});
