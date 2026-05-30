/**
 * Re-exports registry from global-crawl-main.js (Step 1 canonical config).
 */
'use strict';

const {
    GLOBAL_CRAWL_SOURCES,
    getEnabledSources
} = require('./global-crawl-main');

function getEnabledGlobalSources(sources = GLOBAL_CRAWL_SOURCES) {
    return getEnabledSources(sources);
}

function legacySourceFromGlobal(entry) {
    const { isGacSource } = require('./global-crawl-main');
    if (!isGacSource(entry)) {
        return {
            id: entry.id,
            label: entry.label,
            url: entry.url,
            enabled: entry.enabled !== false,
            optional: Boolean(entry.optional),
            max_chars: entry.max_chars || 12000,
            country: entry.country,
            trade_type: entry.type
        };
    }
    return {
        id: 'gac-customs-notices',
        label: entry.label,
        url: entry.url,
        enabled: true,
        optional: Boolean(entry.optional),
        max_chars: entry.max_chars || 12000,
        ...(entry.legacy_options || {})
    };
}

module.exports = {
    GLOBAL_CRAWL_SOURCES,
    getEnabledGlobalSources,
    legacySourceFromGlobal
};
