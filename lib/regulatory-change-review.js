'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('./can-i-sell-it');
const models = require('./wearable-product-models');

const VALID_ACTIONS = new Set(['approve_evidence', 'ignore', 'reopen']);

function writeJsonAtomic(file, value) {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temp, file);
}

function buildImpact(sourceId) {
    const markets = ['US', 'EU', 'JP', 'SG'];
    const products = [];
    const requirementIds = new Set();
    const affectedMarkets = new Set();
    models.listProducts().filter((product) => product.id !== 'wearable_other').forEach((product) => {
        markets.forEach((market) => {
            const profile = { productType: product.id, ...(product.defaults || {}) };
            const matching = engine.marketRequirements(market, profile).filter((requirement) => requirement.sources.some((source) => source.id === sourceId));
            if (!matching.length) return;
            affectedMarkets.add(market);
            matching.forEach((requirement) => requirementIds.add(requirement.id));
            products.push({ id: product.id, label: product.label, market, requirement_ids: matching.map((item) => item.id) });
        });
    });
    return {
        markets: [...affectedMarkets], products,
        requirement_ids: [...requirementIds],
        conclusion_preview: products.length
            ? 'Official evidence changed. Existing user conclusions remain unchanged until a separate rule-code update is reviewed, tested and committed.'
            : 'No current product requirement references this source. Review metadata and coverage before any rule change.',
        auto_publish: false
    };
}

function buildRuleProposal(sourceId) {
    const impact = buildImpact(sourceId);
    const files = impact.products.length
        ? ['lib/wearable-product-models.js', 'lib/can-i-sell-it.js', 'test/can-i-sell-it.test.js', 'test/consumer-market-journeys.test.js']
        : ['lib/wearable-product-models.js', 'test/regulatory-change-review.test.js'];
    return {
        status: 'draft_only',
        source_id: sourceId,
        auto_apply: false,
        proposed_files: files,
        affected_markets: impact.markets,
        affected_products: impact.products.map((item) => item.id).filter((id, index, rows) => rows.indexOf(id) === index),
        affected_requirement_ids: impact.requirement_ids,
        review_checklist: [
            'Verify the official text, exact scope, effective date and any transition or repeal provision.',
            'Update source review metadata and only the requirement conditions supported by that evidence.',
            'Add market-isolation, product-attribute and unsupported-product regression tests.',
            'Run targeted tests, the full test suite and the consumer release-readiness gate.',
            'Require a separate human-reviewed code commit; evidence approval must never publish a rule automatically.'
        ]
    };
}

function enrichChanges(payload) {
    return { ...payload, changes: (payload.changes || []).map((change) => ({ ...change, impact: buildImpact(change.id), rule_proposal: buildRuleProposal(change.id) })) };
}

function reviewChange({ changesFile, auditFile, id, type, action, note = '', now = new Date().toISOString() }) {
    if (!VALID_ACTIONS.has(action)) throw new Error('Unsupported review action');
    const payload = JSON.parse(fs.readFileSync(changesFile, 'utf8'));
    const index = (payload.changes || []).findIndex((change) => change.id === id && change.type === type);
    if (index < 0) throw new Error('Regulatory change not found');
    const previous = payload.changes[index];
    const nextStatus = action === 'approve_evidence' ? 'evidence_approved' : action === 'ignore' ? 'ignored' : 'pending_review';
    payload.changes[index] = { ...previous, review_status: nextStatus, reviewed_at: now, reviewed_by: 'local_admin', review_note: String(note || '').slice(0, 500), auto_apply: false,
        ...(action === 'approve_evidence' ? { rule_proposal: buildRuleProposal(id) } : {}) };
    payload.pending_review_count = payload.changes.filter((change) => change.review_status === 'pending_review').length;
    payload.updated_at = now;
    const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : { schema_version: 1, events: [] };
    audit.events.push({ id, type, action, previous_status: previous.review_status, current_status: nextStatus, reviewed_at: now, reviewed_by: 'local_admin', note: String(note || '').slice(0, 500), impact: buildImpact(id),
        ...(action === 'approve_evidence' ? { rule_proposal: buildRuleProposal(id) } : {}) });
    audit.updated_at = now;
    writeJsonAtomic(changesFile, payload);
    writeJsonAtomic(auditFile, audit);
    return { change: payload.changes[index], audit_event: audit.events.at(-1), payload };
}

module.exports = { VALID_ACTIONS, buildImpact, buildRuleProposal, enrichChanges, reviewChange, writeJsonAtomic };
