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

    function recordType(tag) {
        const text = normalizeLower(`${tag.short_name || ''} ${tag.short_description || ''} ${tag.description || ''}`);
        const url = normalizeLower(tag.source_url);
        if (/\bbaseline\b|基线/.test(text)) return 'scope_baseline';
        if (/press-release|enforcement|penalty|violation|罚款|执法/.test(`${url} ${text}`)) return 'enforcement_case';
        if (/guidance|guideline|advisory|指南|指引/.test(text) || tag.source_type === 'official_guidance') return 'official_guidance';
        return 'named_requirement';
    }

    function unique(values = []) {
        return [...new Set(values.flat().filter(Boolean).map(normalize))];
    }

    function reviewState(row, now = Date.now()) {
        if (['last_good', 'country_caveat', 'not_monitored'].includes(row.sourceHealth)) return 'needs_review';
        const effective = Date.parse(row.effectiveDate || '');
        if (Number.isFinite(effective) && effective > now && effective <= now + 120 * 86400000) return 'upcoming';
        const reviewed = Date.parse(row.lastVerifiedAt || '');
        if (Number.isFinite(reviewed) && reviewed < now - 90 * 86400000) return 'review_overdue';
        return 'current';
    }

    function mergeRows(rows = [], now = Date.now()) {
        const grouped = new Map();
        rows.forEach((row) => {
            const key = [row.country, row.sourceUrl || row.authority, row.name, row.category, row.status, row.direction].map(normalizeLower).join('|');
            const existing = grouped.get(key);
            if (!existing) {
                grouped.set(key, { ...row, ids: [row.id], occurrenceCount: 1 });
                return;
            }
            existing.ids.push(row.id);
            existing.occurrenceCount += 1;
            existing.hsCodes = unique([existing.hsCodes, row.hsCodes]);
            existing.keywords = unique([existing.keywords, row.keywords]);
            existing.checklist = unique([existing.checklist, row.checklist]);
            if ((row.description || '').length > (existing.description || '').length) existing.description = row.description;
            if (row.lastVerifiedAt > existing.lastVerifiedAt) existing.lastVerifiedAt = row.lastVerifiedAt;
            if (row.effectiveDate && (!existing.effectiveDate || row.effectiveDate < existing.effectiveDate)) existing.effectiveDate = row.effectiveDate;
        });
        return [...grouped.values()].map((row) => ({ ...row, reviewState: reviewState(row, now) }));
    }

    function buildRows(tags = [], registry = {}, snapshotsPayload = {}, accuracy = {}) {
        const labels = Object.fromEntries((registry.route_options || []).map((row) => [row.value, row.label]));
        const snapshots = snapshotsPayload.sources || [];
        const degraded = accuracy.source_control?.degraded_sources || [];
        const rows = tags.filter((tag) => tag && tag.tag_id && tag.country).map((tag) => ({
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
            checklist: tag.checklist || [],
            recordType: recordType(tag),
            instrumentName: recordType(tag) === 'scope_baseline' ? '' : (tag.short_name || tag.category_label || tag.tag_id)
        }));
        return mergeRows(rows).sort((a, b) => a.countryLabel.localeCompare(b.countryLabel) || a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
    }

    function filterRows(rows = [], filters = {}) {
        const query = normalizeLower(filters.query);
        return rows.filter((row) => {
            if (filters.country && row.country !== filters.country) return false;
            if (filters.category && row.category !== filters.category) return false;
            if (filters.status && row.status !== filters.status) return false;
            if (filters.sourceHealth && row.sourceHealth !== filters.sourceHealth) return false;
            if (filters.reviewState && row.reviewState !== filters.reviewState) return false;
            if (filters.recordType && row.recordType !== filters.recordType) return false;
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

    function summarizeCountries(rows = []) {
        const grouped = new Map();
        rows.forEach((row) => {
            const current = grouped.get(row.country) || { country: row.country, countryLabel: row.countryLabel, total: 0, active: 0, needsReview: 0, upcoming: 0, categories: new Set() };
            current.total += 1;
            current.active += row.status === 'ACTIVE' ? 1 : 0;
            current.needsReview += ['needs_review', 'review_overdue'].includes(row.reviewState) ? 1 : 0;
            current.upcoming += row.reviewState === 'upcoming' ? 1 : 0;
            current.categories.add(row.categoryLabel);
            grouped.set(row.country, current);
        });
        return [...grouped.values()].map((row) => ({ ...row, categories: [...row.categories].sort() }))
            .sort((a, b) => b.needsReview - a.needsReview || a.countryLabel.localeCompare(b.countryLabel));
    }

    function exportRows(rows = []) {
        return rows.map((row) => ({
            country: row.countryLabel, country_code: row.country, regulation: row.name, category: row.categoryLabel,
            status: row.status, direction: row.direction, review_state: row.reviewState, coverage_level: row.coverageLevel,
            record_type: row.recordType, legal_instrument_or_program: row.instrumentName,
            source_health: row.sourceHealth, authority: row.authority, effective_date: row.effectiveDate,
            last_verified_at: row.lastVerifiedAt, hs_scope: row.hsCodes.join('; '), affected_terms: row.keywords.join('; '),
            official_source: row.sourceUrl, merged_rule_count: row.occurrenceCount, rule_ids: row.ids.join('; ')
        }));
    }

    return { buildRows, filterRows, summarize, summarizeCountries, exportRows, mergeRows, reviewState, recordType, sourceHealth, coverageLevel };
}));
