'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { auditSample } = require('../scripts/audit-search-quality');
const { buildOpportunityInsights } = require('../lib/trade-opportunity');

const demoScenarios = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-scenarios.json'), 'utf8')).scenarios;
const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const priorityMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'post-entry-rate-priority-matrix.json'), 'utf8'));

const customerReviewScenarios = [
    {
        id: 'lead-us-cn-h200',
        from: 'US',
        to: 'CN',
        focus: 'import',
        product: 'H200 GPU AI accelerator',
        signal: 'GPU / AI accelerator',
        controlGated: true
    },
    {
        id: 'lead-kr-cn-hbm',
        from: 'KR',
        to: 'CN',
        focus: 'import',
        product: 'HBM3E high bandwidth memory',
        signal: 'HBM / high-bandwidth memory',
        controlGated: true
    },
    {
        id: 'lead-cn-us-lab-analyzer',
        from: 'CN',
        to: 'US',
        focus: 'import',
        product: 'laboratory analyzer electronic diagnostic device',
        signal: 'Healthcare / lab electronics',
        controlGated: false
    },
    {
        id: 'lead-cn-us-solar',
        from: 'CN',
        to: 'US',
        focus: 'import',
        product: 'solar panel photovoltaic',
        signal: 'Solar / PV',
        controlGated: false
    },
    {
        id: 'lead-cn-eu-battery',
        from: 'CN',
        to: 'EU',
        focus: 'import',
        product: 'energy storage battery system',
        signal: 'Battery / ESS',
        controlGated: false
    },
    {
        id: 'lead-cn-in-optical-module',
        from: 'CN',
        to: 'IN',
        focus: 'import',
        product: '800G optical transceiver module',
        signal: 'Optical module / high-speed interconnect',
        controlGated: true
    },
    {
        id: 'lead-de-us-robot',
        from: 'DE',
        to: 'US',
        focus: 'import',
        product: 'industrial robot arm',
        signal: 'Industrial automation / robotics',
        controlGated: true
    }
];

function expectedProductSignalId(scenario) {
    const product = String(scenario.product || '').toLowerCase();
    if (/gpu|accelerator|h200|b200/.test(product)) return 'semiconductor';
    if (/solar|photovoltaic/.test(product)) return 'solar';
    if (/battery|energy storage|ess/.test(product)) return 'battery';
    if (/robot|servo|plc|machine vision/.test(product)) return 'industrial_automation';
    if (/optical|transceiver/.test(product)) return 'optical_module';
    return '';
}

describe('customer demo journeys', () => {
    it('keeps published demo scenarios aligned across search and opportunity output', () => {
        assert.ok(demoScenarios.length >= 5);

        for (const scenario of demoScenarios) {
            const audited = auditSample({
                id: scenario.id,
                from: scenario.from,
                to: scenario.to,
                focus: scenario.focus,
                query: scenario.product
            });
            const opportunity = buildOpportunityInsights({
                product: scenario.product,
                from: scenario.from,
                to: scenario.to,
                focus: scenario.focus,
                dutyRates,
                priorityMatrix
            });

            assert.deepEqual(audited.issues.failures, [], `${scenario.id} search failures`);
            assert.equal(audited.counts.exactRules > 0, true, `${scenario.id} should have exact route rules`);
            assert.equal(opportunity.from, scenario.from, `${scenario.id} origin`);
            assert.equal(opportunity.to, scenario.to, `${scenario.id} destination`);
            assert.equal(opportunity.selectedMarket.market, scenario.to, `${scenario.id} selected destination`);
            assert.equal(opportunity.routeComparison.length, 3, `${scenario.id} direct route + two transit routes`);
            assert.equal(opportunity.transitRoutes.length, 2, `${scenario.id} two transit options only`);
            assert.ok(opportunity.rateCoverageSummary.summary, `${scenario.id} rate coverage summary`);
            assert.ok(opportunity.businessDecisionSummary.headline, `${scenario.id} business headline`);
            assert.ok(opportunity.routeRecommendation.headline, `${scenario.id} recommendation headline`);
            assert.equal(opportunity.productSignal.id, expectedProductSignalId(scenario), `${scenario.id} product signal`);
            assert.notEqual(opportunity.productSignal.label, 'General electronics', `${scenario.id} should not fall back to generic electronics`);
            assert.ok(opportunity.routeComparison.every(row => row.trustSummary?.summaryLine), `${scenario.id} trust summary`);
            assert.ok(opportunity.routeComparison.every(row => row.routeDecisionSummary), `${scenario.id} route decision summary`);
        }
    });

    it('keeps control-gated AI GPU demos from looking like generic cost-only opportunities', () => {
        const scenario = demoScenarios.find(row => row.id === 'demo-us-cn-ai-gpu-import');
        assert.ok(scenario);

        const opportunity = buildOpportunityInsights({
            product: scenario.product,
            from: scenario.from,
            to: scenario.to,
            focus: scenario.focus,
            dutyRates,
            priorityMatrix
        });

        assert.equal(opportunity.productSignal.label, 'GPU / AI accelerator');
        assert.ok(opportunity.selectedMarket.exportControlGate);
        assert.equal(opportunity.selectedMarket.exportControlGate.severity, 'Critical');
        assert.match(opportunity.selectedMarket.exportControlGate.summary, /AI GPUs|advanced ICs|export-control/i);
        assert.match(opportunity.summary, /control-gated|export-control|end-use/i);
        assert.match(opportunity.businessDecisionSummary.headline, /control|end-use|re-export/i);
        assert.ok(opportunity.routeComparison.every(row => /control|origin|re-export|end-use|tax|duty/i.test(row.routeDecisionSummary)));
    });

    it('keeps real high-tech customer review scenarios route-specific and non-generic', () => {
        for (const scenario of customerReviewScenarios) {
            const audited = auditSample({
                id: scenario.id,
                from: scenario.from,
                to: scenario.to,
                focus: scenario.focus,
                query: scenario.product
            });
            const opportunity = buildOpportunityInsights({
                product: scenario.product,
                from: scenario.from,
                to: scenario.to,
                focus: scenario.focus,
                dutyRates,
                priorityMatrix
            });

            assert.deepEqual(audited.issues.failures, [], `${scenario.id} should not have search failures`);
            assert.equal(audited.counts.exactRules > 0, true, `${scenario.id} should have exact route rules`);
            assert.equal(opportunity.selectedMarket.market, scenario.to, `${scenario.id} selected destination`);
            assert.equal(opportunity.productSignal.label, scenario.signal, `${scenario.id} product signal`);
            assert.notEqual(opportunity.productSignal.label, 'General electronics', `${scenario.id} must not be generic`);
            assert.equal(Boolean(opportunity.selectedMarket.exportControlGate), scenario.controlGated, `${scenario.id} control gate`);
            assert.equal(opportunity.routeComparison.length, 3, `${scenario.id} direct route + two transit routes`);
            assert.equal(opportunity.transitRoutes.length, 2, `${scenario.id} two transit options only`);
            assert.ok(opportunity.routeComparison.every(row => String(row.routeDecisionSummary || '').length > 12), `${scenario.id} route decision wording`);
        }
    });
});
