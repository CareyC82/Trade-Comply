/**
 * Catalog scope builder — shared between browser (global Catalog) and Node (require).
 * Merges tags, cases, categories, and scope-keywords.json into one search allowlist.
 */
(function initCatalogModule(root) {
    function normalizeKeyword(keyword) {
        if (keyword === null || keyword === undefined) return '';
        return String(keyword).trim().toLowerCase();
    }

    function addKeyword(set, keyword) {
        const normalized = normalizeKeyword(keyword);
        if (normalized) {
            set.add(normalized);
        }
    }

    function splitCatalogTokens(text) {
        const normalized = normalizeKeyword(text);
        if (!normalized) return [];
        return normalized
            .split(/[\s,/|+]+/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    function addTextTokens(set, text) {
        splitCatalogTokens(text).forEach(token => addKeyword(set, token));
        addKeyword(set, text);
    }

    function compilePattern(pattern, fallbackPattern) {
        try {
            return new RegExp(pattern || fallbackPattern);
        } catch (error) {
            return new RegExp(fallbackPattern);
        }
    }

    function buildScopeCatalog({
        tags = [],
        cases = [],
        categories = [],
        scopeConfig = {},
        catalogSchema = {}
    } = {}) {
        const keywords = new Set();
        const stats = {
            fromTags: 0,
            fromCases: 0,
            fromCategories: 0,
            supplemental: 0,
            compliance: 0,
            excluded: 0
        };

        tags.forEach(tag => {
            (tag.related_keywords || []).forEach(keyword => {
                addKeyword(keywords, keyword);
                stats.fromTags += 1;
            });
            (tag.related_hs_codes || []).forEach(code => {
                addKeyword(keywords, code);
                stats.fromTags += 1;
            });
            if (tag.tag_id) {
                addKeyword(keywords, tag.tag_id);
            }
            if (tag.short_name) {
                addTextTokens(keywords, tag.short_name);
            }
        });

        cases.forEach(caseItem => {
            (caseItem.related_keywords || []).forEach(keyword => {
                addKeyword(keywords, keyword);
                stats.fromCases += 1;
            });
            if (caseItem.case_id) {
                addKeyword(keywords, caseItem.case_id);
            }
            if (caseItem.title) {
                addTextTokens(keywords, caseItem.title);
            }
        });

        categories.forEach(group => {
            (group.items || []).forEach(item => {
                addTextTokens(keywords, item.query);
                addTextTokens(keywords, item.name);
                addKeyword(keywords, item.hs_code);
                stats.fromCategories += 1;
            });
        });

        (scopeConfig.supplemental_keywords || []).forEach(keyword => {
            addKeyword(keywords, keyword);
            stats.supplemental += 1;
        });

        (scopeConfig.compliance_keywords || []).forEach(keyword => {
            addKeyword(keywords, keyword);
            stats.compliance += 1;
        });

        (scopeConfig.exclude_keywords || []).forEach(keyword => {
            const normalized = normalizeKeyword(keyword);
            if (keywords.delete(normalized)) {
                stats.excluded += 1;
            }
        });

        const semiconductorKeywords = [];
        const semiSeen = new Set();
        (scopeConfig.semiconductor_boost || []).forEach(keyword => {
            const normalized = normalizeKeyword(keyword);
            if (!normalized || semiSeen.has(normalized)) return;
            semiSeen.add(normalized);
            semiconductorKeywords.push(normalized);
            addKeyword(keywords, normalized);
        });

        const tagIdPattern = compilePattern(
            catalogSchema.tag_id_pattern,
            '^CL-[A-Z]+-\\d+$'
        );
        const caseIdPattern = compilePattern(
            catalogSchema.case_id_pattern,
            '^CASE-[A-Z0-9-]+$'
        );

        return {
            schemaVersion: catalogSchema.schema_version || '1.0',
            keywordList: Array.from(keywords).sort(),
            semiconductorKeywords,
            tagIdPattern,
            caseIdPattern,
            stats: {
                ...stats,
                total: keywords.size
            }
        };
    }

    function queryMatchesScope(query, keywordList) {
        if (!query || typeof query !== 'string') {
            return false;
        }

        const lowerQuery = query.toLowerCase();
        for (const keyword of keywordList || []) {
            if (keyword && lowerQuery.includes(keyword)) {
                return true;
            }
        }
        return false;
    }

    function validateCatalogData({
        tags = [],
        cases = [],
        categories = [],
        scopeConfig = {},
        catalogSchema = {}
    } = {}) {
        const errors = [];
        const warnings = [];
        const tagIds = new Set();
        const caseIds = new Set();

        const tagIdPattern = compilePattern(
            catalogSchema.tag_id_pattern,
            '^CL-[A-Z]+-\\d+$'
        );
        const caseIdPattern = compilePattern(
            catalogSchema.case_id_pattern,
            '^CASE-[A-Z0-9-]+$'
        );

        tags.forEach(tag => {
            const tagId = tag.tag_id;
            if (!tagId) {
                errors.push('Tag missing tag_id.');
                return;
            }
            if (!tagIdPattern.test(tagId)) {
                errors.push(`Invalid tag_id format: ${tagId}`);
            }
            if (tagIds.has(tagId)) {
                errors.push(`Duplicate tag_id: ${tagId}`);
            }
            tagIds.add(tagId);

            if (!Array.isArray(tag.related_keywords) || tag.related_keywords.length === 0) {
                warnings.push(`Tag ${tagId} has no related_keywords.`);
            }

            (tag.related_cases || []).forEach(caseId => {
                if (typeof caseId === 'string' && !caseIdPattern.test(caseId)) {
                    warnings.push(`Tag ${tagId} references invalid case_id: ${caseId}`);
                }
            });
        });

        cases.forEach(caseItem => {
            const caseId = caseItem.case_id;
            if (!caseId) {
                errors.push('Case missing case_id.');
                return;
            }
            if (!caseIdPattern.test(caseId)) {
                errors.push(`Invalid case_id format: ${caseId}`);
            }
            if (caseIds.has(caseId)) {
                errors.push(`Duplicate case_id: ${caseId}`);
            }
            caseIds.add(caseId);
        });

        tags.forEach(tag => {
            (tag.related_cases || []).forEach(caseId => {
                if (typeof caseId === 'string' && !caseIds.has(caseId)) {
                    errors.push(`Tag ${tag.tag_id} references missing case_id: ${caseId}`);
                }
            });
        });

        categories.forEach(group => {
            if (!group.group_id) {
                warnings.push('Category group missing group_id.');
            }
        });

        const catalog = buildScopeCatalog({
            tags,
            cases,
            categories,
            scopeConfig,
            catalogSchema
        });

        if (catalog.keywordList.length === 0) {
            errors.push('Scope keyword list is empty after catalog merge.');
        }

        if ((scopeConfig.supplemental_keywords || []).length === 0) {
            warnings.push('scope-keywords.json supplemental_keywords is empty.');
        }

        return {
            ok: errors.length === 0,
            errors,
            warnings,
            catalog
        };
    }

    function serializeScopeCatalog({
        catalog,
        catalogSchema = {},
        tagIds = [],
        caseIds = [],
        generatedAt
    } = {}) {
        return {
            schema_version: catalog?.schemaVersion || catalogSchema.schema_version || '1.0',
            generated_at: generatedAt || new Date().toISOString(),
            tag_id_pattern: catalogSchema.tag_id_pattern || '^CL-[A-Z]+-\\d+$',
            case_id_pattern: catalogSchema.case_id_pattern || '^CASE-[A-Z0-9-]+$',
            tag_ids: [...tagIds].sort(),
            case_ids: [...caseIds].sort(),
            keyword_list: catalog?.keywordList || [],
            semiconductor_keywords: catalog?.semiconductorKeywords || [],
            stats: catalog?.stats || {}
        };
    }

    function hydrateScopeCatalog(catalogJson) {
        if (!catalogJson || !Array.isArray(catalogJson.keyword_list)) {
            return null;
        }

        return {
            schemaVersion: catalogJson.schema_version || '1.0',
            generatedAt: catalogJson.generated_at || null,
            keywordList: catalogJson.keyword_list,
            semiconductorKeywords: catalogJson.semiconductor_keywords || [],
            tagIds: catalogJson.tag_ids || [],
            caseIds: catalogJson.case_ids || [],
            tagIdPattern: compilePattern(
                catalogJson.tag_id_pattern,
                '^CL-[A-Z]+-\\d+$'
            ),
            caseIdPattern: compilePattern(
                catalogJson.case_id_pattern,
                '^CASE-[A-Z0-9-]+$'
            ),
            stats: catalogJson.stats || {}
        };
    }

    function stripGeneratedAt(catalogArtifact) {
        if (!catalogArtifact || typeof catalogArtifact !== 'object') {
            return catalogArtifact;
        }
        const copy = { ...catalogArtifact };
        delete copy.generated_at;
        return copy;
    }

    function catalogArtifactsMatch(left, right) {
        return JSON.stringify(stripGeneratedAt(left)) === JSON.stringify(stripGeneratedAt(right));
    }

    const Catalog = {
        normalizeKeyword,
        buildScopeCatalog,
        serializeScopeCatalog,
        hydrateScopeCatalog,
        catalogArtifactsMatch,
        queryMatchesScope,
        validateCatalogData
    };

    root.Catalog = Catalog;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Catalog;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
