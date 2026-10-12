(function initAdminRegulationsByCountry(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TraceWizeAdminRegulations = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildModule() {
    'use strict';

    const normalize = (value) => String(value || '').trim();
    const normalizeLower = (value) => normalize(value).toLowerCase();

    function sourceHealth(tag, snapshots = [], degradedSources = []) {
        const url = normalizeLower(tag.source_url);
        const authority = normalizeLower(tag.source_citation);
        const snapshot = snapshots.find((row) => {
            const urls = [row.url, row.monitored_url].map(normalizeLower).filter(Boolean);
            return (url && urls.includes(url)) || (authority && normalizeLower(row.id).includes(authority.replace(/[^a-z0-9]+/g, '-')));
        });
        if (snapshot) {
            if (snapshot.status === 'last_good_degraded' || snapshot.preserved_last_good) return 'last_good';
            if (snapshot.status === 'manual_review_current') return 'manual_current';
            if (snapshot.status === 'current') return 'current';
        }
        const degraded = degradedSources.some((row) => normalize(row.country) === normalize(tag.country));
        return degraded ? 'country_caveat' : 'not_monitored';
    }

    function coverageLevel(tag) {
        if (tag.source_type === 'official' && Number(tag.confidence_score || 0) >= 0.9) return 'official_exact';
        if (tag.source_url && tag.source_citation) return 'official_linked';
        if (tag.tag_type === 'CHECK_REQUIRED') return 'preliminary';
        return 'monitor';
    }

    function buildRows(tags = [], registry = {}, snapshotsPayload = {}, accuracy = {}) {
        const labels = Object.fromEntries((registry.route_options || []).map((row) => [row.value, row.label]));
        const snapshots = snapshotsPayload.sources || [];
        const degraded = accuracy.source_control?.degraded_sources || [];
        return tags.filter((tag) => tag && tag.tag_id && tag.country).map((tag) => ({
            id: tag.tag_id,
            country: tag.country,
            countryLabel: labels[tag.country] || tag.country,
            name: tag.short_name || tag.category_label || tag.tag_id,
            description: tag.short_description || tag.description || '',
            category: tag.category || 'OTHER',
            categoryLabel: tag.category_label || tag.category || 'Other',
            direction: tag.direction || tag.route_focus || 'unspecified',
            status: tag.status || tag.effective_status || 'UNKNOWN',
            effectiveDate: tag.effective_date || '',
            lastVerifiedAt: tag.last_verified_at || '',
            authority: tag.source_citation || 'Source not recorded',
            sourceUrl: tag.source_url || '',
            sourceHealth: sourceHealth(tag, snapshots, degraded),
            coverageLevel: coverageLevel(tag),
            hsCodes: tag.related_hs_codes || (tag.hs_code ? [tag.hs_code] : []),
            keywords: tag.related_keywords || [],
            riskLevel: tag.risk_level || 'Not stated',
            checklist: tag.checklist || []
        })).sort((a, b) => a.countryLabel.localeCompare(b.countryLabel) || a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
    }

    function filterRows(rows = [], filters = {}) {
        const query = normalizeLower(filters.query);
        return rows.filter((row) => {
            if (filters.country && row.country !== filters.country) return false;
            if (filters.category && row.category !== filters.category) return false;
            if (filters.status && row.status !== filters.status) return false;
            if (filters.sourceHealth && row.sourceHealth !== filters.sourceHealth) return false;
            if (!query) return true;
            return [row.id, row.name, row.description, row.authority, row.categoryLabel, row.countryLabel, ...row.hsCodes, ...row.keywords]
                .some((value) => normalizeLower(value).includes(query));
        });
    }

    function summarize(rows = []) {
        return rows.reduce((summary, row) => {
            summary.total += 1;
            summary.countries.add(row.country);
            if (row.status === 'ACTIVE') summary.active += 1;
            if (row.status === 'FUTURE' || row.status === 'PENDING') summary.future += 1;
            if (['last_good', 'country_caveat'].includes(row.sourceHealth)) summary.caveat += 1;
            return summary;
        }, { total: 0, countries: new Set(), active: 0, future: 0, caveat: 0 });
    }

    return { buildRows, filterRows, summarize, sourceHealth, coverageLevel };
}));
