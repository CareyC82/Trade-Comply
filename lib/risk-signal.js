/**
 * Unified risk-signal schema (pending + prod) with legacy tag compatibility.
 */

const { normalizeCountryCode } = require('./trade-country');

const RISK_LEVELS = new Set(['High', 'Medium', 'Low']);
const DIRECTIONS = new Set(['export', 'import']);

function normalizeRiskLevel(value) {
    const raw = String(value || 'Medium').trim();
    if (/^high$/i.test(raw)) return 'High';
    if (/^low$/i.test(raw)) return 'Low';
    return 'Medium';
}

function normalizeDirection(value) {
    return value === 'import' ? 'import' : 'export';
}

function validateRiskSignal(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') {
        return { ok: false, errors: ['payload must be an object'] };
    }
    if (!raw.hs_code && !raw.hs_code_keyword) {
        errors.push('hs_code or hs_code_keyword is required');
    }
    if (!DIRECTIONS.has(normalizeDirection(raw.direction))) {
        errors.push('direction must be export or import');
    }
  if (!raw.content_en || String(raw.content_en).trim().length < 10) {
        errors.push('content_en is required');
    }
    if (!raw.source || String(raw.source).trim().length < 2) {
        errors.push('source is required');
    }
    const country = normalizeCountryCode(raw.country);
    if (!country) {
        errors.push('country is required');
    }
    return { ok: errors.length === 0, errors, value: sanitizeRiskSignal(raw) };
}

function sanitizeRiskSignal(raw) {
    const hsCode = String(raw.hs_code || raw.hs_code_keyword || '').trim();
    const direction = normalizeDirection(raw.direction);
    const country = normalizeCountryCode(raw.country);
    const riskLevel = normalizeRiskLevel(raw.risk_level);
    const contentEn = String(raw.content_en || '').trim();
    const contentZh = String(raw.content_zh || raw.content_en || '').trim();
    const source = String(raw.source || '').trim();
    const signalId = String(raw.signal_id || raw.tag_id || generateSignalId(country, hsCode)).trim();

    return {
        signal_id: signalId,
        hs_code: hsCode,
        direction,
        country,
        risk_level: riskLevel,
        source,
        content_en: contentEn,
        content_zh: contentZh,
        source_url: String(raw.source_url || '').trim() || null,
        related_keywords: Array.isArray(raw.related_keywords) ? raw.related_keywords : deriveKeywords(hsCode, contentEn),
        fetched_at: raw.fetched_at || new Date().toISOString(),
        pipeline_source: raw.pipeline_source || 'manual'
    };
}

function generateSignalId(country, hsCode) {
    const slug = String(hsCode || 'GEN').replace(/\W+/g, '').slice(0, 8);
    const suffix = Date.now().toString(36);
    return `RS-${country}-${slug}-${suffix}`.toUpperCase();
}

function deriveKeywords(hsCode, contentEn) {
    const words = `${hsCode} ${contentEn}`.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
    const unique = [...new Set(words)].slice(0, 12);
    if (hsCode && !unique.includes(hsCode.toLowerCase())) {
        unique.unshift(hsCode.toLowerCase());
    }
    return unique.slice(0, 12);
}

/**
 * Convert risk signal to legacy tag shape for search/render pipeline.
 */
function riskSignalToTag(signal) {
    const safe = sanitizeRiskSignal(signal);
    const hsList = safe.hs_code ? [safe.hs_code.replace(/\s/g, '')] : [];
    const category = safe.risk_level === 'High' ? 'EXPORT_CTRL' : 'OTHER';

    return {
        tag_id: safe.signal_id,
        category,
        category_label: safe.risk_level === 'High' ? 'Export Control' : 'Other Requirements',
        tag_type: safe.risk_level === 'High' ? 'MATCHED' : 'CHECK_REQUIRED',
        short_name: `[${safe.country} ${safe.risk_level}]`,
        short_description: safe.content_en.slice(0, 160),
        description: safe.content_en,
        content_en: safe.content_en,
        content_zh: safe.content_zh,
        source_citation: safe.source,
        source_url: safe.source_url || '',
        effective_date: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
        direction: safe.direction,
        country: safe.country,
        risk_level: safe.risk_level,
        hs_code: safe.hs_code,
        related_hs_codes: hsList,
        related_keywords: safe.related_keywords,
        related_cases: [],
        display_order: safe.risk_level === 'High' ? 1 : 50,
        pipeline_source: safe.pipeline_source
    };
}

function enrichLegacyTag(tag) {
    if (!tag || typeof tag !== 'object') {
        return tag;
    }
    const country = normalizeCountryCode(tag.country || 'GLOBAL');
    const contentEn = tag.content_en || tag.short_description || tag.description || '';
    const contentZh = tag.content_zh || contentEn;
    const hsCode = tag.hs_code || (Array.isArray(tag.related_hs_codes) ? tag.related_hs_codes[0] : '');
    return {
        ...tag,
        country,
        content_en: contentEn,
        content_zh: contentZh,
        hs_code: hsCode,
        risk_level: normalizeRiskLevel(tag.risk_level || 'Medium'),
        source: tag.source || tag.source_citation || 'Trade Comply Library'
    };
}

module.exports = {
    validateRiskSignal,
    sanitizeRiskSignal,
    riskSignalToTag,
    enrichLegacyTag,
    normalizeRiskLevel,
    normalizeDirection
};
