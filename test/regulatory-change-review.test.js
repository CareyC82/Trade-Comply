'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildImpact, buildRuleProposal, enrichChanges, reviewChange } = require('../lib/regulatory-change-review');

test('regulatory source impact preview identifies affected products without auto-publishing', () => {
    const impact = buildImpact('sgControlledGoods');
    assert.ok(impact.markets.includes('SG'));
    assert.ok(impact.products.some((item) => item.id === 'portable_fan'));
    assert.ok(impact.requirement_ids.includes('sg_safety'));
    assert.ok(impact.question_ids.length > 0);
    assert.ok(impact.conclusion_delta);
    assert.equal(impact.conclusion_delta.status, 'unchanged_pending_rule_review');
    assert.ok(impact.effective_timing);
    assert.ok(impact.current_conclusion_states.length > 0);
    assert.ok(impact.products.every((item) => item.current_conclusion && item.current_conclusion_label));
    assert.ok(impact.products.every((item) => Array.isArray(item.candidate_hs) && item.route));
    assert.ok(impact.candidate_hs.length > 0);
    assert.ok(impact.affected_routes.includes('Any maintained origin -> SG'));
    assert.equal(impact.auto_publish, false);
});

test('regulatory change analysis classifies affected rule fields but never auto-applies', () => {
    const result = enrichChanges({ changes: [{ id: 'fccEquipment', current_summary: 'FCC ID label and marketplace listing evidence changed' }] }).changes[0];
    assert.ok(result.change_analysis.categories.includes('labeling'));
    assert.ok(result.change_analysis.categories.includes('platform_listing'));
    assert.equal(result.change_analysis.automatic_rule_change, false);
});

test('rule proposals are draft-only, scoped and require a separate tested code review', () => {
    const proposal = buildRuleProposal('sgControlledGoods');
    assert.equal(proposal.status, 'draft_only');
    assert.equal(proposal.auto_apply, false);
    assert.ok(proposal.affected_markets.includes('SG'));
    assert.ok(proposal.affected_products.includes('portable_fan'));
    assert.ok(proposal.proposed_files.includes('lib/can-i-sell-it.js'));
    assert.match(proposal.review_checklist.at(-1), /never publish a rule automatically/i);
});

test('approve, ignore and reopen actions remain evidence-only and append rollback history', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-review-'));
    const changesFile = path.join(directory, 'changes.json');
    const auditFile = path.join(directory, 'audit.json');
    fs.writeFileSync(changesFile, JSON.stringify({ schema_version: 1, pending_review_count: 1, changes: [{ id: 'sgControlledGoods', type: 'content_changed', review_status: 'pending_review', auto_apply: false }] }));
    const approved = reviewChange({ changesFile, auditFile, id: 'sgControlledGoods', type: 'content_changed', action: 'approve_evidence', note: 'Official page update reviewed.', now: '2026-08-21T00:00:00Z' });
    assert.equal(approved.change.review_status, 'evidence_approved');
    assert.equal(approved.change.auto_apply, false);
    assert.equal(approved.change.rule_proposal.status, 'draft_only');
    assert.equal(approved.audit_event.rule_proposal.auto_apply, false);
    const reopened = reviewChange({ changesFile, auditFile, id: 'sgControlledGoods', type: 'content_changed', action: 'reopen', now: '2026-08-22T00:00:00Z' });
    assert.equal(reopened.change.review_status, 'pending_review');
    const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
    assert.equal(audit.events.length, 2);
    assert.equal(audit.events[1].previous_status, 'evidence_approved');
});

test('rule publication requires approved evidence, passing test digest and reviewed commit', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-release-'));
    const changesFile = path.join(directory, 'changes.json');
    const auditFile = path.join(directory, 'audit.json');
    fs.writeFileSync(changesFile, JSON.stringify({ schema_version: 1, pending_review_count: 1, changes: [{ id: 'jpRadio', type: 'content_changed', review_status: 'pending_review', auto_apply: false }] }));
    assert.throws(() => reviewChange({ changesFile, auditFile, id: 'jpRadio', type: 'content_changed', action: 'record_rule_tests', testEvidence: { passed: true, commands: ['npm test'], result_digest: 'a'.repeat(64) } }), /approved/);
    reviewChange({ changesFile, auditFile, id: 'jpRadio', type: 'content_changed', action: 'approve_evidence' });
    const tested = reviewChange({ changesFile, auditFile, id: 'jpRadio', type: 'content_changed', action: 'record_rule_tests', testEvidence: { passed: true, commands: ['node --test test/jp-sg-regulatory-depth.test.js', 'npm test'], result_digest: 'a'.repeat(64) } });
    assert.equal(tested.change.review_status, 'rule_tests_passed');
    assert.throws(() => reviewChange({ changesFile, auditFile, id: 'jpRadio', type: 'content_changed', action: 'publish_rule_release', releaseCommit: 'bad' }), /commit/);
    const published = reviewChange({ changesFile, auditFile, id: 'jpRadio', type: 'content_changed', action: 'publish_rule_release', releaseCommit: 'abcdef1234567' });
    assert.equal(published.change.review_status, 'rule_published');
    assert.equal(published.change.auto_apply, false);
    assert.equal(JSON.parse(fs.readFileSync(auditFile)).events.length, 3);
});
