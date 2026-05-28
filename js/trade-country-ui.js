/**
 * Trade country <select> UI — sync with direction and AppState.
 */
function getActiveTradeCountrySelect() {
    const electronics = document.getElementById('trade-country');
    const semi = document.getElementById('trade-country-semi');
    if (electronics && electronics.offsetParent !== null) {
        return electronics;
    }
    if (semi && semi.offsetParent !== null) {
        return semi;
    }
    return electronics || semi;
}

function populateTradeCountrySelect(selectEl, direction, selectedCode) {
    if (!selectEl) {
        return;
    }
    if (!globalThis.TradeComplyCountry) {
        return;
    }
    const { getCountryOptionsForDirection, normalizeCountryCode } = globalThis.TradeComplyCountry;
    const options = getCountryOptionsForDirection(direction);
    const selected = normalizeCountryCode(selectedCode || AppState.currentCountry || options[0]?.value);

    selectEl.innerHTML = options
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
    selectEl.value = options.some((o) => o.value === selected) ? selected : options[0].value;
    AppState.currentCountry = selectEl.value;
}

function syncTradeCountrySelects(direction, selectedCode) {
    const code = selectedCode || AppState.currentCountry;
    populateTradeCountrySelect(document.getElementById('trade-country'), direction, code);
    populateTradeCountrySelect(document.getElementById('trade-country-semi'), direction, code);
}

function setTradeCountry(countryCode) {
    if (!globalThis.TradeComplyCountry) {
        AppState.currentCountry = countryCode || 'US';
        return;
    }
    const { normalizeCountryCode } = globalThis.TradeComplyCountry;
    AppState.currentCountry = normalizeCountryCode(countryCode);
    const active = getActiveTradeCountrySelect();
    if (active) {
        active.value = AppState.currentCountry;
    }
}

function bindTradeCountryControls() {
    const onCountryChange = (event) => {
        setTradeCountry(event.target.value);
    };

    const electronicsSelect = document.getElementById('trade-country');
    const semiSelect = document.getElementById('trade-country-semi');
    if (electronicsSelect) {
        electronicsSelect.addEventListener('change', onCountryChange);
    }
    if (semiSelect) {
        semiSelect.addEventListener('change', onCountryChange);
    }
}

function initTradeCountryForDirection(direction, countryFromUrl) {
    syncTradeCountrySelects(direction, countryFromUrl);
}
