'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildTariffWatchModel,
    buildRouteTariffAlert,
    buildTariffRows,
    buildCurrentTariffRows,
    buildMarketCoverageRows
} = require('../lib/tariff-watch');

const rootDir = path.join(__dirname, '..');

function readFile(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
    return JSON.parse(readFile(relativePath));
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

test('tariff watch model separates material rate changes from source/parser updates', () => {
    const status = readJson('data/duty-rate-sync-status.json');
    const dutyRates = readJson('data/duty-rates.json');
    const model = buildTariffWatchModel({ syncStatus: status, dutyRates, limit: 6 });

    assert.equal(model.rateChanges, status.counts.total_rate_changes);
    assert.equal(model.sourceUpdates, status.counts.total_changes);
    assert.match(model.headline, /No material duty-rate change|material tariff/i);
    assert.ok(model.metrics.some((metric) => metric.label === "Today's rate changes"));
    assert.ok(model.metrics.some((metric) => metric.label === 'Impacted routes'));
    assert.ok(model.metrics.some((metric) => metric.label === 'Action needed'));
    assert.ok(model.watchItems.length > 0);
    assert.ok(model.watchItems.every((item) => item.changeType && item.impact));
    assert.ok(model.automationActions.length > 0);
    assert.ok(model.automationActions.every((item) => item.country && item.nextAction));
    assert.ok(model.currentTariffRows.length > 0);
    assert.ok(model.marketTariffRows.length >= model.currentTariffRows.length);
    assert.ok(model.marketCoverageRows.length > 0);
});

test('tariff watch summarizes current maintained tariff rates for users', () => {
    const dutyRates = readJson('data/duty-rates.json');
    const tariffRows = buildCurrentTariffRows(dutyRates, 12);
    const coverageRows = buildMarketCoverageRows(dutyRates);

    assert.ok(tariffRows.length > 0);
    assert.ok(tariffRows.some((row) => row.importMarket === 'United States'));
    assert.ok(tariffRows.every((row) => row.baseRate && row.addOnRate && row.totalRate));
    assert.ok(tariffRows.every((row) => row.productGroup && row.trustLabel && row.trustTone));
    assert.ok(coverageRows.some((row) => row.country === 'China'));
    assert.ok(coverageRows.every((row) => row.rules > 0 && row.hsCoverage > 0));
    assert.ok(coverageRows.every((row) => row.coverageLabel && row.useCase && row.nextAction));
    assert.ok(coverageRows.every((row) => row.sourceMix && Number.isInteger(row.sourceMix.exact)));
});

test('tariff watch expands exact HS overrides in market detail rows', () => {
    const dutyRates = readJson('data/duty-rates.json');
    const tariffRows = buildTariffRows(dutyRates);
    const chinaRows = tariffRows.filter((row) => row.marketKey === 'CN');
    const chinaCoverage = buildMarketCoverageRows(dutyRates).find((row) => row.marketKey === 'CN');
    const russiaRows = tariffRows.filter((row) => row.marketKey === 'RU');

    assert.ok(chinaRows.length > 3);
    assert.ok(chinaRows.some((row) => row.hsScope === '854231'));
    assert.equal(chinaCoverage.rules, chinaRows.length);
    assert.ok(russiaRows.length > 1);
    assert.ok(russiaRows.some((row) => row.hsScope === '854231'));
    assert.ok(russiaRows.some((row) => row.hsScope === '950450'));
});

test('tariff watch keeps gaming device HS coverage across maintained markets', () => {
    const dutyRates = readJson('data/duty-rates.json');
    const tariffRows = buildTariffRows(dutyRates);
    const tags = readJson('data/tags.json');
    const cases = readJson('data/cases.json');
    const maintainedMarkets = ['CN', 'US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'RU', 'TW', 'JP', 'KR', 'IN'];

    maintainedMarkets.forEach((marketKey) => {
        assert.ok(
            tariffRows.some((row) => row.marketKey === marketKey && row.hsScope === '950450'),
            `${marketKey} should cover gaming HS 950450`
        );
    });
    assert.ok(tags.some((tag) => tag.tag_id === 'CL-GAMING-001'));
    assert.ok(cases.some((row) => row.case_id === 'CASE-GAMING-GLOBAL-BASELINE'));
});

test('tariff watch priority HS coverage has no maintained market gaps', () => {
    const dutyRates = readJson('data/duty-rates.json');
    const maintainedMarkets = ['CN', 'US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'RU', 'TW', 'JP', 'KR', 'IN'];
    const priorityHs = [
        '847130',
        '847150',
        '850440',
        '850760',
        '851713',
        '851762',
        '852580',
        '852589',
        '852852',
        '854143',
        '854231',
        '854232',
        '854239',
        '847950',
        '901890',
        '902750',
        '950450'
    ];
    const matchesHs = (rule, hs) => {
        const normalizedHs = hs.replace(/\./g, '');
        return [
            ...asArray(rule.hs_prefixes),
            ...asArray(rule.exact_code_overrides).map((override) => override.hs_code)
        ].some((candidate) => {
            const normalizedCandidate = String(candidate || '').replace(/\./g, '');
            return normalizedHs.startsWith(normalizedCandidate) || normalizedCandidate.startsWith(normalizedHs);
        });
    };

    maintainedMarkets.forEach((marketKey) => {
        const marketRules = asArray(dutyRates.rules).filter((rule) => rule.import_country === marketKey);
        priorityHs.forEach((hs) => {
            assert.ok(
                marketRules.some((rule) => matchesHs(rule, hs)),
                `${marketKey} should cover priority HS ${hs}`
            );
        });
    });
});

test('route tariff alert uses country-specific watch context when no rate changed', () => {
    const status = readJson('data/duty-rate-sync-status.json');
    const alert = buildRouteTariffAlert(status, {
        from: 'CN',
        to: 'US',
        focus: 'import'
    });

    assert.match(alert.title, /Tariff Watch/);
    assert.match(alert.href, /tariff-watch\.html/);
    assert.doesNotMatch(alert.title, /undefined/);
});

test('tariff watch is exposed in primary navigation and result alerts', () => {
    [
        'index.html',
        'hscode.html',
        'post-entry.html',
        'post-entry-result.html',
        'opportunity.html',
        'electronics.html',
        'new-energy.html',
        'semiconductor.html',
        'data-center.html',
        'industrial-automation.html',
        'healthcare-lab.html',
        'tariff-watch.html'
    ].forEach((file) => {
        const html = readFile(file);
        assert.match(html, /nav-tariff-watch/, `${file} should expose nav-tariff-watch`);
        if (file !== 'tariff-watch.html') {
            assert.match(html, /tariff-watch\.html/, `${file} should link to Tariff Watch`);
        } else {
            assert.match(html, /aria-current="page">📈 Tariff Watch/, `${file} should mark Tariff Watch active`);
        }
    });

    assert.match(readFile('index.html'), /tariff-watch-alert-container/);
    assert.match(readFile('js/render-results.js'), /mountTariffWatchAlert/);
    assert.match(readFile('js/main.js'), /data-app="index\|hscode\|category\|post-entry\|opportunity\|tariff-watch"/);
    assert.match(readFile('js/tariff-watch-page.js'), /Coverage by market/);
    assert.match(readFile('js/tariff-watch-page.js'), /tariff-watch\.html\?market=/);
    assert.match(readFile('js/tariff-watch-page.js'), /Back to market coverage/);
    assert.match(readFile('js/tariff-watch-page.js'), /How to read tariff coverage/);
    assert.match(readFile('js/tariff-watch-page.js'), /Exact HS lines/);
    assert.match(readFile('js/tariff-watch-page.js'), /How to use this tariff market/);
    assert.match(readFile('js/tariff-watch-page.js'), /Before filing/);
    assert.match(readFile('js/tariff-watch-page.js'), /Market tariff coverage summary/);
    assert.match(readFile('js/tariff-watch-page.js'), /Coverage upgrade next/);
    assert.match(readFile('js/tariff-watch-page.js'), /Market tariff signal list/);
    assert.match(readFile('js/tariff-watch-page.js'), /Source trust/);
    assert.match(readFile('js/tariff-watch-page.js'), /Automation action list/);
    assert.match(readFile('js/tariff-watch-page.js'), /Exact HS lines/);
    assert.match(readFile('js/tariff-watch-page.js'), /Highest signal/);
    assert.match(readFile('js/tariff-watch-page.js'), /const introHtml = selectedMarket \? ''/);
    assert.match(readFile('js/tariff-watch-page.js'), /const adminHtml = selectedMarket \? ''/);
    assert.match(readFile('js/tariff-watch-page.js'), /data-market/);
    assert.match(readFile('js/tariff-watch-page.js'), /Origin:/);
    assert.doesNotMatch(readFile('js/tariff-watch-page.js'), /aria-live="polite"/);
    assert.doesNotMatch(readFile('js/tariff-watch-page.js'), /Current tariff snapshot/);
    assert.doesNotMatch(readFile('js/tariff-watch-page.js'), /Route change radar/);
});
