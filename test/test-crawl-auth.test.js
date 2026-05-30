'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    authorizeTestCrawlAccess,
    getConfiguredSecrets
} = require('../lib/test-crawl-auth');

describe('test-crawl-auth', () => {
    const envBackup = {};

    beforeEach(() => {
        envBackup.TEST_CRAWL_SECRET = process.env.TEST_CRAWL_SECRET;
        envBackup.ADMIN_REVIEW_PASSWORD = process.env.ADMIN_REVIEW_PASSWORD;
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(envBackup)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it('denies when no secrets are configured', () => {
        delete process.env.TEST_CRAWL_SECRET;
        delete process.env.ADMIN_REVIEW_PASSWORD;
        assert.equal(getConfiguredSecrets().length, 0);
        const result = authorizeTestCrawlAccess({ query: { key: 'anything' } });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'secrets_not_configured');
    });

    it('denies when secret configured but credential missing', () => {
        process.env.TEST_CRAWL_SECRET = 'test-secret';
        const result = authorizeTestCrawlAccess({ query: {} });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'missing_credential');
    });

    it('allows matching TEST_CRAWL_SECRET via query key', () => {
        process.env.TEST_CRAWL_SECRET = 'test-secret';
        const result = authorizeTestCrawlAccess({ query: { key: 'test-secret' } });
        assert.equal(result.ok, true);
        assert.equal(result.matched_secret, 'TEST_CRAWL_SECRET');
    });

    it('allows matching ADMIN_REVIEW_PASSWORD via Bearer', () => {
        process.env.ADMIN_REVIEW_PASSWORD = 'admin-pass';
        const result = authorizeTestCrawlAccess({ bearerToken: 'admin-pass' });
        assert.equal(result.ok, true);
        assert.equal(result.matched_secret, 'ADMIN_REVIEW_PASSWORD');
    });

    it('denies invalid credential', () => {
        process.env.TEST_CRAWL_SECRET = 'test-secret';
        const result = authorizeTestCrawlAccess({ query: { key: 'wrong' } });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'invalid_credential');
    });
});
