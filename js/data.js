async function fetchJsonSafe(url, fallbackValue = []) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.warn(`⚠️ Failed to load ${url}, using fallback value. Error:`, err);
        return fallbackValue;
    }
}

/**
 * Initialize data loading
 */
async function initData() {
    // 显示加载提示
    const loadingHtml = `<div style="text-align: center; padding: 40px; color: #666;">
        <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
        <div>Loading data...</div>
    </div>`;
    document.getElementById('quick-actions-container').innerHTML = loadingHtml;
    const kbContainer = document.getElementById('kb-categories-container');
    if (kbContainer) kbContainer.innerHTML = loadingHtml;
    
    // 使用独立 Catch 提高容错性
    try {
        const [tags, cases, quickActions, kb, categories, updates, catalogSchema, scopeConfig, catalogArtifact] = await Promise.all([
            fetchJsonSafe('data/tags.json', []),
            fetchJsonSafe('data/cases.json', []),
            fetchJsonSafe('data/quick-actions.json', []),
            fetchJsonSafe('data/knowledge-base.json', { categories: [] }),
            fetchJsonSafe('data/categories.json', []),
            fetchJsonSafe('data/updates.json', []),
            fetchJsonSafe('data/catalog.schema.json', {}),
            fetchJsonSafe('data/scope-keywords.json', {}),
            fetchJsonSafe('data/catalog.json', null)
        ]);

        AppState.data = { 
            tags, 
            cases, 
            categories,
            updates,
            quickActions, 
            knowledgeBase: kb,
            catalogSchema,
            scopeConfig
        };

        let catalog = Catalog.hydrateScopeCatalog(catalogArtifact);
        if (!catalog || !catalog.keywordList.length) {
            catalog = Catalog.buildScopeCatalog({
                tags,
                cases,
                categories,
                scopeConfig,
                catalogSchema
            });
            console.warn('catalog.json unavailable or empty; built scope catalog at runtime.');
        }

        AppState.catalog = catalog;
        
        renderQuickActions();
        renderKnowledgeBase();
        renderCategories();
        renderLatestUpdate();
        updateHubStats();
    } catch (err) {
        // 这个 catch 现在主要是防患未然（极少触发）
        console.error('Critical data load error:', err);
        const errorHtml = `<div style="text-align: center; padding: 40px; color: #e74c3c;">
            <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
            <div>Application error. Please refresh the page.</div>
        </div>`;
        document.getElementById('quick-actions-container').innerHTML = errorHtml;
    }
}

/**
 * Render latest update bar
 */
function renderLatestUpdate() {
    const bar = document.getElementById('latest-update-bar');
    if (!bar) return;

    const updates = AppState.data.updates;
    
    if (!updates || updates.length === 0) return;

    const latest = updates[0];
    const safeDate = escapeHtml(latest.date);
    const safeText = escapeHtml(latest.text);
    bar.innerHTML = `<span>${t('latestUpdate')} ${safeDate} - ${safeText}</span>`;
}

/**
 * Render quick action cards (利用 DocumentFragment 提升性能)
 */
function renderQuickActions() {
    const container = document.getElementById('quick-actions-container');
    if (!container) return;

    const actions = AppState.data.quickActions || [];
    container.innerHTML = '';

    const sortedActions = [...actions].sort((a, b) => (a.order || 999) - (b.order || 999));
    const fragment = document.createDocumentFragment();

    sortedActions.forEach(action => {
        const card = document.createElement('div');
        card.className = 'quick-action-card';
        // 必须转义避免XSS
        card.innerHTML = `
            <div class="quick-action-icon">${escapeHtml(action.icon)}</div>
            <div class="quick-action-label">${escapeHtml(action.label)}</div>
            <div class="quick-action-hs">${escapeHtml(action.hs_code)}</div>
        `;
        
        card.addEventListener('click', () => {
            document.getElementById('search-input').value = action.query_text;
            searchProducts(action.query_text);
        });

        fragment.appendChild(card);
    });
    
    container.appendChild(fragment);
}

/**
 * Render knowledge base categories
 */
function renderKnowledgeBase() {
    const container = document.getElementById('kb-categories-container');
    if (!container) return;

    const categories = AppState.data.knowledgeBase.categories || [];
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'kb-category';
        categoryDiv.innerHTML = `
            <div class="kb-category-header">
                <span class="kb-category-title">${escapeHtml(category.label)}</span>
                <span class="kb-category-count">${category.items.length}</span>
                <span class="kb-category-toggle">▼</span>
            </div>
            <div class="kb-category-content">
                ${category.items.map(item => `
                    <div class="kb-item">
                        <div class="kb-item-title">${escapeHtml(item.title)}</div>
                        <div class="kb-item-description">${escapeHtml(item.description || '')}</div>
                        <div class="kb-item-url"><a href="${sanitizeUrl(item.source_url)}" target="_blank">${escapeHtml(item.source_url)}</a></div>
                    </div>
                `).join('')}
            </div>
        `;

        const header = categoryDiv.querySelector('.kb-category-header');
        const toggle = categoryDiv.querySelector('.kb-category-toggle');
        const content = categoryDiv.querySelector('.kb-category-content');

        header.addEventListener('click', () => {
            toggle.classList.toggle('open');
            content.classList.toggle('open');
        });

        fragment.appendChild(categoryDiv);
    });
    container.appendChild(fragment);
}

/**
 * Render product categories
 */
function renderCategories() {
    const container = document.getElementById('categories-container');
    if (!container) return;

    const categories = AppState.data.categories;
    
    if (!categories) return;

    container.innerHTML = '';
    
    const totalGroups = categories.length;
    let totalItems = 0;
    categories.forEach(group => {
        totalItems += group.items.length;
    });

    const summaryEl = document.getElementById('categories-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `📋 <strong>${totalItems}</strong> categories across <strong>${totalGroups}</strong> groups. Tap any category to search instantly.`;
    }

    const fragment = document.createDocumentFragment();

    categories.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'category-group';
        
        // 去除了内联 onclick
        groupEl.innerHTML = `
            <div class="category-group-header">
                <span class="group-icon">${escapeHtml(group.group_icon)}</span>
                <span>${escapeHtml(group.group_name)}</span>
                <span class="group-count">${group.items.length}</span>
                <span class="arrow">▶</span>
            </div>
            <div class="category-group-items">
                ${group.items.map(item => `
                    <span class="category-tag" data-query="${escapeHtml(item.query)}" data-hscode="${escapeHtml(item.hs_code || '')}">
                        ${escapeHtml(item.name)}
                    </span>
                `).join('')}
            </div>
        `;
        fragment.appendChild(groupEl);
    });
    
    container.appendChild(fragment);
}

/**
 * Search from category page (供事件委托使用)
 */
function searchFromCategory(query, hsCode) {
    document.getElementById('search-input').value = query;
    const result = search(query);
    renderResults(query, result.tags, result.cases);
}
