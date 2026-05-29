/**
 * Data Validation Guardrail — blocks bad AI/scraper rows from auto-publish.
 */

const { validateRiskSignal, sanitizeRiskSignal } = require('./risk-signal');

const ALLOWED_COUNTRIES = new Set(['US', 'EU', 'JP', 'KR', 'ASEAN', 'GLOBAL']);
const ALLOWED_DIRECTIONS = new Set(['export', 'import']);
const ALLOWED_RISK_LEVELS = new Set(['High', 'Medium', 'Low']);

const HALLUCINATION_PATTERNS = [
    /\bi'?m\s+sorry\b/i,
    /\bas\s+an\s+ai\b/i,
    /\bi\s+cannot\b/i,
    /\bi\s+can't\s+help\b/i,
    /\bunable\s+to\s+(provide|access|find)\b/i,
    /未找到对应内容/,
    /无法提供/,
    /作为\s*AI/,
    /我是\s*AI/,
    /抱歉[，,]?\s*我/,
    /no\s+relevant\s+content\s+found/i,
    /placeholder\s+content/i,
    /lorem\s+ipsum/i
];

const INVALID_HS_PLACEHOLDERS = new Set(['', 'ALL', '00000000', 'N/A', 'NA', 'NONE', 'UNKNOWN']);

function normalizeCountryStrict(value) {
    const raw = String(value || '').trim().toUpperCase();
    const aliases = {
        USA: 'US',
        'UNITED STATES': 'US',
        EUROPE: 'EU',
        'EUROPEAN UNION': 'EU',
        VIETNAM: 'ASEAN',
        MALAYSIA: 'ASEAN',
        JAPAN: 'JP',
        KOREA: 'KR',
        'SOUTH KOREA': 'KR',
        GLOBAL: 'GLOBAL',
        CN: 'GLOBAL',
        CHINA: 'GLOBAL'
    };
    return aliases[raw] || raw;
}

function containsHallucination(text) {
    const body = String(text || '').trim();
    if (!body) {
        return true;
    }
    return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(body));
}

function isValidHsCode(hsCode) {
    const raw = String(hsCode || '').trim();
    if (!raw || INVALID_HS_PLACEHOLDERS.has(raw.toUpperCase())) {
        return false;
    }
    const normalized = raw.replace(/\s/g, '');
    if (!/^[0-9]{2,10}([.,][0-9]{1,4}){0,3}$/.test(normalized) && !/^[0-9]{2,10}(,[0-9]{2,10})+$/.test(normalized)) {
        return false;
    }
    return true;
}

function validateContentFields(contentEn, contentZh) {
    const errors = [];
    const en = String(contentEn || '').trim();
    const zh = String(contentZh || contentEn || '').trim();

    if (en.length < 10) {
        errors.push('content_en is missing or too short');
    }
    if (zh.length < 2) {
        errors.push('content_zh is missing or too short');
    }
    if (containsHallucination(en) || containsHallucination(zh)) {
        errors.push('content contains AI hallucination or empty placeholder text');
    }
    return errors;
}

/**
 * @param {object} data - risk signal or tag-shaped row
 * @param {'risk_signal'|'tag'|'case'} [kind]
 */
function validateDataSchema(data, kind = 'risk_signal') {
    const errors = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, errors: ['payload must be a JSON object'], value: null };
    }

    if (kind === 'risk_signal') {
        const base = validateRiskSignal(data);
        if (!base.ok) {
            errors.push(...base.errors);
        }

        const country = normalizeCountryStrict(data.country);
        if (!ALLOWED_COUNTRIES.has(country)) {
            errors.push(`country must be one of ${[...ALLOWED_COUNTRIES].join(', ')} (got "${data.country}")`);
        }

        const hs = data.hs_code || data.hs_code_keyword;
        if (!isValidHsCode(hs)) {
            errors.push('hs_code is missing or invalid');
        }

        const direction = String(data.direction || '').trim().toLowerCase();
        if (!ALLOWED_DIRECTIONS.has(direction)) {
            errors.push('direction must be export or import');
        }

        const risk = String(data.risk_level || 'Medium').trim();
        const normalizedRisk = /^high$/i.test(risk) ? 'High' : /^low$/i.test(risk) ? 'Low' : 'Medium';
        if (!ALLOWED_RISK_LEVELS.has(normalizedRisk)) {
            errors.push('risk_level must be High, Medium, or Low');
        }

        if (!String(data.source || '').trim()) {
            errors.push('source is required');
        }

        errors.push(...validateContentFields(data.content_en, data.content_zh));

        if (errors.length > 0) {
            return { ok: false, errors: [...new Set(errors)], value: null };
        }

        return { ok: true, errors: [], value: sanitizeRiskSignal(data) };
    }

    if (kind === 'tag') {
        const tagId = String(data.tag_id || '').trim();
        if (!tagId) {
            errors.push('tag_id is required');
        }

        const hsList = Array.isArray(data.related_hs_codes) ? data.related_hs_codes : [];
        const hsCode = data.hs_code || hsList[0];
        if (!isValidHsCode(hsCode) && !hsList.some((code) => isValidHsCode(code))) {
            errors.push('related_hs_codes or hs_code is required and must be valid');
        }

        const direction = String(data.direction || 'export').trim().toLowerCase();
        if (direction !== 'both' && !ALLOWED_DIRECTIONS.has(direction)) {
            errors.push('direction must be export, import, or both');
        }

        if (data.country) {
            const country = normalizeCountryStrict(data.country);
            if (!ALLOWED_COUNTRIES.has(country)) {
                errors.push(`country must be one of ${[...ALLOWED_COUNTRIES].join(', ')}`);
            }
        }

        const desc = data.description || data.short_description || data.content_en || '';
        const descZh = data.content_zh || desc;
        if (!String(desc).trim()) {
            errors.push('description or short_description is required');
        }
        errors.push(...validateContentFields(desc, descZh));

        if (!String(data.source_citation || data.source || '').trim()) {
            errors.push('source_citation or source is required');
        }

        if (errors.length > 0) {
            return { ok: false, errors: [...new Set(errors)], value: null };
        }

        return { ok: true, errors: [], value: data };
    }

    if (kind === 'case') {
        const caseId = String(data.case_id || '').trim();
        if (!caseId) {
            errors.push('case_id is required');
        }
        const title = data.title || data.short_title || data.summary || '';
        if (!String(title).trim() || containsHallucination(title)) {
            errors.push('case title/summary is missing or invalid');
        }
        if (errors.length > 0) {
            return { ok: false, errors: [...new Set(errors)], value: null };
        }
        return { ok: true, errors: [], value: data };
    }

    return { ok: false, errors: [`unsupported kind: ${kind}`], value: null };
}

function partitionByGuardrail(rows, kind = 'risk_signal') {
    const passed = [];
    const intercepted = [];

    for (const row of rows || []) {
        const result = validateDataSchema(row, kind);
        if (result.ok) {
            passed.push(result.value);
        } else {
            intercepted.push({
                kind,
                intercepted_at: new Date().toISOString(),
                reasons: result.errors,
                raw: row
            });
        }
    }

    return { passed, intercepted };
}

module.exports = {
    ALLOWED_COUNTRIES,
    ALLOWED_DIRECTIONS,
    HALLUCINATION_PATTERNS,
    validateDataSchema,
    partitionByGuardrail,
    containsHallucination,
    isValidHsCode,
    normalizeCountryStrict
};
