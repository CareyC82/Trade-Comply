/**
 * High-value industry scenario presets — CODEX showcase quick-launch diagnostics.
 */
'use strict';

const HIGH_VALUE_INDUSTRY_SCENARIOS = [
    {
        id: 'bluetooth-earphones-us',
        label: 'Bluetooth Earphones to the US',
        icon: '🎧',
        tagline: 'Consumer electronics · FCC · Section 301 tariffs',
        vertical: 'electronics',
        direction: 'export',
        country: 'US',
        query: 'bluetooth earphones TWS earbuds 8518.30 FCC Section 301',
        precheck: ['wireless', 'battery'],
        precheckPanelId: 'precheck-panel',
        searchInputId: 'search-input',
        searchHandler: 'searchProducts'
    },
    {
        id: 'ai-gpu-export-control',
        label: 'AI GPU Exports Control',
        icon: '⚡',
        tagline: 'BIS ECCN · Entity List · ultra-high semiconductor controls',
        vertical: 'semiconductor',
        direction: 'export',
        country: 'US',
        query: 'ai gpu accelerator export control BIS ECCN entity list',
        precheck: ['ai_chip', 'semiconductor', 'encryption', 'destination_end_use'],
        precheckPanelId: 'semi-precheck-panel',
        searchInputId: 'search-input-semi',
        searchHandler: 'searchSemiconductorProducts'
    },
    {
        id: 'lithium-battery-air-freight',
        label: 'Lithium Battery Equipment Air-Freight',
        icon: '🔋',
        tagline: 'Dangerous goods · IATA · green supply chain',
        vertical: 'new-energy',
        direction: 'export',
        country: 'US',
        query: 'lithium battery equipment air freight IATA UN38.3 dangerous goods',
        precheck: ['battery'],
        precheckPanelId: 'energy-precheck-panel',
        searchInputId: 'search-input-energy',
        searchHandler: 'searchEnergyProducts'
    },
    {
        id: 'semiconductor-tooling-import-cn',
        label: 'Semiconductor Tooling Import into China',
        icon: '🔬',
        tagline: 'Dual-use items · import licensing · customs clearance',
        vertical: 'semiconductor',
        direction: 'import',
        country: 'US',
        query: 'semiconductor lithography tooling import license customs clearance',
        precheck: ['advanced_manufacturing', 'semiconductor'],
        precheckPanelId: 'semi-precheck-panel',
        searchInputId: 'search-input-semi',
        searchHandler: 'searchSemiconductorProducts'
    },
    {
        id: 'drone-components-outbound',
        label: 'Drone Components Outbound Control',
        icon: '🛸',
        tagline: 'Export sanctions · autopilot hardware · anti-smuggling',
        vertical: 'electronics',
        direction: 'export',
        country: 'US',
        query: 'drone components export control autopilot UAV flight controller',
        precheck: ['uav', 'wireless'],
        precheckPanelId: 'precheck-panel',
        searchInputId: 'search-input',
        searchHandler: 'searchProducts'
    }
];

const SCENARIO_BY_ID = Object.fromEntries(
    HIGH_VALUE_INDUSTRY_SCENARIOS.map((scenario) => [scenario.id, scenario])
);

/** Scenario pills shown per sub-channel (homepage hub intentionally excluded). */
const CHANNEL_SCENARIO_IDS = {
    electronics: ['bluetooth-earphones-us'],
    'new-energy': ['lithium-battery-air-freight'],
    semiconductor: ['ai-gpu-export-control', 'semiconductor-tooling-import-cn']
};

const CHANNEL_SCENARIO_CONTAINERS = {
    'electronics-industry-scenario-pills': 'electronics',
    'new-energy-industry-scenario-pills': 'new-energy',
    'semiconductor-industry-scenario-pills': 'semiconductor',
    'category-industry-scenario-pills': null
};

const CHANNEL_SCENARIO_COPY = {
    electronics: {
        heading: 'Electronics quick diagnostic',
        note: 'Pre-fills US export, wireless + battery risk attributes, and runs screening.'
    },
    'new-energy': {
        heading: 'New energy quick diagnostic',
        note: 'Pre-fills air-freight battery logistics signals and runs screening.'
    },
    semiconductor: {
        heading: 'Semiconductor quick diagnostics',
        note: 'Export-control and import-licensing scenarios for this channel.'
    }
};

function getIndustryScenarioById(id) {
    return SCENARIO_BY_ID[id] || null;
}

function getScenariosForChannel(channel) {
    const ids = CHANNEL_SCENARIO_IDS[channel];
    if (!ids?.length) {
        return [];
    }
    return ids.map((id) => SCENARIO_BY_ID[id]).filter(Boolean);
}

function applyScenarioDirection(vertical, direction) {
    const safeDirection = direction === 'import' ? 'import' : 'export';
    AppState.currentDirection = safeDirection;

    if (vertical === 'new-energy') {
        const exportBtn = document.getElementById('direction-export-energy');
        const importBtn = document.getElementById('direction-import-energy');
        if (safeDirection === 'import') {
            importBtn?.click();
        } else {
            exportBtn?.click();
        }
        return;
    }

    if (vertical === 'semiconductor') {
        const exportBtn = document.getElementById('direction-export-semi');
        const importBtn = document.getElementById('direction-import-semi');
        if (safeDirection === 'import') {
            importBtn?.click();
        } else {
            exportBtn?.click();
        }
        return;
    }

    if (typeof setDirection === 'function') {
        setDirection(safeDirection);
    }
    const exportBtn = document.getElementById('direction-export');
    const importBtn = document.getElementById('direction-import');
    if (safeDirection === 'import') {
        importBtn?.click();
    } else {
        exportBtn?.click();
    }
}

