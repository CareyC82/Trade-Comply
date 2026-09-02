'use strict';

(function exposeCanISellIt(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.TradeComplyCanISellIt = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCanISellIt() {
    const UNKNOWN = 'unknown';
    const modelApi = typeof globalThis !== 'undefined' && globalThis.TradeComplyWearableModels
        ? globalThis.TradeComplyWearableModels
        : (typeof require === 'function' ? require('./wearable-product-models') : null);

    function normalizeBoolean(value) {
        if (value === true || value === 'yes') return true;
        if (value === false || value === 'no') return false;
        return UNKNOWN;
    }

    function detectProductType(text) {
        const normalized = String(text || '')
            .replace(/bluetooh|blutooth/gi, 'bluetooth')
            .replace(/wirless/gi, 'wireless')
            .replace(/keybord/gi, 'keyboard')
            .replace(/securty/gi, 'security')
            .replace(/projetor/gi, 'projector')
            .replace(/\btabelt|tablt\b/gi, 'tablet')
            .replace(/\bmircophone|microfone\b/gi, 'microphone')
            .replace(/\bspeeker\b/gi, 'speaker')
            .replace(/\brouther\b/gi, 'router')
            .replace(/\bdockingstation\b/gi, 'docking station');
        const ordered = [
            'kids_electronics', 'kids_gps_watch', 'power_bank', 'beauty_device',
            'e_reader', 'tablet', 'security_camera', 'wireless_microphone', 'bluetooth_speaker',
            'wifi_router', 'smart_plug', 'smart_light', 'wireless_keyboard', 'wireless_mouse',
            'gaming_controller', 'mini_projector', 'usb_hub', 'portable_fan', 'electric_shaver',
            'webcam', 'dash_camera', 'video_doorbell', 'baby_monitor', 'robot_vacuum',
            'smart_ring', 'fitness_tracker', 'earbuds', 'smart_glasses', 'smart_watch', 'charger'
        ];
        const match = ordered.find((id) => modelApi?.products?.[id]?.match?.test(normalized));
        if (match) return match;
        return 'wearable_other';
    }

    function detectOutsideCategory(text = '') {
        const value = String(text || '');
        const categories = [
            { id: 'apparel', label: 'clothing and apparel', pattern: /\b(dress|shirt|blouse|trousers?|pants|skirt|jacket|coat|sweater|apparel|garment|textile clothing)\b/i },
            { id: 'cosmetics', label: 'cosmetics and personal-care formulations', pattern: /\b(lipstick|lip gloss|nail polish|mascara|foundation|makeup|cosmetic cream|skin cream|perfume)\b/i },
            { id: 'non_electronic_toy', label: 'non-electronic toys', pattern: /\b(doll|plush toy|stuffed toy|building blocks?|wooden toy|board game)\b/i }
        ];
        return categories.find((item) => item.pattern.test(value)) || null;
    }

    function coverageForProfile(profile, description = '') {
        const outsideCategory = detectOutsideCategory(description);
        if (outsideCategory) return {
            code: 'outside_initial_scope',
            supported: false,
            category: outsideCategory.id,
            label: 'Outside current initial coverage',
            detail: `This appears to be ${outsideCategory.label}, which is outside the current electronics and smart-device models. TraceWize cannot provide a sellability conclusion for it yet.`
        };
        const supported = profile.productType !== 'wearable_other';
        return supported ? {
            code: 'initial_supported',
            supported: true,
            label: 'Initial coverage available',
            detail: 'This product fits the current consumer-electronics, smart-device, wireless or battery scope.'
        } : {
            code: 'outside_initial_scope',
            supported: false,
            label: 'Outside current initial coverage',
            detail: 'TraceWize could not match this product to the current electronics and smart-device models. Use this only as a question checklist, not a sellability conclusion.'
        };
    }

    const batchOneProducts = new Set([
        'bluetooth_speaker', 'wireless_microphone', 'security_camera', 'wifi_router', 'smart_plug',
        'smart_light', 'wireless_keyboard', 'wireless_mouse', 'gaming_controller', 'mini_projector',
        'usb_hub', 'tablet', 'e_reader', 'portable_fan', 'electric_shaver',
        'webcam', 'dash_camera', 'video_doorbell', 'baby_monitor', 'robot_vacuum'
    ]);

    const productGuidance = {
        bluetooth_speaker: { risk: 'Radio approval and lithium-battery shipping depend on the exact speaker and battery configuration.', supplier: 'Ask for radio reports, battery transport evidence and the exact model label.' },
        wireless_microphone: { risk: 'The transmitter frequency and receiver set determine the radio-approval path.', supplier: 'Ask for the operating bands, transmitter/receiver model list, radio reports and battery evidence.' },
        security_camera: { risk: 'Wireless approval, electrical safety and recording/privacy disclosures must match the camera configuration.', supplier: 'Ask for radio and safety reports, recording-feature disclosures, update policy and exact-model labels.' },
        wifi_router: { risk: 'Every enabled Wi-Fi or cellular band, antenna and power adapter must be within the approved configuration.', supplier: 'Ask for radio grants/reports, antenna list, power-adapter evidence, security-update policy and labels.' },
        smart_plug: { risk: 'Mains switching safety and the radio module are the main market-access gates.', supplier: 'Ask for electrical safety and radio reports, rated voltage/current, plug drawings and label artwork.' },
        smart_light: { risk: 'The radio module, LED power supply and mains configuration determine the approval package.', supplier: 'Ask for radio and electrical safety reports, power specifications and label artwork.' },
        wireless_keyboard: { risk: 'Bluetooth or proprietary 2.4 GHz radio and any rechargeable battery require exact-model evidence.', supplier: 'Ask for transmitter/receiver radio reports, battery details and the exact model label.' },
        wireless_mouse: { risk: 'Bluetooth or proprietary 2.4 GHz radio and any rechargeable battery require exact-model evidence.', supplier: 'Ask for transmitter/receiver radio reports, battery details and the exact model label.' },
        gaming_controller: { risk: 'Wireless mode, battery configuration and intended console/computer use change the checks.', supplier: 'Ask for radio reports, battery transport evidence, compatibility claims and exact-model labels.' },
        mini_projector: { risk: 'Wireless features, internal battery and AC adapter each add a separate approval or shipping check.', supplier: 'Ask for display/product specifications, radio reports, battery evidence and power-adapter safety files.' },
        usb_hub: { risk: 'A passive wired hub is simpler; networking, wireless or external AC power adds further controls.', supplier: 'Ask for port/function specifications, power-delivery ratings and any radio or external-power safety evidence.' },
        tablet: { risk: 'Wi-Fi, Bluetooth, optional cellular radio and the lithium battery must all match the sold model.', supplier: 'Ask for radio grants/reports, RF exposure evidence, UN38.3 summary, battery specification and labels.' },
        e_reader: { risk: 'Wi-Fi, optional cellular service and the lithium battery determine the main approval and shipping gates.', supplier: 'Ask for radio reports, battery transport evidence, display/model specifications and labels.' },
        portable_fan: { risk: 'Rechargeable battery and direct mains use determine whether transport and electrical checks apply.', supplier: 'Ask for motor/power specifications, battery evidence and any mains-adapter safety report.' },
        electric_shaver: { risk: 'Rechargeable battery, wet-use design and mains charging configuration determine the safety evidence.', supplier: 'Ask for electrical safety reports, battery evidence, ingress/wet-use claims and exact-model labels.' },
        webcam: { risk: 'A USB-only webcam is simpler; Wi-Fi or another transmitter adds radio approval, while every model needs recording and privacy review.', supplier: 'Ask for the interface and radio specification, camera/microphone disclosure, security-update policy and exact-model labels.' },
        dash_camera: { risk: 'Recording, Wi-Fi, GPS and battery configuration determine the privacy, radio and shipping checks.', supplier: 'Ask for the recording and connectivity specification, radio reports, battery evidence, update policy and exact-model labels.' },
        video_doorbell: { risk: 'Wireless video, two-way audio, battery and any mains transformer each add a distinct approval or evidence check.', supplier: 'Ask for radio and electrical reports, battery transport evidence, recording disclosure, update policy and exact-model labels.' },
        baby_monitor: { risk: 'Child-directed audio or video monitoring requires specialist privacy and product-safety review in addition to radio approval.', supplier: 'Ask for radio reports, child-safety evidence, recording and data-flow disclosures, security-update policy and exact-model labels.' },
        robot_vacuum: { risk: 'The charging dock, lithium battery, wireless mapping and any camera determine the safety, transport, radio and privacy checks.', supplier: 'Ask for radio and electrical reports, UN38.3 evidence, sensor/camera specification, update policy and exact-model labels.' }
    };

    function guidanceForProduct(productType) {
        return productGuidance[productType] || {
            risk: 'Confirm the exact model, enabled functions, power source and intended claims before relying on this result.',
            supplier: 'Ask for every exact-model document listed in the supplier request.'
        };
    }

    function summarizeSourceFreshness(requirements, now = Date.now()) {
        const sources = requirements.flatMap((item) => item.sources || [])
            .filter((source, index, rows) => rows.findIndex((row) => row.url === source.url) === index);
        const reviewed = sources.map((source) => ({ ...source, timestamp: Date.parse(source.reviewedAt || '') }))
            .filter((source) => Number.isFinite(source.timestamp));
        const stale = reviewed.filter((source) => now - source.timestamp > 365 * 24 * 60 * 60 * 1000);
        const missing = sources.filter((source) => !source.reviewedAt || !source.confidence);
        const degraded = sources.filter((source) => source.monitorStatus === 'last_good_degraded');
        const future = sources.filter((source) => source.lifecycleState === 'future' || source.lifecycle?.status === 'future');
        const pendingEffectiveDate = sources.filter((source) => source.lifecycleState === 'published_pending_effective_date' || source.lifecycle?.status === 'published_pending_effective_date');
        return {
            status: degraded.length ? 'using_last_good' : missing.length ? 'review_metadata_missing' : stale.length ? 'review_overdue' : sources.length ? 'current' : 'no_linked_source',
            sourceCount: sources.length,
            staleCount: stale.length,
            degradedCount: degraded.length,
            futureCount: future.length,
            pendingEffectiveDateCount: pendingEffectiveDate.length,
            lastGoodThrough: degraded.map((source) => source.lastGoodAt).filter(Boolean).sort().at(-1) || null,
            reviewedThrough: reviewed.length ? new Date(Math.max(...reviewed.map((source) => source.timestamp))).toISOString().slice(0, 10) : null,
            confidenceLevels: Array.from(new Set(sources.map((source) => source.confidence).filter(Boolean)))
        };
    }

    function marketCoverageForProfile(market, profile, supported, requirements = []) {
        if (!supported) return { level: 'unsupported', label: 'Not in maintained coverage', detail: 'No market-access conclusion is provided for this product.' };
        if (['US', 'EU', 'AU', 'NZ'].includes(market)) return {
            level: 'deep',
            label: `Maintained product coverage${market === 'AU' ? ' for Australia' : market === 'NZ' ? ' for New Zealand' : ''}`,
            detail: market === 'AU' || market === 'NZ'
                ? 'A dedicated official-linked electronics framework is applied. Product classification, local supplier responsibility and exact-model evidence still require confirmation.'
                : 'Product and attribute rules are maintained for this market.'
        };
        if ((market === 'JP' || market === 'SG') && batchOneProducts.has(profile.productType)) {
            const localPrefix = market === 'JP' ? 'jp_' : 'sg_';
            const localRequirements = requirements.filter((item) => item.id.startsWith(localPrefix));
            const unsupportedRequirements = requirements.filter((item) =>
                item.id !== 'classification' && item.id !== 'battery' && !(item.sources || []).length
            );
            if (localRequirements.length && !unsupportedRequirements.length) {
                return {
                    level: 'deep',
                    label: `Maintained product coverage for ${market === 'JP' ? 'Japan' : 'Singapore'}`,
                    detail: 'The known radio, electrical-safety, battery and recording/privacy attributes are linked to maintained official sources. Exact-model scope and local importer evidence must still be verified.'
                };
            }
            return {
                level: 'limited',
                label: `Limited maintained coverage for this product in ${market === 'JP' ? 'Japan' : 'Singapore'}`,
                detail: 'Only the existing reliable radio, electrical-safety and battery rules are applied. Confirm product-specific local scope with the authority, importer or a specialist.'
            };
        }
        return { level: 'deep', label: 'Maintained product coverage', detail: 'Existing product and attribute rules are maintained for this market.' };
    }

    function extractProfile(description) {
        const text = String(description || '').trim();
        const excludedInWithoutList = (term) => new RegExp(`\\bwithout\\b[^.;]{0,80}\\b(?:${term})\\b`, 'i').test(text);
        const detect = (positive, negative) => {
            if (negative && negative.test(text)) return false;
            return positive.test(text) ? true : UNKNOWN;
        };
        const voltageRangeMatch = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*[-–]\s*(\d{2,3}(?:\.\d+)?)\s*v(?:ac|~)?\b/i);
        const voltageMatch = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*v(?:ac|~)?\b/i);
        const powerMatch = text.match(/\b(\d{1,4}(?:\.\d+)?)\s*w(?:atts?)?\b/i);
        return {
            productType: detectProductType(text),
            bluetooth: excludedInWithoutList('bluetooth|ble') ? false : detect(/\bbluetooth\b|\bble\b/i, /\b(no|without)\s+bluetooth\b|\b(no\s+wireless|wired[- ]only)\b/i),
            wifi: excludedInWithoutList('wi-?fi') ? false : detect(/\bwi-?fi\b/i, /\b(no|without)\s+wi-?fi\b|\b(no\s+wireless|wired[- ]only)\b/i),
            cellular: excludedInWithoutList('4g|5g|lte|cellular|e-?sim|sim') ? false : detect(/\b(4g|5g|lte|cellular|e-?sim)\b/i, /no\s+(cellular|sim)/i),
            radioTransmitter: excludedInWithoutList('radio|wireless|rf|transmitter') ? false : detect(/\b(2\.4\s*ghz|5\.8\s*ghz|uhf|rf\s+transmitter|radio\s+transmitter|wireless\s+dongle)\b/i, /\b(no|without)\s+(radio|wireless|rf|transmitter)\b|\bwired[- ]only\b/i),
            battery: excludedInWithoutList('battery|batteries|rechargeable|lithium') ? false : detect(/\b(battery|rechargeable|mah|lithium)\b/i, /\b(no|without)\s+(rechargeable\s+)?batter(?:y|ies)\b/i),
            coinBattery: excludedInWithoutList('button battery|coin battery|button cell|coin cell') ? false : detect(/\b(?:button|coin)\s+(?:cell|battery)\b/i, /\b(?:no|without)\s+(?:button|coin)\s+(?:cell|battery)\b/i),
            healthMonitoring: detect(/\b(heart|ecg|spo2|oxygen|sleep|health|blood pressure|glucose)\b/i),
            medicalClaim: detect(/\b(diagnos|treat|prevent|medical grade|clinical|detect disease)\w*/i, /\bno\s+medical\s+claims?\b/i),
            childUse: detect(/\b(child|children|kid|minor)\w*/i, /\b(?:not|isn['’]?t)\s+(?:designed|intended|marketed)?\s*(?:for|to)?\s*(?:children|kids|minors)\b|\b(?:no|without)\s+(?:child|children|kid|minor)(?:ren)?\s*(?:use|marketing|audience)?\b|\b(?:adult|general)\s+audience\b/i),
            cameraMic: detect(/\b(camera|microphone|voice record)\w*/i, /no\s+(camera|microphone)/i),
            gps: detect(/\bgps\b|\blocation\s+track/i, /no\s+gps/i),
            display: detect(/\b(display|screen|oled|lcd|ar)\b/i, /no\s+(display|screen)/i),
            wirelessCharging: detect(/\b(wireless|qi)\s+charg/i, /no\s+wireless\s+charg/i),
            noiseCancellation: detect(/\b(anc|noise\s+cancell)/i, /no\s+(anc|noise\s+cancell)/i)
            ,
            mainsPowered: detect(/\b(ac input|direct(?:ly)?\s+(?:to\s+)?mains|mains[- ]powered|wall plug|built-in ac|\d{2,3}\s*v(?:ac|~)?)\b/i, /battery only|usb only|no\s+(mains|ac input)|(?:external|bundled|included)[^,.;]{0,35}(?:adapt(?:e|o)r|wall charger)/i),
            bundledAdapter: detect(/\b(?:(?:power|ac|usb(?:-c)?)\s+adapt(?:e|o)r|wall charger)(?:\s+\d{1,3}\s*w)?\s*(?:is\s+)?(?:included|bundled|supplied)|\bwith\s+(?:an?\s+)?(?:\d{1,3}\s*w\s+)?(?:power|ac|usb(?:-c)?)\s+adapt(?:e|o)r\b|\b(?:included|bundled|supplied)[^,.;]{0,35}(?:adapt(?:e|o)r|wall charger)/i, /\b(no|without)\s+(?:(?:power|ac|usb(?:-c)?)\s+adapt(?:e|o)r|wall charger)\b/i),
            ratedVoltage: voltageRangeMatch ? Number(voltageRangeMatch[2]) : voltageMatch ? Number(voltageMatch[1]) : UNKNOWN,
            ratedPower: powerMatch ? Number(powerMatch[1]) : UNKNOWN
        };
    }

    function mergeProfile(detected, supplied) {
        const result = { ...detected };
        Object.entries(supplied || {}).forEach(([key, value]) => {
            if (key === 'productType') result[key] = value;
            else if (['ratedVoltage', 'ratedPower'].includes(key)) result[key] = value === '' || value === null || value === undefined || value === UNKNOWN ? UNKNOWN : Number(value);
            else result[key] = normalizeBoolean(value);
        });
        return result;
    }

    function questionFor(key) {
        return {
            bluetooth: 'Does it use Bluetooth?',
            wifi: 'Does it connect to Wi-Fi?',
            cellular: 'Does it contain cellular / eSIM connectivity?',
            radioTransmitter: 'Does it use another radio transmitter, such as a 2.4 GHz dongle or UHF link?',
            battery: 'Does it contain a rechargeable lithium battery?',
            coinBattery: 'Does it contain a button or coin battery?',
            healthMonitoring: 'Does it monitor health or biometric data?',
            medicalClaim: 'Will the listing claim to diagnose, treat, or prevent a condition?',
            childUse: 'Is it designed or marketed for children?',
            cameraMic: 'Does it include a camera or microphone?',
            gps: 'Does it include GPS or location tracking?',
            display: 'Does it include a screen or projected display?',
            wirelessCharging: 'Does it support wireless charging?',
            noiseCancellation: 'Does it include active noise cancellation?'
            ,
            mainsPowered: 'Does it connect directly to AC mains power?'
            , bundledAdapter: 'Is an AC power adaptor included with the product?'
            , ratedVoltage: 'What is the rated AC input voltage?'
            , ratedPower: 'What is the rated input power in watts?'
        }[key];
    }

    function materialQuestionKeys(productType) {
        const shared = ['bluetooth', 'wifi', 'cellular', 'battery', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic'];
        const product = modelApi.getProduct(productType);
        const exclusions = {
            earbuds: ['cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display'],
            smart_ring: ['childUse', 'cameraMic', 'noiseCancellation', 'display'],
            fitness_tracker: ['cameraMic', 'noiseCancellation', 'wirelessCharging'],
            kids_gps_watch: ['noiseCancellation', 'wirelessCharging'],
            smart_glasses: ['healthMonitoring', 'medicalClaim', 'childUse', 'noiseCancellation'],
            smart_watch: ['noiseCancellation']
            ,
            charger: ['cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display', 'wirelessCharging', 'noiseCancellation'],
            power_bank: ['cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'noiseCancellation', 'mainsPowered'],
            beauty_device: ['cellular', 'childUse', 'cameraMic', 'gps', 'display', 'noiseCancellation'],
            kids_electronics: ['healthMonitoring', 'medicalClaim', 'noiseCancellation', 'mainsPowered']
            ,
            bluetooth_speaker: ['wifi', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic'],
            wireless_microphone: ['wifi', 'cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display', 'mainsPowered'],
            security_camera: ['bluetooth', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display'],
            wifi_router: ['bluetooth', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display'],
            smart_plug: ['cellular', 'radioTransmitter', 'battery', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display'],
            smart_light: ['cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display'],
            wireless_keyboard: ['wifi', 'cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display', 'mainsPowered'],
            wireless_mouse: ['wifi', 'cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display', 'mainsPowered'],
            gaming_controller: ['wifi', 'cellular', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display', 'mainsPowered'],
            mini_projector: ['bluetooth', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps'],
            usb_hub: ['bluetooth', 'wifi', 'cellular', 'battery', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display'],
            tablet: ['radioTransmitter', 'healthMonitoring', 'medicalClaim', 'cameraMic', 'gps', 'display', 'mainsPowered'],
            e_reader: ['bluetooth', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'cameraMic', 'gps', 'display', 'mainsPowered'],
            portable_fan: ['bluetooth', 'wifi', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'cameraMic', 'gps', 'display'],
            electric_shaver: ['bluetooth', 'wifi', 'cellular', 'radioTransmitter', 'healthMonitoring', 'childUse', 'cameraMic', 'gps', 'display'],
            webcam: ['bluetooth', 'cellular', 'battery', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display', 'wirelessCharging', 'noiseCancellation', 'mainsPowered'],
            dash_camera: ['bluetooth', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'display', 'wirelessCharging', 'noiseCancellation', 'mainsPowered'],
            video_doorbell: ['bluetooth', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display', 'wirelessCharging', 'noiseCancellation'],
            baby_monitor: ['bluetooth', 'cellular', 'battery', 'healthMonitoring', 'medicalClaim', 'gps', 'display', 'wirelessCharging', 'noiseCancellation', 'mainsPowered'],
            robot_vacuum: ['bluetooth', 'cellular', 'radioTransmitter', 'healthMonitoring', 'medicalClaim', 'childUse', 'gps', 'display', 'wirelessCharging', 'noiseCancellation']
        }[productType] || [];
        const scopeKeys = modelApi.marketScopeMappings?.JP?.[productType] || modelApi.marketScopeMappings?.SG?.[productType]
            || modelApi.marketScopeMappings?.AU?.[productType] || modelApi.marketScopeMappings?.NZ?.[productType]
            ? ['mainsPowered', 'bundledAdapter', 'ratedVoltage', 'ratedPower'] : [];
        return Array.from(new Set([...shared, ...(product.priorityQuestions || []), ...scopeKeys]))
            .filter((key) => !exclusions.includes(key));
    }

    function getFollowUpQuestions(profile) {
        return materialQuestionKeys(profile.productType)
            .filter((key) => profile[key] === UNKNOWN)
            .map((key) => ({ key, label: questionFor(key) }));
    }

    function requirement(id, title, reason, docs, severity = 'required', sourceIds = []) {
        const scopeChecks = new Set(['fcc_unintentional', 'jp_pse', 'jp_product_safety', 'sg_safety', 'sg_general_safety', 'au_eess', 'au_product_safety', 'nz_electrical', 'nz_product_safety']);
        const requirementClass = severity === 'advisory' ? 'advisory'
            : severity === 'future' ? 'future'
                : scopeChecks.has(id) ? 'scope_check' : 'mandatory';
        const jurisdiction = id.startsWith('au_') ? 'AU' : id.startsWith('nz_') ? 'NZ' : id === 'battery' ? 'GLOBAL' : null;
        const framework = id.startsWith('au_') ? (id === 'au_eess' ? 'EESS' : id === 'au_product_safety' || id === 'au_button_battery' ? 'ACCC Product Safety' : 'ACMA / RCM')
            : id.startsWith('nz_') ? (id === 'nz_electrical' ? 'WorkSafe electrical safety' : id === 'nz_product_safety' ? 'New Zealand product safety' : 'RSM / RCM / R-NZ')
                : null;
        return {
            id, title, reason, docs, severity, requirementClass,
            jurisdiction,
            framework,
            transferability: jurisdiction === 'AU' || jurisdiction === 'NZ' ? 'jurisdiction_specific' : 'reusable_with_conditions',
            coverageLevel: severity === 'advisory' ? 'preliminary_applicability_signal'
                : severity === 'high' ? 'monitor_professional_confirmation_required'
                    : scopeChecks.has(id) ? 'official_linked_baseline' : 'official_exact_requirement',
            sources: sourceIds.map((sourceId) => ({ id: sourceId, ...modelApi.sources[sourceId] })).filter((item) => item.url)
        };
    }

    const evidenceQuestionDefinitions = {
        fcc_unintentional: [
            { key: 'fccSdocEvidence', label: 'FCC Part 15B / SDoC evidence for this exact digital model', docs: ['FCC Part 15B test report', 'Supplier’s Declaration of Conformity / responsible-party record'], kinds: ['FCC'] }
        ],
        fcc: [
            { key: 'fccGrant', label: 'Valid FCC ID / Grant for this exact model', docs: ['FCC ID / grant'], kinds: ['FCC'] },
            { key: 'rfExposure', label: 'RF exposure / SAR evidence for this exact model', docs: ['RF exposure / SAR evidence'], kinds: ['FCC'] }
        ],
        red: [
            { key: 'redEvidence', label: 'EU RED reports and Declaration of Conformity for this exact model', docs: ['EU Declaration of Conformity', 'RED test reports'], kinds: ['CE / RED'] }
        ],
        red_cybersecurity: [
            { key: 'redCyberEvidence', label: 'EU RED cybersecurity assessment for this exact connected model', docs: ['RED cybersecurity assessment / test evidence', 'Security-update policy'], kinds: ['CE / RED'] }
        ],
        rohs: [
            { key: 'rohsEvidence', label: 'RoHS report and REACH declaration for this exact model', docs: ['RoHS report', 'REACH/SVHC declaration'], kinds: ['RoHS'] }
        ],
        gpsr: [
            { key: 'euResponsiblePerson', label: 'EU responsible-person and traceability details are ready', docs: ['EU responsible-person details', 'Traceability / label artwork'], kinds: [] }
        ],
        jp_radio: [
            { key: 'jpRadioEvidence', label: 'Japan radio certificate for this exact model', docs: ['Japan radio certificate'], kinds: ['Japan Radio'] }
        ],
        jp_pse: [
            { key: 'jpPseEvidence', label: 'Applicable Japan PSE evidence for this exact model', docs: ['PSE scope rationale', 'Conformity/test evidence'], kinds: ['PSE'] }
        ],
        jp_product_safety: [
            { key: 'jpProductSafetyEvidence', label: 'Japan product-safety scope and exact-model safety evidence', docs: ['Japan product-safety scope rationale', 'Applicable product safety test report'], kinds: [] }
        ],
        sg_imda: [
            { key: 'sgImdaEvidence', label: 'Singapore IMDA registration / SDoC for this exact model', docs: ['IMDA registration / SDoC'], kinds: ['IMDA'] }
        ],
        sg_safety: [
            { key: 'sgSafetyEvidence', label: 'Applicable Singapore SAFETY Mark evidence for this exact model', docs: ['CPSR registration', 'SAFETY Mark artwork'], kinds: ['SAFETY Mark'] }
        ],
        sg_general_safety: [
            { key: 'sgGeneralSafetyEvidence', label: 'Singapore CGSR safety evidence for this exact model', docs: ['CGSR scope rationale', 'Applicable IEC / ISO / EN / ASTM safety report'], kinds: [] }
        ],
        au_emc: [
            { key: 'auEmcEvidence', label: 'Australian ACMA EMC evidence for this exact model', docs: ['ACMA EMC applicability rationale', 'EMC test report'], kinds: ['ACMA / RCM'] }
        ],
        au_radio: [
            { key: 'auRadioEvidence', label: 'Australian radio and EME evidence covers every enabled transmitter', docs: ['Radio test reports', 'EME / RF exposure evidence'], kinds: ['ACMA / RCM'] }
        ],
        au_rcm: [
            { key: 'auRcmEvidence', label: 'Australian responsible supplier, compliance records and RCM are ready', docs: ['Australian responsible-supplier registration', 'Compliance-folder index', 'RCM label artwork'], kinds: ['ACMA / RCM'] }
        ],
        au_eess: [
            { key: 'auEessEvidence', label: 'EESS classification and electrical evidence covers the host and adaptor separately', docs: ['EESS risk-level and declared-article rationale', 'Electrical safety test report / certificate'], kinds: ['EESS / Electrical Safety'] }
        ],
        nz_emc: [
            { key: 'nzEmcEvidence', label: 'New Zealand EMC conformity level and evidence are confirmed', docs: ['RSM EMC conformity-level rationale', 'EMC test evidence'], kinds: ['RSM / RCM / R-NZ'] }
        ],
        nz_radio: [
            { key: 'nzRadioEvidence', label: 'New Zealand radio conformity level covers every transmitter', docs: ['Radio conformity-level rationale', 'Radio test reports'], kinds: ['RSM / RCM / R-NZ'] }
        ],
        nz_sdoc_label: [
            { key: 'nzSdocEvidence', label: 'New Zealand SDoC and RCM / R-NZ label cover this exact model', docs: ['Signed New Zealand SDoC', 'RCM or R-NZ label artwork'], kinds: ['NZ SDoC', 'RSM / RCM / R-NZ'] }
        ],
        nz_electrical: [
            { key: 'nzElectricalEvidence', label: 'New Zealand electrical classification and evidence cover host, battery and adaptor', docs: ['WorkSafe product and risk-classification rationale', 'Electrical safety report / certificate'], kinds: ['Electrical Safety'] }
        ],
        us_electrical: [
            { key: 'usElectricalEvidence', label: 'Electrical safety report or certification for this exact mains-powered model', docs: ['Electrical safety test report / certification'], kinds: ['Electrical Safety'] }
        ],
        eu_electrical: [
            { key: 'euElectricalEvidence', label: 'EU electrical safety evidence and Declaration of Conformity for this exact model', docs: ['EU electrical safety report', 'EU Declaration of Conformity'], kinds: ['Electrical Safety'] }
        ],
        battery: [
            { key: 'batteryTransport', label: 'UN38.3 test summary matching the battery and exact model', docs: ['UN38.3 test summary'], kinds: ['UN38.3'] }
        ]
    };

    function evidenceQuestionsForRequirements(requirements) {
        return requirements.flatMap((item) => (evidenceQuestionDefinitions[item.id] || [])
            .map((question) => ({ ...question, requirementId: item.id })));
    }

    function platformEvidenceQuestions(platform, profile) {
        if (platform === 'Amazon') {
            return [
                {
                    key: 'amazonListingApproval',
                    label: 'Amazon category / ASIN compliance review approved for this exact product',
                    docs: ['Amazon category / ASIN approval evidence'],
                    kinds: [], scope: 'platform'
                },
                profile.battery === true ? {
                    key: 'amazonDangerousGoods',
                    label: 'Amazon / FBA battery and dangerous-goods review accepted',
                    docs: ['Amazon / FBA dangerous-goods acceptance'],
                    kinds: [], scope: 'platform'
                } : null
            ].filter(Boolean);
        }
        if (platform === 'TikTok Shop') {
            return [
                {
                    key: 'tiktokElectronicsQualification',
                    label: 'TikTok Shop electronics category qualification approved for this exact product',
                    docs: ['TikTok Shop electronics qualification evidence'],
                    kinds: [], scope: 'platform'
                },
                profile.battery === true ? {
                    key: 'tiktokBatteryDeclaration',
                    label: 'TikTok Shop battery declaration submitted and accepted',
                    docs: ['TikTok Shop battery declaration acceptance'],
                    kinds: [], scope: 'platform'
                } : null
            ].filter(Boolean);
        }
        return [];
    }

    function buildAssessmentMatrix(markets = ['US', 'EU', 'JP', 'SG', 'AU', 'NZ']) {
        return modelApi.listProducts()
            .filter((product) => product.id !== 'wearable_other')
            .flatMap((product) => markets.map((market) => {
                const profile = { productType: product.id, ...(product.defaults || {}) };
                const requirements = marketRequirements(market, profile);
                return {
                    productType: product.id,
                    productLabel: product.label,
                    market,
                    productQuestions: materialQuestionKeys(product.id),
                    requirementIds: requirements.map((item) => item.id),
                    evidenceQuestions: evidenceQuestionsForRequirements(requirements)
                };
            }));
    }

    function marketRequirements(market, profile) {
        const classificationSources = market === 'AU' ? ['auAbfTariff', 'auAbfGst']
            : market === 'NZ' ? ['nzCustomsTariff', 'nzCustomsGst'] : [];
        const requirements = [
            requirement('classification', 'Confirm the exact customs classification', 'The final duty and filing treatment depend on the product’s principal function and exact tariff line.', ['Product specification', 'Function statement', 'Candidate HS code'], 'required', classificationSources)
        ];
        const hasRadio = profile.bluetooth === true || profile.wifi === true || profile.cellular === true || profile.radioTransmitter === true;
        const privacySourceIds = market === 'US' ? ['ftcIot']
            : market === 'EU' ? ['gdpr']
                : market === 'JP' ? ['jpPrivacy']
                    : market === 'SG' ? ['sgPrivacy']
                        : market === 'AU' ? ['auProductSafety']
                            : market === 'NZ' ? ['nzProductSafety'] : [];
        const childrenSourceIds = market === 'US' ? ['cpscChildren', 'coppa']
            : market === 'EU' ? ['gpsr', 'gdpr']
                : market === 'JP' ? ['jpOnlineSeller', 'jpPrivacy']
                    : market === 'SG' ? ['sgSafety', 'sgChildrenPrivacy']
                        : market === 'AU' ? ['auProductSafety', 'auButtonBattery']
                            : market === 'NZ' ? ['nzProductSafety', 'nzElectrical'] : [];
        const expandedLocalProducts = new Set([
            'beauty_device', 'security_camera', 'smart_light', 'gaming_controller', 'mini_projector', 'usb_hub',
            'portable_fan', 'electric_shaver', 'webcam', 'dash_camera', 'video_doorbell', 'baby_monitor'
        ]);
        const jpScope = modelApi.marketScopeMappings?.JP?.[profile.productType];
        const sgScope = modelApi.marketScopeMappings?.SG?.[profile.productType];
        const scopeDetail = (mapping) => {
            if (!mapping) return { excluded: false, text: '' };
            if (mapping.directMains && profile.mainsPowered === false && profile.bundledAdapter !== true) return { excluded: true, text: 'The described battery/USB-only configuration is outside this direct-mains candidate category; assess any bundled adaptor separately.' };
            const checks = [];
            if (mapping.maxVoltage) checks.push(!Number.isFinite(profile.ratedVoltage) ? `rated voltage not confirmed (category limit ${mapping.maxVoltage} VAC)` : `${profile.ratedVoltage} V ${profile.ratedVoltage <= mapping.maxVoltage ? 'is within' : 'exceeds'} the ${mapping.maxVoltage} VAC category limit`);
            if (mapping.maxPower) checks.push(!Number.isFinite(profile.ratedPower) ? `rated power not confirmed (category limit ${mapping.maxPower} W)` : `${profile.ratedPower} W ${profile.ratedPower <= mapping.maxPower ? 'is within' : 'exceeds'} the ${mapping.maxPower} W category limit`);
            return { excluded: checks.some((item) => /exceeds/.test(item)), text: checks.length ? ` Parameter screen: ${checks.join('; ')}.` : '' };
        };
        const jpScopeResult = scopeDetail(jpScope);
        const sgScopeResult = scopeDetail(sgScope);

        if (market === 'US') {
            if (hasRadio) requirements.push(requirement('fcc', 'FCC equipment authorization and RF exposure', 'Wireless body-worn transmitters need the correct equipment-authorization path, labeling, and RF-exposure evidence.', ['FCC ID / grant', 'RF test report', 'RF exposure / SAR evidence', 'Label artwork'], 'required', ['fcc', 'fccExposure']));
            const digitalDeviceCandidates = new Set(['beauty_device', 'smart_light', 'gaming_controller', 'mini_projector', 'usb_hub', 'portable_fan', 'electric_shaver']);
            if (!hasRadio && digitalDeviceCandidates.has(profile.productType)) requirements.push(requirement('fcc_unintentional', 'FCC Part 15B digital-device scope check', 'A wired or non-radio electronic product may still be an unintentional radiator. Confirm whether the exact circuitry is a Part 15 digital device and, if so, the applicable SDoC or certification path before import or marketing.', ['Part 15B applicability rationale', 'FCC emissions test report', 'Supplier’s Declaration of Conformity / responsible-party record', 'Compliance information and label artwork'], 'required', ['fcc']));
            if (profile.mainsPowered === true) requirements.push(requirement('us_electrical', 'Mains electrical-safety evidence', 'Confirm the exact power configuration, applicable safety standard, certification scope and markings before sale or workplace use.', ['Electrical safety test report / certification', 'Power specification', 'Label artwork'], 'required', ['usElectrical']));
            if (profile.medicalClaim === true) requirements.push(requirement('fda', 'FDA device-scope review', 'Medical claims may turn a consumer wearable into a regulated medical device.', ['Intended-use statement', 'Claims matrix', 'FDA pathway evidence'], 'high', ['fda']));
            if (profile.childUse === true) requirements.push(requirement('children', 'Children’s product and privacy review', 'Child-directed products can trigger additional product-safety, tracking, and privacy duties.', ['Age-grading rationale', 'Privacy/data-flow map', 'Applicable test evidence', 'Children’s Product Certificate where applicable'], 'high', childrenSourceIds));
        } else if (market === 'EU') {
            if (hasRadio) requirements.push(requirement('red', 'CE / Radio Equipment Directive conformity', 'Connected wearables need an EU conformity assessment, technical file, declaration, and labeling.', ['EU Declaration of Conformity', 'RED test reports', 'CE label artwork'], 'required', ['red']));
            const wearableRadio = ['smart_watch', 'smart_ring', 'fitness_tracker', 'kids_gps_watch', 'earbuds', 'smart_glasses'].includes(profile.productType);
            const redCyberApplies = hasRadio && (profile.wifi === true || profile.cellular === true || profile.childUse === true || wearableRadio);
            if (redCyberApplies) requirements.push(requirement('red_cybersecurity', 'EU RED cybersecurity evidence', 'Applicable internet-connected, child-directed and wearable radio equipment must address network protection, privacy and fraud safeguards.', ['RED cybersecurity assessment / test evidence', 'Security-update policy', 'EU Declaration of Conformity'], 'required', ['redCyber']));
            if (profile.mainsPowered === true) requirements.push(requirement('eu_electrical', 'EU electrical-safety conformity', 'Confirm the applicable RED or Low Voltage Directive safety standards for the exact mains-powered configuration.', ['EU electrical safety report', 'EU Declaration of Conformity', 'Power and label specification'], 'required', ['lvd']));
            requirements.push(requirement('rohs', 'RoHS, REACH, WEEE and producer-responsibility review', 'Electronics, materials, packaging, and end-of-life obligations affect EU market access.', ['RoHS report', 'REACH/SVHC declaration', 'WEEE/EPR registration evidence'], 'required', ['rohs']));
            requirements.push(requirement('gpsr', 'EU consumer-product traceability and online-offer review', 'The listing and product pack need manufacturer, EU responsible-person, safety, warning, and traceability information.', ['EU responsible-person details', 'Traceability / label artwork', 'Risk assessment'], 'required', ['gpsr']));
            if (profile.medicalClaim === true) requirements.push(requirement('mdr', 'EU medical-device scope review', 'Diagnostic or treatment claims can bring the wearable within the MDR.', ['Intended-use statement', 'Claims matrix', 'MDR classification rationale'], 'high', ['mdr']));
        } else if (market === 'JP') {
            if (expandedLocalProducts.has(profile.productType)) requirements.push(requirement('jp_product_safety', 'Japan product-safety and online-seller scope review', 'Confirm the exact product category, power ratings, responsible economic operator and applicable product-safety act before offering the model in Japan.', ['Japan product-safety scope rationale', 'Exact-model safety test report', 'Rated-power and label specification', 'Importer or domestic responsible-person details where applicable'], 'required', ['jpProductSafety', 'jpOnlineSeller']));
            if (hasRadio) requirements.push(requirement('jp_radio', 'Japan radio technical-conformity review', 'Bluetooth, Wi-Fi and cellular functions require the applicable certification scope, module/antenna conditions and mark display.', ['Japan radio certificate', 'Module and antenna specification', 'Technical-conformity mark artwork'], 'required', ['jpRadio']));
            if (!jpScopeResult.excluded && (profile.mainsPowered === true || profile.bundledAdapter === true || ['charger', 'power_bank'].includes(profile.productType) || (jpScope?.trigger === 'mains_not_false' && profile.mainsPowered !== false))) {
                const mappedCategory = jpScope?.category ? ` The maintained candidate category is: ${jpScope.category}.${jpScopeResult.text}` : '';
                requirements.push(requirement('jp_pse', 'Japan PSE product-scope and importer review', `The official PSE list uses statutory product definitions and rating limits; confirm whether the exact model is covered.${mappedCategory}`, ['PSE product-category and ratings rationale', 'Conformity/test evidence where covered', 'Importer or overseas-seller notification records where covered', 'Domestic responsible-person details where applicable', 'PSE label artwork where covered'], 'required', ['jpPse', jpScope?.sourceId || 'jpPseProducts', 'jpOnlineSeller']));
            }
            if (profile.wifi === true) requirements.push(requirement('jp_iot_security', 'Japan IoT security-label readiness', 'For an internet-connected consumer device, check JC-STAR scope and customer or channel expectations. This is a security-readiness signal, not universal legal market authorization.', ['JC-STAR scope assessment', 'Security baseline and update policy'], 'advisory', ['jpIoTSecurity']));
            if (profile.medicalClaim === true) requirements.push(requirement('jp_medical', 'Japan medical-device scope review', 'Medical intended use may trigger PMD Act classification and local authorization responsibilities.', ['Intended-use and claims matrix', 'PMD Act pathway rationale', 'Japan MAH/importer evidence'], 'high'));
        } else if (market === 'SG') {
            if (expandedLocalProducts.has(profile.productType)) requirements.push(requirement('sg_general_safety', 'Singapore consumer-product safety review', 'Products outside the controlled-goods list still need applicable internationally accepted safety evidence under the CGSR; first determine whether the model or bundled power supply is instead a Controlled Good.', ['CGSR / CPSR product-scope rationale', 'Applicable IEC / ISO / EN / ASTM safety report', 'Rated-power and label specification', 'Singapore supplier details'], 'required', ['sgGeneralSafety', 'sgControlledGoods']));
            if (hasRadio) requirements.push(requirement('sg_imda', 'Singapore IMDA registration and dealer review', 'Radio and telecommunication equipment for local sale may require IMDA standards evidence, registration and a licensed local dealer.', ['IMDA registration / SDoC', 'Radio test reports', 'Dealer licence evidence', 'Compliance label artwork'], 'required', ['sgImda']));
            if (!sgScopeResult.excluded && (profile.mainsPowered === true || profile.bundledAdapter === true || profile.productType === 'charger' || (sgScope?.trigger === 'mains_not_false' && profile.mainsPowered !== false))) {
                const mappedCategory = sgScope?.category ? ` The maintained candidate category is: ${sgScope.category}.${sgScopeResult.text}` : '';
                requirements.push(requirement('sg_safety', 'Singapore Controlled Goods / SAFETY Mark scope review', `The exact product or bundled AC adaptor may fall within a current Controlled Goods category. Confirm the definition and risk tier before requiring registration and a SAFETY Mark.${mappedCategory}`, ['Controlled-goods category and risk-tier rationale', 'Applicable safety test report', 'CPSR registration where covered', 'SAFETY Mark artwork where covered', 'Bundled AC adaptor registration evidence'], 'required', ['sgSafety', sgScope?.sourceId || 'sgControlledGoods']));
            }
            if (profile.wifi === true) requirements.push(requirement('sg_iot_security', 'Singapore consumer-IoT cybersecurity readiness', 'Check CLS scope for the connected device and channel or buyer expectations. Except where a separate rule makes it mandatory, CLS is not treated here as universal market authorization.', ['CLS applicability assessment', 'Security baseline and update policy'], 'advisory', ['sgIoTSecurity']));
            if (profile.medicalClaim === true) requirements.push(requirement('sg_medical', 'Singapore health-product scope review', 'Medical claims may require HSA device classification, registration and dealer/importer responsibilities.', ['Claims matrix', 'HSA classification rationale', 'Local registrant/importer evidence'], 'high'));
        } else if (market === 'AU') {
            requirements.push(requirement('au_emc', 'Australia ACMA EMC applicability and evidence', 'Electronic products must be screened against the ACMA EMC rules for the exact configuration before the compliance label is applied.', ['ACMA EMC applicability rationale', 'EMC test report', 'Compliance records'], 'required', ['auAcma']));
            if (hasRadio) requirements.push(requirement('au_radio', 'Australia ACMA radio and EME compliance', 'Every enabled Bluetooth, Wi-Fi, cellular or other transmitter, antenna and RF-exposure configuration must be covered by the applicable ACMA standards.', ['Radio test reports', 'Module and antenna specification', 'EME / RF exposure evidence', 'Frequency-band declaration'], 'required', ['auAcma']));
            if (profile.cellular === true || profile.productType === 'wifi_router') requirements.push(requirement('au_telecom', 'Australia telecommunications connection scope check', 'Equipment intended to connect to a carrier or public telecommunications network needs a separate telecommunications-rule applicability check.', ['Telecommunications standards applicability rationale', 'Network-interface test evidence', 'Carrier compatibility specification'], 'required', ['auAcma']));
            requirements.push(requirement('au_rcm', 'Australia responsible supplier, records and RCM', 'A covered product needs an eligible Australian responsible supplier, retained compliance records and correctly placed RCM; CE or FCC evidence alone is not Australian authorization.', ['Australian responsible-supplier registration', 'Compliance-folder index', 'RCM label artwork'], 'required', ['auResponsibleSupplier', 'auRcm']));
            if (profile.mainsPowered === true || profile.bundledAdapter === true || profile.productType === 'charger') requirements.push(requirement('au_eess', 'Australia EESS scope and electrical-equipment classification', 'Classify the host product and any bundled AC adaptor separately, then confirm responsible-supplier and equipment-registration duties for each in-scope declared article.', ['EESS risk-level and declared-article rationale', 'Electrical safety test report / certificate', 'Responsible-supplier registration', 'Equipment registration where applicable', 'Separate adaptor model and RCM evidence'], 'required', ['auEess']));
            requirements.push(requirement('au_product_safety', 'Australia mandatory-standard, ban and recall check', 'The exact product, child use and battery design must be checked against current mandatory standards, bans and recall signals.', ['Product-safety scope rationale', 'Risk assessment', 'Warnings and instructions', 'Recall search record'], 'required', ['auProductSafety']));
            if (profile.coinBattery === true) requirements.push(requirement('au_button_battery', 'Australia button / coin battery mandatory safety controls', 'A product containing a button or coin battery requires product-specific secure-compartment, test, warning and information evidence.', ['Button/coin battery safety test report', 'Secure battery-compartment evidence', 'Warning-label artwork', 'Instructions and packaging warnings'], 'required', ['auButtonBattery']));
            if (profile.medicalClaim === true) requirements.push(requirement('au_medical', 'Australia medical-device scope review', 'Medical intended use or claims require specialist confirmation before relying on the consumer-electronics pathway.', ['Intended-use statement', 'Claims matrix', 'Australian medical-device pathway rationale'], 'high'));
        } else if (market === 'NZ') {
            requirements.push(requirement('nz_emc', 'New Zealand RSM EMC conformity level', 'Determine whether the exact electronic product is EMC level 1, 2 or 3 and retain the evidence required for that level.', ['RSM EMC conformity-level rationale', 'EMC test evidence', 'Compliance-folder index'], 'required', ['nzRsm', 'nzRsmTesting']));
            if (hasRadio) requirements.push(requirement('nz_radio', 'New Zealand RSM radio conformity level and standards', 'Every enabled transmitter, frequency and antenna must be assessed against the current Radio Standards Notice and assigned the correct 1/A1–3/A3 conformity route.', ['Radio conformity-level rationale', 'Radio test reports', 'Module, antenna and frequency specification'], 'required', ['nzRsm', 'nzRsmTesting']));
            if (hasRadio) requirements.push(requirement('nz_radio_supplier', 'New Zealand licence to supply radio equipment', 'A radio transmitter supplier must confirm ERAC registration and the applicable New Zealand licence-to-supply requirement before sale.', ['ERAC supplier registration', 'New Zealand licence to supply radio equipment', 'Local supplier / importer details'], 'required', ['nzRsmSupplier']));
            requirements.push(requirement('nz_sdoc_label', 'New Zealand SDoC and RCM / R-NZ label route', 'The exact model or supported significant variation must be covered by a signed SDoC where required and use the mark allowed for its conformity route.', ['Signed New Zealand SDoC', 'Supporting test-report index', 'RCM or R-NZ label artwork', 'Exact-model / significant-variation rationale'], 'required', ['nzSdoc', 'nzRcmRnz']));
            if (profile.mainsPowered === true || profile.bundledAdapter === true || profile.productType === 'charger' || profile.battery === true) requirements.push(requirement('nz_electrical', 'New Zealand electrical-safety and risk classification', 'Classify the host, battery and any external adaptor separately under the current WorkSafe appliance, fitting and declared-product rules.', ['WorkSafe product and risk-classification rationale', 'Electrical safety report / certificate', 'Supplier declaration where required', 'Separate adaptor and battery model cross-reference'], 'required', ['nzElectrical', 'nzElectricalRisk']));
            requirements.push(requirement('nz_product_safety', 'New Zealand product-safety check', 'Check the exact product against current safety standards, unsafe-goods notices, recalls, warnings and reasonable consumer-safety expectations.', ['Product-safety scope rationale', 'Risk assessment', 'Warnings and instructions', 'Recall search record'], 'required', ['nzProductSafety']));
            requirements.push(requirement('nz_mutual_recognition', 'Australia / New Zealand evidence portability check', 'Australian evidence is not automatically transferable. Confirm the exact product scope, recognition route, supplier identity, mark and New Zealand record obligations.', ['Evidence-transferability matrix', 'Exact-model and manufacturer comparison', 'New Zealand supplier-responsibility record'], 'required', ['nzMutualRecognition']));
            if (profile.medicalClaim === true) requirements.push(requirement('nz_medical', 'New Zealand medical-device scope review', 'Medical intended use or claims require specialist confirmation before relying on the consumer-electronics pathway.', ['Intended-use statement', 'Claims matrix', 'New Zealand medical-device pathway rationale'], 'high'));
        } else {
            requirements.push(requirement('local_radio', 'Local radio and product-safety approval', 'This market currently has basic coverage; confirm the local type-approval and importer obligations before listing.', ['Radio specification', 'Existing test reports', 'Local importer details']));
        }

        if (profile.battery === true) {
            const euBattery = market === 'EU';
            const batterySources = market === 'NZ' ? ['battery', 'nzLithiumTransport'] : ['battery'];
            requirements.push(requirement('battery', 'Lithium-battery transport evidence', 'Small-parcel carriers and fulfillment networks usually require battery configuration and transport evidence.', ['UN38.3 test summary', 'SDS', 'Battery specification', 'Packaging configuration'], 'required', batterySources));
            if (euBattery) requirements.push(requirement('eu_battery_future', 'EU portable-battery design readiness for 2027', 'Portable-battery removability and replaceability requirements apply from 18 February 2027, subject to product-specific scope and derogations. This future requirement does not determine current sellability.', ['EU battery 2027 design-scope rationale'], 'future', ['euBattery']));
        }
        if (profile.healthMonitoring === true) {
            requirements.push(requirement('privacy', 'Health-data and claims review', 'Biometric features create privacy, substantiation, and listing-copy risk even without a medical claim.', ['Data-flow map', 'Privacy notice', 'Claims substantiation'], 'required', privacySourceIds));
        }
        if (profile.cameraMic === true) {
            const privacySources = market === 'US' ? ['ftcIot']
                : market === 'EU' ? ['edpbVideo']
                : market === 'JP' ? ['jpPrivacy']
                        : market === 'SG' ? ['sgPrivacy']
                            : market === 'AU' ? ['auProductSafety']
                                : market === 'NZ' ? ['nzProductSafety'] : [];
            requirements.push(requirement('privacy_features', 'Camera / microphone privacy review', 'Recording features require clear disclosure, permissions, security controls, and platform-compatible listing copy.', ['Recording-feature disclosure', 'Permission flow', 'Privacy notice', 'Security-update statement'], 'required', privacySources));
        }
        if (profile.childUse === true && !requirements.some((item) => item.id === 'children')) {
            requirements.push(requirement('children', 'Children’s product safety and privacy review', 'Age grading, small parts, battery access, tracking, recording and child-data practices require a dedicated review.', ['Age grading', 'Child safety test evidence', 'Battery-compartment evidence', 'Child privacy/data-flow map'], 'high', childrenSourceIds));
        }
        return requirements;
    }

    const marketEvidenceKinds = {
        US: new Set(['FCC', 'Electrical Safety', 'UN38.3', 'SDS', 'RoHS']),
        EU: new Set(['CE / RED', 'Electrical Safety', 'RoHS', 'UN38.3', 'SDS']),
        JP: new Set(['Japan Radio', 'PSE', 'UN38.3', 'SDS']),
        SG: new Set(['IMDA', 'SAFETY Mark', 'UN38.3', 'SDS']),
        AU: new Set(['ACMA / RCM', 'EESS / Electrical Safety', 'UN38.3', 'SDS']),
        NZ: new Set(['RSM / RCM / R-NZ', 'NZ SDoC', 'Electrical Safety', 'UN38.3', 'SDS'])
    };

    function normalizedReference(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function parsedDate(value) {
        const timestamp = Date.parse(String(value || ''));
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function analyzeSupplierEvidence({ files = [], supplierModel = '', requiredModel = '', supplierName = '', documentText = '', market = '' } = {}) {
        const target = String(requiredModel || '').trim().toLowerCase();
        const supplier = String(supplierModel || '').trim().toLowerCase();
        const text = String(documentText || '').toLowerCase();
        const modelMatch = !target ? 'not_provided'
            : (text.includes(target) ? 'matched' : supplier && supplier !== target ? 'mismatch' : 'unverified');
        return files.map((file) => {
            const name = String(file.name || '').toLowerCase();
            const type = String(file.type || '');
            const parsing = file.parsing || {};
            const fileModelMatch = parsing.modelMatch === false ? 'mismatch'
                : parsing.modelMatch === true ? 'matched'
                    : modelMatch;
            const supported = /pdf|image/.test(type) || /\.(pdf|png|jpe?g|webp)$/i.test(name);
            const kind = parsing.documentKind && parsing.documentKind !== 'Unclassified evidence'
                ? parsing.documentKind
                : /un.?38|battery.?test/.test(name) ? 'UN38.3'
                : /sds|msds/.test(name) ? 'SDS'
                    : /fcc/.test(name) ? 'FCC'
                        : /\b(red|ce)\b/.test(name) ? 'CE / RED'
                            : /rohs/.test(name) ? 'RoHS'
                                : /electrical.?safety|iec\s*6|en\s*6|ul\s*\d|etl|nrtl/.test(name) ? 'Electrical Safety'
                                : /pse/.test(name) ? 'PSE'
                                : /imda/.test(name) ? 'IMDA'
                                    : /acma|\brcm\b/.test(name) ? 'ACMA / RCM'
                                        : /eess/.test(name) ? 'EESS / Electrical Safety'
                                            : /r-nz|rsm|radio.?spectrum/.test(name) ? 'RSM / RCM / R-NZ'
                                                : /sdoc|declaration.?of.?conformity/.test(name) && market === 'NZ' ? 'NZ SDoC'
                                        : /safety.?mark|cpsr/.test(name) ? 'SAFETY Mark'
                                            : /giteki|japan.?radio|mic.?cert/.test(name) ? 'Japan Radio'
                                        : 'Unclassified evidence';
            const expectedKinds = marketEvidenceKinds[market] || new Set();
            const marketMatch = !market || kind === 'Unclassified evidence' ? null
                : ['UN38.3', 'SDS', 'RoHS'].includes(kind) ? true
                    : expectedKinds.has(kind);
            const expectedSupplier = normalizedReference(supplierName);
            const extractedSupplier = normalizedReference(parsing.manufacturer);
            const holderMatch = !expectedSupplier ? null
                : extractedSupplier ? (extractedSupplier.includes(expectedSupplier) || expectedSupplier.includes(extractedSupplier))
                    : null;
            const expiry = parsedDate(parsing.expiryDate);
            const expired = expiry !== null && expiry < Date.now();
            const missingFields = Array.isArray(parsing.missingFields) ? parsing.missingFields : [];
            const complete = !missingFields.length;
            const parserIssue = file.status === 'parser_unavailable'
                ? 'document verification service was unavailable; no file was approved'
                : file.status === 'parse_failed' || file.status === 'verification_failed'
                    ? 'document could not be read; upload a searchable PDF or a clear image of every page'
                    : null;
            const checks = {
                kind: kind !== 'Unclassified evidence',
                model: fileModelMatch === 'matched',
                holder: holderMatch,
                market: marketMatch,
                complete,
                current: expired ? false : (parsing.reportDate || parsing.expiryDate ? true : null)
            };
            const blockingIssues = [
                parserIssue,
                !checks.kind && 'document type could not be identified',
                checks.model !== true && (checks.model === false ? 'model does not match' : 'model could not be verified'),
                checks.holder === false && 'manufacturer / certificate holder does not match',
                checks.holder === null && expectedSupplier && 'manufacturer / certificate holder could not be verified',
                checks.market === false && `document type is not applicable to ${market}`,
                !checks.complete && `missing ${missingFields.join(', ')}`,
                checks.current === false && 'document is expired',
                checks.current === null && 'report or issue date could not be verified'
            ].filter(Boolean);
            const verified = file.status === 'parsed' && !blockingIssues.length;
            return {
                name: file.name || 'unnamed file',
                size: Number(file.size || 0),
                kind,
                status: ['verification_failed', 'parse_failed', 'parser_unavailable'].includes(file.status) ? 'unable_to_verify'
                    : file.status === 'model_mismatch' || checks.model === false ? 'suspected_mismatch'
                    : checks.holder === false || checks.market === false || checks.current === false ? 'verification_failed'
                    : file.status === 'parsed_incomplete' ? 'incomplete_parse'
                    : verified ? 'verified_match'
                    : file.status === 'parsed' && fileModelMatch === 'matched' ? 'incomplete_verification'
                    : file.status === 'parsed' ? 'server_parsed'
                    : !supported ? 'unsupported'
                    : fileModelMatch === 'mismatch' ? 'suspected_mismatch'
                        : fileModelMatch === 'matched' ? 'model_matched'
                            : 'unable_to_verify',
                modelMatch: fileModelMatch,
                checks,
                issues: blockingIssues,
                extracted: {
                    model: parsing.model || '', manufacturer: parsing.manufacturer || '',
                    reportNumber: parsing.reportNumber || '', reportDate: parsing.reportDate || '',
                    expiryDate: parsing.expiryDate || '',
                    standards: parsing.standards || [], fccId: parsing.fccId || '',
                    batteryModel: parsing.batteryModel || '', missingFields: parsing.missingFields || []
                },
                note: blockingIssues.length ? blockingIssues.join('; ') : (file.note || (!supported
                    ? 'Unsupported file type.'
                    : fileModelMatch === 'matched'
                        ? `Model text matches the entered product model.${parsing.missingFields?.length ? ` Missing extracted fields: ${parsing.missingFields.join(', ')}.` : ''} Authenticity, scope and issuing body still require verification.`
                        : fileModelMatch === 'mismatch'
                            ? 'Supplier/document model does not match the intended product model.'
                            : 'File received, but the browser could not verify its internal model, date, pages, standard or authenticity.'))
            };
        });
    }

    function productSpecificSupplierDocuments(profile = {}, market = '') {
        const common = {
            security_camera: ['Camera, microphone, storage and network-function specification', 'Security-update and vulnerability-handling policy'],
            smart_light: ['Lamp, control-gear and rated-power specification'],
            gaming_controller: ['Controller, receiver/dongle and charging configuration specification'],
            mini_projector: ['Projection system, light source and power-supply specification'],
            usb_hub: ['Port, data, power-delivery and external-power specification'],
            portable_fan: ['Motor power, fan format and charging/power specification'],
            electric_shaver: ['Wet/dry use, ingress protection and charging-mode specification'],
            webcam: ['USB, camera, microphone and wireless-interface specification'],
            dash_camera: ['Recording, storage, GPS and vehicle-power specification'],
            video_doorbell: ['Doorbell, camera, two-way-audio, battery and transformer specification', 'Ingress/weather rating evidence'],
            baby_monitor: ['Camera/audio link, parent unit, child-use and power configuration', 'Child safety and accessible-parts assessment'],
            robot_vacuum: ['Robot, charging dock, battery, mapping sensor and camera specification']
        };
        const docs = [...(common[profile.productType] || [])];
        if (profile.wifi === true) docs.push('Cybersecurity baseline and supported security-update period');
        if (profile.battery === true && profile.productType) docs.push('Cell, battery pack and finished-product model cross-reference');
        if (market === 'JP') docs.push('Japanese importer / overseas-seller responsibility statement');
        if (market === 'SG') docs.push('Singapore supplier and bundled AC adaptor declaration');
        if (market === 'AU') docs.push('Australian responsible-supplier details and compliance-folder index', 'Host product and bundled adaptor exact-model cross-reference');
        if (market === 'NZ') docs.push('New Zealand importer / supplier and ERAC registration details', 'Host product, battery and adaptor exact-model cross-reference', 'Australia-to-New Zealand evidence transferability statement');
        return Array.from(new Set(docs));
    }

    function buildSupplierRequest({ requirements, evidenceAnswers = {}, supplierEvidence = [], requiredModel = '', market = '', platform = '', profile = {}, tariffOptions = [] }) {
        const questions = [
            ...evidenceQuestionsForRequirements(requirements),
            ...platformEvidenceQuestions(platform, profile)
        ];
        const filesByKind = new Map();
        supplierEvidence.forEach((file) => {
            if (!filesByKind.has(file.kind)) filesByKind.set(file.kind, []);
            filesByKind.get(file.kind).push(file);
        });
        const items = requirements
            .filter((item) => item.id === 'privacy_features')
            .map((item) => ({
                document: item.docs.join(' / '),
                reason: 'the product includes a camera or microphone and the disclosure package was not verified'
            }));
        productSpecificSupplierDocuments(profile, market).forEach((document) => items.push({
            document,
            reason: 'the product-specific configuration was not verified against the exact ordered model'
        }));
        const tariffMeasures = tariffOptions.flatMap((row) => row.conditionalMeasures || []);
        if (tariffMeasures.some((item) => item.id === 'origin_preference')) items.push({
            document: 'Origin declaration / certificate and product-specific rules-of-origin calculation',
            reason: 'a preferential tariff must not be claimed until origin eligibility and supporting records are confirmed'
        });
        if (tariffMeasures.some((item) => item.id === 'tariff_concession')) items.push({
            document: 'Applicable concession or tariff-concession order reference and exact goods-description match',
            reason: 'a concession is conditional and is not included in the maintained general-duty calculation'
        });
        if (tariffMeasures.some((item) => item.id === 'trade_remedy')) items.push({
            document: 'Exporter / manufacturer identity and trade-remedy scope confirmation',
            reason: 'anti-dumping or countervailing scope can depend on the goods, exporter and country'
        });
        questions.forEach((question) => {
            const answer = normalizeBoolean(evidenceAnswers[question.key]?.value ?? evidenceAnswers[question.key]);
            if (!(question.kinds || []).length && answer !== true) {
                items.push({
                    document: question.docs.join(' / '),
                    reason: question.scope === 'platform'
                        ? (answer === false ? 'the platform approval was reported unavailable' : 'platform approval was not confirmed')
                        : (answer === false ? 'the required product evidence was reported unavailable' : 'the required product evidence was not confirmed')
                });
                return;
            }
            (question.kinds || []).forEach((kind) => {
                const files = filesByKind.get(kind) || [];
                const verified = files.some((file) => file.status === 'verified_match');
                if (verified) return;
                const issues = files.flatMap((file) => file.issues || []);
                items.push({
                    document: question.docs.join(' / '),
                    reason: issues.length ? Array.from(new Set(issues)).join('; ')
                        : answer === false ? 'supplier stated that this evidence is unavailable'
                            : answer === UNKNOWN ? 'availability was not confirmed'
                                : 'no verified exact-model file was provided'
                });
            });
        });
        const unique = items.filter((item, index, rows) => rows.findIndex((row) => row.document === item.document) === index);
        const model = String(requiredModel || '').trim() || '[exact model number]';
        const lines = unique.map((item, index) => `${index + 1}. ${item.document} for model ${model} — ${item.reason}.`);
        return {
            items: unique,
            subject: `Documents required before order approval — ${model}`,
            message: unique.length
                ? `Please provide the following documents for ${model} before we approve the order for ${market || 'the target market'}${platform ? ` / ${platform}` : ''}:\n\n${lines.join('\n')}\n\nEach file must show the exact model, manufacturer or certificate holder, report/certificate number, issue date, applicable standards, and all pages. Please explain any model, module, antenna, battery, label, or hardware difference. Documents will be checked before balance payment.`
                : `The uploaded documents for ${model} passed the automated completeness and reference checks. Please confirm that no model, module, antenna, battery, label, firmware, or hardware change will be made without written notice.`,
            complete: unique.length === 0
        };
    }

    function numberOrNull(value) {
        if (value === '' || value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeHs(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function conditionalTariffMeasures(market, origin) {
        if (market === 'AU') return [
            {
                id: 'origin_preference', label: 'Preferential origin treatment', status: 'not_applied',
                detail: origin === 'CN'
                    ? 'China-origin goods may be eligible under ChAFTA only when the product-specific origin rule and evidence are satisfied.'
                    : 'A preferential rate may apply only after the relevant agreement, product-specific origin rule and evidence are confirmed.',
                sourceUrl: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff'
            },
            {
                id: 'tariff_concession', label: 'Tariff Concession Order / Schedule 4', status: 'scope_check',
                detail: 'Check whether a current TCO or another Schedule 4 concession exactly covers the goods. No concession is included automatically.',
                sourceUrl: 'https://www.abf.gov.au/tariff-classification-subsite/Pages/Tariff-concession-orders.aspx'
            },
            {
                id: 'trade_remedy', label: 'Dumping and countervailing measures', status: 'scope_check',
                detail: 'Confirm commodity, origin, exporter and manufacturer scope separately before filing. The general Schedule 3 rate does not include trade remedies.',
                sourceUrl: 'https://www.industry.gov.au/anti-dumping-commission'
            }
        ];
        if (market === 'NZ') return [
            {
                id: 'origin_preference', label: 'Preferential origin treatment', status: 'not_applied',
                detail: origin === 'CN'
                    ? 'China-origin goods may qualify for an NZ preferential rate only when the applicable origin rule and evidence are satisfied.'
                    : 'A preferential rate may apply only after the relevant agreement, origin rule and supporting evidence are confirmed.',
                sourceUrl: 'https://www.customs.govt.nz/business/tariffs/preferential-tariffs'
            },
            {
                id: 'tariff_concession', label: 'New Zealand tariff concession', status: 'scope_check',
                detail: 'Check Part II and the current Consolidated List of Approvals for an exact concession match. No concession is included automatically.',
                sourceUrl: 'https://www.customs.govt.nz/business/tariffs/tariff-concessions'
            }
        ];
        return [];
    }

    function findDutySignal({ origin, market, hsCode, dutyRates, entryDate = new Date().toISOString().slice(0, 10) }) {
        const normalizedHs = normalizeHs(hsCode);
        if (!normalizedHs || !Array.isArray(dutyRates?.rules)) return null;
        const candidates = dutyRates.rules.filter((rule) => {
            const routeMatch = rule.import_country === market
                && (rule.origin_country === origin || rule.origin_country === '*');
            const prefixMatch = (rule.hs_prefixes || []).some((prefix) => {
                const normalizedPrefix = normalizeHs(prefix);
                return normalizedHs.startsWith(normalizedPrefix) || normalizedPrefix.startsWith(normalizedHs);
            });
            return routeMatch && prefixMatch;
        }).sort((a, b) => {
            const exactA = a.origin_country === origin ? 1 : 0;
            const exactB = b.origin_country === origin ? 1 : 0;
            return exactB - exactA;
        });
        const rule = candidates[0];
        if (!rule) return null;
        const matchingOverrides = (rule.exact_code_overrides || [])
            .filter((row) => (!row.effective_from || String(row.effective_from).slice(0, 10) <= entryDate)
                && (!row.effective_to || String(row.effective_to).slice(0, 10) >= entryDate))
            .filter((row) => {
                const code = normalizeHs(row.hs_code);
                return code && (normalizedHs.startsWith(code) || code.startsWith(normalizedHs));
            })
            .sort((a, b) => normalizeHs(b.hs_code).length - normalizeHs(a.hs_code).length);
        const exactMatches = matchingOverrides.filter((row) => {
            const code = normalizeHs(row.hs_code);
            return normalizedHs.length >= 8 && normalizedHs.startsWith(code) && normalizedHs.length >= code.length;
        });
        const exactRates = [...new Set(exactMatches.map((row) => numberOrNull(row.base_rate)).filter((rate) => rate !== null))];
        const exactOverride = exactRates.length === 1
            ? exactMatches.sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0]
            : null;
        const candidateOverrides = matchingOverrides.filter((row) => normalizeHs(row.hs_code).startsWith(normalizedHs));
        const candidateRates = [...new Set(candidateOverrides.map((row) => numberOrNull(row.base_rate)).filter((rate) => rate !== null))];
        const override = exactOverride || null;
        const configuredBaseRate = numberOrNull(override?.base_rate ?? rule.base_rate);
        const baseRate = configuredBaseRate === null && !override && candidateRates.length === 1
            ? candidateRates[0]
            : configuredBaseRate;
        const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
        const taxLayers = layers.filter((layer) => /(vat|gst|tax|consumption)/i.test(`${layer.type || ''} ${layer.label || ''}`));
        const tradeLayers = layers.filter((layer) => !taxLayers.includes(layer));
        const additionalRate = tradeLayers.length
            ? tradeLayers.reduce((sum, layer) => sum + (numberOrNull(layer.rate) || 0), 0)
            : (taxLayers.length ? 0 : (numberOrNull(rule.additional_rate) || 0));
        const candidateExactLines = candidateOverrides
            .filter((row, index, rows) => rows.findIndex((other) => normalizeHs(other.hs_code) === normalizeHs(row.hs_code)) === index)
            .slice(0, 40)
            .map((row) => ({
                hsCode: normalizeHs(row.hs_code),
                description: row.description || '',
                baseRate: numberOrNull(row.base_rate),
                sourceUrl: row.source_url || rule.source_url || '',
                effectiveFrom: row.effective_from || '',
                effectiveTo: row.effective_to || ''
            }));
        return {
            hsCode,
            rate: baseRate === null ? null : baseRate + additionalRate,
            baseRate,
            additionalRate,
            importTaxBenchmarkRate: taxLayers.reduce((sum, layer) => sum + (numberOrNull(layer.rate) || 0), 0),
            sourceStatus: override?.source_status || rule.source_status || 'indicative',
            confidence: override?.confidence || rule.confidence || 'route signal',
            sourceUrl: override?.source_url || rule.source_url || '',
            sourceText: override?.source_rate_text || rule.source_note || '',
            lastCheckedAt: override?.last_checked_at || rule.last_checked_at || dutyRates.generated_at || '',
            exact: Boolean(override),
            exactConflict: exactMatches.length > 0 && exactRates.length !== 1,
            classificationRequired: !override && normalizedHs.length < 8,
            matchingExactLineCount: candidateOverrides.length,
            candidateExactLines,
            conditionalMeasures: conditionalTariffMeasures(market, origin)
        };
    }

    function buildTariffOptions(input, product) {
        const entered = normalizeHs(input.exactHsCode);
        const codes = entered ? [entered] : product.candidateHs;
        const compatible = !entered || product.candidateHs.some((candidate) => {
            const normalizedCandidate = normalizeHs(candidate);
            return entered.startsWith(normalizedCandidate) || normalizedCandidate.startsWith(entered);
        });
        return codes.map((hsCode) => findDutySignal({
            origin: input.origin,
            market: input.market,
            hsCode,
            dutyRates: input.dutyRates,
            entryDate: input.entryDate
        }) || {
            hsCode,
            rate: null,
            sourceStatus: 'not_covered',
            confidence: 'classification and rate confirmation required',
            sourceUrl: '',
            sourceText: '',
            lastCheckedAt: '',
            exact: false,
            classificationMismatch: Boolean(entered && !compatible)
        }).map((row) => ({ ...row, classificationMismatch: Boolean(entered && !compatible) }));
    }

    function estimateEconomics(costs = {}, tariffSignal = null, market = '') {
        const quantity = Math.max(1, numberOrNull(costs.quantity) || 1);
        const purchaseUnit = numberOrNull(costs.purchaseUnit);
        const saleUnit = numberOrNull(costs.saleUnit);
        if (purchaseUnit === null || saleUnit === null) return null;
        const freightTotal = Math.max(0, numberOrNull(costs.freightTotal) || 0);
        const insuranceTotal = Math.max(0, numberOrNull(costs.insuranceTotal) || 0);
        const otherImportTotal = Math.max(0, numberOrNull(costs.otherImportTotal) || 0);
        const platformFeeRate = Math.max(0, numberOrNull(costs.platformFeeRate) || 0) / 100;
        const otherSellingUnit = Math.max(0, numberOrNull(costs.otherSellingUnit) || 0);
        const enteredDutyRate = numberOrNull(costs.dutyRate);
        const dutyRate = enteredDutyRate === null ? tariffSignal?.rate : enteredDutyRate / 100;
        const enteredImportTaxRate = numberOrNull(costs.importTaxRate);
        const importTaxRate = enteredImportTaxRate === null
            ? (tariffSignal?.importTaxBenchmarkRate || 0)
            : Math.max(0, enteredImportTaxRate) / 100;
        const anzMarket = market === 'AU' || market === 'NZ';
        const merchandiseValue = purchaseUnit * quantity;
        const customsValue = merchandiseValue + (anzMarket ? 0 : freightTotal + insuranceTotal);
        const duty = dutyRate === null || dutyRate === undefined ? null : customsValue * dutyRate;
        const shippingMode = costs.shippingMode === 'sea' ? 'sea' : costs.shippingMode === 'air' ? 'air' : '';
        const nzHighValue = market === 'NZ' && customsValue > 1000;
        const borderFeeBeforeTax = nzHighValue && shippingMode
            ? (shippingMode === 'sea' ? 118.44 : 51.81)
            : 0;
        const taxBase = anzMarket
            ? customsValue + freightTotal + insuranceTotal + (duty || 0) + borderFeeBeforeTax
            : customsValue + (duty || 0);
        const importTax = taxBase * importTaxRate;
        const landedTotal = merchandiseValue + freightTotal + insuranceTotal + otherImportTotal + borderFeeBeforeTax + (duty || 0) + importTax;
        const landedUnit = landedTotal / quantity;
        const platformFeeUnit = saleUnit * platformFeeRate;
        const profitUnit = saleUnit - landedUnit - platformFeeUnit - otherSellingUnit;
        const marginRate = saleUnit > 0 ? profitUnit / saleUnit : null;
        const breakEvenPrice = platformFeeRate < 1
            ? (landedUnit + otherSellingUnit) / (1 - platformFeeRate)
            : null;
        return {
            currency: costs.currency || 'USD',
            quantity,
            customsValue,
            taxBase,
            duty,
            dutyRate,
            dutyRateBasis: enteredDutyRate === null ? (tariffSignal ? 'maintained_candidate' : 'missing') : 'user_entered',
            importTax,
            importTaxRate,
            importTaxRateBasis: enteredImportTaxRate === null && tariffSignal?.importTaxBenchmarkRate
                ? 'maintained_benchmark'
                : 'user_entered',
            borderFeeBeforeTax,
            borderFeeStatus: market === 'NZ'
                ? (nzHighValue ? (shippingMode ? `NZ high-value ${shippingMode} goods levies` : 'Select air or sea to estimate NZ goods levies') : 'No high-value NZ goods levy added')
                : null,
            shippingMode: shippingMode || null,
            landedTotal,
            landedUnit,
            platformFeeUnit,
            profitUnit,
            marginRate,
            breakEvenPrice,
            complete: duty !== null,
            caveat: anzMarket
                ? `${market === 'AU' ? 'Australia' : 'New Zealand'} planning estimate only. International freight and insurance are excluded from the duty customs value and included in the GST base. GST recovery, valuation adjustments, preferences, levies and exact tariff treatment require confirmation.`
                : 'Planning estimate only. Customs value, import tax recoverability, platform fees, returns, storage, advertising, and exact tariff treatment may differ.'
        };
    }

    function buildCommercialConclusion(economics) {
        if (!economics) {
            return {
                code: 'not_calculated',
                answer: 'NOT CALCULATED',
                label: 'Add purchase and selling prices for a commercial check',
                reason: 'Commercial figures are optional and do not affect the compliance conclusion.'
            };
        }
        if (!economics.complete) {
            return {
                code: 'incomplete',
                answer: 'INCOMPLETE',
                label: 'Confirm the duty rate before relying on the margin',
                reason: 'The landed-cost calculation is missing a duty-rate basis.'
            };
        }
        if (economics.marginRate < 0) {
            return {
                code: 'loss_making',
                answer: 'LOSS-MAKING',
                label: 'Do not purchase at the current price',
                reason: `Estimated contribution margin is ${(economics.marginRate * 100).toFixed(1)}%.`
            };
        }
        if (economics.marginRate < 0.15) {
            return {
                code: 'low_margin',
                answer: 'LOW MARGIN',
                label: 'Renegotiate the purchase price or raise the selling price',
                reason: `Estimated contribution margin is ${(economics.marginRate * 100).toFixed(1)}%, below the 15% buffer used by this pre-check.`
            };
        }
        return {
            code: 'profitable',
            answer: 'PROFITABLE',
            label: 'Commercial pre-check passed',
            reason: `Estimated contribution margin is ${(economics.marginRate * 100).toFixed(1)}%.`
        };
    }

    function primaryRegulatoryGate(requirements) {
        const priorities = [
            ['fda', 'mdr', 'jp_medical', 'sg_medical'],
            ['children'],
            ['fcc', 'red', 'jp_radio', 'sg_imda', 'local_radio'],
            ['us_electrical', 'eu_electrical', 'jp_pse', 'sg_safety'],
            ['battery'],
            ['privacy_features', 'privacy'],
            ['rohs', 'gpsr'],
            ['classification']
        ];
        return priorities.flatMap((ids) => requirements.filter((item) => ids.includes(item.id)))[0] || requirements[0] || null;
    }

    function buildMarketDecision({ requirements, unanswered, documentGaps }) {
        const ids = new Set(requirements.map((item) => item.id));
        if (requirements.some((item) => item.severity === 'high')) {
            return {
                code: 'specialist',
                label: ids.has('children') ? 'Children’s product review required' : 'Regulated-claim review required',
                detail: ids.has('children')
                    ? 'Child safety, tracking, privacy, and age-grading controls must be resolved for this product.'
                    : 'The intended claims may place this product in a regulated medical-device pathway.'
            };
        }
        if (unanswered.length) {
            return {
                code: 'information_missing',
                label: 'Answer the highlighted product question',
                detail: `${unanswered[0].label} The answer changes the applicable compliance path.`
            };
        }
        const hasRadio = ['fcc', 'red', 'jp_radio', 'sg_imda', 'local_radio'].some((id) => ids.has(id));
        const hasElectricalSafety = ['us_electrical', 'eu_electrical', 'jp_pse', 'sg_safety'].some((id) => ids.has(id));
        if (hasRadio && hasElectricalSafety) {
            return {
                code: 'multiple_approvals',
                label: 'Radio and electrical approvals required',
                detail: 'This product combines wireless and mains-powered compliance gates in the selected market.'
            };
        }
        if (hasRadio) {
            return {
                code: 'radio_approval',
                label: 'Wireless approval required before sale',
                detail: 'The radio configuration, module, antenna, labels, and exact-model evidence must match.'
            };
        }
        if (hasElectricalSafety) {
            return {
                code: 'electrical_approval',
                label: 'Electrical safety approval required',
                detail: 'The mains-powered configuration needs the selected market’s safety scope and marking check.'
            };
        }
        if (ids.has('battery')) {
            return {
                code: 'battery_controls',
                label: 'Market access is simple; battery shipping is controlled',
                detail: 'No radio or specialist gate was identified, but lithium-battery transport evidence is required.'
            };
        }
        if (!documentGaps.length) {
            return {
                code: 'ready',
                label: 'No blocking market-access issue identified',
                detail: 'Proceed to final model, classification, and evidence verification.'
            };
        }
        return {
            code: 'classification_review',
            label: 'Classification review required',
            detail: 'No product-specific approval gate was identified; confirm the exact tariff classification before sale.'
        };
    }

    function buildConsumerConclusion({ requirements, unanswered, evidenceAnswers = {}, supplierEvidence = [] }) {
        const highRisk = requirements.find((item) => item.severity === 'high');
        if (highRisk) {
            const isChildren = highRisk.id === 'children';
            const trigger = isChildren
                ? 'You answered “Designed for children” = Yes.'
                : 'The product description or answers indicate regulated medical claims.';
            return {
                code: 'specialist_review',
                answer: 'SPECIALIST REVIEW',
                label: isChildren
                    ? 'Children’s product checks are required before sale'
                    : 'Regulated-claim review is required before sale',
                reason: `${trigger} ${highRisk.title} must be resolved before listing or ordering inventory.`,
                missing: [highRisk.title]
            };
        }
        if (unanswered.length) {
            return {
                code: 'unable_to_confirm',
                answer: 'UNABLE TO CONFIRM',
                label: 'Answer the remaining product question first',
                reason: unanswered[0].label,
                missing: unanswered.map((item) => item.label)
            };
        }
        const mismatchedFiles = supplierEvidence.filter((item) => item.status === 'suspected_mismatch');
        if (mismatchedFiles.length) {
            return {
                code: 'not_yet',
                answer: 'NOT YET',
                label: 'Uploaded evidence does not match the intended model',
                reason: `Resolve or replace: ${mismatchedFiles.map((item) => item.name).join(', ')}.`,
                missing: mismatchedFiles.map((item) => item.name)
            };
        }
        const failedFiles = supplierEvidence.filter((item) => item.status === 'verification_failed');
        if (failedFiles.length) {
            return {
                code: 'not_yet',
                answer: 'NOT YET',
                label: 'Uploaded evidence failed a required reference check',
                reason: failedFiles.map((item) => `${item.name}: ${item.issues.join('; ')}`).join(' | '),
                missing: failedFiles.map((item) => item.name)
            };
        }
        const incompleteFiles = supplierEvidence.filter((item) => ['incomplete_parse', 'incomplete_verification', 'unable_to_verify', 'unsupported'].includes(item.status));
        if (incompleteFiles.length) {
            return {
                code: 'unable_to_confirm',
                answer: 'UNABLE TO CONFIRM',
                label: 'Uploaded evidence is incomplete or could not be verified',
                reason: incompleteFiles.map((item) => `${item.name}: ${item.issues?.join('; ') || item.note}`).join(' | '),
                missing: incompleteFiles.map((item) => item.name)
            };
        }
        const requiredQuestions = evidenceQuestionsForRequirements(requirements);
        const requiredKeys = new Set(requiredQuestions.map((item) => item.key));
        const evidence = Object.entries(evidenceAnswers)
            .filter(([key]) => requiredKeys.has(key))
            .map(([key, item]) => ({
            key,
            label: item?.label || key,
            value: normalizeBoolean(item?.value ?? item)
            }));
        const failed = evidence.filter((item) => item.value === false);
        if (failed.length) {
            return {
                code: 'not_yet',
                answer: 'NOT YET',
                label: 'Do not sell or place the order yet',
                reason: `Required evidence is not available: ${failed.map((item) => item.label).join(', ')}.`,
                missing: failed.map((item) => item.label)
            };
        }
        const unknown = evidence.filter((item) => item.value === UNKNOWN);
        const unansweredEvidence = requiredQuestions.filter((question) => !evidence.some((item) => item.key === question.key));
        if (unknown.length || unansweredEvidence.length || (!evidence.length && requiredQuestions.length)) {
            const missing = unknown.length
                ? unknown.map((item) => item.label)
                : unansweredEvidence.map((item) => item.label);
            return {
                code: 'unable_to_confirm',
                answer: 'UNABLE TO CONFIRM',
                label: 'Verify the supplier evidence before selling',
                reason: `Not yet verified: ${missing.join(', ')}.`,
                missing
            };
        }
        if (!requiredQuestions.length) {
            return {
                code: 'basic_ready',
                answer: 'BASIC PRE-CHECK PASSED',
                label: 'No product-specific approval evidence gate was identified',
                reason: 'Confirm the exact classification and ordinary consumer-product obligations before listing.',
                missing: []
            };
        }
        const reviewedKinds = new Set(supplierEvidence
            .filter((item) => item.status === 'verified_match')
            .map((item) => item.kind));
        const requiredKinds = new Set(requiredQuestions.flatMap((item) => item.kinds || []));
        const allReviewableKindsMatched = requiredKinds.size > 0
            && [...requiredKinds].every((kind) => reviewedKinds.has(kind));
        return {
            code: allReviewableKindsMatched ? 'evidence_checked' : 'provisionally_ready',
            answer: allReviewableKindsMatched ? 'DOCUMENT MATCH CHECKED' : 'PROVISIONALLY READY',
            label: allReviewableKindsMatched
                ? 'The uploaded files match the entered model references'
                : 'Supplier says the required evidence is available',
            reason: allReviewableKindsMatched
                ? 'The available files passed the model-reference check; authority validity, scope, dates, and completeness still require final review.'
                : 'This is based on your answers only. Review the exact-model files before listing or ordering inventory.',
            missing: []
        };
    }

    function sellerRequirementLabels(requirements = []) {
        const ids = new Set(requirements.map((item) => item.id));
        const labels = [];
        if (ids.has('fcc')) labels.push('FCC authorization and RF-exposure evidence');
        else if (ids.has('red')) labels.push('CE / RED wireless-conformity evidence');
        else if (ids.has('jp_radio')) labels.push('Japan radio approval evidence');
        else if (ids.has('sg_imda')) labels.push('Singapore IMDA radio approval evidence');
        else if (ids.has('local_radio')) labels.push('local radio approval evidence');
        if (ids.has('battery')) labels.push('UN38.3 and carrier battery-shipping evidence');
        if (['us_electrical', 'eu_electrical', 'jp_pse', 'sg_safety'].some((id) => ids.has(id))) labels.push('electrical-safety evidence');
        return labels;
    }

    function buildSellerConclusion({ coverage, consumerConclusion, requirements = [], unanswered = [] }) {
        if (!coverage.supported) return {
            code: 'not_enough_information',
            label: 'Not enough information',
            reason: coverage.detail
        };
        if (consumerConclusion.code === 'specialist_review') return {
            code: 'high_risk',
            label: 'High risk — specialist review',
            reason: consumerConclusion.reason
        };
        if (['basic_ready', 'provisionally_ready', 'evidence_checked'].includes(consumerConclusion.code)) return {
            code: 'likely_eligible',
            label: 'Likely eligible — verify conditions',
            reason: consumerConclusion.reason
        };
        if (['not_yet', 'unable_to_confirm'].includes(consumerConclusion.code)) return {
            code: 'conditional',
            label: 'Conditional — evidence required',
            reason: sellerRequirementLabels(requirements).length
                ? `Known requirements already include ${sellerRequirementLabels(requirements).join(' and ')}. Verify the exact-model documents before listing or ordering${unanswered.length ? '; confirm the remaining product facts below to improve this result' : ''}.`
                : consumerConclusion.reason
        };
        return {
            code: 'not_enough_information',
            label: 'Not enough information',
            reason: consumerConclusion.reason
        };
    }

    function buildSellerActionPlan({ coverage, procurement, supplierRequest, requirements = [], unanswered = [], platformDecision }) {
        if (!coverage.supported) return {
            purchase: 'Pause — this product is outside maintained coverage.',
            supplier: 'Do not rely on a generic electronics document pack.',
            next: 'Prepare a complimentary review request with the non-confidential product description and trade route.'
        };
        const firstDocuments = (supplierRequest.items || []).slice(0, 3).map((item) => item.document);
        return {
            purchase: `${procurement.answer}: ${procurement.label}`,
            supplier: firstDocuments.length
                ? `Ask for ${firstDocuments.join('; ')}${supplierRequest.items.length > firstDocuments.length ? `; plus ${supplierRequest.items.length - firstDocuments.length} more item(s) in the supplier request` : ''}.`
                : 'Keep the exact-model evidence with the purchase record and confirm that the shipped configuration will not change.',
            next: unanswered.length
                ? `Confirm ${unanswered.slice(0, 2).map((item) => item.label.replace(/\?$/, '')).join(' and ')}; then review the updated result.`
                : platformDecision.code === 'ready'
                    ? 'Lock the exact model, labels and listing claims before ordering.'
                    : `Complete the channel step: ${platformDecision.label}.`
        };
    }

    function buildReviewContact({ description = '', origin = '', market = '', platform = '', productLabel = '', resultLabel = '' } = {}) {
        const email = 'carey@tracewize.com';
        const subject = `Complimentary product review: ${productLabel || 'product pre-check'}`;
        const text = `Complimentary review request\n\nProduct: ${description}\nMade in: ${origin}\nTarget market: ${market}\nSales channel: ${platform}\nPreliminary result: ${resultLabel}\n\nThis summary intentionally excludes supplier identity, pricing and uploaded files.`;
        return { email, subject, text, mailto: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` };
    }

    function buildDecisionTrace({ profile, requirements, evidenceAnswers = {}, supplierEvidence = [], conclusion }) {
        const trace = [];
        const radioRequirement = requirements.find((item) => ['fcc', 'red', 'jp_radio', 'sg_imda', 'local_radio'].includes(item.id));
        const radioFacts = [profile.bluetooth === true && 'Bluetooth', profile.wifi === true && 'Wi-Fi', profile.cellular === true && 'cellular'].filter(Boolean);
        trace.push(radioFacts.length
            ? `${radioFacts.join(' / ')} = Yes → ${radioRequirement?.title || 'radio approval review'} applies.`
            : 'Bluetooth / Wi-Fi / cellular = No or not identified → no radio-specific approval added.');
        trace.push(profile.battery === true
            ? 'Rechargeable lithium battery = Yes → UN38.3 and carrier acceptance apply.'
            : 'Rechargeable lithium battery = No → lithium-battery shipping control not added.');
        if (profile.childUse === true) trace.push('Designed for children = Yes → children’s safety and privacy review applies.');
        if (profile.medicalClaim === true) trace.push('Medical claim = Yes → regulated medical-device scope review applies.');
        const requiredKeys = new Set(evidenceQuestionsForRequirements(requirements).map((item) => item.key));
        const answers = Object.entries(evidenceAnswers).filter(([key]) => requiredKeys.has(key));
        if (answers.length) {
            const yes = answers.filter(([, item]) => normalizeBoolean(item?.value ?? item) === true).length;
            const no = answers.filter(([, item]) => normalizeBoolean(item?.value ?? item) === false).length;
            const unknown = answers.length - yes - no;
            trace.push(`Supplier evidence answers: ${yes} Yes${no ? `, ${no} No` : ''}${unknown ? `, ${unknown} Not sure` : ''} → self-reported until files are checked.`);
        }
        const matched = supplierEvidence.filter((item) => item.status === 'verified_match').length;
        const mismatched = supplierEvidence.filter((item) => item.status === 'suspected_mismatch').length;
        if (matched || mismatched) trace.push(`Uploaded file model check: ${matched} matched${mismatched ? `, ${mismatched} mismatched` : ''}.`);
        trace.push(`Conclusion → ${conclusion.answer}: ${conclusion.label}.`);
        return trace;
    }

    function reconcilePlatformDecision(platform, platformGateDecision, consumerConclusion) {
        const marketReady = ['basic_ready', 'provisionally_ready', 'evidence_checked'].includes(consumerConclusion.code);
        if (marketReady) return platformGateDecision;
        const platformLabels = {
            Amazon: 'Complete Amazon category, ASIN and dangerous-goods checks',
            'TikTok Shop': 'Complete TikTok Shop electronics qualification and battery declaration',
            'Shopify / own store': 'No marketplace approval gate — complete legal market access',
            'Other marketplace': 'Confirm this marketplace’s policy and complete market access'
        };
        return {
            code: 'not_ready',
            answer: 'NOT READY TO LIST',
            label: platformLabels[platform] || `Confirm ${platform || 'platform'} requirements and market access`,
            reason: `${platformGateDecision.reason} Separately, ${consumerConclusion.label.toLowerCase()}. Platform approval cannot replace legal market-access evidence.`
        };
    }

    function buildProcurementDecision({ marketDecision, verdict, requirements, documentGaps, economics, unanswered, supplierEvidence = [], consumerConclusion, platformDecision }) {
        if (supplierEvidence.some((item) => item.status === 'suspected_mismatch')) {
            return { code: 'change_supplier', answer: 'DO NOT PURCHASE', label: 'Change supplier or demand corrected evidence', reason: 'At least one uploaded file appears to reference a different model.' };
        }
        if (verdict === 'high_risk') {
            return { code: 'do_not_buy_yet', answer: 'DO NOT PURCHASE YET', label: 'Specialist review must be completed first', reason: 'A medical, child-directed, or other specialist gate must be resolved before committing inventory.' };
        }
        if (unanswered.length) {
            return { code: 'information_needed', answer: 'DO NOT PURCHASE YET', label: 'Product information is incomplete', reason: 'Material product facts are still unknown.' };
        }
        if (!['basic_ready', 'provisionally_ready', 'evidence_checked'].includes(consumerConclusion.code)) {
            const gate = primaryRegulatoryGate(requirements);
            return {
                code: 'market_not_ready', answer: 'DO NOT PURCHASE YET',
                label: gate ? `Do not pay the balance before verifying ${gate.title}` : 'Resolve market-access evidence first',
                reason: consumerConclusion.reason
            };
        }
        if (platformDecision.code === 'not_ready') {
            return { code: 'platform_not_ready', answer: 'DO NOT PURCHASE YET', label: 'The selected sales channel is not ready', reason: platformDecision.reason };
        }
        if (economics && economics.complete && economics.marginRate < 0) {
            return { code: 'not_recommended', answer: 'NOT RECOMMENDED', label: 'The entered economics produce a loss', reason: 'The entered selling price does not cover the estimated landed and channel costs.' };
        }
        if (economics && economics.complete && economics.marginRate < 0.15) {
            return { code: 'renegotiate', answer: 'RENEGOTIATE FIRST', label: 'The estimated margin is too narrow', reason: 'The estimated gross contribution is below 15%, leaving little room for returns, ads, or price changes.' };
        }
        if (documentGaps.length) {
            const gate = primaryRegulatoryGate(requirements);
            return {
                code: 'conditional_buy',
                answer: 'PURCHASE ONLY AFTER CONDITIONS ARE MET',
                label: gate ? `Do not pay the balance before verifying ${gate.title}` : 'Verify the exact model before paying the balance',
                reason: gate
                    ? `The supplier must provide acceptable exact-model evidence for: ${gate.docs.join(', ')}.`
                    : marketDecision.detail
            };
        }
        if (['evidence_needed', 'policy_unknown'].includes(platformDecision.code)) {
            return { code: 'conditional_buy', answer: 'PURCHASE ONLY AFTER CONDITIONS ARE MET', label: 'Confirm the sales channel before ordering', reason: platformDecision.reason };
        }
        return { code: 'ready_for_po_review', answer: 'SUITABLE FOR PO REVIEW', label: 'No blocking pre-check gap was identified', reason: 'No blocking gap was identified from the answers, but final model and tariff verification is still required.' };
    }

    function buildContractConditions(requirements) {
        const docs = Array.from(new Set(requirements.filter((item) => !['advisory', 'future'].includes(item.severity)).flatMap((item) => item.docs)));
        return [
            'All reports and certificates must identify the exact ordered model, radio module, battery, hardware revision, and manufacturer.',
            'Supplier must replace or refund goods if submitted evidence is false, expired, unrelated to the model, or rejected by the target-market authority or platform.',
            `Attach before balance payment: ${docs.join('; ')}.`,
            'No firmware, component, battery, label, packaging, or listing-claim change without written approval and evidence re-check.'
        ];
    }

    function assess(input) {
        const detected = extractProfile(input.description);
        const profile = mergeProfile(detected, input.attributes);
        const productDefaults = modelApi.getProduct(profile.productType).defaults || {};
        Object.entries(productDefaults).forEach(([key, value]) => {
            if (profile[key] === UNKNOWN) profile[key] = value;
        });
        const product = modelApi.getProduct(profile.productType);
        const coverageStatus = coverageForProfile(profile, input.description);
        const requirements = marketRequirements(input.market, profile);
        const marketCoverage = marketCoverageForProfile(input.market, profile, coverageStatus.supported, requirements);
        const allUnanswered = getFollowUpQuestions(profile);
        const blockingQuestionKeys = Array.isArray(input.blockingQuestionKeys)
            ? new Set(input.blockingQuestionKeys)
            : null;
        const unanswered = input.assessmentMode === 'quick' && blockingQuestionKeys
            ? allUnanswered.filter((item) => blockingQuestionKeys.has(item.key))
            : allUnanswered;
        const deferredQuestions = allUnanswered.filter((item) => !unanswered.some((blocking) => blocking.key === item.key));
        const sourceFreshness = summarizeSourceFreshness(requirements);
        const availableDocs = new Set(input.documents || []);
        const documentGaps = requirements.filter((item) => !['advisory', 'future'].includes(item.severity)).flatMap((item) => item.docs
            .filter((doc) => !availableDocs.has(item.id) && !availableDocs.has(doc))
            .map((doc) => ({ requirementId: item.id, requirement: item.title, document: doc })));
        const highRisk = requirements.some((item) => item.severity === 'high');
        let verdict = 'conditional';
        if (highRisk) {
            verdict = 'high_risk';
        } else if (unanswered.length) {
            verdict = 'information_missing';
        } else if (!documentGaps.length) {
            verdict = 'feasible_precheck';
        }
        const marketDecision = buildMarketDecision({ requirements, unanswered, documentGaps });
        const verdictLabel = marketDecision.label;
        const tariffOptions = buildTariffOptions(input, product);
        const selectedTariff = tariffOptions.find((row) => row.exact && row.rate !== null)
            || tariffOptions.find((row) => row.rate !== null)
            || tariffOptions.find((row) => row.importTaxBenchmarkRate > 0)
            || null;
        const economics = estimateEconomics(input.costs, selectedTariff, input.market);
        const commercialConclusion = buildCommercialConclusion(economics);
        const supplierEvidenceInput = { ...(input.supplierEvidence || {}), market: input.market };
        const supplierEvidence = analyzeSupplierEvidence(supplierEvidenceInput);
        const consumerConclusion = buildConsumerConclusion({
            requirements,
            unanswered,
            evidenceAnswers: input.evidenceAnswers || {},
            supplierEvidence
        });
        const sellerConclusion = buildSellerConclusion({
            coverage: coverageStatus,
            consumerConclusion,
            requirements,
            unanswered
        });
        const decisionTrace = buildDecisionTrace({
            profile, requirements, evidenceAnswers: input.evidenceAnswers || {}, supplierEvidence,
            conclusion: consumerConclusion
        });
        const platformRules = modelApi.getPlatformRules(input.platform, profile, input.market);
        const platformGateDecision = modelApi.getPlatformDecision(input.platform, profile, input.evidenceAnswers || {});
        const platformDecision = reconcilePlatformDecision(input.platform, platformGateDecision, consumerConclusion);
        const procurement = buildProcurementDecision({
            marketDecision, verdict, requirements, documentGaps, economics, unanswered, supplierEvidence,
            consumerConclusion, platformDecision
        });
        const supplierRequest = buildSupplierRequest({
            requirements,
            evidenceAnswers: input.evidenceAnswers || {},
            supplierEvidence,
            requiredModel: supplierEvidenceInput.requiredModel,
            market: input.market,
            platform: input.platform,
            profile,
            tariffOptions
        });
        const sellerActionPlan = buildSellerActionPlan({
            coverage: coverageStatus, procurement, supplierRequest, requirements, unanswered, platformDecision
        });
        return {
            verdict,
            marketTargets: [input.market],
            verdictLabel,
            verdictDetail: marketDecision.detail,
            marketDecision,
            consumerConclusion,
            sellerConclusion,
            decisionTrace,
            profile,
            unanswered,
            deferredQuestions,
            requirements,
            sourceFreshness,
            productGuidance: guidanceForProduct(profile.productType),
            documentGaps,
            product: {
                id: profile.productType,
                label: product.label,
                candidateHs: product.candidateHs,
                hsNote: product.hsNote
            },
            tariffOptions,
            selectedTariff,
            economics,
            commercialConclusion,
            procurement,
            supplierEvidence,
            supplierRequest,
            sellerActionPlan,
            platformRules,
            platformGateDecision,
            platformDecision,
            contractConditions: buildContractConditions(requirements),
            coverage: marketCoverage.level,
            coverageStatus,
            marketCoverage,
            shipping: profile.battery === true ? 'Restricted battery shipment — carrier acceptance required' : 'No lithium-battery restriction identified from the answers',
            platform: `${input.platform || 'Marketplace'} may request the same evidence, but platform approval does not replace legal market-access checks.`,
            nextActions: [
                unanswered.length ? 'Answer the remaining product questions.' : 'Lock the product specification and intended listing claims.',
                deferredQuestions.length ? 'Confirm remaining non-blocking specifications before final filing.' : null,
                'Ask the supplier for every missing document listed below.',
                'Confirm the exact HS classification and duty before pricing.',
                'Verify certificates against the exact model before placing the purchase order.'
            ].filter(Boolean),
            assistant: {
                summary: procurement.reason,
                followUps: unanswered.map((item) => item.label),
                answerPrompts: [
                    'Why is this procurement decision conditional?',
                    'Which supplier documents are still missing?',
                    'What must be written into the purchase order?',
                    'How does the landed-cost estimate change if my selling price changes?'
                ]
            },
            disclaimer: 'Preliminary screening only. This result is based on the product facts provided, may not cover every rule, and is not customs or legal advice.'
        };
    }

    function assessAnz(input) {
        const australia = assess({ ...input, market: 'AU', exactHsCode: input.exactHsCodeAu || input.exactHsCode || '' });
        const newZealand = assess({ ...input, market: 'NZ', exactHsCode: input.exactHsCodeNz || input.exactHsCode || '' });
        const rank = { high_risk: 4, information_missing: 3, conditional: 2, feasible_precheck: 1 };
        const primary = (rank[australia.verdict] || 0) >= (rank[newZealand.verdict] || 0) ? australia : newZealand;
        const requirements = [
            ...australia.requirements.map((item) => ({ ...item, jurisdiction: item.id === 'classification' || item.id === 'battery' || item.id === 'privacy' || item.id === 'privacy_features' || item.id === 'children' ? 'SHARED' : 'AU' })),
            ...newZealand.requirements
                .filter((item) => !['classification', 'battery', 'privacy', 'privacy_features', 'children'].includes(item.id))
                .map((item) => ({ ...item, jurisdiction: 'NZ' }))
        ];
        const unanswered = [...australia.unanswered, ...newZealand.unanswered]
            .filter((item, index, rows) => rows.findIndex((row) => row.key === item.key) === index);
        const documentGaps = [...australia.documentGaps, ...newZealand.documentGaps]
            .filter((item, index, rows) => rows.findIndex((row) => row.requirementId === item.requirementId && row.document === item.document) === index);
        const sharedEvidence = [
            'Exact product, model, manufacturer and hardware revision',
            ...(primary.profile.battery === true ? ['UN38.3 test summary, SDS, cell/pack specification and packaging configuration'] : []),
            ...(primary.profile.bluetooth === true || primary.profile.wifi === true || primary.profile.cellular === true || primary.profile.radioTransmitter === true ? ['Radio test reports, enabled frequency bands, module and antenna specification'] : []),
            ...(primary.profile.mainsPowered === true || primary.profile.bundledAdapter === true ? ['Electrical safety reports and a separate exact-model record for each external adaptor'] : []),
            ...(primary.profile.cameraMic === true ? ['Camera/microphone disclosure, data-flow map and security-update policy'] : [])
        ];
        const supplierRequest = buildSupplierRequest({
            requirements,
            evidenceAnswers: input.evidenceAnswers || {},
            supplierEvidence: primary.supplierEvidence,
            requiredModel: input.supplierEvidence?.requiredModel,
            market: 'Australia + New Zealand',
            platform: input.platform,
            profile: primary.profile,
            tariffOptions: [
                ...australia.tariffOptions.map((row) => ({ ...row, market: 'AU' })),
                ...newZealand.tariffOptions.map((row) => ({ ...row, market: 'NZ' }))
            ]
        });
        return {
            ...primary,
            marketTargets: ['AU', 'NZ'],
            requirements,
            unanswered,
            documentGaps,
            deferredQuestions: [...australia.deferredQuestions, ...newZealand.deferredQuestions]
                .filter((item, index, rows) => rows.findIndex((row) => row.key === item.key) === index),
            sourceFreshness: summarizeSourceFreshness(requirements),
            supplierEvidence: primary.supplierEvidence,
            supplierRequest,
            contractConditions: buildContractConditions(requirements),
            tariffOptions: [
                ...australia.tariffOptions.map((row) => ({ ...row, market: 'AU' })),
                ...newZealand.tariffOptions.map((row) => ({ ...row, market: 'NZ' }))
            ],
            selectedTariff: null,
            economics: null,
            economicsByMarket: { AU: australia.economics, NZ: newZealand.economics },
            economicsNote: 'Australia and New Zealand are calculated separately using their own GST, import-value and border-fee treatment. Exact duty remains pending until the national tariff line is confirmed.',
            commercialConclusion: {
                code: 'not_calculated',
                answer: 'Calculate each market separately',
                label: 'ANZ costs are not combined',
                reason: 'Australia and New Zealand require separate landed-cost calculations.'
            },
            marketCoverage: {
                level: 'deep',
                label: 'Maintained ANZ comparison coverage',
                detail: 'Australia and New Zealand are assessed separately. Shared evidence is identified, but local supplier, registration, declaration and marking duties are not treated as automatically transferable.'
            },
            jurisdictionResults: { AU: australia, NZ: newZealand },
            anzComparison: {
                sharedEvidence,
                australiaActions: australia.requirements.filter((item) => item.id.startsWith('au_')).map((item) => item.title),
                newZealandActions: newZealand.requirements.filter((item) => item.id.startsWith('nz_')).map((item) => item.title),
                reusableWithConditions: ['Underlying test reports may be reusable only when the exact model, manufacturer, hardware, radio module, antenna, battery, standards and report scope all match.'],
                notAutomaticallyTransferable: ['Responsible-supplier or importer registration', 'EESS equipment registration', 'New Zealand licence to supply radio equipment', 'SDoC signatory responsibility', 'RCM / R-NZ labelling route and local compliance records'],
                missingFacts: unanswered.map((item) => item.label),
                professionalConfirmation: requirements.filter((item) => item.coverageLevel === 'monitor_professional_confirmation_required' || item.requirementClass === 'scope_check').map((item) => item.title)
            },
            disclaimer: 'Preliminary ANZ screening only. Australia and New Zealand are separate jurisdictions; evidence portability is conditional. This result may not cover every rule and is not customs or legal advice.'
        };
    }

    return {
        UNKNOWN, detectProductType, detectOutsideCategory, coverageForProfile, marketCoverageForProfile, guidanceForProduct, summarizeSourceFreshness, extractProfile, materialQuestionKeys, getFollowUpQuestions,
        evidenceQuestionDefinitions, evidenceQuestionsForRequirements, platformEvidenceQuestions, buildAssessmentMatrix, marketRequirements,
        analyzeSupplierEvidence, productSpecificSupplierDocuments, buildSupplierRequest,
        buildDecisionTrace, buildSellerActionPlan,
        findDutySignal, conditionalTariffMeasures, estimateEconomics, assess, assessAnz, buildReviewContact
    };
}));
