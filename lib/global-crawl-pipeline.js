/**
 * @deprecated Pipeline lives in global-compliance-crawler.js (Step 3).
 */
'use strict';

const crawler = require('./global-compliance-crawler');

module.exports = {
    runGlobalCrawlPipeline: crawler.runGlobalCrawlPipeline,
    refineFetchedSource: crawler.refineWithAI,
    formatPolicySkipLog: crawler.formatPolicySkipLog
};
