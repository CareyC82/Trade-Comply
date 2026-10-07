'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditSources, automationReadiness, cadenceDays, probeSource } = require('../scripts/audit-regulatory-source-health');
const models = require('../lib/wearable-product-models');

test('access-restricted official sources retain a current, time-bounded manual fallback', () => {
    const ids = [
        'fccExposure', 'usElectrical', 'redCyber', 'gdpr', 'battery',
        'jpRadio', 'jpPse', 'jpOnlineSeller', 'jpPseProducts', 'jpProductSafety',
        'auAcma', 'auResponsibleSupplier', 'auRcm', 'auProductSafety',
        'auButtonBattery', 'auAbfTariff', 'auAbfGst'
    ];
    ids.forEach((id) => {
        const source = models.sources[id];
        assert.ok(['last_good_manual_review', 'automatic_with_manual_fallback'].includes(source.monitorPolicy?.mode), id);
        assert.equal(source.monitorPolicy.reviewEveryDays, 30, id);
        assert.equal(source.reviewedAt, '2026-10-07', id);
    });
});

test('automatic source promotion requires structured current content and verified identity', () => {
    const source = { monitorRequiredTerms: ['authority', 'regulation'], monitorPolicy: { mode: 'automatic' } };
    const ready = automationReadiness(source, { capture_mode: 'official_content', content_hash: 'abc', last_good_at: '2026-08-26', status: 'current', content_summary: 'Authority regulation text' });
    assert.equal(ready.eligible_for_automatic_monitoring, true);
    const blocked = automationReadiness({ ...source, monitorPolicy: { mode: 'last_good_manual_review' } }, { capture_mode: 'metadata_seed', content_summary: 'Authority' });
    assert.equal(blocked.eligible_for_automatic_monitoring, false);
    assert.ok(blocked.blockers.includes('manual_fallback_still_required'));
});

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
    assert.equal(fcc.reviewed_at, '2026-10-05');
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

test('regulatory source audit separates inconclusive network probes from failed links', async () => {
    const report = await auditSources({
        now: new Date('2026-08-21T00:00:00Z'),
        probe: async (url) => url.includes('fcc.gov')
            ? { status: 'unreachable', error: 'network_error' }
            : { status: 'reachable', http_status: 200, final_url: url }
    });
    assert.equal(report.failed_link_count, 0);
    assert.ok(report.probe_degraded_count > 0);
    assert.ok(report.sources.filter((source) => source.url.includes('fcc.gov')).every((source) => source.alerts.includes('source_probe_degraded')));
});

test('regulatory source audit reports conclusive HTTP failures as failed links', async () => {
    const report = await auditSources({
        now: new Date('2026-08-21T00:00:00Z'),
        probe: async (url) => url.includes('fcc.gov')
            ? { status: 'http_error', http_status: 404, final_url: url }
            : { status: 'reachable', http_status: 200, final_url: url }
    });
    assert.ok(report.failed_link_count > 0);
    assert.ok(report.sources.filter((source) => source.url.includes('fcc.gov')).every((source) => source.alerts.includes('source_link_failed')));
});

test('official programs are reviewed more often than static official sources', () => {
    assert.ok(cadenceDays({ confidence: 'official_program' }) < cadenceDays({ confidence: 'official' }));
});

test('source health accepts a reachable official fallback while retaining the primary attempt', async () => {
    const link = await probeSource({
        url: 'https://authority.example/old',
        monitorUrls: ['https://authority.example/current.pdf']
    }, async (url) => url.endsWith('/old')
        ? { status: 'http_error', http_status: 404, final_url: url }
        : { status: 'reachable', http_status: 200, final_url: url });
    assert.equal(link.status, 'reachable');
    assert.equal(link.monitored_url, 'https://authority.example/current.pdf');
    assert.equal(link.attempts.length, 2);
});
