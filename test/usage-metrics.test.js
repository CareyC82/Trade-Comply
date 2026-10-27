'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
    validateUsageMetricPayload,
    handleUsageMetricRequest,
    summarizeUsageEvents,
    enforceUsageMetricsRetention
} = require('../usage-metrics');

const validPayload = {
    event_name: 'can_i_sell_check_started',
    app_build: '20261027-usage-metrics-v1',
    page: 'can-i-sell-it',
    mode: 'single',
    market_count: 1,
    source: 'unknown',
    test_event: false
};

test('usage receiver accepts only anonymous allowlisted fields', () => {
    const accepted = validateUsageMetricPayload(validPayload);
    assert.equal(accepted.ok, true);
    assert.deepEqual(Object.keys(accepted.record).sort(), [
        'app_build', 'event_id', 'event_name', 'market_count', 'mode', 'occurred_at',
        'page', 'schema_version', 'source', 'test_event'
    ]);
    for (const forbidden of ['description', 'product', 'supplier', 'email', 'file', 'ip', 'user_agent', 'referrer']) {
        assert.equal(Object.hasOwn(accepted.record, forbidden), false);
    }

    const rejected = validateUsageMetricPayload({ ...validPayload, product_text: 'private product details' });
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /unsupported metric field/i);
});

test('usage receiver fails closed when persistent storage is unavailable', async () => {
    const previous = {
        bucket: process.env.OSS_BUCKET,
        id: process.env.OSS_ACCESS_KEY_ID,
        secret: process.env.OSS_ACCESS_KEY_SECRET
    };
    delete process.env.OSS_BUCKET;
    delete process.env.OSS_ACCESS_KEY_ID;
    delete process.env.OSS_ACCESS_KEY_SECRET;
    const result = await handleUsageMetricRequest(validPayload, { headers: { 'x-forwarded-for': '192.0.2.1' } });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.ok, false);
    if (previous.bucket !== undefined) process.env.OSS_BUCKET = previous.bucket;
    if (previous.id !== undefined) process.env.OSS_ACCESS_KEY_ID = previous.id;
    if (previous.secret !== undefined) process.env.OSS_ACCESS_KEY_SECRET = previous.secret;
});

test('usage receiver can store a validated event without returning its identifier', async () => {
    let stored;
    const result = await handleUsageMetricRequest(validPayload, { headers: { 'x-forwarded-for': '192.0.2.2' } }, {
        store: async (record) => { stored = record; return { storage: 'oss' }; }
    });
    assert.equal(result.statusCode, 202);
    assert.deepEqual(result.body, { ok: true, accepted: true, storage: 'oss' });
    assert.equal(stored.event_name, validPayload.event_name);
    assert.equal(Object.hasOwn(stored, 'ip'), false);
});

test('usage summary excludes smoke-test events by default', () => {
    const records = [
        { event_name: 'can_i_sell_entry_click', occurred_at: '2026-10-27T01:00:00Z', test_event: false },
        { event_name: 'can_i_sell_check_started', occurred_at: '2026-10-27T01:01:00Z', test_event: false },
        { event_name: 'can_i_sell_result_generated', occurred_at: '2026-10-27T01:02:00Z', test_event: true }
    ];
    const normal = summarizeUsageEvents(records);
    assert.equal(normal.totals.can_i_sell_result_generated, 0);
    assert.equal(normal.totals.can_i_sell_check_started, 1);
    const withTests = summarizeUsageEvents(records, { includeTest: true });
    assert.equal(withTests.totals.can_i_sell_result_generated, 1);
});

test('retention deletes expired anonymous event objects and preserves current objects', async () => {
    const calls = [];
    const config = {
        bucket: 'metrics-bucket', region: 'cn-shenzhen', accessKeyId: 'id', accessKeySecret: 'secret',
        prefix: 'usage-metrics', retentionDays: 30
    };
    const fetcher = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        if ((options.method || 'GET') === 'GET') {
            return {
                ok: true,
                status: 200,
                text: async () => '<ListBucketResult><IsTruncated>false</IsTruncated><Key>usage-metrics/raw/2026/08/01/old.json</Key><Key>usage-metrics/raw/2026/10/27/current.json</Key></ListBucketResult>'
            };
        }
        return { ok: true, status: 204, text: async () => '' };
    };
    const result = await enforceUsageMetricsRetention(config, { fetcher, now: new Date('2026-10-27T12:00:00Z') });
    assert.equal(result.checked, 2);
    assert.equal(result.deleted, 1);
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.match(calls.find((call) => call.method === 'DELETE').url, /2026\/08\/01\/old\.json$/);
});

