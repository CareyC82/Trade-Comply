const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeChecklist,
    buildSessionChecklist,
    collectChecklistsFromTags,
    getPhaseDisplayLabel,
    normalizePhase
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
        assert.equal(normalizePhase('technical'), 'technical');
        assert.match(getPhaseDisplayLabel('environmental'), /Environmental/i);
        assert.match(getPhaseDisplayLabel('documentation'), /Customs/i);
        assert.match(getPhaseDisplayLabel('其他'), /Other compliance/i);
    });

    it('reads stage/phase fields and ignores rule category codes', () => {
        const { extractRawPhaseFromItem } = require('../lib/checklist');
        assert.equal(extractRawPhaseFromItem({ stage: 'pre-shipment', category: 'EXPORT_CTRL' }), 'pre-shipment');
        assert.equal(normalizePhase({ phase: 'documentation', category: 'EXPORT_CTRL' }), 'documentation');
        assert.equal(normalizePhase({ category: 'EXPORT_CTRL', task: 'x' }), 'other');
    });

    it('groups checklist items by phase key', () => {
        const { groupChecklistByPhase } = require('../lib/checklist');
        const groups = groupChecklistByPhase([
            { phase: 'technical', task: 'A', desc: 'a' },
            { phase: 'documentation', task: 'B', desc: 'b' },
            { stage: 'environmental', task: 'C', desc: 'c' }
        ]);
        assert.equal(groups.length, 3);
        assert.equal(groups[0].phaseKey, 'technical');
        assert.equal(groups[1].phaseKey, 'environmental');
        assert.equal(groups[2].phaseKey, 'documentation');
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
        assert.equal(items[0].phase, 'technical');
        assert.match(items[0].phaseLabel, /technical/i);
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
            { tag_id: 'CL-KR-001', country: 'KR', direction: 'import', checklist: [{ phase: 'documentation', task: 'KR pack', desc: 'docs' }] },
            { tag_id: 'CL-JP-001', country: 'JP', direction: 'import', checklist: [{ phase: 'documentation', task: 'JP pack', desc: 'docs' }] }
        ];
        const collected = collectChecklistsFromTags(tags, 'KR', 'import');
        assert.equal(collected.length, 1);
        assert.equal(collected[0].task, 'KR pack');
    });

    it('dedupes by phase+task', () => {
        const merged = normalizeChecklist([
            { phase: 'technical', task: 'FCC', desc: 'a' },
            { phase: 'technical', task: 'FCC', desc: 'b' }
        ]);
        assert.equal(merged.length, 1);
    });
});
