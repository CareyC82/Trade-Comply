/**
 * Global policy card audit trail (CL-GLPOL-* / policy_tracker tags).
 */
'use strict';

const REGULATORY_BODIES = {
    'zh-mofcom': {
        badge: 'CN-MOFCOM',
        label: 'China MOFCOM',
        cssClass: 'zh-mofcom'
    },
    'zh-gac': {
        badge: 'CN-GAC',
        label: 'China GAC Customs',
        cssClass: 'zh-gac'
    },
    'us-bis': {
        badge: 'US-BIS',
        label: 'US Bureau of Industry and Security',
        cssClass: 'us-bis'
    },
    'us-cbp': {
        badge: 'US-CBP',
        label: 'US Customs and Border Protection',
        cssClass: 'us-cbp'
    },
    'eu-lex': {
        badge: 'EU-EUR-LEX',
        label: 'EU EUR-Lex',
        cssClass: 'eu-lex'
    }
};

const PIPELINE_SOURCE_MAP = {
    bis: 'us-bis',
    cbp: 'us-cbp',
    mofcom: 'zh-mofcom',
    gac: 'zh-gac',
    eurlex: 'eu-lex',
    'eu-lex': 'eu-lex'
};

function isGlobalPolicyTag(tag) {
    if (!tag || typeof tag !== 'object') {
        return false;
    }
    const tagId = String(tag.tag_id || '');
    if (tagId.startsWith('CL-GLPOL-')) {
        return true;
    }
    return Boolean(tag.policy_tracker && typeof tag.policy_tracker === 'object');
}

function resolveRegulatoryBodyId(tag) {
    const tracker = tag.policy_tracker || {};
    const explicit = String(tracker.source_id || tag.source_id || '').trim().toLowerCase();
    if (explicit && REGULATORY_BODIES[explicit]) {
        return explicit;
    }

    const pipeline = String(tag.pipeline_source || '').trim().toLowerCase();
    if (pipeline && PIPELINE_SOURCE_MAP[pipeline]) {
        return PIPELINE_SOURCE_MAP[pipeline];
    }

    const citation = String(tag.source_citation || '').toLowerCase();
    const url = String(tag.source_url || '').toLowerCase();
    const haystack = `${citation} ${url}`;
    if (haystack.includes('mofcom')) return 'zh-mofcom';
    if (haystack.includes('customs.gov.cn') || haystack.includes('gac')) return 'zh-gac';
    if (haystack.includes('bis.doc.gov') || haystack.includes('bis ')) return 'us-bis';
    if (haystack.includes('cbp.gov')) return 'us-cbp';
    if (haystack.includes('eur-lex')) return 'eu-lex';

    return '';
}

function getRegulatoryBodyMeta(tag) {
    const bodyId = resolveRegulatoryBodyId(tag);
    if (bodyId && REGULATORY_BODIES[bodyId]) {
        return { id: bodyId, ...REGULATORY_BODIES[bodyId] };
    }
    return {
        id: 'unknown',
        badge: 'GLOBAL',
        label: 'Global regulatory source',
        cssClass: 'unknown'
    };
}

function formatAuditDateTime(value) {
    if (!value) {
        return '';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }
    return `${parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    })} UTC`;
}

function formatEffectiveDate(value) {
    if (!value) {
        return '';
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const parsed = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC'
            });
        }
    }
    return raw;
}

function resolveLastVerifiedTimestamp(tag) {
    const tracker = tag.policy_tracker || {};
    return tracker.updated_at || tracker.fetched_at || tag.last_verified_at || tag.fetched_at || '';
}

function resolveEffectiveDate(tag) {
    const tracker = tag.policy_tracker || {};
    return tag.effective_date || tracker.published_at || tracker.effective_date || '';
}

function resolveAuditField(tag, key) {
    const tracker = tag.policy_tracker || {};
    return tag[key] ?? tracker[key] ?? '';
}

function formatConfidenceScore(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return '';
    }
    const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
    return `${pct}%`;
}

function formatAuditLabel(value) {
    if (!value) {
        return '';
    }
    return String(value).replace(/_/g, ' ');
}

function buildRegulatoryBodyBadgeHtml(tag) {
    if (!isGlobalPolicyTag(tag)) {
        return '';
    }
    const meta = getRegulatoryBodyMeta(tag);
    const title = typeof escapeHtml === 'function' ? escapeHtml(meta.label) : meta.label;
    const badge = typeof escapeHtml === 'function' ? escapeHtml(meta.badge) : meta.badge;
    return `<span class="regulatory-body-badge regulatory-body-badge--${meta.cssClass}" title="${title}">[${badge}]</span>`;
}

function resolveReportJurisdiction(tag) {
    const jurisdiction = resolveAuditField(tag, 'jurisdiction');
    if (jurisdiction) {
        return String(jurisdiction).trim().toUpperCase();
    }
    const country = String(tag.country || '').trim().toUpperCase();
    if (country && country !== 'GLOBAL') {
        return country;
    }
    const meta = getRegulatoryBodyMeta(tag);
    const badge = String(meta.badge || '').toUpperCase();
    if (badge.startsWith('CN-')) {
        return 'CN';
    }
    if (badge.startsWith('US-')) {
        return 'US';
    }
    if (badge.startsWith('EU-')) {
        return 'EU';
    }
    return 'GLOBAL';
}

