const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildReadiness
} = require('../scripts/check-unmet-search-production-readiness');

test('unmet-search production preflight reports missing OSS credentials without values', () => {
    const payload = buildReadiness({
        env: {},
        now: new Date('2026-07-27T00:00:00.000Z')
    });
    assert.equal(payload.ok, false);
    assert.deepEqual(payload.missing, ['OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']);
    assert.doesNotMatch(JSON.stringify(payload), /accessKeySecret|secret-value/i);
});

test('unmet-search production preflight accepts Alibaba credential aliases', () => {
    const payload = buildReadiness({
        env: {
            OSS_BUCKET: 'feedback-bucket',
            ALIBABA_CLOUD_ACCESS_KEY_ID: 'id-value',
            ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'secret-value'
        },
        now: new Date('2026-07-27T00:00:00.000Z')
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.storage, 'oss');
    assert.deepEqual(payload.missing, []);
    assert.doesNotMatch(JSON.stringify(payload), /id-value|secret-value/);
});
