const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../data/coverage-audit.json');

function country(code) {
    return audit.countries.find((entry) => entry.country === code);
}

describe('coverage audit', () => {
    it('tracks all route countries that need coverage decisions', () => {
        const countries = audit.countries.map((entry) => entry.country).sort();
        assert.deepEqual(countries, ['ASEAN', 'CN', 'DE', 'EU', 'IN', 'JP', 'KR', 'MX', 'MY', 'NL', 'RU', 'SG', 'TW', 'US', 'VN']);
    });

    it('keeps recently added import-side markets out of empty status', () => {
        for (const code of ['SG', 'MX', 'VN', 'MY', 'JP', 'KR', 'IN']) {
            const entry = country(code);
            assert.ok(entry, `missing ${code}`);
            assert.notEqual(entry.destination_import.status, 'none', `${code} import coverage should exist`);
            assert.ok(entry.destination_import.tag_count >= 3, `${code} should have multiple import-side rules`);
            assert.ok(entry.destination_import.case_count >= 3, `${code} should have import-side cases`);
        }
    });

    it('tracks China baseline rules and linked cases', () => {
        const entry = country('CN');
        assert.ok(entry, 'missing CN');
        assert.notEqual(entry.destination_import.status, 'none');
        assert.notEqual(entry.origin_export.status, 'none');
        assert.ok(entry.destination_import.case_count > 0, 'CN import should have linked cases');
        assert.ok(entry.origin_export.case_count > 0, 'CN export should have linked cases');
    });

    it('has no high-priority route coverage gaps after baseline seeding', () => {
        const highPriority = audit.next_actions.filter((item) => item.priority === 'high');
        assert.deepEqual(highPriority, []);
        assert.equal(audit.next_actions.length, 0);
    });

    it('keeps every maintained route focus at strong compliance-rule coverage', () => {
        audit.countries.forEach((entry) => {
            assert.equal(entry.destination_import.status, 'strong', `${entry.country} destination import should be strong`);
            assert.equal(entry.origin_export.status, 'strong', `${entry.country} origin export should be strong`);
            assert.deepEqual(entry.destination_import.gaps, [], `${entry.country} import gaps should be empty`);
            assert.deepEqual(entry.origin_export.gaps, [], `${entry.country} export gaps should be empty`);
            assert.ok(entry.destination_import.case_count > 0, `${entry.country} import cases should exist`);
            assert.ok(entry.origin_export.case_count > 0, `${entry.country} export cases should exist`);
        });
    });
});
