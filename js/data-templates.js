/**
 * HTML templates for data-loading UI states.
 */
'use strict';

function templateDataLoadingIndicator() {
    return `<div class="data-loading-indicator" style="text-align: center; padding: 40px; color: #666;">
        <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
        <div>Loading data...</div>
    </div>`;
}

function templateDataLoadError() {
    return `<div class="data-load-error" style="text-align: center; padding: 40px; color: #e74c3c;">
        <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
        <div>Application error. Please refresh the page.</div>
    </div>`;
}

if (typeof globalThis !== 'undefined') {
    globalThis.templateDataLoadingIndicator = templateDataLoadingIndicator;
    globalThis.templateDataLoadError = templateDataLoadError;
}
