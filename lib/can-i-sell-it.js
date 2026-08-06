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
        const ordered = [
            'power_bank', 'charger', 'beauty_device', 'kids_electronics',
            'kids_gps_watch', 'smart_ring', 'fitness_tracker', 'earbuds', 'smart_glasses', 'smart_watch'
        ];
        const match = ordered.find((id) => modelApi?.products?.[id]?.match?.test(String(text || '')));
        if (match) return match;
        return 'wearable_other';
    }

    function extractProfile(description) {
        const text = String(description || '').trim();
        const detect = (positive, negative) => {
            if (negative && negative.test(text)) return false;
            return positive.test(text) ? true : UNKNOWN;
        };
        return {
            productType: detectProductType(text),
            bluetooth: detect(/\bbluetooth\b|\bble\b/i, /no\s+bluetooth/i),
            wifi: detect(/\bwi-?fi\b/i, /no\s+wi-?fi/i),
            cellular: detect(/\b(4g|5g|lte|cellular|e-?sim)\b/i, /no\s+(cellular|sim)/i),
            battery: detect(/\b(battery|rechargeable|mah|lithium)\b/i, /no\s+battery/i),
            healthMonitoring: detect(/\b(heart|ecg|spo2|oxygen|sleep|health|blood pressure|glucose)\b/i),
            medicalClaim: detect(/\b(diagnos|treat|prevent|medical grade|clinical|detect disease)\w*/i, /\bno\s+medical\s+claims?\b/i),
            childUse: detect(/\b(child|children|kid|minor)\w*/i),
            cameraMic: detect(/\b(camera|microphone|voice record)\w*/i, /no\s+(camera|microphone)/i),
            gps: detect(/\bgps\b|\blocation\s+track/i, /no\s+gps/i),
            display: detect(/\b(display|screen|oled|lcd|ar)\b/i, /no\s+(display|screen)/i),
            wirelessCharging: detect(/\b(wireless|qi)\s+charg/i, /no\s+wireless\s+charg/i),
            noiseCancellation: detect(/\b(anc|noise\s+cancell)/i, /no\s+(anc|noise\s+cancell)/i)
            ,
            mainsPowered: detect(/\b(ac input|mains|wall plug|100-?240v|power adapter)\b/i, /battery only|no\s+(mains|ac input)/i)
        };
    }

    function mergeProfile(detected, supplied) {
        const result = { ...detected };
        Object.entries(supplied || {}).forEach(([key, value]) => {
            result[key] = key === 'productType' ? value : normalizeBoolean(value);
        });
        return result;
    }

    function questionFor(key) {
        return {
            bluetooth: 'Does it use Bluetooth?',
            wifi: 'Does it connect to Wi-Fi?',
            cellular: 'Does it contain cellular / eSIM connectivity?',
            battery: 'Does it contain a rechargeable lithium battery?',
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
        }[productType] || [];
        return Array.from(new Set([...shared, ...(product.priorityQuestions || [])]))
            .filter((key) => !exclusions.includes(key));
    }

    function getFollowUpQuestions(profile) {
        return materialQuestionKeys(profile.productType)
            .filter((key) => profile[key] === UNKNOWN)
            .map((key) => ({ key, label: questionFor(key) }));
    }

    function requirement(id, title, reason, docs, severity = 'required', sourceIds = []) {
        return {
            id, title, reason, docs, severity,
            sources: sourceIds.map((sourceId) => ({ id: sourceId, ...modelApi.sources[sourceId] })).filter((item) => item.url)
        };
    }

    const evidenceQuestionDefinitions = {
        fcc: [
            { key: 'fccGrant', label: 'Valid FCC ID / Grant for this exact model', docs: ['FCC ID / grant'], kinds: ['FCC'] },
            { key: 'rfExposure', label: 'RF exposure / SAR evidence for this exact model', docs: ['RF exposure / SAR evidence'], kinds: ['FCC'] }
        ],
        red: [
            { key: 'redEvidence', label: 'EU RED reports and Declaration of Conformity for this exact model', docs: ['EU Declaration of Conformity', 'RED test reports'], kinds: ['CE / RED'] }
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
        sg_imda: [
            { key: 'sgImdaEvidence', label: 'Singapore IMDA registration / SDoC for this exact model', docs: ['IMDA registration / SDoC'], kinds: ['IMDA'] }
        ],
        sg_safety: [
            { key: 'sgSafetyEvidence', label: 'Applicable Singapore SAFETY Mark evidence for this exact model', docs: ['CPSR registration', 'SAFETY Mark artwork'], kinds: ['SAFETY Mark'] }
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

    function buildAssessmentMatrix(markets = ['US', 'EU', 'JP', 'SG']) {
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
        const requirements = [
            requirement('classification', 'Confirm the exact customs classification', 'The final duty and filing treatment depend on the product’s principal function and exact tariff line.', ['Product specification', 'Function statement', 'Candidate HS code'])
        ];
        const hasRadio = profile.bluetooth === true || profile.wifi === true || profile.cellular === true;

        if (market === 'US') {
            if (hasRadio) requirements.push(requirement('fcc', 'FCC equipment authorization and RF exposure', 'Wireless body-worn transmitters need the correct equipment-authorization path, labeling, and RF-exposure evidence.', ['FCC ID / grant', 'RF test report', 'RF exposure / SAR evidence', 'Label artwork'], 'required', ['fcc', 'fccExposure']));
            if (profile.medicalClaim === true) requirements.push(requirement('fda', 'FDA device-scope review', 'Medical claims may turn a consumer wearable into a regulated medical device.', ['Intended-use statement', 'Claims matrix', 'FDA pathway evidence'], 'high', ['fda']));
            if (profile.childUse === true) requirements.push(requirement('children', 'Children’s product and privacy review', 'Child-directed products can trigger additional product-safety, tracking, and privacy duties.', ['Age-grading rationale', 'Privacy/data-flow map', 'Applicable test evidence'], 'high'));
        } else if (market === 'EU') {
            if (hasRadio) requirements.push(requirement('red', 'CE / Radio Equipment Directive conformity', 'Connected wearables need an EU conformity assessment, technical file, declaration, and labeling.', ['EU Declaration of Conformity', 'RED test reports', 'CE label artwork'], 'required', ['red']));
            requirements.push(requirement('rohs', 'RoHS, REACH, WEEE and producer-responsibility review', 'Electronics, materials, packaging, and end-of-life obligations affect EU market access.', ['RoHS report', 'REACH/SVHC declaration', 'WEEE/EPR registration evidence'], 'required', ['rohs']));
            requirements.push(requirement('gpsr', 'EU consumer-product traceability and online-offer review', 'The listing and product pack need manufacturer, EU responsible-person, safety, warning, and traceability information.', ['EU responsible-person details', 'Traceability / label artwork', 'Risk assessment'], 'required', ['gpsr']));
            if (profile.medicalClaim === true) requirements.push(requirement('mdr', 'EU medical-device scope review', 'Diagnostic or treatment claims can bring the wearable within the MDR.', ['Intended-use statement', 'Claims matrix', 'MDR classification rationale'], 'high', ['mdr']));
        } else if (market === 'JP') {
            if (hasRadio) requirements.push(requirement('jp_radio', 'Japan radio technical-conformity review', 'Bluetooth, Wi-Fi and cellular functions require the applicable certification scope, module/antenna conditions and mark display.', ['Japan radio certificate', 'Module and antenna specification', 'Technical-conformity mark artwork'], 'required', ['jpRadio']));
            if (profile.mainsPowered === true || ['charger', 'power_bank'].includes(profile.productType)) {
                requirements.push(requirement('jp_pse', 'Japan PSE scope and importer review', 'Covered AC adapters, electrical appliances and secondary batteries require product-scope, importer, inspection and marking checks.', ['PSE scope rationale', 'Conformity/test evidence', 'Importer notification and inspection records', 'PSE label artwork'], 'required', ['jpPse']));
            }
            if (profile.medicalClaim === true) requirements.push(requirement('jp_medical', 'Japan medical-device scope review', 'Medical intended use may trigger PMD Act classification and local authorization responsibilities.', ['Intended-use and claims matrix', 'PMD Act pathway rationale', 'Japan MAH/importer evidence'], 'high'));
        } else if (market === 'SG') {
            if (hasRadio) requirements.push(requirement('sg_imda', 'Singapore IMDA registration and dealer review', 'Radio and telecommunication equipment for local sale may require IMDA standards evidence, registration and a licensed local dealer.', ['IMDA registration / SDoC', 'Radio test reports', 'Dealer licence evidence', 'Compliance label artwork'], 'required', ['sgImda']));
            if (profile.mainsPowered === true || profile.productType === 'charger') {
                requirements.push(requirement('sg_safety', 'Singapore controlled-goods / SAFETY Mark scope review', 'Some mains-powered consumer products require CPSR registration and SAFETY Mark before local sale.', ['Controlled-goods scope rationale', 'Safety test report', 'CPSR registration', 'SAFETY Mark artwork'], 'required', ['sgSafety']));
            }
            if (profile.medicalClaim === true) requirements.push(requirement('sg_medical', 'Singapore health-product scope review', 'Medical claims may require HSA device classification, registration and dealer/importer responsibilities.', ['Claims matrix', 'HSA classification rationale', 'Local registrant/importer evidence'], 'high'));
        } else {
            requirements.push(requirement('local_radio', 'Local radio and product-safety approval', 'This market currently has basic coverage; confirm the local type-approval and importer obligations before listing.', ['Radio specification', 'Existing test reports', 'Local importer details']));
        }

        if (profile.battery === true) {
            requirements.push(requirement('battery', 'Lithium-battery transport evidence', 'Small-parcel carriers and fulfillment networks usually require battery configuration and transport evidence.', ['UN38.3 test summary', 'SDS', 'Battery specification', 'Packaging configuration'], 'required', ['battery']));
        }
        if (profile.healthMonitoring === true) {
            requirements.push(requirement('privacy', 'Health-data and claims review', 'Biometric features create privacy, substantiation, and listing-copy risk even without a medical claim.', ['Data-flow map', 'Privacy notice', 'Claims substantiation']));
        }
        if (profile.cameraMic === true) {
            requirements.push(requirement('privacy_features', 'Camera / microphone privacy review', 'Recording features require clear disclosure, permissions, and platform-compatible listing copy.', ['Feature disclosure', 'Permission flow', 'Privacy notice']));
        }
        if (profile.childUse === true && !requirements.some((item) => item.id === 'children')) {
            requirements.push(requirement('children', 'Children’s product safety and privacy review', 'Age grading, small parts, battery access, tracking, recording and child-data practices require a dedicated review.', ['Age grading', 'Child safety test evidence', 'Battery-compartment evidence', 'Child privacy/data-flow map'], 'high'));
        }
        return requirements;
    }

    function analyzeSupplierEvidence({ files = [], supplierModel = '', requiredModel = '', documentText = '' } = {}) {
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
                                : /pse/.test(name) ? 'PSE'
                                    : /imda/.test(name) ? 'IMDA'
                                        : /safety.?mark|cpsr/.test(name) ? 'SAFETY Mark'
                                            : /giteki|japan.?radio|mic.?cert/.test(name) ? 'Japan Radio'
                                        : 'Unclassified evidence';
            return {
                name: file.name || 'unnamed file',
                size: Number(file.size || 0),
                kind,
                status: file.status === 'model_mismatch' ? 'suspected_mismatch'
                    : file.status === 'parsed_incomplete' ? 'incomplete_parse'
                    : file.status === 'parsed' && fileModelMatch === 'matched' ? 'model_matched'
                    : file.status === 'parsed' ? 'server_parsed'
                    : file.status === 'verification_failed' ? 'unable_to_verify'
                    : !supported ? 'unsupported'
                    : fileModelMatch === 'mismatch' ? 'suspected_mismatch'
                        : fileModelMatch === 'matched' ? 'model_matched'
                            : 'unable_to_verify',
                modelMatch: fileModelMatch,
                extracted: {
                    model: parsing.model || '', manufacturer: parsing.manufacturer || '',
                    reportNumber: parsing.reportNumber || '', reportDate: parsing.reportDate || '',
                    standards: parsing.standards || [], fccId: parsing.fccId || '',
                    batteryModel: parsing.batteryModel || '', missingFields: parsing.missingFields || []
                },
                note: file.note || (!supported
                    ? 'Unsupported file type.'
                    : fileModelMatch === 'matched'
                        ? `Model text matches the entered product model.${parsing.missingFields?.length ? ` Missing extracted fields: ${parsing.missingFields.join(', ')}.` : ''} Authenticity, scope and issuing body still require verification.`
                        : fileModelMatch === 'mismatch'
                            ? 'Supplier/document model does not match the intended product model.'
                            : 'File received, but the browser could not verify its internal model, date, pages, standard or authenticity.')
            };
        });
    }

    function numberOrNull(value) {
        if (value === '' || value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeHs(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function findDutySignal({ origin, market, hsCode, dutyRates }) {
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
        const override = (rule.exact_code_overrides || [])
            .filter((row) => {
                const code = normalizeHs(row.hs_code);
                return code && (normalizedHs.startsWith(code) || code.startsWith(normalizedHs));
            })
            .sort((a, b) => normalizeHs(b.hs_code).length - normalizeHs(a.hs_code).length)[0];
        const baseRate = numberOrNull(override?.base_rate ?? rule.base_rate) || 0;
        const layers = Array.isArray(rule.add_on_layers) ? rule.add_on_layers : [];
        const taxLayers = layers.filter((layer) => /(vat|gst|tax|consumption)/i.test(`${layer.type || ''} ${layer.label || ''}`));
        const tradeLayers = layers.filter((layer) => !taxLayers.includes(layer));
        const additionalRate = tradeLayers.length
            ? tradeLayers.reduce((sum, layer) => sum + (numberOrNull(layer.rate) || 0), 0)
            : (taxLayers.length ? 0 : (numberOrNull(rule.additional_rate) || 0));
        return {
            hsCode,
            rate: baseRate + additionalRate,
            baseRate,
            additionalRate,
            importTaxBenchmarkRate: taxLayers.reduce((sum, layer) => sum + (numberOrNull(layer.rate) || 0), 0),
            sourceStatus: override?.source_status || rule.source_status || 'indicative',
            confidence: override?.confidence || rule.confidence || 'route signal',
            sourceUrl: override?.source_url || rule.source_url || '',
            sourceText: override?.source_rate_text || rule.source_note || '',
            lastCheckedAt: override?.last_checked_at || rule.last_checked_at || dutyRates.generated_at || '',
            exact: Boolean(override)
        };
    }

    function buildTariffOptions(input, product) {
        return product.candidateHs.map((hsCode) => findDutySignal({
            origin: input.origin,
            market: input.market,
            hsCode,
            dutyRates: input.dutyRates
        }) || {
            hsCode,
            rate: null,
            sourceStatus: 'not_covered',
            confidence: 'classification and rate confirmation required',
            sourceUrl: '',
            sourceText: '',
            lastCheckedAt: '',
            exact: false
        });
    }

    function estimateEconomics(costs = {}, tariffSignal = null) {
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
        const customsValue = purchaseUnit * quantity + freightTotal + insuranceTotal;
        const duty = dutyRate === null || dutyRate === undefined ? null : customsValue * dutyRate;
        const importTax = (customsValue + (duty || 0)) * importTaxRate;
        const landedTotal = customsValue + otherImportTotal + (duty || 0) + importTax;
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
            duty,
            dutyRate,
            dutyRateBasis: enteredDutyRate === null ? (tariffSignal ? 'maintained_candidate' : 'missing') : 'user_entered',
            importTax,
            importTaxRate,
            importTaxRateBasis: enteredImportTaxRate === null && tariffSignal?.importTaxBenchmarkRate
                ? 'maintained_benchmark'
                : 'user_entered',
            landedTotal,
            landedUnit,
            platformFeeUnit,
            profitUnit,
            marginRate,
            breakEvenPrice,
            complete: duty !== null,
            caveat: 'Planning estimate only. Customs value, import tax recoverability, platform fees, returns, storage, advertising, and exact tariff treatment may differ.'
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
            ['jp_pse', 'sg_safety'],
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
        const hasElectricalSafety = ids.has('jp_pse') || ids.has('sg_safety');
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
            .filter((item) => item.status === 'model_matched')
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
        const matched = supplierEvidence.filter((item) => item.status === 'model_matched').length;
        const mismatched = supplierEvidence.filter((item) => item.status === 'suspected_mismatch').length;
        if (matched || mismatched) trace.push(`Uploaded file model check: ${matched} matched${mismatched ? `, ${mismatched} mismatched` : ''}.`);
        trace.push(`Conclusion → ${conclusion.answer}: ${conclusion.label}.`);
        return trace;
    }

    function reconcilePlatformDecision(platform, platformGateDecision, consumerConclusion) {
        const marketReady = ['basic_ready', 'provisionally_ready', 'evidence_checked'].includes(consumerConclusion.code);
        if (marketReady) return platformGateDecision;
        return {
            code: 'not_ready',
            answer: 'NOT READY TO LIST',
            label: platformGateDecision.code === 'ready'
                ? `${platform || 'Platform'} gate cleared, but market access is not ready`
                : 'Resolve market access before listing',
            reason: `${consumerConclusion.label}. Platform approval cannot replace legal market-access evidence.`
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
        const docs = Array.from(new Set(requirements.flatMap((item) => item.docs)));
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
        const allUnanswered = getFollowUpQuestions(profile);
        const blockingQuestionKeys = Array.isArray(input.blockingQuestionKeys)
            ? new Set(input.blockingQuestionKeys)
            : null;
        const unanswered = input.assessmentMode === 'quick' && blockingQuestionKeys
            ? allUnanswered.filter((item) => blockingQuestionKeys.has(item.key))
            : allUnanswered;
        const deferredQuestions = allUnanswered.filter((item) => !unanswered.some((blocking) => blocking.key === item.key));
        const requirements = marketRequirements(input.market, profile);
        const availableDocs = new Set(input.documents || []);
        const documentGaps = requirements.flatMap((item) => item.docs
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
            || null;
        const economics = estimateEconomics(input.costs, selectedTariff);
        const commercialConclusion = buildCommercialConclusion(economics);
        const supplierEvidence = analyzeSupplierEvidence(input.supplierEvidence);
        const consumerConclusion = buildConsumerConclusion({
            requirements,
            unanswered,
            evidenceAnswers: input.evidenceAnswers || {},
            supplierEvidence
        });
        const decisionTrace = buildDecisionTrace({
            profile, requirements, evidenceAnswers: input.evidenceAnswers || {}, supplierEvidence,
            conclusion: consumerConclusion
        });
        const platformRules = modelApi.getPlatformRules(input.platform, profile);
        const platformGateDecision = modelApi.getPlatformDecision(input.platform, profile, input.evidenceAnswers || {});
        const platformDecision = reconcilePlatformDecision(input.platform, platformGateDecision, consumerConclusion);
        const procurement = buildProcurementDecision({
            marketDecision, verdict, requirements, documentGaps, economics, unanswered, supplierEvidence,
            consumerConclusion, platformDecision
        });
        return {
            verdict,
            verdictLabel,
            verdictDetail: marketDecision.detail,
            marketDecision,
            consumerConclusion,
            decisionTrace,
            profile,
            unanswered,
            deferredQuestions,
            requirements,
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
            platformRules,
            platformGateDecision,
            platformDecision,
            contractConditions: buildContractConditions(requirements),
            coverage: ['US', 'EU', 'JP', 'SG'].includes(input.market) ? 'deep' : 'basic',
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
            disclaimer: 'Pre-screening only. The result is based on the product facts provided and does not constitute customs or legal advice.'
        };
    }

    return {
        UNKNOWN, detectProductType, extractProfile, materialQuestionKeys, getFollowUpQuestions,
        evidenceQuestionDefinitions, evidenceQuestionsForRequirements, platformEvidenceQuestions, buildAssessmentMatrix, marketRequirements,
        buildDecisionTrace,
        findDutySignal, estimateEconomics, analyzeSupplierEvidence, assess
    };
}));
