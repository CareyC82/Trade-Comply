'use strict';

const fs = require('node:fs');
const path = require('node:path');
const models = require('../lib/wearable-product-models');
const { buildSnapshot } = require('../lib/regulatory-source-monitor');
const { parseOfficialPayload } = require('../lib/official-regulatory-source-adapters');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'consumer-regulatory-snapshots.json');
const CHANGES_PATH = path.join(ROOT, 'data', 'consumer-regulatory-changes.json');

async function fetchOfficial(source) {
    try {
        const response = await fetch(source.url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'TraceWize-Regulatory-Monitor/1.0' } });
        if (!response.ok) return { ok: false, error: `http_${response.status}` };
        const parsed = parseOfficialPayload({ source, body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || '' });
        return parsed.ok ? parsed : { ok: false, error: parsed.error, adapter: parsed.adapter };
    } catch (error) {
        return { ok: false, error: error.name === 'TimeoutError' ? 'timeout' : 'network_or_parser_failure' };
    }
}

function writeJsonAtomic(file, value) {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temp, file);
}

async function run({ live = false, dryRun = false, now = new Date().toISOString() } = {}) {
    const previous = fs.existsSync(SNAPSHOT_PATH) ? JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) : {};
    const previousChanges = fs.existsSync(CHANGES_PATH) ? JSON.parse(fs.readFileSync(CHANGES_PATH, 'utf8')) : { changes: [] };
    const fetched = {};
    if (live) await Promise.all(Object.entries(models.sources).map(async ([id, source]) => { fetched[id] = await fetchOfficial(source); }));
    const result = buildSnapshot({ sources: models.sources, previous, fetched, now });
    const newlyDetected = result.changes.map((change) => ({ ...change, review_status: 'pending_review', auto_apply: false }));
    const unresolved = (previousChanges.changes || []).filter((change) => change.review_status === 'pending_review');
    const mergedChanges = [...unresolved, ...newlyDetected].filter((change, index, rows) => rows.findIndex((candidate) => candidate.id === change.id && candidate.type === change.type && candidate.current_hash === change.current_hash && candidate.current === change.current) === index);
    const changeReport = {
        schema_version: 1, generated_at: now, source_count: Object.keys(models.sources).length,
        pending_review_count: mergedChanges.length,
        changes: mergedChanges
    };
    if (!dryRun) {
        writeJsonAtomic(SNAPSHOT_PATH, result.snapshot);
        writeJsonAtomic(CHANGES_PATH, changeReport);
    }
    return { ...result, changes: newlyDetected, changeReport, dryRun, live };
}

if (require.main === module) run({ live: process.argv.includes('--official-live'), dryRun: process.argv.includes('--dry-run') })
    .then((result) => console.log(JSON.stringify({ source_count: result.snapshot.source_count, changes: result.changes.length, degraded: result.snapshot.sources.filter((item) => item.status === 'last_good_degraded').length, dry_run: result.dryRun }, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { run, fetchOfficial };
