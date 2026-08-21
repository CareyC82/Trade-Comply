'use strict';

(function exposeWearableModels(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TradeComplyWearableModels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createWearableModels() {
    const reviewedAt = '2026-08-21';

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
        fccMarketplace2026: {
            authority: 'U.S. Federal Communications Commission',
            title: 'FCC 26-50 — online marketplace equipment-authorization rules',
            url: 'https://docs.fcc.gov/public/attachments/FCC-26-50A1.pdf',
            reviewedAt,
            confidence: 'official_pending_effective_date',
            lifecycle: { status: 'published_pending_effective_date', publishedAt: '2026-08-20', effectiveAt: null, transition: '180 or 270 days after Federal Register publication, depending on marketplace category' },
            scope: 'New or materially updated marketplace listings for certified RF devices will face FCC ID display and validation duties after the applicable Federal Register transition period; small-seller and used-device exceptions are fact-specific.'
        },
        usElectrical: {
            authority: 'U.S. Occupational Safety and Health Administration',
            title: 'Nationally Recognized Testing Laboratory Program',
            url: 'https://www.osha.gov/nationally-recognized-testing-laboratory-program',
            reviewedAt,
            confidence: 'official',
            scope: 'Electrical product safety evidence and certification scope should be checked for the exact mains-powered configuration.'
        },
        fda: {
            authority: 'U.S. Food and Drug Administration',
            title: 'How to Determine if Your Product is a Medical Device',
            url: 'https://www.fda.gov/medical-devices/classify-your-medical-device/how-determine-if-your-product-medical-device',
            reviewedAt,
            confidence: 'official',
            scope: 'Intended use and medical claims determine whether a wearable may be a medical device.'
        },
        ftcIot: {
            authority: 'U.S. Federal Trade Commission',
            title: 'Careful Connections: Keeping the Internet of Things Secure',
            url: 'https://www.ftc.gov/business-guidance/resources/careful-connections-keeping-internet-things-secure',
            reviewedAt,
            confidence: 'official_guidance',
            scope: 'Connected-device makers should account for collected data, disclosures, security design and ongoing support.'
        },
        coppa: {
            authority: 'U.S. Federal Trade Commission',
            title: "Children's Online Privacy Protection Rule",
            url: 'https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa',
            reviewedAt,
            confidence: 'official',
            scope: 'Child-directed online services and services with actual knowledge of collection from a child under 13 must assess COPPA requirements.'
        },
        cpscChildren: {
            authority: 'U.S. Consumer Product Safety Commission',
            title: "Children's Product Certificate",
            url: 'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate',
            reviewedAt,
            confidence: 'official',
            scope: 'Covered children’s products require applicable third-party testing and a Children’s Product Certificate tied to the product.'
        },
        red: {
            authority: 'European Commission',
            title: 'Radio Equipment Directive',
            url: 'https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Radio equipment placed on the EU market must satisfy RED conformity and documentation obligations.'
        },
        redCyber: {
            authority: 'European Union — EUR-Lex',
            title: 'Delegated Regulation (EU) 2022/30 — RED cybersecurity requirements',
            url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R0030',
            reviewedAt,
            confidence: 'official',
            lifecycle: { status: 'active', effectiveAt: '2025-08-01' },
            scope: 'Applicable internet-connected, child-directed and wearable radio equipment must address network protection, privacy and fraud requirements from 1 August 2025.'
        },
        lvd: {
            authority: 'European Commission',
            title: 'Low Voltage Directive',
            url: 'https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/low-voltage-directive-lvd_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Electrical equipment within the voltage scope requires safety conformity assessment, technical documentation and CE obligations.'
        },
        rohs: {
            authority: 'European Commission',
            title: 'RoHS Directive',
            url: 'https://environment.ec.europa.eu/topics/waste-and-recycling/rohs-directive_en',
            reviewedAt,
            confidence: 'official',
            scope: 'Electrical and electronic equipment is subject to restricted-substance requirements; WEEE obligations are separate.'
        },
        euBattery: {
            authority: 'European Commission',
            title: 'EU Batteries Regulation and 2026 removability guidance',
            url: 'https://environment.ec.europa.eu/topics/waste-and-recycling/batteries_en',
            reviewedAt,
            confidence: 'official',
            lifecycle: { status: 'future', effectiveAt: '2027-02-18' },
            scope: 'Battery compliance obligations are phased; Article 11 portable-battery removability and replaceability requirements apply from 18 February 2027 with product-specific derogations.'
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
        edpbVideo: {
            authority: 'European Data Protection Board',
            title: 'Guidelines 3/2019 on processing of personal data through video devices',
            url: 'https://www.edpb.europa.eu/documents/guideline/guidelines-32019-on-processing-of-personal-data-through-video-devices_en',
            reviewedAt,
            confidence: 'official_guidance',
            scope: 'Video-device processing requires a lawful basis, transparency, purpose controls and safeguards under the GDPR.'
        },
        gdpr: {
            authority: 'European Union — EUR-Lex',
            title: 'Regulation (EU) 2016/679 — General Data Protection Regulation',
            url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
            reviewedAt,
            confidence: 'official',
            scope: 'Personal-data processing, including biometric and children’s data, requires an applicable lawful basis, transparency and safeguards.'
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
            url: 'https://www.meti.go.jp/policy/consumer/seian/denan/',
            reviewedAt,
            confidence: 'official',
            scope: 'Covered appliances, AC adapters and secondary batteries require importer, conformity, inspection and PSE review.'
        },
        jpOnlineSeller: {
            authority: 'Japan Ministry of Economy, Trade and Industry',
            title: 'Product safety for online transactions and overseas sellers',
            url: 'https://www.meti.go.jp/product_safety/consumer/system/06.html',
            reviewedAt,
            confidence: 'official',
            lifecycle: { status: 'active', effectiveAt: '2025-12-25' },
            scope: 'From 25 December 2025, covered overseas direct sellers may be notification subjects under Japan’s four product-safety laws and must appoint a domestic responsible person.'
        },
        jpPseProducts: {
            authority: 'Japan Ministry of Economy, Trade and Industry',
            title: 'Non-specified electrical appliances and materials — product list',
            url: 'https://www.meti.go.jp/policy/consumer/seian/denan/non_specified_electrical.html',
            reviewedAt,
            confidence: 'official',
            scope: 'The statutory product list includes scoped categories such as electric shavers, fans, projectors, lighting equipment and certain electronic equipment; ratings and definitions determine coverage.'
        },
        jpProductSafety: {
            authority: 'Japan Ministry of Economy, Trade and Industry',
            title: 'Product Safety',
            url: 'https://www.meti.go.jp/english/policy/economy/consumer/',
            reviewedAt,
            confidence: 'official',
            scope: 'Businesses must determine which of Japan’s product-safety acts applies and retain the applicable safety, importer and incident-response evidence.'
        },
        jpIoTSecurity: {
            authority: 'Information-technology Promotion Agency, Japan',
            title: 'Japan Cyber STAR — IoT product security labelling scheme',
            url: 'https://www.ipa.go.jp/en/security/jc-star/index.html',
            reviewedAt,
            confidence: 'official_program',
            scope: 'JC-STAR provides graded security-conformance labels for consumer IoT products; applicability and procurement expectations should be checked without treating the voluntary label as universal market authorization.'
        },
        jpPrivacy: {
            authority: 'Japan Personal Information Protection Commission',
            title: 'Act on the Protection of Personal Information — laws and guidance',
            url: 'https://www.ppc.go.jp/en/legal/',
            reviewedAt,
            confidence: 'official',
            scope: 'Products that capture identifiable images, audio or other personal data require purpose, notice, security and data-handling review.'
        },
        sgImda: {
            authority: 'Singapore IMDA',
            title: 'Telecommunication Equipment Registration',
            url: 'https://iris.imda.gov.sg/guide/equipment-registration-guide',
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
        },
        sgControlledGoods: {
            authority: 'Singapore Consumer Product Safety Office',
            title: 'List of controlled goods',
            url: 'https://www.consumerproductsafety.gov.sg/suppliers/cpsr/list-of-controlled-goods/',
            reviewedAt,
            confidence: 'official',
            scope: 'The current 33 controlled-goods categories define product scope, risk tier and minimum standards for items including AC adaptors, fans, lighting and relevant household audio/video products.'
        },
        sgGeneralSafety: {
            authority: 'Singapore Consumer Product Safety Office',
            title: 'Supplying consumer goods under the CGSR',
            url: 'https://www.consumerproductsafety.gov.sg/suppliers/cgsr/',
            reviewedAt,
            confidence: 'official',
            scope: 'General consumer goods outside the controlled-goods list must still meet applicable internationally accepted safety standards under the CGSR.'
        },
        sgIoTSecurity: {
            authority: 'Cyber Security Agency of Singapore',
            title: 'Cybersecurity Labelling Scheme for consumer IoT',
            url: 'https://www.csa.gov.sg/our-programmes/certification-and-labelling-schemes/cybersecurity-labelling-scheme/about/',
            reviewedAt,
            confidence: 'official_program',
            scope: 'CLS covers consumer IoT categories including smart cameras, lighting, speakers, toys, home robots, hubs and trackers; check product and channel expectations without treating it as universal market authorization.'
        },
        sgPrivacy: {
            authority: 'Singapore Personal Data Protection Commission',
            title: 'Advisory Guidelines on the PDPA for Selected Topics',
            url: 'https://www.pdpc.gov.sg/guidelines-and-consultation/2020/02/advisory-guidelines-on-the-personal-data-protection-act-for-selected-topics',
            reviewedAt,
            confidence: 'official_guidance',
            scope: 'Photography, video and audio products require appropriate notification, purpose, consent and protection controls when personal data is handled.'
        },
        sgChildrenPrivacy: {
            authority: 'Singapore Personal Data Protection Commission',
            title: "Advisory Guidelines on the PDPA for Children's Personal Data in the Digital Environment",
            url: 'https://www.pdpc.gov.sg/guidelines-and-consultation/2024/03/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment',
            reviewedAt,
            confidence: 'official_guidance',
            scope: 'The PDPC guidance explains how Singapore PDPA obligations apply to children’s personal data in digital products and services.'
        }
    };

    const marketScopeMappings = {
        JP: {
            smart_light: { category: 'LED lamp / lighting equipment', trigger: 'mains_not_false', sourceId: 'jpPseProducts' },
            gaming_controller: { category: 'electronic game equipment', trigger: 'mains_not_false', sourceId: 'jpPseProducts' },
            mini_projector: { category: 'reflective projector / projection equipment', trigger: 'mains_not_false', sourceId: 'jpPseProducts' },
            portable_fan: { category: 'fan or circulator within statutory ratings', trigger: 'mains_not_false', sourceId: 'jpPseProducts' },
            electric_shaver: { category: 'electric shaver / grooming motor appliance', trigger: 'mains_not_false', sourceId: 'jpPseProducts' },
            video_doorbell: { category: 'intercom / signalling equipment', trigger: 'mains_not_false', sourceId: 'jpPseProducts' }
        },
        SG: {
            security_camera: { category: 'mains-fed audio/video product or bundled AC adaptor', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            smart_light: { category: 'table/standing lamp, lamp control gear or bundled AC adaptor', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            mini_projector: { category: 'mains-fed audio/video product or bundled AC adaptor', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            portable_fan: { category: 'ceiling, table, standing or wall fan', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            electric_shaver: { category: 'bundled AC adaptor for shaver', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            video_doorbell: { category: 'audio/video product, signalling equipment or bundled AC adaptor', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' },
            baby_monitor: { category: 'audio/video product or bundled AC adaptor', trigger: 'mains_not_false', sourceId: 'sgControlledGoods' }
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
        bluetooth_speaker: {
            label: 'Bluetooth speaker',
            match: /\b(bluetooth|wireless)\s+(portable\s+)?(speakers?|loudspeakers?)\b|\bportable\s+bluetooth\s+(speakers?|loudspeakers?)\b/i,
            candidateHs: ['8518.21', '8518.22'],
            hsNote: 'Speaker configuration, enclosure count, radio function and bundled battery affect classification.',
            defaults: { bluetooth: true },
            priorityQuestions: ['battery', 'mainsPowered']
        },
        wireless_microphone: {
            label: 'Wireless microphone',
            match: /\b(wireless|cordless|bluetooth|2\.4\s*ghz|uhf)\s+(lavalier\s+|lapel\s+)?(microphones?|mics?)\b/i,
            candidateHs: ['8518.10'],
            hsNote: 'Confirm the transmitter, receiver, operating band and whether the set contains separately classifiable components.',
            defaults: { cameraMic: true, radioTransmitter: true },
            priorityQuestions: ['battery', 'bluetooth']
        },
        security_camera: {
            label: 'IP / security camera',
            match: /\b(ip|network|security|surveillance|wi-?fi|wireless)\s+(video\s+)?cameras?\b|\bcctv\s+cameras?\b/i,
            candidateHs: ['8525.89'],
            hsNote: 'Recording, transmission, storage and principal camera function must be confirmed.',
            defaults: { cameraMic: true },
            priorityQuestions: ['wifi', 'battery']
        },
        wifi_router: {
            label: 'Wi-Fi router',
            match: /\bwi-?fi\s+(routers?|gateways?|access\s+points?)\b|\bwireless\s+(routers?|access\s+points?)\b|\bmesh\s+wi-?fi\b/i,
            candidateHs: ['8517.62'],
            hsNote: 'Routing, switching, modem and cellular gateway functions affect classification and approval scope.',
            defaults: { wifi: true, mainsPowered: true },
            priorityQuestions: ['cellular', 'battery']
        },
        smart_plug: {
            label: 'Smart plug',
            match: /\b(smart|connected|wi-?fi)\s+(wall\s+)?(plugs?|outlets?|sockets?)\b/i,
            candidateHs: ['8536.69', '8537.10'],
            hsNote: 'Switching function, voltage, current rating and control electronics determine classification.',
            defaults: { mainsPowered: true },
            priorityQuestions: ['wifi', 'bluetooth']
        },
        smart_light: {
            label: 'Connected smart light / LED light',
            match: /\b(smart|connected|wi-?fi|bluetooth)\s+(led\s+)?(lights?|bulbs?|lamps?|light\s*strips?)\b/i,
            candidateHs: ['8539.52', '9405.42'],
            hsNote: 'Light source, fixture, control electronics and power configuration affect classification.',
            defaults: {},
            priorityQuestions: ['wifi', 'mainsPowered']
        },
        wireless_keyboard: {
            label: 'Wireless keyboard',
            match: /\b(wireless|bluetooth|2\.4\s*ghz)\s+(computer\s+)?keyboards?\b/i,
            candidateHs: ['8471.60'],
            hsNote: 'Confirm whether the shipment includes a radio receiver, battery or other input devices.',
            defaults: { radioTransmitter: true },
            priorityQuestions: ['bluetooth', 'battery']
        },
        wireless_mouse: {
            label: 'Wireless mouse',
            match: /\b(wireless|bluetooth|2\.4\s*ghz)\s+(computer\s+)?mice\b|\b(wireless|bluetooth|2\.4\s*ghz)\s+mouse\b/i,
            candidateHs: ['8471.60'],
            hsNote: 'Confirm the radio receiver, battery configuration and whether it is sold as part of a set.',
            defaults: { radioTransmitter: true },
            priorityQuestions: ['bluetooth', 'battery']
        },
        gaming_controller: {
            label: 'Gaming controller',
            match: /\b(wireless\s+|bluetooth\s+|usb\s+|wired\s+)?(gaming|game)\s+(controllers?|gamepads?)\b|\b(wireless|wired|usb)\s+gamepads?\b/i,
            candidateHs: ['9504.50', '8471.60'],
            hsNote: 'Dedicated console use, computer input function, radio and bundled accessories affect classification.',
            defaults: {},
            priorityQuestions: ['radioTransmitter', 'battery']
        },
        mini_projector: {
            label: 'Mini projector',
            match: /\b(mini|portable|pocket|pico|smart)\s+(video\s+)?projectors?\b/i,
            candidateHs: ['8528.62', '8528.69'],
            hsNote: 'Display technology, computer compatibility, tuner function and portability affect classification.',
            defaults: { display: true },
            priorityQuestions: ['wifi', 'battery']
        },
        usb_hub: {
            label: 'USB hub / docking station',
            match: /\b(usb(?:-c)?\s+)?(hubs?|docking\s+stations?|docks?)\b/i,
            candidateHs: ['8471.80', '8517.62'],
            hsNote: 'Data switching, networking, video output and power-delivery functions must be confirmed.',
            defaults: {},
            priorityQuestions: ['mainsPowered', 'radioTransmitter']
        },
        tablet: {
            label: 'Tablet computer',
            match: /\btablets?\s+(computers?|pcs?)\b|\bipad\b|\bandroid\s+tablets?\b/i,
            candidateHs: ['8471.30'],
            hsNote: 'Confirm computing function, cellular capability, keyboard bundling and exact configuration.',
            defaults: { wifi: true, bluetooth: true, battery: true, display: true },
            priorityQuestions: ['cellular', 'childUse']
        },
        e_reader: {
            label: 'E-reader',
            match: /\b(e-?readers?|e-?books?\s+readers?|electronic\s+book\s+readers?|kindle)\b/i,
            candidateHs: ['8471.30', '8543.70'],
            hsNote: 'General computing capability, display technology and connectivity affect classification.',
            defaults: { wifi: true, battery: true, display: true },
            priorityQuestions: ['cellular', 'childUse']
        },
        portable_fan: {
            label: 'USB / rechargeable portable fan',
            match: /\b(usb|rechargeable|battery(?:-powered)?)\s+(portable\s+|handheld\s+|desk\s+)?fans?\b|\bportable\s+(usb|rechargeable)\s+fans?\b/i,
            candidateHs: ['8414.51'],
            hsNote: 'Motor output, size, mounting and power source affect classification and safety scope.',
            defaults: {},
            priorityQuestions: ['battery', 'mainsPowered']
        },
        electric_shaver: {
            label: 'Electric shaver',
            match: /\b(electric|rechargeable|cordless|mains(?:[- ]powered)?|corded)\s+(shavers?|razors?|beard\s+trimmers?)\b/i,
            candidateHs: ['8510.10'],
            hsNote: 'Shaving or trimming function, motor, battery and mains-use configuration affect treatment.',
            defaults: {},
            priorityQuestions: ['battery', 'mainsPowered']
        },
        webcam: {
            label: 'Webcam / USB camera',
            match: /\b(web\s*cams?|webcams?|usb\s+(video\s+)?cameras?|computer\s+cameras?)\b/i,
            candidateHs: ['8525.89'],
            hsNote: 'USB-only versus wireless transmission, integrated microphone and standalone camera function affect classification and requirements.',
            defaults: { cameraMic: true },
            priorityQuestions: ['wifi', 'radioTransmitter']
        },
        dash_camera: {
            label: 'Dash camera',
            match: /\b(dash\s*cams?|dashboard\s+cameras?|car\s+dash\s+recorders?|driving\s+recorders?)\b/i,
            candidateHs: ['8525.89'],
            hsNote: 'Recording, wireless transfer, GPS and bundled display functions affect classification and privacy review.',
            defaults: { cameraMic: true },
            priorityQuestions: ['wifi', 'gps']
        },
        video_doorbell: {
            label: 'Video doorbell',
            match: /\b(video|smart|wi-?fi|wireless)\s+door\s*bells?\b|\bdoor\s*bell\s+cameras?\b/i,
            candidateHs: ['8531.80', '8525.89'],
            hsNote: 'Signalling, camera, radio, mains transformer and battery functions may require separate classification review.',
            defaults: { cameraMic: true },
            priorityQuestions: ['wifi', 'battery']
        },
        baby_monitor: {
            label: 'Baby monitor',
            match: /\b(baby|infant|nursery)\s+(video\s+|audio\s+|smart\s+)?monitors?\b/i,
            candidateHs: ['8525.89', '8517.62'],
            hsNote: 'Camera/audio, radio link, internet connection and child-directed monitoring functions determine classification and specialist review.',
            defaults: { cameraMic: true, childUse: true },
            priorityQuestions: ['wifi', 'radioTransmitter']
        },
        robot_vacuum: {
            label: 'Robot vacuum cleaner',
            match: /\b(robot(?:ic)?\s+(vacuum|cleaner)s?|robo\s*vac(?:uum)?s?)\b/i,
            candidateHs: ['8508.11', '8508.19'],
            hsNote: 'Motor power, dust capacity, charging dock, battery and wireless mapping functions affect classification and safety scope.',
            defaults: { battery: true, mainsPowered: true },
            priorityQuestions: ['wifi', 'cameraMic']
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
                id: 'amazon-fcc-id-readiness',
                title: 'Prepare for FCC ID display and validation changes',
                applies: (profile, market) => market === 'US' && [profile.bluetooth, profile.wifi, profile.cellular, profile.radioTransmitter].some((value) => value === true),
                action: 'Keep the exact-model FCC ID and grant ready. FCC 26-50 transition dates depend on Federal Register publication, so verify the effective date before treating this as a listing block.',
                source: sources.fccMarketplace2026
            },
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
                id: 'tiktok-fcc-id-readiness',
                title: 'Prepare for FCC ID display and validation changes',
                applies: (profile, market) => market === 'US' && [profile.bluetooth, profile.wifi, profile.cellular, profile.radioTransmitter].some((value) => value === true),
                action: 'Keep the exact-model FCC ID and grant ready. FCC 26-50 transition dates depend on Federal Register publication, so verify the effective date before treating this as a listing block.',
                source: sources.fccMarketplace2026
            },
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

    function getPlatformRules(platform, profile, market) {
        return (platformRules[platform] || [])
            .filter((rule) => rule.applies(profile, market))
            .map(({ applies, ...rule }) => rule);
    }

    function getPlatformDecision(platform, profile, evidenceAnswers = {}) {
        const hasBattery = profile.battery === true;
        const hasRadio = [profile.bluetooth, profile.wifi, profile.cellular, profile.radioTransmitter].some((value) => value === true);
        const answer = (key) => {
            const raw = evidenceAnswers[key]?.value ?? evidenceAnswers[key];
            if (raw === true || raw === 'yes') return true;
            if (raw === false || raw === 'no') return false;
            return null;
        };
        const decide = (keys, readyReason, missingReason) => {
            const values = keys.map(answer);
            if (values.some((value) => value === false)) {
                return { code: 'not_ready', answer: 'NOT READY TO LIST', label: 'Platform approval was not obtained', reason: missingReason };
            }
            if (values.some((value) => value === null)) {
                return { code: 'evidence_needed', answer: 'MORE EVIDENCE NEEDED', label: 'Platform readiness is not confirmed', reason: missingReason };
            }
            return { code: 'ready', answer: 'READY TO LIST', label: 'Platform approval checks were confirmed', reason: readyReason };
        };
        if (platform === 'Amazon') {
            const extra = [
                hasRadio ? 'exact-model radio compliance evidence' : null,
                hasBattery ? 'battery and dangerous-goods information' : null
            ].filter(Boolean);
            const keys = ['amazonListingApproval', hasBattery ? 'amazonDangerousGoods' : null].filter(Boolean);
            return decide(
                keys,
                'You confirmed the applicable Amazon category / ASIN review and battery review. Keep the approval evidence with the exact listing and model records.',
                extra.length
                    ? `Confirm Amazon approval and provide ${extra.join(' and ')} plus any category or ASIN documents before listing.`
                    : 'Confirm the applicable Amazon category and ASIN compliance review before listing.'
            );
        }
        if (platform === 'TikTok Shop') {
            const keys = ['tiktokElectronicsQualification', hasBattery ? 'tiktokBatteryDeclaration' : null].filter(Boolean);
            return decide(
                keys,
                'You confirmed the applicable TikTok Shop category qualification and battery declaration. Keep the acceptance evidence with the listing records.',
                hasBattery
                    ? 'Obtain TikTok Shop electronics qualification and battery-declaration acceptance before listing.'
                    : 'Obtain TikTok Shop electronics category qualification before listing.'
            );
        }
        if (platform === 'Shopify / own store') {
            return {
                code: 'ready',
                answer: 'READY TO LIST',
                label: 'No marketplace approval gate was identified',
                reason: 'You remain responsible for legal market access, product claims, payment-provider rules, recalls and carrier acceptance.'
            };
        }
        return {
            code: 'policy_unknown',
            answer: 'PLATFORM POLICY UNKNOWN',
            label: 'Identify and check the marketplace first',
            reason: 'The selected marketplace is not identified, so its category restrictions, evidence requests and approval process cannot be determined.'
        };
    }

    return { reviewedAt, sources, products, marketScopeMappings, platformRules, listProducts, getProduct, getPlatformRules, getPlatformDecision };
}));
