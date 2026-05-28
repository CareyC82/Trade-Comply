/**
 * Enrich legacy tags with unified risk-signal fields (browser).
 */
function enrichTagForCountryPanel(tag) {
    if (!tag || typeof tag !== 'object') {
        return tag;
    }
    const country = globalThis.TradeComplyCountry
        ? globalThis.TradeComplyCountry.normalizeCountryCode(tag.country || 'GLOBAL')
        : (tag.country || 'GLOBAL');
    const contentEn = tag.content_en || tag.short_description || tag.description || '';
    const contentZh = tag.content_zh || contentEn;
    const hsCode = tag.hs_code || (Array.isArray(tag.related_hs_codes) ? tag.related_hs_codes[0] : '');
    let riskLevel = tag.risk_level || 'Medium';
    if (!/^(High|Medium|Low)$/i.test(riskLevel)) {
        riskLevel = tag.tag_type === 'MATCHED' ? 'High' : 'Medium';
    }
    return {
        ...tag,
        country,
        content_en: contentEn,
        content_zh: contentZh,
        hs_code: hsCode,
        risk_level: riskLevel,
        source: tag.source || tag.source_citation || 'Trade Comply Library'
    };
}
