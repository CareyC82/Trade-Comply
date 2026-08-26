'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { auditSourceLifecycle, buildLifecycleAudit } = require('../lib/regulatory-lifecycle-audit');
const models = require('../lib/wearable-product-models');
test('lifecycle audit covers every maintained source and exposes unresolved dates', () => { const report = buildLifecycleAudit(models.sources); assert.equal(report.source_count, Object.keys(models.sources).length); assert.ok(report.rows.every(row => Array.isArray(row.issues))); });
test('lifecycle audit rejects impossible transition and undocumented repeal', () => { const row = auditSourceLifecycle('rule', { lifecycle: { status: 'active', effectiveAt: '2026-09-01', transitionEndAt: '2026-08-01', sunsetAt: '2026-07-01' } }); assert.ok(row.issues.includes('transition_before_effective_date')); assert.ok(row.issues.includes('sunset_before_effective_date')); assert.ok(row.issues.includes('missing_repeal_or_replacement_note')); });
