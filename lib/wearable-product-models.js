'use strict';

(function exposeWearableModels(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TradeComplyWearableModels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createWearableModels() {
    const reviewedAt = '2026-07-30';

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
        },
        jpRadio: {
            authority: 'Japan Ministry of Internal Affairs and Communications',
            title: 'Technical Regulations Conformity Certification',
            url: 'https://www.tele.soumu.go.jp/e/sys/equ/tech/',
            reviewedAt,
            confidence: 'official',
            scope: 'Radio equipment for Japan must follow the applicable technical-conformity route and marking conditions.'
        },
        jpPse: {
            authority: 'Japan Ministry of Economy, Trade and Industry',
            title: 'Electrical Appliances and Materials Safety Act',
            url: 'https://www.meti.go.jp/english/policy/economy/consumer/pse/index.html',
            reviewedAt,
            confidence: 'official',
            scope: 'Covered appliances, AC adapters and secondary batteries require importer, conformity, inspection and PSE review.'
        },
        sgImda: {
            authority: 'Singapore IMDA',
            title: 'Telecommunication Equipment Registration',
            url: 'https://www.imda.gov.sg/regulations-and-licensing-listing/equipment-registration',
            reviewedAt,
            confidence: 'official',
            scope: 'Telecommunication and radio equipment sold for local use may require dealer licensing and IMDA registration.'
        },
        sgSafety: {
            authority: 'Enterprise Singapore',
            title: 'Consumer Protection (Safety Requirements) Registration Scheme',
            url: 'https://www.consumerproductsafety.gov.sg/suppliers/cpsr/',
            reviewedAt,
            confidence: 'official',
            scope: 'Controlled goods require supplier registration, conformity evidence and SAFETY Mark before Singapore sale.'
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
        charger: {
            label: 'Charger / power adapter',
            match: /\b(gan|usb|wall|fast)?\s*(charger|power adapter|ac adapter|power supply)\b/i,
            candidateHs: ['8504.40'],
            hsNote: 'Power rating, AC input, included cables and whether it is bundled with another product affect treatment.',
            defaults: { battery: false, mainsPowered: true },
            priorityQuestions: ['bluetooth', 'wifi', 'mainsPowered']
        },
        power_bank: {
            label: 'Power bank',
            match: /\b(power\s*bank|portable charger|external battery)\b/i,
            candidateHs: ['8507.60'],
            hsNote: 'Battery chemistry, capacity, charging function and standalone battery treatment must be confirmed.',
            defaults: { battery: true },
            priorityQuestions: ['wirelessCharging', 'display']
        },
        beauty_device: {
            label: 'Electronic beauty device',
            match: /\b(beauty device|facial device|led mask|skin care device|hair removal|ipl)\b/i,
            candidateHs: ['8543.70', '9019.10'],
            hsNote: 'Operating technology, intended use and cosmetic versus medical claims can change classification and regulatory scope.',
            defaults: {},
            priorityQuestions: ['battery', 'mainsPowered', 'medicalClaim', 'healthMonitoring']
        },
        kids_electronics: {
            label: 'Children’s electronic product',
            match: /\b(kids?|child(?:ren)?).*(electronic|camera|tablet|tracker|toy)|(electronic|camera|tablet|tracker|toy).*(kids?|child(?:ren)?)\b/i,
            candidateHs: ['9503.00', '8525.89', '8471.30'],
            hsNote: 'Age grading, play value, camera/computing function and principal use determine classification.',
            defaults: { childUse: true },
            priorityQuestions: ['battery', 'bluetooth', 'wifi', 'cameraMic', 'gps']
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

    const platformRules = {
        Amazon: [
            {
                id: 'amazon-restrictions',
                title: 'Restricted-product and category approval check',
                applies: () => true,
                action: 'Check the exact category and ASIN compliance requests before buying inventory.',
                source: {
                    authority: 'Amazon',
                    title: 'Selling online — restrictions and international requirements',
                    url: 'https://sell.amazon.com/sell-online',
                    reviewedAt,
                    confidence: 'platform_guidance'
                }
            },
            {
                id: 'amazon-battery',
                title: 'Battery and dangerous-goods data may be requested',
                applies: (profile) => profile.battery === true,
                action: 'Prepare battery chemistry, capacity, UN38.3 evidence, SDS, model number, product images and carrier/FBA classification data.',
                source: {
                    authority: 'Amazon Seller Central',
                    title: 'Product safety and lithium-battery compliance guidance',
                    url: 'https://sellercentral.amazon.com/seller-forums/discussions/t/64fa1f9f-ddd5-4d21-a16f-b69cb5770aef',
                    reviewedAt,
                    confidence: 'platform_staff_guidance'
                }
            }
        ],
        'TikTok Shop': [
            {
                id: 'tiktok-electronics',
                title: 'Electronics category qualification',
                applies: () => true,
                action: 'Confirm category-level or product-level qualification and upload the requested seller and product evidence.',
                source: {
                    authority: 'TikTok Shop Seller University',
                    title: 'Electronic Products Requirements',
                    url: 'https://seller-us.tiktok.com/university/essay?default_language=en&knowledge_id=1418345612003114',
                    reviewedAt,
                    confidence: 'platform_policy'
                }
            },
            {
                id: 'tiktok-battery',
                title: 'Battery listing declaration',
                applies: (profile) => profile.battery === true,
                action: 'Declare chemistry, voltage, capacity, rechargeable status and built-in/removable configuration; prepare required compliance information.',
                source: {
                    authority: 'TikTok Shop Seller University',
                    title: 'Guidelines to Listing Products Containing Batteries',
                    url: 'https://seller-us.tiktok.com/university/essay?knowledge_id=1601290456188686',
                    reviewedAt,
                    confidence: 'platform_policy'
                }
            }
        ]
    };

    function listProducts() {
        return Object.entries(products).map(([id, value]) => ({ id, ...value }));
    }

    function getProduct(id) {
        return products[id] || products.wearable_other;
    }

    function getPlatformRules(platform, profile) {
        return (platformRules[platform] || [])
            .filter((rule) => rule.applies(profile))
            .map(({ applies, ...rule }) => rule);
    }

    function getPlatformDecision(platform, profile) {
        const hasBattery = profile.battery === true;
        const hasRadio = [profile.bluetooth, profile.wifi, profile.cellular].some((value) => value === true);
        if (platform === 'Amazon') {
            const extra = [
                hasRadio ? 'exact-model radio compliance evidence' : null,
                hasBattery ? 'battery and dangerous-goods information' : null
            ].filter(Boolean);
            return {
                code: 'amazon_review',
                answer: 'Prepare for an Amazon compliance review',
                label: 'Amazon listing is conditional',
                reason: extra.length
                    ? `Before ordering, obtain ${extra.join(' and ')} plus the documents required for the selected category and ASIN.`
                    : 'Check category restrictions and any ASIN-level document requests before ordering inventory.'
            };
        }
        if (platform === 'TikTok Shop') {
            return {
                code: 'tiktok_qualification',
                answer: 'Complete TikTok Shop electronics qualification',
                label: 'TikTok Shop listing is conditional',
                reason: hasBattery
                    ? 'Prepare the product qualification evidence and a complete battery declaration before listing.'
                    : 'Confirm the electronics category qualification and upload the requested product evidence before listing.'
            };
        }
        if (platform === 'Shopify / own store') {
            return {
                code: 'merchant_responsible',
                answer: 'No marketplace pre-approval step identified',
                label: 'You control the storefront',
                reason: 'You remain responsible for legal market access, product claims, payment-provider rules, recalls and carrier acceptance.'
            };
        }
        return {
            code: 'policy_check',
            answer: 'Check the marketplace before ordering',
            label: 'Platform readiness is not yet confirmed',
            reason: 'The selected marketplace is not identified, so its category restrictions, evidence requests and approval process cannot be determined.'
        };
    }

    return { reviewedAt, sources, products, platformRules, listProducts, getProduct, getPlatformRules, getPlatformDecision };
}));
