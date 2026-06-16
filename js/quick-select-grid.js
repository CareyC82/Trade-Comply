/**
 * Flat Quick Select grid — consumer electronics & smart mobility (9 cards).
 */

const ELECTRONICS_QUICK_SELECT_CARDS = [
    { icon: '📱', label: 'Smart Phone', hs_code: '8517.13', query_text: 'smartphone 5G cellular', description: 'Smartphone with cellular modem, touchscreen, Wi-Fi/Bluetooth, lithium battery, and encrypted storage for consumer mobile use.' },
    { icon: '💻', label: 'Tablet Computer', hs_code: '8471.30', query_text: 'tablet computer wifi', description: 'Tablet computer with touchscreen, Wi-Fi/Bluetooth, lithium battery, USB charging, and encrypted storage for consumer or business use.' },
    { icon: '🔊', label: 'Smart Speaker w/ WiFi', hs_code: '8518.22', query_text: 'smart speaker wifi', description: 'Smart speaker with integrated Wi-Fi, voice assistant microphone array, amplifier, and mains power supply for home audio.' },
    { icon: '🎧', label: 'TWS Earbuds', hs_code: '8518.30', query_text: 'earbuds bluetooth battery', description: 'True wireless stereo earbuds with Bluetooth, in-ear batteries, charging case, and USB charging dock.' },
    { icon: '⌚', label: 'Smart Watch', hs_code: '8517.62', query_text: 'smart watch bluetooth', description: 'Smartwatch with Bluetooth, heart-rate sensor, GPS, touchscreen, and rechargeable lithium battery.' },
    { icon: '🚗', label: 'Dash Camera', hs_code: '8525.89', query_text: 'dash cam wifi', description: 'Vehicle dash camera with Wi-Fi, GPS logging, loop recording, G-sensor, and microSD storage.' },
    { icon: '🥽', label: 'VR Headset', hs_code: '8528.52', query_text: 'vr headset wifi', description: 'Virtual reality headset with displays, IMU sensors, optional Wi-Fi/Bluetooth, and tethered or standalone compute module.' },
    { icon: '🖨️', label: '3D Printer', hs_code: '8485.20', query_text: '3d printer fdm', description: 'Desktop FDM 3D printer with heated bed, stepper motors, control board, and extruder for prototyping.' },
    { icon: '🛴', label: 'E-Scooter', hs_code: '8711.60', query_text: 'electric scooter battery', description: 'Electric kick scooter with lithium battery pack, hub motor, deck controller, and folding frame for personal mobility.' }
];

const NEW_ENERGY_QUICK_SELECT_CARDS = [
    { icon: '☀️', label: 'Solar Panel / PV Module', hs_code: '8541.43', query_text: 'solar panel photovoltaic', description: 'Crystalline silicon photovoltaic module with aluminum frame, junction box, and IEC-certified cells for rooftop or utility installation.' },
    { icon: '🔌', label: 'Solar Inverter', hs_code: '8504.40', query_text: 'solar inverter grid-tie', description: 'Grid-tie solar inverter with MPPT, AC output, anti-islanding protection, and smart monitoring for PV systems.' },
    { icon: '🔋', label: 'Energy Storage System', hs_code: '8507.60', query_text: 'energy storage battery system', description: 'Lithium-ion battery energy storage system with BMS, PCS interface, and enclosure for commercial or utility-scale deployment.' },
    { icon: '⚡', label: 'EV Charger', hs_code: '8504.40', query_text: 'ev charger ac wallbox', description: 'AC electric vehicle wallbox charger with Type 2 connector, smart metering, and Wi-Fi app control for home charging.' },
    { icon: '🏠', label: 'Home Energy Storage', hs_code: '8507.60', query_text: 'home energy storage powerwall', description: 'Residential battery storage unit with inverter integration, backup power, and app-based load management.' },
    { icon: '🏭', label: 'Commercial ESS', hs_code: '8507.60', query_text: 'commercial energy storage system', description: 'Containerized or rack-mounted commercial energy storage with fire suppression, thermal management, and grid services capability.' }
];

const SEMICONDUCTOR_HUB_QUICK_SELECT_CARDS = [
    { icon: '⚡', label: 'GPU AI Chip Accelerator', hs_code: '8542.31', query_text: 'gpu ai accelerator chip', description: 'High-performance GPU or AI accelerator IC with HBM memory, advanced packaging, and export-controlled compute thresholds.' },
    { icon: '🔌', label: 'Optical Module', hs_code: '8517.70', query_text: 'optical transceiver module', description: 'High-speed optical transceiver or interconnect module for data center, telecom, or silicon photonics links.' },
    { icon: '🛸', label: 'Drone under 2kg', hs_code: '8525.89', query_text: 'drone uav under 2kg', vertical: 'electronics', description: 'Consumer or commercial UAV under 2 kg with camera, GPS, wireless link, and lithium battery for aerial imaging.' },
    { icon: '🦾', label: 'Industrial Robot', hs_code: '8479.50', query_text: 'industrial robot arm', description: 'Programmable industrial robot arm with servo controllers, sensors, and safety-rated motion systems for manufacturing.' },
    { icon: '📹', label: 'IP Camera w/ Storage', hs_code: '8525.89', query_text: 'ip camera network storage', vertical: 'electronics', description: 'Network IP camera with onboard or edge storage, PoE, encryption, and video analytics for surveillance use.' }
];

