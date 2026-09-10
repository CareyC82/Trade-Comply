#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const outputPath = path.join(__dirname, '..', 'data', 'manual-source-reviews.json');
const sourceConfig = {
    'us-fcc': {
        official_url: 'https://apps.fcc.gov/oetcf/kdb/index.cfm',
        evidence_boundary: 'Manual review confirms the official guidance index was checked; it does not verify any product or FCC ID.'
    },
    'in-dgft': {
        official_url: 'https://www.dgft.gov.in/CP/?opt=notification',
        evidence_boundary: 'Manual review confirms the official notification list was checked; it does not verify a product, tariff line, licence, restriction or filing conclusion.'
    }
};
function arg(name) {
    const prefix = `--${name}=`;
    return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}
const source = arg('source');
const reviewedAt = arg('reviewed-at') || new Date().toISOString().slice(0, 10);
if (!sourceConfig[source]) throw new Error('source must be us-fcc or in-dgft');
if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt))) {
    throw new Error('reviewed-at must be a valid YYYY-MM-DD date');
}
const payload = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
    : { schema_version: 1, updated_at: null, sources: {} };
payload.sources ||= {};
payload.sources[source] = {
    reviewed_at: reviewedAt,
    ...sourceConfig[source]
};
payload.updated_at = new Date().toISOString();
const temp = `${outputPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`);
fs.renameSync(temp, outputPath);
console.log(`Recorded ${source} manual review at ${reviewedAt}`);
