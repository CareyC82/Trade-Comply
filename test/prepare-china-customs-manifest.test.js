'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { INDUSTRIES } = require('../lib/china-customs-flow');
const { buildManifest, supportedFiles } = require('../scripts/prepare-china-customs-manifest');

function tempInbox() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-cn-manifest-'));
}

test('prepares a relative-path manifest only for a complete official batch', () => {
    const directory = tempInbox();
    const rows = [
        'month,industry,imports_value_usd,exports_value_usd,official_platform_latest_period',
        ...INDUSTRIES.map(({ id }, index) => `2026-05,${id},${index + 1},${index + 101},2026-05`)
    ];
    fs.writeFileSync(path.join(directory, '2026-05-official.csv'), rows.join('\n'));
    fs.writeFileSync(path.join(directory, 'manifest.example.json'), '{}');

    assert.deepEqual(supportedFiles(directory), ['2026-05-official.csv']);
    const manifest = buildManifest(directory, { latestPeriod: '2026-05' });
    assert.deepEqual(manifest.required_months, ['2026-05']);
    assert.equal(manifest.required_industries.length, 9);
    assert.deepEqual(manifest.entries, [{ file: '2026-05-official.csv' }]);
});

test('refuses to prepare a manifest for incomplete or stale official files', () => {
    const directory = tempInbox();
    fs.writeFileSync(path.join(directory, '2026-05-memory.csv'), [
        'month,industry,imports_value_usd,exports_value_usd',
        '2026-05,memory,1,2'
    ].join('\n'));

    assert.throws(() => buildManifest(directory, { latestPeriod: '2026-05' }), /16 missing/);

    const completeDirectory = tempInbox();
    fs.writeFileSync(path.join(completeDirectory, '2026-05-official.csv'), [
        'month,industry,imports_value_usd,exports_value_usd',
        ...INDUSTRIES.map(({ id }) => `2026-05,${id},1,2`)
    ].join('\n'));
    assert.throws(() => buildManifest(completeDirectory, { latestPeriod: '2026-06' }), /does not match/);
});
