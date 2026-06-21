const assert = require('node:assert/strict');
const test = require('node:test');

const { AI_MESSAGES, buildGroundedUserMessage } = require('../index.js');

test('AI system prompt supports global trade routes instead of China-only scope', () => {
    assert.match(AI_MESSAGES.systemPrompt, /global trade compliance pre-screening expert/i);
    assert.match(AI_MESSAGES.systemPrompt, /selected trade route and compliance focus/i);
    assert.match(AI_MESSAGES.systemPrompt, /Do NOT describe TraceWize as China-only/i);
    assert.match(AI_MESSAGES.systemPrompt, /state which route, jurisdiction, or product detail is missing/i);
    assert.doesNotMatch(AI_MESSAGES.systemPrompt, /ONLY about China's import\/export/i);
    assert.doesNotMatch(AI_MESSAGES.systemPrompt, /Sorry, I only cover China's trade compliance regulations/i);
});

test('AI system prompt avoids repeated generic insufficient-detail sections when rules exist', () => {
    assert.match(AI_MESSAGES.systemPrompt, /Not stated in the matched rules/i);
    assert.match(AI_MESSAGES.systemPrompt, /open verification item/i);
    assert.match(AI_MESSAGES.systemPrompt, /If there are matched rules, each section must contain/i);
    assert.doesNotMatch(
        AI_MESSAGES.systemPrompt,
        /The rule library does not contain enough detail to answer this/i
    );
});

test('AI grounded message labels non-China import routes correctly', () => {
    const message = buildGroundedUserMessage({
        product_query: 'gpu ai accelerator chip',
        direction: 'import',
        route: {
            from: 'US',
            to: 'IN',
            from_label: 'United States',
            to_label: 'India',
            focus: 'import'
        },
        risk_level: 'high',
        precheck_attributes: [],
        matched_tags: [{
            tag_id: 'CL-IN-001',
            tag_type: 'CHECK_REQUIRED',
            category: 'Export Control',
            hs_codes: ['8542'],
            description: 'India import review for semiconductor items.'
        }],
        related_cases: [],
        match_count: { tags: 1, cases: 0 }
    }, 'What should I check?');

    assert.match(message, /TRADE ROUTE: United States -> India/);
    assert.match(message, /COMPLIANCE FOCUS: import requirements at destination: United States -> India/);
    assert.doesNotMatch(message, /import INTO China/);
    assert.doesNotMatch(message, /export FROM China/);
});
