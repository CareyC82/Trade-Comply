'use strict';

const COUNTRY_CONFIG = {
    EU: { codeLengths: [8, 10], rateFields: ['third_country_duty', 'erga_omnes_rate', 'duty_rate', 'base_rate'] },
    CN: { codeLengths: [8, 10], rateFields: ['mfn_rate', 'most_favoured_nation_rate', 'duty_rate', 'base_rate'] },
    SG: { codeLengths: [8, 10], rateFields: ['mfn_rate', 'customs_duty_rate', 'duty_rate', 'base_rate'] },
    MX: { codeLengths: [8, 10], rateFields: ['igi_rate', 'general_import_tax', 'duty_rate', 'base_rate'] },
    AU: { codeLengths: [8, 10], rateFields: ['general_rate', 'duty_rate', 'base_rate'] },
    NZ: { codeLengths: [8, 10], rateFields: ['normal_rate', 'duty_rate', 'base_rate'] }
};

function normalizeTariffCode(value = '') {
    return String(value).replace(/\D/g, '');
}

function firstValue(row, fields) {
    for (const field of fields) {
        if (row?.[field] !== undefined && row?.[field] !== null && String(row[field]).trim() !== '') {
            return row[field];
        }
    }
    return undefined;
}

function normalizeRate(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) throw new Error('Tariff rate must be a non-negative number.');
        return value > 1 ? value / 100 : value;
    }
    const text = String(value ?? '').trim();
    if (/^(free|exempt|nil|0(?:\.0+)?%?)$/i.test(text)) return 0;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) throw new Error(`Unsupported tariff rate: ${text || 'missing'}`);
    const number = Number(match[0]);
    if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid tariff rate: ${text}`);
    return text.includes('%') || number > 1 ? number / 100 : number;
}

function normalizeDate(value, fallback = '') {
    const text = String(value || fallback || '').trim();
    if (!text) return '';
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid effective date: ${text}`);
    return parsed.toISOString().slice(0, 10);
}

function parseExactTariffRows(payload, { country, checkedAt = new Date().toISOString() } = {}) {
    const market = String(country || payload?.country || '').toUpperCase();
    const config = COUNTRY_CONFIG[market];
    if (!config) throw new Error(`Unsupported exact tariff market: ${market || 'missing'}`);
    if (payload?.complete !== true) throw new Error(`${market} exact tariff feed must declare complete: true`);
    const source = payload.source || {};
    if (!/^https:\/\//i.test(String(source.url || source.source_url || ''))) {
        throw new Error(`${market} exact tariff feed requires an HTTPS official source URL`);
    }
    const rawRows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.data) ? payload.data : [];
    if (!rawRows.length) throw new Error(`${market} exact tariff feed returned no rows`);
    const rows = rawRows.map((raw, index) => {
        const hsCode = normalizeTariffCode(firstValue(raw, [
            'hs_code', 'taric_code', 'cn_code', 'commodity_code', 'ahtn_code', 'tigie_code', 'nico_code', '税则号列'
        ]));
        if (!config.codeLengths.includes(hsCode.length)) {
            throw new Error(`${market} row ${index + 1} must contain an exact ${config.codeLengths.join('/')} digit tariff code`);
        }
        const baseRate = normalizeRate(firstValue(raw, config.rateFields));
        const effectiveFrom = normalizeDate(firstValue(raw, ['effective_from', 'valid_from', 'start_date']), payload.effective_from);
        const effectiveTo = normalizeDate(firstValue(raw, ['effective_to', 'valid_to', 'end_date']), payload.effective_to);
        if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
            throw new Error(`${market} ${hsCode} has an invalid effective-date range`);
        }
        return {
            hs_code: hsCode,
            base_rate: baseRate,
            measure_type: String(firstValue(raw, ['measure_type', 'rate_type', 'tariff_type']) || 'mfn_base_duty'),
            origin_scope: String(firstValue(raw, ['origin_scope', 'origin', 'geographical_area']) || 'ERGA_OMNES'),
            description: String(firstValue(raw, ['description', 'goods_description', 'commodity_description']) || ''),
            effective_from: effectiveFrom || null,
            effective_to: effectiveTo || null,
            source_status: 'official_source_checked',
            confidence: 'Official exact tariff line',
            source_url: firstValue(raw, ['source_url']) || source.url || source.source_url,
            source_name: firstValue(raw, ['source_name']) || source.name || source.authority || '',
            source_revision: source.revision || payload.revision || '',
            last_checked_at: checkedAt
        };
    });
    const unique = new Map();
    rows.forEach((row) => {
        const key = `${row.hs_code}|${row.origin_scope}|${row.effective_from || ''}|${row.effective_to || ''}`;
        const current = unique.get(key);
        if (current && current.base_rate !== row.base_rate) {
            throw new Error(`${market} exact tariff feed has conflicting rates for ${row.hs_code}`);
        }
        unique.set(key, row);
    });
    return [...unique.values()].sort((a, b) => a.hs_code.localeCompare(b.hs_code));
}

function rowIsEffective(row, entryDate) {
    const date = String(entryDate || new Date().toISOString().slice(0, 10));
    return (!row.effective_from || row.effective_from <= date)
        && (!row.effective_to || row.effective_to >= date);
}

function selectExactTariffLine(rows, hsCode, { entryDate, originScope = 'ERGA_OMNES' } = {}) {
    const normalized = normalizeTariffCode(hsCode);
    if (normalized.length < 8) return null;
    const matches = (rows || []).filter((row) => (
        normalizeTariffCode(row.hs_code) === normalized
        && rowIsEffective(row, entryDate)
        && (!originScope || row.origin_scope === originScope || row.origin_scope === 'ERGA_OMNES')
    ));
    if (matches.length !== 1) return null;
    return matches[0];
}

function applyExactTariffRows(payload, country, rows) {
    const market = String(country || '').toUpperCase();
    const targetMarkets = market === 'EU' ? new Set(['EU', 'DE', 'NL']) : new Set([market]);
    const changes = [];
    for (const rule of payload.rules || []) {
        if (!targetMarkets.has(rule.import_country)) continue;
        const prefixes = rule.hs_prefixes || [];
        const scoped = rows.filter((row) => prefixes.some((prefix) => row.hs_code.startsWith(normalizeTariffCode(prefix))));
        if (!scoped.length) continue;
        const previous = JSON.stringify(rule.exact_code_overrides || []);
        const maintainedCandidates = (rule.exact_code_overrides || []).filter((row) => (
            normalizeTariffCode(row.hs_code).length < 8
            && !String(row.confidence || '').toLowerCase().includes('official exact tariff line')
        ));
        const officialExact = scoped.map((row) => ({
            ...row,
            source_hts: `${row.hs_code} (${market} official exact tariff line)`,
            source_rate_text: `${(row.base_rate * 100).toFixed(3)}% base customs duty`,
            source_note: 'Official exact tariff-line base duty. VAT/GST, trade remedies, preferences, licensing, and product controls remain separate layers.'
        }));
        rule.exact_code_overrides = [...maintainedCandidates, ...officialExact];
        if (previous !== JSON.stringify(rule.exact_code_overrides)) changes.push(rule.id);
    }
    return changes;
}

module.exports = {
    COUNTRY_CONFIG,
    normalizeTariffCode,
    normalizeRate,
    parseExactTariffRows,
    selectExactTariffLine,
    applyExactTariffRows
};
