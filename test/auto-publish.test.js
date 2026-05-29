const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { autoPublishBatch } = require('../lib/auto-publish');

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function setupFixtureRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-autopub-'));
    writeJson(path.join(root, 'data', 'tags.json'), []);
    writeJson(path.join(root, 'data', 'cases.json'), []);
    writeJson(path.join(root, 'data', 'pending_data.json'), { version: 1, updated_at: null, items: [] });
    return root;
}

describe('auto-publish', () => {
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

    it('publishes valid signals and intercepts invalid rows', () => {
        const root = setupFixtureRoot();
        process.env.DATA_REVIEW_ROOT = root;

        const result = autoPublishBatch({
            risk_signals: [
                {
                    hs_code: '8542',
                    direction: 'export',
                    country: 'US',
                    risk_level: 'High',
                    source: 'US BIS',
                    content_en: 'Export license policy updated for advanced semiconductors.',
                    content_zh: '先进半导体出口许可证政策更新。'
                },
                {
                    hs_code: '',
                    direction: 'export',
                    country: 'US',
                    risk_level: 'High',
                    source: 'US BIS',
                    content_en: 'Invalid row should be intercepted.',
                    content_zh: '无效行应被拦截。'
                }
            ],
            source: 'test'
        });

        assert.equal(result.counts.published_tags, 1);
        assert.equal(result.counts.intercepted, 1);

        const tags = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tags.json'), 'utf8'));
        assert.equal(tags.length, 1);
        assert.ok(tags[0].tag_id.startsWith('RS-US-'));

        const pending = JSON.parse(fs.readFileSync(path.join(root, 'data', 'pending_data.json'), 'utf8'));
        assert.equal(pending.items.length, 1);
    });
});
