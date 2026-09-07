'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GLOBAL_CRAWL_SOURCES, validateSourceFingerprint, fetchSingleSource } = require('../lib/global-crawl-main');

test('regulatory source fingerprint rejects short and unrelated success pages', () => {
    assert.throws(() => validateSourceFingerprint({}, 'OK'), /shorter than/);
    assert.throws(() => validateSourceFingerprint({ min_content_chars: 5, content_markers: ['tariff', 'customs'] }, 'generic navigation page'), /expected one of/);
});

test('every actively fetched regulatory source has an identity fingerprint', () => {
    const active = GLOBAL_CRAWL_SOURCES.filter(source => source.enabled !== false && !source.monitor_only);
    assert.ok(active.length > 0);
    assert.deepEqual(active.filter(source => !Array.isArray(source.content_markers) || !source.content_markers.length).map(source => source.id), []);
});

test('regulatory source fingerprint accepts substantive matching official content', () => {
    assert.equal(validateSourceFingerprint({ min_content_chars: 20, content_markers: ['customs', 'tariff'] }, 'Official customs notices and current trade guidance'), true);
});

test('non-matching successful source bodies are rejected before fallback acceptance', async () => {
    await assert.rejects(
        fetchSingleSource({ id: 'fixture', country: 'US', type: 'import', method: 'fetch', url: 'data:text/plain,generic-navigation-content-that-is-long-enough', content_markers: ['Section 301'], min_content_chars: 20 }),
        /expected one of Section 301/
    );
});
