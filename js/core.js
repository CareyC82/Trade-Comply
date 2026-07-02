// === English UI strings ===
const UI_STRINGS = {
    title: "TraceWize",
    subtitle: "High-tech trade intelligence for compliance, landed-cost checks, and market opportunity decisions.",
    export: "Export from China",
    import: "Import into China",
    searchPlaceholder: "Enter product, HS Code, or risk feature",
    searchBtn: "GO",
    latestUpdate: "Latest Update:",
    disclaimer: "Pre-screening only. TraceWize uses maintained rule, rate, and source signals for decision support; not legal advice.",
    viewCases: "View Case Library",
    feedback: "💬 Can't find your product? Tell us",
    home: "🏠 Home",
    navHome: "Home",
    navIncoterm: "Incoterm",
    navHsCode: "HS Code",
    navOpportunity: "Opportunity",
    knowledgeBase: "📚 Knowledge Base",
    categories: "📋 Categories",
    back: "< Back",
    backArrow: "← Back",
    warningBanner: "The following is a preliminary risk screen based on official regulatory citations. NOT legal advice.",
    foundRegulations: "Found",
    regulationsFor: "regulations for",
    relatedCases: "Related Penalty Cases",
    helpImprove: "Help Us Improve",
    feedbackMessage: "Have a product or HS Code you needed that isn't covered? Share it below and we'll research it.",
    productPlaceholder: "e.g. smart ring, 8517.62",
    feedbackProduct: "Product or HS Code you searched",
    feedbackRegulation: "What regulation were you looking for?",
    feedbackEmail: "Your email (optional, for follow-up)",
    cancel: "Cancel",
    sendFeedback: "Send Feedback",
    thanksFeedback: "✅ Thanks for your feedback! We'll review it and update the database.",
    searchResults: "Search Results",
    noResults: "No compliance signals found for this product.",
    outOfRange: "Your query is outside the current high-tech trade compliance pre-check scope. Current coverage focuses on electronics, semiconductors, wireless devices, batteries, clean-tech hardware, automation equipment, dual-use controls, tariffs, and customs value signals across maintained trade routes.",
    aiAssistant: "🤖 AI Assistant",
    askAiAssistant: "Ask AI Assistant",
    askAiPlaceholder: "Ask about the matched rules above (e.g. exemptions, documents needed)",
    aiError: "AI assistant temporarily unavailable, please try again later.",
    aiNoMatchedRules: "No matched rules available for AI grounding. Review the cards above or submit feedback.",
    aiNoRulesExploratory: "No rules matched this screen. You can still ask the AI to search the library for related signals (including the other trade direction).",
    aiBasedOnRules: "Based on {count} matched rule(s) from the library.",
    askAiPlaceholderNoRules: "Ask about this product (e.g. import vs export, related controls)",
    aiInsufficientContext: "The rule library does not contain enough detail for a grounded AI answer.",
    aiGeneralGuidance: "Includes general guidance not sourced from the rule library.",
    source: "Source",
    auditTrailTitle: "Audit Trail",
    auditTrailLastVerified: "Last Verified / Fetched",
    auditTrailEffectiveDate: "Policy Effective Date",
    auditTrailOfficialSource: "View Official Source Statement",
    auditTrailNotAvailable: "Not available",
    auditTrailSourceType: "Source type",
    auditTrailJurisdiction: "Jurisdiction",
    auditTrailEffectiveStatus: "Effective status",
    auditTrailReviewStatus: "Review status",
    auditTrailConfidence: "AI confidence",
    referenceSources: "Reference Sources:",
    searching: "Searching...",
    aiSearch: "AI Search:",
    allCases: "All Cases",
    allProducts: "All Products",
    newEnergyProducts: "New energy products",
    semiconductorProducts: "Semiconductor products",
    ruleCountSingular: "rule",
    ruleCountPlural: "rules",
    caseCountSingular: "case",
    caseCountPlural: "cases",
    hsNotSpecified: "Not specified",
    cardNoDetails: "No details available",
    exemptionsLabel: "Exemptions",
    riskScenariosLabel: "Risk Scenarios",
    resultRoleFocus: "{role} focus",
    preScreenReportTitle: "Compliance Pre-Screening Report",
    preScreenRiskLevel: "Risk level rating",
    preScreenTriggerReason: "Trigger reason",
    preScreenMissingInfo: "Missing information checklist",
    preScreenVerificationObjects: "Recommended verification objects",
    preScreenOfficialSources: "Official authoritative sources",
    preScreenDisclaimerTitle: "Legal disclaimer",
    preScreenViewRules: "View detailed rule cards ↓",
    categoriesTitle: "Product Categories",
    categoriesSummary: "📋 <strong>{total}</strong> categories across <strong>{groups}</strong> groups. Tap any category to search instantly.",
    kbSearchPlaceholder: "Search regulations...",
    exportTitle: "Export from China",
    importTitle: "Import into China",
    hsCode: "HS Code",
    trustBoundaryTitle: "Screening scope & limits",
    trustBoundarySubtitle: "What this screen checked, what it did not check, and who should verify before you rely on it.",
    trustCoveredHeading: "What this screen covered",
    trustNotCoveredHeading: "What this screen did not cover",
    trustVerifyHeading: "Who should verify next",
    trustCoveredDirection: "Trade direction screened",
    trustCoveredQuery: "Product / query screened",
    trustCoveredMatches: "Matched {ruleCount} rule(s) and {caseCount} case(s) from the library",
    trustCoveredCategories: "Regulatory categories flagged",
    trustCoveredPrecheck: "Pre-check attributes selected",
    trustCoveredLibrary: "Library scope: {ruleCount} rules · {caseCount} cases (maintained high-tech trade routes and product signals)",
    trustCoveredSources: "Each matched card below links to an official Source citation in the rule library.",
    trustCoveredNoMatches: "No rules matched this query in the current library — this is not a clearance to ship.",
    trustCoveredOutOfRange: "Query is outside the current product scope for automated screening.",
    trustStatusScreened: "Screened",
    trustStatusNoMatch: "No rule match",
    trustStatusOutOfScope: "Out of scope",
    trustNotCoveredDestination: "Destination-country customs rulings, import bans, or local product rules outside the maintained route library.",
    trustNotCoveredHsFinal: "Final HS classification, dutiable value, origin determination, and customs declaration acceptance.",
    trustNotCoveredEndUse: "End-use, end-user, and restricted-party / sanctions screening (only risk signals may appear).",
    trustNotCoveredCarrier: "Carrier acceptance, dangerous-goods packaging, port handling, and last-mile logistics requirements.",
    trustNotCoveredContract: "Contract terms, Incoterms allocation of cost/risk, and commercial warranty or liability.",
    trustNotCoveredNonElectronics: "Non-electronics / non-semiconductor products unless explicitly matched.",
    trustNotCoveredLegal: "Legal opinions, binding customs pre-rulings, or licensing decisions.",
    trustNotCoveredNoMatchExtra: "Absence of a match does not mean no compliance obligation exists — only that this library did not flag a signal.",
    trustNotCoveredHasMatchExtra: "A matched signal is a research starting point, not proof that all requirements are satisfied.",
    trustNotCoveredOutOfRangeExtra: "This tool currently focuses on maintained high-tech trade routes for electronics, semiconductors, wireless, batteries, clean-tech hardware, automation equipment, encryption, UAVs, and related controls.",
    trustVerifyBadgeLow: "Routine review",
    trustVerifyTitleLow: "Suggested verification path (low signal level)",
    trustVerifyItemLowBroker: "Internal trade compliance or operations lead — confirm product description and specs against your invoice and packing list.",
    trustVerifyItemLowSource: "Cross-check matched Source links on the rule cards below before shipment paperwork is finalized.",
    trustVerifyBadgeMedium: "Broker / specialist review",
    trustVerifyTitleMedium: "Suggested verification path (elevated signals)",
    trustVerifyItemMediumBroker: "Licensed customs broker or freight forwarder — validate HS codes, declaration elements, and any license triggers.",
    trustVerifyItemMediumCert: "Certification or testing body (e.g., CCC, SRRC, UN38.3) if wireless, product safety, or battery rules matched.",
    trustVerifyItemMediumSource: "Official agency publications cited on matched cards — do not rely on this screen alone.",
    trustVerifyBadgeHigh: "Professional review required",
    trustVerifyTitleHigh: "Suggested verification path (high-risk signals)",
    trustVerifyItemHighCounsel: "Trade compliance counsel or qualified advisor — especially for export control, encryption, semiconductor, or dual-use indicators.",
    trustVerifyItemHighBroker: "Customs broker with China export/import experience — confirm whether licenses, filings, or end-user statements are required.",
    trustVerifyItemHighAgency: "Relevant Chinese authorities or official channels referenced in matched Source links — for binding guidance.",
    trustVerifyBadgeReview: "Review before shipment",
    trustVerifyTitleReview: "Suggested verification path (review required)",
    trustVerifyItemReviewCounsel: "Qualified trade compliance reviewer before any export from China — matched rules include controls that need human verification.",
    trustVerifyItemReviewDocs: "Prepare end-use / end-user documentation and align commercial invoice, packing list, and consignee details with matched requirements.",
    trustVerifyItemReviewSource: "Follow official Source links on each matched card; this screen does not approve shipment.",
    feedbackSubmitError: "Could not send feedback. Please try again in a moment.",
    policyCorrectionBtnHasResults: "📝 Results look wrong? Submit correction :)",
    policyCorrectionBtnNoMatch: "📝 Add policy info for this product",
    policyCorrectionTitle: "Policy data correction",
    policyCorrectionIntro: "Help us align the rule library with official sources. Submissions are reviewed before any database update.",
    policyCorrectionProduct: "Product keyword",
    policyCorrectionPolicyType: "Policy type",
    policyCorrectionPolicyTypePlaceholder: "Select policy type",
    policyCorrectionSourceUrl: "Official source URL",
    policyCorrectionSourceUrlPlaceholder: "Attach an official notice or legal basis link to speed up review",
    policyCorrectionMessage: "Details",
    policyCorrectionMessagePlaceholder: "Describe the policy change, effective date, or why the current screen is incorrect...",
    policyCorrectionSubmit: "Submit correction",
    policyCorrectionSubmitting: "Submitting...",
    policyCorrectionSuccess: "✅ Correction submitted. Our team will review it against official sources.",
    policyCorrectionSubmitError: "Could not submit correction. Please try again in a moment."
};

