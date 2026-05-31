'use strict';

const fs = require('fs');
const path = require('path');

function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function buildCrawlSummary(rootDir = path.join(__dirname, '..')) {
    const dataDir = path.join(rootDir, 'data');
    const globalManifest = readJson(path.join(dataDir, 'global-crawl-manifest.json'), {});
    const inboxManifest = readJson(path.join(dataDir, 'inbox', 'manifest.json'), {});
    const pipelineBatch = readJson(path.join(dataDir, 'pending_data', 'pipeline_batch.json'), {});
    const guardrailReport = readJson(path.join(dataDir, 'pending_data', 'guardrail_report.json'), {});

    const publishedRoutes = Object.values(globalManifest.routes || {})
        .map((route) => ({
            route_key: route.route_key,
            tag_id: route.tag_id,
            source_id: route.source_id,
            impact_country: route.impact_country,
            industry: route.industry,
            direction: route.direction,
            published_at: route.published_at,
            updated_at: route.updated_at,
            summary_en: route.summary_en,
            source_url: route.source_url
        }))
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

    const sourceFetches = Object.values(inboxManifest.sources || {})
        .map((source) => ({
            id: source.id,
            label: source.label,
            url: source.url,
            fetched_at: source.fetched_at,
            last_changed_at: source.last_changed_at,
            byte_length: source.byte_length,
            fetched_url: source.last_fetched_url,
            relevant: source.ai_filter?.relevant === true,
            ai_method: source.ai_filter?.method || '',
            ai_industry: source.ai_filter?.industry || '',
            ai_summary_en: source.ai_filter?.summary_en || '',
            preview: source.cached_text ? String(source.cached_text).slice(0, 360) : ''
        }))
        .sort((a, b) => String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')));

    const pipelineSignals = toArray(pipelineBatch.signals)
        .map((signal) => ({
            hs_code: signal.hs_code,
            direction: signal.direction,
            country: signal.country,
            risk_level: signal.risk_level,
            source: signal.source,
            source_url: signal.source_url,
            pipeline_source: signal.pipeline_source,
            fetched_at: signal.fetched_at,
            content_en: signal.content_en,
            content_zh: signal.content_zh
        }))
        .sort((a, b) => String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')));

    return {
        ok: true,
        generated_at: new Date().toISOString(),
        global_manifest_updated_at: globalManifest.updated_at || null,
        inbox_updated_at: inboxManifest.updated_at || null,
        pipeline_run: pipelineBatch.pipeline_run || null,
        counts: {
            published_routes: publishedRoutes.length,
            source_fetches: sourceFetches.length,
            relevant_sources: sourceFetches.filter((source) => source.relevant).length,
            pipeline_signals: pipelineSignals.length,
            guardrail_passed: guardrailReport.passed_count ?? pipelineSignals.length,
            guardrail_intercepted: guardrailReport.intercepted_count ?? toArray(guardrailReport.intercepted).length
        },
        published_routes: publishedRoutes,
        source_fetches: sourceFetches,
        pipeline_signals: pipelineSignals,
        guardrail: {
            pipeline_run: guardrailReport.pipeline_run || null,
            passed_count: guardrailReport.passed_count ?? null,
            intercepted_count: guardrailReport.intercepted_count ?? null,
            intercepted: toArray(guardrailReport.intercepted).slice(0, 20)
        }
    };
}

module.exports = {
    buildCrawlSummary
};
