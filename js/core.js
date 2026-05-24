// === English UI strings ===
const UI_STRINGS = {
    title: "Trade Comply",
    subtitle: "Import/export compliance pre-checks for electronics and semiconductors. Current coverage starts with China.",
    export: "Export from China",
    import: "Import into China",
    searchPlaceholder: "Enter product, HS Code, or risk feature",
    searchBtn: "GO",
    latestUpdate: "Latest Update:",
    disclaimer: "Pre-screening only. This tool cites official sources and does not provide legal advice.",
    viewCases: "View Case Library",
    feedback: "💬 Can't find your product? Tell us",
    home: "🏠 Home",
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
    outOfRange: "Your query is outside the scope of this trade compliance pre-check. Current coverage focuses on China import/export signals for electronics, semiconductors, wireless devices, batteries, encryption, UAVs, dual-use controls, and related VAT or customs issues.",
    aiAssistant: "🤖 AI Assistant",
    askAiAssistant: "Ask AI Assistant",
    askAiPlaceholder: "Ask about the matched rules above (e.g. exemptions, documents needed)",
    aiError: "AI assistant temporarily unavailable, please try again later.",
    aiNoMatchedRules: "No matched rules available for AI grounding. Review the cards above or submit feedback.",
    aiBasedOnRules: "Based on {count} matched rule(s) from the library.",
    aiInsufficientContext: "The rule library does not contain enough detail for a grounded AI answer.",
    aiGeneralGuidance: "Includes general guidance not sourced from the rule library.",
    source: "Source",
    referenceSources: "Reference Sources:",
    searching: "Searching...",
    aiSearch: "AI Search:",
    allCases: "All Cases",
    allProducts: "All Products",
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
    trustCoveredLibrary: "Library scope: {ruleCount} rules · {caseCount} cases (China electronics / semiconductor signals)",
    trustCoveredSources: "Each matched card below links to an official Source citation in the rule library.",
    trustCoveredNoMatches: "No rules matched this query in the current library — this is not a clearance to ship.",
    trustCoveredOutOfRange: "Query is outside the current product scope for automated screening.",
    trustStatusScreened: "Screened",
    trustStatusNoMatch: "No rule match",
    trustStatusOutOfScope: "Out of scope",
    trustNotCoveredDestination: "Destination-country customs rulings, import bans, or local product rules outside this China-focused library.",
    trustNotCoveredHsFinal: "Final HS classification, dutiable value, origin determination, and customs declaration acceptance.",
    trustNotCoveredEndUse: "End-use, end-user, and restricted-party / sanctions screening (only risk signals may appear).",
    trustNotCoveredCarrier: "Carrier acceptance, dangerous-goods packaging, port handling, and last-mile logistics requirements.",
    trustNotCoveredContract: "Contract terms, Incoterms allocation of cost/risk, and commercial warranty or liability.",
    trustNotCoveredNonElectronics: "Non-electronics / non-semiconductor products unless explicitly matched.",
    trustNotCoveredLegal: "Legal opinions, binding customs pre-rulings, or licensing decisions.",
    trustNotCoveredNoMatchExtra: "Absence of a match does not mean no compliance obligation exists — only that this library did not flag a signal.",
    trustNotCoveredHasMatchExtra: "A matched signal is a research starting point, not proof that all requirements are satisfied.",
    trustNotCoveredOutOfRangeExtra: "This tool currently focuses on China import/export signals for electronics, semiconductors, wireless, batteries, encryption, UAVs, and related controls.",
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
    trustVerifyItemReviewSource: "Follow official Source links on each matched card; this screen does not approve shipment."
};

