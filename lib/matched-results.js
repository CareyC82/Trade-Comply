/**
 * Enrich search results using tag ↔ case links (related_tags / related_cases),
 * filtered by query relevance so unrelated chip cases do not appear for NAND/flash searches.
 */

function caseMatchesDirection(caseItem, direction) {
    const caseDirection = caseItem?.direction || 'both';
    const dir = direction === 'import' ? 'import' : 'export';
    return caseDirection === 'both' || caseDirection === dir;
}

/**
 * Score how well a penalty case matches the user's product query (0 = not relevant).
 */
function scoreCaseAgainstQuery(caseItem, query) {
    if (!caseItem) {
        return 0;
    }
    const rawQuery = String(query || '').trim();
    if (!rawQuery) {
        return 1;
    }

    const queryLower = rawQuery.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
    const caseKeywords = caseItem.related_keywords || [];
    const textFields = [
        ...caseKeywords,
        caseItem.title || '',
        caseItem.summary || '',
        caseItem.category || ''
    ];

    let score = 0;

    textFields.forEach((text) => {
        const textLower = String(text).toLowerCase().trim();
        if (!textLower) {
            return;
        }
        if (textLower === queryLower) {
            score += 10;
            return;
        }
        if (queryWords.length > 1 && textLower.includes(queryLower)) {
            score += 8;
            return;
        }
        queryWords.forEach((word) => {
            if (word.length < 2) {
                return;
            }
            if (textLower === word) {
                score += 5;
            } else if (textLower.includes(word)) {
                score += 2;
            } else if (word.length >= 4 && textLower.split(/\s+/).some((part) => part === word)) {
                score += 3;
            }
        });
    });

    if (queryWords.length > 1 && score > 0 && score < 4) {
        return 0;
    }

    return score;
}

function filterCasesByQueryRelevance(cases, query) {
    const rawQuery = String(query || '').trim();
    if (!rawQuery) {
        return cases || [];
    }
    return (cases || []).filter((caseItem) => scoreCaseAgainstQuery(caseItem, query) > 0);
}

function collectCasesForMatchedTags(matchedTags, allCases, direction = 'export', query = '') {
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

    return filterCasesByQueryRelevance([...byId.values()], query);
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
    scoreCaseAgainstQuery,
    filterCasesByQueryRelevance,
    collectCasesForMatchedTags,
    mergeCasesById
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}

if (typeof globalThis !== 'undefined') {
    globalThis.TradeComplyMatchedResults = api;
}
