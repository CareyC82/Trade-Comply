/**
 * Parse model JSON responses (strip markdown fences / extract outer object).
 */

function parseModelJsonPayload(text, {
    requiredFields = [],
    fieldAliases = {}
} = {}) {
    if (!text || typeof text !== 'string') {
        throw new Error('Empty model response');
    }

    let jsonText = text.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        jsonText = fenced[1].trim();
    } else {
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
    }

    const parsed = JSON.parse(jsonText);
    const result = { ...parsed };

    for (const [canonical, aliases] of Object.entries(fieldAliases)) {
        if (result[canonical] !== undefined && result[canonical] !== null) {
            result[canonical] = String(result[canonical]).trim();
            continue;
        }
        for (const alias of aliases) {
            if (result[alias] !== undefined && result[alias] !== null) {
                result[canonical] = String(result[alias]).trim();
                break;
            }
        }
        if (result[canonical] === undefined) {
            result[canonical] = '';
        } else {
            result[canonical] = String(result[canonical]).trim();
        }
    }

    for (const field of requiredFields) {
        if (!result[field]) {
            throw new Error(`Model JSON missing required field: ${field}`);
        }
    }

    return result;
}

function parseHsCodeClassificationPayload(text) {
    const parsed = parseModelJsonPayload(text, {
        requiredFields: ['hscode', 'official_name', 'reasoning'],
        fieldAliases: {
            hscode: ['hscode', 'hs_code'],
            official_name: ['official_name', 'officialName'],
            confidence: ['confidence'],
            reasoning: ['reasoning', 'reason']
        }
    });

    return {
        hscode: parsed.hscode,
        official_name: parsed.official_name,
        confidence: parsed.confidence || '',
        reasoning: parsed.reasoning
    };
}

module.exports = {
    parseModelJsonPayload,
    parseHsCodeClassificationPayload
};