// === 允许搜索的关键词范围 ===
// Built at runtime from data/*.json via Catalog.buildScopeCatalog() in initData().

// 检查查询是否在允许的搜索范围内
function checkSearchRange(query) {
    if (!AppState.catalog || !AppState.catalog.keywordList) {
        return false;
    }
    return Catalog.queryMatchesScope(query, AppState.catalog.keywordList);
}

// AppState: see js/app-state.js (loaded before this file). Use window.AppState only.

const VALID_VIEWS = ['home', 'electronics', 'new-energy', 'semiconductor', 'incoterm', 'result', 'kb', 'categories'];

const PRECHECK_FACTORS = {
    wireless: {
        label: 'Wireless / Bluetooth / Wi-Fi',
        keywords: ['wireless', 'bluetooth', 'wifi', 'radio', 'srrc', 'optical transceiver'],
        signals: ['SRRC / radio transmission approval', 'Wireless module declaration'],
        nextChecks: ['Confirm radio module specs, frequency bands, and transmit power.', 'Check whether SRRC approval or import approval is required.'],
        risk: 'medium'
    },
    battery: {
        label: 'Lithium battery or power supply',
        keywords: ['battery', 'lithium', 'li-ion', 'power bank', 'charger'],
        signals: ['Battery transport', 'Dangerous goods documentation'],
        nextChecks: ['Confirm UN38.3 test status, watt-hour rating, and packaging requirements.', 'Check carrier and customs documentation requirements.'],
        risk: 'medium'
    },
    encryption: {
        label: 'Encryption / VPN / secure module',
        keywords: ['encryption', 'encrypted', 'vpn', 'crypto', 'security'],
        signals: ['Commercial encryption control', 'Dual-use review'],
        nextChecks: ['Confirm whether encryption functionality is general consumer use or restricted capability.', 'Check commercial encryption import/export rules before shipment.'],
        risk: 'high'
    },
    uav: {
        label: 'UAV / drone / flight component',
        keywords: ['drone', 'uav', 'quadcopter', 'flight controller', 'drone parts'],
        signals: ['UAV export control', 'Dual-use end-use risk'],
        nextChecks: ['Confirm payload, range, autonomy, and end-use/end-user details.', 'Check whether UAV or component export controls may apply.'],
        risk: 'high'
    },
    infrared: {
        label: 'Infrared / night vision / thermal imaging',
        keywords: ['infrared', 'night vision', 'thermal camera', 'thermal imaging'],
        signals: ['Sensitive imaging capability', 'Dual-use review'],
        nextChecks: ['Confirm sensor type, resolution, frame rate, and intended use.', 'Check dual-use control lists for imaging or surveillance functions.'],
        risk: 'high'
    },
    semiconductor: {
        label: 'Chip / semiconductor / advanced manufacturing',
        keywords: ['chip', 'semiconductor', 'integrated circuit', 'processor', 'wafer', 'foundry'],
        signals: ['Semiconductor trade control', 'Supply chain security review'],
        nextChecks: ['Confirm chip type, performance specs, manufacturing node, and destination.', 'Check semiconductor export/import controls and end-use concerns.'],
        risk: 'high'
    },
    advanced_manufacturing: {
        label: 'Equipment / foundry / packaging',
        keywords: ['semiconductor equipment', 'foundry', 'lithography', 'etching', 'advanced packaging', 'eda'],
        signals: ['Advanced manufacturing control', 'Technology transfer review'],
        nextChecks: ['Confirm equipment capability, process node, software/technology transfer, and service scope.', 'Check foundry, equipment, and advanced packaging control signals.'],
        risk: 'high'
    },
    ai_chip: {
        label: 'AI chip / GPU / accelerator',
        keywords: ['ai chip', 'gpu', 'inference accelerator', 'hbm', 'processor'],
        signals: ['Advanced chip control', 'End-use/end-user review'],
        nextChecks: ['Confirm compute performance, memory bandwidth, destination, and end-use.', 'Check advanced chip and AI accelerator control signals.'],
        risk: 'high'
    },
    destination_end_use: {
        label: 'Sensitive end use / end user',
        keywords: ['dual-use', 'export control', 'military', 'surveillance', 'end use'],
        signals: ['End-use/end-user risk', 'License review trigger'],
        nextChecks: ['Confirm ultimate consignee, end user, end use, and destination country.', 'Escalate to professional review if military, surveillance, or restricted-party concerns exist.'],
        risk: 'high'
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.PRECHECK_FACTORS = PRECHECK_FACTORS;
}

// === UI string helper ===
function t(key, params = {}) {
    const text = UI_STRINGS[key];
    if (!text) return key;
    
    let result = text;
    for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
    }
    return result;
}

