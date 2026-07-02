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
    normalizeTaricGoodsCode,
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
    applyJapanOfficialCandidateToRule,
    buildJapanOfficialCandidateForRule,
    buildJapanOfficialRateCandidate,
    parseJapanAdValoremRate,
    parseJapanScheduleChapterLinks,
    parseJapanTariffChapterRows,
    parseJapanTariffScheduleHtml,
    probeJapanReadiness
} = require('../scripts/update-jp-duty-rates');
const {
    applyKoreaBenchmarkToRule,
    applyKoreaOfficialCandidateToRule,
    buildKoreaOfficialCandidateForRule,
    fetchKoreaOfficialRows,
    KR_TARIFF_DB_URL,
    KR_TARIFF_LOOKUP_URL,
    parseKoreaAdValoremRate,
    parseKoreaOfficialJsonRows,
    parseKoreaTariffRateRows,
    parseKoreaTariffDbHtml,
    probeKoreaReadiness
} = require('../scripts/update-kr-duty-rates');
const {
    DEFAULT_COUNTRIES: STATIC_BENCHMARK_COUNTRIES,
    STATIC_EXACT_CODE_CANDIDATES,
    applyIndiaOfficialCandidateToRule,
    buildIndiaOfficialCandidateForRule,
    fetchIndiaOfficialRows,
    fetchStaticOfficialProbe,
    getOfficialProbeUrls,
    parseGenericTariffRows,
    parseIndiaTariffRows,
    probeIndiaReadiness,
    probeStaticBenchmarkReadiness,
    probeStaticBenchmarkReadinessLive
} = require('../scripts/update-static-duty-rates');

const dutyRates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const dutyRateSources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rate-sources.json'), 'utf8'));

test('duty-rate source roadmap covers every maintained duty-rate country', () => {
    const summary = summarizeDutyRateCoverage(dutyRates);
    const roadmap = summarizeSourceRoadmap(dutyRateSources, summary);

    assert.equal(roadmap.missing_coverage.length, 0);
    assert.equal(roadmap.missing_roadmap.length, 0);
    assert.ok(roadmap.auto_updatable.includes('US'));
    assert.ok(roadmap.hybrid_official_candidate.includes('EU'));
    assert.ok(roadmap.hybrid_official_candidate.includes('DE'));
    assert.ok(roadmap.hybrid_official_candidate.includes('NL'));
    assert.ok(roadmap.hybrid_official_candidate.includes('SG'));
    assert.ok(roadmap.hybrid_official_candidate.includes('MX'));
    assert.ok(roadmap.hybrid_official_candidate.includes('VN'));
    assert.ok(roadmap.hybrid_official_candidate.includes('MY'));
    assert.ok(roadmap.hybrid_official_candidate.includes('TW'));
    assert.ok(roadmap.hybrid_official_candidate.includes('JP'));
    assert.ok(roadmap.hybrid_official_candidate.includes('KR'));
    assert.ok(roadmap.hybrid_official_candidate.includes('IN'));
    STATIC_BENCHMARK_COUNTRIES.forEach((country) => {
        if (country === 'IN') {
            assert.ok(roadmap.hybrid_official_candidate.includes(country), `${country} should be hybrid official candidate`);
        } else if (['CN', 'VN', 'MY', 'TW'].includes(country)) {
            assert.ok(roadmap.hybrid_official_candidate.includes(country), `${country} should be hybrid official candidate`);
        } else if (country === 'RU') {
            assert.ok(roadmap.official_link_only.includes(country), `${country} should be official-link monitored`);
        } else {
            assert.ok(roadmap.benchmark_updatable.includes(country), `${country} should be benchmark-updatable`);
        }
    });
    assert.equal(
        dutyRateSources.sources.some(source => source.country === 'JP' && source.probe_command === 'npm run probe:duty-rates:jp'),
        true
    );
    assert.equal(
        dutyRateSources.sources.some(source => source.country === 'KR' && source.probe_command === 'npm run probe:duty-rates:kr'),
        true
    );
});

test('duty-rate health check reports source roadmap status', () => {
    const result = runDutyRateHealthCheck();

    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.source_roadmap_summary.source_count, dutyRateSources.sources.length);
    assert.deepEqual(result.source_roadmap_summary.missing_coverage, []);
    assert.deepEqual(result.source_roadmap_summary.missing_roadmap, []);
});

