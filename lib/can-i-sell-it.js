'use strict';

(function exposeCanISellIt(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.TradeComplyCanISellIt = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCanISellIt() {
    const UNKNOWN = 'unknown';

    function normalizeBoolean(value) {
        if (value === true || value === 'yes') return true;
        if (value === false || value === 'no') return false;
        return UNKNOWN;
    }

    function detectProductType(text) {
        if (/smart\s*ring/i.test(text)) return 'smart_ring';
        if (/fitness\s*(band|tracker)|smart\s*band/i.test(text)) return 'fitness_tracker';
        if (/earbuds?|headphones?/i.test(text)) return 'earbuds';
        if (/smart\s*watch|watch/i.test(text)) return 'smart_watch';
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
            cameraMic: detect(/\b(camera|microphone|voice record)\w*/i, /no\s+(camera|microphone)/i)
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
            cameraMic: 'Does it include a camera or microphone?'
        }[key];
    }

    function getFollowUpQuestions(profile) {
        return Object.keys(profile)
            .filter((key) => key !== 'productType' && profile[key] === UNKNOWN)
            .map((key) => ({ key, label: questionFor(key) }));
    }

    function requirement(id, title, reason, docs, severity = 'required') {
        return { id, title, reason, docs, severity };
    }

    function marketRequirements(market, profile) {
        const requirements = [
            requirement('classification', 'Confirm the exact customs classification', 'The final duty and filing treatment depend on the product’s principal function and exact tariff line.', ['Product specification', 'Function statement', 'Candidate HS code'])
        ];
        const hasRadio = profile.bluetooth === true || profile.wifi === true || profile.cellular === true;

        if (market === 'US') {
            if (hasRadio) requirements.push(requirement('fcc', 'FCC equipment authorization', 'Wireless transmitters need the correct equipment-authorization path, labeling, and RF evidence.', ['FCC ID / grant', 'RF test report', 'Label artwork']));
            if (profile.medicalClaim === true) requirements.push(requirement('fda', 'FDA device-scope review', 'Medical claims may turn a consumer wearable into a regulated medical device.', ['Intended-use statement', 'Claims matrix', 'FDA pathway evidence'], 'high'));
            if (profile.childUse === true) requirements.push(requirement('children', 'Children’s product and privacy review', 'Child-directed products can trigger additional product-safety, tracking, and privacy duties.', ['Age-grading rationale', 'Privacy/data-flow map', 'Applicable test evidence'], 'high'));
        } else if (market === 'EU') {
            if (hasRadio) requirements.push(requirement('red', 'CE / Radio Equipment Directive conformity', 'Connected wearables need an EU conformity assessment, technical file, declaration, and labeling.', ['EU Declaration of Conformity', 'RED test reports', 'CE label artwork']));
            requirements.push(requirement('rohs', 'RoHS, REACH, WEEE and producer-responsibility review', 'Electronics, materials, packaging, and end-of-life obligations affect EU market access.', ['RoHS report', 'REACH/SVHC declaration', 'WEEE/EPR registration evidence']));
            if (profile.medicalClaim === true) requirements.push(requirement('mdr', 'EU medical-device scope review', 'Diagnostic or treatment claims can bring the wearable within the MDR.', ['Intended-use statement', 'Claims matrix', 'MDR classification rationale'], 'high'));
        } else {
            requirements.push(requirement('local_radio', 'Local radio and product-safety approval', 'This market currently has basic coverage; confirm the local type-approval and importer obligations before listing.', ['Radio specification', 'Existing test reports', 'Local importer details']));
        }

        if (profile.battery === true) {
            requirements.push(requirement('battery', 'Lithium-battery transport evidence', 'Small-parcel carriers and fulfillment networks usually require battery configuration and transport evidence.', ['UN38.3 test summary', 'SDS', 'Battery specification', 'Packaging configuration']));
        }
        if (profile.healthMonitoring === true) {
            requirements.push(requirement('privacy', 'Health-data and claims review', 'Biometric features create privacy, substantiation, and listing-copy risk even without a medical claim.', ['Data-flow map', 'Privacy notice', 'Claims substantiation']));
        }
        if (profile.cameraMic === true) {
            requirements.push(requirement('privacy_features', 'Camera / microphone privacy review', 'Recording features require clear disclosure, permissions, and platform-compatible listing copy.', ['Feature disclosure', 'Permission flow', 'Privacy notice']));
        }
        return requirements;
    }

    function assess(input) {
        const detected = extractProfile(input.description);
        const profile = mergeProfile(detected, input.attributes);
        const unanswered = getFollowUpQuestions(profile);
        const requirements = marketRequirements(input.market, profile);
        const availableDocs = new Set(input.documents || []);
        const documentGaps = requirements.flatMap((item) => item.docs
            .filter((doc) => !availableDocs.has(item.id) && !availableDocs.has(doc))
            .map((doc) => ({ requirementId: item.id, requirement: item.title, document: doc })));
        const highRisk = requirements.some((item) => item.severity === 'high');
        let verdict = 'conditional';
        let verdictLabel = 'Conditionally feasible';
        if (unanswered.length) {
            verdict = 'information_missing';
            verdictLabel = 'More product information needed';
        } else if (highRisk) {
            verdict = 'high_risk';
            verdictLabel = 'Specialist review needed';
        } else if (!documentGaps.length) {
            verdict = 'feasible_precheck';
            verdictLabel = 'Ready for final verification';
        }
        return {
            verdict,
            verdictLabel,
            profile,
            unanswered,
            requirements,
            documentGaps,
            coverage: ['US', 'EU'].includes(input.market) ? 'deep' : 'basic',
            shipping: profile.battery === true ? 'Restricted battery shipment — carrier acceptance required' : 'No lithium-battery restriction identified from the answers',
            platform: `${input.platform || 'Marketplace'} may request the same evidence, but platform approval does not replace legal market-access checks.`,
            nextActions: [
                unanswered.length ? 'Answer the remaining product questions.' : 'Lock the product specification and intended listing claims.',
                'Ask the supplier for every missing document listed below.',
                'Confirm the exact HS classification and duty before pricing.',
                'Verify certificates against the exact model before placing the purchase order.'
            ],
            disclaimer: 'Pre-screening only. The result is based on the product facts provided and does not constitute customs or legal advice.'
        };
    }

    return { UNKNOWN, extractProfile, getFollowUpQuestions, assess };
}));
