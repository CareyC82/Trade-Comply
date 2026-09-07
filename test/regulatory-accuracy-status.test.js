'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildAccuracyStatus, freshness } = require('../scripts/build-regulatory-accuracy-status');

test('accuracy status joins lifecycle, product depth, reviewed publication and parser gaps', () => {
    const report = buildAccuracyStatus(new Date('2026-08-27T00:00:00Z'));
    assert.equal(report.ok, true);
    assert.equal(report.product_market_depth.product_count, 30);
    assert.equal(report.product_market_depth.matrix_cell_count, 180);
    assert.equal(report.product_market_depth.attribute_scenario_cell_count, 1260);
    assert.equal(report.reviewed_change_pipeline.automatic_rule_publication, false);
    assert.deepEqual(report.reviewed_change_pipeline.required_release_states, ['pending_review', 'evidence_approved', 'rule_tests_passed', 'rule_published']);
    assert.ok(report.tariff_parser_gaps.markets.includes('MY'));
    assert.ok(report.tariff_parser_gaps.markets.includes('RU'));
    assert.equal(report.tariff_parser_gaps.malaysia_priority_hs, '847130');
    assert.deepEqual(report.tariff_parser_gaps.official_artifact_import_priority, ['IN', 'KR', 'MY', 'VN', 'TW', 'RU']);
    assert.deepEqual(Object.keys(report.tariff_parser_gaps.artifact_readiness), ['IN', 'KR', 'MY', 'VN', 'TW', 'RU']);
    assert.equal(report.tariff_parser_gaps.artifact_readiness.IN.priority, 1);
    assert.equal(report.tariff_parser_gaps.artifact_readiness.IN.ready, false);
    assert.match(report.tariff_parser_gaps.artifact_readiness.KR.next_action, /official KR tariff artifact/);
    assert.equal(typeof report.source_control.global_transport_health.regulatory_market_grades, 'object');
    assert.equal(report.source_control.global_transport_health.freshness.max_age_days, 2);
});

test('accuracy dependency freshness distinguishes current, stale and missing snapshots', () => {
    assert.equal(freshness('2026-09-06T00:00:00Z', new Date('2026-09-07T00:00:00Z'), 2).current, true);
    assert.equal(freshness('2026-09-01T00:00:00Z', new Date('2026-09-07T00:00:00Z'), 2).current, false);
    assert.equal(freshness('', new Date('2026-09-07T00:00:00Z'), 2).current, false);
});

test('weekly consumer monitor refreshes and commits regulatory accuracy status', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'consumer-regulatory-monitor.yml'), 'utf8');
    assert.match(workflow, /npm run build:automation-launch-status/);
    assert.match(workflow, /npm run build:regulatory-accuracy-status -- --allow-blocked/);
    assert.match(workflow, /data\/regulatory-accuracy-status\.json/);
});
