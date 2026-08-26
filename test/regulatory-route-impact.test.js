'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRegulatoryRouteImpact } = require('../scripts/build-regulatory-route-impact');

test('regulatory route impact publishes only pending human-review changes with product, HS and route scope', () => {
    const result = buildRegulatoryRouteImpact({ generated_at: '2026-08-26T00:00:00Z', changes: [
        { id: 'sgControlledGoods', type: 'content_changed', review_status: 'pending_review' },
        { id: 'fcc', type: 'content_changed', review_status: 'ignored' }
    ] });
    assert.equal(result.impacts.length, 1);
    assert.equal(result.impacts[0].id, 'sgControlledGoods');
    assert.ok(result.impacts[0].products.length > 0);
    assert.ok(result.impacts[0].candidate_hs.length > 0);
    assert.ok(result.impacts[0].affected_routes.includes('Any maintained origin -> SG'));
    assert.equal(result.impacts[0].auto_publish, false);
});