// === Sync static UI copy from UI_STRINGS ===
function applyUiStrings() {
    // 更新标题和副标题
    updateElementText('home-title', t('title'));
    updateElementText('home-subtitle', t('subtitle'));
    
    // 更新方向切换按钮
    if (!document.getElementById('direction-export')?.dataset.complianceFocus) {
        updateElementText('direction-export', t('export'));
    }
    if (!document.getElementById('direction-import')?.dataset.complianceFocus) {
        updateElementText('direction-import', t('import'));
    }
    
    // 更新搜索框和按钮
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) searchBtn.innerHTML = t('searchBtn');
    
    // 更新免责声明
    const disclaimer = document.querySelector('.disclaimer-bar span');
    if (disclaimer) disclaimer.textContent = t('disclaimer');
    
    // 更新案例库按钮
    updateElementText('view-cases-btn', t('viewCases'));
    
    // 更新反馈链接
    updateElementText('feedback-trigger', t('feedback'));
    
    // 更新底部导航（左下角 dock）
    const navHome = document.getElementById('nav-home');
    if (navHome) navHome.textContent = `🏠 ${t('navHome')}`;
    const navIncoterm = document.getElementById('nav-incoterm');
    if (navIncoterm) navIncoterm.textContent = `📦 ${t('navIncoterm')}`;
    const navHsCode = document.getElementById('nav-hscode');
    if (navHsCode) {
        navHsCode.textContent = `🔍 ${t('navHsCode')}`;
    }
    const navOpportunity = document.getElementById('nav-opportunity');
    if (navOpportunity) {
        navOpportunity.textContent = `🌐 ${t('navOpportunity')}`;
    }
    
    // 更新警告横幅
    const warningBanner = document.querySelector('.warning-banner p');
    if (warningBanner) warningBanner.textContent = t('warningBanner');
    
    // 更新分类页面标题
    const catTitle = document.querySelector('#categories-view h2');
    if (catTitle) catTitle.textContent = t('categoriesTitle');
    
    // 更新分类页面摘要
    updateCategoriesSummary();
    
    // 更新知识库搜索框
    const kbSearch = document.getElementById('kb-search-input');
    if (kbSearch) kbSearch.placeholder = t('kbSearchPlaceholder');
    
    // 更新反馈弹窗
    updateElementText('feedback-thanks', t('thanksFeedback'));
    const feedbackH3 = document.querySelector('#feedback-form h3');
    if (feedbackH3) feedbackH3.textContent = t('helpImprove');
    const feedbackP = document.querySelector('#feedback-form p');
    if (feedbackP) feedbackP.textContent = t('feedbackMessage');
    
    const fbProductLabel = document.querySelector('label[for="fb-product"]');
    if (fbProductLabel) fbProductLabel.textContent = t('feedbackProduct');
    const fbMessageLabel = document.querySelector('label[for="fb-message"]');
    if (fbMessageLabel) fbMessageLabel.textContent = t('feedbackRegulation');
    const fbEmailLabel = document.querySelector('label[for="fb-email"]');
    if (fbEmailLabel) fbEmailLabel.textContent = t('feedbackEmail');
    
    const modalCancel = document.getElementById('modal-cancel');
    if (modalCancel) modalCancel.textContent = t('cancel');
    const modalSubmit = document.querySelector('#user-feedback-form .modal-submit');
    if (modalSubmit) modalSubmit.textContent = t('sendFeedback');
    
    // 更新输入框占位符
    const fbProductInput = document.getElementById('fb-product');
    if (fbProductInput) fbProductInput.placeholder = t('productPlaceholder');
    const fbMessageTextarea = document.getElementById('fb-message');
    if (fbMessageTextarea) fbMessageTextarea.placeholder = t('feedbackRegulation');
    const fbEmailInput = document.getElementById('fb-email');
    if (fbEmailInput) fbEmailInput.placeholder = 'you@company.com';

    // 政策纠偏弹窗
    updateElementText('policy-correction-title', t('policyCorrectionTitle'));
    updateElementText('policy-correction-intro', t('policyCorrectionIntro'));
    updateElementText('pc-product-keyword-label', t('policyCorrectionProduct'));
    updateElementText('pc-policy-type-label', t('policyCorrectionPolicyType'));
    updateElementText('pc-source-url-label', t('policyCorrectionSourceUrl'));
    updateElementText('pc-user-message-label', t('policyCorrectionMessage'));
    updateElementText('policy-correction-cancel', t('cancel'));

    const policySubmit = document.querySelector('#policy-correction-form .policy-correction-submit');
    if (policySubmit) policySubmit.textContent = t('policyCorrectionSubmit');

    const policyTypeSelect = document.getElementById('pc-policy-type');
    if (policyTypeSelect && policyTypeSelect.options.length > 0) {
        policyTypeSelect.options[0].textContent = t('policyCorrectionPolicyTypePlaceholder');
    }

    const sourceUrlInput = document.getElementById('pc-source-url');
    if (sourceUrlInput) sourceUrlInput.placeholder = t('policyCorrectionSourceUrlPlaceholder');

    const policyMessageTextarea = document.getElementById('pc-user-message');
    if (policyMessageTextarea) policyMessageTextarea.placeholder = t('policyCorrectionMessagePlaceholder');
}

