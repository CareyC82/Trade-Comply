loadIncotermData();

document.addEventListener('DOMContentLoaded', async () => {
    await initData();
    initViewHistory();
    bindEvents();
    // 初始化页面文本
    applyUiStrings();
    // 清空搜索栏
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }
});
