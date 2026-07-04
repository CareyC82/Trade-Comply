#!/usr/bin/env node
'use strict';

const tags = require('../data/tags.json');
const cases = require('../data/cases.json');
const highFrequencySamples = require('../data/high-frequency-product-samples.json');
const fs = require('node:fs');
const path = require('node:path');
const country = require('../lib/trade-country');
const matchedResults = require('../lib/matched-results');
const {
    prepareIntelligentSearch
} = require('../lib/product-intelligence');
const {
    getProductRelevanceTerms,
    getTagSemanticDedupeKey,
    tagMatchesProductTerms,
    search,
    searchWithPrecheck
} = require('../js/search');

const PRECHECK_FACTORS = {
    wireless: { label: 'Wireless', keywords: ['wireless', 'wifi', 'radio', 'telecom'], nextChecks: [], signals: [], risk: 'medium' },
    battery: { label: 'Battery', keywords: ['battery', 'lithium', 'UN38.3', 'dangerous goods'], nextChecks: [], signals: [], risk: 'medium' },
    encryption: { label: 'Encryption', keywords: ['encryption', 'dual-use', 'secure module'], nextChecks: [], signals: [], risk: 'high' },
    uav: { label: 'UAV', keywords: ['drone', 'uav', 'dual-use', 'end use'], nextChecks: [], signals: [], risk: 'high' },
    semiconductor: { label: 'Semiconductor', keywords: ['chip', 'semiconductor', 'integrated circuit'], nextChecks: [], signals: [], risk: 'high' },
    advanced_manufacturing: { label: 'Advanced manufacturing', keywords: ['semiconductor equipment', 'foundry', 'dual-use'], nextChecks: [], signals: [], risk: 'high' },
    ai_chip: { label: 'AI chip', keywords: ['ai chip', 'gpu', 'accelerator', 'advanced computing'], nextChecks: [], signals: [], risk: 'high' },
    destination_end_use: { label: 'End use', keywords: ['end use', 'end user', 'restricted party'], nextChecks: [], signals: [], risk: 'high' },
    export_control: { label: 'Export control', keywords: ['export control', 'license requirements', 'dual-use'], nextChecks: [], signals: [], risk: 'high' }
};

const DEFAULT_SAMPLES = highFrequencySamples.samples;

function setupSearchState(route) {
    const routeContext = country.getRouteContext(route);
    globalThis.AppState = {
        data: { tags, cases },
        currentDirection: routeContext.direction,
        currentCountry: routeContext.country,
        routeFromCountry: routeContext.from,
        routeToCountry: routeContext.to,
        complianceFocus: routeContext.focus
    };
    globalThis.TradeComplyCountry = country;
    globalThis.TradeComplyMatchedResults = matchedResults;
    globalThis.PRECHECK_FACTORS = PRECHECK_FACTORS;
    return routeContext;
}

function summarizeTag(tag) {
    return {
        id: tag.tag_id,
        country: country.getTagCountry(tag),
        focus: tag.route_focus || tag.compliance_focus || '',
        risk: tag.risk_level || '',
        title: tag.short_name || tag.title || ''
    };
}

function duplicateIds(items, getId) {
    const seen = new Set();
    const duplicates = new Set();
    (items || []).forEach((item) => {
        const id = getId(item);
        if (!id) return;
        if (seen.has(id)) {
            duplicates.add(id);
        }
        seen.add(id);
    });
    return [...duplicates];
}

function duplicateSemanticTagKeys(tags) {
    const seen = new Map();
    const duplicates = [];
    (tags || []).forEach((tag) => {
        const key = getTagSemanticDedupeKey(tag);
        if (!key) return;
        if (seen.has(key)) {
            duplicates.push({
                key,
                first: seen.get(key),
                duplicate: tag.tag_id
            });
            return;
        }
        seen.set(key, tag.tag_id);
    });
    return duplicates;
}

