function getSemiconductorScopeKeywords() {
    return AppState.catalog?.semiconductorKeywords || [];
}

// ==================== 半导体搜索模块 ====================
function searchSemiconductor(query) {
    const allTags = AppState.data.tags || [];
    const allCases = AppState.data.cases || [];
    const allSemiKeywords = getSemiconductorScopeKeywords();
    const matchedTagIds = new Set();
    allTags.forEach(tag => {
        const keywords = tag.related_keywords || [];
        if (keywords.some(kw => allSemiKeywords.includes(String(kw).toLowerCase()))) matchedTagIds.add(tag.tag_id);
        const hsCodes = tag.related_hs_codes || [];
        if (hsCodes.some(code => code.startsWith('854') || code.startsWith('8486') || code.startsWith('8479'))) matchedTagIds.add(tag.tag_id);
    });
    let matchedTags = allTags.filter(tag => matchedTagIds.has(tag.tag_id));
    if (query && query.trim()) {
        const lowerQuery = query.toLowerCase();
        const inputType = detectInputType(query);
        if (inputType === 'hs_code') { matchedTags = matchByHSCode(query, matchedTags); }
        else { matchedTags = matchedTags.filter(tag => { const keywords = tag.related_keywords || []; return keywords.some(kw => lowerQuery.includes(kw.toLowerCase())); }); }
    }
    const currentDirection = AppState.currentDirection || 'export';
    matchedTags = matchedTags.filter(tag => { const td = tag.direction || 'both'; return td === 'both' || td === currentDirection; });
    matchedTags.sort((a, b) => { if (a.tag_type === b.tag_type) return (a.display_order || 999) - (b.display_order || 999); return a.tag_type === 'MATCHED' ? -1 : 1; });
    const matchedCases = allCases.filter(caseItem => {
        const cd = caseItem.direction || 'both'; if (cd !== 'both' && cd !== currentDirection) return false;
        if (!query || !query.trim()) { const ck = (caseItem.related_keywords || []).map(k => k.toLowerCase()); return ck.some(kw => allSemiKeywords.includes(kw)); }
        const lowerQuery = query.toLowerCase(); const ck = (caseItem.related_keywords || []).map(k => k.toLowerCase());
        return ck.some(kw => lowerQuery.includes(kw) || kw.includes(lowerQuery));
    });
    return { tags: matchedTags, cases: matchedCases };
}

function searchSemiconductorProducts(query) {
    AppState.searchOrigin = 'semiconductor';
    const trimmedQuery = (query ?? document.getElementById('result-search-input')?.value ?? document.getElementById('search-input-semi')?.value ?? '').trim();
    syncResultSearchInputs(trimmedQuery);
    const selections = getPrecheckSelections('semi-precheck-panel');
    const results = searchWithPrecheck(trimmedQuery, selections, searchSemiconductor);
    renderResults(trimmedQuery || 'Semiconductor products', results.tags, results.cases, selections);
}

function renderSemiQuickActions() {
    const container = document.getElementById('semi-quick-actions-container');
    if (!container) return;
    const categories = AppState.data.categories || [];
    const semiGroup = categories.find(g => g.group_id === 'semiconductor');
    if (!semiGroup || !semiGroup.items) return;
    container.innerHTML = '';
    
    const iconMap = {
        'GPU / AI Accelerator': '⚡',
        'CPU / Processor': '🖥️',
        'Memory (DRAM / HBM)': '💾',
        'Flash Memory (NAND)': '📦',
        'Wafer Foundry Service': '🏭',
        'Chip Design (Fabless)': '📐',
        'Semiconductor Equipment': '🔧',
        'Advanced Packaging / Chiplet': '🧩',
        'Silicon Photonics / Optical Interconnect': '🔌'
    };
    
    semiGroup.items.forEach(item => {
        const icon = iconMap[item.name] || '🧠';
        const card = document.createElement('div');
        card.className = 'quick-action-card';
        card.innerHTML = `<div class="quick-action-icon">${icon}</div>
            <div class="quick-action-label">${escapeHtml(item.name)}</div>
            <div class="quick-action-hs">${escapeHtml(item.hs_code || '')}</div>
            <div class="quick-action-hs" style="margin-top: 4px; color: var(--color-accent); font-weight: 500;">Export controls · Foundry rules · Supply chain security</div>`;
        card.addEventListener('click', () => { document.getElementById('search-input-semi').value = item.query; searchSemiconductorProducts(item.query); });
        container.appendChild(card);
    });
}

