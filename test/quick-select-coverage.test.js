const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');

function scoreTag(tag, productName) {
    const product = productName.toLowerCase();
    let score = 0;

    (tag.related_keywords || []).forEach((keyword) => {
        const term = String(keyword).toLowerCase();
        if (term && product.includes(term)) score += term.length > 8 ? 3 : 2;
    });

    const blob = [
        tag.short_description,
        tag.description,
        tag.risk_scenarios
    ].filter(Boolean).join(' ').toLowerCase();

    product.split(/\s+/).forEach((word) => {
        if (word.length > 2 && blob.includes(word)) score += 1;
    });

    return score;
}

function matchExportTags(productName) {
    return tags
        .filter((tag) => !tag.direction || tag.direction === 'export' || tag.direction === 'both')
        .filter((tag) => scoreTag(tag, productName) >= 2)
        .map((tag) => tag.tag_id);
}

describe('quick-select product coverage', () => {
    it('keeps IP camera network storage from rendering as no regulations', () => {
        const matchedIds = matchExportTags('ip camera network storage');
        assert.ok(matchedIds.includes('CL-CAM-001'));
        assert.ok(matchedIds.includes('CL-DU-001'));
        assert.ok(matchedIds.length >= 3);
    });

    it('keeps drone UAV under 2kg from rendering as no regulations', () => {
        const matchedIds = matchExportTags('drone uav under 2kg');
        assert.ok(matchedIds.includes('CL-UAV-001'));
        assert.ok(matchedIds.includes('CL-DU-002'));
        assert.ok(matchedIds.length >= 4);
    });

    it('keeps tablet computer from rendering as no regulations', () => {
        const matchedIds = matchExportTags('tablet computer wifi');
        assert.ok(matchedIds.includes('CL-CCC-002'));
        assert.ok(matchedIds.includes('CL-USMARKET-001'));
        assert.ok(matchedIds.length >= 3);
    });
});