test('static exact candidates include memory-specific HS lines for automated refresh', () => {
    ['854231', '854232', '854239'].forEach((hsCode) => {
        assert.ok(
            STATIC_EXACT_CODE_CANDIDATES.includes(hsCode),
            `${hsCode} should remain in the maintained static exact-code candidate list`
        );
    });

    ['CN', 'VN', 'MY', 'TW', 'IN'].forEach((country) => {
        const rule = (dutyRates.rules || []).find(item => (
            item.import_country === country
            && (item.hs_prefixes || []).includes('8542')
        ));
        assert.ok(rule, `${country} memory-capable electronics rule should exist`);
        ['854232', '854239'].forEach((hsCode) => {
            assert.ok(
                (rule.exact_code_overrides || []).some(override => override.hs_code === hsCode),
                `${country} should keep ${hsCode} as a maintained Memory exact-line candidate`
            );
        });
    });
});

test('EU hybrid source and benchmark updater probes are wired by market', async () => {
    const eu = await probeEuTaricReadiness();
    const sg = probeSingaporeReadiness();
    const mx = probeMexicoReadiness();
    const jp = await probeJapanReadiness();
    const kr = await probeKoreaReadiness();

    assert.equal(eu.ok, true);
    assert.equal(eu.writes_rates, true);
    assert.equal(eu.writes_official_machine_rates, false);
    assert.equal(eu.source_status, 'hybrid_official_candidate');
    assert.ok(eu.maintained_hs_prefixes.includes('850440'));
    assert.equal(eu.official_probe.checked, false);
    assert.equal(eu.official_probe.machine_parser_ready, false);

    assert.equal(sg.ok, true);
    assert.equal(sg.writes_rates, true);
    assert.equal(sg.writes_official_machine_rates, true);
    assert.equal(sg.source_status, 'hybrid_official_candidate');
    assert.ok(sg.maintained_hs_prefixes.includes('8517'));

    assert.equal(mx.ok, true);
    assert.equal(mx.writes_rates, true);
    assert.equal(mx.writes_official_machine_rates, true);
    assert.equal(mx.source_status, 'hybrid_official_candidate');
    assert.ok(mx.maintained_hs_prefixes.includes('847130'));

    assert.equal(jp.ok, true);
    assert.equal(jp.writes_rates, true);
    assert.equal(jp.writes_official_machine_rates, false);
    assert.equal(jp.source_status, 'hybrid_official_candidate');
    assert.ok(jp.maintained_hs_prefixes.includes('8542'));
    assert.equal(jp.official_probe.checked, false);
    assert.equal(jp.official_probe.machine_parser_ready, false);

    assert.equal(kr.ok, true);
    assert.equal(kr.writes_rates, true);
    assert.equal(kr.writes_official_machine_rates, false);
    assert.equal(kr.source_status, 'hybrid_official_candidate');
    assert.ok(kr.maintained_hs_prefixes.includes('8542'));
    assert.equal(kr.official_probe.checked, false);
    assert.equal(kr.official_probe.machine_parser_ready, false);
});

test('static official-link benchmark updater covers China Vietnam Malaysia Taiwan Russia and India', () => {
    STATIC_BENCHMARK_COUNTRIES.forEach((country) => {
        const readiness = probeStaticBenchmarkReadiness(country);
        assert.equal(readiness.ok, true, `${country} static benchmark readiness should be OK`);
        if (country === 'IN') {
            assert.equal(readiness.source_status, 'hybrid_official_candidate');
        } else if (['CN', 'VN', 'MY', 'TW'].includes(country)) {
            assert.equal(readiness.source_status, 'hybrid_official_candidate');
        } else if (country === 'RU') {
            assert.equal(readiness.source_status, 'official_link');
        } else {
            assert.equal(readiness.source_status, 'benchmark_updatable');
        }
        assert.equal(readiness.writes_rates, true);
        assert.equal(readiness.writes_official_machine_rates, false);
        assert.ok(readiness.maintained_hs_prefixes.includes('8542'), `${country} should cover semiconductor HS 8542`);
        assert.equal(readiness.official_probe.checked, false);
        assert.equal(readiness.official_probe.machine_parser_ready, false);
    });
});

