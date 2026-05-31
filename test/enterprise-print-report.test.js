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
    getEnterprisePrintStyles,
    inferLithiumBatteryTransportCode,
    buildLithiumBatteryTransportNote,
    resolveRiskCardSource,
    normalizeLithiumBatteryRiskDescription
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
        assert.match(summary, /Medium-Risk flags under international IATA/);
        assert.match(summary, /UN3481/);
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

    it('uses explicit HS missing-state text instead of dash placeholders', () => {
        const html = buildEnterprisePrintHtml({
            vertical: 'new-energy',
            productQuery: 'lithium battery equipment air freight',
            flowLabel: 'CN → US',
            checklist: []
        });
        assert.match(html, /Not provided - classification required/);
        assert.doesNotMatch(html, /<div class="hs-code-print">—<\/div>/);
    });

    it('infers UN3481 for lithium batteries in equipment', () => {
        const report = { productQuery: 'lithium battery equipment air freight IATA UN38.3 dangerous goods' };
        assert.equal(inferLithiumBatteryTransportCode(report), 'UN3481');
        assert.match(buildLithiumBatteryTransportNote(report), /contained in equipment/i);
        assert.equal(
            normalizeLithiumBatteryRiskDescription('Lithium batteries require UN3480 dangerous goods documentation', report),
            'Lithium batteries require UN3481 dangerous goods documentation'
        );
    });

    it('prints official source labels or URLs on risk cards', () => {
        const html = buildEnterprisePrintHtml({
            vertical: 'new-energy',
            productQuery: 'lithium battery equipment air freight',
            riskSummaries: [{
                type: 'MATCHED',
                description: 'Lithium batteries require UN3480 dangerous goods documentation',
                auditLine: 'Source Jurisdiction: [GLOBAL] | Verified: 2026-05-31',
                sourceUrl: 'https://www.iata.org/en/programs/cargo/dgr/lithium-batteries/',
                sourceCitation: 'IATA lithium battery guidance'
            }],
            checklist: []
        });
        assert.match(html, /UN3481 dangerous goods documentation/);
        assert.match(html, /Official Source:/);
        assert.match(html, /IATA lithium battery guidance/);
        assert.match(html, /https:\/\/www\.iata\.org/);
    });

    it('adds IATA source fallback for lithium battery air-freight risks', () => {
        const source = resolveRiskCardSource(
            { description: 'Lithium batteries require UN3480 dangerous goods documentation' },
            { productQuery: 'lithium battery equipment air freight IATA UN38.3' }
        );
        assert.equal(source.label, 'IATA lithium battery guidance');
        assert.match(source.url, /iata\.org/);
    });

    it('print CSS uses native flow without scale or overflow lock', () => {
        const css = getEnterprisePrintStyles();
        assert.match(css, /@media print[\s\S]*@page[\s\S]*size:\s*A4 portrait/);
        assert.match(css, /margin:\s*10mm 12mm 10mm 12mm !important/);
        assert.match(css, /height:\s*auto !important/);
        assert.match(css, /overflow:\s*visible !important/);
        assert.match(css, /page-break-inside:\s*avoid !important/);
        assert.doesNotMatch(css, /transform:\s*scale/);
        assert.doesNotMatch(css, /overflow:\s*hidden/);
        assert.match(css, /\.signoff-cell[\s\S]*white-space:\s*nowrap !important/);
        assert.match(css, /\.header-title[\s\S]*font-size:\s*18px/);
        assert.match(css, /vertical-align:\s*top !important/);
    });

    it('renders one tr per task with signoff-cell and no row merge', () => {
        const html = renderActionableChecklistTable([
            { phase: 'technical', task: 'Task A', desc: 'Guide A' },
            { phase: 'environmental', task: 'Task B', desc: 'Guide B' }
        ]);
        assert.equal((html.match(/<tr\b/gi) || []).length, 2);
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
