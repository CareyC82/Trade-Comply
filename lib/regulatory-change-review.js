'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('./can-i-sell-it');
const models = require('./wearable-product-models');
const { analyzeRegulatoryChange } = require('./regulatory-change-analysis');

const VALID_ACTIONS = new Set(['approve_evidence', 'record_rule_tests', 'publish_rule_release', 'ignore', 'reopen']);

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
    const conclusionStates = new Set();
    const questionIds = new Set();
    models.listProducts().filter((product) => product.id !== 'wearable_other').forEach((product) => {
        markets.forEach((market) => {
            const profile = { productType: product.id, ...(product.defaults || {}) };
            const matching = engine.marketRequirements(market, profile).filter((requirement) => requirement.sources.some((source) => source.id === sourceId));
            if (!matching.length) return;
            affectedMarkets.add(market);
            matching.forEach((requirement) => requirementIds.add(requirement.id));
            (product.priorityQuestions || []).forEach((question) => questionIds.add(question));
            const assessment = engine.assess({
                description: product.label, market, platform: 'Amazon',
                attributes: profile, assessmentMode: 'quick', blockingQuestionKeys: []
            });
            conclusionStates.add(assessment.sellerConclusion.code);
            products.push({
                id: product.id, label: product.label, market,
                candidate_hs: [...(product.candidateHs || [])],
                route: `Any maintained origin -> ${market}`,
                requirement_ids: matching.map((item) => item.id),
                current_conclusion: assessment.sellerConclusion.code,
                current_conclusion_label: assessment.sellerConclusion.label
            });
        });
    });
    const lifecycle = models.sources?.[sourceId]?.lifecycle || {};
    const effectiveDate = String(lifecycle.effectiveAt || '').slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const daysUntilEffective = effectiveDate
        ? Math.ceil((new Date(`${effectiveDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000)
        : null;
    return {
        markets: [...affectedMarkets], products,
        candidate_hs: [...new Set(products.flatMap((item) => item.candidate_hs || []))],
        affected_routes: [...new Set(products.map((item) => item.route))],
        requirement_ids: [...requirementIds],
        question_ids: [...questionIds],
        current_conclusion_states: [...conclusionStates],
        lifecycle_status: lifecycle.status || 'not_specified',
        effective_date: effectiveDate || null,
        days_until_effective: Number.isFinite(daysUntilEffective) ? daysUntilEffective : null,
        effective_timing: !effectiveDate ? 'Effective date requires official confirmation'
            : daysUntilEffective > 0 ? `${daysUntilEffective} day(s) until effective`
                : daysUntilEffective === 0 ? 'Effective today' : `Effective for ${Math.abs(daysUntilEffective)} day(s)`,
        conclusion_delta: {
            status: 'unchanged_pending_rule_review',
            before: [...conclusionStates],
            after: [...conclusionStates],
            explanation: 'Evidence capture alone does not change user conclusions. A separate reviewed rule update and regression run is required.'
        },
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
    return { ...payload, changes: (payload.changes || []).map((change) => {
        const impact = buildImpact(change.id);
        return { ...change, impact, change_analysis: analyzeRegulatoryChange(change, impact), rule_proposal: buildRuleProposal(change.id) };
    }) };
}

function reviewChange({ changesFile, auditFile, id, type, action, note = '', testEvidence = null, releaseCommit = '', now = new Date().toISOString() }) {
    if (!VALID_ACTIONS.has(action)) throw new Error('Unsupported review action');
    const payload = JSON.parse(fs.readFileSync(changesFile, 'utf8'));
    const index = (payload.changes || []).findIndex((change) => change.id === id && change.type === type);
    if (index < 0) throw new Error('Regulatory change not found');
    const previous = payload.changes[index];
    if (action === 'record_rule_tests' && previous.review_status !== 'evidence_approved') throw new Error('Evidence must be approved before rule tests are recorded');
    if (action === 'publish_rule_release' && previous.review_status !== 'rule_tests_passed') throw new Error('Rule tests must pass before a release can be recorded');
    if (action === 'record_rule_tests') {
        const commands = Array.isArray(testEvidence?.commands) ? testEvidence.commands.filter(Boolean).slice(0, 20) : [];
        if (testEvidence?.passed !== true || !commands.length || !/^[a-f0-9]{64}$/i.test(String(testEvidence?.result_digest || ''))) {
            throw new Error('Passing test evidence, commands and a SHA-256 result digest are required');
        }
    }
    if (action === 'publish_rule_release' && !/^[a-f0-9]{7,40}$/i.test(String(releaseCommit || ''))) throw new Error('A reviewed Git commit is required to record publication');
    const nextStatus = action === 'approve_evidence' ? 'evidence_approved'
        : action === 'record_rule_tests' ? 'rule_tests_passed'
            : action === 'publish_rule_release' ? 'rule_published'
                : action === 'ignore' ? 'ignored' : 'pending_review';
    payload.changes[index] = { ...previous, review_status: nextStatus, reviewed_at: now, reviewed_by: 'local_admin', review_note: String(note || '').slice(0, 500), auto_apply: false,
        ...(action === 'approve_evidence' ? { rule_proposal: buildRuleProposal(id) } : {}),
        ...(action === 'record_rule_tests' ? { test_evidence: { passed: true, commands: testEvidence.commands.slice(0, 20), result_digest: testEvidence.result_digest.toLowerCase(), recorded_at: now } } : {}),
        ...(action === 'publish_rule_release' ? { release: { commit: String(releaseCommit).toLowerCase(), published_at: now, evidence_only_auto_publish: false } } : {}) };
    payload.pending_review_count = payload.changes.filter((change) => change.review_status === 'pending_review').length;
    payload.updated_at = now;
    const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : { schema_version: 1, events: [] };
    audit.events.push({ id, type, action, previous_status: previous.review_status, current_status: nextStatus, reviewed_at: now, reviewed_by: 'local_admin', note: String(note || '').slice(0, 500), impact: buildImpact(id),
        ...(action === 'approve_evidence' ? { rule_proposal: buildRuleProposal(id) } : {}),
        ...(action === 'record_rule_tests' ? { test_evidence: payload.changes[index].test_evidence } : {}),
        ...(action === 'publish_rule_release' ? { release: payload.changes[index].release } : {}) });
    audit.updated_at = now;
    writeJsonAtomic(changesFile, payload);
    writeJsonAtomic(auditFile, audit);
    return { change: payload.changes[index], audit_event: audit.events.at(-1), payload };
}

module.exports = { VALID_ACTIONS, buildImpact, buildRuleProposal, enrichChanges, reviewChange, writeJsonAtomic };
