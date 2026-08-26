'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSourceFingerprint } = require('../lib/global-crawl-main');

test('regulatory source fingerprint rejects short and unrelated success pages', () => {
    assert.throws(() => validateSourceFingerprint({}, 'OK'), /shorter than/);
    assert.throws(() => validateSourceFingerprint({ min_content_chars: 5, content_markers: ['tariff', 'customs'] }, 'generic navigation page'), /expected one of/);
});

test('regulatory source fingerprint accepts substantive matching official content', () => {
    assert.equal(validateSourceFingerprint({ min_content_chars: 20, content_markers: ['customs', 'tariff'] }, 'Official customs notices and current trade guidance'), true);
});
