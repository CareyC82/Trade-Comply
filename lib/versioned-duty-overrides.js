'use strict';

function code(value) { return String(value || '').replace(/\D/g, ''); }
function isoDay(value) {
    const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
}
function previousDay(value) {
    const day = isoDay(value);
    const date = new Date(`${day}T00:00:00Z`);
    if (!day || Number.isNaN(date.getTime())) throw new Error('A valid effective date is required');
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}
function isOfficial(row = {}) { return /official/i.test(`${row.confidence || ''} ${row.source_status || ''}`); }
function sameRate(left = {}, right = {}) {
    return Number(left.base_rate) === Number(right.base_rate)
        && Number(left.sws_rate || 0) === Number(right.sws_rate || 0)
        && Number(left.igst_rate || 0) === Number(right.igst_rate || 0);
}

function mergeEffectiveOverrides(existing = [], incoming = [], effectiveAt) {
    const effectiveFrom = isoDay(effectiveAt);
    const closeAt = previousDay(effectiveFrom);
    const nextByCode = new Map(incoming.map((row) => [code(row.hs_code), { ...row, effective_from: effectiveFrom }]));
    const output = [];
    for (const row of existing) {
        const hs = code(row.hs_code);
        const start = isoDay(row.effective_from);
        const end = isoDay(row.effective_to);
        if (!isOfficial(row)) continue;
        if (end && end < effectiveFrom) { output.push(row); continue; }
        if (start && start >= effectiveFrom) continue;
        const replacement = nextByCode.get(hs);
        if (replacement && sameRate(row, replacement)) {
            nextByCode.set(hs, { ...replacement, effective_from: start || effectiveFrom });
            continue;
        }
        output.push({ ...row, effective_to: closeAt });
    }
    output.push(...nextByCode.values());
    return output.sort((left, right) => code(left.hs_code).localeCompare(code(right.hs_code))
        || isoDay(left.effective_from).localeCompare(isoDay(right.effective_from)));
}

function activeOn(row, date) {
    const day = isoDay(date);
    const start = isoDay(row?.effective_from);
    const end = isoDay(row?.effective_to);
    return Boolean(day) && (!start || start <= day) && (!end || end >= day);
}

module.exports = { isoDay, previousDay, mergeEffectiveOverrides, activeOn };
