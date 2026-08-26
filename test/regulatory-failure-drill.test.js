'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { runFailureDrill } = require('../lib/regulatory-failure-drill');

test('official-source outages preserve last-good evidence and cannot change user conclusions', () => {
    const source = { authority: 'FCC', title: 'Equipment authorization', url: 'https://fcc.gov/rule', reviewedAt: '2026-01-01', monitorPolicy: { mode: 'automatic_with_manual_fallback', reviewEveryDays: 30 } };
    const previous = { sources: [{ id: 'fcc', content_hash: 'abc', content_summary: 'official FCC equipment authorization text', status: 'current', last_good_at: '2026-08-25T00:00:00Z' }] };
    const result = runFailureDrill({ sourceId: 'fcc', source, previous, assessmentInput: { description: 'Bluetooth speaker with rechargeable lithium battery', market: 'US', origin: 'CN', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] } });
    assert.equal(result.ok, true, JSON.stringify(result.rows));
    assert.equal(result.rows.length, 5);
});
