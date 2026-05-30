/**
 * Upsert per-industry "policy pulse" rows in data/tags.json after LLM filter passes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getDataPaths } = require('./data-review');

const INDUSTRY_PULSE_TAGS = {
    Electronics: {
        tag_id: 'CL-POLICY-PULSE-ELECTRONICS',
        short_name: '[Policy Pulse · Electronics]',
        related_hs_codes: ['8517.12'],
        related_keywords: ['electronics', 'consumer device', 'radio', 'battery', 'smartphone', 'earbuds']
    },
    'New Energy': {
        tag_id: 'CL-POLICY-PULSE-NEW-ENERGY',
        short_name: '[Policy Pulse · New Energy]',
        related_hs_codes: ['8507.60'],
        related_keywords: ['solar', 'photovoltaic', 'lithium battery', 'energy storage', 'ev charging', 'supply chain']
    },
    Semiconductor: {
        tag_id: 'CL-POLICY-PULSE-SEMICONDUCTOR',
        short_name: '[Policy Pulse · Semiconductor]',
        related_hs_codes: ['8541.40'],
        related_keywords: ['semiconductor', 'chip', 'export control', 'dual-use', 'hbm', 'gpu', 'bis']
    }
};

function readTags(tagsPath) {
    if (!fs.existsSync(tagsPath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
}

function writeTags(tagsPath, tags) {
    fs.mkdirSync(path.dirname(tagsPath), { recursive: true });
    fs.writeFileSync(tagsPath, `${JSON.stringify(tags, null, 2)}\n`, 'utf8');
}

function buildPulseTag(meta, template) {
    const today = new Date().toISOString().slice(0, 10);
    const summary = String(meta.summaryEn || '').trim();
    return {
        tag_id: template.tag_id,
        category: 'OTHER',
        category_label: 'Other Requirements',
        tag_type: 'MATCHED',
        short_name: template.short_name,
        short_description: summary,
        description: summary,
        content_en: summary,
        content_zh: summary,
        source_citation: meta.sourceLabel || 'Policy tracker',
        source_url: meta.sourceUrl || '',
        effective_date: today,
        status: 'ACTIVE',
        direction: 'both',
        related_hs_codes: template.related_hs_codes,
        related_keywords: template.related_keywords,
        display_order: 2,
        related_cases: [],
        policy_tracker: {
            source_id: meta.sourceId,
            industry: meta.industry,
            fetched_at: meta.fetchedAt,
            updated_at: new Date().toISOString()
        }
    };
}

/**
 * Update or insert industry pulse tag. Returns { updated, tag_id } or null if industry unsupported.
 */
function upsertIndustryPulseTag(tags, meta) {
    const template = INDUSTRY_PULSE_TAGS[meta.industry];
    if (!template || !meta.summaryEn) {
        return null;
    }

    const payload = buildPulseTag(meta, template);
    const index = tags.findIndex((row) => row.tag_id === template.tag_id);
    if (index >= 0) {
        tags[index] = { ...tags[index], ...payload };
        return { updated: true, tag_id: template.tag_id, created: false };
    }

    tags.push(payload);
    return { updated: true, tag_id: template.tag_id, created: true };
}

function applyIndustryPulseToProd(meta, options = {}) {
    const { prodTags } = getDataPaths();
    const tagsPath = options.tagsPath || prodTags;
    const tags = readTags(tagsPath);
    const result = upsertIndustryPulseTag(tags, meta);
    if (!result) {
        return { ok: false, reason: 'unsupported_industry_or_empty_summary' };
    }
    writeTags(tagsPath, tags);
    return { ok: true, ...result, tags_path: tagsPath };
}

module.exports = {
    INDUSTRY_PULSE_TAGS,
    upsertIndustryPulseTag,
    applyIndustryPulseToProd
};
