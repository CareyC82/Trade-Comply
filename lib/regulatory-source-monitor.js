'use strict';

const crypto = require('node:crypto');

function normalizeContent(value) {
    return String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function contentHash(value) {
    return crypto.createHash('sha256').update(normalizeContent(value)).digest('hex');
}

function lifecycleState(source, now = Date.now()) {
    const lifecycle = source.lifecycle || {};
    if (lifecycle.status === 'repealed' || lifecycle.status === 'replaced') return lifecycle.status;
    const sunset = Date.parse(lifecycle.sunsetAt || '');
    if (Number.isFinite(sunset) && sunset <= now) return 'expired';
    if (lifecycle.status === 'published_pending_effective_date' && !lifecycle.effectiveAt) return 'published_pending_effective_date';
    const published = Date.parse(lifecycle.publishedAt || '');
    if (Number.isFinite(published) && published > now) return 'future';
    const effective = Date.parse(lifecycle.effectiveAt || '');
    if (Number.isFinite(effective) && effective > now) return 'future';
    const transitionStart = Date.parse(lifecycle.transitionStartAt || lifecycle.effectiveAt || '');
    const transitionEnd = Date.parse(lifecycle.transitionEndAt || '');
    if (Number.isFinite(transitionEnd) && transitionEnd > now && (!Number.isFinite(transitionStart) || transitionStart <= now)) return 'transition';
    return lifecycle.status === 'future' ? 'active' : (lifecycle.status || 'active');
}

function metadataSeed(source) {
    return normalizeContent(`${source.authority}. ${source.title}. ${source.scope || ''}`);
}

function contentIdentityMatches(source, value) {
    const content = normalizeContent(value).toLowerCase();
    return (source.monitorRequiredTerms || []).every((term) => content.includes(String(term).toLowerCase()));
}

function classifyChange(change, source, currentRow) {
    if (change.type !== 'content_changed') return 'substantive_candidate';
    if (currentRow?.content_hash && change.current_hash && currentRow.content_hash !== change.current_hash) return 'superseded_capture';
    if (!contentIdentityMatches(source, currentRow?.content_summary || change.current_summary || '')) return 'invalid_capture';
    if ((source.monitorMigrationHashes || []).includes(change.previous_hash)) return 'monitor_target_upgrade';
    if (change.previous_hash === contentHash(metadataSeed(source))) return 'baseline_capture';
    if ((source.monitorRequiredTerms || []).length && !contentIdentityMatches(source, change.previous_summary || '')) return 'capture_recovery';
    return 'substantive_candidate';
}

function buildSnapshot({ sources, previous = {}, fetched = {}, now = new Date().toISOString() }) {
    const rows = [];
    const changes = [];
    const nowMs = Date.parse(now);
    Object.entries(sources).forEach(([id, source]) => {
        const prior = previous.sources?.find((item) => item.id === id);
        const response = fetched[id];
        const normalized = response?.ok ? normalizeContent(response.content) : '';
        const usable = normalized.length >= 80;
        let row;
        if (response === undefined && prior?.content_hash) {
            row = { ...prior, id, url: source.url };
        } else if (usable) {
            row = {
                id, url: source.url, content_hash: contentHash(normalized),
                content_summary: normalized.slice(0, 500), capture_mode: 'official_content',
                adapter: response.adapter || 'official_html',
                monitored_url: response.monitoredUrl || source.url,
                fetched_at: now, last_good_at: now, status: 'current', preserved_last_good: false
            };
        } else if (prior?.content_hash) {
            row = {
                ...prior, id, url: source.url, fetched_at: now,
                status: 'last_good_degraded', preserved_last_good: true,
                fetch_error: response?.error || (response?.ok ? 'empty_or_unusable_content' : 'not_fetched')
            };
        } else {
            const seed = metadataSeed(source);
            row = {
                id, url: source.url, content_hash: contentHash(seed), content_summary: seed,
                capture_mode: 'metadata_seed', fetched_at: now, last_good_at: now,
                status: 'baseline_seed', preserved_last_good: false
            };
        }
        row.lifecycle_state = lifecycleState(source, nowMs);
        row.lifecycle = source.lifecycle || { status: 'active' };
        row.monitor_policy = source.monitorPolicy
            ? { mode: source.monitorPolicy.mode, review_every_days: source.monitorPolicy.reviewEveryDays || source.monitorPolicy.review_every_days }
            : row.status === 'last_good_degraded'
                ? { mode: 'last_good_manual_review', review_every_days: 30 }
                : { mode: 'automatic' };
        if (prior && prior.content_hash !== row.content_hash) changes.push({ id, type: 'content_changed', previous_hash: prior.content_hash, current_hash: row.content_hash, previous_summary: prior.content_summary || '', current_summary: row.content_summary || '', detected_at: now });
        if (prior && prior.lifecycle_state !== row.lifecycle_state) changes.push({ id, type: 'lifecycle_changed', previous: prior.lifecycle_state, current: row.lifecycle_state, detected_at: now });
        rows.push(row);
    });
    return { snapshot: { schema_version: 1, generated_at: now, source_count: rows.length, sources: rows }, changes };
}

module.exports = { normalizeContent, contentHash, metadataSeed, contentIdentityMatches, classifyChange, lifecycleState, buildSnapshot };
