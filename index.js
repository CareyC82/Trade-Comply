const fs = require('fs');
const path = require('path');

require('./js/catalog.js');

const { buildScopeCatalog, queryMatchesScope } = globalThis.Catalog;
const { handleFeedbackRequest } = require('./feedback-store');
const { handleComplianceFeedbackRequest } = require('./supabase-feedback');
const {
    extractComplianceFeedbackPayload,
    isComplianceFeedbackQuery
} = require('./compliance-feedback-codec');
const {
    loadFcLibModules,
    getHsCodeSystemPrompt,
    bundleIncompleteResponse
} = require('./lib/fc-deps');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ALLOWED_ORIGINS = new Set([
    'https://careyc82.github.io',
    'https://tracewize.com',
    'https://www.tracewize.com',
    'https://trdcompliance.io',
    'https://www.trdcompliance.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
]);
const DEFAULT_ALLOWED_ORIGIN = '*';
const FC_BUILD_ID = '20260616-global-ai-route';
const { runGlobalCrawlTest, ENGINE_BUILD_ID: GLOBAL_ENGINE_BUILD } = require('./lib/global-crawl-engine');
const {
    authorizeAdminRouteAccess,
    areAdminRoutesEnabled,
    isProtectedAdminPath,
    isTestCrawlPath,
    logUnauthorizedAdminAccess,
    buildAdminForbiddenPayload,
    resolveClientIpFromHeaders
} = require('./lib/admin-route-security');
const { buildPreScreenReport } = require('./lib/pre-screen-report');
const { getCountryLabel } = require('./lib/country-registry');
const MAX_QUERY_LENGTH = 500;
const MAX_HSCODE_DESCRIPTION_LENGTH = 2000;
const TIMEOUT_MS = 30000;
const HSCODE_CLASSIFY_MAX_TOKENS = 3200;
const MAX_CONTEXT_TAGS = 8;
const MAX_CONTEXT_CASES = 3;
const MAX_FIELD_LENGTH = 500;

let TAG_ID_PATTERN = /^CL-[A-Z]+-\d+$/;
let CASE_ID_PATTERN = /^CASE-[A-Z0-9-]+$/;
let SCOPE_KEYWORD_LIST = [];

let TAGS_BY_ID = {};
let CASES_BY_ID = {};

function readJsonFile(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`Failed to read ${filePath}:`, error.message);
        return fallback;
    }
}

function loadScopeCatalogFromArtifact(dataDir) {
    const catalogPath = path.join(dataDir, 'catalog.json');
    if (!fs.existsSync(catalogPath)) {
        return false;
    }

    const catalogJson = readJsonFile(catalogPath, null);
    const catalog = globalThis.Catalog.hydrateScopeCatalog(catalogJson);
    if (!catalog || !catalog.keywordList.length) {
        return false;
    }

    SCOPE_KEYWORD_LIST = catalog.keywordList;
    TAG_ID_PATTERN = catalog.tagIdPattern;
    CASE_ID_PATTERN = catalog.caseIdPattern;
    console.log(`Scope catalog loaded from catalog.json: ${SCOPE_KEYWORD_LIST.length} keywords`);
    return true;
}

function loadScopeCatalog() {
    const dataDir = path.join(__dirname, 'data');
    if (loadScopeCatalogFromArtifact(dataDir)) {
        return;
    }

    const catalogSchema = readJsonFile(path.join(dataDir, 'catalog.schema.json'), {});
    const scopeConfig = readJsonFile(path.join(dataDir, 'scope-keywords.json'), {});
    const categories = readJsonFile(path.join(dataDir, 'categories.json'), []);
    const tags = Object.values(TAGS_BY_ID);
    const cases = Object.values(CASES_BY_ID);

    const catalog = buildScopeCatalog({
        tags,
        cases,
        categories,
        scopeConfig,
        catalogSchema
    });

    SCOPE_KEYWORD_LIST = catalog.keywordList;
    TAG_ID_PATTERN = catalog.tagIdPattern;
    CASE_ID_PATTERN = catalog.caseIdPattern;

    console.log(`Scope catalog built at runtime: ${SCOPE_KEYWORD_LIST.length} keywords`);
}

function loadRuleLibrary() {
    const dataDir = path.join(__dirname, 'data');
    const tagsPath = path.join(dataDir, 'tags.json');
    const casesPath = path.join(dataDir, 'cases.json');

    try {
        const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
        const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

        TAGS_BY_ID = Object.fromEntries(
            tags.filter(tag => tag?.tag_id).map(tag => [tag.tag_id, tag])
        );
        CASES_BY_ID = Object.fromEntries(
            cases.filter(caseItem => caseItem?.case_id).map(caseItem => [caseItem.case_id, caseItem])
        );

        console.log(`Rule library loaded: ${Object.keys(TAGS_BY_ID).length} tags, ${Object.keys(CASES_BY_ID).length} cases`);
        loadScopeCatalog();
    } catch (error) {
        console.error('Failed to load rule library from data/*.json:', error.message);
        TAGS_BY_ID = {};
        CASES_BY_ID = {};
        SCOPE_KEYWORD_LIST = [];
    }
}

loadRuleLibrary();
console.log(`=== FC RUNTIME READY: Trade Comply index.js build=${FC_BUILD_ID} ===`);

function checkSearchRange(query) {
    return queryMatchesScope(query, SCOPE_KEYWORD_LIST);
}

