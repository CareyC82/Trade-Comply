'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isPublicPath } = require('../scripts/consumer-server');

test('consumer server exposes only explicit public assets', () => {
    assert.equal(isPublicPath('/can-i-sell-it.html'), true);
    assert.equal(isPublicPath('/css/style.css'), true);
    assert.equal(isPublicPath('/js/main.js'), true);
    assert.equal(isPublicPath('/lib/can-i-sell-it.js'), true);
    assert.equal(isPublicPath('/data/duty-rates.json'), true);
    assert.equal(isPublicPath('/admin.html'), false);
    assert.equal(isPublicPath('/.env'), false);
    assert.equal(isPublicPath('/.env.example'), false);
    assert.equal(isPublicPath('/.git/config'), false);
    assert.equal(isPublicPath('/package.json'), false);
    assert.equal(isPublicPath('/scripts/consumer-server.js'), false);
    assert.equal(isPublicPath('/lib/consumer-service.js'), false);
    assert.equal(isPublicPath('/data/pending_data.json'), false);
});

test('consumer server allows every browser module declared by the main entry point', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    const modules = [...main.matchAll(/'(js|lib)\/[^']+\.js'/g)].map((match) => match[0].slice(1, -1));
    assert.ok(modules.length > 20);
    assert.deepEqual(modules.filter((module) => !isPublicPath(`/${module}`)), []);
});