test('Vietnam and Malaysia static sources expose official probe and transit use-case metadata', async () => {
    for (const country of ['VN', 'MY']) {
        const readiness = probeStaticBenchmarkReadiness(country);
        assert.ok(readiness.official_probe.official_probe_urls.length >= 2, `${country} should carry official probe URL candidates`);
        assert.equal(readiness.official_probe.source_use_cases.includes('two-leg transit comparison'), true);
        assert.equal(readiness.official_probe.transit_route_priority, true);

        const source = dutyRateSources.sources.find(row => row.country === country);
        const official = await fetchStaticOfficialProbe({
            country,
            source,
            fetcher: async (url) => ({
                status_code: 200,
                body: country === 'VN'
                    ? `<html><title>Vietnam Customs</title><p>customs tariff hải quan biểu thuế ${url}</p></html>`
                    : `<html><title>Malaysia Customs</title><p>customs tariff SST kastam ${url}</p></html>`
            })
        });
        assert.equal(official.ok, true);
        assert.ok(official.marker_count >= 2, `${country} probe should detect official-source markers`);

        const live = await probeStaticBenchmarkReadinessLive(country, {
            fetcher: async () => ({
                status_code: 200,
                body: country === 'VN'
                    ? '<html>Vietnam Customs tariff hải quan</html>'
                    : '<html>Malaysia Customs tariff SST kastam</html>'
            })
        });
        assert.equal(live.ok, true);
        assert.equal(live.official_probe.checked, true);
        assert.equal(live.official_probe.machine_parser_ready, false);
        assert.equal(live.official_probe.parsed_rate_rows, 0);
    }
});

test('generic static official probe detects tariff-like HS rows for Vietnam and Malaysia parser promotion', async () => {
    const genericRows = parseGenericTariffRows('<table><tr><td>85423100</td><td>Processors</td><td>0%</td></tr></table>');
    assert.equal(genericRows.length, 1);
    assert.equal(genericRows[0].base_rate, 0);
    assert.equal(genericRows[0].exact_rate_safe, true);

    for (const country of ['VN', 'MY']) {
        const source = dutyRateSources.sources.find(row => row.country === country);
        const body = country === 'VN'
            ? '<table><tr><td>85423100</td><td>Processors</td><td>0%</td></tr></table>'
            : '85423100 Processors customs duty 0%';
        const official = await fetchStaticOfficialProbe({
            country,
            source,
            fetcher: async () => ({
                status_code: 200,
                body
            })
        });
        const live = await probeStaticBenchmarkReadinessLive(country, {
            fetcher: async () => ({
                status_code: 200,
                body
            })
        });

        assert.equal(official.row_count, 1);
        assert.equal(official.rows[0].base_rate, 0);
        assert.equal(official.safe_row_count, country === 'VN' ? 1 : 0);
        assert.equal(official.exact_rate_safe, country === 'VN');
        assert.equal(live.official_probe.safe_rate_rows, country === 'VN' ? 1 : 0);
        assert.equal(live.official_probe.machine_parser_ready, country === 'VN');
        assert.equal(live.official_probe.parsed_rate_rows, 1);
    }
});

test('generic parser keeps weak text-only tariff rows out of exact-rate promotion', async () => {
    const official = await fetchStaticOfficialProbe({
        country: 'MY',
        source: dutyRateSources.sources.find(row => row.country === 'MY'),
        fetcher: async () => ({
            status_code: 200,
            body: '85423100 0%'
        })
    });
    const live = await probeStaticBenchmarkReadinessLive('MY', {
        fetcher: async () => ({
            status_code: 200,
            body: '85423100 0%'
        })
    });

    assert.equal(official.row_count, 1);
    assert.equal(official.weak_row_count, 1);
    assert.equal(official.exact_rate_safe, false);
    assert.equal(live.official_probe.machine_parser_ready, false);
    assert.match(live.official_probe.parser_note, /needs safer row structure/);
});