// === 更新元素文本 ===
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function getTagCategoryLabel(tag) {
    const label = tag.category_label || tag.category || 'General';
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const importFocused = (AppState.currentDirection || 'export') === 'import'
        || AppState.complianceFocus === 'import'
        || tag.route_focus === 'import'
        || tag.compliance_focus === 'import';
    if (
        importFocused
        && (tag.category === 'EXPORT_CTRL' || normalizedLabel === 'export control')
    ) {
        return 'Import Controls & Trade Remedies';
    }
    return getDisplayCategoryLabel(label, tag.category);
}

function getDisplayCategoryLabel(label, categoryCode = '') {
    const normalized = String(label || '').trim().toLowerCase();
    const category = String(categoryCode || '').trim();

    if (category === 'IMPORT_REG' || normalized === 'import regulation') {
        return 'Import Clearance & Tariff';
    }
    if (category === 'IMPORT_CONTROL' || normalized === 'import control') {
        return 'Import Controls & Trade Remedies';
    }
    if (category === 'EXPORT_DECLARATION' || normalized === 'export customs' || normalized === 'export declaration') {
        return 'Export Filing & Documents';
    }
    if (category === 'ORIGIN_DOC' || normalized === 'origin / transshipment') {
        return 'Origin & Anti-Circumvention';
    }
    if (category === 'ENVIRONMENT_BATTERY'
        || normalized === 'battery / e-waste'
        || normalized === 'green compliance & esg'
        || /e-waste|weee|battery regulation|battery law|producer responsibility|sustainability|cbam|carbon|packaging/.test(normalized)) {
        return 'Green Compliance & ESG';
    }
    if (normalized === 'compliance standard') {
        return 'Product Standards';
    }
    if (normalized === 'compulsory certification') {
        return 'Product Certification';
    }
    if (normalized === 'wireless & telecom') {
        return 'Wireless & Telecom Approval';
    }
    if (normalized === 'other requirements') {
        return 'General Compliance Requirements';
    }
    if (normalized === 'tax rebate') {
        return 'Export Rebate';
    }
    if (normalized === 'tax & financial incentives') {
        return 'Duty Drawback & Tax Incentives';
    }
    if (/destination barrier/.test(normalized)) {
        return 'Destination Market Requirements';
    }
    if (/origin compliance/.test(normalized)) {
        return 'Origin-Side Compliance';
    }
    if (normalized === 'us tariff exposure') {
        return 'Tariff Exposure';
    }
    if (normalized === 'us ad/cvd') {
        return 'AD/CVD Trade Remedies';
    }
    if (normalized === 'asean solar routing risk') {
        return 'Solar Origin & Routing Risk';
    }
    return label || 'General';
}

