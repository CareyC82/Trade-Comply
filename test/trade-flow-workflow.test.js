'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'trade-flow-sync.yml'), 'utf8');

test('trade-flow workflow runs when its definition or China Customs inbox changes', () => {
    assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
    assert.match(workflow, /- "\.github\/workflows\/trade-flow-sync\.yml"/);
    assert.match(workflow, /- "data\/inbox\/china-customs\/\*\*"/);
    assert.match(workflow, /schedule:/);
    assert.match(workflow, /workflow_dispatch:/);
});

test('trade-flow push paths exclude generated outputs to prevent commit loops', () => {
    const pushBlock = workflow.match(/\n  push:\n([\s\S]*?)\n  schedule:/)?.[1] || '';
    assert.doesNotMatch(pushBlock, /china-industry-flow\.json/);
    assert.doesNotMatch(pushBlock, /china-customs-sync-status\.json/);
    assert.doesNotMatch(pushBlock, /china-customs-sync-plan\.json/);
});
