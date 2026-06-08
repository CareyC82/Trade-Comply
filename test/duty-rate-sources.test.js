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
    probeEuTaricReadiness
} = require('../scripts/update-eu-duty-rates');
const {
    probeSingaporeReadiness
} = require('../scripts/update-sg-duty-rates');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const dutyRateSources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rate-sources.json'), 'utf8'));

test('duty-rate source roadmap covers every maintained duty-rate country', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const roadmap = summarizeSourceRoadmap(dutyRateSources, summary);

    assert.equal(roadmap.missing_coverage.length, 0);
    assert.equal(roadmap.missing_roadmap.length, 0);
    assert.ok(roadmap.auto_updatable.includes('US'));
    assert.ok(roadmap.updater_candidates.includes('EU'));
    assert.ok(roadmap.updater_candidates.includes('SG'));
});

test('duty-rate health check reports source roadmap status', () => {
    const result = runDutyRateHealthCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.source_roadmap_summary.source_count, dutyRateSources.sources.length);
    assert.deepEqual(result.source_roadmap_summary.missing_coverage, []);
    assert.deepEqual(result.source_roadmap_summary.missing_roadmap, []);
});

test('EU and Singapore updater probes are wired but do not write rates yet', () => {
    const eu = probeEuTaricReadiness();
    const sg = probeSingaporeReadiness();

    assert.equal(eu.ok, true);
    assert.equal(eu.writes_rates, false);
    assert.equal(eu.source_status, 'updater_candidate');
    assert.ok(eu.maintained_hs_prefixes.includes('850440'));

    assert.equal(sg.ok, true);
    assert.equal(sg.writes_rates, false);
    assert.equal(sg.source_status, 'updater_candidate');
    assert.ok(sg.maintained_hs_prefixes.includes('8517'));
});
