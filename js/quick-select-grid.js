/**
 * Tabbed Quick Select product matrix — Consumer / New Energy / Advanced Tech.
 */

const QUICK_SELECT_TRACKS = [
    {
        id: 'consumer',
        label: '📱 Consumer Electronics & Smart Hardware',
        shortLabel: 'Consumer Electronics',
        cards: [
            { icon: '📱', label: 'Smart Phone', hs_code: '8517.13', query_text: 'smartphone 5G cellular', description: 'Smartphone with cellular modem, touchscreen, Wi-Fi/Bluetooth, lithium battery, and encrypted storage for consumer mobile use.' },
            { icon: '🔊', label: 'Smart Speaker w/ WiFi', hs_code: '8518.22', query_text: 'smart speaker wifi', description: 'Smart speaker with integrated Wi-Fi, voice assistant microphone array, amplifier, and mains power supply for home audio.' },
            { icon: '🎧', label: 'TWS Earbuds w/ Charger', hs_code: '8518.30', query_text: 'earbuds bluetooth battery', description: 'True wireless stereo earbuds with Bluetooth, in-ear batteries, charging case, and USB charging dock.' },
            { icon: '⌚', label: 'Smart Watch', hs_code: '8517.62', query_text: 'smart watch bluetooth', description: 'Smartwatch with Bluetooth, heart-rate sensor, GPS, touchscreen, and rechargeable lithium battery.' },
            { icon: '🚗', label: 'Dash Camera', hs_code: '8525.89', query_text: 'dash cam wifi', description: 'Vehicle dash camera with Wi-Fi, GPS logging, loop recording, G-sensor, and microSD storage.' },
            { icon: '🥽', label: 'VR Headset', hs_code: '8528.52', query_text: 'vr headset wifi', description: 'Virtual reality headset with displays, IMU sensors, optional Wi-Fi/Bluetooth, and tethered or standalone compute module.' },
            { icon: '🖨️', label: '3D Printer', hs_code: '8485.20', query_text: '3d printer fdm', description: 'Desktop FDM 3D printer with heated bed, stepper motors, control board, and extruder for prototyping.' }
        ]
    },
    {
        id: 'energy',
        label: '☀️ New Energy & Clean Tech',
        shortLabel: 'New Energy',
        cards: [
            { icon: '☀️', label: 'Solar Panel', hs_code: '8541.43', query_text: 'solar panel photovoltaic', description: 'Crystalline silicon photovoltaic solar panel module for rooftop or utility-scale power generation.' },
            { icon: '🔄', label: 'Solar Inverter', hs_code: '8504.40', query_text: 'solar inverter grid-tie', description: 'Grid-tie solar PV inverter converting DC from panels to AC with MPPT and grid synchronization.' },
            { icon: '🔋', label: 'Energy Storage', hs_code: '8507.60', query_text: 'energy storage lithium battery', description: 'Lithium-ion battery energy storage system (BESS) with BMS, inverter interface, and enclosure for commercial or residential use.' },
            { icon: '🪫', label: 'Power Bank', hs_code: '8507.60', query_text: 'power bank battery', description: 'Portable lithium power bank with USB outputs for charging phones and tablets.' },
            { icon: '🛴', label: 'E-Scooter', hs_code: '8711.60', query_text: 'electric scooter battery', description: 'Electric kick scooter with lithium battery pack, hub motor, deck controller, and folding frame for personal mobility.' },
            { icon: '⚡', label: 'EV Charger', hs_code: '8504.40', query_text: 'ev charger ac wallbox', description: 'AC electric vehicle wallbox charger with Type 2 connector, smart metering, and Wi-Fi app control for home charging.' }
        ]
    },
    {
        id: 'advanced',
        label: '👁️ Advanced Tech & Computing',
        shortLabel: 'Advanced Tech',
        cards: [
            { icon: '💡', label: 'Optical Module', hs_code: '8517.70', query_text: 'optical transceiver module', description: 'High-speed optical transceiver module (e.g. QSFP/SFP) for data-center interconnect with laser and photodiode assembly.' },
            { icon: '⚡', label: 'GPU AI Chip Accelerator', hs_code: '8542.31', query_text: 'GPU AI accelerator chip', description: 'AI inference GPU/accelerator IC with high-bandwidth memory, PCIe interface, and data-center compute performance.' },
            { icon: '🚁', label: 'Drone under 2kg', hs_code: '8525.89', query_text: 'drone camera quadcopter', description: 'Consumer quadcopter drone under 2 kg with camera gimbal, GPS, radio control, and lithium battery.' },
            { icon: '🤖', label: 'Industrial Robot', hs_code: '8479.50', query_text: 'industrial robot arm', description: 'Six-axis industrial robotic arm with servo drives, controller cabinet, and end-effector for factory automation.' },
            { icon: '📷', label: 'IP Camera w/ Storage', hs_code: '8525.89', query_text: 'ip camera security', description: 'Network IP security camera with Wi-Fi/Ethernet, night vision, H.264 encoding, and onboard SD/NVR storage.' }
        ]
    }
];

