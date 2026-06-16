const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCategoryPageContext() {
    const context = {
        URLSearchParams,
        globalThis: {}
    };
    context.globalThis = context;
    vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '..', 'js', 'category-page.js'), 'utf8'),
        context,
        { filename: 'category-page.js' }
    );
    return context;
}

describe('category-page routing', () => {
    it('builds quick-select deep links that open the result view and auto-run search', () => {
        const context = loadCategoryPageContext();
        context.TradeComplyBuild = 'test-build';

        const url = context.buildCategorySearchUrl(
            'tablet computer wifi',
            'export',
            'US',
            'electronics',
            { from: 'CN', to: 'US', focus: 'import' }
        );

        assert.equal(
            url,
            'index.html?appv=test-build&search=tablet+computer+wifi&autoSearch=1&direction=export&country=US&from=CN&to=US&focus=import&vertical=electronics#result'
        );
    });

    it('supports deep links for newly added category verticals', () => {
        const context = loadCategoryPageContext();
        context.TradeComplyBuild = 'test-build';

        const url = context.buildCategorySearchUrl(
            'ai server gpu server',
            'export',
            'US',
            'data-center',
            { from: 'US', to: 'IN', focus: 'export' }
        );

        assert.equal(
            url,
            'index.html?appv=test-build&search=ai+server+gpu+server&autoSearch=1&direction=export&country=US&from=US&to=IN&focus=export&vertical=data-center#result'
        );
    });
});
