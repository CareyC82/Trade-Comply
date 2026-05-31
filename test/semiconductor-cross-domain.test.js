const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSearchContext() {
    const root = path.join(__dirname, '..');
    const context = {
        console,
        AppState: {
            currentDirection: 'export',
            currentCountry: 'US',
            catalog: { semiconductorKeywords: ['gpu', 'chip', 'semiconductor'] },
            data: {
                tags: require('../data/tags.json'),
                cases: require('../data/cases.json')
            }
        }
    };
    context.globalThis = context;
    vm.createContext(context);
    ['js/search.js', 'js/semiconductor.js'].forEach((relativePath) => {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        vm.runInContext(source, context, { filename: relativePath });
    });
    return context;
}

describe('semiconductor cross-domain quick select', () => {
    it('falls back to general controls for drone quick-select queries', () => {
        const context = loadSearchContext();
        const result = context.searchSemiconductor('drone uav under 2kg');
        const ids = result.tags.map((tag) => tag.tag_id);
        assert.ok(ids.includes('CL-UAV-001'));
        assert.ok(ids.includes('CL-DU-002'));
        assert.ok(result.tags.length >= 4);
    });

    it('falls back to general controls for IP camera quick-select queries', () => {
        const context = loadSearchContext();
        const result = context.searchSemiconductor('ip camera network storage');
        const ids = result.tags.map((tag) => tag.tag_id);
        assert.ok(ids.includes('CL-CAM-001'));
        assert.ok(ids.includes('CL-DU-001'));
        assert.ok(result.tags.length >= 3);
    });
});
