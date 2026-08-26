'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRegulatoryRouteImpact, buildPostEntryHref } = require('../scripts/build-regulatory-route-impact');

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

test('regulatory impact builds a prefilled Post-Entry route without inventing an origin', () => {
    assert.equal(buildPostEntryHref({ id: 'fcc', affected_routes: ['US -> SG'], candidate_hs: ['8517.62'], products: [{ label: 'Wi-Fi router' }], effective_date: '2026-09-01' }), 'post-entry.html?from=US&to=SG&hs=851762&product=Wi-Fi+router&effective_date=2026-09-01&change=fcc&focus=import');
    assert.equal(buildPostEntryHref({ affected_routes: ['Any maintained origin -> EU'], candidate_hs: ['8542'] }), 'post-entry.html?to=EU&hs=8542&focus=import');
});
