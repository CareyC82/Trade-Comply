const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    runDutyRateHealthCheck,
    summarizeSourceRoadmap
} = require('../scripts/check-duty-rates');
const {
    summarizeDutyRateCoverage
} = require('../scripts/update-us-duty-rates');
const {
    applyBenchmarkToRule,
    buildCircabcDirectDownloadUrl,
    pickLatestNumberedFolder,
    pickTaricImportDutiesFile,
    parseEuTaricConsultationHtml,
    parseTaricSheetRows,
    summarizeThirdCountryDutyRates,
    selectEuThirdCountryDutyRate,
    buildEuOfficialRateCandidate,
    buildEuOfficialCandidateForRule,
    applyOfficialCandidateToRule,
    updateEuRules,
    probeEuTaricOfficialSource,
    probeEuTaricReadiness
} = require('../scripts/update-eu-duty-rates');
const {
    applySingaporeBenchmarkToRule,
    probeSingaporeReadiness
} = require('../scripts/update-sg-duty-rates');
const {
    applyMexicoBenchmarkToRule,
    probeMexicoReadiness
} = require('../scripts/update-mx-duty-rates');
const {
    applyJapanBenchmarkToRule,
    probeJapanReadiness
} = require('../scripts/update-jp-duty-rates');
const {
    applyKoreaBenchmarkToRule,
    probeKoreaReadiness
} = require('../scripts/update-kr-duty-rates');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const dutyRateSources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rate-sources.json'), 'utf8'));

test('duty-rate source roadmap covers every maintained duty-rate country', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const roadmap = summarizeSourceRoadmap(dutyRateSources, summary);

    assert.equal(roadmap.missing_coverage.length, 0);
    assert.equal(roadmap.missing_roadmap.length, 0);
    assert.ok(roadmap.auto_updatable.includes('US'));
    assert.ok(roadmap.benchmark_updatable.includes('EU'));
    assert.ok(roadmap.benchmark_updatable.includes('SG'));
    assert.ok(roadmap.benchmark_updatable.includes('MX'));
    assert.ok(roadmap.benchmark_updatable.includes('JP'));
    assert.ok(roadmap.benchmark_updatable.includes('KR'));
});

test('duty-rate health check reports source roadmap status', () => {
    const result = runDutyRateHealthCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.source_roadmap_summary.source_count, dutyRateSources.sources.length);
    assert.deepEqual(result.source_roadmap_summary.missing_coverage, []);
    assert.deepEqual(result.source_roadmap_summary.missing_roadmap, []);
});

test('EU, Singapore, Mexico, Japan, and Korea updater probes are wired as benchmark writers', async () => {
    const eu = await probeEuTaricReadiness();
    const sg = probeSingaporeReadiness();
    const mx = probeMexicoReadiness();
    const jp = probeJapanReadiness();
    const kr = probeKoreaReadiness();

    assert.equal(eu.ok, true);
    assert.equal(eu.writes_rates, true);
    assert.equal(eu.writes_official_machine_rates, false);
    assert.equal(eu.source_status, 'benchmark_updatable');
    assert.ok(eu.maintained_hs_prefixes.includes('850440'));
    assert.equal(eu.official_probe.checked, false);
    assert.equal(eu.official_probe.machine_parser_ready, false);

    assert.equal(sg.ok, true);
    assert.equal(sg.writes_rates, true);
    assert.equal(sg.writes_official_machine_rates, false);
    assert.equal(sg.source_status, 'benchmark_updatable');
    assert.ok(sg.maintained_hs_prefixes.includes('8517'));

    assert.equal(mx.ok, true);
    assert.equal(mx.writes_rates, true);
    assert.equal(mx.writes_official_machine_rates, false);
    assert.equal(mx.source_status, 'benchmark_updatable');
    assert.ok(mx.maintained_hs_prefixes.includes('847130'));

    assert.equal(jp.ok, true);
    assert.equal(jp.writes_rates, true);
    assert.equal(jp.writes_official_machine_rates, false);
    assert.equal(jp.source_status, 'benchmark_updatable');
    assert.ok(jp.maintained_hs_prefixes.includes('8542'));

    assert.equal(kr.ok, true);
    assert.equal(kr.writes_rates, true);
    assert.equal(kr.writes_official_machine_rates, false);
    assert.equal(kr.source_status, 'benchmark_updatable');
    assert.ok(kr.maintained_hs_prefixes.includes('8542'));
});