function truncateText(text, maxLength = MAX_FIELD_LENGTH) {
    if (typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, maxLength - 3)}...`;
}

function uniqueIds(ids, pattern, maxCount) {
    const seen = new Set();
    const result = [];

    for (const id of ids) {
        if (typeof id !== 'string' || !pattern.test(id) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        result.push(id);
        if (result.length >= maxCount) {
            break;
        }
    }

    return result;
}

function extractTagIds(context) {
    if (Array.isArray(context.tag_ids)) {
        return uniqueIds(context.tag_ids, TAG_ID_PATTERN, MAX_CONTEXT_TAGS);
    }

    if (Array.isArray(context.matched_tags)) {
        return uniqueIds(
            context.matched_tags.map(tag => tag?.tag_id),
            TAG_ID_PATTERN,
            MAX_CONTEXT_TAGS
        );
    }

    return [];
}

function extractCaseIds(context) {
    if (Array.isArray(context.case_ids)) {
        return uniqueIds(context.case_ids, CASE_ID_PATTERN, MAX_CONTEXT_CASES);
    }

    if (Array.isArray(context.related_cases)) {
        return uniqueIds(
            context.related_cases.map(caseItem => caseItem?.case_id),
            CASE_ID_PATTERN,
            MAX_CONTEXT_CASES
        );
    }

    return [];
}

function tagMatchesDirection(tag, direction) {
    const tagDirection = tag.direction || 'both';
    return tagDirection === 'both' || tagDirection === direction;
}

function caseMatchesDirection(caseItem, direction) {
    const caseDirection = caseItem.direction || 'both';
    return caseDirection === 'both' || caseDirection === direction;
}

function mapTagForPrompt(tag) {
    return {
        tag_id: tag.tag_id,
        category: truncateText(tag.category_label || tag.category || '', 120),
        tag_type: truncateText(tag.tag_type || '', 40),
        description: truncateText(tag.description || '', MAX_FIELD_LENGTH),
        short_description: truncateText(tag.short_description || '', 240),
        hs_codes: Array.isArray(tag.related_hs_codes) ? tag.related_hs_codes.slice(0, 8) : [],
        exemptions: tag.exemptions ? truncateText(tag.exemptions, 240) : null,
        risk_scenarios: tag.risk_scenarios ? truncateText(tag.risk_scenarios, 240) : null,
        source_citation: truncateText(tag.source_citation || '', 200),
        source_url: truncateText(tag.source_url || '', 300)
    };
}

function mapCaseForPrompt(caseItem) {
    return {
        case_id: caseItem.case_id,
        title: truncateText(caseItem.title || '', 200),
        date: truncateText(caseItem.date || '', 40),
        summary: truncateText(caseItem.summary || '', MAX_FIELD_LENGTH),
        source_url: truncateText(caseItem.source_url || '', 300)
    };
}

function scoreTagAgainstQuery(tag, queryLower, queryWords) {
    let score = 0;
    const keywords = tag.related_keywords || [];

    keywords.forEach(keyword => {
        const keywordLower = String(keyword).toLowerCase();
        if (keywordLower === queryLower) {
            score += 10;
        } else if (queryWords.includes(keywordLower)) {
            score += 5;
        } else if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
            score += 2;
        }
    });

    const textBlob = `${tag.tag_id || ''} ${tag.short_description || ''} ${tag.description || ''}`.toLowerCase();
    if (textBlob.includes(queryLower)) {
        score += 3;
    }

    return score;
}

function searchTagsForExploratory(query, direction, limitPerBucket = 6) {
    const queryLower = String(query || '').trim().toLowerCase();
    if (!queryLower) {
        return { sameDirection: [], otherDirection: [] };
    }

    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    const scored = Object.values(TAGS_BY_ID)
        .map(tag => ({ tag, score: scoreTagAgainstQuery(tag, queryLower, queryWords) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

    const sameDirection = [];
    const otherDirection = [];

    for (const { tag } of scored) {
        const mapped = mapTagForPrompt(tag);
        if (tagMatchesDirection(tag, direction)) {
            if (sameDirection.length < limitPerBucket) {
                sameDirection.push(mapped);
            }
        } else if (otherDirection.length < limitPerBucket) {
            otherDirection.push(mapped);
        }
        if (sameDirection.length >= limitPerBucket && otherDirection.length >= limitPerBucket) {
            break;
        }
    }

    return { sameDirection, otherDirection };
}

function normalizeAiRoute(rawRoute, direction) {
    const route = rawRoute && typeof rawRoute === 'object' ? rawRoute : {};
    const from = truncateText(route.from || '', 20);
    const to = truncateText(route.to || '', 20);
    const fromLabel = truncateText(route.from_label || route.fromLabel || getCountryLabel(from) || from || 'selected origin', 80);
    const toLabel = truncateText(route.to_label || route.toLabel || getCountryLabel(to) || to || 'selected destination', 80);
    const focus = route.focus === 'export' || route.focus === 'import'
        ? route.focus
        : (direction === 'import' ? 'import' : 'export');

    return { from, to, from_label: fromLabel, to_label: toLabel, focus };
}

function hydrateExploratoryContext(context, userQuery) {
    const direction = context?.direction === 'import' ? 'import' : 'export';
    const productQuery = truncateText(context?.product_query || userQuery || '', 200);
    const searchText = truncateText(userQuery || productQuery, 200);
    const riskLevel = truncateText(context?.risk_level || 'low', 40);
    const precheckAttributes = Array.isArray(context?.precheck_attributes)
        ? context.precheck_attributes.filter(attr => typeof attr === 'string').slice(0, 12)
        : [];

    const { sameDirection, otherDirection } = searchTagsForExploratory(searchText, direction);

    if (sameDirection.length === 0 && otherDirection.length === 0) {
        return { valid: false, reason: 'no_matched_rules' };
    }

    return {
        valid: true,
        exploratory: true,
        context: {
            product_query: productQuery,
            direction,
            route: normalizeAiRoute(context?.route, direction),
            risk_level: riskLevel,
            precheck_attributes: precheckAttributes,
            matched_tags: sameDirection,
            reference_tags: otherDirection,
            related_cases: [],
            match_count: {
                tags: Number(context?.match_count?.tags) || 0,
                cases: Number(context?.match_count?.cases) || 0
            },
            screen_had_no_rules: true
        }
    };
}

function hydrateContext(context) {
    if (!context || typeof context !== 'object') {
        return { valid: false, reason: 'missing_context' };
    }

    if (Object.keys(TAGS_BY_ID).length === 0) {
        return { valid: false, reason: 'library_unavailable' };
    }

    const direction = context.direction === 'import' ? 'import' : 'export';
    const productQuery = truncateText(context.product_query || '', 200);
    const riskLevel = truncateText(context.risk_level || 'low', 40);
    const route = normalizeAiRoute(context.route, direction);
    const precheckAttributes = Array.isArray(context.precheck_attributes)
        ? context.precheck_attributes.filter(attr => typeof attr === 'string').slice(0, 12)
        : [];

    const requestedTagIds = extractTagIds(context);
    const requestedCaseIds = extractCaseIds(context);

    const unknownTagIds = [];
    const directionSkippedTagIds = [];
    const matchedTags = [];

    for (const tagId of requestedTagIds) {
        const tag = TAGS_BY_ID[tagId];
        if (!tag) {
            unknownTagIds.push(tagId);
            continue;
        }
        if (!tagMatchesDirection(tag, direction)) {
            directionSkippedTagIds.push(tagId);
            continue;
        }
        matchedTags.push(mapTagForPrompt(tag));
    }

    const relatedCases = [];
    for (const caseId of requestedCaseIds) {
        const caseItem = CASES_BY_ID[caseId];
        if (!caseItem) {
            continue;
        }
        if (!caseMatchesDirection(caseItem, direction)) {
            continue;
        }
        relatedCases.push(mapCaseForPrompt(caseItem));
    }

    if (matchedTags.length === 0) {
        let reason = 'no_matched_rules';
        if (unknownTagIds.length > 0) {
            reason = 'invalid_tag_ids';
        } else if (requestedTagIds.length > 0 && directionSkippedTagIds.length === requestedTagIds.length) {
            reason = 'direction_mismatch';
        }

        return {
            valid: false,
            reason,
            unknown_tag_ids: unknownTagIds,
            direction_skipped_tag_ids: directionSkippedTagIds
        };
    }

    return {
        valid: true,
        context: {
            product_query: productQuery,
            direction,
            route,
            risk_level: riskLevel,
            precheck_attributes: precheckAttributes,
            matched_tags: matchedTags,
            related_cases: relatedCases,
            match_count: {
                tags: Number(context.match_count?.tags) || matchedTags.length,
                cases: Number(context.match_count?.cases) || relatedCases.length
            }
        },
        hydration: {
            requested_tag_ids: requestedTagIds,
            hydrated_tag_ids: matchedTags.map(tag => tag.tag_id),
            unknown_tag_ids: unknownTagIds,
            direction_skipped_tag_ids: directionSkippedTagIds
        }
    };
}

function formatTagBlock(tag) {
    const lines = [
        `[${tag.tag_id}] ${tag.tag_type || 'RULE'} | ${tag.category || 'General'}`,
        `HS: ${(tag.hs_codes && tag.hs_codes.length) ? tag.hs_codes.join(', ') : 'Not specified'}`,
        `Rule: ${tag.description || tag.short_description || 'No description provided.'}`
    ];

    if (tag.exemptions) lines.push(`Exemptions: ${tag.exemptions}`);
    if (tag.risk_scenarios) lines.push(`Risk scenarios: ${tag.risk_scenarios}`);
    if (tag.source_citation || tag.source_url) {
        lines.push(`Source: ${tag.source_citation || 'Official source'} | ${tag.source_url || 'N/A'}`);
    }

    return lines.join('\n');
}

function formatCaseBlock(caseItem) {
    return [
        `[${caseItem.case_id}] ${caseItem.date || 'Unknown date'} | ${caseItem.title || 'Penalty case'}`,
        `Summary: ${caseItem.summary || 'No summary provided.'}`,
        `Source: ${caseItem.source_url || 'N/A'}`
    ].join('\n');
}

function buildGroundedUserMessage(context, userQuery) {
    const matchedBlocks = (context.matched_tags || []).map(formatTagBlock).join('\n\n');
    const referenceBlocks = (context.reference_tags || []).map(formatTagBlock).join('\n\n');
    const caseBlocks = context.related_cases.length
        ? context.related_cases.map(formatCaseBlock).join('\n\n')
        : 'None matched.';

    const route = normalizeAiRoute(context.route, context.direction);
    const directionLabel = route.focus === 'export'
        ? `export requirements at origin: ${route.from_label} -> ${route.to_label}`
        : `import requirements at destination: ${route.from_label} -> ${route.to_label}`;
    const oppositeDirectionLabel = route.focus === 'export'
        ? `import requirements at destination: ${route.to_label}`
        : `export requirements at origin: ${route.from_label}`;

    const lines = [
        `PRODUCT QUERY: ${context.product_query || 'Not specified'}`,
        `TRADE ROUTE: ${route.from_label} -> ${route.to_label}`,
        `COMPLIANCE FOCUS: ${directionLabel}`,
        `RISK LEVEL: ${context.risk_level}`,
        `PRECHECK ATTRIBUTES: ${context.precheck_attributes.join(', ') || 'none'}`,
        ''
    ];

    if (context.screen_had_no_rules) {
        lines.push('SCREEN RESULT: No compliance rule cards were displayed for this product and direction.');
        lines.push('Use the library sections below. If only reference rules exist for the other direction, say so clearly and suggest switching direction on the site.');
        lines.push('');
    }

    lines.push(`=== MATCHED RULES FOR ${directionLabel.toUpperCase()} (${context.matched_tags.length} in library context) ===`);
    lines.push(matchedBlocks || 'None in library for this direction.');
    lines.push('');

    if (referenceBlocks) {
        lines.push(`=== REFERENCE RULES (${oppositeDirectionLabel} only — not shown on screen) ===`);
        lines.push(referenceBlocks);
        lines.push('');
    }

    lines.push(`=== RELATED CASES (${context.match_count.cases} on screen) ===`);
    lines.push(caseBlocks);
    lines.push('');
    lines.push('=== USER QUESTION ===');
    lines.push(userQuery);

    return lines.join('\n');
}

function postValidateResponse(text, context) {
    const allowedIds = new Set([
        ...(context.matched_tags || []).map(tag => tag.tag_id),
        ...(context.reference_tags || []).map(tag => tag.tag_id),
        ...(context.related_cases || []).map(caseItem => caseItem.case_id)
    ]);

    const cited = [...text.matchAll(/\[([A-Z]+-[A-Z0-9-]+)\]/g)].map(match => match[1]);
    const uniqueCited = [...new Set(cited)];
    const unknown = uniqueCited.filter(id => !allowedIds.has(id));
    const citedTagIds = uniqueCited.filter(id => TAG_ID_PATTERN.test(id));
    const citedCaseIds = uniqueCited.filter(id => CASE_ID_PATTERN.test(id));

    let confidence = 'grounded';
    const warnings = [];

    if (unknown.length > 0) {
        warnings.push(`Unknown citations in response: ${unknown.join(', ')}`);
        confidence = 'partial';
    }

    if (/General guidance \(not from rule library\)/i.test(text)) {
        confidence = 'partial';
    }

    if (/^\s*The rule library (?:does|did) not (?:contain|find) (?:enough detail|related compliance signals)/i.test(text)) {
        confidence = 'insufficient_context';
    }

    if (citedTagIds.length === 0 && citedCaseIds.length === 0 && confidence === 'grounded') {
        confidence = 'partial';
        warnings.push('No explicit tag_id or case_id citations found in response.');
    }

    return {
        cited_tag_ids: citedTagIds,
        cited_case_ids: citedCaseIds,
        confidence,
        warnings
    };
}

const AI_MESSAGES = {
    outOfRange: "Your query is outside the scope of this website's trade compliance information search.\n\nThis website mainly provides trade compliance information for the following categories:\n• Electronics (mobile phones, computers, headphones, etc.) CCC certification\n• Wireless communication devices (Bluetooth, WiFi, drones, etc.) SRRC certification\n• Battery safety and transportation regulations\n• Solar product import/export compliance\n• Industrial robot compliance requirements\n• Energy storage system safety standards\n• Export controls and dual-use items\n• VAT refund policies\n\nIf you have other needs or specific product compliance questions, please leave a message with details about the product.",
    insufficientContext: "The rule library did not find related compliance signals for this product and question.\n\nTry switching import/export direction, broadening the product description, or submit feedback with your product details.",
    invalidTagIds: "The AI assistant could not verify the matched rule IDs against the server rule library. Please refresh the page and try again.",
    libraryUnavailable: "The AI assistant rule library is temporarily unavailable on the server. Please try again later or use the matched cards above.",
    systemPrompt: `You are a cautious global trade compliance pre-screening expert for electronics, semiconductors, batteries, wireless devices, clean energy products, and related supply chains. Answer questions for the selected trade route and compliance focus only. Never give legal advice. Always reply in English.

