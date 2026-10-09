'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/payment-readiness');

const base = {
    buyer: 'Example Buyer LLC', buyerCountry: 'US', seller: 'Example Seller Ltd', sellerCountry: 'CN',
    payer: 'Example Buyer LLC', payerCountry: 'US', payee: 'Example Seller Ltd', payeeCountry: 'CN',
    goods: '500 model TW-65W USB-C GaN chargers', use: 'Retail sale to general consumers',
    origin: 'CN', destination: 'US', amount: 25000, currency: 'USD', paymentMethod: 'Bank transfer / T/T', incoterm: 'FOB',
    documentChecks: { parties: 'yes', amountCurrency: 'yes', goods: 'yes', incoterm: 'yes', route: 'yes' }, redFlags: {}
};

test('a complete transaction with no reported inconsistency returns bounded Ready status', () => {
    const result = engine.assess(base);
    assert.equal(result.level, 'ready');
    assert.equal(result.label, 'Ready');
    assert.ok(result.checklist.length >= 5);
    assert.match(result.conclusion.missing, /not verified/);
});

test('party mismatch and account red flags stop payment without suggesting a workaround', () => {
    const result = engine.assess({ ...base, payee: 'Unrelated Person', redFlags: { personalAccount: true } });
    assert.equal(result.level, 'stop');
    assert.ok(result.issues.some((item) => /Payee does not match seller/.test(item.title)));
    assert.ok(result.issues.every((item) => !/split|third country|alternative account/i.test(item.next)));
});

test('potential name similarity is not presented as a confirmed sanctions match', () => {
    const result = engine.assess({ ...base, redFlags: { potentialRestrictedParty: true } });
    assert.equal(result.level, 'professional_review');
    const item = result.issues.find((row) => /restricted-party/.test(row.title));
    assert.match(item.basis, /not a confirmed/);
});

test('unknown document checks require clarification and preserve missing facts', () => {
    const result = engine.assess({ ...base, documentChecks: {} });
    assert.equal(result.level, 'clarification');
    assert.equal(result.issues.filter((item) => item.category === 'Document consistency').length, 5);
});

test('payment page is local-only, accessible and explicit about boundaries', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'can-i-pay.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'payment-readiness-page.js'), 'utf8');
    assert.match(html, /Can I Pay \/ Get Paid/);
    assert.match(html, /does not hold or transmit funds/);
    assert.match(html, /not a payment provider/);
    assert.doesNotMatch(html, /type="file"/);
    assert.match(html, /role="alert"/);
    assert.match(script, /mailto:carey@tracewize\.com/);
    assert.doesNotMatch(script, /fetch\s*\(/);
    assert.doesNotMatch(script, /`Goods:\s*\$\{facts\.goods/);
    assert.doesNotMatch(script, /`Amount:\s*\$\{facts\.currency/);
});
