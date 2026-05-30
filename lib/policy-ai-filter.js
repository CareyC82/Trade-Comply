/**
 * Step 2 — Pure English universal AI refiner (DeepSeek).
 *
 * Multilingual input → strict legal English JSON verdict.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { extractFilteredAnnouncementDigest } = require('./policy-title-filter');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const TIMEOUT_MS = 60000;

const CORE_INDUSTRIES = ['Electronics', 'New Energy', 'Semiconductor', 'None'];
const ALLOWED_INDUSTRIES = new Set(CORE_INDUSTRIES);
const ALLOWED_IMPACT_COUNTRIES = new Set(['CN', 'US', 'EU']);
const ALLOWED_DIRECTIONS = new Set(['IMPORT', 'EXPORT', 'BOTH']);

const KEYWORD_PRESCREEN = [
    '半导体', '芯片', '集成电路', '出口管制', '两用', '光伏', '储能', '锂电池', '电池',
    'semiconductor', 'chip', 'export control', 'dual-use', 'photovoltaic', 'battery storage',
    'bis', 'ear', 'eu regulation', 'tariff', 'customs', 'electronics', 'lithium'
];

/**
 * Global trade law expert — system prompt for DeepSeek (English JSON only).
 */
const UNIVERSAL_AI_REFINER_SYSTEM_PROMPT = [
    'You are a global trade and export-control regulatory counsel for Trade Comply.',
    '',
    'INPUT: Official notice excerpts that may be in Chinese, English, or other European languages.',
    'Read and understand any language, but formulate your entire response in professional,',
    'high-standard legal English only. Never place non-English text inside JSON values.',
    '',
    'ANALYSIS: Determine whether the notice heavily impacts cross-border compliance for exactly',
    'one of these target industries (otherwise industry must be "None"):',
    '  • Electronics — consumer electronics, smart hardware, RF, phones, earbuds, IoT, batteries',
    '  • New Energy — solar/PV, energy storage, lithium batteries, EV charging, green supply chain',
    '  • Semiconductor — chips, advanced semiconductors, dual-use, export control lists, EAR/BIS rules',
    '',
    'TRADE DIRECTION (when relevant): IMPORT, EXPORT, or BOTH.',
    'IMPACT COUNTRIES: Use only CN, US, and/or EU codes for materially affected jurisdictions.',
    '',
    'MANDATORY REJECTION (relevant: false, industry: "None", impact_countries: [], direction: "BOTH", summary_en: ""):',
    '  • Domestic internal administrative reports, staffing, appointments, party or education campaigns',
    '  • Website maintenance journals, annual work reports, portal upgrade notices',
    '  • Non-target sectors: agriculture, coffee beans, garments, apparel, timber, forestry, livestock,',
    '    tourism, culture, sports, or ceremonial diplomacy without binding trade effect',
    '',
    'OUTPUT: Return ONLY one raw JSON object. No markdown code fences. No commentary.',
    'Exact schema:',
    '{',
    '  "relevant": true,',
    '  "impact_countries": ["CN", "US", "EU"],',
    '  "direction": "IMPORT",',
    '  "industry": "Semiconductor",',
    '  "summary_en": "One clear, professional sentence in English summarizing the exact compliance barrier, tariff penalty, or required action."',
    '}',
    'Allowed values: relevant true|false; direction IMPORT|EXPORT|BOTH;',
    'industry Electronics|New Energy|Semiconductor|None; impact_countries subset of CN, US, EU.',
    '',
    'STORAGE (server-side only): Do NOT output tag_id. The pipeline assigns catalog-compliant',
    'tag_id values after your JSON (pattern ^CL-[A-Z]+-\\\\d+$ from data/catalog.schema.json),',
    'e.g. CL-GLPOL-132 for CN + Semiconductor + EXPORT. You only provide industry, direction,',
    'impact_countries, and summary_en.'
].join('\n');

const GLOBAL_REGULATORY_EXPERT_SYSTEM_PROMPT = UNIVERSAL_AI_REFINER_SYSTEM_PROMPT;
const GLOBAL_POLICY_FILTER_SYSTEM_PROMPT = UNIVERSAL_AI_REFINER_SYSTEM_PROMPT;
const POLICY_FILTER_SYSTEM_PROMPT = UNIVERSAL_AI_REFINER_SYSTEM_PROMPT;

function keywordPreScreen(text) {
    const lower = String(text || '').toLowerCase();
    return KEYWORD_PRESCREEN.some((kw) => lower.includes(kw.toLowerCase()));
}

function extractJsonObject(text) {
    const trimmed = String(text || '').trim();
    const withoutFences = trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    try {
        return JSON.parse(withoutFences);
    } catch (error) {
        const start = withoutFences.indexOf('{');
        const end = withoutFences.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(withoutFences.slice(start, end + 1));
        }
        throw new Error(`Model response was not valid JSON: ${error.message}`);
    }
}