test('EU TARIC official probe parses consultation metadata without upgrading rate trust', async () => {
    const html = `
        <title>TARIC Consultation</title>
        <span>Last TARIC update:&nbsp;</span>
        <span>09-06-2026</span>
        <a href="https://circabc.europa.eu/ui/group/example?p=1&amp;n=-1">TARIC Full database&nbsp;</a>
    `;
    const parsed = parseEuTaricConsultationHtml(html);
    assert.equal(parsed.last_taric_update, '09-06-2026');
    assert.equal(parsed.full_database_url, 'https://circabc.europa.eu/ui/group/example?p=1&n=-1');

    const official = await probeEuTaricOfficialSource({
        fetcher: async () => ({
            status_code: 200,
            body: html
        })
    });
    assert.equal(official.ok, true);
    assert.equal(official.last_taric_update, '09-06-2026');
    assert.equal(official.machine_parser_ready, false);

    const readiness = await probeEuTaricReadiness({
        live: true,
        fetcher: async () => ({
            status_code: 200,
            body: html
        })
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.writes_official_machine_rates, false);
    assert.equal(readiness.official_probe.ok, true);
});

test('EU TARIC full database probe can locate latest import duties workbook', () => {
    const folders = [
        { id: 'old', name: '2025', type: '{folder}', properties: { modified: '2025-12-01T00:00Z' } },
        { id: 'new', name: '2026', type: '{folder}', properties: { modified: '2026-06-01T00:00Z' } }
    ];
    const latestYear = pickLatestNumberedFolder(folders);
    assert.equal(latestYear.id, 'new');

    const files = [
        { id: 'x', name: 'Footnotes descriptions.xlsx', type: '{content}', properties: { size: '1' } },
        { id: 'duties', name: 'Duties Import 01-99.xlsx', type: '{content}', properties: { size: '7661294' } }
    ];
    const duties = pickTaricImportDutiesFile(files);
    assert.equal(duties.id, 'duties');
    assert.match(buildCircabcDirectDownloadUrl(duties), /Duties%20Import%2001-99\.xlsx$/);
});

test('EU TARIC parser extracts third-country duty rates from worksheet XML', () => {
    const sheetXml = `
        <worksheet><sheetData>
            <row r="1"><c r="A1" t="inlineStr"><is><t>Goods code</t></is></c></row>
            <row r="2">
                <c r="A2" t="inlineStr"><is><t>8507600015</t></is></c>
                <c r="G2" t="inlineStr"><is><t>ERGA OMNES</t></is></c>
                <c r="H2" t="inlineStr"><is><t>Third country duty</t></is></c>
                <c r="J2" t="inlineStr"><is><t xml:space="preserve">2.700 % </t></is></c>
                <c r="K2" t="inlineStr"><is><t>1011</t></is></c>
                <c r="L2" t="inlineStr"><is><t>103</t></is></c>
            </row>
            <row r="3">
                <c r="A3" t="inlineStr"><is><t>8507600026</t></is></c>
                <c r="G3"/>
                <c r="H3" t="inlineStr"><is><t>Autonomous tariff suspension</t></is></c>
                <c r="J3" t="inlineStr"><is><t>1.300 % </t></is></c>
                <c r="K3" t="inlineStr"><is><t>1011</t></is></c>
                <c r="L3" t="inlineStr"><is><t>112</t></is></c>
            </row>
        </sheetData></worksheet>
    `;
    const rows = parseTaricSheetRows(sheetXml, { prefixes: ['850760'] });
    const summary = summarizeThirdCountryDutyRates(rows, '850760');
    assert.equal(rows.length, 2);
    assert.equal(summary.ok, true);
    assert.equal(summary.exact_single_rate, true);
    assert.deepEqual(summary.unique_base_rates, [0.027]);
});

test('EU TARIC selector only promotes a single ERGA OMNES third-country duty rate', () => {
    const rows = [
        {
            goods_code: '8507600015',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '2.700 %',
            origin_code: '1011',
            measure_type_code: '103'
        },
        {
            goods_code: '8507600026',
            origin: 'ERGA OMNES',
            measure_type: 'Autonomous tariff suspension',
            duty: '1.300 %',
            origin_code: '1011',
            measure_type_code: '112'
        },
        {
            goods_code: '8507600090',
            origin: 'Singapore',
            measure_type: 'Third country duty',
            duty: '0.000 %',
            origin_code: '706',
            measure_type_code: '103'
        }
    ];
    const selection = selectEuThirdCountryDutyRate(rows, '850760');
    assert.equal(selection.selected, true);
    assert.equal(selection.scope_check_required, false);
    assert.equal(selection.status, 'exact_single_rate');
    assert.equal(selection.base_rate, 0.027);

    const candidate = buildEuOfficialRateCandidate(rows, '850760');
    assert.equal(candidate.ok, true);
    assert.equal(candidate.source_status, 'official_source_candidate');
    assert.equal(candidate.base_rate, 0.027);
});

test('EU TARIC selector requires exact TARIC scope when one HS prefix has multiple duty rates', () => {
    const rows = [
        {
            goods_code: '8504406090',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '0.000 %',
            origin_code: '1011',
            measure_type_code: '103'
        },
        {
            goods_code: '8504409590',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '2.700 %',
            origin_code: '1011',
            measure_type_code: '103'
        }
    ];
    const selection = selectEuThirdCountryDutyRate(rows, '850440');
    assert.equal(selection.selected, false);
    assert.equal(selection.scope_check_required, true);
    assert.equal(selection.status, 'multiple_rates_need_taric10');
    assert.deepEqual(selection.unique_base_rates, [0, 0.027]);

    const candidate = buildEuOfficialRateCandidate(rows, '850440');
    assert.equal(candidate.ok, false);
    assert.equal(candidate.source_status, 'scope_check_required');
});

test('EU official candidate can update a single-prefix rule without changing VAT layers', () => {
    const rows = [
        {
            goods_code: '8504406090',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '0.000 %',
            origin_code: '1011',
            measure_type_code: '103'
        }
    ];
    const rule = {
        id: 'TEST-EU-850440',
        import_country: 'EU',
        hs_prefixes: ['850440'],
        base_rate: 0.027,
        add_on_layers: [
            { type: 'import_vat', rate: 0.19 }
        ],
        source_status: 'benchmark_source_checked'
    };
    const candidate = buildEuOfficialCandidateForRule(rule, rows);
    assert.equal(candidate.ok, true);
    assert.equal(candidate.base_rate, 0);

    const changes = applyOfficialCandidateToRule(rule, candidate, '2026-06-10T00:00:00.000Z');
    assert.ok(changes.some(change => change.field === 'base_rate'));
    assert.equal(rule.base_rate, 0);
    assert.equal(rule.add_on_layers[0].rate, 0.19);
    assert.equal(rule.source_status, 'official_source_checked');
});

test('EU official candidate refuses a multi-prefix rule with conflicting rates', () => {
    const rows = [
        {
            goods_code: '8471300000',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '0.000 %',
            origin_code: '1011',
            measure_type_code: '103'
        },
        {
            goods_code: '8507600015',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '2.700 %',
            origin_code: '1011',
            measure_type_code: '103'
        }
    ];
    const candidate = buildEuOfficialCandidateForRule({
        id: 'TEST-DE-MULTI',
        hs_prefixes: ['847130', '850760']
    }, rows);
    assert.equal(candidate.ok, false);
    assert.match(candidate.reason, /different official TARIC rates/);
});

test('EU updater records official candidate outcomes during dry run', () => {
    const rows = [
        {
            goods_code: '8504406090',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '0.000 %',
            origin_code: '1011',
            measure_type_code: '103'
        }
    ];
    const result = updateEuRules({ dryRun: true, taricRows: rows });
    assert.equal(result.writes_official_machine_rates, true);
    assert.ok(result.official_candidate_rows >= 1);
    assert.ok(result.official_candidate_outcomes.some(outcome => outcome.rule === 'EU-CN-850440-EVCHARGER-INDICATIVE' && outcome.ok));
    assert.ok(result.changes.some(change => change.rule === 'EU-CN-850440-EVCHARGER-INDICATIVE' && change.mode === 'official-candidate'));
});

test('EU updater marks maintained rules as benchmark checked without official status', () => {
    const rule = {
        id: 'TEST-EU',
        import_country: 'EU',
        base_rate: 0.027,
        add_on_layers: [],
        source_status: 'indicative'
    };
    const changes = applyBenchmarkToRule(rule, {
        base_rate: 0.027,
        source_hts: '850440 benchmark',
        source_rate_text: 'Benchmark text',
        source_note: 'Benchmark note'
    }, '2026-06-08T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.source_rate_text, 'Benchmark text');
});

test('EU benchmark updater does not downgrade official or scope-checked rates', () => {
    const officialRule = {
        id: 'TEST-EU-OFFICIAL',
        import_country: 'EU',
        base_rate: 0,
        add_on_layers: [],
        source_status: 'official_source_checked',
        confidence: 'Official source checked',
        source_hts: '8542 (TARIC ERGA OMNES third-country duty)',
        source_rate_text: 'TARIC third-country duty: 0.000%',
        source_url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
        last_checked_at: '2026-06-09T00:00:00.000Z'
    };
    const scopeRule = {
        id: 'TEST-EU-SCOPE',
        import_country: 'EU',
        base_rate: 0,
        add_on_layers: [],
        source_status: 'scope_check_required',
        confidence: 'Scope check required',
        source_hts: '8528 (TARIC scope check required)',
        source_rate_text: 'Exact TARIC code required before using an official EU duty rate.',
        source_url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
        last_checked_at: '2026-06-09T00:00:00.000Z'
    };
    const benchmark = {
        base_rate: 0.027,
        source_hts: '850440 benchmark',
        source_rate_text: 'Benchmark text',
        source_note: 'Benchmark note'
    };

    const officialChanges = applyBenchmarkToRule(officialRule, benchmark, '2026-06-10T00:00:00.000Z');
    const scopeChanges = applyBenchmarkToRule(scopeRule, benchmark, '2026-06-10T00:00:00.000Z');

    assert.deepEqual(officialChanges.map(change => change.field), ['last_checked_at']);
    assert.equal(officialRule.base_rate, 0);
    assert.equal(officialRule.source_status, 'official_source_checked');
    assert.equal(officialRule.source_rate_text, 'TARIC third-country duty: 0.000%');

    assert.deepEqual(scopeChanges.map(change => change.field), ['last_checked_at']);
    assert.equal(scopeRule.base_rate, 0);
    assert.equal(scopeRule.source_status, 'scope_check_required');
    assert.equal(scopeRule.source_rate_text, 'Exact TARIC code required before using an official EU duty rate.');
});

test('Singapore updater keeps GST benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-SG',
        import_country: 'SG',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'import_gst', rate: 0.08, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applySingaporeBenchmarkToRule(rule, '2026-06-08T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.09);
    assert.equal(rule.additional_rate, 0.09);
});

test('Mexico updater keeps VAT benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-MX',
        import_country: 'MX',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'import_vat', rate: 0.15, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applyMexicoBenchmarkToRule(rule, '2026-06-09T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.16);
    assert.equal(rule.additional_rate, 0.16);
});

test('Japan updater keeps consumption tax benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-JP',
        import_country: 'JP',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'consumption_tax', rate: 0.08, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applyJapanBenchmarkToRule(rule, '2026-06-10T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.additional_rate, 0.1);
});

test('Korea updater keeps VAT benchmark separate from official machine rates', () => {
    const rule = {
        id: 'TEST-KR',
        import_country: 'KR',
        base_rate: 0,
        additional_rate: 0,
        add_on_layers: [
            { type: 'import_vat', rate: 0.09, status: 'indicative' }
        ],
        source_status: 'indicative'
    };
    const changes = applyKoreaBenchmarkToRule(rule, '2026-06-10T00:00:00.000Z');

    assert.ok(changes.some(change => change.field === 'source_status'));
    assert.equal(rule.source_status, 'benchmark_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.additional_rate, 0.1);
});
