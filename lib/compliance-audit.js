/**
 * Compliance audit fields for tags.json (English-first, crawl + manual review).
 */
'use strict';

const SOURCE_TYPES = new Set(['official_gazette', 'customs_notice', 'ministry_announcement']);
const JURISDICTIONS = new Set(['CN', 'US', 'EU']);
const EFFECTIVE_STATUSES = new Set(['active', 'pending_effective']);
const REVIEW_STATUSES = new Set(['ai_verified', 'manually_approved']);

/** Publisher source_id → source_type */
const SOURCE_TYPE_BY_ID = {
    'zh-mofcom': 'ministry_announcement',
    'zh-gac': 'customs_notice',
    'us-bis': 'ministry_announcement',
    'us-cbp': 'customs_notice',
    'eu-lex': 'official_gazette'
};

function resolveSourceType(sourceId, sourceTypeHint = '') {
    const id = String(sourceId || '').trim().toLowerCase();
    if (SOURCE_TYPE_BY_ID[id]) {
        return SOURCE_TYPE_BY_ID[id];
    }
    const hint = String(sourceTypeHint || '').toLowerCase();
    if (hint.includes('customs') || hint.includes('gac') || hint.includes('cbp')) {
        return 'customs_notice';
    }
    if (hint.includes('gazette') || hint.includes('eur-lex') || hint.includes('journal')) {
        return 'official_gazette';
    }
    return 'ministry_announcement';
}

function resolveJurisdiction(publisherCountry, sourceId = '') {
    const code = String(publisherCountry || '').trim().toUpperCase();
    if (JURISDICTIONS.has(code)) {
        return code;
    }
    const id = String(sourceId || '').toLowerCase();
    if (id.startsWith('zh-')) {
        return 'CN';
    }
    if (id.startsWith('us-')) {
        return 'US';
    }
    if (id.startsWith('eu-')) {
        return 'EU';
    }
    return 'CN';
}

function normalizeConfidenceScore(raw, { relevant = true } = {}) {
    if (!relevant) {
        return 0;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        return 0.5;
    }
    let score = num;
    if (score > 1 && score <= 100) {
        score = score / 100;
    }
    if (score < 0) {
        score = 0;
    }
    if (score > 1) {
        score = 1;
    }
    return Math.round(score * 1000) / 1000;
}

function normalizeEffectiveStatus(raw, { relevant = true } = {}) {
    if (!relevant) {
        return 'active';
    }
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'pending_effective' || value === 'pending' || value === 'pending effective') {
        return 'pending_effective';
    }
    return 'active';
}

function normalizeReviewStatus(raw, fallback = 'ai_verified') {
    const value = String(raw || fallback).trim().toLowerCase();
    if (REVIEW_STATUSES.has(value)) {
        return value;
    }
    return fallback;
}

function toIsoTimestamp(value) {
    if (!value) {
        return new Date().toISOString();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString();
    }
    return parsed.toISOString();
}

/**
 * Build audit block for automated crawl writes (review_status = ai_verified).
 */
function buildCrawlComplianceAudit({
    sourceId,
    publisherCountry,
    sourceTypeHint = '',
    aiVerdict = {},
    fetchedAt = null,
    verifiedAt = null
} = {}) {
    const relevant = aiVerdict.relevant === true;
    const lastVerifiedAt = toIsoTimestamp(verifiedAt || fetchedAt || aiVerdict.evaluated_at);

    return {
        last_verified_at: lastVerifiedAt,
        source_type: resolveSourceType(sourceId, sourceTypeHint),
        jurisdiction: resolveJurisdiction(publisherCountry, sourceId),
        effective_status: normalizeEffectiveStatus(aiVerdict.effective_status, { relevant }),
        review_status: 'ai_verified',
        confidence_score: normalizeConfidenceScore(aiVerdict.confidence_score, { relevant })
    };
}

/**
 * Stamp manual approval when a human publishes from the review queue.
 */
function stampManualReviewAudit(tagPayload = {}) {
    const existing = tagPayload || {};
    const tracker = existing.policy_tracker || {};
    const now = new Date().toISOString();

    const audit = {
        last_verified_at: now,
        source_type: existing.source_type
            || resolveSourceType(tracker.source_id, tracker.source_type),
        jurisdiction: existing.jurisdiction
            || resolveJurisdiction(existing.country || tracker.publisher_country, tracker.source_id),
        effective_status: normalizeEffectiveStatus(existing.effective_status, { relevant: true }),
        review_status: 'manually_approved',
        confidence_score: normalizeConfidenceScore(
            existing.confidence_score ?? tracker.confidence_score,
            { relevant: true }
        )
    };

    return {
        ...existing,
        ...audit,
        policy_tracker: {
            ...tracker,
            ...audit,
            updated_at: now
        }
    };
}

function attachAuditToManifestEntry(manifestEntry, audit) {
    if (!manifestEntry || !audit) {
        return manifestEntry;
    }
    return {
        ...manifestEntry,
        last_verified_at: audit.last_verified_at,
        source_type: audit.source_type,
        jurisdiction: audit.jurisdiction,
        effective_status: audit.effective_status,
        review_status: audit.review_status,
        confidence_score: audit.confidence_score
    };
}

module.exports = {
    SOURCE_TYPES,
    JURISDICTIONS,
    EFFECTIVE_STATUSES,
    REVIEW_STATUSES,
    SOURCE_TYPE_BY_ID,
    resolveSourceType,
    resolveJurisdiction,
    normalizeConfidenceScore,
    normalizeEffectiveStatus,
    normalizeReviewStatus,
    buildCrawlComplianceAudit,
    stampManualReviewAudit,
    attachAuditToManifestEntry
};
