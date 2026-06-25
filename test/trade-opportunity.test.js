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
        assert.equal(detectProductSignal('800G optical transceiver module').id, 'optical_module');
        assert.equal(detectProductSignal('optical module').id, 'optical_module');
        assert.equal(detectProductSignal('ic chip').id, 'semiconductor');
        assert.equal(detectProductSignal('GPU').id, 'semiconductor');
        assert.equal(detectProductSignal('GPU').label, 'GPU / AI accelerator');
        assert.equal(detectProductSignal('H200').id, 'semiconductor');
        assert.equal(detectProductSignal('H200').label, 'GPU / AI accelerator');
        assert.equal(detectProductSignal('NVIDIA B200').label, 'GPU / AI accelerator');
        assert.equal(detectProductSignal('processor').id, 'semiconductor');
        assert.equal(detectProductSignal('router wifi network').id, 'network_equipment');
        assert.equal(detectProductSignal('ip camera network storage').id, 'surveillance_imaging');
        assert.equal(detectProductSignal('thermal camera payload').id, 'surveillance_imaging');
        assert.equal(detectProductSignal('network storage NAS').id, 'data_center');
        assert.equal(detectProductSignal('smartphone 5G cellular').label, 'Smartphone / cellular device');
        assert.equal(detectProductSignal('laptop computer').label, 'Laptop / computer');
        assert.equal(detectProductSignal('PCR analyzer').id, 'healthcare_lab');
        assert.equal(detectProductSignal('lab equipment').id, 'healthcare_lab');
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
        assert.equal(model.markets.length, 3);
        assert.equal(model.transitRoutes.length, 2);
        assert.ok(model.best.score >= model.markets[model.markets.length - 1].score);
        assert.ok(model.insights.some((item) => item.type === 'Green compliance'));
        assert.ok(model.insights.some((item) => item.type === 'Supply-chain evidence'));
        assert.equal(model.routeComparison.length, 3);
        assert.equal(model.routeComparison.filter((row) => row.routeKind === 'direct').length, 1);
        assert.equal(model.routeComparison.filter((row) => row.routeKind === 'transit').length, 2);
        assert.ok(model.transitRoutes.every((row) => row.transitComparison && row.routeScopeLabel.includes('Transit comparison')));
        assert.ok(model.transitRoutes.every((row) => row.transitCostStatus && row.transitReason));
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
        assert.ok(model.routeComparison.every((row) => Array.isArray(row.sourceEvidence) && row.sourceEvidence.length >= 4));
        assert.ok(model.routeComparison.every((row) => row.sourceEvidence.some((item) => /Data source|Source coverage|Transit decision/.test(item.label))));
        assert.ok(model.routeComparison.every((row) => row.sourceEvidence.some((item) => /Control gate|Origin \/ re-export gate/.test(item.label))));
        assert.ok(model.routeComparison.every((row) => row.routeDecisionSummary));
        assert.ok(model.routeComparison.every((row) => Array.isArray(row.rejectionReasons) && row.rejectionReasons.length >= 1));
        assert.ok(model.businessDecisionSummary?.headline);
        assert.equal(model.businessDecisionSummary.rows.length, 3);
        assert.ok(model.businessDecisionSummary.rows.some((row) => row.type === 'Direct route'));
        assert.equal(model.rateCoverageSummary.transitOptions, 2);
        assert.match(model.rateCoverageSummary.summary, /transit options have combined duty\/tax signals/i);
        assert.match(model.whyThisRoute, /because/i);
        assert.match(model.whyNotSelectedRoute, /United States|alternate market|selected route/i);
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
        const direct = model.routeComparison.find((row) => row.market === 'US');
        const transitRows = model.routeComparison.filter((row) => row.market !== 'US');

        assert.ok(direct, 'Selected United States route should be included');
        assert.equal(direct.sourceTrust, 'official_heading_only');
        assert.equal(direct.parserPriority, 'P2 exact HS parser');
        assert.equal(transitRows.length, 2);
        assert.ok(transitRows.every((row) => row.transitComparison));
        assert.ok(transitRows.every((row) => row.transitComparison.directRate === '25.0%'));
        assert.ok(transitRows.every((row) => row.transitComparison.secondLegRate));
        assert.ok(transitRows.every((row) => row.transitComparison.deltaRate));
        assert.ok(transitRows.every((row) => row.transitComparison.decision?.headline));
        assert.ok(transitRows.every((row) => /transit|direct|cost|duty|tax/i.test(row.transitComparison.decision.headline)));
        assert.ok(transitRows.every((row) => /Combined cost|duty-cost advantage/i.test(row.transitComparison.costConclusion)));
        assert.match(model.whyThisRoute, new RegExp(model.best.label));
        assert.match(model.whyNotSelectedRoute, /United States/);
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
        assert.equal(model.productSignal.label, 'GPU / AI accelerator');
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
        assert.equal(china.opportunityVerdict.label, 'Control first');
        assert.match(model.businessDecisionSummary.headline, /Control check comes before route optimization/i);
        assert.match(model.businessDecisionSummary.primaryAction, /export-control/i);
        assert.ok(model.businessDecisionSummary.rows.every((row) => row.label === 'Control first' || row.type === 'Direct route' || row.type === 'Transit option'));
        assert.match(china.salesAngle, /manufacturing ecosystem/i);
        assert.doesNotMatch(china.salesAngle, /agency reference systems/i);
        assert.match(model.whyThisRoute, /China/i);
        assert.match(model.whyNotSelectedRoute, /No alternate market|China/i);

        const singapore = model.routeComparison.find((row) => row.market === 'SG');
        assert.ok(singapore, 'Singapore comparison should stay visible');
        assert.equal(singapore.isSelectedMarket, false);
        assert.match(singapore.routeScopeLabel, /Transit comparison: United States -> Singapore -> China/);
        assert.equal(singapore.transitComparison.firstLegRate, '9.0%');
        assert.equal(singapore.transitComparison.secondLegRate, '13.0%');
        assert.equal(singapore.transitComparison.combinedRate, '22.0%');
        assert.equal(singapore.transitComparison.deltaRate, '+9.0%');
        assert.equal(singapore.transitComparison.firstLegCostPer1000, '$90.00 / $1k');
        assert.equal(singapore.transitComparison.secondLegCostPer1000, '$130.00 / $1k');
        assert.equal(singapore.transitComparison.combinedCostPer1000, '$220.00 / $1k');
        assert.equal(singapore.transitComparison.directCostPer1000, '$130.00 / $1k');
        assert.equal(singapore.transitComparison.deltaCostPer1000, '+$90.00 / $1k');
        assert.equal(singapore.routeKind, 'transit');
        assert.equal(singapore.transitCostStatus, 'cost_disadvantage');
        assert.equal(singapore.opportunityVerdict.label, 'Control first');
        assert.match(singapore.transitReason, /not cheaper than direct routing/i);
        assert.match(singapore.transitComparison.secondCoverageLabel, /transit evidence/);
        assert.equal(singapore.transitComparison.secondLegRouteSpecific, true);
        assert.equal(singapore.transitComparison.secondLegTransitEvidence, true);
        assert.match(singapore.transitComparison.secondLegScopeNote, /Singapore -> China has maintained transit-route review evidence/i);
        assert.ok(singapore.transitComparison.secondParserPriority);
        assert.ok(singapore.transitComparison.secondParserNextAction);
        assert.match(singapore.transitComparison.decision.headline, /Do not use Singapore for cost reduction/i);
        assert.match(singapore.transitComparison.decision.reason, /not simple tariff savings/i);
        assert.match(singapore.transitWarning, /No duty-cost advantage versus direct route/i);
        assert.match(singapore.transitWarning, /delta: \+9\.0% \(\+\$90\.00 \/ \$1k\) per \$1k/i);
        assert.match(singapore.transitWarning, /maintained transit-route review evidence/i);
        assert.match(singapore.transitWarning, /origin transformation/i);
        assert.ok(singapore.sourceEvidence.some((item) => item.label === 'Combined cost' && /United States -> Singapore/.test(item.detail) && /\+\$90\.00 \/ \$1k/.test(item.detail)));
        assert.ok(singapore.sourceEvidence.some((item) => item.label === 'Origin / re-export gate' && /origin transformation/i.test(item.detail)));
        assert.match(singapore.routeDecisionSummary, /Not cheaper|cost reduction|direct/i);
        assert.ok(singapore.rejectionReasons.some((item) => /higher than direct|workaround|origin/i.test(item)));
        assert.ok(model.businessDecisionSummary.rows.some((row) => /Singapore/.test(row.route) && /workaround/i.test(row.gate)));
        assert.equal(model.rateCoverageSummary.transitCosted, 2);
        assert.equal(model.rateCoverageSummary.transitEvidenceBacked, 2);
    });

    it('keeps transit options to two routes and explains full two-leg cost limits for high-risk samples', () => {
        [
            ['H200', 'US', 'CN', 'GPU / AI accelerator'],
            ['GPU', 'US', 'CN', 'GPU / AI accelerator'],
            ['solar panel photovoltaic', 'US', 'CN', 'Solar / PV'],
            ['energy storage battery system', 'US', 'CN', 'Battery / ESS'],
            ['AI server GPU server', 'US', 'CN', 'AI server / accelerator system']
        ].forEach(([product, from, to, expectedLabel]) => {
            const model = buildOpportunityInsights({
                product,
                from,
                to,
                dutyRates,
                priorityMatrix
            });

            assert.equal(model.productSignal.label, expectedLabel);
            assert.equal(model.routeComparison[0].routeKind, 'direct');
            assert.equal(model.routeComparison[0].market, to);
            assert.equal(model.transitRoutes.length, 2);
            assert.equal(model.routeComparison.filter((row) => row.routeKind === 'transit').length, 2);
            assert.ok(model.transitRoutes.every((row) => row.transitComparison.combinedCostPer1000));
            assert.ok(model.transitRoutes.every((row) => row.transitComparison.deltaCostPer1000));
            assert.ok(model.transitRoutes.every((row) => /transit-route review evidence|route-specific|origin transformation/i.test(`${row.transitReason} ${row.transitWarning}`)));
            assert.ok(model.transitRoutes.every((row) => !/Strong opportunity route with 9\.0% total/i.test(row.commercialDecision)));
        });
    });

    it('surfaces a BIS export-control gate for US-origin H200 opportunities to China', () => {
        const model = buildOpportunityInsights({
            product: 'H200',
            from: 'US',
            to: 'CN',
            dutyRates,
            priorityMatrix
        });

        assert.equal(model.productSignal.label, 'GPU / AI accelerator');
        assert.equal(model.selectedMarket.opportunityVerdict.label, 'Control first');
        assert.match(model.selectedMarket.commercialDecision, /Control first/i);
        assert.match(model.businessDecisionSummary.headline, /Control check comes before route optimization/i);
        assert.ok(model.businessDecisionSummary.rows.every((row) => /Control first|Transit option|Direct route/.test(`${row.label} ${row.type}`)));
        assert.match(model.selectedMarket.exportControlGate.label, /US BIS|advanced-computing|semiconductor/i);
        assert.equal(model.selectedMarket.exportControlGate.severity, 'Critical');
        assert.match(model.selectedMarket.exportControlGate.summary, /AI GPUs|advanced ICs|semiconductor/i);
        assert.ok(model.selectedMarket.exportControlGate.checks.some((item) => /ECCN|3A090|4A090/i.test(item)));
        assert.ok(model.selectedMarket.exportControlGate.checks.some((item) => /Entity List|end use/i.test(item)));
    });

    it('surfaces export-control gates for controlled product families without flagging ordinary green or medical products', () => {
        const controlledProducts = [
            ['ai server gpu server', /AI server|data-center/i],
            ['optical transceiver module', /optics|telecom/i],
            ['drone uav under 2kg', /UAV|drone/i],
            ['ip camera thermal imaging', /surveillance|sensitive-imaging/i],
            ['router vpn firewall appliance', /network|encryption/i],
            ['industrial robot arm', /industrial automation|controlled-technology/i]
        ];

        for (const [product, labelPattern] of controlledProducts) {
            const model = buildOpportunityInsights({
                product,
                from: 'US',
                to: 'CN',
                dutyRates,
                priorityMatrix
            });
            assert.ok(model.selectedMarket.exportControlGate, `${product} should have an export-control gate`);
            assert.match(model.selectedMarket.exportControlGate.label, labelPattern);
        }

        for (const product of ['solar panel photovoltaic', 'energy storage battery system', 'patient monitor medical electronics']) {
            const model = buildOpportunityInsights({
                product,
                from: 'US',
                to: 'CN',
                dutyRates,
                priorityMatrix
            });
            assert.equal(model.selectedMarket.exportControlGate, null, `${product} should not default to export-control gate`);
        }
    });

    it('treats optical transceivers as telecom interconnect opportunities, not generic IC matches', () => {
        const model = buildOpportunityInsights({
            product: '800G optical transceiver module',
            from: 'CN',
            to: 'IN',
            focus: 'import',
            dutyRates,
            priorityMatrix
        });

        assert.equal(model.productSignal.id, 'optical_module');
        assert.match(model.selectedMarket.salesAngle, /high-speed interconnect/i);
        assert.doesNotMatch(model.selectedMarket.salesAngle, /advanced hardware procurement/i);
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
        assert.ok(pendingRows.every((row) => row.tag === 'Data pending' || row.tag === 'Do not recommend yet'));
        assert.ok(pendingRows.every((row) => row.recommendationGate === 'compare_later_data_pending'));
        assert.ok(pendingRows.every((row) => row.score <= 55));
        assert.ok(pendingRows.every((row) => /Compare later/i.test(row.opportunitySignal.action)));
        assert.ok(pendingRows.every((row) => /Research only|coverage|recommend/i.test(row.commercialDecision)));
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

    it('keeps Opportunity route fields blank by default without requiring a focus choice', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'opportunity.html'), 'utf8');
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'opportunity-page.js'), 'utf8');

        assert.doesNotMatch(html, /opportunity-focus/);
        assert.doesNotMatch(html, /Export opportunity at origin/);
        assert.doesNotMatch(html, /Import opportunity at destination/);
        assert.doesNotMatch(source, /opportunity-focus/);
        assert.doesNotMatch(source, /Select export-side or import-side opportunity focus/);
        assert.doesNotMatch(source, /params\.set\('focus'/);
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
        assert.match(source, /opportunity-commercial-brief/);
        assert.match(source, /renderBusinessDecisionSummary/);
        assert.match(source, /Decision summary/);
        assert.match(source, /opportunity-decision-summary-grid/);
        assert.match(source, /Why this route:/);
        assert.match(source, /Selected route check:/);
        assert.match(source, /Direct route and top transit options/);
        assert.match(source, /Transit totals combine both maintained duty\/tax legs/);
        assert.match(source, /re-export, and logistics evidence/);
        assert.match(source, /Transit decision/);
        assert.match(source, /Transit total/);
        assert.match(source, /Transit cost \/ \$1k/);
        assert.match(source, /Delta \/ \$1k/);
        assert.match(source, /Baseline second-leg check/);
        assert.match(source, /opportunity-route-verdict/);
        assert.match(source, /verdict\.label/);
        assert.match(source, /combinedCostPer1000/);
        assert.match(source, /deltaCostPer1000/);
        assert.match(source, /Second leg/);
        assert.match(source, /opportunity-transit-note/);
        assert.match(source, /opportunity-transit-verdict/);
        assert.match(source, /opportunity-control-gate/);
        assert.match(source, /opportunity-source-evidence/);
        assert.match(source, /Decision evidence/);
        assert.match(source, /opportunity-route-decision/);
        assert.match(source, /Route decision/);
        assert.match(source, /rejectionReasons/);
        assert.match(source, /Export control gate/);
        assert.match(source, /Data confidence/);
        assert.match(source, /Next move/);
        assert.match(source, /Quote status:/);
        assert.match(source, /Landed-cost risk:/);
        assert.match(source, /Compliance friction:/);
        assert.doesNotMatch(source, /Route comparison and rate coverage/);
        assert.doesNotMatch(source, /opportunity-route-table/);
        assert.doesNotMatch(source, /renderRouteRow/);
        assert.doesNotMatch(source, /route\(s\) usable for pricing comparison/);

        const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
        assert.match(css, /opportunity-decision-summary/);
        assert.match(css, /opportunity-summary-row--critical/);
        assert.match(css, /opportunity-route-verdict/);
        assert.doesNotMatch(css, /opportunity-route-table/);
        assert.doesNotMatch(css, /opportunity-duty-breakdown/);
        assert.doesNotMatch(css, /opportunity-parser-cell/);
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
