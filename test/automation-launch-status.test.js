const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    buildAutomationLaunchStatus
} = require('../scripts/build-automation-launch-status');
const {
    buildDutyRateStatusPayload
} = require('../scripts/admin-server');

test('automation launch status exposes only safe public launch modes', () => {
    const payload = buildAutomationLaunchStatus();

    assert.equal(payload.summary.regulatory_sources, 8);
    assert.deepEqual(payload.regulatory.map(row => row.country), ['CN', 'EU', 'IN', 'JP', 'KR', 'MX', 'SG', 'US']);
    assert.equal(payload.summary.regulatory_modes.live_auto, 6);
    assert.equal(payload.summary.regulatory_modes.live_monitor, 1);
    assert.equal(payload.summary.regulatory_modes.not_live, 1);
    assert.equal(payload.summary.regulatory_health.healthy, 6);
    assert.equal(payload.summary.regulatory_health.partial, 1);
    assert.equal(payload.summary.regulatory_health.blocked, 1);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(payload.regulatory.every(row => row.source_health_grade), true);
    assert.equal(payload.regulatory.every(row => typeof row.source_health_counts === 'object'), true);
    assert.equal(payload.regulatory.every(row => row.sources.every(source => source.health_status)), true);
    const regulatoryByCountry = Object.fromEntries(payload.regulatory.map(row => [row.country, row]));
    assert.equal(regulatoryByCountry.US.launch_mode, 'live_monitor');
    assert.equal(regulatoryByCountry.US.source_health_grade, 'partial');
    assert.equal(regulatoryByCountry.MX.launch_mode, 'not_live');
    assert.equal(regulatoryByCountry.MX.public_launch, false);

    assert.equal(payload.summary.duty_rate_markets, 14);
    assert.equal(payload.summary.duty_rate_modes.live_auto, 1);
    assert.equal(payload.summary.duty_rate_modes.live_hybrid, 12);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 1);
    assert.deepEqual(payload.summary.filing_grade_auto_countries, ['US']);

    const byCountry = Object.fromEntries(payload.duty_rates.map(row => [row.country, row]));
    assert.equal(byCountry.US.launch_mode, 'live_auto');
    assert.equal(byCountry.EU.launch_mode, 'live_hybrid');
    assert.equal(byCountry.DE.launch_mode, 'live_hybrid');
    assert.equal(byCountry.NL.launch_mode, 'live_hybrid');
    assert.equal(byCountry.RU.launch_mode, 'live_monitor');
    assert.equal(byCountry.RU.filing_grade_auto, false);
    assert.equal(payload.duty_rates.every(row => row.public_launch), true);
});

test('checked-in automation launch status is fresh enough for admin display', () => {
    const filePath = path.join(__dirname, '..', 'data', 'automation-launch-status.json');
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.equal(payload.schema_version, 1);
    assert.equal(payload.summary.duty_rate_markets, 14);
    assert.equal(payload.summary.regulatory_sources, 8);
    assert.equal(typeof payload.summary.regulatory_health, 'object');
    assert.equal(payload.summary.regulatory_health.healthy, 6);
    assert.equal(payload.summary.duty_rate_modes.live_monitor, 1);
});

test('admin duty-rate status includes automation launch board payload', () => {
    const payload = buildDutyRateStatusPayload();

    assert.equal(payload.ok, true, JSON.stringify(payload.failures, null, 2));
    assert.equal(payload.automation_launch_status.summary.duty_rate_markets, 14);
    assert.equal(payload.automation_launch_status.summary.regulatory_sources, 8);
    assert.equal(typeof payload.automation_launch_status.summary.regulatory_health, 'object');
    assert.equal(
        payload.automation_launch_status.duty_rates.some(row => row.country === 'US' && row.launch_mode === 'live_auto'),
        true
    );
});
