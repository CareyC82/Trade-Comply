const fs = require('fs');
const path = require('path');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ALLOWED_ORIGIN = "https://careyc82.github.io";
const MAX_QUERY_LENGTH = 500;
const TIMEOUT_MS = 30000;
const MAX_CONTEXT_TAGS = 8;
const MAX_CONTEXT_CASES = 3;
const MAX_FIELD_LENGTH = 500;

const ALLOWED_KEYWORDS = [
    "chip", "semiconductor", "integrated circuit", "ic", "gpu", "ai chip", "hbm", "dram", "nand",
    "cpu", "processor", "wafer", "foundry", "lithography", "etching", "eda", "chiplet", "3d ic",
    "advanced packaging", "silicon photonics", "optical interconnect", "fabless", "inference accelerator",
    "NVIDIA", "H200", "RTX Pro", "finfet", "gaa", "tape-out", "gdsii",
    "phone", "mobile", "smartphone", "iphone", "android", "cellular",
    "laptop", "computer", "pc", "notebook", "tablet", "ipad",
    "headphone", "earphone", "earbud", "headset", "airpod",
    "speaker", "audio", "sound", "microphone",
    "camera", "webcam", "ip camera", "cctv", "surveillance",
    "drone", "uav", "quadcopter", "unmanned aerial vehicle",
    "battery", "lithium", "li-ion", "power bank", "charger",
    "wireless", "wifi", "bluetooth", "rf", "radio", "nfc", "zigbee",
    "iot", "smart device", "smart home", "smart watch", "wearable",
    "solar", "photovoltaic", "pv panel", "inverter",
    "robot", "robotic", "industrial robot", "automation",
    "sensor", "lidar", "radar", "infrared", "thermal",
    "display", "monitor", "screen", "lcd", "oled",
    "printer", "3d printer", "fdm", "resin printer",
    "router", "modem", "network", "switch",
    "storage", "ssd", "hard drive", "memory",
    "encryption", "encrypted", "crypto", "vpn",
    "export", "import", "customs", "tariff", "vat",
    "ccc", "srrc", "certification", "compliance",
    "optical", "fiber", "module", "transceiver",
    "walkie", "talkie", "two-way radio",
    "earbuds", "headphones", "tws",
    "机器人", "无人机", "电池", "太阳能", "储能", "耳机", "蓝牙耳机", "打印机", "光模块",
    "industrial", "energy", "optical", "fdm printer", "server", "servers",
    "electric bicycle", "e-bike", "ebike", "electric bike",
    "电动自行车", "电单车"
];

const TAG_ID_PATTERN = /^CL-[A-Z]+-\d+$/;
const CASE_ID_PATTERN = /^CASE-[A-Z0-9-]+$/;

let TAGS_BY_ID = {};
let CASES_BY_ID = {};

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
    } catch (error) {
        console.error('Failed to load rule library from data/*.json:', error.message);
        TAGS_BY_ID = {};
        CASES_BY_ID = {};
    }
}

loadRuleLibrary();

function checkSearchRange(query) {
    const queryLower = query.toLowerCase();
    for (const keyword of ALLOWED_KEYWORDS) {
        if (queryLower.includes(keyword)) {
            return true;
        }
    }
    return false;
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
    const tagBlocks = context.matched_tags.map(formatTagBlock).join('\n\n');
    const caseBlocks = context.related_cases.length
        ? context.related_cases.map(formatCaseBlock).join('\n\n')
        : 'None matched.';

    const directionLabel = context.direction === 'import'
        ? 'import INTO China'
        : 'export FROM China';

    return [
        `PRODUCT QUERY: ${context.product_query || 'Not specified'}`,
        `DIRECTION: ${directionLabel}`,
        `RISK LEVEL: ${context.risk_level}`,
        `PRECHECK ATTRIBUTES: ${context.precheck_attributes.join(', ') || 'none'}`,
        '',
        `=== MATCHED RULES (${context.match_count.tags} total, top ${context.matched_tags.length} shown) ===`,
        tagBlocks || 'None matched.',
        '',
        `=== RELATED CASES (${context.match_count.cases} total) ===`,
        caseBlocks,
        '',
        '=== USER QUESTION ===',
        userQuery
    ].join('\n');
}

