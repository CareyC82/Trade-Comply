const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importP2DutyRates, priorityPrefixesFor, hash } = require('../scripts/import-p2-duty-rates');
const { buildTariffRows } = require('../lib/tariff-watch');
const { findDutyRule, setDutyRulesForTest } = require('../lib/post-entry-value');
const { buildDutyRateStatusPayload } = require('../scripts/admin-server');

const CASES = {
    IN: { authority: 'Central Board of Indirect Taxes and Customs / ICEGATE', url: 'https://www.icegate.gov.in/tariff.xlsx', code: '85176200', csv: [
        'HS Code,Description,BCD,SWS,IGST',
        '84713010,Tablet,0%,10%,18%', '85044010,Power converter,10%,10%,18%',
        '85076000,Lithium-ion battery,10%,10%,18%', '85171300,Smartphone,10%,10%,18%',
        '85176200,Router,10%,10%,18%', '85423100,Processor,0%,10%,18%'
    ].join('\n') },
    KR: { authority: 'Korea Customs Service', url: 'https://www.customs.go.kr/tariff.xlsx', code: '8517620000', csv: [
        'HS Code,Description,Import Rate,FTA Rate',
        '8471300000,Tablet,0%,0%', '8504400000,Power converter,8%,0%',
        '8507600000,Lithium-ion battery,8%,0%', '8517130000,Smartphone,0%,0%',
        '8517620000,Router,8%,0%', '8542310000,Processor,0%,0%'
    ].join('\n') },
    VN: { authority: 'Vietnam Customs', url: 'https://www.customs.gov.vn/tariff.xlsx', code: '85176200', csv: 'HS Code,Description,MFN Rate\n85176200,Router,5%' },
    TW: { authority: 'Customs Administration, Ministry of Finance', url: 'https://portal.sw.nat.gov.tw/tariff.xlsx', code: '85176200000', csv: 'CCC Code,Description,Import Rate\n85176200000,Router,4%' },
    RU: { authority: 'Eurasian Economic Commission', url: 'https://eec.eaeunion.org/tariff.xlsx', code: '8517620000', csv: 'HS Code,Description,Import Rate\n8517620000,Router,5%' }
};

function fixture(country, overrides = {}) {
    const item = { ...CASES[country], ...overrides };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `p2-${country.toLowerCase()}-`));
    const artifactPath = path.join(dir, 'tariff.csv');
    const manifestPath = path.join(dir, 'manifest.json');
    const dutyRatesPath = path.join(dir, 'duty-rates.json');
    const statusPath = path.join(dir, 'status.json');
    const prioritiesPath = path.join(dir, 'priorities.json');
    fs.writeFileSync(artifactPath, item.csv);
    fs.writeFileSync(manifestPath, JSON.stringify({ country, authority: item.authority, source_url: item.url,
        coverage_scope: 'full_tariff', complete: true, published_at: '2026-08-01', effective_at: '2026-08-15',
        expected_rows: item.csv.trim().split('\n').length - 1, sha256: hash(Buffer.from(item.csv)) }));
    fs.writeFileSync(dutyRatesPath, JSON.stringify({ rules: [{ id: `${country}-ROUTER`, import_country: country,
        origin_country: '*', hs_prefixes: ['851762'], base_rate: 0, source_status: 'scope_check_required',
        exact_code_overrides: [{ hs_code: 'LASTGOOD', base_rate: 0 }],
        add_on_layers: [{ type: country === 'IN' ? 'igst' : 'import_tax', rate: country === 'IN' ? 0.18 : 0.1 }] }] }));
    fs.writeFileSync(statusPath, JSON.stringify({ schema_version: 1, markets: {} }));
    const priorityCodes = CASES[country].csv.trim().split('\n').slice(1).map((line) => String(line.split(',')[0]).slice(0, 6));
    fs.writeFileSync(prioritiesPath, JSON.stringify({ priorities: priorityCodes.map((hs_code) => ({ import_country: country, hs_code })) }));
    return { country, artifactPath, manifestPath, dutyRatesPath, statusPath, prioritiesPath, code: item.code };
}

