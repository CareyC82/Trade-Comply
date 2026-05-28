const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    stagePendingItems,
    approvePendingItem,
    rejectPendingItem,
    listPendingItems
} = require('../lib/data-review');

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function setupFixtureRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-review-'));
    writeJson(path.join(root, 'data', 'tags.json'), []);
    writeJson(path.join(root, 'data', 'cases.json'), []);
    writeJson(path.join(root, 'data', 'pending_data', 'queue.json'), {
        version: 1,
        updated_at: null,
        items: []
    });
    return root;
}

describe('data-review', () => {
    let previousRoot;

    beforeEach(() => {
        previousRoot = process.env.DATA_REVIEW_ROOT;
    });

    afterEach(() => {
        if (previousRoot === undefined) {
            delete process.env.DATA_REVIEW_ROOT;
        } else {
            process.env.DATA_REVIEW_ROOT = previousRoot;
        }
    });

    it('stages, approves into prod tags, and removes from pending', () => {
        const root = setupFixtureRoot();
        process.env.DATA_REVIEW_ROOT = root;

        const tag = {
            tag_id: 'CL-TEST-001',
            category: 'OTHER',
            category_label: 'Other',
            tag_type: 'MATCHED',
            short_name: '[Test]',
            short_description: 'Test tag for unit test',
            description: 'Test description',
            source_citation: 'Test',
            source_url: 'https://example.com',
            effective_date: '2026-01-01',
            status: 'ACTIVE',
            direction: 'export',
            related_hs_codes: ['8541'],
            related_keywords: ['test', 'chip', 'unit'],
            related_cases: [],
            display_order: 99
        };

        const { staged } = stagePendingItems({ tags: [tag], source: 'unit-test' });
        assert.equal(staged.length, 1);

        const pendingId = staged[0].pending_id;
        const approve = approvePendingItem(pendingId, { rebuildCatalog: false });
        assert.equal(approve.ok, true);

        const prodTags = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tags.json'), 'utf8'));
        assert.equal(prodTags.length, 1);
        assert.equal(prodTags[0].tag_id, 'CL-TEST-001');

        assert.equal(listPendingItems().length, 0);
    });

    it('reject removes pending without writing prod', () => {
        const root = setupFixtureRoot();
        process.env.DATA_REVIEW_ROOT = root;

        const tag = {
            tag_id: 'CL-TEST-002',
            category: 'OTHER',
            category_label: 'Other',
            tag_type: 'MATCHED',
            short_name: '[Test Reject]',
            short_description: 'Reject me',
            description: 'Reject test',
            source_citation: 'Test',
            source_url: 'https://example.com',
            effective_date: '2026-01-01',
            status: 'ACTIVE',
            direction: 'export',
            related_hs_codes: ['8541'],
            related_keywords: ['reject', 'test', 'case'],
            related_cases: [],
            display_order: 99
        };

        const { staged } = stagePendingItems({ tags: [tag], source: 'unit-test' });
        const reject = rejectPendingItem(staged[0].pending_id);
        assert.equal(reject.ok, true);

        const prodTags = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tags.json'), 'utf8'));
        assert.equal(prodTags.length, 0);
        assert.equal(listPendingItems().length, 0);
    });
});
