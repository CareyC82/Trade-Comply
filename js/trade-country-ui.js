/**
 * Trade country <select> UI — sync with direction and AppState.
 */

const TRADE_COUNTRY_UI_FALLBACK_EXPORT_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'EU', label: 'European Union' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'MY', label: 'Malaysia' },
    { value: 'ASEAN', label: 'ASEAN' },
    { value: 'RU', label: 'Russia' },
    { value: 'GLOBAL', label: 'Other' }
];

const TRADE_COUNTRY_UI_FALLBACK_IMPORT_OPTIONS = [
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'MY', label: 'Malaysia' },
    { value: 'US', label: 'United States' },
    { value: 'GLOBAL', label: 'Other' }
];

const TRADE_COUNTRY_UI_FALLBACK_ROUTE_OPTIONS = [
    { value: 'CN', label: 'China' },
    { value: 'US', label: 'United States' },
    { value: 'DE', label: 'Germany' },
    { value: 'NL', label: 'Netherlands' },
    { value: 'SG', label: 'Singapore' },
    { value: 'MX', label: 'Mexico' },
    { value: 'VN', label: 'Vietnam' },
    { value: 'MY', label: 'Malaysia' },
    { value: 'ASEAN', label: 'ASEAN' },
    { value: 'EU', label: 'European Union' },
    { value: 'RU', label: 'Russia' },
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'GLOBAL', label: 'Other' }
];

function getCountryOptionsApi() {
    if (globalThis.TradeComplyCountry) {
        return globalThis.TradeComplyCountry;
    }
    return {
        getCountryOptionsForDirection(direction) {
            return direction === 'import' ? TRADE_COUNTRY_UI_FALLBACK_IMPORT_OPTIONS : TRADE_COUNTRY_UI_FALLBACK_EXPORT_OPTIONS;
        },
        getRouteOptions() {
            return TRADE_COUNTRY_UI_FALLBACK_ROUTE_OPTIONS;
        },
        normalizeCountryCode(value) {
            const raw = String(value || 'US').trim();
            const map = {
                China: 'CN',
                'United States': 'US',
                Germany: 'DE',
                Netherlands: 'NL',
                Singapore: 'SG',
                Mexico: 'MX',
                Vietnam: 'VN',
                Malaysia: 'MY',
                'European Union': 'EU',
                ASEAN: 'ASEAN',
                'ASEAN (Vietnam / Malaysia)': 'ASEAN',
                Russia: 'RU',
                'Taiwan (China)': 'TW',
                Japan: 'JP',
                'South Korea': 'KR',
                Other: 'GLOBAL',
                OTHER: 'GLOBAL'
            };
            if (map[raw]) {
                return map[raw];
            }
            const upper = raw.toUpperCase();
            return map[upper] || upper || 'US';
        },
        getRouteContext(input = {}) {
            const focus = input.focus === 'export' ? 'export' : 'import';
            const from = this.normalizeCountryCode(input.from || 'CN');
            const to = this.normalizeCountryCode(input.to || 'US');
            const direction = focus === 'import' || from === 'CN' ? 'export' : (to === 'CN' ? 'import' : 'export');
            const country = focus === 'import' ? to : (from === 'CN' ? to : from);
            return { from, to, focus, direction, country };
        }
    };
}

function getActiveTradeCountrySelect() {
    const electronics = document.getElementById('trade-country');
    const energy = document.getElementById('trade-country-energy');
    const semi = document.getElementById('trade-country-semi');
    if (electronics && electronics.offsetParent !== null) {
        return electronics;
    }
    if (energy && energy.offsetParent !== null) {
        return energy;
    }
    if (semi && semi.offsetParent !== null) {
        return semi;
    }
    return electronics || energy || semi;
}

function getActiveTradeDirection() {
    const buttonPairs = [
        ['direction-export', 'direction-import'],
        ['direction-export-energy', 'direction-import-energy'],
        ['direction-export-semi', 'direction-import-semi']
    ];

    for (const [exportId, importId] of buttonPairs) {
        const exportBtn = document.getElementById(exportId);
        const importBtn = document.getElementById(importId);
        const groupVisible = (exportBtn && exportBtn.offsetParent !== null)
            || (importBtn && importBtn.offsetParent !== null);
        if (!groupVisible) {
            continue;
        }
        if (importBtn?.classList.contains('active')) {
            return 'import';
        }
        if (exportBtn?.classList.contains('active')) {
            return 'export';
        }
    }

    return AppState.currentDirection === 'import' ? 'import' : 'export';
}

function getActiveRouteSelect(kind) {
    const selector = `[data-route-country="${kind}"]`;
    const selects = Array.from(document.querySelectorAll(selector));
    return selects.find((select) => select.offsetParent !== null) || selects[0] || null;
}

function getActiveFocusButton() {
    const buttons = Array.from(document.querySelectorAll('[data-compliance-focus].active'));
    return buttons.find((button) => button.offsetParent !== null) || buttons[0] || null;
}

function populateTradeCountrySelect(selectEl, direction, selectedCode) {
    if (!selectEl) {
        return;
    }

    const api = getCountryOptionsApi();
    const options = api.getCountryOptionsForDirection(direction);
    const selected = api.normalizeCountryCode(
        selectedCode || AppState.currentCountry || options[0]?.value
    );

    selectEl.innerHTML = options
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
    selectEl.value = options.some((o) => o.value === selected) ? selected : options[0].value;
    selectEl.disabled = false;
    selectEl.removeAttribute('aria-disabled');
    AppState.currentCountry = selectEl.value;
}