function extractAnnouncementDigest(text, maxChars = 4500) {
    const { digest, stats, skipped } = extractFilteredAnnouncementDigest(text, maxChars);
    if (skipped.length > 0) {
        console.log(
            `[policy-ai-filter] noise skipped ${skipped.length} headline(s) `
            + `(kept ${stats.kept ?? 0}/${stats.total ?? 0})`
        );
        skipped.slice(0, 8).forEach((row) => {
            console.log(`  - skip: ${(row.title || row.line || '').slice(0, 100)}`);
        });
    }
    return digest;
}

function normalizeSourceConfig(sourceConfig = {}) {
    const cfg = sourceConfig || {};
    return {
        id: cfg.id || cfg.sourceId || 'unknown',
        country: cfg.country || cfg.sourceCountry || 'GLOBAL',
        type: cfg.type || cfg.sourceType || 'both',
        url: cfg.url || cfg.sourceUrl || '',
        method: cfg.method || 'fetch',
        label: cfg.label || cfg.sourceLabel || cfg.id || 'unknown'
    };
}

function normalizeCountryCode(value) {
    const code = String(value || '').trim().toUpperCase();
    if (ALLOWED_IMPACT_COUNTRIES.has(code)) {
        return code;
    }
    return null;
}

function normalizeImpactCountries(rawList, { sourceCountry, relevant }) {
    if (!relevant) {
        return [];
    }
    const list = Array.isArray(rawList) ? rawList : [];
    const normalized = [];
    const seen = new Set();
    for (const item of list) {
        const code = normalizeCountryCode(item);
        if (code && !seen.has(code)) {
            seen.add(code);
            normalized.push(code);
        }
    }
    const publisher = normalizeCountryCode(sourceCountry);
    if (publisher && !seen.has(publisher)) {
        normalized.unshift(publisher);
    }
    return normalized.length > 0 ? normalized : (publisher ? [publisher] : []);
}

function normalizeDirection(raw, { sourceType, relevant }) {
    if (!relevant) {
        return 'BOTH';
    }
    const value = String(raw || '').trim().toUpperCase();
    if (ALLOWED_DIRECTIONS.has(value)) {
        return value;
    }
    const source = String(sourceType || '').trim().toLowerCase();
    if (source === 'import') {
        return 'IMPORT';
    }
    if (source === 'export') {
        return 'EXPORT';
    }
    return 'BOTH';
}

function normalizeIndustry(raw, relevant) {
    let industry = String(raw || 'None').trim();
    if (!ALLOWED_INDUSTRIES.has(industry)) {
        industry = 'None';
    }
    if (!relevant) {
        return 'None';
    }
    if (industry === 'None') {
        return 'Electronics';
    }
    return industry;
}

/**
 * Normalize model JSON to the Step 2 contract.
 */
function normalizePolicyAiFilter(raw, context = {}) {
    const method = context.method || 'deepseek';
    const relevant = raw?.relevant === true;
    const industry = normalizeIndustry(raw?.industry, relevant);
    const summaryEn = relevant
        ? String(raw?.summary_en || raw?.summary || '').trim().slice(0, 500)
        : '';

    return {
        relevant,
        impact_countries: normalizeImpactCountries(raw?.impact_countries, {
            sourceCountry: context.sourceCountry,
            relevant
        }),
        direction: normalizeDirection(raw?.direction, {
            sourceType: context.sourceType,
            relevant
        }),
        industry,
        summary_en: summaryEn,
        method,
        evaluated_at: new Date().toISOString()
    };
}

function buildRefinerUserPrompt(sourceConfig, digest) {
    const cfg = normalizeSourceConfig(sourceConfig);
    const tradeType = String(cfg.type || 'both').toUpperCase();
    return [
        'Evaluate this official notice for direct regulatory impact on the three target industries.',
        '',
        `Source ID: ${cfg.id}`,
        `Publisher country: ${cfg.country}`,
        `Configured trade scope: ${tradeType}`,
        `Source label: ${cfg.label}`,
        `URL: ${cfg.url || 'n/a'}`,
        `Fetch method: ${cfg.method}`,
        '',
        'Ignore navigation chrome and ceremonial content. Interpret any language; output JSON in English only.',
        '',
        '--- RAW POLICY TEXT ---',
        digest || ''
    ].join('\n');
}

async function callDeepSeekJson({ systemPrompt, userPrompt }) {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is not set.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 800,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API error (${response.status}): ${errorText.slice(0, 300)}`);
        }

        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('DeepSeek API returned an empty response.');
        }

        return extractJsonObject(content);
    } finally {
        clearTimeout(timeoutId);
    }
}

function loadOfflineFilterFixture(fixturePath) {
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Offline AI filter fixture not found: ${fixturePath}`);
    }
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function notRelevantVerdict(method, context = {}) {
    return normalizePolicyAiFilter({
        relevant: false,
        impact_countries: [],
        direction: 'BOTH',
        industry: 'None',
        summary_en: ''
    }, { method, ...context });
}

