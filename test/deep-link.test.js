const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeInboundDirection,
    getInboundDeepLinkFromSearch,
    buildInboundSearchPlan
} = require('../lib/deep-link');

describe('deep-link', () => {
    it('normalizes direction to import or export', () => {
        assert.equal(normalizeInboundDirection('import'), 'import');
        assert.equal(normalizeInboundDirection('IMPORT'), 'import');
        assert.equal(normalizeInboundDirection(''), 'export');
        assert.equal(normalizeInboundDirection('invalid'), 'export');
    });

    it('reads search and direction from query string', () => {
        const link = getInboundDeepLinkFromSearch('?search=9617001900&direction=import');
        assert.equal(link.query, '9617001900');
        assert.equal(link.direction, 'import');
    });

    it('reads country from query string', () => {
        const link = getInboundDeepLinkFromSearch('?search=854140&direction=export&country=US');
        assert.equal(link.country, 'US');
    });

    it('supports legacy hs + autoSearch deep link', () => {
        const link = getInboundDeepLinkFromSearch('?hs=854140&autoSearch=1&direction=export');
        assert.equal(link.query, '854140');
        assert.equal(link.direction, 'export');
    });

    it('builds inbound search plan for import tab + GO flow', () => {
        const plan = buildInboundSearchPlan('?search=81099000&direction=import');
        assert.equal(plan.shouldRun, true);
        assert.equal(plan.query, '81099000');
        assert.equal(plan.direction, 'import');
        assert.equal(plan.view, 'electronics');
        assert.equal(plan.directionClick, 'import');
        assert.equal(plan.cleanHash, '#electronics');
    });

    it('skips plan when query empty', () => {
        const plan = buildInboundSearchPlan('?direction=import');
        assert.equal(plan.shouldRun, false);
    });
});
