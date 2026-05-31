const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getActionableChecklist } = require('../lib/actionable-checklist');
const { resolveChecklistVertical } = require('../lib/checklist-industry-segment');

describe('actionable-checklist', () => {
    it('returns FCC only for electronics', () => {
        const items = getActionableChecklist('electronics', { country: 'US', direction: 'export' });
        const haystack = items.map((row) => `${row.task} ${row.desc}`).join(' ');
        assert.match(haystack, /fcc/i);
    });

    it('never returns FCC for new-energy lithium air freight', () => {
        const items = getActionableChecklist('new-energy', {
            country: 'US',
            direction: 'export',
            productQuery: 'lithium battery equipment air freight IATA UN38.3'
        });
        const haystack = items.map((row) => `${row.task} ${row.desc}`).join(' ');
        assert.doesNotMatch(haystack, /fcc/i);
        assert.doesNotMatch(haystack, /part\s*15/i);
        assert.match(haystack, /confirm battery & chemical substance compliance/i);
        assert.match(haystack, /un38\.3|msds|battery recycling/i);
        assert.match(haystack, /air-freight|iata/i);
        assert.doesNotMatch(haystack, /ul\s*9540/i);
        assert.doesNotMatch(haystack, /grid interconnection/i);
    });

    it('keeps ESS-specific tasks conditional for energy storage systems', () => {
        const items = getActionableChecklist('new-energy', {
            country: 'US',
            direction: 'export',
            productQuery: 'BESS energy storage system lithium battery cabinet for US deployment'
        });
        const haystack = items.map((row) => `${row.task} ${row.desc}`).join(' ');
        assert.match(haystack, /ul\s*9540/i);
        assert.match(haystack, /grid interconnection/i);
    });

    it('returns BIS ECCN tasks for semiconductor', () => {
        const items = getActionableChecklist('semiconductor', { country: 'US', direction: 'export' });
        const haystack = items.map((row) => `${row.task} ${row.desc}`).join(' ');
        assert.match(haystack, /eccn|bis/i);
        assert.doesNotMatch(haystack, /fcc/i);
    });

    it('prefers product query over stale electronics searchOrigin when resolving vertical', () => {
        const vertical = resolveChecklistVertical({
            searchOrigin: 'electronics',
            description: 'lithium battery equipment air freight IATA UN38.3'
        });
        assert.equal(vertical, 'new-energy');
    });
});