test('Japan Customs live probe parses dated tariff schedule and chapter candidates without upgrading rate trust', async () => {
    const indexHtml = `
        <h1>Japan's Tariff Schedule</h1>
        <a href="./2026_04_01/index.htm">April 1, 2026</a>
        <a href="./2025_04_01/index.htm">April 1, 2025</a>
    `;
    const scheduleHtml = `
        <h1>Japan's Tariff Schedule as of April 1 2026</h1>
        <a href="data/e_84.htm">Tariff rate</a>
        <a href="data/e_85.htm">Tariff rate</a>
    `;
    const chapterHtml = `
        <table>
            <tr>
                <td class="shell_var1_CSTNO">8542.31</td>
                <td class="shell_var1_HSCODE"></td>
                <td class="shell_var1_ITEM_NAME">Processors and controllers</td>
                <td>Free</td>
            </tr>
            <tr>
                <td class="shell_var1_CSTNO">8542.32</td>
                <td class="shell_var1_HSCODE"></td>
                <td class="shell_var1_ITEM_NAME">Memories</td>
                <td>Free</td>
            </tr>
        </table>
    `;
    const parsed = parseJapanTariffScheduleHtml(indexHtml, { baseUrl: 'https://www.customs.go.jp/english/tariff/' });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.latest_schedule_date, 'April 1, 2026');
    assert.equal(parsed.latest_schedule_url, 'https://www.customs.go.jp/english/tariff/2026_04_01/index.htm');
    assert.equal(parsed.machine_parser_ready, false);

    const chapterLinks = parseJapanScheduleChapterLinks(scheduleHtml, { baseUrl: parsed.latest_schedule_url });
    assert.equal(chapterLinks.some(link => link.chapter === '85' && link.url.endsWith('/data/e_85.htm')), true);
    const rows = parseJapanTariffChapterRows(chapterHtml);
    assert.equal(rows.length, 2);
    assert.equal(parseJapanAdValoremRate('Free'), 0);
    const candidate = buildJapanOfficialRateCandidate(rows, '8542');
    assert.equal(candidate.ok, true);
    assert.equal(candidate.status, 'official_source_candidate');
    assert.equal(candidate.base_rate, 0);

    const readiness = await probeJapanReadiness({
        live: true,
        fetcher: async (url) => {
            if (String(url).endsWith('/2026_04_01/index.htm')) {
                return { status_code: 200, body: scheduleHtml };
            }
            if (String(url).endsWith('/data/e_85.htm')) {
                return { status_code: 200, body: chapterHtml };
            }
            return { status_code: 200, body: indexHtml };
        }
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.official_probe.ok, true);
    assert.equal(readiness.official_probe.chapter_links.some(link => link.chapter === '85'), true);
    assert.equal(readiness.official_probe.prefix_candidates.some(item => item.hs_prefix === '8542' && item.status === 'official_source_candidate'), true);
    assert.equal(readiness.writes_official_machine_rates, false);
});

test('Korea Customs live probe detects tariff DB lookup without upgrading rate trust', async () => {
    assert.equal(KR_TARIFF_DB_URL.includes('/english/ad/ct/CustomsTariffList.do?mi=8037'), true);
    assert.equal(KR_TARIFF_LOOKUP_URL.includes('/english/ad/ct/CustomsTariffView.do'), true);

    const html = `
        <title>KCS Tariff D/B(Inquiry)</title>
        <h1>KCS Tariff D/B(Inquiry)</h1>
        <p>Please search by HS Code, Tariff Item, or Product Name. HS code must be 10 digits.</p>
    `;
    const parsed = parseKoreaTariffDbHtml(html);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supports_hs_lookup, true);
    assert.equal(parsed.machine_parser_ready, false);

    const readiness = await probeKoreaReadiness({
        live: true,
        fetcher: async () => ({
            status_code: 200,
            body: html
        })
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.official_probe.ok, true);
    assert.equal(readiness.writes_official_machine_rates, false);
});

test('Korea official live fetch parses candidate rows without network-dependent tests', async () => {
    const official = await fetchKoreaOfficialRows({
        fetcher: async () => ({
            status_code: 200,
            body: `
                <table>
                    <tr><th>HS Code</th><th>Description</th><th>Rate</th></tr>
                    <tr><td>8542310000</td><td>Processors</td><td>Free</td></tr>
                </table>
            `
        })
    });

    assert.equal(official.ok, true);
    assert.equal(official.row_count, 1);
    assert.equal(official.rows[0].parsed_base_rate, 0);
});

