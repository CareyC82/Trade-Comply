'use strict';

const fs = require('node:fs');
const path = require('node:path');
const models = require('../lib/wearable-product-models');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'consumer-regulatory-source-health.json');
const DAY_MS = 24 * 60 * 60 * 1000;

function cadenceDays(source) {
    if (/pending/i.test(source.confidence || '')) return 30;
    if (/program|guidance/i.test(source.confidence || '')) return 180;
    return 270;
}

async function probeUrl(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        if (response.status === 405) response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        const abuseBlocked = /abuse-detection|apology_objects/i.test(response.url || '');
        const status = response.ok ? 'reachable'
            : abuseBlocked ? 'access_blocked'
            : [401, 403, 429].includes(response.status) ? 'access_blocked'
                : 'http_error';
        return { status, http_status: response.status, final_url: response.url };
    } catch (error) {
        return { status: 'unreachable', error: error.name === 'AbortError' ? 'timeout' : 'network_error' };
    } finally {
        clearTimeout(timer);
    }
}

async function probeSource(source, probe) {
    const urls = [source.url, ...(source.monitorUrls || [])].filter(Boolean);
    const attempts = [];
    for (const url of urls) {
        const result = await probe(url);
        attempts.push({ url, ...result });
        if (['reachable', 'access_blocked'].includes(result.status)) {
            return { ...result, monitored_url: url, attempts };
        }
    }
    return { ...(attempts.at(-1) || { status: 'unreachable', error: 'network_error' }), attempts };
}

async function auditSources({ now = new Date(), probe = null } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
    const rows = [];
    for (const [id, source] of Object.entries(models.sources)) {
        const reviewedMs = Date.parse(source.reviewedAt || '');
        const intervalDays = cadenceDays(source);
        const nextReviewMs = Number.isFinite(reviewedMs) ? reviewedMs + intervalDays * DAY_MS : null;
        const link = probe ? await probeSource(source, probe) : { status: 'not_probed' };
        const alerts = [];
        if (!Number.isFinite(reviewedMs)) alerts.push('review_date_missing');
        else if (nextReviewMs < nowMs) alerts.push('review_overdue');
        if (!source.confidence) alerts.push('confidence_missing');
        if (/pending/i.test(source.confidence || '')) alerts.push('effective_date_pending');
        if (['unreachable', 'http_error'].includes(link.status)) alerts.push('source_link_failed');
        rows.push({
            id,
            authority: source.authority,
            title: source.title,
            url: source.url,
            confidence: source.confidence,
            reviewed_at: source.reviewedAt,
            review_interval_days: intervalDays,
            next_review_at: nextReviewMs ? new Date(nextReviewMs).toISOString().slice(0, 10) : null,
            link,
            alerts
        });
    }
    const probeEnvironmentUnavailable = Boolean(probe) && rows.length > 0
        && rows.every((row) => row.link.status === 'unreachable' && ['network_error', 'timeout'].includes(row.link.error));
    if (probeEnvironmentUnavailable) rows.forEach((row) => {
        row.alerts = row.alerts.filter((alert) => alert !== 'source_link_failed');
        row.link.status = 'probe_unavailable';
    });
    return {
        schema_version: 1,
        generated_at: new Date(nowMs).toISOString(),
        live_links_probed: Boolean(probe),
        probe_status: !probe ? 'not_run' : probeEnvironmentUnavailable ? 'environment_unavailable' : 'completed',
        probe_alerts: probeEnvironmentUnavailable ? ['probe_environment_unavailable'] : [],
        source_count: rows.length,
        alert_count: rows.filter((row) => row.alerts.length).length,
        failed_link_count: rows.filter((row) => row.alerts.includes('source_link_failed')).length,
        sources: rows
    };
}

if (require.main === module) {
    const live = process.argv.includes('--probe-live');
    auditSources({ now: new Date(), probe: live ? probeUrl : null }).then((report) => {
        fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${report.source_count} sources, ${report.alert_count} alerts)`);
        if (report.failed_link_count) process.exitCode = 1;
    });
}

module.exports = { cadenceDays, probeUrl, probeSource, auditSources };