function postValidateResponse(text, context) {
    const allowedIds = new Set([
        ...context.matched_tags.map(tag => tag.tag_id),
        ...context.related_cases.map(caseItem => caseItem.case_id)
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

    if (/rule library does not contain enough detail/i.test(text)) {
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
    insufficientContext: "The rule library did not match any compliance signals for this product screen, so the AI assistant cannot provide a grounded answer.\n\nPlease review the matched cards above, download the pre-check report, or submit feedback with your product details.",
    invalidTagIds: "The AI assistant could not verify the matched rule IDs against the server rule library. Please refresh the page and try again.",
    libraryUnavailable: "The AI assistant rule library is temporarily unavailable on the server. Please try again later or use the matched cards above.",
    systemPrompt: `You are a cautious Chinese trade compliance expert. Answer questions ONLY about China's import/export regulations. Never give legal advice. Always reply in English.

CRITICAL - Response Structure:
Structure your entire response using this exact format:

1. REGULATORY REQUIREMENTS
For each applicable regulation (e.g., CCC, SRRC), explain:
   a) What it is
   b) Official source
   c) Basic penalty risk

2. EXEMPTIONS & CONDITIONS
Explain any exemptions, special conditions, or thresholds that may apply.

3. HIDDEN RISKS (Dual-Use & Scenario Analysis)
Act as a risk detective. Based on the product's features, identify potential hidden compliance risks:
   - Could certain specs trigger dual-use controls?
   - Are there end-use or end-user concerns (e.g., military, surveillance)?
   - Any new regulations (e.g., 2026 Japan controls, supply chain rules) that might apply?
   - Data security issues (e.g., biometric data collection)?

4. COMPLIANCE STRATEGY
Provide actionable guidance:
   - What documents should the exporter prepare?
   - What official sources should they check?
   - What steps can reduce customs risk?

CRITICAL - Rules:
- ONLY cover China trade regulations. NEVER mention FCC, CE, FDA, RoHS, WEEE, UL, etc.
- If asked about non-China regulations, respond: "Sorry, I only cover China's trade compliance regulations."
- Keep each section concise but specific.

GROUNDING RULES (mandatory):
- You MUST answer using ONLY the MATCHED RULES and RELATED CASES provided in the user message.
- Every regulatory claim MUST cite a tag_id like [CL-CCC-001] or case_id like [CASE-003].
- If the provided context does not contain enough detail, say exactly:
  "The rule library does not contain enough detail to answer this. Please verify with the official source or submit feedback."
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

exports.handler = async (event) => {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    if (event.httpMethod === 'GET' && event.path === '/visitors') {
        const now = Date.now();
        const today = Math.floor(Math.random() * 30) + Math.floor(now / 3600000) % 10;
        const total = Math.floor(Math.random() * 50) + 280 + Math.floor(now / 86400000) * 2;
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ today, total })
        };
    }

    if (!DEEPSEEK_API_KEY) {
        console.error('DEEPSEEK_API_KEY not set');
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
    }

    let body;
    let rawBody;

    try {
        if (event.body) {
            if (typeof event.body === 'string') {
                rawBody = event.body;
            } else if (Buffer.isBuffer(event.body)) {
                rawBody = event.body.toString('utf-8');
            } else if (typeof event.body === 'object') {
                body = event.body;
            }
        }
        else if (event?.type === 'Buffer' && Array.isArray(event?.data)) {
            const buffer = Buffer.from(event.data);
            rawBody = buffer.toString('utf-8');
        }
        else if (Buffer.isBuffer(event)) {
            rawBody = event.toString('utf-8');
        }
        else if (typeof event === 'string' && event.trim().startsWith('{')) {
            rawBody = event;
        }

        if (typeof rawBody === 'string' && rawBody.trim()) {
            body = JSON.parse(rawBody);

            if (body?.body && typeof body.body === 'string') {
                try {
                    const nested = JSON.parse(body.body);
                    if (nested?.query) {
                        body = nested;
                    }
                } catch (e) {
                }
            }
        }
    } catch (e) {
        console.error('Parse error:', e.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON: " + e.message }) };
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
        return { statusCode: 200, headers, body: JSON.stringify({ message: "Service Online" }) };
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

    const hydrationResult = hydrateContext(body.context);
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
