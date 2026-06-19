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

const SEARCH_GENERIC_RELEVANCE_WORDS = new Set([
    'and',
    'for',
    'from',
    'into',
    'with',
    'the',
    'this',
    'that',
    'under',
    'export',
    'import',
    'control',
    'controls',
    'controlled',
    'license',
    'licensing',
    'requirement',
    'requirements',
    'compliance',
    'customs',
    'declaration',
    'classification',
    'destination',
    'origin',
    'country',
    'market',
    'review',
    'screen',
    'screening',
    'risk',
    'goods',
    'items',
    'product',
    'products',
    'united',
    'states',
    'china',
    'germany',
    'netherlands',
    'singapore',
    'mexico',
    'vietnam',
    'malaysia',
    'japan',
    'korea',
    'russia',
    'taiwan',
    'asean',
    'global'
]);

function getProductRelevanceTerms(query) {
    const raw = String(query || '').toLowerCase();
    if (!raw || /^\d{4,6}(\.\d{1,4})?$/.test(raw.trim())) {
        return [];
    }
    return Array.from(new Set(
        raw.split(/[^a-z0-9.]+/)
            .map((word) => word.trim())
            .filter((word) => word.length >= 3)
            .filter((word) => !SEARCH_GENERIC_RELEVANCE_WORDS.has(word))
            .filter((word) => !/^\d+$/.test(word))
    ));
}

function tagProductRelevanceText(tag) {
    return [
        tag?.tag_id,
        tag?.short_name,
        tag?.short_description,
        tag?.description,
        tag?.content_en,
        tag?.category,
        tag?.category_label,
        ...(tag?.related_keywords || [])
    ].filter(Boolean).join(' ').toLowerCase();
}

function isDroneSpecificTag(tag) {
    const text = [
        tag?.tag_id,
        tag?.category_label,
        tag?.short_name,
        tag?.short_description
    ].filter(Boolean).join(' ').toLowerCase();
    return /\b(drone|uav|uas|unmanned aircraft|quadcopter)\b/.test(text);
}

function queryHasDroneIntent(productTerms) {
    const terms = new Set(productTerms || []);
    return ['drone', 'uav', 'uas', 'quadcopter'].some((term) => terms.has(term));
}

