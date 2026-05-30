const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveChecklistVertical,
    filterChecklistForVertical,
    isConsumerElectronicsOnlyChecklistItem
} = require('../lib/checklist-industry-segment');
const { ensureIndustryChecklist } = require('../lib/industry-checklist-baseline');

describe('checklist-industry-segment', () => {
    it('resolves new-energy vertical for lithium battery air freight query', () => {
        const vertical = resolveChecklistVertical({
            description: 'lithium battery equipment air freight IATA UN38.3'
        });
        assert.equal(vertical, 'new-energy');
    });

    it('strips FCC tasks from new-energy checklist rows', () => {
        const rows = [
            { phase: 'technical', task: 'Verify FCC ID conformity & technical labeling', desc: 'Part 15/18' },
            { phase: 'documentation', task: 'Obtain Class 9 Dangerous Goods maritime booking approval & UN38.3 report', desc: 'IATA' }
        ];
        const filtered = filterChecklistForVertical(rows, 'new-energy');
        assert.equal(filtered.length, 1);
        assert.match(filtered[0].task, /dangerous goods/i);
        assert.ok(isConsumerElectronicsOnlyChecklistItem(rows[0]));
    });

    it('ensureIndustryChecklist never returns FCC for new-energy battery query', () => {
        const merged = ensureIndustryChecklist([], {
            description: 'lithium battery equipment air freight IATA UN38.3 dangerous goods',
            country: 'US',
            direction: 'export',
            vertical: 'new-energy'
        });
        assert.ok(merged.length >= 2);
        const haystack = merged.map((row) => `${row.task} ${row.desc}`).join(' ');
        assert.doesNotMatch(haystack, /fcc/i);
        assert.doesNotMatch(haystack, /part\s*15/i);
        assert.match(haystack, /un38\.3|dangerous goods|battery/i);
    });
});
