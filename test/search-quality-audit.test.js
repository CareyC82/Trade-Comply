'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    DEFAULT_SAMPLES,
    auditSample,
    duplicateSemanticTagKeys,
    formatAuditMarkdown,
    runQualityAudit,
    writeAuditReport
} = require('../scripts/audit-search-quality');

describe('search quality audit', () => {
    it('covers the core global route/product samples without hard failures', () => {
        const report = runQualityAudit();
        assert.equal(report.ok, true);
        assert.equal(report.summary.failed, 0);
        assert.ok(report.summary.samples >= 45);
        assert.equal(report.results.length, DEFAULT_SAMPLES.length);
    });

    it('keeps every audited sample on the selected country and focus', () => {
        const report = runQualityAudit();
        for (const result of report.results) {
            assert.deepEqual(result.issues.offRouteTags, [], result.id);
            assert.deepEqual(result.issues.focusMismatchTags, [], result.id);
            assert.deepEqual(result.issues.duplicateTagIds, [], result.id);
            assert.deepEqual(result.issues.duplicatePolicySignals, [], result.id);
            assert.deepEqual(result.issues.productFamilyMismatchTags, [], result.id);
        }
    });

    it('detects duplicate policy signals even when tag ids differ', () => {
        const duplicatePolicySignals = duplicateSemanticTagKeys([
            {
                tag_id: 'TWZ-US-ONE',
                country: 'US',
                route_focus: 'import',
                category_label: 'Import Regulation',
                source_url: 'https://example.com/rule',
                short_description: 'Same policy signal for duplicate card detection.'
            },
            {
                tag_id: 'TWZ-US-TWO',
                country: 'US',
                route_focus: 'import',
                category_label: 'Import Regulation',
                source_url: 'https://example.com/rule',
                short_description: 'Same policy signal for duplicate card detection.'
            }
        ]);

        assert.deepEqual(duplicatePolicySignals, [
            {
                key: 'US|both|import|import regulation|example.com/rule|same policy signal duplicate card detection',
                first: 'TWZ-US-ONE',
                duplicate: 'TWZ-US-TWO'
            }
        ]);
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

    it('keeps high-risk product intent pinned for live customer examples', () => {
        const samples = [
            {
                id: 'h200-china-import',
                from: 'US',
                to: 'CN',
                focus: 'import',
                vertical: 'semiconductor',
                query: 'H200 GPU AI accelerator',
                topRule: 'CL-CHIP-005',
                inferred: ['ai_chip', 'semiconductor']
            },
            {
                id: 'lab-analyzer-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'healthcare-lab',
                query: 'laboratory analyzer electronic diagnostic device',
                topRule: 'CL-USMED-001'
            },
            {
                id: 'dram-china-import',
                from: 'KR',
                to: 'CN',
                focus: 'import',
                vertical: 'semiconductor',
                query: 'DRAM DDR5 memory chip import China',
                topRule: 'CL-CNMEMIMP-001',
                inferred: ['semiconductor']
            },
            {
                id: 'nand-taiwan-export',
                from: 'TW',
                to: 'US',
                focus: 'export',
                vertical: 'semiconductor',
                query: 'NAND flash memory IC 3D NAND storage controller',
                topRule: 'CL-TWMEMEXP-001',
                inferred: ['semiconductor']
            },
            {
                id: 'solar-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'new-energy',
                query: 'solar panel photovoltaic',
                topRule: 'CL-USSOLARUFLPA-001'
            },
            {
                id: 'industrial-robot-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'industrial-automation',
                query: 'industrial robot arm plc servo drive machine vision',
                topRule: 'CL-USROBOT-001'
            },
            {
                id: 'ev-charger-germany-import',
                from: 'US',
                to: 'DE',
                focus: 'import',
                vertical: 'new-energy',
                query: 'ev charger wallbox charging station',
                topRule: 'CL-DEEV-001',
                inferred: ['battery']
            },
            {
                id: 'optical-module-eu-import',
                from: 'US',
                to: 'EU',
                focus: 'import',
                vertical: 'electronics',
                query: 'optical transceiver laser telecom module',
                topRule: 'CL-EUOPTICAL-001'
            },
            {
                id: 'ai-server-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'data-center',
                query: 'ai server gpu server data center rack power liquid cooling',
                topRule: 'CL-USDC-001',
                inferred: ['ai_chip', 'semiconductor']
            },
            {
                id: 'power-adapter-japan-import',
                from: 'US',
                to: 'JP',
                focus: 'import',
                vertical: 'electronics',
                query: 'power adapter charger pse',
                topRule: 'CL-JP-004',
                inferred: ['battery']
            },
            {
                id: 'surveillance-camera-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'electronics',
                query: 'surveillance camera ip camera network video recorder',
                topRule: 'CL-USMARKET-002',
                inferred: ['destination_end_use']
            },
            {
                id: 'medical-wearable-us-import',
                from: 'CN',
                to: 'US',
                focus: 'import',
                vertical: 'healthcare-lab',
                query: 'medical wearable health monitor bluetooth sensor',
                topRule: 'CL-USMED-001',
                inferred: ['wireless']
            }
        ];

        samples.forEach((sample) => {
            const result = auditSample(sample);
            assert.deepEqual(result.issues.failures, [], result.id);
            assert.equal(result.topRules[0]?.id, sample.topRule, result.id);
            assert.equal(result.route.focus, sample.focus, result.id);
            (sample.inferred || []).forEach((selection) => {
                assert.ok(result.inferredSelections.includes(selection), `${result.id} should infer ${selection}`);
            });
        });
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