for (const country of Object.keys(CASES)) {
    test(`${country} complete official artifact publishes exact national tariff rows`, () => {
        const files = fixture(country);
        const result = importP2DutyRates({ ...files, now: new Date() });
        assert.equal(result.ok, true, result.error);
        const payload = JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8'));
        const rule = payload.rules[0];
        const exactOverride = rule.exact_code_overrides.find((row) => row.hs_code === files.code);
        assert.ok(exactOverride);
        assert.equal(exactOverride.confidence, 'Official exact tariff line');
        assert.equal(rule.add_on_layers.length, 1, 'tax layer must remain separate');
        const tariffRow = buildTariffRows(payload).find((row) => row.hsScope === files.code);
        assert.equal(tariffRow.trustLabel, 'Exact HS');
        setDutyRulesForTest(payload.rules);
        const postEntry = findDutyRule({ importCountryCode: country, originCountryCode: 'CN', hsCode: files.code });
        assert.equal(postEntry.sourceStatus, 'official_source_checked');
        if (country === 'IN') {
            assert.equal(postEntry.swsRate, 0.1);
            assert.equal(postEntry.igstRate, 0.18);
        }
        if (country === 'KR') {
            assert.equal(postEntry.preferenceRateText, '0');
            assert.equal(postEntry.preferenceRateStatus, 'separate_origin_eligibility_check_required');
        }
        setDutyRulesForTest(null);
    });
}

test('India artifact records BCD, SWS and IGST without merging tax layers into base duty', () => {
    const files = fixture('IN');
    const result = importP2DutyRates({ ...files });
    assert.equal(result.ok, true);
    const override = JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')).rules[0].exact_code_overrides
        .find((row) => row.hs_code === '85176200');
    assert.equal(override.base_rate, 0.1);
    assert.equal(override.sws_rate, 0.1);
    assert.equal(override.igst_rate, 0.18);
    assert.match(override.source_note, /SWS.*separate/i);
    assert.deepEqual(result.rate_layer_policy, { base_duty: 'BCD', separate_layers: ['SWS', 'IGST'] });
    assert.ok(Object.values(result.priority_coverage).every((entry) => entry.covered));
    const tariffRow = buildTariffRows(JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')))
        .find((row) => row.hsScope === '85176200');
    assert.equal(tariffRow.rateLayers.sws, 0.1);
    assert.equal(tariffRow.rateLayers.igst, 0.18);
});

test('Korea artifact keeps 10-digit base duty separate from FTA preference and VAT', () => {
    const files = fixture('KR');
    const result = importP2DutyRates({ ...files });
    assert.equal(result.ok, true);
    const override = JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')).rules[0].exact_code_overrides
        .find((row) => row.hs_code === '8517620000');
    assert.equal(override.base_rate, 0.08);
    assert.equal(override.preference_rate_text, '0');
    assert.equal(override.preference_rate_status, 'separate_origin_eligibility_check_required');
    assert.deepEqual(result.rate_layer_policy, {
        base_duty: 'KCS base/MFN rate',
        separate_layers: ['FTA preference', 'VAT']
    });
    assert.equal(buildTariffRows(JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8')))
        .find((row) => row.hsScope === '8517620000').rateLayers.preferenceRateText, '0');
});

test('India and Korea priority gates are driven by the maintained exact tariff queue', () => {
    assert.ok(priorityPrefixesFor('IN').includes('851770'));
    assert.ok(priorityPrefixesFor('IN').includes('854239'));
    assert.ok(priorityPrefixesFor('KR').includes('854143'));
    assert.ok(priorityPrefixesFor('KR').includes('852852'));
});

test('India and Korea imports block incomplete priority-family coverage and preserve last-good', () => {
    for (const country of ['IN', 'KR']) {
        const item = CASES[country];
        const rows = item.csv.split('\n');
        const files = fixture(country, { csv: rows.slice(0, -1).join('\n') });
        const before = fs.readFileSync(files.dutyRatesPath, 'utf8');
        const result = importP2DutyRates({ ...files });
        assert.equal(result.ok, false);
        assert.match(result.error, /priority tariff family 854231 is missing/);
        assert.equal(fs.readFileSync(files.dutyRatesPath, 'utf8'), before);
    }
});

test('P2 importer rejects wrong code length, mixed rates and incomplete artifacts while preserving last-good', () => {
    const files = fixture('KR', { csv: 'HS Code,Description,Import Rate\n85176200,Router,0%\n85176200,Router,8%' });
    const manifest = JSON.parse(fs.readFileSync(files.manifestPath, 'utf8'));
    manifest.complete = false;
    fs.writeFileSync(files.manifestPath, JSON.stringify(manifest));
    const before = fs.readFileSync(files.dutyRatesPath, 'utf8');
    const result = importP2DutyRates({ ...files });
    assert.equal(result.ok, false);
    assert.match(result.error, /complete must be true|10-digit|conflicting rates/);
    assert.equal(result.trust_gate, 'blocked_last_good_preserved');
    assert.equal(fs.readFileSync(files.dutyRatesPath, 'utf8'), before);
});

test('Admin exposes guarded P2 artifact gates including Russia/EAEU', () => {
    const payload = buildDutyRateStatusPayload();
    assert.deepEqual(Object.keys(payload.p2_official_artifact_imports.markets), ['IN', 'KR', 'VN', 'TW']);
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.match(html, /P2 official tariff artifacts/);
    assert.match(html, /IN · KR · VN · TW · RU/);
});
