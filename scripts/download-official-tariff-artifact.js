#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { buildResumableCurlArgs, validateDownloadedArtifact } = require('../lib/official-artifact-download');

function value(name) {
    const arg = process.argv.slice(2).find(item => item.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1) : '';
}

function main() {
    const url = value('--url');
    const output = value('--output');
    if (!/^https:\/\//i.test(url) || !output) throw new Error('--url=https://official... and --output=/path/file are required');
    const target = path.resolve(output);
    execFileSync('curl', buildResumableCurlArgs(url, target), { stdio: 'inherit' });
    const result = validateDownloadedArtifact(target);
    console.log(JSON.stringify({ ok: true, file: target, ...result }, null, 2));
}

if (require.main === module) main();