// === 允许搜索的关键词范围 ===
const ALLOWED_KEYWORDS = [
    // 半导体相关
    "chip", "semiconductor", "integrated circuit", "ic", "gpu", "ai chip", "hbm", "dram", "nand",
    "cpu", "processor", "wafer", "foundry", "lithography", "etching", "eda", "chiplet", "3d ic",
    "advanced packaging", "silicon photonics", "optical interconnect", "fabless", "inference accelerator",
    // CCC 认证相关
    "speaker", "earbuds", "headphones", "audio", "video player", "amplifier",
    "laptop", "tablet", "computer", "server", "router", "switch", "monitor",
    "smartphone", "mobile phone", "modem", "wireless headphones",
    "power bank", "portable charger", "battery pack", "external battery", "mobile power", "powerbank",
    "smart home", "smart plug", "smart bulb", "smart light", "doorbell", "thermostat",
    "smoke detector", "alarm", "sensor", "home automation", "smart lock",
    "dash cam", "dash camera", "car camera", "car dvr", "vehicle camera",
    "car tracker", "gps tracker", "vehicle gps", "obd", "car charger",
    "game console", "gaming console", "playstation", "xbox", "nintendo",
    "game controller", "joystick", "gamepad", "gaming controller", "handheld game", "steam deck",
    "medical device", "blood pressure monitor", "thermometer", "pulse oximeter",
    "glucose meter", "nebulizer", "massager", "medical", "health device", "health monitor",
    "projector", "home projector", "mini projector", "led projector", "portable projector",
    "power adapter", "charger", "usb charger", "power supply", "ac adapter", "dc adapter",
    "wall charger", "fast charger", "gan charger", "charging adapter",
    "ssd", "hard drive", "external hard drive", "usb drive", "usb stick", "flash drive",
    "thumb drive", "portable ssd", "memory card", "sd card",
    "keyboard", "mouse", "computer mouse", "trackpad", "webcam", "web camera", "usb hub", "card reader",
    "vr headset", "ar glasses", "smart glasses", "virtual reality", "augmented reality",
    "mixed reality", "vr goggles", "ar headset", "apple vision", "meta quest", "vr device",
    "vape", "e-cigarette", "electronic cigarette", "vaping device", "vape pen", "vape mod",
    "pod system", "vape cartridge", "e-liquid", "vape juice", "vaporizer",
    "3d printer", "3d printing", "additive manufacturing", "fdm printer", "resin printer",
    "sla printer", "sls printer", "3d printing machine", "filament printer", "metal 3d printer", "industrial 3d printer",
    
    // 无线通信相关
    "wifi", "bluetooth", "wireless", "radio", "zigbee", "nfc", "rfid",
    "smart speaker", "drone", "ip camera",
    "encryption", "encrypted", "crypto", "security", "password", "vpn",
    "smartwatch", "smart watch", "fitness tracker", "wristband", "wearable", "fitbit",
    "apple watch", "galaxy watch", "garmin", "activity tracker", "health tracker", "ring", "smart ring",
    "smart sensor", "motion sensor", "door sensor", "temperature sensor", "humidity sensor", "smart thermostat",
    "wireless keyboard", "wireless mouse", "bluetooth keyboard", "bluetooth mouse", "wireless trackpad", "wireless presenter",
    "walkie talkie", "two way radio", "walkie-talkie", "two-way radio", "handheld radio", "uhf radio",
    "vhf radio", "pmr radio", "dmr radio", "poe radio", "intercom", "long range radio",
    
    // 出口管制相关
    "uav", "infrared", "night vision", "thermal camera", "quadcopter", "unmanned aerial", "multi-rotor",
    "drone camera", "drone gimbal", "thermal camera drone", "drone payload", "drone parts", "uav parts",
    "video transmitter", "video transmission", "drone accessories", "fpv", "first person view",
    "drone flight controller", "drone motor", "drone frame",
    
    // 电池安全相关
    "battery", "lithium", "li-ion",
    "electric scooter", "e-scooter", "hoverboard", "self-balancing scooter", "electric skateboard",
    "e-bike", "electric bicycle", "electric unicycle", "segway", "balance board", "personal mobility",
    
    // 太阳能相关
    "solar panel", "solar inverter", "photovoltaic module", "solar cell", "photovoltaic", "solar energy",
    "solar battery", "solar storage", "solar charger",
    
    // 工业机器人相关
    "industrial robot", "collaborative robot", "cobot", "robot arm", "robot controller",
    "welding robot", "material handling",
    
    // 储能系统相关
    "energy storage", "battery system", "powerwall", "storage inverter", "pcs", "lithium battery", "storage system",
    
    // 税务优惠相关
    "tax refund", "VAT refund", "drawback", "tax rebate", "cost saving", "tax incentive",
    "export tax", "tax benefit", "tax exemption", "duty refund", "customs clearance finance",
    "fiscal incentive", "export benefit",
    
    // HS编码相关
    "8518", "8519", "8521", "8471", "8473", "8517", "8528", "8517.12", "8517.62",
    "8507", "8507.60", "8507.80", "8516", "8526", "8531", "8536", "8525.80", "8525.89",
    "8806", "8807", "8527", "8526.92", "9504.50", "9504.90", "8471.60", "9018", "9019",
    "9020", "9021", "9022", "8528.62", "8528.69", "8504.40", "8504.90", "8471.70",
    "8523.51", "8471.80", "8528.52", "8528.59", "9004.90", "8543.70", "3824.99",
    "8529.90", "8807.30", "8711.60", "8711.90", "9503.00", "8485.20", "8477.80",
    "8485.30", "8525.60", "8541.40", "8541.43", "8479.50", "8428.90", "8537.10",
    "optical transceiver", "transceiver", "fiber optic", "fiber module", "optical module",
];

