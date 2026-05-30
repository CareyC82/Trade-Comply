/**
 * AI assistant query UI — template mount + event bindings (no search logic).
 */
'use strict';

function renderAiQuerySection(container, viewModel) {
    if (!container) {
        return;
    }
    if (!viewModel) {
        clearElement(container);
        return;
    }
    mountHtml(container, templateAiQuerySection(viewModel));
    bindAiQuerySectionHandlers();
}

function bindAiQuerySectionHandlers() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiInput = document.getElementById('ai-query-input');

    if (!aiBtn || !aiInput) {
        return;
    }

    aiBtn.addEventListener('click', () => {
        const userQuery = aiInput.value.trim();
        if (userQuery) {
            callAiAssistant(userQuery);
        }
    });

    aiInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            aiBtn.click();
        }
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.renderAiQuerySection = renderAiQuerySection;
    globalThis.bindAiQuerySectionHandlers = bindAiQuerySectionHandlers;
}
