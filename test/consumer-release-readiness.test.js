'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/can-i-sell-it');
const { runConsumerReleaseReadiness } = require('../scripts/check-consumer-release-readiness');

test('consumer release gate validates products, official-source metadata and mobile UI contracts', () => {
    const result = runConsumerReleaseReadiness({ now: Date.parse('2026-08-17') });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(result.productCount, 25);
    assert.ok(result.sourceCount >= 17);
});

test('release UI advertises and enforces bounded evidence uploads', () => {
    const result = runConsumerReleaseReadiness({ now: Date.parse('2026-08-17') });
    assert.equal(result.ok, true, result.errors.join('\n'));
});

test('release UI exposes parser health and a non-overlapping mobile dock contract', () => {
    const result = runConsumerReleaseReadiness({ now: Date.parse('2026-08-17') });
    assert.equal(result.ok, true, result.errors.join('\n'));
});

test('release gate rejects overdue official-source reviews', () => {
    const result = runConsumerReleaseReadiness({ now: Date.parse('2028-08-17') });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => /source review is overdue/.test(item)));
});

test('desktop and mobile journey contract covers preliminary result, channel switch and safe exit', () => {
    const preliminary = engine.assess({
        description: 'Bluetooh smart watch with rechargeable lithium battery. No medical claims. For adults.',
        market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.equal(preliminary.profile.productType, 'smart_watch');
    assert.ok(preliminary.requirements.some((item) => item.id === 'fcc'));
    assert.ok(preliminary.requirements.some((item) => item.id === 'battery'));

    const switched = engine.assess({
        description: 'Bluetooh smart watch with rechargeable lithium battery. No medical claims. For adults.',
        market: 'US', platform: 'TikTok Shop', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.notEqual(preliminary.platformGateDecision.reason, switched.platformGateDecision.reason);
    assert.match(switched.platformGateDecision.reason, /TikTok Shop/);

    const unsupported = engine.assess({
        description: 'cotton summer dress', market: 'EU', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: []
    });
    assert.equal(unsupported.sellerConclusion.code, 'not_enough_information');
    assert.equal(unsupported.marketCoverage.level, 'unsupported');
});
