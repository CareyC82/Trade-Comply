/**
 * Detect input type (HS code or product name)
 */
function detectInputType(input) {
    const trimmed = input.trim();
    if (/^\d{4,6}(\.\d{1,4})?$/.test(trimmed)) {
        return 'hs_code';
    }
    return 'product_name';
}

/**
 * Match tags by HS code
 */
function matchByHSCode(hsCode, tags) {
    const normalizedInput = hsCode.trim().replace(/\./g, '');
    return tags.filter(tag => {
        if (!tag.related_hs_codes || tag.related_hs_codes.length === 0) return false;
        return tag.related_hs_codes.some(code => {
            const normalizedCode = code.replace(/\./g, '');
            return normalizedCode.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCode);
        });
    });
}

/**
 * Match tags by product name keywords
 */
function matchByProductName(query, tags) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
    
    // Check if this is a semiconductor-related query
    const semiKeywords = ["chip", "semiconductor", "gpu", "cpu", "processor", "memory", "dram", "hbm", "nand", "flash", "wafer", "foundry", "fabless", "eda", "chiplet", "3d ic", "advanced packaging", "silicon photonics"];
    const isSemiQuery = queryWords.some(word => semiKeywords.includes(word));
    
    let scoredTags = tags.map(tag => {
        const keywords = tag.related_keywords || [];
        
        // Calculate match score
        let score = 0;
        let exactPhraseMatch = false;
        keywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            if (keywordLower === queryLower) {
                // Exact phrase match - highest score
                score += 10;
                exactPhraseMatch = true;
            } else if (queryWords.includes(keywordLower)) {
                // Exact word match
                score += 5;
            } else if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
                // Partial match - check if query words are in keyword
                let wordMatches = 0;
                queryWords.forEach(word => {
                    if (keywordLower.includes(word)) {
                        wordMatches++;
                    }
                });
                // Give more points for multiple word matches in a keyword
                if (wordMatches > 0) {
                    score += wordMatches * 2; // 2 points per matching word
                } else {
                    score += 1; // At least 1 point for partial match
                }
            }
        });
        
        // For semiconductor queries, ensure all semiconductor tags get at least some score based on direction
        const currentDir = AppState.currentDirection || 'export';
        const tagDir = tag.direction || 'both';
        if (isSemiQuery && tag.tag_id && tag.tag_id.startsWith('CL-CHIP-')) {
            // Only include semiconductor tags that match current direction
            if ((tagDir === 'both' || tagDir === currentDir) && score === 0) {
                score = 1; // Give minimum score to relevant semiconductor tags
            }
        }
        
        // For multi-word queries, filter out low-scoring matches
        if (queryWords.length > 1 && score > 0 && score < 4 && !(isSemiQuery && tag.tag_id && tag.tag_id.startsWith('CL-CHIP-'))) {
            score = 0; // Reject if only minor partial matches (except semiconductor tags)
        }
        
        return { tag, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.tag);
    
    return scoredTags;
}

/**
 * Search logic core
 */
