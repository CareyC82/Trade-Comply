/**
 * Compliance Pre-Screening Report — structured synthesis (English-only).
 * Used by the browser dashboard and optional FC API.
 */
'use strict';

const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const STANDARD_LEGAL_DISCLAIMER = [
    'This Compliance Pre-Screening Report is generated automatically from Trade Comply\'s rule library',
    'and official source citations. It is a preliminary research aid only — not legal advice, not customs',
    'ruling, and not a clearance to ship. Importers, exporters, and their counsel must independently',
    'verify all requirements with qualified professionals and competent authorities before relying on',
    'this output.'
].join(' ');

const ORIGIN_LABEL = 'China (PRC)';

function inferTagRiskLevel(tag) {
    const text = `${tag.category || ''} ${tag.tag_id || ''} ${tag.description || ''} ${tag.short_description || ''} ${tag.risk_scenarios || ''}`.toLowerCase();
    if (text.includes('dual-use') || text.includes('export control') || text.includes('encryption')
        || text.includes('semiconductor') || text.includes('uav') || text.includes('infrared')) {
        return 'high';
    }
    if (text.includes('battery') || text.includes('srrc') || text.includes('wireless') || text.includes('ccc')) {
        return 'medium';
    }
    return 'low';
}

function resolveRiskLevel(profile = {}, tags = []) {
    const internal = String(profile.risk || 'low').toLowerCase();
    let level = 'LOW';
    if (internal === 'review_required') {
        level = 'CRITICAL';
    } else if (internal === 'high') {
        level = 'HIGH';
    } else if (internal === 'medium') {
        level = 'MEDIUM';
    }

    const hasGlobalControl = tags.some((tag) => {
        const isGlobal = String(tag.tag_id || '').startsWith('CL-GLPOL-');
        const score = Number(tag.confidence_score ?? tag.policy_tracker?.confidence_score);
        const highConfidence = Number.isFinite(score) ? score >= 0.8 : false;
        return isGlobal && highConfidence;
    });
    const exportControlHits = tags.filter((tag) => tag.category === 'EXPORT_CTRL' || inferTagRiskLevel(tag) === 'high').length;

    if (exportControlHits >= 2 || (hasGlobalControl && level === 'HIGH')) {
        return 'CRITICAL';
    }
    if (hasGlobalControl || exportControlHits >= 1) {
        return level === 'LOW' ? 'HIGH' : level;
    }
    return level;
}

function prioritizeTags(tags) {
    return [...tags].sort((a, b) => {
        const globalA = String(a.tag_id || '').startsWith('CL-GLPOL-') ? 0 : 1;
        const globalB = String(b.tag_id || '').startsWith('CL-GLPOL-') ? 0 : 1;
        if (globalA !== globalB) {
            return globalA - globalB;
        }
        const confA = Number(a.confidence_score ?? 0);
        const confB = Number(b.confidence_score ?? 0);
        return confB - confA;
    });
}

function buildTriggerReason({ productQuery, flowLabel, tags, profile }) {
    const top = prioritizeTags(tags).slice(0, 3);
    if (top.length === 0) {
        if ((profile.signals || []).length > 0) {
            return `Pre-check attributes for "${productQuery}" on ${flowLabel} raised ${profile.signals.join(', ')} — run a full product search to attach specific regulatory citations.`;
        }
        return `No binding rule match was found for "${productQuery}" on ${flowLabel}. This screen does not clear the shipment; obligations may still apply.`;
    }

    const regulationLines = top.map((tag) => {
        const body = String(tag.short_description || tag.content_en || tag.description || '').trim();
        const label = tag.short_name || tag.tag_id || 'Matched rule';
        const jurisdiction = tag.jurisdiction || tag.policy_tracker?.jurisdiction || tag.country || '';
        const jPart = jurisdiction ? ` [${jurisdiction}]` : '';
        return `${label}${jPart}: ${body.slice(0, 220)}`;
    });

    return `Screening "${productQuery}" on ${flowLabel} matched ${tags.length} rule(s). Primary triggers: ${regulationLines.join(' · ')}`;
}

function buildExecutiveSummary(ctx, riskLevel, triggerReason) {
    const { productQuery, flowLabel, profile, tags } = ctx;
    const matchLine = tags.length > 0
        ? `${tags.length} compliance signal(s) were matched from the authoritative rule library.`
        : 'No direct rule match was returned from the current library scope.';
    const attrLine = (profile.selectedAttributeLabels || []).length > 0
        ? ` User-selected risk attributes: ${profile.selectedAttributeLabels.join(', ')}.`
        : '';
    return [
        `Executive pre-screen for "${productQuery}" (${flowLabel}).`,
        matchLine,
        attrLine,
        `Overall risk rating: ${riskLevel}.`,
        triggerReason
    ].join(' ').replace(/\s+/g, ' ').trim();
}

function buildMissingInformationChecklist(ctx, profile) {
    const items = [];
    const seen = new Set();
    const add = (text) => {
        const line = String(text || '').trim();
        if (!line || seen.has(line)) {
            return;
        }
        seen.add(line);
        items.push(line);
    };

    (profile.nextChecks || []).forEach((check) => add(check));

    const hs = ctx.hsContext || {};
    if (!hs.chinaCode) {
        add('Confirm China HS/CN commodity code and product description used on the customs declaration.');
    }
    if (!hs.counterpartyCode) {
        add(`Validate counterparty-country HS classification for ${ctx.destinationLabel || ctx.destination || 'the destination market'}.`);
    }
    if (!hs.officialName) {
        add('Collect manufacturer technical specifications and bill of materials for classification support.');
    }
    if ((ctx.precheckSelections || []).length === 0 && (ctx.tags || []).length > 0) {
        add('Complete optional pre-check attribute selections to sharpen end-use and component-level screening.');
    }
    add('Gather commercial invoice, packing list, contract Incoterms, and end-user / end-use statements.');
    add('Document any prior licenses, classifications, or broker advisories for this SKU and consignee.');

    return items.slice(0, 8);
}

