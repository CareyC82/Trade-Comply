const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    runDutyRateHealthCheck,
    summarizeSourceRoadmap
} = require('../scripts/check-duty-rates');
const {
    summarizeDutyRateCoverage
} = require('../scripts/update-us-duty-rates');
const {
    applyBenchmarkToRule,
    probeEuTaricReadiness
} = require('../scripts/update-eu-duty-rates');
const {
    applySingaporeBenchmarkToRule,
    probeSingaporeReadiness
} = require('../scripts/update-sg-duty-rates');
const {
    applyMexicoBenchmarkToRule,
    probeMexicoReadiness
} = require('../scripts/update-mx-duty-rates');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const dutyRateSources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rate-sources.json'), 'utf8'));

test('duty-rate source roadmap covers every maintained duty-rate country', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const roadmap = summarizeSourceRoadmap(dutyRateSources, summary);

    assert.equal(roadmap.missing_coverage.length, 0);
    assert.equal(roadmap.missing_roadmap.length, 0);
    assert.ok(roadmap.auto_updatable.includes('US'));
    assert.ok(roadmap.benchmark_updatable.includes('EU'));
    assert.ok(roadmap.benchmark_updatable.includes('SG'));
    assert.ok(roadmap.benchmark_updatable.includes('MX'));
});

test('duty-rate health check reports source roadmap status', () => {
    const result = runDutyRateHealthCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.source_roadmap_summary.source_count, dutyRateSources.sources.length);
    assert.deepEqual(result.source_roadmap_summary.missing_coverage, []);
    assert.deepEqual(result.source_roadmap_summary.missing_roadmap, []);
});

test('EU, Singapore, and Mexico updater probes are wired as benchmark writers', () => {
    const eu = probeEuTaricReadiness();
    const sg = probeSingaporeReadiness();
    const mx = probeMexicoReadiness();

    assert.equal(eu.ok, true);
    assert.equal(eu.writes_rates, true);
    assert.equal(eu.writes_official_machine_rates, false);
    assert.equal(eu.source_status, 'benchmark_updatable');
    assert.ok(eu.maintained_hs_prefixes.includes('850440'));

    assert.equal(sg.ok, true);
    assert.equal(sg.writes_rates, true);
    assert.equal(sg.writes_official_machine_rates, false);
    assert.equal(sg.source_status, 'benchmark_updatable');
    assert.ok(sg.maintained_hs_prefixes.includes('8517'));

    assert.equal(mx.ok, true);
    assert.equal(mx.writes_rates, true);
    assert.equal(mx.writes_official_machine_rates, false);
    assert.equal(mx.source_status, 'benchmark_updatable');
    assert.ok(mx.maintained_hs_prefixes.includes('847130'));
});

test('EU updater marks maintained rules as benchmark checked without official status', () => {
    const rule = {
        id: 'TEST-EU',
        import_country: 'EU',
        base_rate: 0.027,
        add_on_layers: [],
        source_status: 'indicative'
    };
    const changes = applyBenchmarkToRule(rule, {
        base_rate: 0.027,
        source_hts: '850440 benchmark',
        source_rate_text: 'Benchmark text',
        source_note: 'Benchmark note'
    }, '2026-06-08T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.source_rate_text, 'Benchmark text');
});

test('Singapore updater keeps GST benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-SG',
        import_country: 'SG',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'import_gst', rate: 0.08, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applySingaporeBenchmarkToRule(rule, '2026-06-08T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.09);
    assert.equal(rule.additional_rate, 0.09);
});

test('Mexico updater keeps VAT benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-MX',
        import_country: 'MX',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'import_vat', rate: 0.15, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applyMexicoBenchmarkToRule(rule, '2026-06-09T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.16);
    assert.equal(rule.additional_rate, 0.16);
});
