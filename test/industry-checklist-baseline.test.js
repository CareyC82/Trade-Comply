const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    detectProductProfile,
    buildIndustryComplianceBaseline,
    ensureIndustryChecklist
} = require('../lib/industry-checklist-baseline');
const { buildHsCodeSystemPrompt } = require('../lib/hscode-dual');

describe('industry-checklist-baseline', () => {
    it('detects consumer electronics vertical', () => {
        const profile = detectProductProfile('TWS earbuds bluetooth', '8518.30');
        assert.equal(profile.vertical, 'electronics');
    });

    it('generates FCC task for US export earbuds', () => {
        const items = buildIndustryComplianceBaseline({
            description: 'TWS earbuds with bluetooth',
            country: 'US',
            direction: 'export'
        });
        assert.ok(items.length >= 2);
        assert.ok(items.some((item) => /fcc/i.test(item.task)));
    });

    it('generates smart phone specialty tasks', () => {
        const items = buildIndustryComplianceBaseline({
            description: '5G smartphone with encrypted storage',
            hsCode: '8517.13',
            country: 'US',
            direction: 'export'
        });
        assert.ok(items.some((item) => /sar/i.test(item.task)));
        assert.ok(items.some((item) => /imei/i.test(item.task)));
    });

    it('generates UFLPA tasks for US solar export', () => {
        const items = buildIndustryComplianceBaseline({
            description: 'crystalline silicon solar panel PV module',
            country: 'US',
            direction: 'export',
            vertical: 'new-energy'
        });
        assert.ok(items.some((item) => /uflpa/i.test(item.task)));
        assert.ok(items.some((item) => /ad\/cvd/i.test(item.task)));
    });

    it('ensures minimum checklist when AI returns empty array', () => {
        const merged = ensureIndustryChecklist([], {
            description: 'smart speaker wifi',
            country: 'EU',
            direction: 'export'
        });
        assert.ok(merged.length >= 4);
        assert.ok(merged.some((item) => /ce marking/i.test(item.task)));
    });

    it('system prompt forbids empty checklist', () => {
        const prompt = buildHsCodeSystemPrompt();
        assert.match(prompt, /NEVER EMPTY/i);
        assert.match(prompt, /FORBIDDEN.*checklist.*\[\]/i);
        assert.match(prompt, /FCC ID/i);
        assert.match(prompt, /UFLPA/i);
    });
});
