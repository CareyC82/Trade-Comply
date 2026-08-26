'use strict';
const { buildSnapshot } = require('./regulatory-source-monitor');
const engine = require('./can-i-sell-it');

function conclusionSignature(input) {
    const result = engine.assess(input);
    return JSON.stringify({ conclusion: result.sellerConclusion.code, requirements: result.requirements.map(item => item.id).sort(), market: result.market });
}

function runFailureDrill({ sourceId = 'source', source, previous, assessmentInput, now = '2026-08-26T00:00:00Z' }) {
    const before = conclusionSignature(assessmentInput);
    const failures = [
        { id: 'network_timeout', fetched: { ok: false, error: 'timeout' } },
        { id: 'empty_page', fetched: { ok: true, content: '' } },
        { id: 'login_page', fetched: { ok: false, error: 'official_content_identity_mismatch' } },
        { id: 'short_page', fetched: { ok: false, error: 'official_content_too_short' } },
        { id: 'http_error', fetched: { ok: false, error: 'http_503' } }
    ];
    const rows = failures.map(failure => {
        const result = buildSnapshot({ sources: { [sourceId]: source }, previous, fetched: { [sourceId]: failure.fetched }, now });
        const snapshot = result.snapshot.sources[0];
        const after = conclusionSignature(assessmentInput);
        return { id: failure.id, preserved_last_good: snapshot.preserved_last_good === true, status: snapshot.status, conclusion_unchanged: before === after };
    });
    return { ok: rows.every(row => row.preserved_last_good && row.conclusion_unchanged && ['last_good_degraded', 'manual_review_current'].includes(row.status)), rows };
}

module.exports = { conclusionSignature, runFailureDrill };