function search(query) {
    const tags = AppState.data.tags || [];
    const cases = AppState.data.cases || [];
    let matchedTags = [];
    
    if (!query || !query.trim()) {
        matchedTags = [...tags];
    } else {
        const inputType = detectInputType(query);
        if (inputType === 'hs_code') {
            matchedTags = matchByHSCode(query, tags);
        } else {
            matchedTags = matchByProductName(query, tags);
        }
    }

    const currentDirection = AppState.currentDirection || 'export';
    matchedTags = matchedTags.filter(tag => {
        const tagDirection = tag.direction || 'both';
        return tagDirection === 'both' || tagDirection === currentDirection;
    });

    // Sort results
    matchedTags.sort((a, b) => {
        const typeOrderA = a.tag_type === 'MATCHED' ? 1 : 0;
        const typeOrderB = b.tag_type === 'MATCHED' ? 1 : 0;
        if (typeOrderB !== typeOrderA) return typeOrderB - typeOrderA;
        const orderA = a.display_order || a.order || 999;
        const orderB = b.display_order || b.order || 999;
        return orderA - orderB;
    });

    // Search cases by keywords, HS codes, and related tags
    let matchedCases = cases.map(caseItem => {
        const caseDirection = caseItem.direction || 'both';
        if (caseDirection !== 'both' && caseDirection !== currentDirection) {
            return { case: caseItem, score: 0 };
        }
        if (!query || !query.trim()) {
            return { case: caseItem, score: 1 };
        }
        
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
        const caseKeywords = caseItem.related_keywords || [];
        const relatedTags = caseItem.related_tags || [];
        
        // Calculate keyword match score
        let score = 0;
        let exactPhraseMatch = false;
        caseKeywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            if (keywordLower === queryLower) {
                // Exact phrase match - highest score
                score += 10;
                exactPhraseMatch = true;
            } else if (queryWords.includes(keywordLower)) {
                // Exact word match
                score += 5;
            } else if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
                // Partial match - check if query words are in keyword
                let wordMatches = 0;
                queryWords.forEach(word => {
                    if (keywordLower.includes(word)) {
                        wordMatches++;
                    }
                });
                // Give more points for multiple word matches in a keyword
                if (wordMatches > 0) {
                    score += wordMatches * 2; // 2 points per matching word
                } else {
                    score += 1; // At least 1 point for partial match
                }
            }
        });
        
        // For multi-word queries, filter out low-scoring matches
        if (queryWords.length > 1 && score > 0 && score < 4) {
            score = 0; // Reject if only minor partial matches
        }
        
        // HS code matching
        const isHSCode = /^\d{4,6}(\.\d{1,4})?$/.test(query);
        if (isHSCode) {
            const normalizedInput = query.replace(/\./g, '');
            const hsMatch = relatedTags.some(tagId => {
                const tag = tags.find(t => t.tag_id.toLowerCase() === tagId.toLowerCase());
                if (!tag || !tag.related_hs_codes) return false;
                return tag.related_hs_codes.some(code => {
                    const normalizedCode = code.replace(/\./g, '');
                    return normalizedCode.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCode);
                });
            });
            if (hsMatch) {
                score += 10;
            }
            
            const summaryLower = (caseItem.summary || '').toLowerCase();
            if (summaryLower.includes(queryLower)) {
                score += 5;
            }
        }
        
        return { case: caseItem, score: score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.case);

    return { tags: matchedTags, cases: matchedCases };
}

function getPrecheckSelections(panelId = 'precheck-panel') {
    const panel = document.getElementById(panelId);
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('input[data-precheck]:checked'))
        .map(input => input.dataset.precheck)
        .filter(id => PRECHECK_FACTORS[id])
        .map(id => ({ id, ...PRECHECK_FACTORS[id] }));
}

function buildPrecheckQuery(query, selections) {
    const parts = [query || ''];
    selections.forEach(item => {
        parts.push(...item.keywords);
    });
    return parts.join(' ').trim();
}

function mergeById(items, getId) {
    const seen = new Set();
    return items.filter(item => {
        const id = getId(item);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function searchWithPrecheck(query, selections, searchFn = search) {
    const trimmedQuery = query ? query.trim() : '';
    const keywordOnlyQuery = buildPrecheckQuery('', selections);
    const baseResults = trimmedQuery ? searchFn(trimmedQuery) : { tags: [], cases: [] };
    const precheckResults = keywordOnlyQuery ? searchFn(keywordOnlyQuery) : { tags: [], cases: [] };
    const allResults = !trimmedQuery && !keywordOnlyQuery ? searchFn('') : {
        tags: mergeById([...baseResults.tags, ...precheckResults.tags], tag => tag.tag_id),
        cases: mergeById([...baseResults.cases, ...precheckResults.cases], caseItem => caseItem.case_id)
    };
    return allResults;
}
