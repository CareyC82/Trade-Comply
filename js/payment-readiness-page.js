(function bootstrapPaymentReadiness() {
    'use strict';
    const form = document.getElementById('payment-readiness-form');
    if (!form || !globalThis.TraceWizePaymentReadiness) return;
    const resultNode = document.getElementById('payment-readiness-result');
    const errorNode = document.getElementById('payment-readiness-error');
    const documentNode = document.getElementById('payment-document-checks');
    const flagsNode = document.getElementById('payment-red-flags');
    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const documentChecks = {
        parties: 'Party names match across contract, PO and invoice',
        amountCurrency: 'Amount and currency match', goods: 'Goods, model and quantity match',
        incoterm: 'Incoterm matches', route: 'Transport parties and route match'
    };
    const redFlags = {
        personalAccount: 'Company payment is directed to a personal account',
        changedAccount: 'Bank account changed shortly before payment',
        accountNameMismatch: 'Account name differs from the invoice seller',
        avoidanceRequest: 'A party suggested bypassing bank or compliance review',
        splitPayment: 'Payment is split without a documented commercial reason',
        routeMismatch: 'Payment country has no clear relationship to the trade route',
        unusualPrice: 'Price appears materially unusual', vagueGoods: 'Goods description is vague',
        unclearEndUse: 'Final user or end use is unclear',
        potentialRestrictedParty: 'A name resembles a restricted party and needs human confirmation',
        controlledGoodsConcern: 'Goods may require export-control or sanctions review'
    };
    documentNode.innerHTML = Object.entries(documentChecks).map(([key, label]) => `<fieldset><legend>${escapeHtml(label)}</legend>${['yes', 'no', 'unknown'].map((value) => `<label><input type="radio" name="doc:${key}" value="${value}">${value === 'yes' ? 'Matches' : value === 'no' ? 'Mismatch' : 'Not checked'}</label>`).join('')}</fieldset>`).join('');
    flagsNode.innerHTML = Object.entries(redFlags).map(([key, label]) => `<label><input type="checkbox" name="flag:${key}"><span>${escapeHtml(label)}</span></label>`).join('');

    function data() {
        const values = Object.fromEntries(new FormData(form).entries());
        const checked = (name) => form.elements[name]?.checked || false;
        return {
            ...values,
            agent: checked('agent'), relatedParty: checked('relatedParty'), thirdPartyPayment: checked('thirdPartyPayment'),
            documentChecks: Object.fromEntries(Object.keys(documentChecks).map((key) => [key, form.querySelector(`[name="doc:${key}"]:checked`)?.value || 'unknown'])),
            redFlags: Object.fromEntries(Object.keys(redFlags).map((key) => [key, checked(`flag:${key}`)]))
        };
    }

    function summaryText(assessment) {
        const facts = assessment.facts;
        return [`TraceWize Trade Payment Readiness Review`, `Result: ${assessment.label}`,
            `Route: ${facts.origin || 'unknown'} → ${facts.destination || 'unknown'}${facts.transit ? ` via ${facts.transit}` : ''}`,
            `Finding categories: ${[...new Set(assessment.issues.map((item) => item.category))].join(', ') || 'No reported inconsistency'}`,
            '', ...assessment.issues.map((item) => `- ${item.title}: ${item.next}`), '',
            'Preliminary screening only; not legal, banking or financial advice and no guarantee of payment processing.'].join('\n');
    }

    function render(assessment) {
        const tone = assessment.level === 'ready' ? 'ready' : assessment.level === 'clarification' ? 'clarification' : 'risk';
        resultNode.innerHTML = `<article class="payment-result-card payment-result--${tone}">
            <p class="sell-result-kicker">PRELIMINARY PAYMENT READINESS</p><h2>${escapeHtml(assessment.label)}</h2>
            <p>${assessment.level === 'ready' ? 'No selected red flag currently blocks preparation, but the bank and relevant professionals make the final decision.' : 'Resolve every listed issue before relying on the transaction package.'}</p>
            <div class="payment-result-boundary">This is a structured pre-screen, not KYC/AML clearance, sanctions clearance, legal advice or payment approval.</div>
            <dl class="payment-conclusion"><div><dt>Basis</dt><dd>${escapeHtml(assessment.conclusion.basis)}</dd></div><div><dt>Missing / unknown</dt><dd>${escapeHtml(assessment.conclusion.missing)}</dd></div><div><dt>Next</dt><dd>${escapeHtml(assessment.conclusion.next)}</dd></div></dl>
        </article>
        <article class="sell-check-card"><h2>Findings, basis and next action</h2><div class="payment-findings">${assessment.issues.length ? assessment.issues.map((item) => `<section><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p><strong>Basis:</strong> ${escapeHtml(item.basis)}</p>${item.missing ? `<p><strong>Missing:</strong> ${escapeHtml(item.missing)}</p>` : ''}<p><strong>Next:</strong> ${escapeHtml(item.next)}</p></section>`).join('') : '<p>No inconsistency was reported in the structured answers. Unknown facts and independent verification may still change this result.</p>'}</div></article>
        <article class="sell-check-card"><h2>Bank submission readiness checklist</h2><ul class="payment-checklist">${assessment.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p class="sell-panel-note">Provide only authentic documents. Do not invent facts or alter documents to satisfy a checklist.</p></article>
        <article class="sell-check-card payment-review-cta"><h2>Request a Trade Payment Readiness Review</h2><p>One transaction, one payment route, one structured readiness summary. A human review remains preliminary and does not guarantee bank processing.</p><div class="payment-actions"><button id="payment-copy-summary" type="button">Copy non-sensitive summary</button><a id="payment-open-email" href="#">Open email draft</a></div><p id="payment-action-status" role="status"></p></article>`;
        const summary = summaryText(assessment);
        document.getElementById('payment-copy-summary').addEventListener('click', async () => {
            const status = document.getElementById('payment-action-status');
            try { await navigator.clipboard.writeText(summary); status.textContent = 'Summary copied. Review it before sharing.'; }
            catch { status.textContent = 'Copy was blocked by the browser. Select and copy the result manually.'; }
        });
        document.getElementById('payment-open-email').href = `mailto:carey@tracewize.com?subject=${encodeURIComponent('Trade Payment Readiness Review request')}&body=${encodeURIComponent(summary)}`;
        resultNode.hidden = false;
        resultNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        errorNode.hidden = true;
        if (!form.reportValidity()) { errorNode.textContent = 'Complete the required transaction fields before running the screen.'; errorNode.hidden = false; return; }
        try { render(globalThis.TraceWizePaymentReadiness.assess(data())); }
        catch { errorNode.textContent = 'The readiness screen could not be completed. No information was sent or stored.'; errorNode.hidden = false; }
    });
}());
