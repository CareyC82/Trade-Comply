'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    UNIVERSAL_AI_REFINER_SYSTEM_PROMPT,
    extractAnnouncementDigest,
    normalizePolicyAiFilter,
    refineWithAI,
    refineGlobalPolicyAnnouncement
} = require('../lib/policy-ai-filter');

const MOFCOM_SOURCE = {
    id: 'zh-mofcom',
    country: 'CN',
    type: 'export',
    url: 'https://www.mofcom.gov.cn/zwgk/zcfb/',
    method: 'fetch',
    label: 'China MOFCOM export control'
};

describe('policy-ai-filter', () => {
    it('uses universal legal-English refiner system prompt', () => {
        assert.match(UNIVERSAL_AI_REFINER_SYSTEM_PROMPT, /high-standard legal English/i);
        assert.match(UNIVERSAL_AI_REFINER_SYSTEM_PROMPT, /coffee beans|garments|timber/i);
        assert.match(UNIVERSAL_AI_REFINER_SYSTEM_PROMPT, /Electronics.*New Energy.*Semiconductor/s);
        assert.match(UNIVERSAL_AI_REFINER_SYSTEM_PROMPT, /No markdown code fences/i);
        assert.doesNotMatch(UNIVERSAL_AI_REFINER_SYSTEM_PROMPT, /请直接返回/);
    });

    it('extracts digest and drops blacklist diplomatic lines', () => {
        const text = '海关总署署长孙梅君会见牙买加农业部长 2026-05-29 出口管制清单更新 2026-05-27 芯片';
        const digest = extractAnnouncementDigest(text);
        assert.doesNotMatch(digest, /会见/);
        assert.match(digest, /出口管制/);
    });

    it('keeps consultation drafts for AI relevance review', () => {
        const text = '关于无人机出口管制规则公开征求意见的通知 2026-05-30 民用无人机 两用物项 出口管制';
        const digest = extractAnnouncementDigest(text);
        assert.match(digest, /征求意见/);
        assert.match(digest, /无人机/);
    });

    it('normalizes impact_countries to CN US EU only', () => {
        const out = normalizePolicyAiFilter({
            relevant: true,
            impact_countries: ['cn', 'US', 'JP'],
            direction: 'export',
            industry: 'Semiconductor',
            summary_en: 'BIS tightens license review for advanced AI accelerators.'
        }, { sourceCountry: 'US', sourceType: 'export' });

        assert.deepEqual(out.impact_countries, ['CN', 'US']);
        assert.equal(out.direction, 'EXPORT');
        assert.equal(out.industry, 'Semiconductor');
        assert.equal(out.effective_status, 'active');
        assert.equal(out.confidence_score, 0.5);
    });

    it('normalizes effective_status and confidence_score from AI JSON', () => {
        const out = normalizePolicyAiFilter({
            relevant: true,
            impact_countries: ['US'],
            direction: 'EXPORT',
            industry: 'Electronics',
            summary_en: 'Rule takes effect next quarter.',
            effective_status: 'pending_effective',
            confidence_score: 87
        }, { sourceCountry: 'US', sourceType: 'export' });

        assert.equal(out.effective_status, 'pending_effective');
        assert.equal(out.confidence_score, 0.87);
    });

    it('forces None industry and empty countries when not relevant', () => {
        const out = normalizePolicyAiFilter({
            relevant: false,
            impact_countries: ['CN'],
            direction: 'IMPORT',
            industry: 'Electronics',
            summary_en: 'Should drop'
        }, { sourceCountry: 'CN' });

        assert.equal(out.relevant, false);
        assert.equal(out.industry, 'None');
        assert.deepEqual(out.impact_countries, []);
        assert.equal(out.summary_en, '');
    });

    it('refineWithAI fails closed without API key', async () => {
        const prev = process.env.DEEPSEEK_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        try {
            const out = await refineWithAI('出口管制清单更新 芯片', MOFCOM_SOURCE);
            assert.equal(out.relevant, false);
            assert.equal(out.method, 'no-api-key');
        } finally {
            if (prev) {
                process.env.DEEPSEEK_API_KEY = prev;
            }
        }
    });

    it('refineWithAI supports offline fixture', async () => {
        const fixturePath = require('path').join(__dirname, 'fixtures', 'policy-ai-filter.response.json');
        const out = await refineWithAI('semiconductor export control', MOFCOM_SOURCE, {
            offline: true,
            offlineFixturePath: fixturePath
        });
        assert.equal(out.relevant, true);
        assert.equal(out.method, 'offline-fixture');
        assert.equal(out.confidence_score, 0.88);
        assert.equal(out.effective_status, 'active');
    });

    it('refineGlobalPolicyAnnouncement delegates to refineWithAI', async () => {
        const prev = process.env.DEEPSEEK_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        try {
            const out = await refineGlobalPolicyAnnouncement({
                sourceId: 'zh-mofcom',
                sourceCountry: 'CN',
                sourceType: 'export',
                text: 'export control list'
            });
            assert.equal(out.method, 'no-api-key');
        } finally {
            if (prev) {
                process.env.DEEPSEEK_API_KEY = prev;
            }
        }
    });
});
