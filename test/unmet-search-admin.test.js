'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    evaluateRuleReady,
    enrichBacklog,
    updateBacklogItem,
    writeBacklogAtomic
} = require('../lib/unmet-search-admin');

function fixtureItem() {
    return {
        id: 'gap-camera',
        normalized_query: 'industrial camera',
        product_query: 'Industrial Camera',
        count: 4,
        priority_score: 20,
        status: 'research_pending'
    };
}

test('rule-ready quality gate requires attributes, HS, official source, country and direction', () => {
    const incomplete = evaluateRuleReady(fixtureItem());
    assert.equal(incomplete.ok, false);
    assert.deepEqual(incomplete.missing, [
        'product_attributes',
        'confirmed_hs_codes',
        'official_sources',
        'countries',
        'directions'
    ]);

    const complete = evaluateRuleReady({
        ...fixtureItem(),
        product_attributes: ['machine vision'],
        confirmed_hs_codes: ['85258900'],
        official_sources: ['https://taxation-customs.ec.europa.eu/'],
        countries: ['EU'],
        directions: ['import']
    });
    assert.equal(complete.ok, true);
    assert.deepEqual(complete.missing, []);
});

test('status transition cannot reach rule_ready before the quality gate passes', () => {
    const payload = { items: [fixtureItem()] };
    assert.throws(
        () => updateBacklogItem(payload, 'gap-camera', { status: 'rule_ready' }),
        /Quality gate failed/
    );

    const updated = updateBacklogItem(payload, 'gap-camera', {
        status: 'rule_ready',
        product_attributes: ['machine vision'],
        confirmed_hs_codes: ['8525.89.00'],
        official_sources: ['https://hts.usitc.gov/'],
        countries: ['US'],
        directions: ['import']
    });
    assert.equal(updated.items[0].status, 'rule_ready');
    assert.equal(updated.items[0].quality_gate.ok, true);
    assert.equal(updated.summary.rule_ready, 1);
});

test('Top 10 contains only captured items and atomic persistence is valid JSON', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
        ...fixtureItem(),
        id: `gap-${index}`,
        normalized_query: `query ${index}`
    }));
    const payload = enrichBacklog({ source: 'automatic_search_gap_events', items });
    assert.equal(payload.items.length, 12);
    assert.equal(payload.top_10.length, 10);
    assert.deepEqual(payload.top_10.map((item) => item.id), items.slice(0, 10).map((item) => item.id));

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unmet-search-admin-'));
    const filePath = path.join(directory, 'backlog.json');
    writeBacklogAtomic(filePath, payload);
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(stored.item_count, 12);
    fs.rmSync(directory, { recursive: true });
});
