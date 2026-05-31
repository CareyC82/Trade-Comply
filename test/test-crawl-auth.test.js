'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    authorizeTestCrawlAccess,
    getConfiguredAdminSecrets
} = require('../lib/test-crawl-auth');

describe('test-crawl-auth', () => {
    const envBackup = {};

    beforeEach(() => {
        envBackup.TEST_CRAWL_SECRET = process.env.TEST_CRAWL_SECRET;
        envBackup.ADMIN_REVIEW_PASSWORD = process.env.ADMIN_REVIEW_PASSWORD;
        envBackup.ADMIN_ROUTES_ENABLED = process.env.ADMIN_ROUTES_ENABLED;
        process.env.ADMIN_ROUTES_ENABLED = '1';
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

    it('denies when admin routes are disabled', () => {
        process.env.ADMIN_ROUTES_ENABLED = '0';
        process.env.TEST_CRAWL_SECRET = 'test-secret';
        const result = authorizeTestCrawlAccess({ headers: { 'X-Admin-Secret': 'test-secret' } });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'routes_disabled');
    });

    it('denies when no secrets are configured', () => {
        delete process.env.TEST_CRAWL_SECRET;
        delete process.env.ADMIN_REVIEW_PASSWORD;
        assert.equal(getConfiguredAdminSecrets().length, 0);
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

    it('allows matching TEST_CRAWL_SECRET via X-Admin-Secret', () => {
        process.env.TEST_CRAWL_SECRET = 'test-secret';
        const result = authorizeTestCrawlAccess({ headers: { 'X-Admin-Secret': 'test-secret' } });
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
        const result = authorizeTestCrawlAccess({ headers: { 'X-Admin-Secret': 'wrong' } });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'invalid_credential');
    });
});
