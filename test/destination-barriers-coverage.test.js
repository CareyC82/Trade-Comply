const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../data/tags.json');

const DESTINATION_QUERIES = [
    'smart speaker wifi',
    'tablet computer wifi',
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
const NEW_ROUTE_COVERAGE = [
    { focus: 'export', country: 'DE', query: 'energy storage battery system', expected: 'CL-DE-001' },
    { focus: 'import', country: 'DE', query: 'ev charger', expected: 'CL-DE-002' },
    { focus: 'export', country: 'NL', query: 'semiconductor lithography equipment', expected: 'CL-NL-002' },
    { focus: 'export', country: 'SG', query: 'gpu ai accelerator chip', expected: 'CL-SG-001' },
    { focus: 'import', country: 'SG', query: 'wireless router wifi telecom equipment', expected: 'CL-SG-003' },
    { focus: 'import', country: 'SG', query: 'power adapter charger safety mark', expected: 'CL-SG-004' },
    { focus: 'import', country: 'SG', query: 'energy storage battery system', expected: 'CL-SG-006' },
    { focus: 'import', country: 'MX', query: 'ev charger', expected: 'CL-MX-001' },
    { focus: 'import', country: 'MX', query: 'wireless router wifi telecom equipment', expected: 'CL-MX-004' },
    { focus: 'import', country: 'MX', query: 'tablet computer spanish label warranty', expected: 'CL-MX-005' },
    { focus: 'import', country: 'MX', query: 'semiconductor chip import classification', expected: 'CL-MX-006' },
    { focus: 'import', country: 'JP', query: 'wireless router wifi telecom equipment', expected: 'CL-JP-003' },
    { focus: 'import', country: 'JP', query: 'power adapter charger pse', expected: 'CL-JP-004' },
    { focus: 'import', country: 'JP', query: 'semiconductor chip import classification', expected: 'CL-JP-005' },
    { focus: 'import', country: 'KR', query: 'wireless router wifi telecom equipment', expected: 'CL-KR-003' },
    { focus: 'import', country: 'KR', query: 'power adapter charger kc', expected: 'CL-KR-004' },
    { focus: 'import', country: 'KR', query: 'semiconductor chip import classification', expected: 'CL-KR-005' },
    { focus: 'import', country: 'VN', query: 'vietnam wireless router wifi telecom equipment', expected: 'CL-VN-001' },
    { focus: 'import', country: 'VN', query: 'power adapter charger energy label', expected: 'CL-VN-002' },
    { focus: 'import', country: 'VN', query: 'energy storage battery system lithium battery', expected: 'CL-VN-004' },
    { focus: 'import', country: 'VN', query: 'semiconductor chip import classification', expected: 'CL-VN-003' },
    { focus: 'import', country: 'MY', query: 'malaysia wireless router wifi telecom equipment', expected: 'CL-MY-001' },
    { focus: 'import', country: 'MY', query: 'power adapter charger coa', expected: 'CL-MY-002' },
    { focus: 'import', country: 'MY', query: 'energy storage battery system lithium battery', expected: 'CL-MY-004' },
    { focus: 'import', country: 'MY', query: 'semiconductor chip import classification', expected: 'CL-MY-003' }
];

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

function routeFocusMatches(query, country, focus) {
    return tags.filter((tag) => (
        tag.direction === 'export'
        && tag.country === country
        && (!tag.route_focus || tag.route_focus === focus)
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

    for (const row of NEW_ROUTE_COVERAGE) {
        it(`has ${row.country} ${row.focus} coverage for ${row.query}`, () => {
            const matches = routeFocusMatches(row.query, row.country, row.focus);
            assert.ok(
                matches.some((tag) => tag.tag_id === row.expected),
                `expected ${row.expected}; got ${matches.map((tag) => tag.tag_id).join(', ')}`
            );
        });
    }
});