function formatReportRiskAuditLine(tag) {
    if (!tag || typeof tag !== 'object') {
        return '';
    }
    const jurisdiction = resolveReportJurisdiction(tag);
    const verifiedRaw = resolveLastVerifiedTimestamp(tag);
    let verifiedLabel = 'Pending';
    if (verifiedRaw) {
        const parsed = new Date(verifiedRaw);
        if (!Number.isNaN(parsed.getTime())) {
            verifiedLabel = parsed.toISOString().slice(0, 10);
        } else {
            verifiedLabel = String(verifiedRaw).slice(0, 10);
        }
    }
    return `Source Jurisdiction: [${jurisdiction}] | Verified: ${verifiedLabel}`;
}

function buildGlobalPolicyAuditTrailHtml(tag) {
    if (!isGlobalPolicyTag(tag)) {
        return '';
    }

    const meta = getRegulatoryBodyMeta(tag);
    const badgeHtml = buildRegulatoryBodyBadgeHtml(tag);
    const lastVerified = resolveLastVerifiedTimestamp(tag);
    const effectiveDate = resolveEffectiveDate(tag);
    const sourceUrl = String(tag.source_url || '').trim();

    const na = typeof t === 'function' ? t('auditTrailNotAvailable') : 'Not available';
    const lastVerifiedLabel = typeof t === 'function' ? t('auditTrailLastVerified') : 'Last Verified / Fetched';
    const effectiveLabel = typeof t === 'function' ? t('auditTrailEffectiveDate') : 'Policy Effective Date';
    const auditTitle = typeof t === 'function' ? t('auditTrailTitle') : 'Audit Trail';
    const officialBtn = typeof t === 'function' ? t('auditTrailOfficialSource') : 'View Official Source Statement';
    const sourceTypeLabel = typeof t === 'function' ? t('auditTrailSourceType') : 'Source type';
    const jurisdictionLabel = typeof t === 'function' ? t('auditTrailJurisdiction') : 'Jurisdiction';
    const effectiveStatusLabel = typeof t === 'function' ? t('auditTrailEffectiveStatus') : 'Effective status';
    const reviewStatusLabel = typeof t === 'function' ? t('auditTrailReviewStatus') : 'Review status';
    const confidenceLabel = typeof t === 'function' ? t('auditTrailConfidence') : 'AI confidence';

    const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
    const lastVerifiedDisplay = lastVerified ? esc(formatAuditDateTime(lastVerified)) : esc(na);
    const effectiveDisplay = effectiveDate ? esc(formatEffectiveDate(effectiveDate)) : esc(na);
    const sourceType = resolveAuditField(tag, 'source_type');
    const jurisdiction = resolveAuditField(tag, 'jurisdiction');
    const effectiveStatus = resolveAuditField(tag, 'effective_status');
    const reviewStatus = resolveAuditField(tag, 'review_status');
    const confidence = formatConfidenceScore(resolveAuditField(tag, 'confidence_score'));

    const officialLink = sourceUrl && typeof sanitizeUrl === 'function'
        ? `<a class="policy-official-source-btn" href="${sanitizeUrl(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(officialBtn)}</a>`
        : `<span class="policy-official-source-btn policy-official-source-btn--disabled" aria-disabled="true">${esc(officialBtn)} (${esc(na)})</span>`;

    return `
        <section class="policy-audit-trail" aria-label="${esc(auditTitle)}">
            <div class="policy-audit-trail-top">
                ${badgeHtml}
                <span class="policy-audit-trail-title">${esc(auditTitle)}</span>
            </div>
            <dl class="policy-audit-trail-meta">
                <div class="policy-audit-trail-row">
                    <dt>${esc(lastVerifiedLabel)}</dt>
                    <dd><time datetime="${esc(lastVerified || '')}">${lastVerifiedDisplay}</time></dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(effectiveLabel)}</dt>
                    <dd><time datetime="${esc(effectiveDate || '')}">${effectiveDisplay}</time></dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(sourceTypeLabel)}</dt>
                    <dd>${sourceType ? esc(formatAuditLabel(sourceType)) : esc(na)}</dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(jurisdictionLabel)}</dt>
                    <dd>${jurisdiction ? esc(jurisdiction) : esc(na)}</dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(effectiveStatusLabel)}</dt>
                    <dd>${effectiveStatus ? esc(formatAuditLabel(effectiveStatus)) : esc(na)}</dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(reviewStatusLabel)}</dt>
                    <dd>${reviewStatus ? esc(formatAuditLabel(reviewStatus)) : esc(na)}</dd>
                </div>
                <div class="policy-audit-trail-row">
                    <dt>${esc(confidenceLabel)}</dt>
                    <dd>${confidence ? esc(confidence) : esc(na)}</dd>
                </div>
            </dl>
            ${officialLink}
        </section>
    `;
}

if (typeof globalThis !== 'undefined') {
    globalThis.isGlobalPolicyTag = isGlobalPolicyTag;
    globalThis.buildRegulatoryBodyBadgeHtml = buildRegulatoryBodyBadgeHtml;
    globalThis.buildGlobalPolicyAuditTrailHtml = buildGlobalPolicyAuditTrailHtml;
    globalThis.resolveRegulatoryBodyId = resolveRegulatoryBodyId;
    globalThis.formatReportRiskAuditLine = formatReportRiskAuditLine;
    globalThis.resolveReportJurisdiction = resolveReportJurisdiction;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isGlobalPolicyTag,
        resolveRegulatoryBodyId,
        buildRegulatoryBodyBadgeHtml,
        buildGlobalPolicyAuditTrailHtml,
        getRegulatoryBodyMeta,
        formatAuditDateTime,
        formatEffectiveDate,
        formatReportRiskAuditLine,
        resolveReportJurisdiction
    };
}
