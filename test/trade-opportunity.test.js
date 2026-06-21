'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildOpportunityInsights, buildOpportunityPriorityList, detectProductSignal } = require('../lib/trade-opportunity');

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
        assert.ok(model.routeComparison.every((row) => row.dutyBreakdown && row.dutyBreakdown.items.length === 4));
        assert.ok(model.routeComparison.every((row) => Array.isArray(row.recommendationReasons) && row.recommendationReasons.length >= 2));
        assert.ok(model.routeComparison.every((row) => row.recommendationReasons.length <= 3));
        assert.ok(model.routeComparison.every((row) => row.conciseConclusion));
        assert.ok(model.routeComparison.every((row) => row.tradeOpportunityThesis && row.valueLever && row.executionGate));
        assert.ok(model.routeComparison.every((row) => row.commercialDecision && row.marginSignal && row.quoteGate));
        assert.ok(model.routeComparison.every((row) => row.quoteReadiness && row.landedCostRisk));
        assert.ok(model.routeComparison.every((row) => row.marketRole && row.opportunityType && row.routeStrategy));
        assert.ok(model.routeComparison.every((row) => row.demandStrength && row.complianceFriction && row.routeFeasibility));
        assert.ok(model.routeComparison.every((row) => row.greenSupplyChainAdvantage && Array.isArray(row.opportunityTags)));
        assert.ok(model.routeComparison.every((row) => row.strategicNote && row.riskNote));
        assert.ok(model.routeComparison.every((row) => row.commercialDecision.length < 180));
        assert.ok(model.routeComparison.every((row) => row.opportunitySignal?.oneLine && row.opportunitySignal?.action));
        assert.ok(model.routeComparison.every((row) => row.opportunitySignal?.shortAction));
        assert.ok(model.routeComparison.every((row) => Array.isArray(row.opportunityEvidence) && row.opportunityEvidence.length === 3));
        assert.ok(model.routeComparison.every((row) => row.opportunityEvidence.some((item) => item.label === 'Demand driver')));
        assert.ok(model.routeComparison.every((row) => row.opportunityEvidence.some((item) => item.label === 'Compliance friction')));
        assert.ok(model.routeComparison.some((row) => row.sourceTrust !== 'not_covered'));
        assert.ok(model.readyRouteCount >= 1);
        assert.ok(model.parserBacklogCount >= 0);
        assert.ok(Array.isArray(model.parserTargets));
        assert.ok(model.parserTargets.every((target) => target.priority && target.nextAction && target.hsCode));
        assert.ok(model.insights.some((item) => item.type === 'Commercial action'));
        assert.ok(model.insights.some((item) => item.type === 'Trade opportunity'));
        assert.ok(model.insights.some((item) => item.type === 'Coverage backlog'));
        assert.ok(model.insights.find((item) => item.type === 'Best route').text.length < 180);
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
        const mexico = model.routeComparison.find((row) => row.market === 'MX');
        const eu = model.routeComparison.find((row) => row.market === 'EU');

        assert.ok(singapore, 'Singapore should be included in route comparison');
        assert.equal(singapore.sourceTrust, 'official_duty_tax_estimate');
        assert.equal(singapore.coverageLabel, 'Official duty + tax estimate');
        assert.equal(singapore.parserPriority, 'P1 tax-layer refresh');
        assert.equal(singapore.parserPriorityRank, 1);
        assert.match(singapore.parserNextAction, /tax layer/i);
        assert.ok(singapore.recommendationReasons.some((reason) => /Execution confidence/i.test(reason.label)));
        assert.ok(singapore.recommendationReasons.some((reason) => /market demand/i.test(reason.label)));
        assert.ok(mexico, 'Mexico should be included in route comparison after exact candidate upgrade');
        assert.equal(mexico.sourceTrust, 'official_duty_tax_estimate');
        assert.equal(mexico.coverageLabel, 'Official duty + tax estimate');
        assert.match(mexico.watchpoint, /NOM|VAT|origin/i);
        assert.ok(eu, 'EU should be included in route comparison');
        assert.match(eu.coverageLabel, /Official duty|Hybrid official/i);
        assert.equal(eu.dutyBreakdown.baseDuty, '0.0%');
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

    it('does not over-recommend Singapore for every product opportunity', () => {
        const samples = [
            ['industrial robot arm', 'CN', 'US', 'import'],
            ['AI server GPU server', 'CN', 'US', 'import'],
            ['patient monitor medical electronics', 'US', 'JP', 'import'],
            ['solar panel photovoltaic', 'CN', 'IN', 'import']
        ];
        const winners = samples.map(([product, from, to, focus]) => buildOpportunityInsights({
            product,
            from,
            to,
            focus,
            dutyRates,
            priorityMatrix
        }).best.market);

        assert.ok(new Set(winners).size > 1);
        assert.equal(winners.every((market) => market === 'SG'), false);
        assert.equal(winners[0], 'US');
    });

    it('keeps high-frequency opportunity ranking aligned with business intuition', () => {
        const samples = [
            {
                product: 'AI GPU accelerator chip',
                from: 'US',
                to: 'IN',
                expectedSelected: {
                    market: 'IN',
                    demand: /Very high|High/,
                    friction: /High|Very high/,
                    note: /BIS|QCO|approval|controlled/i
                }
            },
            {
                product: 'solar panel photovoltaic module',
                from: 'CN',
                to: 'EU',
                expectedSelected: {
                    market: 'EU',
                    green: /High/,
                    tags: /energy transition|origin traceability|green/i
                }
            },
            {
                product: 'energy storage battery system',
                from: 'CN',
                to: 'MY',
                expectedSelected: {
                    market: 'MY',
                    role: /Manufacturing|supply-chain/i,
                    tags: /electronics cluster|battery|ASEAN/i
                }
            }
        ];

        samples.forEach((sample) => {
            const model = buildOpportunityInsights({
                product: sample.product,
                from: sample.from,
                to: sample.to,
                focus: 'import',
                dutyRates,
                priorityMatrix
            });
            const selected = model.selectedMarket;

            assert.equal(selected.market, sample.expectedSelected.market);
            if (sample.expectedSelected.demand) {
                assert.match(selected.demandStrength, sample.expectedSelected.demand);
            }
            if (sample.expectedSelected.friction) {
                assert.match(selected.complianceFriction, sample.expectedSelected.friction);
            }
            if (sample.expectedSelected.green) {
                assert.match(selected.greenSupplyChainAdvantage, sample.expectedSelected.green);
            }
            if (sample.expectedSelected.role) {
                assert.match(selected.marketRole, sample.expectedSelected.role);
            }
            if (sample.expectedSelected.note) {
                assert.match(`${selected.strategicNote} ${selected.riskNote}`, sample.expectedSelected.note);
            }
            if (sample.expectedSelected.tags) {
                assert.match(selected.opportunityTags.join(' '), sample.expectedSelected.tags);
            }
        });
    });

    it('keeps the selected target market visible in route comparisons', () => {
        const model = buildOpportunityInsights({
            product: 'AI GPU accelerator chip',
            from: 'US',
            to: 'CN',
            focus: 'import',
            dutyRates,
            priorityMatrix
        });
        const china = model.routeComparison.find((row) => row.market === 'CN');

        assert.ok(china, 'selected China target should remain visible even when alternatives rank higher');
        assert.equal(china.sourceTrust, 'official_duty_tax_estimate');
        assert.equal(china.quoteReadiness, 'Selective quote');
        assert.equal(china.landedCostRisk, 'High');
        assert.equal(china.dutyBreakdown.totalRate, '13.0%');
    });

    it('prioritizes official or hybrid rate coverage over benchmark-only opportunity noise', () => {
        const model = buildOpportunityInsights({
            product: 'semiconductor chip',
            from: 'US',
            to: 'IN',
            focus: 'import',
            dutyRates,
            priorityMatrix
        });
        const firstBenchmarkIndex = model.routeComparison.findIndex((row) => row.sourceTrust === 'precheck_estimate');
        const firstOfficialIndex = model.routeComparison.findIndex((row) => row.sourceTrust === 'official_duty_tax_estimate' || row.sourceTrust === 'mixed_official_estimate');

        assert.ok(firstOfficialIndex >= 0);
        if (firstBenchmarkIndex >= 0) {
            assert.ok(firstOfficialIndex < firstBenchmarkIndex);
        }
    });

    it('gates routes without official or hybrid coverage as data pending', () => {
        const benchmarkDutyRates = {
            rules: [{
                import_country: 'VN',
                origin_country: '*',
                hs_prefixes: ['850760'],
                base_rate: 0,
                additional_rate: 0.1,
                source_status: 'benchmark_source_checked',
                confidence: 'Indicative',
                source_rate_text: 'Benchmark only'
            }]
        };
        const benchmarkPriorityMatrix = {
            routes: [{
                id: 'battery-global-vn',
                product_id: 'battery',
                origin_country: '*',
                import_country: 'VN',
                hs_code: '850760',
                expected_source_trust: 'precheck_estimate',
                automation_level: 'benchmark_auto'
            }]
        };
        const model = buildOpportunityInsights({
            product: 'energy storage battery system',
            from: 'CN',
            to: 'US',
            focus: 'import',
            dutyRates: benchmarkDutyRates,
            priorityMatrix: benchmarkPriorityMatrix
        });
        const pendingRows = model.routeComparison.filter((row) => (
            row.sourceTrust === 'precheck_estimate'
            || row.sourceTrust === 'not_covered'
        ));

        assert.ok(pendingRows.length >= 1);
        assert.ok(pendingRows.every((row) => row.tag === 'Data pending'));
        assert.ok(pendingRows.every((row) => row.recommendationGate === 'compare_later_data_pending'));
        assert.ok(pendingRows.every((row) => row.score <= 55));
        assert.ok(pendingRows.every((row) => /Compare later/i.test(row.opportunitySignal.action)));
        assert.ok(pendingRows.every((row) => /Research only|coverage/i.test(row.commercialDecision)));
        assert.ok(pendingRows.every((row) => row.quoteReadiness === 'Research only'));
    });

    it('builds an admin-ready opportunity priority list from maintained rate routes', () => {
        const rows = buildOpportunityPriorityList({ dutyRates, priorityMatrix, limit: 80 });

        assert.ok(rows.length >= 8);
        assert.ok(rows.every((row) => Number.isFinite(row.priority_score)));
        assert.ok(rows.every((row) => row.route && row.product_id && row.hs_code));
        assert.ok(rows.every((row) => row.quote_readiness && row.landed_cost_risk && row.market_role));
        assert.ok(rows.every((row) => row.demand_strength && row.compliance_friction && row.route_feasibility));
        assert.ok(rows.every((row) => row.workbench_bucket && row.workbench_bucket_label && row.workbench_action));
        assert.ok(rows.every((row) => row.commercial_action && row.route_strategy));
        assert.ok(rows.some((row) => row.to === 'IN' && row.from === 'CN'));
        assert.ok(rows.some((row) => row.to === 'CN' && row.from === 'US'));
        assert.ok(rows.some((row) => row.workbench_bucket === 'top_opportunity'));
        assert.ok(rows.some((row) => row.workbench_bucket === 'need_rule_upgrade'));
        assert.ok(rows[0].priority_score >= rows[rows.length - 1].priority_score);
    });
});