function buildVerificationObjects(ctx, tags, profile) {
    const objects = [];
    const seen = new Set();
    const add = (text) => {
        const line = String(text || '').trim();
        if (!line || seen.has(line)) {
            return;
        }
        seen.add(line);
        objects.push(line);
    };

    add('Ultimate consignee legal entity and ownership chain (including intermediaries).');
    add('End-user, end-use, and destination country declarations aligned with the commercial contract.');

    const selectionIds = new Set((ctx.precheckSelections || []).map((item) => item.id));
    if (selectionIds.has('semiconductor') || selectionIds.has('ai_chip') || selectionIds.has('advanced_manufacturing')) {
        add('Semiconductor die, wafer source, foundry/packaging flow, and controlled technology content in the bill of materials.');
    }
    if (selectionIds.has('encryption') || selectionIds.has('wireless')) {
        add('Cryptography / radio modules and country-specific type-approval certificates (e.g., SRRC, FCC).');
    }
    if (selectionIds.has('battery')) {
        add('Battery cell supplier, UN38.3 test summary, watt-hour rating, and dangerous-goods transport paperwork.');
    }
    if (selectionIds.has('uav') || selectionIds.has('destination_end_use')) {
        add('UAV flight capability, payload sensors, and military/surveillance end-use screening.');
    }

    tags.forEach((tag) => {
        if (tag.category === 'EXPORT_CTRL' || String(tag.tag_id || '').startsWith('CL-GLPOL-')) {
            add(`Supply-chain and license posture tied to rule ${tag.tag_id || tag.short_name || 'global policy'}.`);
        }
    });

    if (profile.risk === 'review_required' || profile.risk === 'high') {
        add('Restricted-party / sanctions screening for all parties and banks in the transaction.');
    }

    return objects.slice(0, 7);
}

function collectOfficialSources(tags) {
    const byUrl = new Map();
    for (const tag of tags) {
        const url = String(tag.source_url || '').trim();
        if (!url || url === '#') {
            continue;
        }
        if (byUrl.has(url)) {
            continue;
        }
        byUrl.set(url, {
            label: String(tag.source_citation || tag.short_name || tag.tag_id || 'Official source').trim(),
            url,
            jurisdiction: tag.jurisdiction || tag.policy_tracker?.jurisdiction || tag.country || '',
            source_type: tag.source_type || tag.policy_tracker?.source_type || '',
            tag_id: tag.tag_id || ''
        });
    }
    return [...byUrl.values()].slice(0, 12);
}

/**
 * @param {object} context
 * @returns {object} Pre-screen report JSON
 */
function buildPreScreenReport(context = {}) {
    const tags = Array.isArray(context.tags) ? context.tags : [];
    const profile = context.profile || {};
    const productQuery = String(context.productQuery || context.query || '').trim() || 'Product query';
    const direction = context.directionRaw || context.direction || 'export';
    const destination = context.destination || context.country || 'US';
    const destinationLabel = context.destinationLabel || context.countryLabel || destination;
    const directionLabel = context.directionLabel
        || (direction === 'import' ? 'Import into China' : 'Export from China');
    const flowLabel = context.flowLabel || `${directionLabel} → ${destinationLabel}`;
    const origin = context.origin || 'CN';
    const originLabel = context.originLabel || ORIGIN_LABEL;

    const riskLevel = resolveRiskLevel(profile, tags);
    const triggerReason = buildTriggerReason({ productQuery, flowLabel, tags, profile });
    const executiveSummary = buildExecutiveSummary(
        { productQuery, flowLabel, profile, tags, precheckSelections: context.precheckSelections },
        riskLevel,
        triggerReason
    );

    return {
        schema_version: '1.0',
        generated_at: new Date().toISOString(),
        inputs: {
            product_query: productQuery,
            origin,
            origin_label: originLabel,
            destination,
            destination_label: destinationLabel,
            direction,
            direction_label: directionLabel,
            flow_label: flowLabel,
            precheck_attribute_ids: (context.precheckSelections || []).map((item) => item.id).filter(Boolean)
        },
        executive_summary: executiveSummary,
        risk_level: riskLevel,
        trigger_reason: triggerReason,
        missing_information: buildMissingInformationChecklist(context, profile),
        verification_objects: buildVerificationObjects(context, tags, profile),
        official_sources: collectOfficialSources(tags),
        legal_disclaimer: context.legalDisclaimer || STANDARD_LEGAL_DISCLAIMER,
        matched_rule_count: tags.length,
        matched_case_count: Array.isArray(context.cases) ? context.cases.length : 0,
        synthesis_method: context.synthesisMethod || 'structured_rules'
    };
}

const preScreenReportApi = {
    RISK_LEVELS,
    STANDARD_LEGAL_DISCLAIMER,
    buildPreScreenReport,
    resolveRiskLevel,
    collectOfficialSources
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = preScreenReportApi;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyPreScreenReport = preScreenReportApi;
}
