const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    NEW_ENERGY_EXECUTIVE_SUMMARY,
    SEMICONDUCTOR_EXECUTIVE_SUMMARY,
    ELECTRONICS_EXECUTIVE_SUMMARY,
    DEFAULT_EXECUTIVE_SUMMARY,
    getExecutiveSummary,
    buildExecutiveSummaryForEnterpriseReport,
    renderActionableChecklistTable,
    buildEnterprisePrintHtml,
    sanitizePrintCellText,
    shortenPhaseForPrint,
    getEnterprisePrintStyles
} = require('../lib/enterprise-print-report');

describe('enterprise-print-report', () => {
    it('getExecutiveSummary returns industry-specific copy', () => {
        assert.equal(getExecutiveSummary('new-energy'), NEW_ENERGY_EXECUTIVE_SUMMARY);
        assert.equal(getExecutiveSummary('New Energy'), NEW_ENERGY_EXECUTIVE_SUMMARY);
        assert.equal(getExecutiveSummary('semiconductor'), SEMICONDUCTOR_EXECUTIVE_SUMMARY);
        assert.equal(getExecutiveSummary('electronics'), ELECTRONICS_EXECUTIVE_SUMMARY);
        assert.equal(getExecutiveSummary('unknown'), DEFAULT_EXECUTIVE_SUMMARY);
    });

    it('buildExecutiveSummaryForEnterpriseReport maps vertical to industry', () => {
        const summary = buildExecutiveSummaryForEnterpriseReport({
            productQuery: 'lithium battery equipment air freight IATA UN38.3',
            vertical: 'new-energy'
        });
        assert.equal(summary, NEW_ENERGY_EXECUTIVE_SUMMARY);
    });

    it('print HTML includes executive summary and report container', () => {
        const html = buildEnterprisePrintHtml({
            vertical: 'new-energy',
            productQuery: 'lithium battery',
            flowLabel: 'CN → US',
            checklist: [{ phase: 'technical', task: 'Test task', desc: 'Guidance line', checked: false }]
        });
        assert.match(html, /report-container/);
        assert.match(html, /Executive Summary/);
        assert.match(html, /Medium-Risk flags under international IATA/);
    });

    it('print CSS uses native flow without scale or overflow lock', () => {
        const css = getEnterprisePrintStyles();
        assert.match(css, /@media print[\s\S]*@page[\s\S]*size:\s*A4 portrait/);
        assert.match(css, /margin:\s*12mm 15mm 12mm 15mm !important/);
        assert.match(css, /height:\s*auto !important/);
        assert.match(css, /overflow:\s*visible !important/);
        assert.match(css, /page-break-inside:\s*avoid !important/);
        assert.doesNotMatch(css, /transform:\s*scale/);
        assert.doesNotMatch(css, /overflow:\s*hidden/);
        assert.match(css, /\.signoff-cell[\s\S]*white-space:\s*nowrap !important/);
        assert.match(css, /font-size:\s*20px/);
        assert.match(css, /vertical-align:\s*top !important/);
    });

    it('renders one tr per task with signoff-cell and no row merge', () => {
        const html = renderActionableChecklistTable([
            { phase: 'technical', task: 'Task A', desc: 'Guide A' },
            { phase: 'environmental', task: 'Task B', desc: 'Guide B' }
        ]);
        assert.equal((html.match(/<tr>/gi) || []).length, 2);
        assert.equal((html.match(/<td\b/gi) || []).length, 6);
        assert.match(html, /class="signoff-cell"/);
        assert.doesNotMatch(html, /rowspan|colspan="[2-9]/i);
        assert.match(html, /Sign-off:/);
    });

    it('sanitizes rogue bracket fragments and newlines', () => {
        const clean = sanitizePrintCellText('Task line\nwith [ 1 \nbreak');
        assert.doesNotMatch(clean, /\n/);
        assert.doesNotMatch(clean, /\[ 1/);
    });

    it('renders exactly three table cells per checklist row', () => {
        const html = renderActionableChecklistTable([
            {
                phase: 'environmental',
                phaseLabel: '🌱 Environmental & Green Registry',
                task: 'Confirm battery & chemical substance compliance',
                desc: 'Check lithium battery UN38.3, MSDS/SDS reports.'
            }
        ]);
        assert.match(html, /Confirm battery/i);
        assert.match(html, /UN38\.3/);
        assert.equal((html.match(/<td\b/gi) || []).length, 3);
        assert.equal((html.match(/<\/tr>/gi) || []).length, 1);
    });

    it('shortens phase labels for print grid', () => {
        assert.equal(shortenPhaseForPrint({ phase: 'environmental' }), 'Environmental');
        assert.equal(
            shortenPhaseForPrint({ phaseLabel: '📦 Pre-shipment Technical & Certification Checks' }),
            'Technical'
        );
    });
});
