'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    buildOpportunityInsights,
    detectProductSignal
} = require('../lib/trade-opportunity');
const {
    enrichClassification
} = require('../lib/hscode-dual');
const {
    calculatePostEntryValue,
    calculateDutyImpact,
    classifyRateSourceTrust
} = require('../lib/post-entry-value');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const priorityMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'post-entry-rate-priority-matrix.json'), 'utf8'));
const highRiskSet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'high-risk-product-test-set.json'), 'utf8'));

describe('high-risk product journeys', () => {
    for (const sample of highRiskSet.products) {
        it(`keeps ${sample.id} classified, sourced, and route-aware`, () => {
            const signal = detectProductSignal(sample.product);
            assert.equal(signal.id, sample.expected_signal);
            if (sample.expected_label) {
                assert.equal(signal.label, sample.expected_label);
            }

            const model = buildOpportunityInsights({
                product: sample.product,
                from: sample.from,
                to: sample.to,
                dutyRates,
                priorityMatrix
            });
            const selected = model.selectedMarket;
            const maintainedRoute = (priorityMatrix.routes || []).find((route) => (
                route.id === sample.id
                || (
                    route.origin_country === sample.from
                    && route.import_country === sample.to
                    && String(sample.hs_code).startsWith(String(route.hs_code).slice(0, 6))
                )
            ));

            assert.equal(model.productSignal.id, sample.expected_signal);
            assert.equal(selected.market, sample.to);
            assert.ok(maintainedRoute, `${sample.id} should be present in the rate-priority matrix`);
            assert.ok(Array.isArray(selected.sourceEvidence));
            assert.ok(selected.sourceEvidence.some((item) => item.label === 'Data source'));
            assert.ok(selected.sourceEvidence.some((item) => item.label === 'Tariff basis'));
            assert.ok(selected.sourceEvidence.some((item) => item.label === 'Control gate'));
            assert.ok(selected.routeDecisionSummary);
            assert.ok(Array.isArray(selected.rejectionReasons) && selected.rejectionReasons.length >= 1);
            assert.ok(model.routeComparison.every((row) => Array.isArray(row.sourceEvidence) && row.sourceEvidence.length >= 4));

            if (sample.expected_export_control_severity) {
                assert.ok(selected.exportControlGate, `${sample.id} should expose an export-control gate`);
                assert.equal(selected.exportControlGate.severity, sample.expected_export_control_severity);
                const gateText = [
                    selected.exportControlGate.label,
                    selected.exportControlGate.summary,
                    ...(selected.exportControlGate.checks || [])
                ].join(' ');
                for (const term of sample.expected_control_terms || []) {
                    assert.match(gateText, new RegExp(term, 'i'));
                }
                assert.ok(selected.sourceEvidence.some((item) => item.label === 'Control gate' && item.detail.includes(sample.expected_export_control_severity)));
            }

            const hs = enrichClassification(
                {
                    hscode: sample.hs_code,
                    official_name: sample.product,
                    confidence: '92%',
                    reasoning: 'Test classification used for high-risk journey coverage.'
                },
                {
                    direction: 'export',
                    fromCountry: sample.from,
                    toCountry: sample.to,
                    counterpartyCountry: sample.to,
                    focus: 'import'
                }
            );
            assert.equal(hs.origin_country, sample.from);
            assert.equal(hs.destination_country, sample.expected_hs_destination);
            assert.ok(hs.destination_import_code);
            assert.match(hs.counterparty_code_label, /Import/);
            assert.match(hs.cross_border_note, /harmonized/i);

            const value = calculatePostEntryValue({
                incoterm: 'FOB',
                declaredAmount: 1000,
                freight: 100,
                insurance: 20,
                otherCharges: 0
            });
            const duty = calculateDutyImpact(value, {
                importCountryCode: sample.expected_post_entry_route.import_country,
                originCountryCode: sample.expected_post_entry_route.origin_country,
                hsCode: sample.hs_code,
                entryDate: '2026-06-22'
            }, {
                declaredDuty: 0
            });
            const trust = classifyRateSourceTrust(duty.sourceBreakdown);

            assert.ok(Array.isArray(duty.sourceBreakdown));
            assert.ok(duty.sourceBreakdown.length >= 1);
            assert.equal(duty.sourceBreakdown.some((item) => item.status !== 'not_covered'), true, `${sample.id} should have maintained duty source coverage`);
            assert.ok(trust.level);
            assert.notEqual(trust.label, '');
        });
    }
});
