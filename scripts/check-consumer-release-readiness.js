'use strict';

const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/can-i-sell-it');
const models = require('../lib/wearable-product-models');

const ROOT = path.join(__dirname, '..');
const DAY_MS = 24 * 60 * 60 * 1000;

function runConsumerReleaseReadiness({ now = Date.now(), maxSourceAgeDays = 370 } = {}) {
    const errors = [];
    const products = models.listProducts().filter((item) => item.id !== 'wearable_other');
    if (products.length !== 25) errors.push(`Expected 25 maintained products; found ${products.length}.`);

    Object.entries(models.sources).forEach(([id, source]) => {
        if (!source.url || !/^https:\/\//.test(source.url)) errors.push(`${id}: missing HTTPS official source URL.`);
        if (!source.reviewedAt || !source.confidence) errors.push(`${id}: missing review date or confidence.`);
        const reviewed = Date.parse(source.reviewedAt || '');
        if (!Number.isFinite(reviewed)) errors.push(`${id}: invalid review date.`);
        else if (now - reviewed > maxSourceAgeDays * DAY_MS) errors.push(`${id}: source review is overdue.`);
    });

    const forbiddenByMarket = {
        US: ['red', 'jp_radio', 'jp_pse', 'sg_imda', 'sg_safety'],
        EU: ['fcc', 'jp_radio', 'jp_pse', 'sg_imda', 'sg_safety'],
        JP: ['fcc', 'red', 'sg_imda', 'sg_safety'],
        SG: ['fcc', 'red', 'jp_radio', 'jp_pse']
    };
    products.forEach((product) => Object.entries(forbiddenByMarket).forEach(([market, forbidden]) => {
        const result = engine.assess({
            description: product.label,
            market,
            platform: 'Amazon',
            attributes: { productType: product.id, ...(product.defaults || {}) },
            assessmentMode: 'quick',
            blockingQuestionKeys: []
        });
        forbidden.forEach((id) => {
            if (result.requirements.some((item) => item.id === id)) errors.push(`${product.id}/${market}: leaked ${id}.`);
        });
    }));

    const html = fs.readFileSync(path.join(ROOT, 'can-i-sell-it.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'js/can-i-sell-it-page.js'), 'utf8');
    const unsupported = engine.assess({ description: 'cotton summer dress', market: 'US', platform: 'Amazon', assessmentMode: 'quick', blockingQuestionKeys: [] });
    [
        ['viewport meta tag', /name="viewport"/i.test(html)],
        ['mobile result breakpoint', /@media\s*\(max-width:\s*700px\)/.test(css)],
        ['single-column review actions', /\.sell-review-actions\s*\{[^}]*grid-template-columns:\s*1fr/s.test(css)],
        ['unsupported coverage exit', unsupported.sellerConclusion.code === 'not_enough_information' && unsupported.marketCoverage.level === 'unsupported'],
        ['manual email CTA', /reviewContact\.mailto/.test(page) && /Copy request/.test(page)],
        ['local supplier-request download', /sell-download-supplier-request/.test(page) && /URL\.createObjectURL/.test(page)],
        ['private API fallback', /Private workspace server is unavailable/.test(page)],
        ['visible upload limits', /up to 5 files, 10 MB each/i.test(html)],
        ['client upload count guard', /MAX_UPLOAD_FILES\s*=\s*5/.test(page)],
        ['client upload size guard', /MAX_UPLOAD_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/.test(page)]
    ].forEach(([label, valid]) => { if (!valid) errors.push(`UI contract missing: ${label}.`); });

    return { ok: errors.length === 0, errors, productCount: products.length, sourceCount: Object.keys(models.sources).length };
}

if (require.main === module) {
    const result = runConsumerReleaseReadiness();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
}

module.exports = { runConsumerReleaseReadiness };
