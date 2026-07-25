'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBacklog, classifyCandidate } = require('../scripts/build-unmet-search-backlog');
const { validateFeedbackPayload } = require('../feedback-store');

test('automatic search-gap records preserve route and quality context', () => {
    const result = validateFeedbackPayload({
        event_type: 'search_gap',
        product_query: 'smart ring',
        direction: 'import',
        trust_status: 'no_match',
        had_results: false,
        route_origin: 'CN',
        route_destination: 'EU',
        compliance_focus: 'import'
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.event_type, 'search_gap');
    assert.equal(result.record.route_origin, 'CN');
    assert.equal(result.record.route_destination, 'EU');
});

test('weekly backlog prioritizes repeated no-match searches over weak matches', () => {
    const backlog = buildBacklog({
        generated_at: '2026-07-25T00:00:00.000Z',
        top_in_scope_gap_products: [
            { product_query: 'smart ring', count: 4, views: ['electronics'] }
        ],
        top_weak_match_queries: [
            { product_query: 'industrial lidar', count: 5, views: ['electronics'] }
        ]
    });
    assert.equal(backlog.items[0].product_query, 'smart ring');
    assert.equal(backlog.items[0].priority_score, 12);
    assert.equal(backlog.items[1].priority_score, 5);
    assert.equal(backlog.items[0].status, 'research_pending');
});

test('weekly backlog retains manual review status and recognizes HS searches', () => {
    const backlog = buildBacklog({
        top_in_scope_gap_products: [{ product_query: '8517.79.00', count: 2, views: [] }]
    }, {
        items: [{ normalized_query: '8517.79.00', status: 'source_research', owner_note: 'Check tariff line.' }]
    });
    assert.equal(backlog.items[0].status, 'source_research');
    assert.equal(backlog.items[0].owner_note, 'Check tariff line.');
    assert.equal(classifyCandidate('8517.79.00').candidate_hs_code, '85177900');
});
