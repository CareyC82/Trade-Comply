const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQuickSelectContext() {
    const context = {};
    context.globalThis = context;
    vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '..', 'js', 'quick-select-grid.js'), 'utf8'),
        context,
        { filename: 'quick-select-grid.js' }
    );
    return context;
}

describe('quick-select-grid', () => {
    it('keeps EV Charger only in New Energy quick select cards', () => {
        const context = loadQuickSelectContext();
        const electronicsLabels = context.ELECTRONICS_QUICK_SELECT_CARDS.map((card) => card.label);
        const newEnergyLabels = context.NEW_ENERGY_QUICK_SELECT_CARDS.map((card) => card.label);

        assert.equal(electronicsLabels.includes('EV Charger'), false);
        assert.equal(newEnergyLabels.includes('EV Charger'), true);
    });
});