const DATA_CENTER_QUICK_SELECT_CARDS = [
    { icon: '🖥️', label: 'AI Server', hs_code: '8471.50', query_text: 'ai server gpu server', description: 'Rack-mounted AI server or GPU server with accelerators, high-speed interconnect, redundant power supplies, and data-center deployment use.' },
    { icon: '📦', label: 'Edge AI Computer', hs_code: '8471.50', query_text: 'edge ai computer', description: 'Industrial or commercial edge AI computer with embedded accelerator, network ports, storage, and enclosure for local inference workloads.' },
    { icon: '🗄️', label: 'Storage Server / NAS', hs_code: '8471.70', query_text: 'storage server nas network storage', description: 'Network-attached storage or storage server with drive bays, RAID controller, network ports, and encryption or access-control functions.' },
    { icon: '🔀', label: 'Data Center Switch', hs_code: '8517.62', query_text: 'data center network switch', description: 'Rack-mounted data center Ethernet switch with high-speed ports, management firmware, encryption, and enterprise network use.' },
    { icon: '❄️', label: 'Liquid Cooling Unit', hs_code: '8419.50', query_text: 'data center liquid cooling unit', description: 'Liquid cooling distribution or heat-exchange unit for server racks and high-density computing equipment.' },
    { icon: '🔋', label: 'UPS / PDU', hs_code: '8504.40', query_text: 'data center ups pdu power distribution', description: 'Uninterruptible power supply or rack power distribution unit for data center equipment with monitoring and safety controls.' }
];

const INDUSTRIAL_AUTOMATION_QUICK_SELECT_CARDS = [
    { icon: '🦾', label: 'Industrial Robot Arm', hs_code: '8479.50', query_text: 'industrial robot arm', description: 'Programmable industrial robot arm with servo drives, controller cabinet, safety functions, and factory automation use.' },
    { icon: '🎛️', label: 'PLC Controller', hs_code: '8537.10', query_text: 'plc controller industrial automation', description: 'Programmable logic controller with I/O modules, industrial communication ports, and factory control software.' },
    { icon: '⚙️', label: 'Servo Motor / Drive', hs_code: '8501.52', query_text: 'servo motor drive industrial automation', description: 'Industrial servo motor and servo drive set for motion-control equipment, robotics, or CNC machinery.' },
    { icon: '👁️', label: 'Machine Vision System', hs_code: '8525.89', query_text: 'machine vision camera industrial inspection', description: 'Industrial machine-vision camera or inspection system with lighting, controller, and image-processing software.' },
    { icon: '🧰', label: 'CNC Controller', hs_code: '8537.10', query_text: 'cnc controller industrial control', description: 'CNC machine control unit with motion-control board, HMI, software, and industrial communication interfaces.' },
    { icon: '🌐', label: 'Factory Gateway', hs_code: '8517.62', query_text: 'industrial iot gateway factory automation', description: 'Industrial IoT gateway with Ethernet, cellular or Wi-Fi connectivity, protocol conversion, and secure remote access.' }
];

const HEALTHCARE_LAB_QUICK_SELECT_CARDS = [
    { icon: '🩺', label: 'Patient Monitor', hs_code: '9018.19', query_text: 'patient monitor medical electronics', description: 'Medical patient monitor with sensors, display, alarms, data ports, and hospital or clinic use.' },
    { icon: '🧪', label: 'Lab Analyzer', hs_code: '9027.80', query_text: 'laboratory analyzer electronic diagnostic device', description: 'Electronic laboratory analyzer or diagnostic instrument with optical, chemical, or sensor-based testing functions.' },
    { icon: '⌚', label: 'Wearable Health Device', hs_code: '9029.10', query_text: 'wearable health device bluetooth sensor', description: 'Wearable health device with biometric sensors, Bluetooth connectivity, rechargeable battery, and mobile app integration.' },
    { icon: '🌡️', label: 'Electronic Thermometer', hs_code: '9025.19', query_text: 'electronic thermometer medical device', description: 'Electronic thermometer or temperature measuring device for clinical, laboratory, or cold-chain monitoring use.' },
    { icon: '❄️', label: 'Cold-chain Logger', hs_code: '9025.80', query_text: 'cold chain temperature data logger', description: 'Temperature and humidity data logger with battery, sensor probe, memory, and wireless or USB data export.' },
    { icon: '🔌', label: 'Medical Power Supply', hs_code: '8504.40', query_text: 'medical power supply adapter', description: 'Medical-grade power supply or adapter for diagnostic, monitoring, or laboratory equipment with safety certification needs.' }
];