const CATEGORY_THEME = {
    EXPORT_CTRL: { class: 'export-ctrl', icon: '🛡️' },
    EXPORT_DECLARATION: { class: 'origin-doc', icon: '🧾' },
    ORIGIN_DOC: { class: 'origin-doc', icon: '🧭' },
    IMPORT_CONTROL: { class: 'import-regulation', icon: '📦' },
    IMPORT_REG: { class: 'import-regulation', icon: '📦' },
    COMPULSORY_CERT: { class: 'compulsory-cert', icon: '✅' },
    TAX_INCENTIVE: { class: 'tax-incentive', icon: '💰' },
    TAX_REBATE: { class: 'tax-incentive', icon: '💰' },
    WIRELESS_TELECOM: { class: 'wireless-telecom', icon: '📡' },
    COMPLIANCE_STD: { class: 'compliance-std', icon: '📋' },
    ENVIRONMENT_BATTERY: { class: 'green-compliance', icon: '🌱' },
    SUPPLY_CHAIN: { class: 'destination-barrier', icon: '🧭' },
    OTHER: { class: 'other', icon: '📦' }
};

const CATEGORY_LABEL_THEME_RULES = [
    { pattern: /green compliance|esg|e-waste|weee|battery regulation|battery law|producer responsibility|sustainability|cbam|carbon|packaging/, theme: { class: 'green-compliance', icon: '🌱' } },
    { pattern: /battery|ess|energy storage/, theme: { class: 'battery-ess', icon: '🔋' } },
    { pattern: /destination market|destination barrier|routing risk|anti-circumvention/, theme: { class: 'destination-barrier', icon: '🚧' } },
    { pattern: /import clearance|import regulation|import control|trade remed|tariff|ad\/cvd/, theme: { class: 'import-regulation', icon: '📦' } },
    { pattern: /export filing|export customs|export declaration/, theme: { class: 'origin-doc', icon: '🧾' } },
    { pattern: /product standards|compliance standard|standard/, theme: { class: 'compliance-standard', icon: '📘' } },
    { pattern: /product certification|compulsory certification/, theme: { class: 'compulsory-cert', icon: '✅' } },
    { pattern: /wireless|telecom/, theme: { class: 'wireless-telecom', icon: '📡' } },
    { pattern: /product compliance|product safety/, theme: { class: 'product-compliance', icon: '📄' } },
    { pattern: /ev charger|wallbox|charging/, theme: { class: 'ev-charger', icon: '🔌' } },
    { pattern: /optical|laser/, theme: { class: 'optical-laser', icon: '🔦' } },
    { pattern: /drone|uav|uas|unmanned aircraft/, theme: { class: 'drone-uav', icon: '🛩️' } }
];

