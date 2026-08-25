const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    importMalaysiaDutyRates,
    parseArtifact,
    sha256
} = require('../scripts/import-my-duty-rates');
const { buildDutyRateStatusPayload } = require('../scripts/admin-server');
const { buildTariffRows } = require('../lib/tariff-watch');
const { findDutyRule, setDutyRulesForTest } = require('../lib/post-entry-value');

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-duty-import-'));
    const artifactPath = path.join(dir, 'malaysia-ahtn.csv');
    const manifestPath = path.join(dir, 'manifest.json');
    const dutyRatesPath = path.join(dir, 'duty-rates.json');
    const statusPath = path.join(dir, 'status.json');
    const csv = [
        'HS Code,Description,Import Rate',
        '8517620000,Wi-Fi router,0%',
        '8471302000,Tablet computer,0%',
        '8504409000,Charger,5%',
        '8507609000,Lithium battery,5%',
        '8525891000,Security camera,10%'
    ].join('\n');
    fs.writeFileSync(artifactPath, csv);
    fs.writeFileSync(manifestPath, JSON.stringify({
        authority: 'Royal Malaysian Customs Department',
        coverage_scope: 'full_tariff',
        source_url: 'https://ezhs.customs.gov.my/tariff-file',
        published_at: '2026-08-01',
        effective_at: '2026-08-15',
        complete: true,
        expected_rows: 5,
        sha256: sha256(Buffer.from(csv))
    }));
    fs.writeFileSync(dutyRatesPath, JSON.stringify({
        rules: [{
            id: 'MY-ELECTRONICS',
            import_country: 'MY',
            origin_country: '*',
            hs_prefixes: ['847130', '850440', '850760', '851762', '8525'],
            base_rate: 0,
            source_status: 'scope_check_required',
            exact_code_overrides: [{ hs_code: 'OLDLASTGOOD', base_rate: 0 }],
            add_on_layers: [{ type: 'sales_tax', rate: 0.1 }]
        }]
    }));
    return { dir, artifactPath, manifestPath, dutyRatesPath, statusPath };
}

test('MY importer accepts complete official CSV and covers router tablet charger battery and camera', () => {
    const files = fixture();
    const result = importMalaysiaDutyRates({ ...files, now: new Date('2026-08-25T00:00:00Z') });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.artifact.parsed_row_count, 5);
    const payload = JSON.parse(fs.readFileSync(files.dutyRatesPath, 'utf8'));
    const rule = payload.rules[0];
    assert.deepEqual(rule.exact_code_overrides.map((row) => row.hs_code), [
        '8471302000', '8504409000', '8507609000', '8517620000', '8525891000'
    ]);
    assert.deepEqual(rule.exact_code_overrides.map((row) => row.base_rate), [0, 0.05, 0.05, 0, 0.1]);
    assert.ok(rule.exact_code_overrides.every((row) => row.source_status === 'official_source_checked'));
    assert.deepEqual(rule.add_on_layers, [{ type: 'sales_tax', rate: 0.1 }], 'SST must remain a separate layer');

    const tariffWatchRow = buildTariffRows(payload).find((row) => row.importCountry === 'MY' && row.hsScope === '8517620000');
    assert.equal(tariffWatchRow.trustLabel, 'Exact HS');
    assert.equal(tariffWatchRow.baseRate, '0.0%');

    setDutyRulesForTest(payload.rules);
    const postEntryRule = findDutyRule({ importCountryCode: 'MY', originCountryCode: 'CN', hsCode: '8504409000' });
    assert.equal(postEntryRule.baseRate, 0.05);
    assert.equal(postEntryRule.sourceStatus, 'official_source_checked');
    assert.match(postEntryRule.sourceNote, /SST.*separate/i);
    setDutyRulesForTest(null);
});

test('MY importer parses full HTML split AHTN columns', () => {
    const files = fixture();
    const htmlPath = path.join(files.dir, 'tariff.html');
    fs.writeFileSync(htmlPath, '<table><tr><th>HEADER</th><th>SUB</th><th>ITEM</th><th>DESCRIPTION</th><th>IMPORT RATE</th></tr><tr><td>8517</td><td>62</td><td>0000</td><td>Router</td><td>0%</td></tr></table>');
    const rows = parseArtifact(htmlPath);
    assert.equal(rows[0].hs_code, '8517620000');
    assert.equal(rows[0].base_rate, 0);
});

test('MY importer blocks incomplete artifacts and preserves last-good duty file', () => {
    const files = fixture();
    const manifest = JSON.parse(fs.readFileSync(files.manifestPath, 'utf8'));
    manifest.complete = false;
    fs.writeFileSync(files.manifestPath, JSON.stringify(manifest));
    const before = fs.readFileSync(files.dutyRatesPath, 'utf8');
    const result = importMalaysiaDutyRates({ ...files });
    assert.equal(result.ok, false);
    assert.match(result.error, /complete must be true/);
    assert.equal(fs.readFileSync(files.dutyRatesPath, 'utf8'), before);
    assert.equal(result.trust_gate, 'blocked_last_good_preserved');
});

test('MY importer blocks conflicting exact rates and preserves prior successful last-good timestamp', () => {
    const files = fixture();
    const first = importMalaysiaDutyRates({ ...files, now: new Date('2026-08-24T00:00:00Z') });
    assert.equal(first.ok, true);
    const mixed = [
        'HS Code,Description,Import Rate',
        '8517620000,Router,0%',
        '8517620000,Router,5%'
    ].join('\n');
    fs.writeFileSync(files.artifactPath, mixed);
    fs.writeFileSync(files.manifestPath, JSON.stringify({
        authority: 'Royal Malaysian Customs Department', coverage_scope: 'full_tariff',
        source_url: 'https://ezhs.customs.gov.my/tariff-file', published_at: '2026-08-02', effective_at: '2026-08-16',
        complete: true, expected_rows: 2, sha256: sha256(Buffer.from(mixed))
    }));
    const before = fs.readFileSync(files.dutyRatesPath, 'utf8');
    const blocked = importMalaysiaDutyRates({ ...files, now: new Date('2026-08-25T00:00:00Z') });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /conflicting rates/);
    assert.equal(blocked.last_good_at, '2026-08-24T00:00:00.000Z');
    assert.equal(fs.readFileSync(files.dutyRatesPath, 'utf8'), before);
});

test('Admin exposes MY artifact trust gate without treating it as SST or approvals', () => {
    const payload = buildDutyRateStatusPayload();
    assert.equal(typeof payload.my_official_artifact_import, 'object');
    assert.ok(['not_run', 'passed', 'blocked_last_good_preserved'].includes(payload.my_official_artifact_import.trust_gate));
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.match(html, /Malaysia official tariff artifact/);
    assert.match(html, /last-good protected/);
});
