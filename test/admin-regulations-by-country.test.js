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

test('country regulation records distinguish named requirements from internal baselines', () => {
    const baseline = { ...tags[0], tag_id: 'CL-CN-BASE', country: 'CN', short_name: '[CN Export Baseline]', short_description: 'China export baseline review' };
    const rows = model.buildRows([...tags, baseline], registry, {}, {});
    assert.equal(rows.find((row) => row.id === 'CL-CN-BASE').recordType, 'scope_baseline');
    assert.equal(rows.find((row) => row.id === 'CL-CN-BASE').instrumentName, '');
    assert.deepEqual(model.filterRows(rows, { recordType: 'scope_baseline' }).map((row) => row.id), ['CL-CN-BASE']);
    assert.equal(model.exportRows(model.filterRows(rows, { recordType: 'scope_baseline' }))[0].record_type, 'scope_baseline');
});

test('admin exposes a read-only regulations-by-country surface', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.match(html, /Regulations by Country/);
    assert.match(html, /regulation-country/);
    assert.match(html, /regulation-source-health/);
    assert.match(html, /regulation-review-state/);
    assert.match(html, /regulation-record-type/);
    assert.match(html, /这不是一项具名法规/);
    assert.match(html, /法规／项目名称/);
    assert.match(html, /本地 Admin 服务未运行或已停止/);
    assert.match(html, /btn-export-regulations-csv/);
    assert.match(html, /Country coverage summary/);
    assert.match(html, /打开产品和贸易路线初筛/);
    assert.match(html, /data-admin-target="overview"/);
    assert.match(html, /data-admin-section="regulations"/);
    assert.match(html, /审核台总览/);
    assert.match(html, /selectAdminSection/);
    assert.match(html, /adminOverviewState/);
    assert.match(html, /Official-linked baseline/);
    assert.match(html, /loadCountryRegulations/);
    assert.doesNotMatch(html, /data-regulation-action="(?:save|delete|publish)"/);
});
