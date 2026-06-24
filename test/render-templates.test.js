'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    templateComplianceCard,
    templateResultSummary,
    templateEmptyResultsMessage
} = require('../js/render-templates');

describe('render-templates', () => {
    it('renders compliance card from pre-escaped view model only', () => {
        const html = templateComplianceCard({
            matchRibbonHtml: '',
            tagTypeClass: 'matched',
            tagTypeLabelHtml: 'MATCHED',
            riskBadgeHtml: '',
            regulatoryBadgeHtml: '<span class="regulatory-body-badge">[US-BIS]</span>',
            countryCodeBadgeHtml: '',
            cardLabelHtml: 'Test policy',
            scopePillHtml: '',
            cardHintHtml: '',
            auditTrailHtml: '<section class="policy-audit-trail"></section>',
            bodyTitleHtml: 'GLPOL: Title',
            bodyDescHtml: 'Summary',
            exemptionsHtml: '',
            riskScenariosHtml: '',
            hsCodeLabelHtml: 'HS Code',
            hsCodesHtml: '8541.40',
            legacySourceHtml: ''
        });
        assert.match(html, /\[US-BIS\]/);
        assert.match(html, /policy-audit-trail/);
        assert.doesNotMatch(html, /tag\.description/);
    });

    it('renders result summary without raw query injection', () => {
        const html = templateResultSummary({
            directionTextHtml: 'Export from China',
            countryLabelHtml: 'United States',
            foundRegulationsHtml: 'Found',
            tagCount: 3,
            regulationsForHtml: 'regulations for',
            queryHtml: '&lt;script&gt;',
            roleFocusHtml: 'destination focus'
        });
        assert.match(html, /&lt;script&gt;/);
        assert.match(html, /result-count/);
    });

    it('renders empty state variant styles', () => {
        const out = templateEmptyResultsMessage({ variant: 'out_of_range', messageHtml: 'Out of scope' });
        const none = templateEmptyResultsMessage({ variant: 'no_results', messageHtml: 'No results' });
        assert.match(out, /line-height: 1.6/);
        assert.doesNotMatch(none, /line-height: 1.6/);
    });

    it('uses the Formspree feedback CTA for result correction prompts', () => {
        const policyCorrectionSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'policy-correction.js'), 'utf8');
        const renderMountSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'render-mount.js'), 'utf8');

        assert.match(policyCorrectionSource, /feedback-formspree-trigger/);
        assert.match(policyCorrectionSource, /t\('feedback'\)/);
        assert.doesNotMatch(policyCorrectionSource, /report-action-link policy-correction-trigger/);
        assert.match(renderMountSource, /bindFeedbackTriggers\(section\)/);
    });
});

describe('pre-screen-report templates', () => {
    it('renders the report as a closed collapsible panel', () => {
        require('../js/pre-screen-report-templates');
        const html = globalThis.templatePreScreenReportPanel({
            titleHtml: 'Compliance Pre-Screening Report',
            metaHtml: 'CN -> United States',
            riskLabelHtml: 'Risk level rating',
            riskLevelHtml: 'CRITICAL',
            riskLevelClass: 'critical',
            riskToneHtml: 'Stop / legal review required',
            riskSentenceHtml: 'This screen indicates critical pre-check risk.',
            matchedCountHtml: '3',
            topTriggersHtml: '<div class="psr-trigger-list"></div>',
            riskDriversHtml: '<div class="psr-driver-chips"></div>',
            actionPlanHtml: '<ol class="psr-next-steps"></ol>',
            executiveSummaryHtml: 'Summary',
            triggerTitleHtml: 'Trigger reason',
            triggerReasonHtml: 'Reason',
            missingTitleHtml: 'Missing information',
            missingListHtml: '<ul></ul>',
            verifyTitleHtml: 'Verification objects',
            verifyListHtml: '<ul></ul>',
            sourcesTitleHtml: 'Official sources',
            sourceCountHtml: '2',
            sourceSummaryHtml: 'US BIS',
            sourcesBlockHtml: '<ul></ul>',
            disclaimerTitleHtml: 'Disclaimer',
            disclaimerHtml: 'Not legal advice.',
            scopeNoteHtml: 'Scope note'
        });

        assert.match(html, /pre-screen-report pre-screen-report--dashboard collapsible-panel/);
        assert.match(html, /collapsible-header" aria-expanded="false"/);
        assert.match(html, /pre-screen-report__body collapsible-body/);
        assert.doesNotMatch(html, /collapsible-panel open/);
        assert.doesNotMatch(html, />undefined</);
    });
});
