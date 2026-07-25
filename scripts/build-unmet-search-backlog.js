#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'reports', 'unmet-search-weekly.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'unmet-search-backlog.json');

function normalizeQuery(value = '') {
    return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function classifyCandidate(query) {
    const normalized = normalizeQuery(query);
    const hs = normalized.replace(/\D/g, '');
    return {
        input_type: hs.length >= 4 && hs.length <= 10 ? 'hs_code' : 'product',
        normalized_query: normalized,
        candidate_hs_code: hs.length >= 4 && hs.length <= 10 ? hs : '',
        recommended_actions: [
            'Confirm product attributes and intended use.',
            'Map the product to an official HS tariff line.',
            'Add or refine related_keywords and related_hs_codes.',
            'Attach an official regulatory source before publishing a rule.'
        ]
    };
}

function buildBacklog(summary = {}, existing = { items: [] }) {
    const previous = new Map((existing.items || []).map((item) => [item.normalized_query, item]));
    const candidates = [
        ...(summary.top_in_scope_gap_products || []).map((row) => ({ ...row, gap_type: 'no_match', weight: 3 })),
        ...(summary.top_weak_match_queries || []).map((row) => ({ ...row, gap_type: 'weak_match', weight: 1 }))
    ];
    const merged = new Map();
    candidates.forEach((candidate) => {
        const classified = classifyCandidate(candidate.product_query);
        const current = merged.get(classified.normalized_query) || {
            ...classified,
            product_query: candidate.product_query,
            count: 0,
            priority_score: 0,
            gap_types: new Set(),
            views: new Set(),
            latest_submitted_at: candidate.latest_submitted_at || null
        };
        current.count += Number(candidate.count || 0);
        current.priority_score += Number(candidate.count || 0) * candidate.weight;
        current.gap_types.add(candidate.gap_type);
        (candidate.views || []).forEach((view) => current.views.add(view));
        merged.set(classified.normalized_query, current);
    });
    const items = [...merged.values()].map((item) => {
        const old = previous.get(item.normalized_query);
        return {
            ...item,
            gap_types: [...item.gap_types].sort(),
            views: [...item.views].sort(),
            status: old?.status || 'research_pending',
            owner_note: old?.owner_note || ''
        };
    }).sort((a, b) => b.priority_score - a.priority_score || b.count - a.count);
    return {
        schema_version: '1.0',
        generated_at: summary.generated_at || new Date().toISOString(),
        period: summary.period || null,
        source: 'automatic_search_gap_events',
        item_count: items.length,
        items
    };
}

function main() {
    const input = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
    const output = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT;
    const summary = JSON.parse(fs.readFileSync(input, 'utf8'));
    const existing = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : { items: [] };
    const backlog = buildBacklog(summary, existing);
    fs.writeFileSync(output, `${JSON.stringify(backlog, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, output: path.relative(ROOT, output), item_count: backlog.item_count }, null, 2));
}

if (require.main === module) main();

module.exports = { normalizeQuery, classifyCandidate, buildBacklog };
