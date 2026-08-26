#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { enrichChanges } = require('../lib/regulatory-change-review');

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'consumer-regulatory-changes.json');
const OUTPUT = path.join(ROOT, 'data', 'regulatory-route-impact.json');

function buildRegulatoryRouteImpact(payload = {}) {
    const pending = (payload.changes || []).filter((change) => change.review_status === 'pending_review');
    const enriched = enrichChanges({ changes: pending }).changes;
    return {
        schema_version: 1,
        generated_at: payload.generated_at || new Date().toISOString(),
        source_change_count: pending.length,
        impacts: enriched.map((change) => ({
            id: change.id,
            type: change.type,
            detected_at: change.detected_at || null,
            review_status: change.review_status,
            markets: change.impact.markets,
            products: change.impact.products,
            candidate_hs: change.impact.candidate_hs,
            affected_routes: change.impact.affected_routes,
            effective_date: change.impact.effective_date,
            effective_timing: change.impact.effective_timing,
            conclusion_delta: change.impact.conclusion_delta,
            auto_publish: false
        }))
    };
}

function main() {
    const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
    const result = buildRegulatoryRouteImpact(payload);
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, output: path.relative(ROOT, OUTPUT), impacts: result.impacts.length }, null, 2));
}

if (require.main === module) main();
module.exports = { buildRegulatoryRouteImpact };