function buildIndustryScenarioSearchUrl(scenario) {
    const params = new URLSearchParams();
    params.set('appv', globalThis.TradeComplyBuild || 'current');
    params.set('search', (scenario.query || '').trim());
    params.set('direction', scenario.direction === 'import' ? 'import' : 'export');
    params.set('country', scenario.country || 'US');
    params.set('vertical', scenario.vertical || 'electronics');
    if (scenario.precheck?.length) {
        params.set('precheck', scenario.precheck.join(','));
    }
    return `index.html?${params.toString()}`;
}

function runIndustryScenarioSearch(scenario) {
    applyScenarioDirection(scenario.vertical, scenario.direction);

    if (typeof initTradeCountryForDirection === 'function') {
        initTradeCountryForDirection(scenario.direction, scenario.country);
    } else if (typeof setTradeCountry === 'function') {
        setTradeCountry(scenario.country);
    }

    if (typeof applyPrecheckSelections === 'function') {
        applyPrecheckSelections(scenario.precheckPanelId, scenario.precheck);
    }

    const searchInput = document.getElementById(scenario.searchInputId);
    if (searchInput) {
        searchInput.value = scenario.query;
    }

    const runSearch = globalThis[scenario.searchHandler];
    if (typeof runSearch === 'function') {
        runSearch(scenario.query);
    }

    if (typeof showView === 'function') {
        history.replaceState({ view: 'result' }, '', `${window.location.pathname}#result`);
    }
}

function launchIndustryScenario(scenarioId) {
    const scenario = getIndustryScenarioById(scenarioId);
    if (!scenario) {
        return;
    }

    const onCategoryPage = Boolean(document.querySelector('script[data-category]'));
    if (onCategoryPage) {
        window.location.href = buildIndustryScenarioSearchUrl(scenario);
        return;
    }

    const hasIndexViews = Boolean(document.getElementById('electronics-view'));
    if (!hasIndexViews) {
        window.location.href = buildIndustryScenarioSearchUrl(scenario);
        return;
    }

    if (typeof showView === 'function') {
        showView(scenario.vertical, false);
    }

    requestAnimationFrame(() => {
        runIndustryScenarioSearch(scenario);
    });
}

function buildScenarioPillHtml(scenario) {
    return `
        <button type="button" class="scenario-pill" data-scenario-id="${escapeHtml(scenario.id)}" aria-label="${escapeHtml(scenario.label)}">
            <span class="scenario-pill-icon" aria-hidden="true">${escapeHtml(scenario.icon)}</span>
            <span class="scenario-pill-text">
                <span class="scenario-pill-label">${escapeHtml(scenario.label)}</span>
                <span class="scenario-pill-tagline">${escapeHtml(scenario.tagline)}</span>
            </span>
        </button>
    `;
}

function renderIndustryScenarioPills(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const channel = options.channel || null;
    const scenarios = channel ? getScenariosForChannel(channel) : [];

    if (!scenarios.length) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }

    container.hidden = false;
    const copy = CHANNEL_SCENARIO_COPY[channel] || {};
    const heading = options.heading || copy.heading || 'High-Value Industry Templates';
    const note = options.note || copy.note || 'One-click diagnostic for this channel.';

    container.innerHTML = `
        <div class="industry-scenario-block">
            <div class="industry-scenario-header">
                <h2 class="industry-scenario-heading">${escapeHtml(heading)}</h2>
                <p class="industry-scenario-note">${escapeHtml(note)}</p>
            </div>
            <div class="industry-scenario-pills" role="group" aria-label="${escapeHtml(heading)}">
                ${scenarios.map((scenario) => buildScenarioPillHtml(scenario)).join('')}
            </div>
        </div>
    `;

    container.querySelectorAll('.scenario-pill').forEach((pill) => {
        pill.addEventListener('click', () => {
            const scenarioId = pill.dataset.scenarioId;
            if (scenarioId) {
                launchIndustryScenario(scenarioId);
            }
        });
    });
}

function resolveCategoryChannelKey() {
    const script = document.querySelector('script[data-category]');
    const key = (script?.dataset?.category || '').trim();
    return CHANNEL_SCENARIO_IDS[key] ? key : null;
}

function initIndustryScenarioPills() {
    const categoryChannel = resolveCategoryChannelKey();

    Object.entries(CHANNEL_SCENARIO_CONTAINERS).forEach(([containerId, channel]) => {
        if (!document.getElementById(containerId)) {
            return;
        }
        const resolvedChannel = channel || categoryChannel;
        if (!resolvedChannel) {
            return;
        }
        renderIndustryScenarioPills(containerId, { channel: resolvedChannel });
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.HIGH_VALUE_INDUSTRY_SCENARIOS = HIGH_VALUE_INDUSTRY_SCENARIOS;
    globalThis.CHANNEL_SCENARIO_IDS = CHANNEL_SCENARIO_IDS;
    globalThis.getScenariosForChannel = getScenariosForChannel;
    globalThis.getIndustryScenarioById = getIndustryScenarioById;
    globalThis.applyScenarioDirection = applyScenarioDirection;
    globalThis.buildIndustryScenarioSearchUrl = buildIndustryScenarioSearchUrl;
    globalThis.launchIndustryScenario = launchIndustryScenario;
    globalThis.runIndustryScenarioSearch = runIndustryScenarioSearch;
    globalThis.renderIndustryScenarioPills = renderIndustryScenarioPills;
    globalThis.initIndustryScenarioPills = initIndustryScenarioPills;
}