function getCategoryTheme(categoryCode, categoryLabel = '') {
    const normalizedLabel = String(categoryLabel || '').toLowerCase();
    if (/import clearance|import regulation|import control|trade remed|tariff|ad\/cvd/.test(normalizedLabel)) {
        return { class: 'import-regulation', icon: '📦' };
    }
    const categoryTheme = CATEGORY_THEME[categoryCode];
    if (categoryTheme && categoryCode !== 'OTHER') {
        return categoryTheme;
    }
    const labelTheme = CATEGORY_LABEL_THEME_RULES.find((rule) => rule.pattern.test(normalizedLabel));
    if (labelTheme) return labelTheme.theme;
    return categoryTheme || CATEGORY_THEME.OTHER;
}

// === 更新分类页面摘要 ===
function updateCategoriesSummary() {
    const summaryEl = document.getElementById('categories-summary');
    if (!summaryEl || !AppState.data.categories) return;
    
    const totalGroups = AppState.data.categories.length;
    let totalItems = 0;
    AppState.data.categories.forEach(group => {
        totalItems += group.items.length;
    });
    
    summaryEl.innerHTML = t('categoriesSummary', { total: totalItems, groups: totalGroups });
}

function updateHubStats() {
    const statsEl = document.getElementById('hub-electronics-stats');
    if (!statsEl) return;

    const tags = AppState.data.tags || [];
    const cases = AppState.data.cases || [];
    const categories = AppState.data.categories || [];
    let categoryItems = 0;
    categories.forEach(group => {
        categoryItems += (group.items || []).length;
    });

    statsEl.textContent = `${categoryItems} categories · ${tags.length} rules · ${cases.length} cases`;
}

