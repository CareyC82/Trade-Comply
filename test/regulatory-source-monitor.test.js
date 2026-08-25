'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeContent, contentHash, metadataSeed, contentIdentityMatches, classifyChange, lifecycleState, buildSnapshot } = require('../lib/regulatory-source-monitor');
const { adapterFor, parseOfficialPayload } = require('../lib/official-regulatory-source-adapters');

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

test('snapshot carries an explicit manual-review fallback policy', () => {
    const policySource = { ...source, monitorPolicy: { mode: 'last_good_manual_review', reviewEveryDays: 30 } };
    const result = buildSnapshot({ sources: { rule: policySource }, fetched: { rule: { ok: false, error: 'blocked' } }, now: '2026-01-01T00:00:00Z' });
    assert.deepEqual(result.snapshot.sources[0].monitor_policy, { mode: 'last_good_manual_review', review_every_days: 30 });
});

test('offline lifecycle refresh does not falsely mark official sources degraded', () => {
    const first = buildSnapshot({ sources: { rule: source }, fetched: { rule: { ok: true, content: 'A'.repeat(100) } }, now: '2026-01-01T00:00:00Z' });
    const next = buildSnapshot({ sources: { rule: source }, previous: first.snapshot, now: '2026-01-02T00:00:00Z' });
    assert.equal(next.snapshot.sources[0].status, 'current');
    assert.equal(next.snapshot.sources[0].fetched_at, '2026-01-01T00:00:00Z');
});

test('effective-date state machine separates pending, future and active rules', () => {
    assert.equal(lifecycleState({ lifecycle: { status: 'published_pending_effective_date', effectiveAt: null } }, Date.parse('2026-08-21')), 'published_pending_effective_date');
    assert.equal(lifecycleState({ lifecycle: { status: 'future', effectiveAt: '2027-02-18' } }, Date.parse('2026-08-21')), 'future');
    assert.equal(lifecycleState({ lifecycle: { status: 'future', effectiveAt: '2027-02-18' } }, Date.parse('2027-02-19')), 'active');
    assert.equal(lifecycleState({ lifecycle: { status: 'active', effectiveAt: '2026-01-01', transitionEndAt: '2026-12-31' } }, Date.parse('2026-08-21')), 'transition');
    assert.equal(lifecycleState({ lifecycle: { status: 'active', sunsetAt: '2026-08-01' } }, Date.parse('2026-08-21')), 'expired');
});

test('baseline captures are archived separately while wrong official pages stay pending', () => {
    const monitored = { ...source, monitorRequiredTerms: ['rule title'] };
    const baseline = { type: 'content_changed', previous_hash: contentHash(metadataSeed(monitored)), current_summary: 'Rule title official text' };
    assert.equal(contentIdentityMatches(monitored, baseline.current_summary), true);
    assert.equal(classifyChange(baseline, monitored, { content_summary: baseline.current_summary }), 'baseline_capture');
    assert.equal(classifyChange({ ...baseline, current_summary: 'Unrelated navigation page' }, monitored, { content_summary: 'Unrelated navigation page' }), 'invalid_capture');
    assert.equal(classifyChange({ ...baseline, current_hash: 'old' }, monitored, { content_hash: 'new', content_summary: baseline.current_summary }), 'superseded_capture');
    assert.equal(classifyChange({ ...baseline, previous_hash: 'old', previous_summary: 'Wrong page' }, monitored, { content_summary: baseline.current_summary }), 'capture_recovery');
    assert.equal(classifyChange({ ...baseline, previous_hash: 'migration' }, { ...monitored, monitorMigrationHashes: ['migration'] }, { content_summary: baseline.current_summary }), 'monitor_target_upgrade');
});

test('official adapters distinguish PDF and jurisdiction-specific HTML', () => {
    assert.equal(adapterFor({ url: 'https://docs.fcc.gov/rule.pdf' }, 'application/pdf'), 'official_pdf_fingerprint');
    assert.equal(adapterFor({ url: 'https://eur-lex.europa.eu/legal-content' }), 'eur_lex_html');
    assert.equal(adapterFor({ url: 'https://www.meti.go.jp/policy/rule' }), 'jp_meti_html');
    assert.equal(adapterFor({ url: 'https://www.consumerproductsafety.gov.sg/suppliers/cpsr/' }), 'sg_cpso_html');
    const parsed = parseOfficialPayload({ source, body: `<html><nav>${'noise '.repeat(30)}</nav><main>${'official rule '.repeat(20)}</main></html>`, contentType: 'text/html' });
    assert.equal(parsed.ok, true);
    assert.doesNotMatch(parsed.content, /noise/);
});

test('official HTML parser selects the largest content region instead of a government-site banner', () => {
    const parsed = parseOfficialPayload({ source, body: `<main>${'government header '.repeat(8)}</main><main>${'controlled goods safety mark '.repeat(20)}</main>`, contentType: 'text/html' });
    assert.equal(parsed.ok, true);
    assert.match(parsed.content, /controlled goods safety mark/);
    assert.doesNotMatch(parsed.content, /government header/);
});

test('live monitor requires source identity terms before accepting an official page', () => {
    const script = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'scripts', 'update-regulatory-source-snapshots.js'), 'utf8');
    assert.match(script, /monitorRequiredTerms/);
    assert.match(script, /official_content_identity_mismatch/);
});