test('Korea official lookup JSON rows are parsed into guarded candidates', async () => {
    const rows = parseKoreaOfficialJsonRows(JSON.stringify([
        {
            hsCode: '8471500000',
            goodsName: 'Processing units',
            taxRate: '0%'
        }
    ]));
    const official = await fetchKoreaOfficialRows({
        fetcher: async (url) => ({
            status_code: 200,
            body: url.includes('CustomsTariffView.do')
                ? JSON.stringify([{ hsCode: '8471500000', goodsName: 'Processing units', taxRate: '0%' }])
                : '<h1>KCS Tariff D/B(Inquiry)</h1>'
        }),
        queryHsCodes: ['8471500000']
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].parsed_base_rate, 0);
    assert.equal(official.ok, true);
    assert.equal(official.query_attempts.length, 1);
    assert.equal(official.query_attempts[0].row_count, 1);
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

test('EU TARIC selector promotes an exact 10-digit TARIC goods-code match', () => {
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
    assert.equal(normalizeTaricGoodsCode('8504.40.6090'), '8504406090');

    const selection = selectEuThirdCountryDutyRate(rows, '850440', { exactTaricCode: '8504.40.6090' });
    assert.equal(selection.selected, true);
    assert.equal(selection.scope_check_required, false);
    assert.equal(selection.status, 'exact_taric_code_match');
    assert.equal(selection.base_rate, 0);
    assert.equal(selection.source_hts, '8504406090 (TARIC ERGA OMNES third-country duty)');

    const candidate = buildEuOfficialRateCandidate(rows, '850440', { exactTaricCode: '8504.40.9590' });
    assert.equal(candidate.ok, true);
    assert.equal(candidate.exact_taric_code, '8504409590');
    assert.equal(candidate.base_rate, 0.027);
});

test('EU TARIC exact-code matching tolerates common user formatting', () => {
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
            goods_code: '8471410000',
            origin: 'ERGA OMNES',
            measure_type: 'Third country duty',
            duty: '2.200 %',
            origin_code: '1011',
            measure_type_code: '103'
        }
    ];

    assert.equal(normalizeTaricGoodsCode('8471.30.00-00'), '8471300000');
    const candidate = buildEuOfficialRateCandidate(rows, '8471', { exactTaricCode: '8471.30.00-00' });

    assert.equal(candidate.ok, true);
    assert.equal(candidate.exact_taric_code, '8471300000');
    assert.equal(candidate.base_rate, 0);
    assert.match(candidate.reason, /Exact TARIC goods code matched/i);
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

test('Singapore updater keeps GST exact-line candidates separate from GST tax layer', () => {
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
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.confidence, 'Official duty + tax estimate');
    assert.ok(rule.exact_code_overrides.some(override => override.hs_code === '851762'));
    assert.equal(rule.add_on_layers[0].rate, 0.09);
    assert.equal(rule.additional_rate, 0.09);
});

test('Mexico updater keeps exact candidates separate from VAT layer', () => {
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
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.confidence, 'Official duty + tax estimate');
    assert.ok(rule.exact_code_overrides.some(override => override.hs_code === '854231'));
    assert.equal(rule.add_on_layers[0].rate, 0.16);
    assert.equal(rule.additional_rate, 0.16);
});

test('Japan updater keeps exact candidates separate from consumption tax layer', () => {
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
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.confidence, 'Official duty + tax estimate');
    assert.ok(rule.exact_code_overrides.some(override => override.hs_code === '854231'));
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.additional_rate, 0.1);
});

test('Japan updater can promote unambiguous official candidates while preserving consumption tax layer', () => {
    const rule = {
        id: 'TEST-JP-8542',
        import_country: 'JP',
        hs_prefixes: ['8542'],
        base_rate: 0.03,
        additional_rate: 0.08,
        add_on_layers: [
            { type: 'consumption_tax', rate: 0.08, status: 'indicative' }
        ],
        source_status: 'official_link_checked'
    };
    const rows = [
        {
            hs_heading: '8542.31',
            hs_digits: '854231',
            item_name: 'Processors and controllers',
            general_rate_text: 'Free',
            parsed_base_rate: 0
        },
        {
            hs_heading: '8542.32',
            hs_digits: '854232',
            item_name: 'Memories',
            general_rate_text: 'Free',
            parsed_base_rate: 0
        }
    ];
    const candidate = buildJapanOfficialCandidateForRule(rule, rows);
    assert.equal(candidate.ok, true);
    assert.equal(candidate.source_status, 'official_source_checked');

    const changes = applyJapanOfficialCandidateToRule(rule, candidate, '2026-06-16T00:00:00.000Z');
    assert.ok(changes.some(change => change.field === 'base_rate'));
    assert.equal(rule.base_rate, 0);
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.additional_rate, 0.1);
});

