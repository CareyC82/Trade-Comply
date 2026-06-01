const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');

const DESTINATION_QUERIES = [
    'smart speaker wifi',
    'ip camera network storage',
    'drone uav under 2kg',
    'solar panel photovoltaic',
    'energy storage battery system',
    'gpu ai accelerator chip',
    'optical transceiver module',
    'industrial robot arm'
];

const DESTINATIONS = ['US', 'EU', 'ASEAN', 'RU'];
const ORIGINS = ['US', 'TW', 'JP', 'KR'];

function scoreTag(tag, query) {
    const product = query.toLowerCase();
    const words = product.split(/\s+/).filter(Boolean);
    let score = 0;

    (tag.related_keywords || []).forEach((keyword) => {
        const term = String(keyword).toLowerCase();
        if (!term) return;
        if (product.includes(term)) {
            score += term.length > 8 ? 4 : 3;
            return;
        }
        words.forEach((word) => {
            if (word.length >= 4 && term.includes(word)) {
                score += 1;
            }
        });
    });

    return score;
}

function destinationMatches(query, country) {
    return tags.filter((tag) => (
        tag.direction === 'export'
        && tag.country === country
        && scoreTag(tag, query) >= 4
    ));
}

function originMatches(query, country) {
    return tags.filter((tag) => (
        tag.direction === 'import'
        && tag.country === country
        && scoreTag(tag, query) >= 4
    ));
}

describe('destination barriers coverage', () => {
    for (const country of DESTINATIONS) {
        it(`has ${country} destination coverage for representative quick-select products`, () => {
            for (const query of DESTINATION_QUERIES) {
                const matches = destinationMatches(query, country);
                assert.ok(
                    matches.length > 0,
                    `expected ${country} destination barrier for ${query}`
                );
            }
        });
    }

    for (const country of ORIGINS) {
        it(`has ${country} origin coverage for representative import-into-China products`, () => {
            for (const query of DESTINATION_QUERIES) {
                const matches = originMatches(query, country);
                assert.ok(
                    matches.length > 0,
                    `expected ${country} origin rule for ${query}`
                );
            }
        });
    }
});