function buildQuickSelectCardHtml(card) {
    return `
        <button type="button" class="quick-action-card quick-select-card" data-query="${escapeHtml(card.query_text)}" data-description="${escapeHtml(card.description || card.query_text)}" data-hs="${escapeHtml(card.hs_code)}" aria-label="${escapeHtml(card.label)}">
            <div class="quick-action-icon" aria-hidden="true">${escapeHtml(card.icon)}</div>
            <div class="quick-action-label">${escapeHtml(card.label)}</div>
            <div class="quick-action-hs">HS ${escapeHtml(card.hs_code)}</div>
        </button>
    `;
}

function renderQuickSelectGrid(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const defaultTrack = options.defaultTrack || 'consumer';
    const mode = options.mode || 'search';

    const tabsHtml = QUICK_SELECT_TRACKS.map((track, index) => `
        <button
            type="button"
            class="product-track-tab${track.id === defaultTrack ? ' is-active' : ''}"
            role="tab"
            aria-selected="${track.id === defaultTrack ? 'true' : 'false'}"
            aria-controls="quick-select-panel-${track.id}"
            id="quick-select-tab-${track.id}"
            data-track="${escapeHtml(track.id)}"
        >${escapeHtml(track.label)}</button>
    `).join('');

    const panelsHtml = QUICK_SELECT_TRACKS.map((track) => `
        <div
            class="quick-actions-grid product-track-panel${track.id === defaultTrack ? ' is-active' : ''}"
            id="quick-select-panel-${escapeHtml(track.id)}"
            role="tabpanel"
            aria-labelledby="quick-select-tab-${track.id}"
            data-track="${escapeHtml(track.id)}"
            ${track.id === defaultTrack ? '' : 'hidden'}
        >
            ${track.cards.map((card) => buildQuickSelectCardHtml(card)).join('')}
        </div>
    `).join('');

    container.innerHTML = `
        <div class="product-track-shell">
            <div class="product-track-header">
                <h2 class="product-track-title">Quick Select</h2>
                <p class="product-track-subtitle">Pick a product line to pre-fill your ${mode === 'hscode' ? 'classification' : 'compliance'} query</p>
            </div>
            <div class="product-track-tabs" role="tablist" aria-label="Product tracks">
                ${tabsHtml}
            </div>
            <div class="product-track-panels">
                ${panelsHtml}
            </div>
        </div>
    `;

    initQuickSelectGrid(containerId, options);
}

function switchQuickSelectTrack(container, trackId) {
    const tabs = container.querySelectorAll('.product-track-tab');
    const panels = container.querySelectorAll('.product-track-panel');

    tabs.forEach((tab) => {
        const active = tab.dataset.track === trackId;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panels.forEach((panel) => {
        const active = panel.dataset.track === trackId;
        if (active) {
            panel.hidden = false;
            panel.classList.remove('is-leaving');
            requestAnimationFrame(() => {
                panel.classList.add('is-active');
            });
        } else {
            panel.classList.remove('is-active');
            panel.classList.add('is-leaving');
            setTimeout(() => {
                if (!panel.classList.contains('is-active')) {
                    panel.hidden = true;
                    panel.classList.remove('is-leaving');
                }
            }, 220);
        }
    });
}

function initQuickSelectGrid(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const mode = options.mode || 'search';
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;

    container.querySelectorAll('.product-track-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            switchQuickSelectTrack(container, tab.dataset.track);
        });
    });

    container.querySelectorAll('.quick-select-card').forEach((card) => {
        card.addEventListener('click', () => {
            const query = card.dataset.query || '';
            const description = card.dataset.description || query;
            const hs = card.dataset.hs || '';

            if (onSelect) {
                onSelect({ query, description, hs_code: hs, label: card.querySelector('.quick-action-label')?.textContent || '' });
                return;
            }

            if (mode === 'hscode') {
                const textarea = document.getElementById('hscode-description');
                if (textarea) {
                    textarea.value = description;
                    textarea.dispatchEvent(new Event('input'));
                    textarea.focus();
                }
                return;
            }

            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = query;
            }
            if (typeof searchProducts === 'function') {
                searchProducts(query);
            }
        });
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.QUICK_SELECT_TRACKS = QUICK_SELECT_TRACKS;
    globalThis.renderQuickSelectGrid = renderQuickSelectGrid;
    globalThis.initQuickSelectGrid = initQuickSelectGrid;
}
