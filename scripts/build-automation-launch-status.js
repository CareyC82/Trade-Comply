#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'automation-launch-status.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const GLOBAL_CRAWL_HEALTH_PATH = path.join(ROOT, 'data', 'global-crawl-source-health.json');
const INBOX_MANIFEST_PATH = path.join(ROOT, 'data', 'inbox', 'manifest.json');

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

function sourceManifestKey(source) {
    if (source?.legacy_profile === 'cn-gac') {
        return 'gac-customs-notices';
    }
    if (source?.id === 'zh-mofcom') {
        return 'mofcom-export-control';
    }
    return source?.id || '';
}

function buildHealthLookup() {
    const healthPayload = readJson(GLOBAL_CRAWL_HEALTH_PATH, { sources: [] });
    const inboxPayload = readJson(INBOX_MANIFEST_PATH, { sources: {} });
    const healthById = new Map((healthPayload.sources || []).map(source => [source.id, source]));
    const inboxSources = inboxPayload.sources || {};

    return {
        health_updated_at: healthPayload.generated_at || null,
        inbox_updated_at: inboxPayload.updated_at || null,
        byId: healthById,
        inboxSources
    };
}

function sourceHealthStatus(source, lookup) {
    if (source?.monitor_only) {
        return {
            health_status: 'official_link_monitor',
            last_fetch_at: null,
            byte_length: 0,
            error: '',
            transport: 'official-link-monitor',
            fetched_url: source.url || '',
            monitor_only: true
        };
    }
    const live = lookup.byId.get(source.id);
    const inbox = lookup.inboxSources[sourceManifestKey(source)];
    if (live) {
        return {
            health_status: live.ok ? 'fetch_ok' : (live.optional ? 'optional_issue' : 'fetch_issue'),
            last_fetch_at: live.fetched_at || null,
            byte_length: live.byte_length || 0,
            error: live.error || '',
            transport: live.transport || live.method || '',
            fetched_url: live.fetched_url || '',
            monitor_only: Boolean(live.monitor_only)
        };
    }
    if (inbox?.fetched_at) {
        return {
            health_status: 'cached_ok',
            last_fetch_at: inbox.fetched_at,
            byte_length: inbox.byte_length || 0,
            error: '',
            transport: 'cached',
            fetched_url: inbox.last_fetched_url || inbox.url || ''
        };
    }
    return {
        health_status: 'pending_first_run',
        last_fetch_at: null,
        byte_length: 0,
        error: '',
        transport: '',
        fetched_url: ''
    };
}

function summarizeRegulatoryHealth(sources) {
    const counts = sources.reduce((acc, source) => {
        const status = source.health_status || 'pending_first_run';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    const blockingIssueCount = counts.fetch_issue || 0;
    const okCount = (counts.fetch_ok || 0) + (counts.cached_ok || 0);
    const monitorCount = counts.official_link_monitor || 0;
    const optionalIssueCount = counts.optional_issue || 0;
    let grade = 'pending';
    if (blockingIssueCount > 0) {
        grade = okCount > 0 ? 'partial' : 'blocked';
    } else if (monitorCount === sources.length && sources.length > 0) {
        grade = 'monitor';
    } else if ((okCount + monitorCount + optionalIssueCount) === sources.length && okCount > 0) {
        grade = 'healthy';
    }
    return {
        grade,
        counts
    };
}

function regulatoryModeFromHealth(grade) {
    if (grade === 'healthy') {
        return {
            launch_mode: 'live_auto',
            public_launch: true,
            marketing_recommendation: 'Ready to market',
            note_suffix: ' Source fetch health is currently healthy.'
        };
    }
    if (grade === 'partial') {
        return {
            launch_mode: 'live_monitor',
            public_launch: true,
            marketing_recommendation: 'Use with source caveat',
            note_suffix: ' Some sources are reachable; review source exceptions before relying on this market.'
        };
    }
    if (grade === 'blocked') {
        return {
            launch_mode: 'not_live',
            public_launch: false,
            marketing_recommendation: 'Do not market as automated yet',
            note_suffix: ' Source fetch is currently blocked; keep this market out of automated claims until a stable source is connected.'
        };
    }
    if (grade === 'monitor') {
        return {
            launch_mode: 'live_monitor',
            public_launch: true,
            marketing_recommendation: 'Use with source caveat',
            note_suffix: ' Official link monitoring is configured, but no stable automated text source is connected yet.'
        };
    }
    return {
        launch_mode: 'live_monitor',
        public_launch: true,
        marketing_recommendation: 'Use with source caveat',
        note_suffix: ' Source fetch health is pending the first live check.'
    };
}

function buildRegulatoryAutomation() {
    const { GLOBAL_CRAWL_SOURCES } = require('../lib/global-crawl-sources');
    const enabled = GLOBAL_CRAWL_SOURCES.filter(source => source.enabled !== false);
    const healthLookup = buildHealthLookup();
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
                source_health_grade: 'pending',
                source_health_counts: {},
                sources: [],
                note: 'Daily official-source crawl is enabled; AI filtering and guardrails decide whether a signal is published.'
            });
        }
        const row = byCountry.get(country);
        const health = sourceHealthStatus(source, healthLookup);
        row.source_count += 1;
        row.sources.push({
            id: source.id,
            label: source.label || source.id,
            type: source.type,
            method: source.method,
            url: source.url,
            ...health
        });
    });

    return Array.from(byCountry.values()).map((row) => {
        const summary = summarizeRegulatoryHealth(row.sources);
        const mode = regulatoryModeFromHealth(summary.grade);
        return {
            ...row,
            launch_mode: mode.launch_mode,
            public_launch: mode.public_launch,
            marketing_recommendation: mode.marketing_recommendation,
            source_health_grade: summary.grade,
            source_health_counts: summary.counts,
            health_updated_at: healthLookup.health_updated_at,
            inbox_updated_at: healthLookup.inbox_updated_at,
            note: `${row.note}${mode.note_suffix}`
        };
    }).sort((a, b) => a.country.localeCompare(b.country));
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

function summarizeRegulatoryMarketing(rows) {
    return rows.reduce((acc, row) => {
        if (row.marketing_recommendation === 'Ready to market') {
            acc.ready_to_market += 1;
        } else if (row.marketing_recommendation === 'Do not market as automated yet') {
            acc.do_not_market += 1;
        } else {
            acc.source_caveat += 1;
        }
        return acc;
    }, {
        ready_to_market: 0,
        source_caveat: 0,
        do_not_market: 0
    });
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
            regulatory_health: regulatory.reduce((acc, row) => {
                const key = row.source_health_grade || 'pending';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {}),
            regulatory_marketing: summarizeRegulatoryMarketing(regulatory),
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
