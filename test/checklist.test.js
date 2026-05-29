const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeChecklist,
    buildSessionChecklist,
    collectChecklistsFromTags
} = require('../lib/checklist');

describe('checklist', () => {
    it('does not inject country baseline unless explicitly enabled', () => {
        const items = buildSessionChecklist({
            tags: [],
            aiChecklist: [],
            country: 'US',
            direction: 'export',
            includeBaseline: false
        });
        assert.equal(items.length, 0);
    });

    it('maps English phase labels for display', () => {
        const { getPhaseDisplayLabel, normalizePhase } = require('../lib/checklist');
        assert.equal(normalizePhase('technical'), '技术核查');
        assert.match(getPhaseDisplayLabel('environmental'), /环保/);
        assert.match(getPhaseDisplayLabel('documentation'), /单证/);
    });

    it('merges AI checklist items for KR import', () => {
        const items = buildSessionChecklist({
            tags: [],
            aiChecklist: [{ phase: 'technical', task: 'KC trace', desc: 'Verify KC cert' }],
            country: 'KR',
            direction: 'import',
            includeBaseline: false
        });
        assert.equal(items.length, 1);
        assert.equal(items[0].phase, '技术核查');
        assert.ok(items[0].phaseLabel.includes('技术与资质'));
    });

    it('can opt in to country baseline when needed', () => {
        const items = buildSessionChecklist({
            tags: [],
            aiChecklist: [],
            country: 'US',
            direction: 'export',
            includeBaseline: true
        });
        assert.ok(items.length >= 3);
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
