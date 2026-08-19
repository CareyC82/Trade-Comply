'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FccEasClient, normalizeFccId, validFccId } = require('../lib/fcc-eas-client');

test('FCC IDs are normalized and malformed values fail before network access', async () => {
    assert.equal(normalizeFccId('FCC ID: abc 123-model'), 'ABC123-MODEL');
    assert.equal(validFccId('ABC123-MODEL'), true);
    const client = new FccEasClient({ fetch: () => { throw new Error('must not run'); } });
    await assert.rejects(() => client.lookup('x'), /complete FCC ID/i);
});

test('official exact match is returned without upgrading it to product approval', async () => {
    let calls = 0;
    const client = new FccEasClient({
        now: () => Date.parse('2026-08-19T00:00:00Z'),
        fetch: async (url) => {
            calls += 1;
            assert.equal(url.searchParams.get('fccId'), 'ABC123-MODEL');
            return { ok: true, json: async () => [{ fccid: 'ABC123-MODEL', grantee: 'Example Radio Inc.', grantDate: '08/01/2026', applicationPurpose: 'Original Equipment', country: 'US' }] };
        }
    });
    const first = await client.lookup('abc123-model');
    assert.equal(first.verified, true);
    assert.match(first.disclaimer, /not full product approval/i);
    assert.equal((await client.lookup('ABC123-MODEL')).cached, true);
    assert.equal(calls, 1);
});

test('no exact record and upstream failure both fail safely', async () => {
    const noMatch = new FccEasClient({ fetch: async () => ({ ok: true, json: async () => [{ fccid: 'ABC123-OTHER' }] }) });
    assert.equal((await noMatch.lookup('ABC123-MODEL')).verified, false);
    const unavailable = new FccEasClient({ fetch: async () => { throw new Error('offline'); } });
    await assert.rejects(() => unavailable.lookup('ABC123-MODEL'), /unverified/i);
});
