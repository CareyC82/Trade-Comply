const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    encodeComplianceFeedbackQuery,
    decodeComplianceFeedbackQuery,
    extractComplianceFeedbackPayload,
    isComplianceFeedbackQuery
} = require('../compliance-feedback-codec');

describe('compliance-feedback-codec', () => {
    it('round-trips policy correction payload', () => {
        const record = {
            product_keyword: 'AI accelerator',
            policy_type: 'Export control',
            source_url: 'https://www.mofcom.gov.cn/',
            user_message: 'Threshold unclear'
        };

        const query = encodeComplianceFeedbackQuery(record);
        assert.ok(isComplianceFeedbackQuery(query));

        const decoded = decodeComplianceFeedbackQuery(query);
        assert.equal(decoded.product_keyword, record.product_keyword);
        assert.equal(decoded.policy_type, record.policy_type);
    });

    it('extracts from body.query marker', () => {
        const record = {
            product_keyword: 'GPU',
            policy_type: 'Import control',
            source_url: 'https://example.com',
            user_message: 'test'
        };
        const query = encodeComplianceFeedbackQuery(record);
        const extracted = extractComplianceFeedbackPayload({ query });
        assert.equal(extracted.policy_type, 'Import control');
    });
});
