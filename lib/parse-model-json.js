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
            hs6: ['hs6', 'hs_6'],
            china_export_hscode: ['china_export_hscode', 'china_export_hs', 'cn_export_hscode'],
            china_import_hscode: ['china_import_hscode', 'china_import_hs', 'cn_import_hscode'],
            destination_import_code: ['destination_import_code', 'destination_hscode', 'import_hts', 'hts_code'],
            origin_export_code: ['origin_export_code', 'origin_hscode'],
            destination_country: ['destination_country', 'counterparty_country'],
            destination_code_type: ['destination_code_type', 'code_type'],
            cross_border_note: ['cross_border_note', 'conversion_note'],
            official_name: ['official_name', 'officialName'],
            confidence: ['confidence'],
            reasoning: ['reasoning', 'reason']
        }
    });

    return {
        hscode: parsed.hscode,
        hs6: parsed.hs6 || '',
        china_export_hscode: parsed.china_export_hscode || '',
        china_import_hscode: parsed.china_import_hscode || '',
        destination_import_code: parsed.destination_import_code || '',
        origin_export_code: parsed.origin_export_code || '',
        destination_country: parsed.destination_country || '',
        destination_code_type: parsed.destination_code_type || '',
        cross_border_note: parsed.cross_border_note || '',
        official_name: parsed.official_name,
        confidence: parsed.confidence || '',
        reasoning: parsed.reasoning
    };
}

module.exports = {
    parseModelJsonPayload,
    parseHsCodeClassificationPayload
};
