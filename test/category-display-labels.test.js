const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
    const context = {
        console,
        AppState: { currentDirection: 'export', data: {} },
        document: {
            createElement: () => ({ textContent: '', innerHTML: '' }),
            getElementById: () => null,
            querySelector: () => null,
            documentElement: { dataset: {} },
            addEventListener: () => {}
        }
    };
    context.globalThis = context;
    vm.runInNewContext(`${source}\n;globalThis.__categoryApi = { getTagCategoryLabel, getCategoryTheme };`, context, {
        filename: 'core.js'
    });
    return context;
}

function loadRenderPrepareWithCore() {
    const context = loadCore();
    global.AppState = context.AppState;
    global.getTagCategoryLabel = context.__categoryApi.getTagCategoryLabel;
    const renderPath = path.join(__dirname, '..', 'js', 'render-prepare.js');
    delete require.cache[require.resolve(renderPath)];
    return require(renderPath);
}

describe('category display labels', () => {
    it('maps internal category labels to user-facing card titles', () => {
        const context = loadCore();
        const { getTagCategoryLabel } = context.__categoryApi;

        assert.equal(
            getTagCategoryLabel({ category: 'IMPORT_REG', category_label: 'Import Regulation' }),
            'Import Clearance & Tariff'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'EXPORT_DECLARATION', category_label: 'Export Customs' }),
            'Export Filing & Documents'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'ORIGIN_DOC', category_label: 'Origin / Transshipment' }),
            'Origin & Anti-Circumvention'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'COMPLIANCE_STD', category_label: 'Compliance Standard' }),
            'Product Standards'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'ENVIRONMENT_BATTERY', category_label: 'Battery / E-Waste' }),
            'Green Compliance & ESG'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'OTHER', category_label: 'EU Battery Regulation' }),
            'Green Compliance & ESG'
        );
        assert.equal(
            getTagCategoryLabel({ category: 'OTHER', category_label: 'Other Requirements' }),
            'General Compliance Requirements'
        );
    });

    it('keeps route-sensitive import control wording for import-side export-control matches', () => {
        const context = loadCore();
        context.AppState.currentDirection = 'import';

        assert.equal(
            context.__categoryApi.getTagCategoryLabel({ category: 'EXPORT_CTRL', category_label: 'Export Control' }),
            'Import Controls & Trade Remedies'
        );
        assert.equal(
            context.__categoryApi.getTagCategoryLabel({ category: 'OTHER', category_label: 'Export Control' }),
            'Import Controls & Trade Remedies'
        );

        context.AppState.currentDirection = 'export';
        context.AppState.complianceFocus = 'import';
        assert.equal(
            context.__categoryApi.getTagCategoryLabel({ category: 'EXPORT_CTRL', category_label: 'Export Control' }),
            'Import Controls & Trade Remedies'
        );
        assert.equal(
            context.__categoryApi.getTagCategoryLabel({ category: 'EXPORT_CTRL', category_label: 'Export Control', route_focus: 'import' }),
            'Import Controls & Trade Remedies'
        );
        assert.equal(
            context.__categoryApi.getTagCategoryLabel(
                { category: 'EXPORT_CTRL', category_label: 'US Export Control' },
                { direction: 'export', routeContext: { focus: 'import' } }
            ),
            'Import Controls & Trade Remedies'
        );
    });

    it('uses dedicated themes for filing and origin evidence cards', () => {
        const context = loadCore();
        const { getCategoryTheme } = context.__categoryApi;
        const exportTheme = getCategoryTheme('EXPORT_DECLARATION', 'Export Filing & Documents');
        const originTheme = getCategoryTheme('ORIGIN_DOC', 'Origin & Anti-Circumvention');

        assert.equal(exportTheme.class, 'origin-doc');
        assert.equal(exportTheme.icon, '🧾');
        assert.equal(originTheme.class, 'origin-doc');
        assert.equal(originTheme.icon, '🧭');

        const greenTheme = getCategoryTheme('ENVIRONMENT_BATTERY', 'Green Compliance & ESG');
        assert.equal(greenTheme.class, 'green-compliance');
        assert.equal(greenTheme.icon, '🌱');

        const importOverrideTheme = getCategoryTheme('EXPORT_CTRL', 'Import Controls & Trade Remedies');
        assert.equal(importOverrideTheme.class, 'import-regulation');
        assert.equal(importOverrideTheme.icon, '📦');
    });

    it('groups import-focused legacy export-control cards under import wording', () => {
        const { groupTagsByCategory } = loadRenderPrepareWithCore();
        const grouped = groupTagsByCategory([
            {
                tag_id: 'RS-US-8542-TEST',
                country: 'US',
                direction: 'import',
                route_focus: 'import',
                category: 'EXPORT_CTRL',
                category_label: 'US Export Control',
                short_name: '[US High]'
            }
        ], {
            direction: 'export',
            routeContext: { from: 'CN', to: 'US', focus: 'import' }
        });

        assert.deepEqual(Object.keys(grouped), ['Import Controls & Trade Remedies']);
    });

    it('keeps high-frequency import-focused control cards out of Export Control display wording', () => {
        const { groupTagsByCategory } = loadRenderPrepareWithCore();
        const highFrequencyImportControls = [
            'solar panel photovoltaic',
            'H200',
            'HBM3E high bandwidth memory',
            'optical transceiver module',
            'industrial robot arm',
            'laboratory analyzer electronic diagnostic device'
        ].map((product, index) => ({
            tag_id: `IMPORT-RENDER-${index}`,
            country: 'US',
            route_focus: 'import',
            category: 'EXPORT_CTRL',
            category_label: `${product} Export Control`,
            short_name: `[${product}]`
        }));
        const grouped = groupTagsByCategory(highFrequencyImportControls, {
            direction: 'export',
            routeContext: { from: 'CN', to: 'US', focus: 'import' }
        });

        assert.deepEqual(Object.keys(grouped), ['Import Controls & Trade Remedies']);
        assert.equal(grouped['Import Controls & Trade Remedies'].tags.length, highFrequencyImportControls.length);
    });
});