test('Japan official candidate keeps mixed-rate prefixes exact-code gated', () => {
    const candidate = buildJapanOfficialCandidateForRule({
        id: 'TEST-JP-MIXED',
        hs_prefixes: ['8528']
    }, [
        {
            hs_heading: '8528.52',
            hs_digits: '852852',
            item_name: 'Monitors',
            general_rate_text: 'Free',
            parsed_base_rate: 0
        },
        {
            hs_heading: '8528.59',
            hs_digits: '852859',
            item_name: 'Other monitors',
            general_rate_text: '3.9%',
            parsed_base_rate: 0.039
        }
    ]);

    assert.equal(candidate.ok, false);
    assert.equal(candidate.source_status, 'scope_check_required');
});

test('Korea updater keeps exact candidates separate from VAT layer', () => {
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
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.confidence, 'Official duty + tax estimate');
    assert.ok(rule.exact_code_overrides.some(override => override.hs_code === '854231'));
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.additional_rate, 0.1);
});

test('Korea official candidate promotes unambiguous tariff rows and keeps VAT separate', () => {
    const html = `
        <table>
            <tr><th>HS Code</th><th>Description</th><th>Basic Rate</th></tr>
            <tr><td>8542310000</td><td>Processors</td><td>Free</td></tr>
            <tr><td>8542320000</td><td>Memories</td><td>0%</td></tr>
        </table>
    `;
    const rows = parseKoreaTariffRateRows(html);
    const rule = {
        id: 'TEST-KR-8542',
        import_country: 'KR',
        hs_prefixes: ['8542'],
        base_rate: 0.08,
        additional_rate: 0.1,
        add_on_layers: [{ type: 'import_vat', rate: 0.1, status: 'indicative' }]
    };

    assert.equal(parseKoreaAdValoremRate('Free'), 0);
    assert.equal(rows.length, 2);
    const candidate = buildKoreaOfficialCandidateForRule(rule, rows);
    assert.equal(candidate.ok, true);
    assert.equal(candidate.source_status, 'official_source_checked');

    const changes = applyKoreaOfficialCandidateToRule(rule, candidate, '2026-06-17T00:00:00.000Z');
    assert.ok(changes.some(change => change.field === 'base_rate'));
    assert.equal(rule.base_rate, 0);
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.additional_rate, 0.1);
});

test('Korea official parser accepts text rows when the tariff page is not a simple table', () => {
    const html = `
        <section>
            8542310000 Processors Basic rate Free
            8528521000 Monitors WTO 8%
        </section>
    `;
    const rows = parseKoreaTariffRateRows(html);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].hs_code, '8542310000');
    assert.equal(rows[0].parsed_base_rate, 0);
    assert.equal(rows[1].parsed_base_rate, 0.08);
});

test('Korea official candidate keeps mixed rows exact-HS gated', () => {
    const candidate = buildKoreaOfficialCandidateForRule({
        id: 'TEST-KR-MIXED',
        hs_prefixes: ['8528']
    }, [
        { hs_code: '8528521000', parsed_base_rate: 0 },
        { hs_code: '8528599000', parsed_base_rate: 0.08 }
    ]);

    assert.equal(candidate.ok, false);
    assert.equal(candidate.source_status, 'scope_check_required');
});

test('India official candidate can parse BCD SWS and IGST rows', () => {
    const html = `
        <table>
            <tr><th>HS</th><th>Goods</th><th>BCD</th><th>SWS</th><th>IGST</th></tr>
            <tr><td>85423100</td><td>Processors</td><td>BCD 0%</td><td>SWS 10%</td><td>IGST 18%</td></tr>
            <tr><td>85423200</td><td>Memories</td><td>BCD 0%</td><td>SWS 10%</td><td>IGST 18%</td></tr>
        </table>
    `;
    const rows = parseIndiaTariffRows(html);
    const rule = {
        id: 'TEST-IN-8542',
        import_country: 'IN',
        hs_prefixes: ['8542'],
        base_rate: 0.1,
        additional_rate: 0,
        add_on_layers: [
            { type: 'social_welfare_surcharge', rate: 0, status: 'indicative' },
            { type: 'igst', rate: 0, status: 'indicative' }
        ],
        source_url: 'https://www.icegate.gov.in/'
    };

    assert.equal(rows.length, 2);
    const candidate = buildIndiaOfficialCandidateForRule(rule, rows);
    assert.equal(candidate.ok, true);
    assert.equal(candidate.source_status, 'official_source_checked');
    assert.equal(candidate.base_rate, 0);
    assert.equal(candidate.sws_rate, 0.1);
    assert.equal(candidate.igst_rate, 0.18);

    const changes = applyIndiaOfficialCandidateToRule(rule, candidate, {
        source: { official_url: 'https://www.icegate.gov.in/' },
        checkedAt: '2026-06-17T00:00:00.000Z'
    });
    assert.ok(changes.some(change => change.field === 'base_rate'));
    assert.equal(rule.source_status, 'official_source_checked');
    assert.equal(rule.add_on_layers[0].rate, 0.1);
    assert.equal(rule.add_on_layers[1].rate, 0.18);
});

