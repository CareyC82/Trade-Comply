'use strict';

(function exposeWearableModels(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TradeComplyWearableModels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createWearableModels() {
    const reviewedAt = '2026-07-29';

    const sources = {
        fcc: {
            authority: 'U.S. Federal Communications Commission',
            title: 'Equipment Authorization Procedures',
            url: 'https://www.fcc.gov/general/equipment-authorization-procedures',
            reviewedAt,
            confidence: 'official',
            scope: 'RF devices must follow the applicable authorization path before U.S. marketing or importation.'
        },
        fccExposure: {
            authority: 'FCC Office of Engineering and Technology',
            title: 'KDB 447498 — Mobile and Portable Device RF Exposure',
            url: 'https://apps.fcc.gov/oetcf/kdb/forms/FTSSearchResultPage.cfm?id=20676&switch=P',
            reviewedAt,
            confidence: 'official_guidance',
            scope: 'Body-worn and portable transmitters require RF-exposure evaluation under the applicable FCC procedures.'
        },
        fda: {
            authority: 'U.S. Food and Drug Administration',
            title: 'How to Determine if Your Product is a Medical Device',
            url: 'https://www.fda.gov/medical-devices/classify-your-medical-device/how-determine-if-your-product-medical-device',
            reviewedAt,
            confidence: 'official',
            scope: 'Intended use and medical claims determine whether a wearable may be a medical device.'
        },
        red: {
            authority: 'European Commission',
            title: 'Radio Equipment Directive',
            url: 'https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Radio equipment placed on the EU market must satisfy RED conformity and documentation obligations.'
        },
        rohs: {
            authority: 'European Commission',
            title: 'RoHS Directive',
            url: 'https://environment.ec.europa.eu/topics/waste-and-recycling/rohs-directive_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Electrical and electronic equipment is subject to restricted-substance requirements; WEEE obligations are separate.'
        },
        gpsr: {
            authority: 'European Commission',
            title: 'General Product Safety Regulation (EU) 2023/988',
            url: 'https://commission.europa.eu/document/download/a281b150-19fd-44f9-bef8-c6018f9c4792_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Consumer products require safety, traceability, responsible-person, and online-offer information controls.'
        },
        mdr: {
            authority: 'European Commission',
            title: 'Medical Devices Regulation overview',
            url: 'https://health.ec.europa.eu/medical-devices-new-regulations/overview_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Medical intended purpose can bring a wearable within Regulation (EU) 2017/745.'
        },
        battery: {
            authority: 'United Nations Economic Commission for Europe',
            title: 'UN Manual of Tests and Criteria — subsection 38.3',
            url: 'https://unece.org/transport/dangerous-goods/manual-tests-and-criteria-rev8',
            reviewedAt,
            confidence: 'official',
            scope: 'Lithium cell and battery types must meet the applicable transport testing and test-summary requirements.'
        }
    };

    const products = {
        smart_watch: {
            label: 'Smart watch',
            match: /smart\s*watch|\bwatch\b/i,
            candidateHs: ['8517.13', '8517.62'],
            hsNote: 'Classification depends on whether telephony/data communication or another principal function dominates.',
            defaults: { bluetooth: true, battery: true },
            priorityQuestions: ['cellular', 'healthMonitoring', 'medicalClaim', 'childUse']
        },
        smart_ring: {
            label: 'Smart ring',
            match: /smart\s*ring/i,
            candidateHs: ['8517.62', '8543.70'],
            hsNote: 'Communication function, sensors, and principal function must be confirmed.',
            defaults: { bluetooth: true, battery: true },
            priorityQuestions: ['healthMonitoring', 'medicalClaim', 'wirelessCharging']
        },
        fitness_tracker: {
            label: 'Fitness band / tracker',
            match: /fitness\s*(band|tracker)|smart\s*band|activity\s*tracker/i,
            candidateHs: ['8517.62', '9029.10'],
            hsNote: 'Communication versus measuring/counting function can change classification.',
            defaults: { bluetooth: true, battery: true, healthMonitoring: true },
            priorityQuestions: ['medicalClaim', 'display', 'gps']
        },
        kids_gps_watch: {
            label: 'Kids GPS watch',
            match: /(child|children|kid).*(watch|tracker)|(watch|tracker).*(child|children|kid)/i,
            candidateHs: ['8517.13', '8517.62'],
            hsNote: 'Voice calling, cellular connectivity, and tracking functions drive classification review.',
            defaults: { cellular: true, battery: true, childUse: true },
            priorityQuestions: ['cameraMic', 'gps', 'healthMonitoring']
        },
        earbuds: {
            label: 'Bluetooth earbuds',
            match: /earbuds?|headphones?|headset/i,
            candidateHs: ['8518.30'],
            hsNote: 'Confirm whether the shipment includes a charging case or other separately classifiable components.',
            defaults: { bluetooth: true, battery: true, cameraMic: true },
            priorityQuestions: ['noiseCancellation', 'wirelessCharging']
        },
        smart_glasses: {
            label: 'Smart glasses',
            match: /smart\s*glasses|ar\s*glasses|augmented\s*reality\s*glasses/i,
            candidateHs: ['9004.90', '8528.52'],
            hsNote: 'Optical function, integrated display, camera, and computing function can lead to different headings.',
            defaults: { battery: true },
            priorityQuestions: ['cameraMic', 'display', 'bluetooth', 'wifi']
        },
        wearable_other: {
            label: 'Other smart wearable',
            match: /wearable/i,
            candidateHs: [],
            hsNote: 'A product-specific classification analysis is required.',
            defaults: {},
            priorityQuestions: []
        }
    };

    function listProducts() {
        return Object.entries(products).map(([id, value]) => ({ id, ...value }));
    }

    function getProduct(id) {
        return products[id] || products.wearable_other;
    }

    return { reviewedAt, sources, products, listProducts, getProduct };
}));
