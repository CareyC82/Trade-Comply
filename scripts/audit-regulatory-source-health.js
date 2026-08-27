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

function automationReadiness(source, snapshot = {}) {
    const requiredTerms = source.monitorRequiredTerms || [];
    const policyMode = source.monitorPolicy?.mode || 'automatic';
    const structuredCapture = snapshot.capture_mode === 'official_content'
        && Boolean(snapshot.content_hash)
        && Boolean(snapshot.last_good_at);
    const identityVerified = requiredTerms.length > 0
        && requiredTerms.every((term) => String(snapshot.content_summary || '').toLowerCase().includes(String(term).toLowerCase()));
    const blockers = [];
    if (!structuredCapture) blockers.push('official_content_capture_required');
    if (!requiredTerms.length) blockers.push('monitor_identity_terms_required');
    else if (!identityVerified) blockers.push('source_identity_not_verified');
    if (['last_good_degraded', 'baseline_seed'].includes(snapshot.status)) blockers.push('current_capture_required');
    if (['last_good_manual_review', 'automatic_with_manual_fallback'].includes(policyMode)) blockers.push('manual_fallback_still_required');
    return {
        policy_mode: policyMode,
        structured_capture: structuredCapture,
        identity_verified: identityVerified,
        eligible_for_automatic_monitoring: blockers.length === 0,
        blockers
    };
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

async function auditSources({ now = new Date(), probe = null, snapshots = null } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
    const rows = [];
    const snapshotById = new Map((snapshots?.sources || []).map((row) => [row.id, row]));
    for (const [id, source] of Object.entries(models.sources)) {
        const reviewedMs = Date.parse(source.reviewedAt || '');
        const intervalDays = cadenceDays(source);
        const nextReviewMs = Number.isFinite(reviewedMs) ? reviewedMs + intervalDays * DAY_MS : null;
        const link = probe ? await probeSource(source, probe) : { status: 'not_probed' };
        const readiness = automationReadiness(source, snapshotById.get(id) || {});
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
            automation_readiness: readiness,
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
        automatic_monitoring_ready_count: rows.filter((row) => row.automation_readiness.eligible_for_automatic_monitoring).length,
        automatic_monitoring_blocked_count: rows.filter((row) => !row.automation_readiness.eligible_for_automatic_monitoring).length,
        sources: rows
    };
}

if (require.main === module) {
    const live = process.argv.includes('--probe-live');
    const snapshotsPath = path.join(ROOT, 'data', 'consumer-regulatory-snapshots.json');
    const snapshots = fs.existsSync(snapshotsPath) ? JSON.parse(fs.readFileSync(snapshotsPath, 'utf8')) : null;
    auditSources({ now: new Date(), probe: live ? probeUrl : null, snapshots }).then((report) => {
        fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${report.source_count} sources, ${report.alert_count} alerts)`);
        if (report.failed_link_count) process.exitCode = 1;
    });
}

module.exports = { cadenceDays, automationReadiness, probeUrl, probeSource, auditSources };
