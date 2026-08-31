'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAccuracyStatus } = require('../scripts/build-regulatory-accuracy-status');

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
});