// 检查查询是否在允许的搜索范围内
function checkSearchRange(query) {
    if (!query || typeof query !== 'string') {
        return false;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // 检查是否包含任何允许的关键词
    for (const keyword of ALLOWED_KEYWORDS) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    // 检查是否包含常见的合规相关词汇
    const complianceKeywords = [
        "ccc", "srrc", "认证", "合规", "出口", "进口", "关税", 
        "退税", "管制", "标准", "安全", "电池", "hs", "编码",
        "certification", "compliance", "export", "import", "tax", 
        "regulation", "standard", "safety", "battery", "tariff"
    ];
    
    for (const keyword of complianceKeywords) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    return false;
}

// === 避免污染全局变量，放入统一命名空间 ===
const AppState = {
    data: {
        tags: [],
        cases: [],
        quickActions: [],
        knowledgeBase: {},
        categories: [],
        updates: []
    },
    currentDirection: 'export',
    currentView: 'home',
    lastReport: null,
    aiContext: null
};

const VALID_VIEWS = ['home', 'electronics', 'semiconductor', 'incoterm', 'result', 'kb', 'categories'];

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
    updateElementText('direction-export', t('export'));
    updateElementText('direction-import', t('import'));
    
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
    
    // 更新导航按钮
    updateElementText('nav-home', t('home'));
    updateElementText('nav-kb', t('knowledgeBase'));
    updateElementText('nav-categories', t('categories'));
    
    // 更新返回按钮
    const backBtns = document.querySelectorAll('.back-btn');
    backBtns.forEach(btn => {
        if (btn.id === 'back-to-home-from-cat') {
            btn.innerHTML = t('backArrow');
        } else {
            btn.innerHTML = t('back');
        }
    });
    
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
    const feedbackH3 = document.querySelector('.modal-box h3');
    if (feedbackH3) feedbackH3.textContent = t('helpImprove');
    const feedbackP = document.querySelector('.modal-box p');
    if (feedbackP) feedbackP.textContent = t('feedbackMessage');
    
    const fbProductLabel = document.querySelector('label[for="fb-product"]');
    if (fbProductLabel) fbProductLabel.textContent = t('feedbackProduct');
    const fbMessageLabel = document.querySelector('label[for="fb-message"]');
    if (fbMessageLabel) fbMessageLabel.textContent = t('feedbackRegulation');
    const fbEmailLabel = document.querySelector('label[for="fb-email"]');
    if (fbEmailLabel) fbEmailLabel.textContent = t('feedbackEmail');
    
    const modalCancel = document.getElementById('modal-cancel');
    if (modalCancel) modalCancel.textContent = t('cancel');
    const modalSubmit = document.querySelector('.modal-submit');
    if (modalSubmit) modalSubmit.textContent = t('sendFeedback');
    
    // 更新输入框占位符
    const fbProductInput = document.getElementById('fb-product');
    if (fbProductInput) fbProductInput.placeholder = t('productPlaceholder');
    const fbMessageTextarea = document.getElementById('fb-message');
    if (fbMessageTextarea) fbMessageTextarea.placeholder = t('feedbackRegulation');
    const fbEmailInput = document.getElementById('fb-email');
    if (fbEmailInput) fbEmailInput.placeholder = 'you@company.com';
}

// === 更新元素文本 ===
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function getTagCategoryLabel(tag) {
    const label = tag.category_label || tag.category || 'General';
    if ((AppState.currentDirection || 'export') === 'import' && tag.category === 'EXPORT_CTRL') {
        return 'Import Control & Trade Remedies';
    }
    return label;
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

// === XSS防护：净化 URL，防止 javascript: 伪协议 ===
function sanitizeUrl(url) {
    if (!url) return '#';
    const lowerUrl = url.toLowerCase().trim();
    if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:')) {
        return '#'; // 拦截恶意协议
    }
    return escapeHtml(url);
}

/**
 * 具有降级能力的 JSON 加载器，防止单个文件失败导致应用崩溃
 */
