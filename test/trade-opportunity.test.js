'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildOpportunityInsights, detectProductSignal } = require('../lib/trade-opportunity');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const priorityMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'post-entry-rate-priority-matrix.json'), 'utf8'));

describe('trade opportunity insights', () => {
    it('detects green and supply-chain heavy product categories', () => {
        const battery = detectProductSignal('energy storage lithium battery system');
        const solar = detectProductSignal('solar panel photovoltaic module');

        assert.equal(battery.id, 'battery');
        assert.equal(solar.id, 'solar');
        assert.match(battery.green, /Battery/i);
        assert.match(solar.supplyChain, /origin/i);
    });

    it('builds route opportunity cards from local duty and market signals', () => {
        const model = buildOpportunityInsights({
            product: 'energy storage battery system',
            from: 'CN',
            to: 'US',
            focus: 'import',
            dutyRates,
            priorityMatrix
        });

        assert.equal(model.productSignal.id, 'battery');
        assert.equal(model.routeLabel, 'China -> United States');
        assert.ok(model.markets.length >= 4);
        assert.ok(model.best.score >= model.markets[model.markets.length - 1].score);
        assert.ok(model.insights.some((item) => item.type === 'Green compliance'));
        assert.ok(model.insights.some((item) => item.type === 'Supply-chain evidence'));
        assert.ok(model.routeComparison.length >= 6);
        assert.ok(model.routeComparison.every((row) => row.coverageLabel && row.parserNextAction));
        assert.ok(model.routeComparison.every((row) => row.businessAction && row.parserPriority));
        assert.ok(model.routeComparison.some((row) => row.sourceTrust !== 'not_covered'));
        assert.ok(model.readyRouteCount >= 1);
        assert.ok(model.parserBacklogCount >= 1);
        assert.ok(model.insights.some((item) => item.type === 'Commercial action'));
        assert.ok(model.insights.some((item) => item.type === 'Coverage backlog'));
    });

    it('connects route recommendations to source trust and parser priority', () => {
        const model = buildOpportunityInsights({
            product: 'solar panel photovoltaic module',
            from: 'CN',
            to: 'US',
            focus: 'import',
            dutyRates,
            priorityMatrix
        });
        const singapore = model.routeComparison.find((row) => row.market === 'SG');
        const eu = model.routeComparison.find((row) => row.market === 'EU');

        assert.ok(singapore, 'Singapore should be included in route comparison');
        assert.equal(singapore.sourceTrust, 'official_link_estimate');
        assert.equal(singapore.coverageLabel, 'Official link monitored');
        assert.equal(singapore.parserPriority, 'P2 parser backlog');
        assert.match(singapore.parserNextAction, /machine-readable tariff-line parser/i);
        assert.ok(eu, 'EU should be included in route comparison');
        assert.match(eu.coverageLabel, /Official duty|Hybrid official/i);
    });

    it('keeps Russia as a high-friction route even when included in comparisons', () => {
        const model = buildOpportunityInsights({
            product: 'AI GPU accelerator chip',
            from: 'US',
            to: 'RU',
            focus: 'export',
            dutyRates,
            priorityMatrix
        });
        const russia = model.markets.find((market) => market.market === 'RU') || model.selectedMarket;

        assert.equal(model.productSignal.id, 'semiconductor');
        assert.ok(russia.score < 50);
        assert.match(russia.watchpoint, /sanctions|Screen/i);
    });
});

describe('trade opportunity navigation', () => {
    it('exposes Opportunity in primary HTML nav surfaces', () => {
        ['index.html', 'hscode.html', 'post-entry.html', 'post-entry-result.html', 'electronics.html', 'new-energy.html', 'semiconductor.html'].forEach((file) => {
            const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            assert.match(html, /opportunity\.html/, `${file} should link to Opportunity`);
            assert.match(html, /nav-opportunity/, `${file} should expose nav-opportunity`);
        });
    });

    it('keeps Opportunity route fields blank by default and places export focus first', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'opportunity.html'), 'utf8');
        const exportIndex = html.indexOf('value="export"');
        const importIndex = html.indexOf('value="import"');

        assert.ok(exportIndex > 0, 'export focus should exist');
        assert.ok(importIndex > 0, 'import focus should exist');
        assert.ok(exportIndex < importIndex, 'export focus should appear before import focus');
        assert.doesNotMatch(html, /name="opportunity-focus" value="import" checked/);
        assert.doesNotMatch(html, /name="opportunity-focus" value="export" checked/);
        assert.doesNotMatch(html, /data-default-country/);
        assert.doesNotMatch(html, /<option value="CN" selected/);
        assert.doesNotMatch(html, /<option value="US" selected/);
    });
});
