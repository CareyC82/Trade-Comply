/**
 * Enrich search results using tag ↔ case links (related_tags / related_cases).
 */

function caseMatchesDirection(caseItem, direction) {
    const caseDirection = caseItem?.direction || 'both';
    const dir = direction === 'import' ? 'import' : 'export';
    return caseDirection === 'both' || caseDirection === dir;
}

function collectCasesForMatchedTags(matchedTags, allCases, direction = 'export') {
    const tagIds = new Set(
        (matchedTags || []).map((tag) => tag?.tag_id).filter(Boolean)
    );
    const byId = new Map();

    (allCases || []).forEach((caseItem) => {
        if (!caseItem?.case_id || !caseMatchesDirection(caseItem, direction)) {
            return;
        }
        const linkedByTag = (caseItem.related_tags || []).some((id) => tagIds.has(id));
        if (linkedByTag) {
            byId.set(caseItem.case_id, caseItem);
        }
    });

    (matchedTags || []).forEach((tag) => {
        (tag.related_cases || []).forEach((caseId) => {
            const caseItem = (allCases || []).find((c) => c.case_id === caseId);
            if (caseItem && caseMatchesDirection(caseItem, direction)) {
                byId.set(caseItem.case_id, caseItem);
            }
        });
    });

    return [...byId.values()];
}

function mergeCasesById(...lists) {
    const byId = new Map();
    lists.forEach((list) => {
        (list || []).forEach((caseItem) => {
            if (caseItem?.case_id) {
                byId.set(caseItem.case_id, caseItem);
            }
        });
    });
    return [...byId.values()];
}

const api = {
    caseMatchesDirection,
    collectCasesForMatchedTags,
    mergeCasesById
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyMatchedResults = api;
}
