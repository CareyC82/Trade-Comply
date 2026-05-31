'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    areAdminRoutesEnabled,
    authorizeAdminRouteAccess,
    isProtectedAdminPath,
    extractAdminCredential,
    buildAdminForbiddenPayload
} = require('../lib/admin-route-security');

describe('admin-route-security', () => {
    const envBackup = {};

    beforeEach(() => {
        for (const key of ['ADMIN_ROUTES_ENABLED', 'TEST_CRAWL_SECRET', 'ADMIN_REVIEW_PASSWORD']) {
            envBackup[key] = process.env[key];
        }
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

    it('disables admin routes by default', () => {
        delete process.env.ADMIN_ROUTES_ENABLED;
        assert.equal(areAdminRoutesEnabled(), false);
        const result = authorizeAdminRouteAccess({
            headers: { 'X-Admin-Secret': 'x' },
            query: { secret: 'x' }
        });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'routes_disabled');
    });

    it('requires configured secrets when routes enabled', () => {
        process.env.ADMIN_ROUTES_ENABLED = '1';
        delete process.env.TEST_CRAWL_SECRET;
        delete process.env.ADMIN_REVIEW_PASSWORD;
        const result = authorizeAdminRouteAccess({ headers: { 'x-admin-secret': 'nope' } });
        assert.equal(result.reason, 'secrets_not_configured');
    });

    it('accepts X-Admin-Secret when enabled', () => {
        process.env.ADMIN_ROUTES_ENABLED = '1';
        process.env.TEST_CRAWL_SECRET = 'gate-secret';
        const result = authorizeAdminRouteAccess({
            headers: { 'X-Admin-Secret': 'gate-secret' }
        });
        assert.equal(result.ok, true);
        assert.equal(result.matched_secret, 'TEST_CRAWL_SECRET');
    });

    it('rejects query-string secrets', () => {
        process.env.ADMIN_ROUTES_ENABLED = '1';
        process.env.ADMIN_REVIEW_PASSWORD = 'admin-pass';
        const result = authorizeAdminRouteAccess({ query: { secret: 'admin-pass' } });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'missing_credential');
    });

    it('detects protected admin paths including debug', () => {
        assert.equal(isProtectedAdminPath('/api/test-crawl', 'GET', {}), true);
        assert.equal(isProtectedAdminPath('/api/review/pending', 'GET', {}), true);
        assert.equal(isProtectedAdminPath('/api/debug', 'GET', {}), true);
        assert.equal(isProtectedAdminPath('/api/hscode', 'POST', {}), false);
    });

    it('extractAdminCredential prefers X-Admin-Secret', () => {
        const cred = extractAdminCredential({
            headers: { 'X-Admin-Secret': 'primary', Authorization: 'Bearer secondary' },
            query: { secret: 'tertiary' }
        });
        assert.equal(cred.value, 'primary');
        assert.equal(cred.source, 'header:x-admin-secret');
    });

    it('buildAdminForbiddenPayload includes reason', () => {
        const body = buildAdminForbiddenPayload({ reason: 'routes_disabled' });
        assert.match(body.error, /disabled/i);
        assert.equal(body.reason, 'routes_disabled');
    });
});
