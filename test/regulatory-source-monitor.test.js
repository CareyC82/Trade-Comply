'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeContent, contentHash, lifecycleState, buildSnapshot } = require('../lib/regulatory-source-monitor');

const source = { authority: 'Authority', title: 'Rule title', scope: 'Official scope', url: 'https://example.gov/rule', lifecycle: { status: 'active', effectiveAt: '2025-01-01' } };

test('normalization produces stable hashes for presentation-only HTML changes', () => {
    assert.equal(contentHash('<h1>Rule</h1>   text'), contentHash('<h1>Rule</h1> text'));
    assert.equal(normalizeContent('<style>x</style><p>A &amp; B</p>'), 'A & B');
});

test('official content changes are recorded', () => {
    const first = buildSnapshot({ sources: { rule: source }, fetched: { rule: { ok: true, content: 'A'.repeat(100) } }, now: '2026-01-01T00:00:00Z' });
    const second = buildSnapshot({ sources: { rule: source }, previous: first.snapshot, fetched: { rule: { ok: true, content: 'B'.repeat(100) } }, now: '2026-01-02T00:00:00Z' });
    assert.equal(second.changes[0].type, 'content_changed');
});

test('network and empty-parser failures preserve the last known good snapshot', () => {
    const first = buildSnapshot({ sources: { rule: source }, fetched: { rule: { ok: true, content: 'A'.repeat(100) } }, now: '2026-01-01T00:00:00Z' });
    for (const response of [{ ok: false, error: 'network' }, { ok: true, content: '' }]) {
        const next = buildSnapshot({ sources: { rule: source }, previous: first.snapshot, fetched: { rule: response }, now: '2026-01-02T00:00:00Z' });
        assert.equal(next.snapshot.sources[0].content_hash, first.snapshot.sources[0].content_hash);
        assert.equal(next.snapshot.sources[0].status, 'last_good_degraded');
        assert.equal(next.snapshot.sources[0].preserved_last_good, true);
    }
});

test('effective-date state machine separates pending, future and active rules', () => {
    assert.equal(lifecycleState({ lifecycle: { status: 'published_pending_effective_date', effectiveAt: null } }, Date.parse('2026-08-21')), 'published_pending_effective_date');
    assert.equal(lifecycleState({ lifecycle: { status: 'future', effectiveAt: '2027-02-18' } }, Date.parse('2026-08-21')), 'future');
    assert.equal(lifecycleState({ lifecycle: { status: 'future', effectiveAt: '2027-02-18' } }, Date.parse('2027-02-19')), 'active');
});
