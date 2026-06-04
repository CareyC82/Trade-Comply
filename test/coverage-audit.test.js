const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../data/coverage-audit.json');

function country(code) {
    return audit.countries.find((entry) => entry.country === code);
}

describe('coverage audit', () => {
    it('tracks all route countries that need coverage decisions', () => {
        const countries = audit.countries.map((entry) => entry.country).sort();
        assert.deepEqual(countries, ['ASEAN', 'DE', 'EU', 'JP', 'KR', 'MX', 'MY', 'NL', 'RU', 'SG', 'TW', 'US', 'VN']);
    });

    it('keeps recently added import-side markets out of empty status', () => {
        for (const code of ['SG', 'MX', 'VN', 'MY', 'JP', 'KR']) {
            const entry = country(code);
            assert.ok(entry, `missing ${code}`);
            assert.notEqual(entry.destination_import.status, 'none', `${code} import coverage should exist`);
            assert.ok(entry.destination_import.tag_count >= 3, `${code} should have multiple import-side rules`);
            assert.ok(entry.destination_import.case_count >= 3, `${code} should have import-side cases`);
        }
    });

    it('surfaces next-action gaps for empty or thin route sides', () => {
        const highPriority = audit.next_actions.filter((item) => item.priority === 'high');
        assert.ok(highPriority.some((item) => item.country === 'ASEAN' && item.focus === 'destination_import'));
        assert.ok(highPriority.some((item) => item.country === 'JP' && item.focus === 'origin_export'));
        assert.ok(highPriority.every((item) => item.gaps.length > 0));
    });
});