describe('trade opportunity navigation', () => {
    it('exposes Opportunity in primary HTML nav surfaces', () => {
        [
            'index.html',
            'hscode.html',
            'post-entry.html',
            'post-entry-result.html',
            'electronics.html',
            'new-energy.html',
            'semiconductor.html',
            'data-center.html',
            'industrial-automation.html',
            'healthcare-lab.html'
        ].forEach((file) => {
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
        assert.match(html, /<option value="" selected>Select country \/ region<\/option>/);
    });

    it('keeps Opportunity country placeholders visible before selection', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'opportunity.html'), 'utf8');
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'opportunity-page.js'), 'utf8');

        assert.equal((html.match(/Select country \/ region/g) || []).length, 2);
        assert.doesNotMatch(source, /placeholder\.disabled = true/);
    });

    it('connects result-page opportunity teaser to rate and parser coverage data', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'render-results.js'), 'utf8');

        assert.match(source, /data\/duty-rates\.json/);
        assert.match(source, /data\/post-entry-rate-priority-matrix\.json/);
        assert.match(source, /opportunity-teaser__chips/);
        assert.match(source, /parserBacklogCount/);
    });

    it('renders compact market metrics without repeated decision cards', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'opportunity-page.js'), 'utf8');

        assert.doesNotMatch(source, /opportunity-decision-card-grid/);
        assert.doesNotMatch(source, /opportunity-reason-list/);
        assert.doesNotMatch(source, /recommendationReasons\.map/);
        assert.doesNotMatch(source, /Cost data gap/);
        assert.doesNotMatch(source, /Execution gate/);
        assert.doesNotMatch(source, /Commercial Decision/);
        assert.doesNotMatch(source, /Margin Signal/);
        assert.doesNotMatch(source, /Quote Gate/);
        assert.match(source, /opportunity-rate-mini-grid/);
        assert.match(source, /Quote readiness/);
        assert.match(source, /Landed-cost risk/);
        assert.match(source, /Demand strength/);
        assert.match(source, /Compliance friction/);
        assert.match(source, /opportunity-hero-facts/);
        assert.match(source, /Data confidence/);
        assert.match(source, /Next move/);
    });

    it('hides the Opportunity input form when rendering a result URL', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'opportunity-page.js'), 'utf8');

        assert.match(source, /setResultMode/);
        assert.match(source, /form\.hidden = enabled/);
        assert.match(source, /startPanel\.hidden = enabled/);
        assert.match(source, /opportunity-result-mode/);
    });
});

describe('trade opportunity demo scenarios', () => {
    it('keeps five high-tech demo scenarios ready for customer demos', () => {
        const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-scenarios.json'), 'utf8'));
        const scenarios = demo.scenarios || [];

        assert.equal(scenarios.length, 5);
        assert.deepEqual(
            scenarios.map((item) => item.id),
            [
                'demo-us-cn-ai-gpu-import',
                'demo-cn-us-solar-import',
                'demo-cn-eu-battery-import',
                'demo-de-us-robot-import',
                'demo-cn-in-optical-module-import'
            ]
        );
        scenarios.forEach((item) => {
            assert.match(item.product, /\S/);
            assert.match(item.from, /^[A-Z]{2,6}$/);
            assert.match(item.to, /^[A-Z]{2,6}$/);
            assert.match(item.focus, /^(import|export)$/);
            assert.match(item.decision_question, /\?$/);
            assert.match(item.demo_url, /(index|opportunity)\.html/);
        });
    });
});
