'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ConsumerService } = require('../lib/consumer-service');
const { createConsumerServer, isPublicPath } = require('../scripts/consumer-server');

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

test('consumer API keeps anonymous use stateless and supports the private account lifecycle', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-consumer-server-test-'));
    const app = new ConsumerService({ root, sessionSecret: 'session-secret-for-tests-32-bytes-long', fileKey: 'file-key-for-tests-32-bytes-long' });
    const server = createConsumerServer(app, { fccClient: {
        lookup: async (fccId) => ({ fccId, verified: true, status: 'official_match', records: [], source: { authority: 'FCC' } })
    } });
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
    } catch (error) {
        if (error.code === 'EPERM') { t.skip('Local socket binding is unavailable in this sandbox.'); return; }
        throw error;
    }
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (pathname, options = {}) => fetch(`${base}${pathname}`, {
        ...options,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });

    const anonymousSession = await request('/api/consumer/session');
    assert.equal((await anonymousSession.json()).user, null);
    const anonymousSave = await request('/api/consumer/assessments', { method: 'POST', body: JSON.stringify({ productLabel: 'Smart watch' }) });
    assert.equal(anonymousSave.status, 401);
    assert.equal(app.read().assessments.length, 0);

    const fccLookup = await request('/api/consumer/fcc-id/lookup', { method: 'POST', body: JSON.stringify({ fccId: 'ABC123-MODEL' }) });
    assert.equal(fccLookup.status, 200);
    assert.equal((await fccLookup.json()).result.verified, true);

    const registration = await request('/api/consumer/register', { method: 'POST', body: JSON.stringify({ email: 'buyer@example.com', password: 'long-password-buyer' }) });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    const saved = await request('/api/consumer/assessments', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ productLabel: 'Smart watch', market: 'US', assessment: { verdict: 'conditional' } }) });
    assert.equal(saved.status, 201);
    const history = await request('/api/consumer/assessments', { headers: { Cookie: cookie } });
    assert.equal((await history.json()).assessments.length, 1);

    const removed = await request('/api/consumer/account', { method: 'DELETE', headers: { Cookie: cookie }, body: '{}' });
    assert.equal(removed.status, 200);
    assert.equal(app.read().users.length, 0);
    assert.equal(app.read().assessments.length, 0);
    const oldSession = await request('/api/consumer/session', { headers: { Cookie: cookie } });
    assert.equal((await oldSession.json()).user, null);
});