function auditSample(sample) {
    const routeContext = setupSearchState(sample);
    const intelligence = prepareIntelligentSearch(sample.query, [], PRECHECK_FACTORS, {
        ...routeContext,
        vertical: sample.vertical
    });
    const results = searchWithPrecheck(
        intelligence.expandedQuery,
        intelligence.selections,
        search,
        intelligence.originalQuery
    );
    const coverage = country.analyzeCountryCoverage(
        results.tags,
        routeContext.country,
        routeContext.direction
    );
    const productTerms = getProductRelevanceTerms(intelligence.originalQuery);
    const offRouteTags = results.tags.filter((tag) => !country.countryMatchesSelection(tag, routeContext.country, routeContext));
    const focusMismatchTags = results.tags.filter((tag) => {
        const focus = tag.route_focus || tag.compliance_focus || '';
        return focus && focus !== routeContext.focus;
    });
    const productNoiseTags = productTerms.length
        ? results.tags.filter((tag) => !tagMatchesProductTerms(tag, productTerms))
        : [];
    const duplicateTagIds = duplicateIds(results.tags, (tag) => tag.tag_id);
    const duplicateCaseIds = duplicateIds(results.cases, (caseItem) => caseItem.case_id);
    const duplicatePolicySignals = duplicateSemanticTagKeys(results.tags);
    const queryLower = String(sample.query || '').toLowerCase();
    const hasDroneIntent = /\b(drone|uav|uas|quadcopter)\b/.test(queryLower);
    const droneCategoryTags = results.tags.filter((tag) => {
        const label = `${tag.category_label || ''} ${tag.short_name || ''} ${tag.short_description || ''}`.toLowerCase();
        return /\b(drone|uav|uas|unmanned aircraft)\b/.test(label);
    });

    const failures = [];
    const warnings = [];
    if (results.tags.length === 0) {
        failures.push('NO_MATCHED_RULES');
    }
    if (offRouteTags.length > 0) {
        failures.push('COUNTRY_ROUTE_MISMATCH');
    }
    if (focusMismatchTags.length > 0) {
        failures.push('FOCUS_MISMATCH');
    }
    if (duplicateTagIds.length > 0 || duplicateCaseIds.length > 0 || duplicatePolicySignals.length > 0) {
        failures.push('DUPLICATE_RESULTS');
    }
    if (productNoiseTags.length > 0) {
        warnings.push('PRODUCT_RELEVANCE_WEAK');
    }
    if (coverage.exactCount === 0 && results.tags.length > 0) {
        warnings.push('BASELINE_ONLY');
    }
    if (results.tags.length > 12) {
        warnings.push('TOO_MANY_RULES');
    }
    if (sample.expected_top_rule && results.tags[0]?.tag_id !== sample.expected_top_rule) {
        failures.push('TOP_RULE_MISMATCH');
    }
    if (typeof sample.expected_min_rules === 'number' && results.tags.length < sample.expected_min_rules) {
        failures.push('MIN_RULES_NOT_MET');
    }
    if (typeof sample.expected_min_exact_rules === 'number' && coverage.exactCount < sample.expected_min_exact_rules) {
        failures.push('MIN_EXACT_RULES_NOT_MET');
    }
    if (typeof sample.expected_min_cases === 'number' && results.cases.length < sample.expected_min_cases) {
        failures.push('MIN_CASES_NOT_MET');
    }
    (sample.expected_inferred_selections || []).forEach((selection) => {
        if (!intelligence.inferredSelections.some(item => item.id === selection)) {
            failures.push(`MISSING_INFERRED_${String(selection).toUpperCase()}`);
        }
    });
    if (!hasDroneIntent && droneCategoryTags.length > 0) {
        failures.push('PRODUCT_FAMILY_MISMATCH');
    }

    return {
        id: sample.id,
        query: sample.query,
        expectedTopRule: sample.expected_top_rule || '',
        expectedMinimums: {
            rules: sample.expected_min_rules || null,
            exactRules: sample.expected_min_exact_rules || null,
            cases: sample.expected_min_cases || null,
            inferredSelections: sample.expected_inferred_selections || []
        },
        route: routeContext,
        expandedQuery: intelligence.expandedQuery,
        inferredSelections: intelligence.inferredSelections.map((item) => item.id),
        counts: {
            rules: results.tags.length,
            cases: results.cases.length,
            exactRules: coverage.exactCount,
            baselineRules: coverage.baselineCount
        },
        topRules: results.tags.slice(0, 5).map(summarizeTag),
        issues: {
            failures,
            warnings,
            offRouteTags: offRouteTags.map(summarizeTag),
            focusMismatchTags: focusMismatchTags.map(summarizeTag),
            duplicateTagIds,
            duplicateCaseIds,
            duplicatePolicySignals,
            productFamilyMismatchTags: hasDroneIntent ? [] : droneCategoryTags.map(summarizeTag),
            productNoiseTags: productNoiseTags.slice(0, 5).map(summarizeTag)
        }
    };
}

function runQualityAudit(samples = DEFAULT_SAMPLES) {
    const results = samples.map(auditSample);
    const failed = results.filter((item) => item.issues.failures.length > 0);
    const warned = results.filter((item) => item.issues.warnings.length > 0);
    return {
        ok: failed.length === 0,
        summary: {
            samples: results.length,
            failed: failed.length,
            warned: warned.length
        },
        results
    };
}

