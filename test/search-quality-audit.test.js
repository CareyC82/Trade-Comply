'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    DEFAULT_SAMPLES,
    formatAuditMarkdown,
    runQualityAudit,
    writeAuditReport
} = require('../scripts/audit-search-quality');

describe('search quality audit', () => {
    it('covers the core global route/product samples without hard failures', () => {
        const report = runQualityAudit();
        assert.equal(report.ok, true);
        assert.equal(report.summary.failed, 0);
        assert.ok(report.summary.samples >= 20);
        assert.equal(report.results.length, DEFAULT_SAMPLES.length);
    });

    it('keeps every audited sample on the selected country and focus', () => {
        const report = runQualityAudit();
        for (const result of report.results) {
            assert.deepEqual(result.issues.offRouteTags, [], result.id);
            assert.deepEqual(result.issues.focusMismatchTags, [], result.id);
            assert.deepEqual(result.issues.duplicateTagIds, [], result.id);
            assert.deepEqual(result.issues.productFamilyMismatchTags, [], result.id);
        }
    });

    it('keeps product-specific rules ahead of generic market baselines for pinned samples', () => {
        const report = runQualityAudit();
        const pinned = report.results.filter((result) => result.expectedTopRule);
        assert.ok(pinned.length >= 5);
        for (const result of pinned) {
            assert.equal(result.topRules[0]?.id, result.expectedTopRule, result.id);
        }
    });

    it('enforces explicit quality floors for priority samples', () => {
        const report = runQualityAudit();
        const gated = report.results.filter((result) => (
            result.expectedMinimums.rules
            || result.expectedMinimums.exactRules
            || result.expectedMinimums.cases
            || result.expectedMinimums.inferredSelections.length
        ));

        assert.ok(gated.length >= 10);
        for (const result of gated) {
            assert.deepEqual(result.issues.failures, [], result.id);
        }
    });

    it('can write readable markdown and json audit artifacts', () => {
        const report = runQualityAudit(DEFAULT_SAMPLES.slice(0, 2));
        const markdown = formatAuditMarkdown(report);
        assert.match(markdown, /TraceWize Search Quality Audit/);
        assert.match(markdown, /cn-us-tablet-import/);

        const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-search-audit-'));
        const written = writeAuditReport(report, outputDir);
        assert.equal(fs.existsSync(written.jsonPath), true);
        assert.equal(fs.existsSync(written.markdownPath), true);
        assert.match(fs.readFileSync(written.markdownPath, 'utf8'), /Sample Details/);
    });
});
