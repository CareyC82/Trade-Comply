const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAiModule(overrides = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai.js'), 'utf8');
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        globalThis: {},
        document: {
            querySelector() {
                return overrides.metaContent ? { content: overrides.metaContent } : null;
            }
        }
    };
    sandbox.globalThis = sandbox;
    if (overrides.endpoint) {
        sandbox.TRACEWIZE_AI_ENDPOINT = overrides.endpoint;
    }
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/ai.js' });
    return sandbox;
}

test('AI assistant default endpoint keeps FC root slash for CORS preflight', () => {
    const sandbox = loadAiModule();
    assert.equal(
        sandbox.resolveAiAssistantEndpoint(),
        'https://tradecoai-agent-ugbhgcutmm.cn-shenzhen.fcapp.run/'
    );
});

test('AI assistant endpoint override is normalized with a trailing slash', () => {
    const sandbox = loadAiModule({ endpoint: 'https://api.tracewize.com/assistant' });
    assert.equal(sandbox.resolveAiAssistantEndpoint(), 'https://api.tracewize.com/assistant/');
});

test('AI assistant endpoint preserves query-string route overrides', () => {
    const sandbox = loadAiModule({ metaContent: 'https://api.tracewize.com/?action=ai' });
    assert.equal(sandbox.resolveAiAssistantEndpoint(), 'https://api.tracewize.com/?action=ai');
});
