(function paymentReadinessModule(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TraceWizePaymentReadiness = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildPaymentReadiness() {
    'use strict';

    const LEVELS = {
        ready: { label: 'Ready', rank: 0 },
        clarification: { label: 'Clarification Required', rank: 1 },
        professional_review: { label: 'High-Risk – Professional Review Required', rank: 2 },
        stop: { label: 'Do Not Proceed Until Resolved', rank: 3 }
    };

    const text = (value) => String(value || '').trim();
    const yes = (value) => value === true || value === 'yes';

    function issue({ category, severity = 'clarification', title, basis, missing = '', next }) {
        return { category, severity, title, basis, missing, next };
    }

    function assess(input = {}) {
        const facts = {
            buyer: text(input.buyer), seller: text(input.seller), payer: text(input.payer), payee: text(input.payee),
            buyerCountry: text(input.buyerCountry), sellerCountry: text(input.sellerCountry),
            payerCountry: text(input.payerCountry), payeeCountry: text(input.payeeCountry),
            goods: text(input.goods), use: text(input.use), origin: text(input.origin), destination: text(input.destination),
            transit: text(input.transit), amount: Number(input.amount), currency: text(input.currency),
            paymentMethod: text(input.paymentMethod), incoterm: text(input.incoterm),
            agent: yes(input.agent), relatedParty: yes(input.relatedParty), thirdPartyPayment: yes(input.thirdPartyPayment)
        };
        const issues = [];
        const required = [
            ['buyer', 'Buyer legal name'], ['seller', 'Seller legal name'], ['payer', 'Payer legal/account name'],
            ['payee', 'Payee legal/account name'], ['goods', 'Specific goods description'], ['use', 'End use'],
            ['origin', 'Origin country'], ['destination', 'Destination country'], ['currency', 'Currency'],
            ['paymentMethod', 'Payment method'], ['incoterm', 'Incoterm']
        ];
        const missingFacts = required.filter(([key]) => !facts[key]).map(([, label]) => label);
        if (!Number.isFinite(facts.amount) || facts.amount <= 0) missingFacts.push('Positive transaction amount');
        if (missingFacts.length) issues.push(issue({
            category: 'Missing information', title: 'Core transaction facts are incomplete',
            basis: 'Fact: one or more required structured fields were not supplied.',
            missing: missingFacts.join(', '), next: 'Complete these fields before preparing a bank submission.'
        }));

        if (facts.payer && facts.buyer && facts.payer.toLowerCase() !== facts.buyer.toLowerCase() && !facts.thirdPartyPayment) {
            issues.push(issue({ category: 'Party consistency', severity: 'stop', title: 'Payer does not match buyer',
                basis: 'Fact: the entered payer and buyer legal names differ, but third-party payment was not disclosed.',
                next: 'Pause payment and obtain a documented commercial explanation accepted by the bank and counterparties.' }));
        }
        if (facts.payee && facts.seller && facts.payee.toLowerCase() !== facts.seller.toLowerCase() && !facts.thirdPartyPayment) {
            issues.push(issue({ category: 'Party consistency', severity: 'stop', title: 'Payee does not match seller',
                basis: 'Fact: the entered payee and invoice seller legal names differ, but third-party payment was not disclosed.',
                next: 'Do not remit funds until the account ownership and contractual entitlement are independently confirmed.' }));
        }
        if (facts.thirdPartyPayment || facts.agent || facts.relatedParty) issues.push(issue({
            category: 'Party consistency', severity: 'professional_review', title: 'Additional party relationship requires review',
            basis: `Fact: ${[facts.thirdPartyPayment && 'third-party payment', facts.agent && 'agent', facts.relatedParty && 'related company'].filter(Boolean).join(', ')} was disclosed.`,
            missing: 'Written role, commercial rationale, beneficial ownership and bank-acceptable supporting evidence.',
            next: 'Ask the bank or qualified compliance reviewer to confirm the documented party structure before payment.'
        }));

        const redFlags = input.redFlags || {};
        const stopFlags = [
            ['personalAccount', 'Company payment directed to a personal account'],
            ['changedAccount', 'Bank account changed shortly before payment'],
            ['accountNameMismatch', 'Account name does not match the invoice seller'],
            ['avoidanceRequest', 'A party suggested bypassing bank or compliance review']
        ];
        stopFlags.forEach(([key, title]) => {
            if (yes(redFlags[key])) issues.push(issue({ category: 'Payment red flag', severity: 'stop', title,
                basis: 'Fact: this red flag was selected by the user.', next: 'Stop and independently verify the instruction through established contact details and professional review.' }));
        });
        [
            ['splitPayment', 'Payment is split without a documented commercial reason'],
            ['routeMismatch', 'Payment country has no clear relationship to the trade route'],
            ['unusualPrice', 'Price appears materially unusual'],
            ['vagueGoods', 'Goods description is too vague'],
            ['unclearEndUse', 'Final user or end use is unclear'],
            ['potentialRestrictedParty', 'Potential restricted-party name similarity requires human confirmation'],
            ['controlledGoodsConcern', 'Goods may require export-control or sanctions review']
        ].forEach(([key, title]) => {
            if (yes(redFlags[key])) issues.push(issue({ category: 'Risk signal', severity: 'professional_review', title,
                basis: key === 'potentialRestrictedParty'
                    ? 'User-reported signal only: a similar name is not a confirmed restricted-party match.'
                    : 'Fact: this risk signal was selected by the user.',
                missing: 'Independent evidence and transaction-specific professional confirmation.',
                next: 'Obtain bank, sanctions/export-control or legal review as applicable; do not infer approval from this screen.' }));
        });

        const documentChecks = input.documentChecks || {};
        const documentLabels = {
            parties: 'Party names across contract, PO and invoice', amountCurrency: 'Amount and currency',
            goods: 'Goods, model and quantity', incoterm: 'Incoterm', route: 'Transport parties and route'
        };
        Object.entries(documentLabels).forEach(([key, label]) => {
            const value = documentChecks[key] || 'unknown';
            if (value === 'no') issues.push(issue({ category: 'Document consistency', severity: 'stop', title: `${label} do not match`,
                basis: 'Fact: the user reported a document mismatch.', next: 'Correct or formally explain the mismatch before submitting payment documents.' }));
            if (value === 'unknown') issues.push(issue({ category: 'Document consistency', title: `${label} not yet checked`,
                basis: 'Unknown: no consistency confirmation was supplied.', missing: label, next: 'Compare the relevant documents and record the exact discrepancy, if any.' }));
        });

        const highestRank = issues.reduce((rank, item) => Math.max(rank, LEVELS[item.severity]?.rank ?? 1), 0);
        const levelKey = Object.keys(LEVELS).find((key) => LEVELS[key].rank === highestRank) || 'ready';
        const checklist = [
            'Signed contract or purchase order showing the correct legal parties and commercial purpose',
            'Commercial invoice with specific goods, model, quantity, amount, currency and Incoterm',
            'Packing list and available transport document consistent with the invoice and route',
            'Bank-account ownership evidence obtained through an independently verified channel',
            'Explanation and supporting evidence for every agent, affiliate or third-party payer/payee',
            'End-user/end-use and export-control or sanctions review evidence where the goods or route require it'
        ];
        const conclusion = levelKey === 'ready' ? {
            basis: 'Fact: the user reported complete core fields, matching document fields and no listed red flag.',
            missing: 'Unknown: TraceWize has not verified identities, bank-account ownership, documents, restricted-party status or bank acceptance.',
            next: 'Independently verify account instructions and submit the authentic transaction package to the bank for its own review.'
        } : {
            basis: `Fact/unknown summary: ${issues.length} issue${issues.length === 1 ? '' : 's'} arose from the structured answers.`,
            missing: 'Each finding below identifies the evidence or clarification not yet established.',
            next: levelKey === 'stop'
                ? 'Do not proceed until every stop issue is independently resolved.'
                : 'Resolve the findings and obtain professional or bank confirmation where identified.'
        };
        return { level: levelKey, label: LEVELS[levelKey].label, facts, issues, checklist, conclusion };
    }

    return { LEVELS, assess };
}));