function loadBrowserCollector({ hostname = 'tracewize.com', search = '', pathname = '/can-i-sell-it.html' } = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'usage-metrics.js'), 'utf8');
    const requests = [];
    const listeners = {};
    const context = {
        URL,
        URLSearchParams,
        Promise,
        console,
        location: { hostname, search, pathname, href: `https://${hostname}${pathname}${search}` },
        document: { addEventListener(name, fn) { listeners[name] = fn; } },
        fetch(url, options) { requests.push({ url, options }); return Promise.resolve({ ok: true }); }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'js/usage-metrics.js' });
    return { api: context.TradeComplyUsageMetrics, requests, listeners };
}

test('browser collector suppresses development hosts and sends only allowlisted production fields', async () => {
    const development = loadBrowserCollector({ hostname: '127.0.0.1' });
    const suppressed = await development.api.record('can_i_sell_check_started', { page: 'can-i-sell-it', mode: 'single', marketCount: 1 });
    assert.equal(suppressed.suppressed, true);
    assert.equal(development.requests.length, 0);

    const production = loadBrowserCollector({ search: '?utm_source=linkedin' });
    await production.api.record('can_i_sell_result_generated', { page: 'can-i-sell-it', mode: 'compare', marketCount: 4, description: 'must not leave browser' });
    const sent = JSON.parse(production.requests[0].options.body);
    assert.equal(sent.source, 'campaign');
    assert.equal(sent.market_count, 4);
    assert.equal(Object.hasOwn(sent, 'description'), false);
    assert.equal(Object.hasOwn(sent, 'referrer'), false);
});

test('production smoke flag is propagated to the destination and marks events as tests', async () => {
    const browser = loadBrowserCollector({ search: '?tw_test=1', pathname: '/' });
    const link = { href: 'https://tracewize.com/can-i-sell-it.html' };
    browser.listeners.click({ target: { closest: () => link } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(link.href, /tw_test=1/);
    assert.equal(JSON.parse(browser.requests[0].options.body).test_event, true);
});

test('Can I Sell It records start only after validation and result only after rendering', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'can-i-sell-it-page.js'), 'utf8');
    const emptyValidation = source.indexOf("if (!description)");
    const marketValidation = source.indexOf("if (comparing && (markets.length < 2 || markets.length > 4))");
    const started = source.indexOf("record('can_i_sell_check_started'");
    const assessment = source.indexOf('const preliminary = runAssessment', started);
    const rendered = source.indexOf('renderAssessment(preliminary)', assessment);
    const generated = source.indexOf("record('can_i_sell_result_generated'", rendered);
    assert.ok(emptyValidation < started);
    assert.ok(marketValidation < started);
    assert.ok(started < assessment);
    assert.ok(rendered < generated);
});

test('privacy copy states the anonymous scope and prohibited content', () => {
    const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sell = fs.readFileSync(path.join(__dirname, '..', 'can-i-sell-it.html'), 'utf8');
    for (const html of [home, sell]) {
        assert.match(html, /anonymous (?:counts|usage counts)/i);
        assert.match(html, /Product text/);
        assert.match(html, /no tracking cookie or persistent identity/i);
    }
});

test('FC endpoint rejects unapproved origins and fails closed without OSS', async () => {
    const previous = {
        bucket: process.env.OSS_BUCKET,
        id: process.env.OSS_ACCESS_KEY_ID,
        secret: process.env.OSS_ACCESS_KEY_SECRET
    };
    delete process.env.OSS_BUCKET;
    delete process.env.OSS_ACCESS_KEY_ID;
    delete process.env.OSS_ACCESS_KEY_SECRET;
    const { handler } = require('../index');
    const request = (origin) => handler({
        httpMethod: 'POST',
        path: '/api/usage-metrics',
        headers: { origin, 'x-forwarded-for': origin === 'https://evil.example' ? '192.0.2.3' : '192.0.2.4' },
        body: JSON.stringify(validPayload)
    });
    const forbidden = await request('https://evil.example');
    assert.equal(forbidden.statusCode, 403);
    const unavailable = await request('https://tracewize.com');
    assert.equal(unavailable.statusCode, 503);
    assert.equal(JSON.parse(unavailable.body).ok, false);
    if (previous.bucket !== undefined) process.env.OSS_BUCKET = previous.bucket;
    if (previous.id !== undefined) process.env.OSS_ACCESS_KEY_ID = previous.id;
    if (previous.secret !== undefined) process.env.OSS_ACCESS_KEY_SECRET = previous.secret;
});
