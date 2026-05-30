'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isRelevantSnippet } = require('../lib/policy-crawl');

describe('policy-crawl', () => {
    it('detects relevant semiconductor snippets', () => {
        assert.equal(isRelevantSnippet('New export control on semiconductor chips'), true);
        assert.equal(isRelevantSnippet('Weather forecast for Beijing'), false);
    });
});
