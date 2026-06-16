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

    it('resolves and builds checklists for new specialized verticals', () => {
        const dataCenter = ensureIndustryChecklist([], {
            description: 'AI server GPU server rack with storage and redundant power',
            country: 'US',
            direction: 'export',
            vertical: 'data-center'
        });
        const industrial = ensureIndustryChecklist([], {
            description: 'PLC controller industrial automation machine vision gateway',
            country: 'DE',
            direction: 'export',
            vertical: 'industrial-automation'
        });
        const healthcare = ensureIndustryChecklist([], {
            description: 'patient monitor medical electronics bluetooth battery',
            country: 'US',
            direction: 'import',
            vertical: 'healthcare-lab'
        });

        assert.equal(resolveChecklistVertical({ vertical: 'data-center', forceVertical: true }), 'data-center');
        assert.match(dataCenter.map((row) => row.task).join(' '), /compute|server|end-use/i);
        assert.match(industrial.map((row) => row.task).join(' '), /machinery|robotics|control/i);
        assert.match(healthcare.map((row) => row.task).join(' '), /medical|laboratory|wireless/i);
    });
});
