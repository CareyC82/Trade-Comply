'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ARTIFACT_SOURCES } = require('../lib/duty-rate-artifact-sources');

test('every guarded tariff market has an official acquisition route and an honest completeness note', () => {
    assert.deepEqual(Object.keys(ARTIFACT_SOURCES), ['IN', 'KR', 'MY', 'VN', 'TW', 'RU']);
    for (const source of Object.values(ARTIFACT_SOURCES)) {
        assert.match(source.url, /^https:\/\//);
        assert.match(source.note, /complete|current/i);
        assert.ok(source.authority);
    }
});
