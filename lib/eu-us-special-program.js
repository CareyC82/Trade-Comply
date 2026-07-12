/**
 * Regulation (EU) 2026/1455 annex matching shared by Post-Entry and Opportunity.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.TraceWizeEuUsSpecialProgram = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function normalizeCountry(value) {
        return String(value || '').trim().toUpperCase();
    }

    function normalizeCnCode(value) {
        return String(value || '')
            .replace(/^ex\s+/i, '')
            .replace(/\D/g, '');
    }

    function normalizeEntryDate(value) {
        const input = String(value || '').trim();
        const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
        const short = input.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
        if (!short) return '';
        const year = short[3].length === 2 ? `20${short[3]}` : short[3];
        return `${year}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`;
    }

    function findProgram(programs = [], { importCountry, originCountry } = {}) {
        const destination = normalizeCountry(importCountry);
        const origin = normalizeCountry(originCountry);
        return asArray(programs).find((program) => (
            program?.id === 'EU-US-2026-1455'
            && asArray(program.import_markets).map(normalizeCountry).includes(destination)
            && asArray(program.origin_countries).map(normalizeCountry).includes(origin)
        )) || null;
    }

    function findAnnexMatches(program = {}, hsCode = '') {
        const normalizedHs = normalizeCnCode(hsCode);
        if (!normalizedHs) return [];
        const annexes = program.annexes || {};
        return ['I', 'II', 'III'].flatMap((annex) => {
            const entries = asArray(annexes[annex]?.entries);
            const matches = entries.filter((entry) => {
                const normalizedEntry = entry.normalized_code || normalizeCnCode(entry.cn_code);
                return normalizedEntry && normalizedHs.startsWith(normalizedEntry);
            });
            if (!matches.length) return [];
            const bestLength = Math.max(...matches.map((entry) => (entry.normalized_code || normalizeCnCode(entry.cn_code)).length));
            return matches
                .filter((entry) => (entry.normalized_code || normalizeCnCode(entry.cn_code)).length === bestLength)
                .map((entry) => ({
                    annex,
                    cnCode: entry.cn_code,
                    normalizedCode: entry.normalized_code || normalizeCnCode(entry.cn_code),
                    description: entry.description || '',
                    exCode: Boolean(entry.ex_code),
                    treatment: entry.treatment || annexes[annex]?.treatment || '',
                    suspendedAdValoremRate: entry.suspended_ad_valorem_rate ?? null,
                    orderNumber: entry.order_number || '',
                    inQuotaRate: entry.in_quota_rate || '',
                    inQuotaAdValoremRate: entry.in_quota_ad_valorem_rate ?? null,
                    quotaVolume: entry.quota_volume || '',
                    matchLevel: (entry.normalized_code || normalizeCnCode(entry.cn_code)).length === 2
                        ? 'chapter'
                        : 'cn_line',
                    descriptionConfirmationRequired: Boolean(entry.ex_code)
                }));
        });
    }

    function resolveProgramTreatment({
        programs = [],
        importCountry,
        originCountry,
        hsCode,
        entryDate,
        descriptionConfirmed,
        originEvidenceConfirmed,
        transportEvidenceConfirmed,
        declarationCodesConfirmed,
        quotaAvailable,
        specificDutyConfirmed
    } = {}) {
        const program = findProgram(programs, { importCountry, originCountry });
        if (!program) {
            return {
                appliesToRoute: false,
                matched: false,
                eligible: false,
                eligibility: resolveEligibilityStatus({ appliesToRoute: false }, {}),
                program: null,
                matches: []
            };
        }
        const matches = findAnnexMatches(program, hsCode);
        const quotaOrderNumbers = matches.filter((row) => row.annex === 'III').map((row) => row.orderNumber);
        const quotaRows = asArray(program.quota_status?.rows).filter((row) => quotaOrderNumbers.includes(row.order_number));
        const quotaBalanceAvailable = quotaRows.some((row) => row.available === true);
        const requiresDescriptionConfirmation = matches.some((row) => row.descriptionConfirmationRequired);
        const normalizedEntryDate = normalizeEntryDate(entryDate);
        const effectiveFrom = normalizeEntryDate(program.effective_from);
        const effectiveOnEntryDate = !normalizedEntryDate || !effectiveFrom || normalizedEntryDate >= effectiveFrom;
        const eligibility = resolveEligibilityStatus({
            appliesToRoute: true,
            matched: matches.length > 0,
            effectiveOnEntryDate,
            entryDate: normalizedEntryDate,
            requiresDescriptionConfirmation,
            matches
        }, {
            descriptionConfirmed,
            originEvidenceConfirmed,
            transportEvidenceConfirmed,
            declarationCodesConfirmed,
            quotaAvailable,
            specificDutyConfirmed
        });
        return {
            appliesToRoute: true,
            matched: matches.length > 0,
            eligible: matches.length > 0 && !requiresDescriptionConfirmation && effectiveOnEntryDate,
            eligibility,
            requiresDescriptionConfirmation,
            effectiveOnEntryDate,
            entryDate: normalizedEntryDate,
            effectiveFrom,
            program,
            matches,
            quotaRows,
            quotaBalanceAvailable,
            quotaLastChecked: program.quota_status?.checked_at || '',
            treatmentLabel: matches.map((row) => `Annex ${row.annex}: ${row.treatment}`).join(' · '),
            scopeStatus: !effectiveOnEntryDate
                ? 'not_effective_on_entry_date'
                : matches.length
                ? requiresDescriptionConfirmation ? 'description_confirmation_required' : 'annex_matched'
                : 'not_listed_in_annex'
        };
    }

    function resolveEligibilityStatus(treatment = {}, evidence = {}) {
        if (!treatment.appliesToRoute || !treatment.matched || treatment.effectiveOnEntryDate === false) {
            return {
                status: 'not_eligible',
                label: 'Not eligible',
                reason: treatment.effectiveOnEntryDate === false
                    ? 'The entry date is outside the program effective period.'
                    : 'The route or declared CN code is not covered by the official Annex scope.',
                missing: []
            };
        }
        const missing = [];
        if (!treatment.entryDate) missing.push('Entry date confirmation');
        if (treatment.requiresDescriptionConfirmation && evidence.descriptionConfirmed !== true) {
            missing.push('Official ex-code product description confirmation');
        }
        if (evidence.originEvidenceConfirmed !== true) missing.push('US non-preferential origin evidence');
        if (evidence.transportEvidenceConfirmed !== true) missing.push('Article 59a transport/non-alteration evidence');
        if (evidence.declarationCodesConfirmed !== true) missing.push('TARIC declaration codes and supporting document');
        const annexII = asArray(treatment.matches).some((row) => row.annex === 'II');
        const annexIII = asArray(treatment.matches).some((row) => row.annex === 'III');
        if (annexII && evidence.specificDutyConfirmed !== true) missing.push('Annex II TARIC specific-duty amount');
        if (annexIII && evidence.quotaAvailable !== true) missing.push('Live Annex III quota availability/allocation');
        if (missing.length) {
            return {
                status: 'potentially_eligible',
                label: 'Potentially eligible',
                reason: 'The route and CN scope match, but filing evidence or a live condition is still incomplete.',
                missing
            };
        }
        return {
            status: 'eligible',
            label: 'Eligible',
            reason: 'The Annex scope, entry date, origin, transport, and declaration evidence are confirmed.',
            missing: []
        };
    }

    return {
        normalizeCnCode,
        normalizeEntryDate,
        findProgram,
        findAnnexMatches,
        resolveProgramTreatment,
        resolveEligibilityStatus
    };
}));