/**
 * Step 2 — Universal English AI refiner (primary API).
 *
 * @param {string} rawText - Crawled body (any language)
 * @param {object} sourceConfig - GLOBAL_CRAWL_SOURCES row ({ id, country, type, url, method, label? })
 * @param {object} [options]
 * @param {boolean} [options.offline]
 * @param {string} [options.offlineFixturePath]
 * @param {string} [options.fallbackWithoutApiKey] - 'fail-closed' | 'keyword'
 * @returns {Promise<{ relevant: boolean, impact_countries: string[], direction: string, industry: string, summary_en: string, method: string, evaluated_at: string }>}
 */
async function refineWithAI(rawText, sourceConfig = {}, options = {}) {
    const cfg = normalizeSourceConfig(sourceConfig);
    const context = {
        sourceCountry: cfg.country,
        sourceType: cfg.type,
        sourceId: cfg.id
    };

    const digest = extractAnnouncementDigest(rawText);
    if (!digest) {
        return notRelevantVerdict('empty-digest', context);
    }

    if (options.offline) {
        const fixturePath = options.offlineFixturePath
            || path.join(__dirname, '..', 'test', 'fixtures', 'policy-ai-filter.response.json');
        const fixture = loadOfflineFilterFixture(fixturePath);
        return normalizePolicyAiFilter(fixture, { method: 'offline-fixture', ...context });
    }

    const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
        const fallback = options.fallbackWithoutApiKey || 'fail-closed';
        if (fallback === 'keyword') {
            const relevant = keywordPreScreen(digest);
            return normalizePolicyAiFilter({
                relevant,
                impact_countries: relevant ? [cfg.country].filter((c) => ALLOWED_IMPACT_COUNTRIES.has(c)) : [],
                direction: 'BOTH',
                industry: relevant ? 'Electronics' : 'None',
                summary_en: relevant
                    ? 'Keyword pre-screen matched; configure DEEPSEEK_API_KEY for full legal analysis.'
                    : ''
            }, { method: 'keyword-fallback', ...context });
        }
        console.warn('[policy-ai-filter] DEEPSEEK_API_KEY missing — fail-closed (relevant=false).');
        return notRelevantVerdict('no-api-key', context);
    }

    console.log(
        `[policy-ai-filter] refineWithAI: ${cfg.id} publisher=${cfg.country} type=${cfg.type}`
    );

    const raw = await callDeepSeekJson({
        systemPrompt: UNIVERSAL_AI_REFINER_SYSTEM_PROMPT,
        userPrompt: buildRefinerUserPrompt(cfg, digest)
    });

    const normalized = normalizePolicyAiFilter(raw, { method: 'deepseek', ...context });
    console.log(
        `[policy-ai-filter] ${cfg.id}: relevant=${normalized.relevant} `
        + `industry=${normalized.industry} direction=${normalized.direction} `
        + `impact=[${normalized.impact_countries.join(',') || '-'}]`
    );
    return normalized;
}

/**
 * Legacy wrapper — accepts flat params used by older callers.
 */
async function refineGlobalPolicyAnnouncement(params = {}) {
    return refineWithAI(params.text, {
        id: params.sourceId,
        country: params.sourceCountry || params.country,
        type: params.sourceType || params.type,
        url: params.sourceUrl,
        label: params.sourceLabel
    }, {
        offline: params.offline,
        offlineFixturePath: params.offlineFixturePath,
        fallbackWithoutApiKey: params.fallbackWithoutApiKey
    });
}

const evaluatePolicyRelevance = refineGlobalPolicyAnnouncement;
const evaluateGlobalPolicyRelevance = refineGlobalPolicyAnnouncement;

module.exports = {
    UNIVERSAL_AI_REFINER_SYSTEM_PROMPT,
    GLOBAL_REGULATORY_EXPERT_SYSTEM_PROMPT,
    GLOBAL_POLICY_FILTER_SYSTEM_PROMPT,
    POLICY_FILTER_SYSTEM_PROMPT,
    CORE_INDUSTRIES,
    extractAnnouncementDigest,
    extractJsonObject,
    normalizePolicyAiFilter,
    normalizeSourceConfig,
    refineWithAI,
    refineGlobalPolicyAnnouncement,
    evaluatePolicyRelevance,
    evaluateGlobalPolicyRelevance,
    ALLOWED_INDUSTRIES,
    ALLOWED_IMPACT_COUNTRIES,
    ALLOWED_DIRECTIONS
};
