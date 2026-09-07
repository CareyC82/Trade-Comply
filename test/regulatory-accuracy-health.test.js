'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluateRegulatoryAccuracyHealth, snapshotFreshness } = require('../scripts/check-regulatory-accuracy-health');

function payload(transport, launch) {
    return { source_control: { global_transport_health: { freshness: { timestamp: transport } }, automation_launch_freshness: { timestamp: launch } } };
}

test('regulatory health gate accepts two current dependency snapshots', () => {
    const result = evaluateRegulatoryAccuracyHealth(payload('2026-09-06T12:00:00Z', '2026-09-07T00:00:00Z'), { now: new Date('2026-09-07T12:00:00Z') });
    assert.equal(result.ok, true);
    assert.ok(result.checks.every((check) => check.current));
});

test('regulatory health gate rejects stale or missing snapshots without mutating data', () => {
    const input = payload('2026-09-01T00:00:00Z', null);
    const before = JSON.stringify(input);
    const result = evaluateRegulatoryAccuracyHealth(input, { now: new Date('2026-09-07T12:00:00Z') });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0].age_days, 6.5);
    assert.equal(result.checks[1].age_days, null);
    assert.equal(JSON.stringify(input), before);
});

test('snapshot freshness uses the two-day inclusive boundary', () => {
    assert.equal(snapshotFreshness('2026-09-05T12:00:00Z', new Date('2026-09-07T12:00:00Z'), 2).current, true);
    assert.equal(snapshotFreshness('2026-09-05T11:59:59Z', new Date('2026-09-07T12:00:00Z'), 2).current, false);
});

test('CI guardrail runs the regulatory freshness gate', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci-guardrail.yml'), 'utf8');
    assert.match(workflow, /npm run check:regulatory-accuracy-health/);
});
