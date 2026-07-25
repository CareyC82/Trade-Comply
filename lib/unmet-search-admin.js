'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATUS_FLOW = ['research_pending', 'source_research', 'rule_ready', 'published'];
const ALLOWED_DIRECTIONS = new Set(['import', 'export', 'both']);

function asStringList(value, max = 30) {
    const input = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(input.map((item) => String(item).trim()).filter(Boolean))].slice(0, max);
}

function isOfficialSource(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function evaluateRuleReady(item = {}) {
    const checks = {
        product_attributes: asStringList(item.product_attributes).length > 0,
        confirmed_hs_codes: asStringList(item.confirmed_hs_codes).some((code) => /^\d{6,10}$/.test(code.replace(/\D/g, ''))),
        official_sources: asStringList(item.official_sources).some(isOfficialSource),
        countries: asStringList(item.countries).length > 0,
        directions: asStringList(item.directions).some((direction) => ALLOWED_DIRECTIONS.has(direction))
    };
    const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
    return { ok: missing.length === 0, checks, missing };
}

function enrichBacklog(payload = {}) {
    const items = (payload.items || []).map((item, index) => {
        const normalized = {
            ...item,
            id: item.id || `gap-${index + 1}-${String(item.normalized_query || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)}`,
            status: STATUS_FLOW.includes(item.status) ? item.status : 'research_pending',
            product_attributes: asStringList(item.product_attributes),
            confirmed_hs_codes: asStringList(item.confirmed_hs_codes).map((code) => code.replace(/\D/g, '')),
            official_sources: asStringList(item.official_sources),
            countries: asStringList(item.countries).map((value) => value.toUpperCase()),
            directions: asStringList(item.directions).map((value) => value.toLowerCase())
        };
        return { ...normalized, quality_gate: evaluateRuleReady(normalized) };
    });
    return {
        ...payload,
        item_count: items.length,
        top_10: items.slice(0, 10),
        summary: {
            total: items.length,
            research_pending: items.filter((item) => item.status === 'research_pending').length,
            source_research: items.filter((item) => item.status === 'source_research').length,
            rule_ready: items.filter((item) => item.status === 'rule_ready').length,
            published: items.filter((item) => item.status === 'published').length,
            gate_ready: items.filter((item) => item.quality_gate.ok).length
        },
        items
    };
}

function updateBacklogItem(payload, id, patch = {}) {
    const enriched = enrichBacklog(payload);
    const index = enriched.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Unmet-search item not found: ${id}`);
    const current = enriched.items[index];
    const status = patch.status === undefined ? current.status : String(patch.status);
    if (!STATUS_FLOW.includes(status)) throw new Error(`Unsupported backlog status: ${status}`);
    const next = {
        ...current,
        status,
        owner_note: String(patch.owner_note ?? current.owner_note ?? '').trim().slice(0, 2000),
        product_attributes: patch.product_attributes === undefined ? current.product_attributes : asStringList(patch.product_attributes),
        confirmed_hs_codes: patch.confirmed_hs_codes === undefined
            ? current.confirmed_hs_codes
            : asStringList(patch.confirmed_hs_codes).map((code) => code.replace(/\D/g, '')),
        official_sources: patch.official_sources === undefined ? current.official_sources : asStringList(patch.official_sources),
        countries: patch.countries === undefined ? current.countries : asStringList(patch.countries).map((value) => value.toUpperCase()),
        directions: patch.directions === undefined ? current.directions : asStringList(patch.directions).map((value) => value.toLowerCase()),
        updated_at: new Date().toISOString()
    };
    next.quality_gate = evaluateRuleReady(next);
    if (['rule_ready', 'published'].includes(status) && !next.quality_gate.ok) {
        throw new Error(`Quality gate failed: ${next.quality_gate.missing.join(', ')}`);
    }
    enriched.items[index] = next;
    const output = enrichBacklog({ ...enriched, items: enriched.items, updated_at: next.updated_at });
    return output;
}

function writeBacklogAtomic(filePath, payload) {
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
}

module.exports = {
    STATUS_FLOW,
    evaluateRuleReady,
    enrichBacklog,
    updateBacklogItem,
    writeBacklogAtomic
};