// === XSS防护：转义HTML特殊字符 ===
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
globalThis.escapeHtml = escapeHtml;

// === XSS防护：净化 URL，防止 javascript: 伪协议 ===
function sanitizeUrl(url) {
    if (!url) return '#';
    const lowerUrl = url.toLowerCase().trim();
    if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:')) {
        return '#'; // 拦截恶意协议
    }
    return escapeHtml(url);
}

/** Collapsible panels: click .collapsible-header to toggle .collapsible-panel.open */
function bindCollapsiblePanels(root) {
    initGlobalCollapsiblePanels();
    if (!root || root.dataset.collapsibleBound === '1') {
        return;
    }
    root.dataset.collapsibleBound = '1';
}

function initGlobalCollapsiblePanels() {
    if (document.documentElement.dataset.globalCollapsibleBound === '1') {
        return;
    }
    document.documentElement.dataset.globalCollapsibleBound = '1';
    document.addEventListener('click', (event) => {
        const header = event.target.closest('.collapsible-header');
        if (!header) {
            return;
        }
        const panel = header.closest('.collapsible-panel');
        if (!panel) {
            return;
        }
        if (event.target.closest('a')) {
            return;
        }
        event.preventDefault();
        const open = panel.classList.toggle('open');
        header.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
}

/**
 * 具有降级能力的 JSON 加载器，防止单个文件失败导致应用崩溃
 */
