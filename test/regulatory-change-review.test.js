'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildImpact, buildRuleProposal, reviewChange } = require('../lib/regulatory-change-review');

test('regulatory source impact preview identifies affected products without auto-publishing', () => {
    const impact = buildImpact('sgControlledGoods');
    assert.ok(impact.markets.includes('SG'));
    assert.ok(impact.products.some((item) => item.id === 'portable_fan'));
    assert.ok(impact.requirement_ids.includes('sg_safety'));
    assert.ok(impact.question_ids.length > 0);
    assert.ok(impact.current_conclusion_states.length > 0);
    assert.ok(impact.products.every((item) => item.current_conclusion && item.current_conclusion_label));
    assert.equal(impact.auto_publish, false);
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
