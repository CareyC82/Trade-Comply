#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildFilingGradeRegression } = require('../lib/filing-grade-regression');
const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'duty-rates.json'), 'utf8'));
const result = buildFilingGradeRegression(payload);
console.log(JSON.stringify({ ...result, rows: result.rows.slice(0, 25) }, null, 2));
process.exitCode = result.ok ? 0 : 1;
