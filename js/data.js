function showDataLoadingPlaceholders() {
    const loadingHtml = templateDataLoadingIndicator();
    mountHtml(document.getElementById('quick-actions-container'), loadingHtml);
    mountHtml(document.getElementById('kb-categories-container'), loadingHtml);
}

/**
 * Initialize data loading (fetch + AppState hydration; rendering in separate functions).
 */
async function initData() {
    showDataLoadingPlaceholders();

    try {
        const bundle = await loadApplicationDataBundle();
        hydrateAppStateFromBundle(bundle);

        renderQuickActions();
        renderKnowledgeBase();
        renderCategories();
        renderLatestUpdate();
        updateHubStats();
    } catch (err) {
        console.error('Critical data load error:', err);
        mountHtml(
            document.getElementById('quick-actions-container'),
            templateDataLoadError()
        );
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
 * Render flat Quick Select grid on the electronics pre-check view.
 */
function renderQuickActions() {
    const container = document.getElementById('quick-actions-container');
    if (!container) {
        return;
    }
    if (typeof renderQuickSelectGrid === 'function') {
        renderQuickSelectGrid('quick-actions-container', { mode: 'search' });
        return;
    }
    container.innerHTML = '<p class="quick-select-fallback">Quick select unavailable — reload the page.</p>';
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
        groupEl.className = 'category-group collapsible-panel';
        
        // 去除了内联 onclick
        groupEl.innerHTML = `
            <button type="button" class="category-group-header collapsible-header" aria-expanded="false">
                <span class="group-icon">${escapeHtml(group.group_icon)}</span>
                <span>${escapeHtml(group.group_name)}</span>
                <span class="group-count">${group.items.length}</span>
                <span class="arrow" aria-hidden="true">▶</span>
            </button>
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
