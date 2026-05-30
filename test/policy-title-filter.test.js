'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    titleMatchesNoise,
    applyNoiseFilterToPolicyText
} = require('../lib/policy-title-filter');

describe('policy-title-filter', () => {
    it('flags administrative noise keywords', () => {
        assert.equal(titleMatchesNoise('2025年度网站工作年度报表'), true);
        assert.equal(titleMatchesNoise('海关总署署长外事会见代表团'), true);
        assert.equal(titleMatchesNoise('出口管制清单调整通知'), false);
    });

    it('drops blacklisted dated headlines and keeps policy lines', () => {
        const text = [
            '机关子站 专题专栏 2025-05-01',
            '关于两用物项出口管制公告 2026-05-28',
            '署长会见牙买加农业部长 2026-05-29',
            '锂电池进出口检验新规 2026-05-27'
        ].join(' ');

        const result = applyNoiseFilterToPolicyText(text);
        assert.ok(result.stats.skipped >= 2);
        assert.ok(result.stats.kept >= 2);
        assert.match(result.text, /两用物项/);
        assert.match(result.text, /锂电池/);
        assert.doesNotMatch(result.text, /机关子站/);
        assert.doesNotMatch(result.text, /会见/);
    });
});