CRITICAL - Response Structure:
Structure your entire response using this exact format. Be brief, decision-oriented, and avoid long paragraphs:

0. CORE ANSWER
Give a one-sentence conclusion for the selected route and product. State the main reason in plain English.

1. REGULATORY REQUIREMENTS
List the top 2-4 matched requirements only. For each item, explain:
   a) What must be checked
   b) Why it matters
   c) Matched citation

2. EXEMPTIONS & CONDITIONS
Only mention exemptions, special conditions, or thresholds if they are stated in the matched rules. Otherwise say this is not stated and should be verified.

3. HIDDEN RISKS (Dual-Use & Scenario Analysis)
List no more than 3 hidden-risk triggers that are supported by the matched rules or cases, such as dual-use specs, end-use/end-user concerns, data/security features, medical intended use, wireless modules, or power/battery safety.

4. COMPLIANCE STRATEGY
Give 3 short next actions. Start each with a verb. Focus on what the user should do now, not generic education.

CRITICAL - Rules:
- Cover the origin export or destination import jurisdiction shown in the TRADE ROUTE and COMPLIANCE FOCUS fields. This may include China, United States, European Union, Germany, Netherlands, Singapore, Mexico, Vietnam, Malaysia, Russia, Taiwan, Japan, South Korea, India, or other maintained markets when present in the provided context.
- Do NOT refuse non-China routes merely because they are outside China. If the provided context is thin, still answer from the matched rule titles, descriptions, citations, and cases.
- Do NOT mention unrelated jurisdictions, certifications, or regimes unless they appear in the MATCHED RULES or RELATED CASES for this route.
- Keep the whole response concise. Prefer bullets over paragraphs. Do not repeat the same sentence in multiple sections.