function formatAuditReport(report) {
    const lines = [];
    lines.push('TraceWize Search Quality Audit');
    lines.push(`Samples: ${report.summary.samples} | Failed: ${report.summary.failed} | Warned: ${report.summary.warned}`);
    lines.push('');
    report.results.forEach((item) => {
        const status = item.issues.failures.length ? 'FAIL' : item.issues.warnings.length ? 'WARN' : 'PASS';
        lines.push(`[${status}] ${item.id}`);
        lines.push(`  Route: ${item.route.from} -> ${item.route.to} (${item.route.focus}) | target=${item.route.country}`);
        lines.push(`  Query: ${item.query}`);
        lines.push(`  Rules: ${item.counts.rules} (${item.counts.exactRules} exact, ${item.counts.baselineRules} baseline) | Cases: ${item.counts.cases}`);
        if (item.inferredSelections.length) {
            lines.push(`  AI selections: ${item.inferredSelections.join(', ')}`);
        }
        if (item.issues.failures.length) {
            lines.push(`  Failures: ${item.issues.failures.join(', ')}`);
        }
        if (item.issues.warnings.length) {
            lines.push(`  Warnings: ${item.issues.warnings.join(', ')}`);
        }
        if (item.topRules.length) {
            lines.push(`  Top rules: ${item.topRules.map((rule) => rule.id).join(', ')}`);
        }
    });
    return lines.join('\n');
}

function formatAuditMarkdown(report) {
    const lines = [];
    lines.push('# TraceWize Search Quality Audit');
    lines.push('');
    lines.push(`- Samples: ${report.summary.samples}`);
    lines.push(`- Failed: ${report.summary.failed}`);
    lines.push(`- Warned: ${report.summary.warned}`);
    lines.push(`- Status: ${report.ok ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push('| Status | Sample | Route | Focus | Target | Rules | Cases | Issues | Top rules |');
    lines.push('| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |');
    report.results.forEach((item) => {
        const status = item.issues.failures.length ? 'FAIL' : item.issues.warnings.length ? 'WARN' : 'PASS';
        const issues = [...item.issues.failures, ...item.issues.warnings].join(', ') || '-';
        const topRules = item.topRules.map((rule) => rule.id).join(', ') || '-';
        lines.push([
            status,
            item.id,
            `${item.route.from} -> ${item.route.to}`,
            item.route.focus,
            item.route.country,
            `${item.counts.rules} (${item.counts.exactRules} exact / ${item.counts.baselineRules} baseline)`,
            item.counts.cases,
            issues,
            topRules
        ].map((cell) => String(cell).replace(/\|/g, '\\|')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    });
    lines.push('');
    lines.push('## Sample Details');
    report.results.forEach((item) => {
        const status = item.issues.failures.length ? 'FAIL' : item.issues.warnings.length ? 'WARN' : 'PASS';
        lines.push('');
        lines.push(`### ${status} ${item.id}`);
        lines.push('');
        lines.push(`- Route: ${item.route.from} -> ${item.route.to} (${item.route.focus})`);
        lines.push(`- Target market: ${item.route.country}`);
        lines.push(`- Query: ${item.query}`);
        lines.push(`- Expanded query: ${item.expandedQuery}`);
        lines.push(`- Rules: ${item.counts.rules} (${item.counts.exactRules} exact, ${item.counts.baselineRules} baseline)`);
        lines.push(`- Cases: ${item.counts.cases}`);
        if (item.inferredSelections.length) {
            lines.push(`- AI selections: ${item.inferredSelections.join(', ')}`);
        }
        lines.push(`- Issues: ${[...item.issues.failures, ...item.issues.warnings].join(', ') || 'none'}`);
        if (item.topRules.length) {
            lines.push('- Top rules:');
            item.topRules.forEach((rule) => {
                lines.push(`  - ${rule.id} · ${rule.country} · ${rule.risk || 'n/a'} · ${rule.title || 'Untitled'}`);
            });
        }
    });
    lines.push('');
    return lines.join('\n');
}

function writeAuditReport(report, outputDir = path.join(__dirname, '..', 'reports')) {
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, 'search-quality-latest.json');
    const markdownPath = path.join(outputDir, 'search-quality-latest.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, formatAuditMarkdown(report));
    return { jsonPath, markdownPath };
}

if (require.main === module) {
    const report = runQualityAudit();
    const wantsJson = process.argv.includes('--json');
    const wantsReport = process.argv.includes('--write-report');
    if (wantsReport) {
        const written = writeAuditReport(report);
        console.log(`Wrote ${written.markdownPath}`);
        console.log(`Wrote ${written.jsonPath}`);
    }
    if (wantsJson) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(formatAuditReport(report));
    }
    process.exit(report.ok ? 0 : 1);
}

module.exports = {
    DEFAULT_SAMPLES,
    PRECHECK_FACTORS,
    auditSample,
    duplicateSemanticTagKeys,
    runQualityAudit,
    formatAuditReport,
    formatAuditMarkdown,
    writeAuditReport
};
