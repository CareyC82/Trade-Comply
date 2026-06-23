#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'automation-launch-status.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');

function readJson(filePath, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function sourceMode(sourceStatus) {
    if (sourceStatus === 'auto_updatable') {
        return {
            launch_mode: 'live_auto',
            public_launch: true,
            filing_grade_auto: true,
            label: 'Live auto',
            note: 'Official machine-readable source is connected to daily sync.'
        };
    }
    if (sourceStatus === 'hybrid_official_candidate') {
        return {
            launch_mode: 'live_hybrid',
            public_launch: true,
            filing_grade_auto: false,
            label: 'Live hybrid',
            note: 'Official-linked or maintained exact map is live; exact tariff-line scope stays gated where needed.'
        };
    }
    if (sourceStatus === 'official_link') {
        return {
            launch_mode: 'live_monitor',
            public_launch: true,
            filing_grade_auto: false,
            label: 'Live monitor',
            note: 'Official source is monitored, but exact machine-readable parsing is not live yet.'
        };
    }
    return {
        launch_mode: 'not_live',
        public_launch: false,
        filing_grade_auto: false,
        label: 'Not live',
        note: 'Do not show as automated until a source roadmap status is assigned.'
    };
}

function buildRegulatoryAutomation() {
    const { GLOBAL_CRAWL_SOURCES } = require('../lib/global-crawl-sources');
    const enabled = GLOBAL_CRAWL_SOURCES.filter(source => source.enabled !== false);
    const byCountry = new Map();

    enabled.forEach(source => {
        const country = source.country || 'GLOBAL';
        if (!byCountry.has(country)) {
            byCountry.set(country, {
                country,
                launch_mode: 'live_auto',
                public_launch: true,
                filing_grade_auto: false,
                source_count: 0,
                sources: [],
                note: 'Daily official-source crawl is enabled; AI filtering and guardrails decide whether a signal is published.'
            });
        }
        const row = byCountry.get(country);
        row.source_count += 1;
        row.sources.push({
            id: source.id,
            label: source.label || source.id,
            type: source.type,
            method: source.method,
            url: source.url
        });
    });

    return Array.from(byCountry.values()).sort((a, b) => a.country.localeCompare(b.country));
}

function buildDutyAutomation() {
    const payload = readJson(DUTY_RATE_SOURCES_PATH, { sources: [] });
    return (payload.sources || []).map(source => {
        const mode = sourceMode(source.source_status);
        return {
            country: source.country,
            name: source.name || source.country,
            source_status: source.source_status,
            machine_readable: source.machine_readable,
            maintenance_priority: source.maintenance_priority || '',
            update_command: source.update_command || '',
            probe_command: source.probe_command || '',
            official_url: source.official_url || '',
            current_scope: source.current_scope || '',
            next_action: source.next_action || '',
            ...mode
        };
    }).sort((a, b) => {
        const order = { live_auto: 0, live_hybrid: 1, live_monitor: 2, not_live: 3 };
        return (order[a.launch_mode] - order[b.launch_mode]) || String(a.country).localeCompare(String(b.country));
    });
}

function summarize(rows) {
    return rows.reduce((acc, row) => {
        const key = row.launch_mode || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function buildAutomationLaunchStatus() {
    const regulatory = buildRegulatoryAutomation();
    const duty_rates = buildDutyAutomation();
    const payload = {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        launch_policy: {
            public_launch_means: 'Feature can be exposed with its launch-mode label.',
            filing_grade_auto_means: 'Exact official machine-readable source can be used without a tariff-line parser warning.',
            guardrail: 'Hybrid and monitor modes must not be marketed as fully automatic filing-grade rates.'
        },
        summary: {
            regulatory_sources: regulatory.length,
            duty_rate_markets: duty_rates.length,
            regulatory_modes: summarize(regulatory),
            duty_rate_modes: summarize(duty_rates),
            public_launch_countries: duty_rates.filter(row => row.public_launch).map(row => row.country),
            filing_grade_auto_countries: duty_rates.filter(row => row.filing_grade_auto).map(row => row.country)
        },
        regulatory,
        duty_rates
    };
    return payload;
}

function writeAutomationLaunchStatus(filePath = OUTPUT_PATH) {
    const payload = buildAutomationLaunchStatus();
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
}

if (require.main === module) {
    const payload = writeAutomationLaunchStatus();
    console.log(JSON.stringify({
        ok: true,
        output: path.relative(ROOT, OUTPUT_PATH),
        summary: payload.summary
    }, null, 2));
}

module.exports = {
    buildAutomationLaunchStatus,
    writeAutomationLaunchStatus
};