GROUNDING RULES (mandatory):
- You MUST answer using ONLY the MATCHED RULES and RELATED CASES provided in the user message.
- Every regulatory claim MUST cite a tag_id like [CL-CCC-001] or case_id like [CASE-003].
- If a specific subsection lacks explicit exemption, threshold, penalty, date, or hidden-risk details, do NOT repeat a generic failure sentence. Instead write:
  "Not stated in the matched rules. Treat this as an open verification item before filing or shipment."
- If there are matched rules, each section must contain at least one route-specific, useful sentence derived from those matched rules.
- If there are zero matched rules and zero related cases, say:
  "The rule library did not find related compliance signals for this product and route."
- Do NOT invent HS codes, penalty amounts, effective dates, agency names, or license requirements not present in the context.
- You MAY add practical next steps, but label them clearly as "General guidance (not from rule library)".`
};

function getInsufficientContextMessage(reason) {
    if (reason === 'invalid_tag_ids') {
        return AI_MESSAGES.invalidTagIds;
    }
    if (reason === 'library_unavailable') {
        return AI_MESSAGES.libraryUnavailable;
    }
    return AI_MESSAGES.insufficientContext;
}

function normalizeEvent(rawEvent) {
    if (typeof rawEvent === 'string' && rawEvent.trim()) {
        try {
            return JSON.parse(rawEvent);
        } catch (error) {
            return {};
        }
    }
    return rawEvent || {};
}

function parseQueryString(queryString) {
    const params = {};
    if (!queryString || typeof queryString !== 'string') {
        return params;
    }
    const trimmed = queryString.startsWith('?') ? queryString.slice(1) : queryString;
    trimmed.split('&').forEach(part => {
        if (!part) {
            return;
        }
        const [rawKey, rawValue = ''] = part.split('=');
        if (!rawKey) {
            return;
        }
        try {
            params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
        } catch (error) {
            params[rawKey] = rawValue;
        }
    });
    return params;
}

function getQueryParams(event) {
    const params = {};
    const raw = event.queryParameters || event.queryStringParameters;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        Object.assign(params, raw);
    }
    Object.assign(params, parseQueryString(event.queryString || ''));
    for (const source of [
        event.rawPath,
        event.path,
        getHeaderValue(event.headers, 'x-fc-request-uri')
    ]) {
        if (typeof source === 'string' && source.includes('?')) {
            Object.assign(params, parseQueryString(source.split('?').slice(1).join('?')));
        }
    }
    return params;
}

function normalizePath(path) {
    if (!path || typeof path !== 'string') {
        return '/';
    }
    const withoutQuery = path.split('?')[0].trim();
    if (!withoutQuery || withoutQuery === '/') {
        return '/';
    }
    const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
    return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function getHeaderValue(headers, name) {
    if (!headers || typeof headers !== 'object') {
        return '';
    }
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === target) {
            return String(value || '');
        }
    }
    return '';
}

function getRequestMeta(event) {
    const headerMethod = getHeaderValue(event.headers, 'x-fc-request-method')
        || getHeaderValue(event.headers, 'x-http-method')
        || getHeaderValue(event.headers, ':method');
    const method = (
        event.httpMethod
        || event.requestContext?.http?.method
        || event.requestContext?.httpMethod
        || event.method
        || headerMethod
        || 'GET'
    ).toUpperCase();
    const headerPath = getHeaderValue(event.headers, 'x-fc-request-path')
        || getHeaderValue(event.headers, 'x-fc-request-uri')
        || getHeaderValue(event.headers, 'x-forwarded-uri');
    const path = normalizePath(
        event.rawPath
        || event.requestContext?.http?.path
        || event.path
        || (headerPath ? headerPath.split('?')[0] : '')
        || '/'
    );
    return { method, path };
}

function resolveAllowedOrigin(event) {
    const origin = getHeaderValue(event.headers, 'origin');
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        return origin;
    }
    return DEFAULT_ALLOWED_ORIGIN;
}

function buildCorsHeaders(event) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': resolveAllowedOrigin(event),
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret'
    };
}

function parseRequestBody(event) {
    let body;
    let rawBody;

    if (event.body) {
        if (typeof event.body === 'string') {
            rawBody = event.body;
        } else if (Buffer.isBuffer(event.body)) {
            rawBody = event.body.toString('utf-8');
        } else if (typeof event.body === 'object') {
            body = event.body;
        }
    } else if (event?.type === 'Buffer' && Array.isArray(event?.data)) {
        rawBody = Buffer.from(event.data).toString('utf-8');
    } else if (Buffer.isBuffer(event)) {
        rawBody = event.toString('utf-8');
    } else if (typeof event === 'string' && event.trim().startsWith('{')) {
        rawBody = event;
    }

    if (typeof rawBody === 'string' && rawBody.trim()) {
        if (event.isBase64Encoded === true || event.isBase64Encoded === 'true') {
            rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
        }
        body = JSON.parse(rawBody);

        if (body?.body && typeof body.body === 'string') {
            try {
                const nested = JSON.parse(body.body);
                if (nested?.query || nested?.product_query || nested?.product_keyword || nested?.action || nested?.description) {
                    body = nested;
                }
            } catch (e) {
            }
        }
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        body = {};
    }

    const payloadKeys = ['action', 'description', 'query', 'context', 'product_keyword', 'policy_type', 'source_url', 'user_message'];
    if (event && typeof event === 'object' && !Array.isArray(event)) {
        payloadKeys.forEach((key) => {
            if (event[key] !== undefined && body[key] === undefined) {
                body[key] = event[key];
            }
        });
    }

    if (typeof event.query === 'string' && event.query.trim() && !body.query) {
        body.query = event.query.trim();
    }

    return body;
}

function isHsCodeClassifyPath(path) {
    return normalizePath(path) === '/api/hscode';
}

function isHsCodeClassifyRequest(body, event) {
    if (body?.action === 'hscode_classify') {
        return true;
    }
    const params = getQueryParams(event || {});
    return params.action === 'hscode_classify';
}

function isFeedbackPath(path) {
    return normalizePath(path) === '/feedback';
}

function isApiFeedbackPath(path) {
    return normalizePath(path) === '/api/feedback';
}

function extractBearerTokenFromEvent(event) {
    const authHeader = getHeaderValue(event.headers, 'authorization');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function enforceAdminRouteGate(event, headers) {
    const queryParams = getQueryParams(event);
    const requestMeta = getRequestMeta(event);
    const auth = authorizeAdminRouteAccess({
        query: queryParams,
        headers: event.headers,
        bearerToken: extractBearerTokenFromEvent(event)
    });
    if (auth.ok) {
        return null;
    }
    logUnauthorizedAdminAccess({
        reason: auth.reason,
        method: requestMeta.method,
        path: requestMeta.path,
        ip: resolveClientIpFromHeaders(event.headers) || 'unknown',
        credential_source: auth.credential_source
    });
    return {
        statusCode: 403,
        headers,
        body: JSON.stringify(buildAdminForbiddenPayload(auth))
    };
}

function loadProdTagsForReport() {
    const tagsPath = path.join(__dirname, 'data', 'tags.json');
    if (!fs.existsSync(tagsPath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
}

function resolveReportTagsFromBody(body) {
    const allTags = loadProdTagsForReport();
    const ctx = body.context && typeof body.context === 'object' ? body.context : {};
    const ids = Array.isArray(ctx.tag_ids) ? ctx.tag_ids.filter(Boolean) : [];
    if (ids.length > 0) {
        const idSet = new Set(ids);
        return allTags.filter((tag) => idSet.has(tag.tag_id));
    }
    const query = String(body.product_query || body.query || '').trim().toLowerCase();
    if (!query) {
        return [];
    }
    return allTags.filter((tag) => {
        const blob = `${tag.short_name || ''} ${tag.description || ''} ${tag.content_en || ''}`.toLowerCase();
        return blob.includes(query);
    }).slice(0, 12);
}

function buildServerPrecheckProfile(body, tags) {
    let risk = 'low';
    for (const tag of tags) {
        const blob = `${tag.category || ''} ${tag.description || ''} ${tag.short_description || ''}`.toLowerCase();
        if (blob.includes('export control') || blob.includes('semiconductor') || blob.includes('dual-use')) {
            risk = 'high';
        } else if (blob.includes('battery') || blob.includes('wireless') || blob.includes('encryption')) {
            if (risk !== 'high') {
                risk = 'medium';
            }
        }
    }
    const direction = String(body.direction || body.context?.direction || 'export').toLowerCase();
    if (risk === 'high' && direction === 'export') {
        risk = 'review_required';
    }
    return {
        risk,
        signals: [],
        nextChecks: [
            'Confirm HS code, product description, and end-use statements against the commercial invoice.'
        ],
        riskReason: tags.length
            ? 'Matched production rules from the Trade Comply library for this product screen.'
            : '',
        matchedRuleCount: tags.length
    };
}

function handlePreScreenReportRequest(body, headers) {
    const tags = resolveReportTagsFromBody(body);
    const direction = String(body.direction || body.context?.direction || 'export').toLowerCase();
    const destination = String(body.destination || body.context?.counterparty_country || body.context?.country || 'US').toUpperCase();
    const destinationLabel = getCountryLabel(destination) || destination;
    const directionLabel = direction === 'import' ? 'Import into China' : 'Export from China';
    const precheckSelections = (Array.isArray(body.precheck_attributes) ? body.precheck_attributes : [])
        .filter((id) => typeof id === 'string')
        .map((id) => ({ id, label: id }));

    const report = buildPreScreenReport({
        productQuery: body.product_query || body.query || '',
        tags,
        cases: [],
        precheckSelections,
        profile: buildServerPrecheckProfile(body, tags),
        directionRaw: direction,
        directionLabel,
        destination,
        destinationLabel,
        flowLabel: `${directionLabel} → ${destinationLabel}`,
        synthesisMethod: body.synthesis === 'llm' ? 'llm_enhanced' : 'structured_rules'
    });

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            ok: true,
            build: FC_BUILD_ID,
            report
        })
    };
}

async function executeTestCrawlRequest(event, headers) {
    const queryParams = getQueryParams(event);
    const dataDir = path.join(__dirname, 'data');
    const persist = queryParams.persist === '1' || queryParams.persist === 'true';

    try {
        const result = await runGlobalCrawlTest({
            dataDir,
            persist,
            label: 'fc-test-crawl'
        });
        return {
            statusCode: result.ok ? 200 : 502,
            headers,
            body: JSON.stringify({
                ...result,
                build: FC_BUILD_ID,
                engine_build: GLOBAL_ENGINE_BUILD,
                hint: 'Check FC logs for [GLOBAL-CRAWL] lines.'
            })
        };
    } catch (error) {
        console.error('=== TEST CRAWL FAILED ===', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                ok: false,
                error: error.message,
                build: FC_BUILD_ID
            })
        };
    }
}

async function callDeepSeekForHsCode(description, context = {}, fcLibs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: getHsCodeSystemPrompt() },
                    { role: 'user', content: fcLibs.buildHsCodeUserPrompt(description, context) }
                ],
                temperature: 0.1,
                max_tokens: HSCODE_CLASSIFY_MAX_TOKENS,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = fcLibs.parseHsCodeClassificationPayload(content);
        const enriched = fcLibs.enrichClassification(parsed, context);
        const industryBaseline = require('./lib/industry-checklist-baseline');
        const profile = industryBaseline.detectProductProfile(
            description,
            parsed.china_export_hscode || parsed.china_import_hscode || parsed.hscode || ''
        );
        const aiChecklist = fcLibs.ensureIndustryChecklist(parsed.checklist, {
            description,
            hsCode: parsed.china_export_hscode || parsed.china_import_hscode || parsed.hscode,
            counterpartyCountry: context.counterpartyCountry || 'US',
            direction: context.direction || 'export',
            vertical: profile.vertical
        });
        enriched.checklist = fcLibs.buildSessionChecklist({
            tags: [],
            aiChecklist,
            country: context.counterpartyCountry || 'US',
            direction: context.direction || 'export',
            includeBaseline: false
        });
        return enriched;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function handleHsCodeClassifyRequest(body, headers) {
    let fcLibs;
    try {
        fcLibs = loadFcLibModules();
    } catch (bundleError) {
        console.error('HS classify bundle error:', bundleError.message);
        return bundleIncompleteResponse(headers);
    }

    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const direction = body.direction === 'import' ? 'import' : 'export';
    const routeFromCountry = fcLibs.normalizeCountryCode(
        body.route_from_country || body.origin_country || (direction === 'import' ? body.counterparty_country : 'CN')
    );
    const routeToCountry = fcLibs.normalizeCountryCode(
        body.route_to_country || body.destination_country || (direction === 'import' ? 'CN' : body.counterparty_country || body.country || 'US')
    );
    const complianceFocus = body.compliance_focus === 'export' ? 'export' : 'import';
    const counterpartyCountry = fcLibs.normalizeCountryCode(
        body.counterparty_country
        || body.country
        || (complianceFocus === 'export' ? routeFromCountry : routeToCountry)
        || 'US'
    );

    if (!description) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'description is required.' })
        };
    }

    if (description.length > MAX_HSCODE_DESCRIPTION_LENGTH) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `description must be at most ${MAX_HSCODE_DESCRIPTION_LENGTH} characters.` })
        };
    }

    if (!DEEPSEEK_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'API key not configured' })
        };
    }

    try {
        const classification = await callDeepSeekForHsCode(description, {
            direction,
            counterpartyCountry,
            fromCountry: routeFromCountry,
            toCountry: routeToCountry,
            focus: complianceFocus
        }, fcLibs);
        const checklist = classification.checklist || [];
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                classification: {
                    ...classification,
                    checklist
                },
                trade_context: {
                    direction,
                    counterparty_country: counterpartyCountry,
                    route_from_country: routeFromCountry,
                    route_to_country: routeToCountry,
                    compliance_focus: complianceFocus
                }
            })
        };
    } catch (error) {
        console.error('HS code classify error:', error.message);

        if (error.name === 'AbortError') {
            return {
                statusCode: 504,
                headers,
                body: JSON.stringify({ error: 'Request timeout' })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to classify product. Please try again with a clearer description.',
                detail: error.message
            })
        };
    }
}

function inferPostRoute(path, body) {
    if (isApiFeedbackPath(path)) {
        return 'api_feedback';
    }
    if (isFeedbackPath(path)) {
        return 'feedback';
    }
    if (!body || typeof body !== 'object') {
        return null;
    }
    if (body.action === 'compliance_feedback') {
        return 'api_feedback';
    }
    if (body.product_keyword || body.policy_type || body.source_url) {
        return 'api_feedback';
    }
    if (body.product_query !== undefined || body.regulation_needed !== undefined) {
        return 'feedback';
    }
    return null;
}

exports.handler = async (rawEvent) => {
    const event = normalizeEvent(rawEvent);
    const headers = buildCorsHeaders(event);
    const { method, path } = getRequestMeta(event);

    if (method === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    const queryParamsEarly = getQueryParams(event);

    if (method === 'GET') {
        const health = queryParamsEarly.health;
        if (health === 'feedback') {
            const features = ['compliance_feedback', 'feedback', 'ai', 'hscode_classify'];
            if (areAdminRoutesEnabled()) {
                features.push('test_crawl');
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    build: FC_BUILD_ID,
                    features
                })
            };
        }
    }

    if (isProtectedAdminPath(path, method, queryParamsEarly)) {
        const denied = enforceAdminRouteGate(event, headers);
        if (denied) {
            return denied;
        }
        if (isTestCrawlPath(path, method, queryParamsEarly)) {
            return executeTestCrawlRequest(event, headers);
        }
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
                ok: false,
                error: 'Forbidden. This administrative endpoint is not available.',
                reason: 'route_not_implemented'
            })
        };
    }

    if (method === 'GET' && path === '/visitors') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: false,
                today: null,
                total: null,
                source: 'not_configured',
                message: 'Visitor metrics are not configured.'
            })
        };
    }

    let body;
    try {
        body = parseRequestBody(event);
    } catch (e) {
        console.error('Parse error:', e.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON: " + e.message }) };
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const queryParams = queryParamsEarly;

    if (isProtectedAdminPath(path, method, queryParams)) {
        const denied = enforceAdminRouteGate(event, headers);
        if (denied) {
            return denied;
        }
        if (isTestCrawlPath(path, method, queryParams)) {
            return executeTestCrawlRequest(event, headers);
        }
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
                ok: false,
                error: 'Forbidden. This administrative endpoint is not available.',
                reason: 'route_not_implemented'
            })
        };
    }

    if (body.action === 'pre_screen_report') {
        return handlePreScreenReportRequest(body, headers);
    }

    if (isHsCodeClassifyRequest(body, event) || (method === 'POST' && isHsCodeClassifyPath(path))) {
        if (!body.description && queryParams.description) {
            body.description = queryParams.description;
        }
        return handleHsCodeClassifyRequest(body, headers);
    }

    const compliancePayload = extractComplianceFeedbackPayload(body);
    if (compliancePayload) {
        try {
            const result = await handleComplianceFeedbackRequest(compliancePayload);
            return {
                statusCode: result.statusCode,
                headers,
                body: JSON.stringify(result.body)
            };
        } catch (error) {
            console.error('Policy correction handler error:', error.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to store policy correction feedback.' })
            };
        }
    }

    if (isComplianceFeedbackQuery(query)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'Compliance feedback payload is missing or invalid.',
                debug: {
                    build: FC_BUILD_ID,
                    queryLength: query.length,
                    queryPrefix: query.slice(0, 48)
                }
            })
        };
    }

    const postRoute = method === 'POST' ? inferPostRoute(path, body) : null;

    if (postRoute === 'feedback') {
        try {
            const result = await handleFeedbackRequest(body, event);
            return {
                statusCode: result.statusCode,
                headers,
                body: JSON.stringify(result.body)
            };
        } catch (error) {
            console.error('Feedback handler error:', error.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to store feedback.' })
            };
        }
    }

    if (postRoute === 'api_feedback') {
        try {
            const result = await handleComplianceFeedbackRequest(body);
            return {
                statusCode: result.statusCode,
                headers,
                body: JSON.stringify(result.body)
            };
        } catch (error) {
            console.error('Policy correction handler error:', error.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to store policy correction feedback.' })
            };
        }
    }

    if (!DEEPSEEK_API_KEY) {
        console.error('DEEPSEEK_API_KEY not set');
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
    }

    if (!query) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Service Online',
                build: FC_BUILD_ID,
                compliance_codec: 'cfb1'
            })
        };
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Query too long" }) };
    }

    const isInRange = checkSearchRange(query);
    if (!isInRange) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: AI_MESSAGES.outOfRange,
                grounding: { confidence: 'out_of_range' }
            })
        };
    }

    let hydrationResult = hydrateContext(body.context);
    if (!hydrationResult.valid && hydrationResult.reason === 'no_matched_rules') {
        hydrationResult = hydrateExploratoryContext(body.context, query);
    }

    if (!hydrationResult.valid) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: getInsufficientContextMessage(hydrationResult.reason),
                grounding: {
                    confidence: 'insufficient_context',
                    reason: hydrationResult.reason,
                    unknown_tag_ids: hydrationResult.unknown_tag_ids || [],
                    direction_skipped_tag_ids: hydrationResult.direction_skipped_tag_ids || []
                }
            })
        };
    }

    const groundedContext = hydrationResult.context;
    const userMessage = buildGroundedUserMessage(groundedContext, query);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: AI_MESSAGES.systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.2,
                max_tokens: 1500
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API error:', response.status, errorText);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: `DeepSeek API error: ${response.status}` })
            };
        }

        const data = await response.json();
        const assistantMessage = data.choices?.[0]?.message?.content || "No response generated";
        const grounding = postValidateResponse(assistantMessage, groundedContext);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: assistantMessage,
                grounding: {
                    ...grounding,
                    hydrated_tag_ids: hydrationResult.hydration?.hydrated_tag_ids || [],
                    unknown_tag_ids: hydrationResult.hydration?.unknown_tag_ids || []
                }
            })
        };

    } catch (error) {
        console.error('Error calling DeepSeek:', error.message);

        if (error.name === 'AbortError') {
            return {
                statusCode: 504,
                headers,
                body: JSON.stringify({ error: "Request timeout" })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to process request: " + error.message })
        };
    }
};

// Exported for local verification scripts.
exports.hydrateContext = hydrateContext;
exports.loadRuleLibrary = loadRuleLibrary;
exports.AI_MESSAGES = AI_MESSAGES;
exports.buildGroundedUserMessage = buildGroundedUserMessage;
