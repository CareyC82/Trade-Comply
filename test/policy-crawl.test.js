'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isRelevantSnippet,
    buildFetchHeaders,
    usesStealthProfile,
    isGacSource
} = require('../lib/policy-crawl');

describe('policy-crawl', () => {
    it('detects relevant semiconductor snippets', () => {
        assert.equal(isRelevantSnippet('New export control on semiconductor chips'), true);
        assert.equal(isRelevantSnippet('Weather forecast for Beijing'), false);
    });

    it('applies Chrome stealth headers for GAC source', () => {
        const source = { id: 'gac-customs-notices', url: 'http://www.customs.gov.cn/customs/302249/302270/index.html' };
        assert.equal(isGacSource(source), true);
        assert.equal(usesStealthProfile(source), true);
        const headers = buildFetchHeaders(source);
        assert.match(headers['User-Agent'], /Chrome\/124/);
        assert.ok(headers['Sec-Ch-Ua']);
        assert.equal(headers.Referer, 'https://www.customs.gov.cn/');
        assert.match(headers.Accept, /image\/avif/);
        assert.match(headers['Sec-Ch-Ua'], /Chromium/);
    });
});