test('India official live probe can parse tariff rows from injected official source', async () => {
    const html = `
        <table>
            <tr><th>HS</th><th>Goods</th><th>BCD</th><th>SWS</th><th>IGST</th></tr>
            <tr><td>85171300</td><td>Smartphones</td><td>BCD 0%</td><td>SWS 10%</td><td>IGST 18%</td></tr>
        </table>
    `;
    const official = await fetchIndiaOfficialRows({
        fetcher: async () => ({
            status_code: 200,
            body: html
        })
    });
    const readiness = await probeIndiaReadiness({
        live: true,
        fetcher: async () => ({
            status_code: 200,
            body: html
        })
    });

    assert.equal(official.ok, true);
    assert.equal(official.row_count, 1);
    assert.equal(readiness.official_probe.machine_parser_ready, true);
    assert.equal(readiness.official_probe.parsed_rate_rows, 1);
});

test('India official probe tries candidate sources before falling back to maintained exact map', async () => {
    const source = {
        official_url: 'https://example.invalid/primary',
        official_probe_urls: [
            'https://example.invalid/primary',
            'https://example.invalid/secondary'
        ]
    };
    const urls = getOfficialProbeUrls(source, 'https://www.icegate.gov.in/');
    const official = await fetchIndiaOfficialRows({
        source,
        fetcher: async (url) => ({
            status_code: 200,
            body: url.includes('secondary')
                ? '<table><tr><td>85423100</td><td>Processors</td><td>BCD 0%</td><td>SWS 10%</td><td>IGST 18%</td></tr></table>'
                : '<html>No rows yet</html>'
        })
    });

    assert.deepEqual(urls.slice(0, 2), ['https://example.invalid/primary', 'https://example.invalid/secondary']);
    assert.equal(official.ok, true);
    assert.equal(official.official_url, 'https://example.invalid/secondary');
    assert.equal(official.row_count, 1);
    assert.equal(official.attempts.length, 2);
    assert.equal(official.attempts[0].row_count, 0);
    assert.equal(official.attempts[1].row_count, 1);
});

test('India official parser accepts text rows and salvaged partial official responses', async () => {
    const body = `
        85423100 Processors BCD 0% SWS 10% IGST 18%
        85044090 Power supplies BCD 7.5% SWS 10% IGST 18%
    `;
    const rows = parseIndiaTariffRows(body);
    const official = await fetchIndiaOfficialRows({
        fetcher: async (_url, options = {}) => ({
            status_code: 206,
            partial: true,
            error: `Request timed out after ${options.timeoutMs}ms after partial body`,
            body
        })
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].bcd_rate, 0);
    assert.equal(rows[0].sws_rate, 0.1);
    assert.equal(rows[0].igst_rate, 0.18);
    assert.equal(official.ok, true);
    assert.equal(official.partial, true);
    assert.equal(official.row_count, 2);
});

test('India official updater keeps TLS verification while falling back to system curl', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'update-static-duty-rates.js'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    assert.match(script, /UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
    assert.match(script, /fetchTextWithCurl/);
    assert.doesNotMatch(script, /NODE_TLS_REJECT_UNAUTHORIZED/);
    assert.match(packageJson.scripts['sync:duty-rates:auto'], /--use-system-ca/);
    assert.match(packageJson.scripts['update:duty-rates:in:official'], /--use-system-ca/);
});

test('India official candidate keeps mixed tariff rows exact-line gated', () => {
    const candidate = buildIndiaOfficialCandidateForRule({
        id: 'TEST-IN-MIXED',
        hs_prefixes: ['850440']
    }, [
        { hs_code: '85044010', bcd_rate: 0, sws_rate: 0.1, igst_rate: 0.18 },
        { hs_code: '85044090', bcd_rate: 0.075, sws_rate: 0.1, igst_rate: 0.18 }
    ]);

    assert.equal(candidate.ok, false);
    assert.equal(candidate.source_status, 'scope_check_required');
});