function populateRouteSelect(selectEl, selectedCode) {
    if (!selectEl) {
        return;
    }

    const api = getCountryOptionsApi();
    const options = typeof api.getRouteOptions === 'function'
        ? api.getRouteOptions()
        : TRADE_COUNTRY_UI_FALLBACK_ROUTE_OPTIONS;
    const selected = api.normalizeCountryCode(selectedCode || selectEl.dataset.defaultCountry || options[0]?.value);

    selectEl.innerHTML = options
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
    selectEl.value = options.some((o) => o.value === selected) ? selected : options[0].value;
    selectEl.disabled = false;
    selectEl.removeAttribute('aria-disabled');
}

function applyRouteState(fromCountry, toCountry, focus) {
    const api = getCountryOptionsApi();
    const selectedFocus = focus === 'export' || focus === 'import' ? focus : '';
    const normalizedFrom = api.normalizeCountryCode(fromCountry || 'CN');
    const normalizedTo = api.normalizeCountryCode(toCountry || 'US');
    const route = selectedFocus && typeof api.getRouteContext === 'function'
        ? api.getRouteContext({ from: fromCountry, to: toCountry, focus })
        : {
            from: normalizedFrom,
            to: normalizedTo,
            focus: selectedFocus,
            direction: AppState.currentDirection || 'export',
            country: selectedFocus === 'export' ? normalizedFrom : normalizedTo
        };

    AppState.routeFromCountry = route.from;
    AppState.routeToCountry = route.to;
    AppState.complianceFocus = route.focus;
    AppState.currentDirection = route.direction;
    AppState.currentCountry = route.country;
    return route;
}

function refreshRouteControls(route) {
    const fromSelects = document.querySelectorAll('[data-route-country="from"]');
    const toSelects = document.querySelectorAll('[data-route-country="to"]');
    fromSelects.forEach((select) => populateRouteSelect(select, route?.from || AppState.routeFromCountry || 'CN'));
    toSelects.forEach((select) => populateRouteSelect(select, route?.to || AppState.routeToCountry || 'US'));

    const focus = route?.focus || AppState.complianceFocus || '';
    document.querySelectorAll('[data-compliance-focus]').forEach((button) => {
        button.classList.toggle(
            'active',
            Boolean(AppState.complianceFocusSelected && focus) && button.dataset.complianceFocus === focus
        );
    });
}

function clearUnselectedComplianceFocus() {
    if (AppState.complianceFocusSelected) {
        return;
    }
    document.querySelectorAll('[data-compliance-focus].active').forEach((button) => {
        button.classList.remove('active');
    });
}

function syncRouteControls(fromCountry, toCountry, focus) {
    const route = applyRouteState(
        fromCountry || AppState.routeFromCountry || 'CN',
        toCountry || AppState.routeToCountry || 'US',
        focus || AppState.complianceFocus || ''
    );
    refreshRouteControls(route);
    clearUnselectedComplianceFocus();
    return route;
}

function syncTradeCountrySelects(direction, selectedCode) {
    const tradeDirection = direction === 'import' ? 'import' : 'export';
    AppState.currentDirection = tradeDirection;
    const code = selectedCode || AppState.currentCountry;
    populateTradeCountrySelect(document.getElementById('trade-country'), tradeDirection, code);
    populateTradeCountrySelect(document.getElementById('trade-country-energy'), tradeDirection, code);
    populateTradeCountrySelect(document.getElementById('trade-country-semi'), tradeDirection, code);
}

function setTradeCountry(countryCode) {
    const api = getCountryOptionsApi();
    AppState.currentCountry = api.normalizeCountryCode(countryCode || 'US');
    const active = getActiveTradeCountrySelect();
    if (active) {
        active.value = AppState.currentCountry;
    }
    syncTradeCountrySelects(getActiveTradeDirection(), AppState.currentCountry);
}

function bindTradeCountryControls() {
    const onCountryChange = (event) => {
        setTradeCountry(event.target.value);
    };

    const electronicsSelect = document.getElementById('trade-country');
    const energySelect = document.getElementById('trade-country-energy');
    const semiSelect = document.getElementById('trade-country-semi');
    if (electronicsSelect) {
        electronicsSelect.addEventListener('change', onCountryChange);
    }
    if (energySelect) {
        energySelect.addEventListener('change', onCountryChange);
    }
    if (semiSelect) {
        semiSelect.addEventListener('change', onCountryChange);
    }

    const onRouteChange = () => {
        const from = getActiveRouteSelect('from')?.value || AppState.routeFromCountry || 'CN';
        const to = getActiveRouteSelect('to')?.value || AppState.routeToCountry || 'US';
        syncRouteControls(from, to, AppState.complianceFocus || '');
    };

    document.querySelectorAll('[data-route-country]').forEach((select) => {
        select.addEventListener('change', onRouteChange);
    });

    document.querySelectorAll('[data-compliance-focus]').forEach((button) => {
        button.addEventListener('click', () => {
            AppState.complianceFocusSelected = true;
            syncRouteControls(
                getActiveRouteSelect('from')?.value || AppState.routeFromCountry || 'CN',
                getActiveRouteSelect('to')?.value || AppState.routeToCountry || 'US',
                button.dataset.complianceFocus
            );
        });
    });
}

function initTradeCountryForDirection(direction, countryFromUrl) {
    syncTradeCountrySelects(direction, countryFromUrl);
}

function initRouteControls(fromCountry = 'CN', toCountry = 'US', focus = '') {
    return syncRouteControls(fromCountry, toCountry, focus);
}
