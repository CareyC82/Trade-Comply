'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditSources, cadenceDays } = require('../scripts/audit-regulatory-source-health');

test('regulatory source audit schedules reviews and flags pending effective dates', async () => {
    const report = await auditSources({ now: new Date('2026-08-21T00:00:00Z') });
    assert.ok(report.source_count >= 30);
    assert.equal(report.live_links_probed, false);
    assert.equal(report.probe_status, 'not_run');
    assert.equal(report.failed_link_count, 0);
    const fcc = report.sources.find((source) => source.id === 'fccMarketplace2026');
    assert.ok(fcc.alerts.includes('effective_date_pending'));
    assert.equal(fcc.review_interval_days, 30);
    assert.equal(fcc.link.status, 'not_probed');
});

test('an unavailable probe environment is not reported as thirty-two broken official links', async () => {
    const report = await auditSources({
        now: new Date('2026-08-21T00:00:00Z'),
        probe: async () => ({ status: 'unreachable', error: 'network_error' })
    });
    assert.equal(report.probe_status, 'environment_unavailable');
    assert.equal(report.failed_link_count, 0);
    assert.ok(report.probe_alerts.includes('probe_environment_unavailable'));
    assert.ok(report.sources.every((source) => source.link.status === 'probe_unavailable'));
});

test('regulatory source audit exposes failed links without leaking network errors', async () => {
    const report = await auditSources({
        now: new Date('2026-08-21T00:00:00Z'),
        probe: async (url) => url.includes('fcc.gov')
            ? { status: 'unreachable', error: 'network_error' }
            : { status: 'reachable', http_status: 200, final_url: url }
    });
    assert.ok(report.failed_link_count > 0);
    assert.ok(report.sources.filter((source) => source.url.includes('fcc.gov')).every((source) => source.alerts.includes('source_link_failed')));
});

test('official programs are reviewed more often than static official sources', () => {
    assert.ok(cadenceDays({ confidence: 'official_program' }) < cadenceDays({ confidence: 'official' }));
});
