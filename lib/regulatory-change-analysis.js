'use strict';
const CATEGORIES = [['tariff_rate', /tariff|duty|rate|quota|customs value/i], ['product_scope', /scope|covered product|classification|hs code|cn code|category/i], ['supplier_documents', /certificate|declaration|test report|technical file|document|evidence/i], ['labeling', /label|marking|identifier|fcc id|ce mark|safety mark/i], ['transport', /battery|un38\.3|carrier|dangerous goods|shipping|transport/i], ['platform_listing', /marketplace|listing|seller|platform|amazon|tiktok/i]];
function analyzeRegulatoryChange(change = {}, impact = {}) {
    const evidence = [change.previous_summary, change.current_summary, change.summary, impact.conclusion_preview, ...(impact.requirement_ids || []), ...(impact.question_ids || [])].filter(Boolean).join(' ');
    const categories = CATEGORIES.filter(([, pattern]) => pattern.test(evidence)).map(([name]) => name);
    if (!categories.length) categories.push('scope_review_required');
    const actions = { tariff_rate: 'Re-check the exact HS, origin, rate layer and effective date.', product_scope: 'Re-check product attributes and classification boundaries.', supplier_documents: 'Review the exact-model supplier evidence checklist.', labeling: 'Review product and listing label requirements.', transport: 'Review battery and carrier acceptance conditions.', platform_listing: 'Review channel-specific listing evidence.', scope_review_required: 'Human review must determine the affected rule field.' };
    return { categories, affected_fields: categories.map(category => ({ category, proposed_action: actions[category] })), automatic_rule_change: false, review_required: true };
}
module.exports = { analyzeRegulatoryChange };
