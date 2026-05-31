/**
 * Trade country <select> UI — sync with direction and AppState.
 */

const TRADE_COUNTRY_UI_FALLBACK_EXPORT_OPTIONS = [
    { value: 'US', label: 'United States' },
    { value: 'EU', label: 'European Union' },
    { value: 'ASEAN', label: 'ASEAN (Vietnam / Malaysia)' },
    { value: 'RU', label: 'Russia' },
    { value: 'GLOBAL', label: 'Other' }
];

const TRADE_COUNTRY_UI_FALLBACK_IMPORT_OPTIONS = [
    { value: 'TW', label: 'Taiwan (China)' },
    { value: 'JP', label: 'Japan' },
    { value: 'KR', label: 'South Korea' },
    { value: 'US', label: 'United States' },
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
        normalizeCountryCode(value) {
            const raw = String(value || 'US').trim();
            const map = {
                'United States': 'US',
                'European Union': 'EU',
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

function syncTradeCountrySelects(direction, selectedCode) {
    const code = selectedCode || AppState.currentCountry;
    populateTradeCountrySelect(document.getElementById('trade-country'), direction, code);
    populateTradeCountrySelect(document.getElementById('trade-country-energy'), direction, code);
    populateTradeCountrySelect(document.getElementById('trade-country-semi'), direction, code);
}

function setTradeCountry(countryCode) {
    const api = getCountryOptionsApi();
    AppState.currentCountry = api.normalizeCountryCode(countryCode || 'US');
    const active = getActiveTradeCountrySelect();
    if (active) {
        active.value = AppState.currentCountry;
    }
    syncTradeCountrySelects(AppState.currentDirection || 'export', AppState.currentCountry);
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
}

function initTradeCountryForDirection(direction, countryFromUrl) {
    syncTradeCountrySelects(direction, countryFromUrl);
}