function tagMatchesProductTerms(tag, productTerms) {
    if (!productTerms || productTerms.length === 0) {
        return true;
    }
    if (isDroneSpecificTag(tag) && !queryHasDroneIntent(productTerms)) {
        return false;
    }
    const text = tagProductRelevanceText(tag);
    const currentAppState = typeof AppState !== 'undefined' ? AppState : null;
    const normalizedQuery = String(currentAppState?.lastSearchRelevanceQuery || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const keywords = (tag?.related_keywords || []).map((keyword) => String(keyword || '').toLowerCase().trim());
    if (normalizedQuery && keywords.some((keyword) => keyword.length >= 5 && normalizedQuery.includes(keyword))) {
        return true;
    }
    const matches = productTerms.filter((term) => text.includes(term));
    if (productTerms.length >= 3) {
        return matches.length >= 2;
    }
    return matches.length > 0;
}

function scoreTagProductRelevance(tag, query) {
    const normalizedQuery = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const terms = getProductRelevanceTerms(query);
    if (!normalizedQuery || terms.length === 0) {
        return 0;
    }

    const text = tagProductRelevanceText(tag);
    const keywords = (tag?.related_keywords || []).map((keyword) => String(keyword || '').toLowerCase());
    let score = 0;

    if (keywords.includes(normalizedQuery)) {
        score += 80;
    } else if (text.includes(normalizedQuery)) {
        score += 60;
    }

    const matchedTerms = terms.filter((term) => text.includes(term));
    score += matchedTerms.length * 12;
    if (matchedTerms.length === terms.length) {
        score += 35;
    }

    keywords.forEach((keyword) => {
        if (!keyword) return;
        terms.forEach((term) => {
            if (keyword === term) {
                score += 10;
            } else if (keyword.includes(term)) {
                score += 4;
            }
        });
    });

    return score;
}

function filterTagsByProductRelevance(tags, query) {
    const terms = getProductRelevanceTerms(query);
    if (terms.length === 0) {
        return tags || [];
    }
    if (typeof AppState !== 'undefined') {
        AppState.lastSearchRelevanceQuery = query;
    }
    return (tags || []).filter((tag) => tagMatchesProductTerms(tag, terms));
}

function buildCurrentRouteContext(selectedCountry = 'US') {
    return {
        from: AppState.routeFromCountry || 'CN',
        to: AppState.routeToCountry || selectedCountry || 'US',
        focus: AppState.complianceFocus || ''
    };
}

function sortTagsForDisplay(tags, selectedCountry = 'US', routeContext = {}, query = '') {
    const countryApi = globalThis.TradeComplyCountry;
    const riskOrder = { High: 3, Medium: 2, Low: 1 };
    return [...(tags || [])].sort((a, b) => {
        const countryA = countryApi ? countryApi.countryPriorityScore(a, selectedCountry, routeContext) : 0;
        const countryB = countryApi ? countryApi.countryPriorityScore(b, selectedCountry, routeContext) : 0;
        if (countryB !== countryA) {
            return countryB - countryA;
        }

        const relevanceA = scoreTagProductRelevance(a, query);
        const relevanceB = scoreTagProductRelevance(b, query);
        if (relevanceB !== relevanceA) {
            return relevanceB - relevanceA;
        }

        const riskA = riskOrder[a.risk_level] || 1;
        const riskB = riskOrder[b.risk_level] || 1;
        if (riskB !== riskA) {
            return riskB - riskA;
        }

        const typeOrderA = a.tag_type === 'MATCHED' ? 1 : 0;
        const typeOrderB = b.tag_type === 'MATCHED' ? 1 : 0;
        if (typeOrderB !== typeOrderA) return typeOrderB - typeOrderA;
        const orderA = a.display_order || a.order || 999;
        const orderB = b.display_order || b.order || 999;
        return orderA - orderB;
    });
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
    const currentFocus = AppState.complianceFocus === 'export' ? 'export'
        : AppState.complianceFocus === 'import' ? 'import'
            : '';
    const caseDirectionsForRoute = currentFocus
        ? Array.from(new Set([currentFocus, currentDirection]))
        : [currentDirection];
    matchedTags = matchedTags.filter(tag => {
        const tagDirection = tag.direction || 'both';
        return tagDirection === 'both' || tagDirection === currentDirection;
    });

    if (currentFocus) {
        matchedTags = matchedTags.filter((tag) => {
            const tagFocus = tag.route_focus || tag.compliance_focus || '';
            return !tagFocus || tagFocus === currentFocus;
        });
    }

    const selectedCountry = AppState.currentCountry || 'US';
    const countryApi = globalThis.TradeComplyCountry;
    const routeContext = buildCurrentRouteContext(selectedCountry);

    if (countryApi?.filterTagsForSelectedCountry) {
        matchedTags = countryApi.filterTagsForSelectedCountry(matchedTags, selectedCountry, routeContext);
    } else if (countryApi?.countryMatchesSelection) {
        matchedTags = matchedTags.filter((tag) => countryApi.countryMatchesSelection(tag, selectedCountry, routeContext));
    }

    if (
        countryApi?.normalizeCountryCode?.(selectedCountry) === 'ASEAN'
        && currentFocus === 'import'
        && query
    ) {
        const queryLower = String(query).toLowerCase();
        const wantsVietnam = /\b(vietnam|viet nam|vn)\b/.test(queryLower);
        const wantsMalaysia = /\b(malaysia|my)\b/.test(queryLower);
        if (wantsVietnam !== wantsMalaysia) {
            matchedTags = matchedTags.filter((tag) => {
                const tagText = [
                    tag.tag_id,
                    tag.short_name,
                    tag.short_description,
                    tag.description,
                    ...(tag.related_keywords || [])
                ].filter(Boolean).join(' ').toLowerCase();
                const isVietnamSpecific = /\b(vietnam|viet nam|vn|vnta|qcvn)\b/.test(tagText);
                const isMalaysiaSpecific = /\b(malaysia|my|mcmc|sirim)\b/.test(tagText);
                if (wantsVietnam && isMalaysiaSpecific && !isVietnamSpecific) return false;
                if (wantsMalaysia && isVietnamSpecific && !isMalaysiaSpecific) return false;
                return true;
            });
        }
    }

    matchedTags = sortTagsForDisplay(matchedTags, selectedCountry, routeContext, query);

    const caseScoreFn = globalThis.TradeComplyMatchedResults?.scoreCaseAgainstQuery;

    // Search cases by query relevance, HS codes, and related tags
    let matchedCases = cases.map((caseItem) => {
        const caseDirection = caseItem.direction || 'both';
        if (caseDirection !== 'both' && !caseDirectionsForRoute.includes(caseDirection)) {
            return { case: caseItem, score: 0 };
        }

        let score = caseScoreFn
            ? caseScoreFn(caseItem, query)
            : 0;

        const isHSCode = query && /^\d{4,6}(\.\d{1,4})?$/.test(query.trim());
        if (isHSCode) {
            const queryLower = query.toLowerCase();
            const normalizedInput = query.replace(/\./g, '');
            const relatedTags = caseItem.related_tags || [];
            const hsMatch = relatedTags.some((tagId) => {
                const tag = tags.find((t) => t.tag_id.toLowerCase() === tagId.toLowerCase());
                if (!tag || !tag.related_hs_codes) {
                    return false;
                }
                return tag.related_hs_codes.some((code) => {
                    const normalizedCode = code.replace(/\./g, '');
                    return normalizedCode.startsWith(normalizedInput)
                        || normalizedInput.startsWith(normalizedCode);
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

        return { case: caseItem, score };
    }).filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.case);

    const enrichApi = globalThis.TradeComplyMatchedResults;
    if (enrichApi?.collectCasesForMatchedTags && enrichApi?.mergeCasesById) {
        const linkedCases = enrichApi.collectCasesForMatchedTags(
            matchedTags,
            cases,
            caseDirectionsForRoute,
            query
        );
        matchedCases = enrichApi.mergeCasesById(matchedCases, linkedCases);
        if (enrichApi.filterCasesByQueryRelevance) {
            matchedCases = enrichApi.filterCasesByQueryRelevance(matchedCases, query);
        }
        if (enrichApi.filterCasesForMatchedTags) {
            matchedCases = enrichApi.filterCasesForMatchedTags(matchedCases, matchedTags);
        }
    }

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

function applyPrecheckSelections(panelId, precheckIds = []) {
    const panel = panelId ? document.getElementById(panelId) : null;
    const scope = panel || document;
    const wanted = new Set((precheckIds || []).filter(Boolean));
    scope.querySelectorAll('input[data-precheck]').forEach((input) => {
        if (!panel || panel.contains(input)) {
            input.checked = wanted.has(input.dataset.precheck);
        }
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.applyPrecheckSelections = applyPrecheckSelections;
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

function applyCountryFilterToSearchResults(results) {
    const selectedCountry = AppState.currentCountry || 'US';
    const countryApi = globalThis.TradeComplyCountry;
    const routeContext = buildCurrentRouteContext(selectedCountry);
    const enrichApi = globalThis.TradeComplyMatchedResults;
    if (countryApi?.filterTagsForSelectedCountry) {
        const filteredTags = countryApi.filterTagsForSelectedCountry(results.tags, selectedCountry, routeContext);
        return {
            ...results,
            tags: filteredTags,
            cases: enrichApi?.filterCasesForMatchedTags
                ? enrichApi.filterCasesForMatchedTags(results.cases, filteredTags)
                : results.cases
        };
    }
    const selected = String(selectedCountry || 'US').trim().toUpperCase();
    const filteredTags = (results.tags || []).filter((tag) => {
        const code = String(tag.country || 'GLOBAL').trim().toUpperCase();
        const regional = /^CL-(TW|JP|KR|RU|ASEAN)-/i.exec(tag.tag_id || '');
        const effective = regional ? regional[1].toUpperCase() : code;
        return effective === selected || effective === 'GLOBAL';
    });
    return {
        ...results,
        tags: filteredTags,
        cases: enrichApi?.filterCasesForMatchedTags
            ? enrichApi.filterCasesForMatchedTags(results.cases, filteredTags)
            : results.cases
    };
}

function searchWithPrecheck(query, selections, searchFn = search, relevanceQuery = query) {
    const trimmedQuery = query ? query.trim() : '';
    const relevanceAnchor = relevanceQuery ? relevanceQuery.trim() : trimmedQuery;
    const keywordOnlyQuery = buildPrecheckQuery('', selections);
    const baseResults = trimmedQuery ? searchFn(trimmedQuery) : { tags: [], cases: [] };
    const precheckResults = keywordOnlyQuery ? searchFn(keywordOnlyQuery) : { tags: [], cases: [] };
    const relevantBaseTags = relevanceAnchor
        ? filterTagsByProductRelevance(baseResults.tags, relevanceAnchor)
        : baseResults.tags;
    const relevantPrecheckTags = relevanceAnchor
        ? filterTagsByProductRelevance(precheckResults.tags, relevanceAnchor)
        : precheckResults.tags;
    const allResults = !trimmedQuery && !keywordOnlyQuery ? searchFn('') : {
        tags: mergeById([...relevantBaseTags, ...relevantPrecheckTags], tag => tag.tag_id),
        cases: mergeById([...baseResults.cases, ...precheckResults.cases], caseItem => caseItem.case_id)
    };
    const filtered = applyCountryFilterToSearchResults(allResults);
    const selectedCountry = AppState.currentCountry || 'US';
    const routeContext = buildCurrentRouteContext(selectedCountry);
    return {
        ...filtered,
        tags: sortTagsForDisplay(filtered.tags, selectedCountry, routeContext, relevanceAnchor)
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        detectInputType,
        matchByHSCode,
        matchByProductName,
        search,
        getPrecheckSelections,
        applyPrecheckSelections,
        buildPrecheckQuery,
        getProductRelevanceTerms,
        scoreTagProductRelevance,
        tagMatchesProductTerms,
        filterTagsByProductRelevance,
        sortTagsForDisplay,
        mergeById,
        applyCountryFilterToSearchResults,
        searchWithPrecheck
    };
}