function buildQuickSelectCardHtml(card) {
    return `
        <button type="button" class="quick-action-card quick-select-card" data-query="${escapeHtml(card.query_text)}" data-description="${escapeHtml(card.description || card.query_text)}" data-hs="${escapeHtml(card.hs_code)}" data-vertical="${escapeHtml(card.vertical || '')}" aria-label="${escapeHtml(card.label)}">
            <div class="quick-action-icon" aria-hidden="true">${escapeHtml(card.icon)}</div>
            <div class="quick-action-label">${escapeHtml(card.label)}</div>
            <div class="quick-action-hs">${escapeHtml(card.hs_code)}</div>
        </button>
    `;
}

function renderQuickSelectGrid(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const mode = options.mode || 'search';
    const cards = options.cards
        || (options.vertical === 'new-energy'
            ? NEW_ENERGY_QUICK_SELECT_CARDS
            : options.vertical === 'semiconductor'
                ? SEMICONDUCTOR_HUB_QUICK_SELECT_CARDS
                : options.vertical === 'data-center'
                    ? DATA_CENTER_QUICK_SELECT_CARDS
                    : options.vertical === 'industrial-automation'
                        ? INDUSTRIAL_AUTOMATION_QUICK_SELECT_CARDS
                        : options.vertical === 'healthcare-lab'
                            ? HEALTHCARE_LAB_QUICK_SELECT_CARDS
                            : ELECTRONICS_QUICK_SELECT_CARDS);

    container.innerHTML = `
        <div class="quick-select-block">
            <h2 class="quick-select-heading">Quick Select</h2>
            <div class="quick-actions-grid quick-select-grid">
                ${cards.map((card) => buildQuickSelectCardHtml(card)).join('')}
            </div>
        </div>
    `;

    initQuickSelectGrid(containerId, options);
}

function initQuickSelectGrid(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    const mode = options.mode || 'search';
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
    const searchInputId = options.searchInputId
        || (options.vertical === 'new-energy'
            ? 'search-input-energy'
            : options.vertical === 'semiconductor'
                ? 'search-input-semi'
                : 'search-input');
    const searchHandler = options.searchHandler
        || (options.vertical === 'new-energy'
            ? 'searchEnergyProducts'
            : options.vertical === 'semiconductor'
                ? 'searchSemiconductorProducts'
                : 'searchProducts');

    container.querySelectorAll('.quick-select-card').forEach((card) => {
        card.addEventListener('click', () => {
            const query = card.dataset.query || '';
            const description = card.dataset.description || query;

            if (onSelect) {
                onSelect({
                    query,
                    description,
                    hs_code: card.dataset.hs || '',
                    vertical: card.dataset.vertical || '',
                    label: card.querySelector('.quick-action-label')?.textContent || ''
                });
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

            const searchInput = document.getElementById(searchInputId);
            if (searchInput) {
                searchInput.value = query;
            }
            const runSearch = globalThis[searchHandler];
            if (typeof runSearch === 'function') {
                runSearch(query);
            } else if (typeof searchProducts === 'function') {
                searchProducts(query);
            }
        });
    });
}

function renderNewEnergyQuickSelect() {
    renderQuickSelectGrid('energy-quick-actions-container', {
        vertical: 'new-energy',
        mode: 'search',
        searchInputId: 'search-input-energy',
        searchHandler: 'searchEnergyProducts'
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.ELECTRONICS_QUICK_SELECT_CARDS = ELECTRONICS_QUICK_SELECT_CARDS;
    globalThis.NEW_ENERGY_QUICK_SELECT_CARDS = NEW_ENERGY_QUICK_SELECT_CARDS;
    globalThis.SEMICONDUCTOR_HUB_QUICK_SELECT_CARDS = SEMICONDUCTOR_HUB_QUICK_SELECT_CARDS;
    globalThis.DATA_CENTER_QUICK_SELECT_CARDS = DATA_CENTER_QUICK_SELECT_CARDS;
    globalThis.INDUSTRIAL_AUTOMATION_QUICK_SELECT_CARDS = INDUSTRIAL_AUTOMATION_QUICK_SELECT_CARDS;
    globalThis.HEALTHCARE_LAB_QUICK_SELECT_CARDS = HEALTHCARE_LAB_QUICK_SELECT_CARDS;
    globalThis.renderQuickSelectGrid = renderQuickSelectGrid;
    globalThis.initQuickSelectGrid = initQuickSelectGrid;
    globalThis.renderNewEnergyQuickSelect = renderNewEnergyQuickSelect;
}
