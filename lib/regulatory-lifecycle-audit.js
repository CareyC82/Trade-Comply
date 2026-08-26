'use strict';
function isoDay(value) { const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/); return match ? match[0] : ''; }
function auditSourceLifecycle(id, source = {}) {
    const lifecycle = source.lifecycle || {}; const status = lifecycle.status || 'active';
    const publishedAt = isoDay(lifecycle.publishedAt); const effectiveAt = isoDay(lifecycle.effectiveAt);
    const transitionEndAt = isoDay(lifecycle.transitionEndAt); const sunsetAt = isoDay(lifecycle.sunsetAt || lifecycle.repealedAt);
    const issues = [];
    if (['future', 'published_pending_effective_date'].includes(status) && !publishedAt) issues.push('missing_published_at');
    if (status === 'future' && !effectiveAt) issues.push('missing_effective_at');
    if (status === 'published_pending_effective_date' && !lifecycle.transition) issues.push('missing_transition_basis');
    if (transitionEndAt && effectiveAt && transitionEndAt < effectiveAt) issues.push('transition_before_effective_date');
    if (sunsetAt && effectiveAt && sunsetAt < effectiveAt) issues.push('sunset_before_effective_date');
    if (sunsetAt && !lifecycle.replacedBy && !lifecycle.repealNote) issues.push('missing_repeal_or_replacement_note');
    return { id, status, published_at: publishedAt || null, effective_at: effectiveAt || null, transition_end_at: transitionEndAt || null, sunset_at: sunsetAt || null, replaced_by: lifecycle.replacedBy || null, issues, ok: issues.length === 0 };
}
function buildLifecycleAudit(sources = {}) {
    const rows = Object.entries(sources).map(([id, source]) => auditSourceLifecycle(id, source));
    return { schema_version: 1, source_count: rows.length, ok_count: rows.filter(row => row.ok).length, issue_count: rows.reduce((sum, row) => sum + row.issues.length, 0), rows };
}
module.exports = { isoDay, auditSourceLifecycle, buildLifecycleAudit };
