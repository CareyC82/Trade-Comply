'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../lib/admin-regulations-by-country');

const tags = [
    { tag_id: 'CL-AU-1', country: 'AU', short_name: 'RCM radio path', category: 'RADIO', category_label: 'Radio', tag_type: 'CHECK_REQUIRED', status: 'ACTIVE', direction: 'import', source_citation: 'ACMA', source_url: 'https://acma.example/radio', related_hs_codes: ['8517'], related_keywords: ['bluetooth'] },
    { tag_id: 'CL-NZ-1', country: 'NZ', short_name: 'Electrical safety', category: 'SAFETY', category_label: 'Safety', tag_type: 'CHECK_REQUIRED', status: 'FUTURE', direction: 'import', source_citation: 'WorkSafe NZ', source_url: 'https://worksafe.example/electric', related_hs_codes: ['8504'], related_keywords: ['charger'] }
];
const registry = { route_options: [{ value: 'AU', label: 'Australia' }, { value: 'NZ', label: 'New Zealand' }] };

test('country regulation index separates jurisdictions and preserves official evidence', () => {
    const rows = model.buildRows(tags, registry, { sources: [{ id: 'acma', url: 'https://acma.example/radio', status: 'current' }] }, {});
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.country === 'AU').sourceHealth, 'current');
    assert.equal(rows.find((row) => row.country === 'NZ').countryLabel, 'New Zealand');
    assert.equal(rows.find((row) => row.country === 'AU').coverageLevel, 'official_linked');
});

test('country regulation filters support country, category, status, health and text', () => {
    const rows = model.buildRows(tags, registry, {}, { source_control: { degraded_sources: [{ country: 'NZ' }] } });
    assert.deepEqual(model.filterRows(rows, { country: 'AU' }).map((row) => row.id), ['CL-AU-1']);
    assert.deepEqual(model.filterRows(rows, { category: 'SAFETY', status: 'FUTURE' }).map((row) => row.id), ['CL-NZ-1']);
    assert.deepEqual(model.filterRows(rows, { sourceHealth: 'country_caveat' }).map((row) => row.id), ['CL-NZ-1']);
    assert.deepEqual(model.filterRows(rows, { query: 'bluetooth' }).map((row) => row.id), ['CL-AU-1']);
});

test('country regulation index merges duplicate source records and preserves their scope', () => {
    const duplicate = { ...tags[0], tag_id: 'CL-AU-2', related_hs_codes: ['8525'], related_keywords: ['camera'] };
    const rows = model.buildRows([...tags, duplicate], registry, { sources: [{ id: 'acma', url: 'https://acma.example/radio', status: 'current' }] }, {});
    const australia = rows.find((row) => row.country === 'AU');
    assert.equal(rows.length, 2);
    assert.equal(australia.occurrenceCount, 2);
    assert.deepEqual(australia.ids, ['CL-AU-1', 'CL-AU-2']);
    assert.deepEqual(australia.hsCodes, ['8517', '8525']);
    assert.deepEqual(australia.keywords, ['bluetooth', 'camera']);
});

test('country summaries, review filters and exports use the visible merged rows', () => {
    const rows = model.buildRows(tags, registry, {}, { source_control: { degraded_sources: [{ country: 'NZ' }] } });
    const needsReview = model.filterRows(rows, { reviewState: 'needs_review' });
    assert.deepEqual(needsReview.map((row) => row.country), ['AU', 'NZ']);
    const summary = model.summarizeCountries(rows).find((row) => row.country === 'NZ');
    assert.equal(summary.needsReview, 1);
    const exported = model.exportRows(needsReview);
    const exportedNz = exported.find((row) => row.country_code === 'NZ');
    assert.equal(exportedNz.country, 'New Zealand');
    assert.equal(exportedNz.review_state, 'needs_review');
    assert.match(exportedNz.rule_ids, /CL-NZ-1/);
});

test('admin exposes a read-only regulations-by-country surface', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.match(html, /Regulations by Country/);
    assert.match(html, /regulation-country/);
    assert.match(html, /regulation-source-health/);
    assert.match(html, /regulation-review-state/);
    assert.match(html, /btn-export-regulations-csv/);
    assert.match(html, /Country coverage summary/);
    assert.match(html, /Open product and route pre-check/);
    assert.match(html, /Official-linked baseline/);
    assert.match(html, /loadCountryRegulations/);
    assert.doesNotMatch(html, /data-regulation-action="(?:save|delete|publish)"/);
});
