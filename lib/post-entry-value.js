/**
 * Post-entry declared value review helpers.
 * First pass is deterministic: incoterm-based value math plus risk bands.
 */
(function (global) {
    const INCOTERM_RULES = {
        EXW: { customsAdds: ['freight', 'insurance', 'other'], rebateSubtracts: [] },
        FCA: { customsAdds: ['freight', 'insurance', 'other'], rebateSubtracts: [] },
        FOB: { customsAdds: ['freight', 'insurance', 'other'], rebateSubtracts: [] },
        CFR: { customsAdds: ['insurance', 'other'], rebateSubtracts: ['freight'] },
        CPT: { customsAdds: ['insurance', 'other'], rebateSubtracts: ['freight'] },
        CIF: { customsAdds: ['other'], rebateSubtracts: ['freight', 'insurance'] },
        CIP: { customsAdds: ['other'], rebateSubtracts: ['freight', 'insurance'] },
        DAP: { customsAdds: ['other'], rebateSubtracts: ['freight', 'insurance', 'other'] },
        DDP: { customsAdds: ['other'], rebateSubtracts: ['freight', 'insurance', 'other'] }
    };

    function numberOrZero(value) {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
    }

    function normalizeIncoterm(value) {
        const incoterm = String(value || '').trim().toUpperCase();
        return INCOTERM_RULES[incoterm] ? incoterm : 'FOB';
    }

    function sumSelected(costs, names) {
        return names.reduce((sum, name) => sum + numberOrZero(costs[name]), 0);
    }

    function normalizeHsCode(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function getRiskBand(diffPercent, declaredAmount) {
        if (!declaredAmount) {
            return {
                level: 'Review Required',
                tone: 'medium',
                message: 'Declared value is missing or zero.'
            };
        }
        if (diffPercent > 15) {
            return {
                level: 'High',
                tone: 'high',
                message: 'Estimated value differs from declared value by more than 15%.'
            };
        }
        if (diffPercent > 5) {
            return {
                level: 'Review Required',
                tone: 'medium',
                message: 'Estimated value differs from declared value by more than 5%.'
            };
        }
        if (diffPercent > 0) {
            return {
                level: 'Low Variance',
                tone: 'low',
                message: 'Small value variance detected; keep supporting documents.'
            };
        }
        return {
            level: 'No Variance',
            tone: 'clear',
            message: 'No material variance detected from the entered cost components.'
        };
    }

    function calculatePostEntryValue(input = {}) {
        const incoterm = normalizeIncoterm(input.incoterm);
        const rule = INCOTERM_RULES[incoterm];
        const declaredAmount = numberOrZero(input.declaredAmount);
        const costs = {
            freight: numberOrZero(input.freight),
            insurance: numberOrZero(input.insurance),
            other: numberOrZero(input.otherCharges)
        };
        const customsAdditions = sumSelected(costs, rule.customsAdds);
        const rebateDeductions = sumSelected(costs, rule.rebateSubtracts);
        const customsValue = declaredAmount + customsAdditions;
        const exportRebateBase = Math.max(0, declaredAmount - rebateDeductions);
        const difference = customsValue - declaredAmount;
        const diffPercent = declaredAmount ? Math.abs(difference) / declaredAmount * 100 : 100;
        const risk = getRiskBand(diffPercent, declaredAmount);

        return {
            incoterm,
            declaredAmount,
            freight: costs.freight,
            insurance: costs.insurance,
            otherCharges: costs.other,
            customsValue,
            exportRebateBase,
            difference,
            diffPercent,
            risk,
            customsAdditions,
            rebateDeductions
        };
    }

    const FALLBACK_DUTY_RULES = [
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['850760'],
            label: 'US import lithium-ion battery signal',
            baseRate: 0.034,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Pre-check benchmark. Verify exact HTS and active exclusions with HTSUS / USTR before filing.',
            sourceHts: '85076000',
            sourceRateText: '3.4%',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=850760&to=85076099&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8517'],
            label: 'US import telecom / network equipment signal',
            baseRate: 0,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Pre-check benchmark for telecom/network equipment; verify exact HTS line and active exclusions.',
            sourceHts: '8517110000',
            sourceRateText: 'Free',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8517&to=851799&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8525'],
            label: 'US import camera / transmission equipment signal',
            baseRate: 0,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Pre-check benchmark for cameras/transmission equipment; verify exact HTS line and active exclusions.',
            sourceHts: '8525501000',
            sourceRateText: 'Free',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8525&to=852599&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8528'],
            label: 'US import display / monitor equipment signal',
            baseRate: 0,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Pre-check benchmark for display/monitor equipment; verify exact HTS line and active exclusions.',
            sourceHts: '8528420000',
            sourceRateText: 'Free',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8528&to=852899&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8543'],
            label: 'US import other electrical machines signal',
            baseRate: 0.019,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Pre-check benchmark for other electrical machines; verify exact HTS line and active exclusions.',
            sourceHts: '8543100000',
            sourceRateText: '1.9%',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8543&to=854399&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8541'],
            label: 'US import solar / photovoltaic signal',
            baseRate: 0,
            additionalRate: 0.25,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.25,
                    basis: 'customs_value',
                    status: 'indicative'
                },
                {
                    type: 'ad_cvd',
                    label: 'AD/CVD case-scope screening',
                    rate: null,
                    basis: 'case_scope',
                    status: 'flag_only'
                }
            ],
            tradeRemedy: 'Section 301 and possible AD/CVD screening signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Solar products may require separate AD/CVD and origin-route review.',
            sourceHts: '8541410000',
            sourceRateText: 'Free',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8541&to=854199&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['8542'],
            label: 'US import semiconductor signal',
            baseRate: 0,
            additionalRate: 0.25,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.25,
                    basis: 'customs_value',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Section 301 / advanced electronics tariff-screening signal',
            confidence: 'Indicative',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Verify exact HTS line and technology-control overlap.',
            sourceHts: '8542330001',
            sourceRateText: 'Free',
            sourceUrl: 'https://hts.usitc.gov/reststop/exportList?from=8542&to=854299&format=JSON&styles=false'
        },
        {
            importCountry: 'US',
            originCountry: 'CN',
            hsPrefixes: ['847130'],
            label: 'US import tablet / portable ADP signal',
            baseRate: 0,
            additionalRate: 0.075,
            addOnLayers: [
                {
                    type: 'section_301',
                    label: 'Section 301 China additional duty',
                    rate: 0.075,
                    basis: 'customs_value',
                    status: 'indicative',
                    source: 'USTR Section 301 / HTS Chapter 99 signal'
                }
            ],
            tradeRemedy: 'Section 301 China additional duty signal',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Pre-check benchmark for tablet / portable ADP imports. Verify exact 10-digit HTS and active exclusions.',
            sourceHts: '847130',
            sourceRateText: 'Benchmark: base duty often free; Section 301 may apply by origin/scope',
            sourceUrl: 'https://hts.usitc.gov/'
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['850440'],
            label: 'EU import EV charger / converter signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus member-state VAT benchmark; verify TARIC code, origin, and VAT member state.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.',
            sourceHts: '850440 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['847130'],
            label: 'EU import tablet / portable ADP equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'Exact TARIC code required before using a final EU duty rate; VAT varies by member state.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'No HS prefix on this rule produced an unambiguous official TARIC candidate.',
            sourceHts: '847130 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required before using an official EU duty rate.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8471300000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8471300000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for portable automatic data-processing machines; verify origin preference and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['850760'],
            label: 'EU import lithium-ion battery equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus member-state VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.',
            sourceHts: '850760 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 2.700%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['8517'],
            label: 'EU import telecom / network equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus member-state VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.',
            sourceHts: '8517 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['8528'],
            label: 'EU import display / monitor equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'Exact TARIC code required before using a final EU duty rate; VAT varies by member state.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'Official TARIC workbook found multiple third-country-duty rates under this prefix.',
            sourceHts: '8528 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required; parsed ERGA OMNES third-country-duty rates include 0.000%, 2.000%, 14.000%.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8528521000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8528521000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for monitors capable of directly connecting to ADP machines; verify exact product scope and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['8541'],
            label: 'EU import photovoltaic / semiconductor device equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus member-state VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.',
            sourceHts: '8541 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'EU',
            originCountry: '*',
            hsPrefixes: ['8542'],
            label: 'EU import semiconductor integrated circuit equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'EU import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / member-state VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus member-state VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this maintained HS prefix produced one unambiguous rate. Verify exact 10-digit TARIC code, origin preference, and member-state VAT before filing.',
            sourceHts: '8542 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['847130'],
            label: 'Germany import tablet / portable ADP equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'No HS prefix on this rule produced an unambiguous official TARIC candidate.',
            sourceHts: '847130 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required before using an official EU duty rate.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8471300000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8471300000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for portable automatic data-processing machines; verify origin preference and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['850440'],
            label: 'Germany import power conversion / charger equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '850440 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['850760'],
            label: 'Germany import lithium-ion battery equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '850760 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 2.700%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['8517'],
            label: 'Germany import telecom / network equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8517 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['8528'],
            label: 'Germany import display / monitor equipment signal',
            baseRate: 0.027,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'Exact TARIC code required because display products under 8528 have multiple EU duty rates.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'Official TARIC workbook found multiple third-country-duty rates under this prefix.',
            sourceHts: '8528 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required; parsed rates include 0.000%, 2.000%, 14.000%.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8528521000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8528521000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for monitors capable of directly connecting to ADP machines; verify exact product scope and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['8541'],
            label: 'Germany import photovoltaic / semiconductor device equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8541 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'DE',
            originCountry: '*',
            hsPrefixes: ['8542'],
            label: 'Germany import semiconductor integrated circuit equipment signal',
            baseRate: 0,
            additionalRate: 0.19,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Germany import VAT benchmark',
                    rate: 0.19,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Germany VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8542 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en'
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['847130'],
            label: 'Netherlands import tablet / portable ADP equipment signal',
            baseRate: 0.027,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify exact TARIC code and import VAT treatment.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'No HS prefix on this rule produced an unambiguous official TARIC candidate.',
            sourceHts: '847130 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required before using an official EU duty rate.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8471300000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8471300000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for portable automatic data-processing machines; verify origin preference and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['850440'],
            label: 'Netherlands import power conversion / charger equipment signal',
            baseRate: 0,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '850440 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['850760'],
            label: 'Netherlands import lithium-ion battery equipment signal',
            baseRate: 0.027,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '850760 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 2.700%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['8517'],
            label: 'Netherlands import telecom / network equipment signal',
            baseRate: 0,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8517 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['8528'],
            label: 'Netherlands import display / monitor equipment signal',
            baseRate: 0.027,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'Exact TARIC code required because display products under 8528 have multiple EU duty rates.',
            confidence: 'Scope check required',
            sourceStatus: 'scope_check_required',
            sourceNote: 'Official TARIC workbook found multiple third-country-duty rates under this prefix.',
            sourceHts: '8528 (TARIC scope check required)',
            sourceRateText: 'Exact TARIC code required; parsed rates include 0.000%, 2.000%, 14.000%.',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
            exactCodeOverrides: [
                {
                    hsCode: '8528521000',
                    baseRate: 0,
                    sourceStatus: 'official_source_checked',
                    confidence: 'Official source checked',
                    sourceHts: '8528521000 (TARIC ERGA OMNES third-country duty)',
                    sourceRateText: 'TARIC third-country duty: 0.000%',
                    sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en',
                    sourceNote: 'Exact TARIC code override for monitors capable of directly connecting to ADP machines; verify exact product scope and import VAT before filing.',
                    lastCheckedAt: '2026-06-13T09:30:00.000Z'
                }
            ]
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['8541'],
            label: 'Netherlands import photovoltaic / semiconductor device equipment signal',
            baseRate: 0,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8541 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'NL',
            originCountry: '*',
            hsPrefixes: ['8542'],
            label: 'Netherlands import semiconductor integrated circuit equipment signal',
            baseRate: 0,
            additionalRate: 0.21,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Netherlands import VAT benchmark',
                    rate: 0.21,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'EU TARIC / Netherlands VAT benchmark'
                }
            ],
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Official source checked',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Official TARIC ERGA OMNES third-country-duty candidate selected because this prefix produced one unambiguous rate.',
            sourceHts: '8542 (TARIC ERGA OMNES third-country duty)',
            sourceRateText: 'TARIC third-country duty: 0.000%',
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
        },
        {
            importCountry: 'SG',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Singapore import electronics GST signal',
            baseRate: 0,
            additionalRate: 0.09,
            addOnLayers: [
                {
                    type: 'import_gst',
                    label: 'Singapore import GST benchmark',
                    rate: 0.09,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Singapore Customs GST benchmark'
                }
            ],
            tradeRemedy: 'Singapore generally applies GST on imports; confirm exact customs value and any dutiable-goods treatment.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Singapore exact-line candidates are maintained for high-tech electronics; GST value treatment is handled as a separate tax layer. Verify final TradeNet HS/AHTN code and dutiable-goods scope before filing.',
            sourceHts: 'SG maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% customs duty for maintained electronics; 9% GST handled separately',
            sourceUrl: 'https://www.customs.gov.sg/businesses/valuation-duties-taxes-fees/duties-and-dutiable-goods/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Singapore maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; GST remains a separate import tax layer.',
                sourceHts: `${code} (Singapore Customs exact-line candidate)`,
                sourceRateText: 'Singapore customs duty candidate: 0.000%',
                sourceUrl: 'https://www.customs.gov.sg/businesses/valuation-duties-taxes-fees/duties-and-dutiable-goods/'
            }))
        },
        {
            importCountry: 'MX',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Mexico import electronics VAT / IGI signal',
            baseRate: 0,
            additionalRate: 0.16,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Mexico import VAT benchmark',
                    rate: 0.16,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Mexico tariff / VAT benchmark'
                }
            ],
            tradeRemedy: 'Mexico exact-line candidates are maintained for high-tech electronics; verify TIGIE tariff line, NOM labeling/safety requirements, and any preferential origin claim.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Mexico exact-line candidates are maintained for high-tech electronics; VAT, NOM scope, and preferential-origin treatment are handled as separate checks. Verify final TIGIE/NICO line before filing.',
            sourceHts: 'MX maintained TIGIE exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% IGI/base duty for maintained electronics; 16% VAT handled separately',
            sourceUrl: 'https://www.snice.gob.mx/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Mexico maintained exact-line candidate for covered high-tech electronics. IGI/base duty is treated as 0% for pre-check; VAT, NOM scope, and preferential-origin treatment remain separate checks.',
                sourceHts: `${code} (MX maintained TIGIE exact-line candidate)`,
                sourceRateText: 'Mexico TIGIE duty candidate: 0.000%',
                sourceUrl: 'https://www.snice.gob.mx/'
            }))
        },
        {
            importCountry: 'JP',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Japan import electronics consumption tax signal',
            baseRate: 0,
            additionalRate: 0.1,
            addOnLayers: [
                {
                    type: 'consumption_tax',
                    label: 'Japan consumption tax benchmark',
                    rate: 0.1,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Japan Customs tariff / consumption tax benchmark'
                }
            ],
            tradeRemedy: 'Japan exact-line candidates are maintained for high-tech electronics; verify tariff schedule, PSE/telecom product requirements, and valuation treatment.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Japan exact-line candidates are maintained for high-tech electronics; consumption tax and product approval scope are handled as separate checks. Verify final Japan statistical code before filing.',
            sourceHts: 'JP maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% customs duty for maintained electronics; 10% consumption tax handled separately',
            sourceUrl: 'https://www.customs.go.jp/english/tariff/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Japan maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; consumption tax remains a separate import tax layer.',
                sourceHts: `${code} (JP maintained exact-line candidate)`,
                sourceRateText: 'Japan customs duty candidate: 0.000%',
                sourceUrl: 'https://www.customs.go.jp/english/tariff/'
            }))
        },
        {
            importCountry: 'KR',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Korea import electronics VAT signal',
            baseRate: 0,
            additionalRate: 0.1,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Korea import VAT benchmark',
                    rate: 0.1,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Korea Customs tariff / VAT benchmark'
                }
            ],
            tradeRemedy: 'Korea exact-line candidates are maintained for high-tech electronics; verify tariff schedule, KC/product approvals, and origin preference.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Korea exact-line candidates are maintained for high-tech electronics; VAT, KC scope, and preferential-origin treatment are handled as separate checks. Verify final Korea 10-digit HS line before filing.',
            sourceHts: 'KR maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% customs duty for maintained electronics; 10% VAT handled separately',
            sourceUrl: 'https://www.customs.go.kr/english/main.do',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Korea maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0%; VAT and origin-preference scope remain separate checks.',
                sourceHts: `${code} (KR maintained exact-line candidate)`,
                sourceRateText: 'Korea customs duty candidate: 0.000%',
                sourceUrl: 'https://www.customs.go.kr/english/main.do'
            }))
        },
        {
            importCountry: 'VN',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Vietnam import electronics VAT / duty signal',
            baseRate: 0,
            additionalRate: 0.1,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Vietnam import VAT benchmark',
                    rate: 0.1,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Vietnam Customs tariff / VAT benchmark'
                }
            ],
            tradeRemedy: 'Vietnam exact-line candidates are maintained for high-tech electronics; verify HS code, preferential tariff, MIC/MOIT product requirements, and entry-date VAT policy.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Vietnam exact-line candidates are maintained for high-tech electronics; VAT, preferential tariff, and origin scope are handled as separate checks. Confirm VNACCS tariff line before filing.',
            sourceHts: 'VN maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% base duty for maintained electronics; 10% VAT handled separately',
            sourceUrl: 'https://www.customs.gov.vn/',
            exactCodeOverrides: ['850440', '850760', '851762', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Vietnam maintained exact-line candidate for covered high-tech electronics. Base duty is treated as 0% for pre-check; VAT and preferential-origin scope remain separate checks.',
                sourceHts: `${code} (Vietnam Customs exact-line candidate)`,
                sourceRateText: 'Vietnam customs duty candidate: 0.000%',
                sourceUrl: 'https://www.customs.gov.vn/'
            }))
        },
        {
            importCountry: 'MY',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Malaysia import electronics SST / duty signal',
            baseRate: 0,
            additionalRate: 0.1,
            addOnLayers: [
                {
                    type: 'sales_tax',
                    label: 'Malaysia sales tax benchmark',
                    rate: 0.1,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Royal Malaysian Customs Department SST benchmark'
                }
            ],
            tradeRemedy: 'Malaysia exact-line candidates are maintained for high-tech electronics; verify customs duty, SST exemption, SIRIM/MCMC approvals, and preferential origin.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Malaysia exact-line candidates are maintained for high-tech electronics; SST, exemptions, SIRIM/MCMC/ST approval scope, and preferential-origin treatment are handled as separate checks. Verify final tariff line before filing.',
            sourceHts: 'MY maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% customs duty for maintained electronics; SST/import tax handled separately',
            sourceUrl: 'https://mysst.customs.gov.my/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Malaysia maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0% for pre-check; SST, exemptions, SIRIM/MCMC/ST scope, and preferential-origin treatment remain separate checks.',
                sourceHts: `${code} (MY maintained exact-line candidate)`,
                sourceRateText: 'Malaysia customs duty candidate: 0.000%',
                sourceUrl: 'https://mysst.customs.gov.my/'
            }))
        },
        {
            importCountry: 'TW',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Taiwan import electronics business tax signal',
            baseRate: 0,
            additionalRate: 0.05,
            addOnLayers: [
                {
                    type: 'business_tax',
                    label: 'Taiwan import business tax benchmark',
                    rate: 0.05,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Taiwan Customs / Ministry of Finance benchmark'
                }
            ],
            tradeRemedy: 'Taiwan exact-line candidates are maintained for high-tech electronics; verify tariff code, commodity inspection, telecom approvals, and origin treatment.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'Taiwan exact-line candidates are maintained for high-tech electronics; business tax, commodity inspection, telecom approval, and tariff-line treatment are handled as separate checks. Verify final customs tariff code before filing.',
            sourceHts: 'TW maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% customs duty for maintained electronics; 5% business tax handled separately',
            sourceUrl: 'https://web.customs.gov.tw/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'Taiwan maintained exact-line candidate for covered high-tech electronics. Customs duty is treated as 0% for pre-check; business tax, inspection, telecom approval, and tariff-line treatment remain separate checks.',
                sourceHts: `${code} (TW maintained exact-line candidate)`,
                sourceRateText: 'Taiwan customs duty candidate: 0.000%',
                sourceUrl: 'https://web.customs.gov.tw/'
            }))
        },
        {
            importCountry: 'RU',
            originCountry: '*',
            hsPrefixes: ['847130', '850440', '850760', '8517', '8528', '8541', '8542'],
            label: 'Russia import electronics VAT / EAEU duty signal',
            baseRate: 0.05,
            additionalRate: 0.2,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'Russia import VAT benchmark',
                    rate: 0.2,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'Russia / EAEU tariff and VAT benchmark'
                },
                {
                    type: 'sanctions_scope',
                    label: 'Sanctions / restricted-party scope screening',
                    rate: null,
                    basis: 'case_scope',
                    status: 'flag_only',
                    source: 'Russia-route sanctions and export-control scope review required'
                }
            ],
            tradeRemedy: 'Russia import VAT and EAEU duty benchmark; restricted-party, sanctions, and export-control scope review may override ordinary entry economics.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Russia benchmark only. Confirm EAEU tariff line, VAT basis, sanctions, restricted party, and licensing status.',
            sourceHts: 'RU electronics benchmark',
            sourceRateText: 'Benchmark: EAEU duty placeholder + 20% VAT; sanctions scope required',
            sourceUrl: 'https://customs.gov.ru/'
        },
        {
            importCountry: 'CN',
            originCountry: '*',
            hsPrefixes: ['850760', '8517', '8525', '8528', '8541', '8542', '8543'],
            label: 'China import electronics VAT/duty review signal',
            baseRate: 0,
            additionalRate: 0.13,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'China import VAT estimate',
                    rate: 0.13,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative',
                    source: 'China import VAT estimate; verify official tariff line'
                }
            ],
            tradeRemedy: 'China exact-line MFN duty candidate plus import VAT estimate; confirm exact tariff line and product-control scope.',
            confidence: 'Official duty + tax estimate',
            sourceStatus: 'official_source_checked',
            sourceNote: 'China exact-line candidates are maintained for high-tech electronics; import VAT, licensing, CCC/SRRC, and origin treatment remain separate checks.',
            sourceHts: 'CN maintained exact-line candidates',
            sourceRateText: 'Exact-line candidates: 0% MFN duty for maintained high-tech electronics; 13% import VAT handled separately',
            sourceUrl: 'https://www.customs.gov.cn/',
            exactCodeOverrides: ['847130', '850440', '850760', '851713', '851762', '852852', '854143', '854231'].map((code) => ({
                hsCode: code,
                baseRate: 0,
                sourceStatus: 'official_source_checked',
                confidence: 'Official source checked',
                sourceNote: 'China maintained exact-line candidate for covered high-tech electronics. MFN duty is treated as 0% for pre-check; import VAT, licensing, CCC/SRRC, and origin treatment remain separate checks.',
                sourceHts: `${code} (CN maintained exact-line candidate)`,
                sourceRateText: 'China MFN duty candidate: 0.000%',
                sourceUrl: 'https://www.customs.gov.cn/'
            }))
        }
    ];

    let cachedDutyRules = null;

    function normalizeDutyAddOnLayer(raw = {}) {
        const rawRate = raw.rate;
        const rate = rawRate === null || rawRate === undefined || rawRate === ''
            ? null
            : numberOrZero(rawRate);
        return {
            type: raw.type || 'additional',
            label: raw.label || 'Additional duty layer',
            rate,
            basis: raw.basis || 'customs_value',
            status: raw.status || (rate === null ? 'flag_only' : 'indicative'),
            source: raw.source || ''
        };
    }

    function normalizeExactCodeOverride(raw = {}) {
        return {
            hsCode: normalizeHsCode(raw.hsCode || raw.hs_code || raw.code || ''),
            baseRate: numberOrZero(raw.baseRate ?? raw.base_rate),
            sourceStatus: raw.sourceStatus || raw.source_status || 'official_source_checked',
            confidence: raw.confidence || 'Official source checked',
            sourceNote: raw.sourceNote || raw.source_note || '',
            sourceHts: raw.sourceHts || raw.source_hts || raw.hsCode || raw.hs_code || '',
            sourceRateText: raw.sourceRateText || raw.source_rate_text || '',
            sourceUrl: raw.sourceUrl || raw.source_url || '',
            lastCheckedAt: raw.lastCheckedAt || raw.last_checked_at || ''
        };
    }

    function normalizeSourceStatus(status, hasOfficialSource) {
        if (status === 'flag_only' || status === 'scope_check_required') {
            return 'scope_check_required';
        }
        if (status === 'benchmark_source_checked') {
            return 'benchmark_source_checked';
        }
        if (status === 'official_link_checked') {
            return 'official_link_checked';
        }
        if (status === 'official_source_checked') {
            return 'official_source_checked';
        }
        if (hasOfficialSource) {
            return 'official_source_checked';
        }
        return status || 'indicative';
    }

    function buildDutySourceBreakdown(rule, addOnLayers = []) {
        if (!rule) {
            return [{
                label: 'Duty rate',
                status: 'not_covered',
                source: 'Not covered in local rate table',
                detail: 'Confirm the exact tariff line in the destination official tariff database.',
                url: ''
            }];
        }

        const isUsRule = rule.importCountry === 'US';
        const baseSource = rule.sourceUrl
            ? isUsRule ? 'USITC HTS / General duty' : 'Official tariff source'
            : rule.sourceNote || 'Local duty-rate table';
        const baseDetail = rule.sourceHts
            ? `${rule.sourceHts}${rule.sourceRateText ? ` · ${rule.sourceRateText}` : ''}`
            : rule.sourceNote || `${(rule.baseRate * 100).toFixed(2)}% base duty benchmark`;
        const rows = [{
            component: 'base_duty',
            label: isUsRule ? 'General duty' : 'Base duty',
            status: normalizeSourceStatus(rule.sourceStatus, Boolean(rule.sourceUrl) && rule.sourceStatus === 'official_source_checked'),
            source: baseSource,
            detail: baseDetail,
            rate: rule.baseRate,
            amount: null,
            hts: rule.sourceHts || '',
            url: rule.sourceUrl || '',
            lastCheckedAt: rule.lastCheckedAt || ''
        }];

        addOnLayers.forEach((layer) => {
            const layerRate = layer.rate === null
                ? 'Case-scope check required'
                : `${(layer.rate * 100).toFixed(2)}% ${layer.basis === 'customs_value_plus_duty' ? 'basis: value + duty' : 'basis: customs value'}`;
            rows.push({
                component: layer.type || 'additional',
                label: layer.label || 'Additional duty layer',
                status: normalizeSourceStatus(layer.status, false),
                source: layer.source || 'Local duty layer',
                detail: layerRate,
                rate: layer.rate,
                amount: layer.amount,
                hts: layer.type === 'section_301' ? 'HTS Chapter 99 / USTR scope' : '',
                url: '',
                lastCheckedAt: rule.lastCheckedAt || ''
            });
        });

        return rows;
    }

    function buildFilingGradeFocus(rule, context = {}) {
        const importCountry = String(rule?.importCountry || '').toUpperCase();
        const originCountry = String(rule?.originCountry || '').toUpperCase();
        const hsCode = normalizeHsCode(context.hsCode);
        if (importCountry !== 'US' || originCountry !== 'CN') {
            return null;
        }

        if (hsCode.startsWith('8541')) {
            return {
                focus: 'Before correction, reconcile HTS 854143/8541 exact line, Section 301 Chapter 99 scope, AD/CVD case scope, origin route, and UFLPA traceability.',
                checklist: [
                    'Lock the 10-digit HTS line and any Chapter 99 / Section 301 number.',
                    'Check whether solar-cell/module AD/CVD scope applies to the producer, country route, and product construction.',
                    'Keep origin, wafer/cell/module traceability, and UFLPA forced-labor evidence with the entry file.'
                ]
            };
        }

        if (hsCode.startsWith('8806')) {
            return {
                focus: 'Base duty is official-backed, but final payable duty still depends on exact HTS 8806 line, Chapter 99 / Section 301 scope, exclusion status, and drone end-use evidence.',
                checklist: [
                    'Confirm exact 10-digit HTS 8806 line and any Chapter 99 / Section 301 number.',
                    'Check active exclusion period and whether the product is a UAV, payload, part, or toy/consumer drone.',
                    'Keep origin, end-use, radio module, battery, and restricted-party support with the entry file.'
                ]
            };
        }

        if (hsCode.startsWith('850760')) {
            return {
                focus: 'Before correction, confirm battery chemistry, pack/use classification, Section 301 scope, energy-storage safety documents, and whether the duty base includes freight or assists.',
                checklist: [
                    'Confirm lithium-ion chemistry, battery-pack configuration, watt-hour rating, and intended use.',
                    'Check Section 301 applicability and any active exclusion before calculating payable duty.',
                    'Tie invoice, freight, insurance, UN38.3/SDS, and product specification evidence to the declared value.'
                ]
            };
        }

        if (hsCode.startsWith('8517')) {
            return {
                focus: 'Before correction, confirm the exact 8517 tariff line, Section 301 scope/exclusion status, FCC/radio module evidence, and whether software or encryption changes classification.',
                checklist: [
                    'Confirm whether the product is a phone, router, switching equipment, optical module, or other 8517 apparatus.',
                    'Check Section 301 Chapter 99 treatment and any exclusion tied to the exact HTS line.',
                    'Keep FCC/radio module, encryption, and product-function evidence with the entry file.'
                ]
            };
        }

        return null;
    }

    function normalizeDutyRule(raw = {}) {
        const explicitLayers = Array.isArray(raw.addOnLayers) ? raw.addOnLayers : raw.add_on_layers;
        const legacyAdditionalRate = numberOrZero(raw.additionalRate ?? raw.additional_rate);
        const addOnLayers = Array.isArray(explicitLayers)
            ? explicitLayers.map(normalizeDutyAddOnLayer)
            : legacyAdditionalRate > 0
                ? [normalizeDutyAddOnLayer({
                    type: 'additional',
                    label: raw.tradeRemedy || raw.trade_remedy || 'Additional duty',
                    rate: legacyAdditionalRate,
                    basis: 'customs_value',
                    status: 'indicative'
                })]
                : [];
        return {
            id: raw.id || '',
            importCountry: String(raw.importCountry || raw.import_country || '').toUpperCase(),
            originCountry: String(raw.originCountry || raw.origin_country || '').toUpperCase(),
            hsPrefixes: Array.isArray(raw.hsPrefixes) ? raw.hsPrefixes : raw.hs_prefixes || [],
            label: raw.label || 'Duty signal',
            baseRate: numberOrZero(raw.baseRate ?? raw.base_rate),
            additionalRate: addOnLayers.reduce((sum, layer) => sum + (layer.rate || 0), 0),
            addOnLayers,
            tradeRemedy: raw.tradeRemedy || raw.trade_remedy || 'Confirm exact tariff treatment',
            confidence: raw.confidence || 'Indicative',
            sourceNote: raw.sourceNote || raw.source_note || '',
            sourceStatus: raw.sourceStatus || raw.source_status || '',
            sourceUrl: raw.sourceUrl || raw.source_url || '',
            sourceHts: raw.sourceHts || raw.source_hts || '',
            sourceRateText: raw.sourceRateText || raw.source_rate_text || '',
            lastCheckedAt: raw.lastCheckedAt || raw.last_checked_at || '',
            exactCodeOverrides: Array.isArray(raw.exactCodeOverrides)
                ? raw.exactCodeOverrides.map(normalizeExactCodeOverride)
                : Array.isArray(raw.exact_code_overrides)
                    ? raw.exact_code_overrides.map(normalizeExactCodeOverride)
                    : []
        };
    }

    function findExactCodeOverride(rule, hsCode) {
        const normalized = normalizeHsCode(hsCode);
        if (!normalized || !Array.isArray(rule?.exactCodeOverrides)) {
            return null;
        }
        return rule.exactCodeOverrides
            .filter(override => override.hsCode && normalized.startsWith(override.hsCode))
            .sort((a, b) => b.hsCode.length - a.hsCode.length)[0] || null;
    }

    function applyExactCodeOverride(rule, override) {
        if (!override) return rule;
        return {
            ...rule,
            baseRate: override.baseRate,
            sourceStatus: override.sourceStatus || 'official_source_checked',
            confidence: override.confidence || 'Official source checked',
            sourceNote: override.sourceNote || rule.sourceNote,
            sourceHts: override.sourceHts || rule.sourceHts,
            sourceRateText: override.sourceRateText || rule.sourceRateText,
            sourceUrl: override.sourceUrl || rule.sourceUrl,
            lastCheckedAt: override.lastCheckedAt || rule.lastCheckedAt
        };
    }

    function isNodeRuntime() {
        return typeof module !== 'undefined'
            && module.exports
            && typeof require === 'function'
            && typeof __dirname === 'string';
    }

    function loadDutyRules() {
        if (cachedDutyRules) {
            return cachedDutyRules;
        }
        if (isNodeRuntime()) {
            try {
                const fs = require('fs');
                const path = require('path');
                const dutyPath = path.join(__dirname, '..', 'data', 'duty-rates.json');
                const payload = JSON.parse(fs.readFileSync(dutyPath, 'utf8'));
                cachedDutyRules = (payload.rules || []).map(normalizeDutyRule);
                return cachedDutyRules;
            } catch (error) {
                // Fall through to bundled rules when local data is unavailable.
            }
        }
        cachedDutyRules = FALLBACK_DUTY_RULES.map(normalizeDutyRule);
        return cachedDutyRules;
    }

    function setDutyRulesForTest(rules) {
        cachedDutyRules = Array.isArray(rules) ? rules.map(normalizeDutyRule) : null;
    }

    function findDutyRule(context = {}) {
        const importCountry = String(context.importCountryCode || '').toUpperCase();
        const originCountry = String(context.originCountryCode || '').toUpperCase();
        const hsCode = normalizeHsCode(context.hsCode);
        const rule = loadDutyRules().find((candidate) => {
            const importMatches = candidate.importCountry === importCountry;
            const originMatches = candidate.originCountry === '*' || candidate.originCountry === originCountry;
            const hsMatches = candidate.hsPrefixes.some(prefix => hsCode.startsWith(prefix));
            return importMatches && originMatches && hsMatches;
        }) || null;
        return rule ? applyExactCodeOverride(rule, findExactCodeOverride(rule, hsCode)) : null;
    }

    function calculateDutyImpact(valueResult, context = {}, input = {}) {
        const declaredDuty = numberOrZero(input.declaredDuty);
        const rule = findDutyRule(context);
        if (!rule) {
            return {
                covered: false,
                declaredDuty,
                estimatedDuty: null,
                dutyVariance: null,
                totalRate: null,
                rateLabel: 'Rate not covered',
                tradeRemedy: 'No built-in duty signal for this route / HS prefix yet.',
                conclusion: 'Duty impact cannot be estimated from the current local rate table.',
                action: 'Use the customs value result, then confirm the exact tariff line in the destination tariff database.',
                sourceBreakdown: buildDutySourceBreakdown(null)
            };
        }

        const baseDuty = valueResult.customsValue * rule.baseRate;
        const addOnLayers = rule.addOnLayers.map((layer) => {
            const amount = layer.rate === null ? null : valueResult.customsValue * layer.rate;
            return { ...layer, amount };
        });
        const addOnDuty = addOnLayers.reduce((sum, layer) => sum + (layer.amount || 0), 0);
        const totalRate = rule.baseRate + rule.additionalRate;
        const estimatedDuty = baseDuty + addOnDuty;
        const dutyVariance = estimatedDuty - declaredDuty;
        const flagOnlyLayers = addOnLayers.filter(layer => layer.rate === null);
        const filingGrade = buildFilingGradeFocus(rule, context);
        const hasDeclaredDuty = declaredDuty > 0;
        const conclusion = hasDeclaredDuty
            ? `Estimated duty is ${Math.abs(dutyVariance) < 0.01 ? 'aligned with' : dutyVariance > 0 ? 'higher than' : 'lower than'} declared duty by ${Math.abs(dutyVariance).toFixed(2)} in entered currency.`
            : `Estimated duty exposure is ${estimatedDuty.toFixed(2)} in entered currency; no declared duty amount was entered for comparison.`;
        const action = dutyVariance > 0.01
            ? 'Treat the duty shortfall as the next correction target unless official tariff lookup shows a lower rate.'
            : 'Keep the rate basis with the entry file and confirm exact HTS/tariff-line treatment.';

        return {
            covered: true,
            declaredDuty,
            estimatedDuty,
            dutyVariance,
            totalRate,
            baseRate: rule.baseRate,
            baseDuty,
            additionalRate: rule.additionalRate,
            addOnDuty,
            addOnLayers,
            flagOnlyLayers,
            rateLabel: rule.label,
            tradeRemedy: rule.tradeRemedy,
            confidence: rule.confidence,
            sourceBreakdown: buildDutySourceBreakdown(rule, addOnLayers),
            filingGradeFocus: filingGrade?.focus || '',
            filingGradeChecklist: filingGrade?.checklist || [],
            conclusion,
            action
        };
    }

    function buildReviewChecklist(context = {}) {
        const hsCode = String(context.hsCode || '').trim() || 'the declared HS code';
        const entryDate = String(context.entryDate || '').trim() || 'the entry date';
        return [
            `Confirm ${hsCode} in the HS Code tool before relying on this value review.`,
            `Use the entry date ${entryDate} to lock the applicable duty/tax period.`,
            'Match the declared value to invoice, freight, insurance, and payment evidence.',
            'Correct the entry value if the variance cannot be documented.'
        ];
    }

    function buildExplanation(result, context = {}) {
        const routeText = context.importCountry && context.originCountry
            ? `${context.originCountry} to ${context.importCountry}`
            : 'the selected route';
        const entryDate = context.entryDate || 'the selected entry date';
        const hsCode = context.hsCode || 'the declared HS code';
        return [
            `This review estimates customs value and export rebate base for ${routeText} using ${result.incoterm} terms.`,
            `Because rates and eligibility change over time, verify ${hsCode} against the rules in force on ${entryDate}.`,
            result.risk.message
        ].join(' ');
    }

    function buildValuationMethod(result, context = {}) {
        const importCountry = String(context.importCountryCode || context.importCountry || '').toUpperCase();
        if (importCountry === 'US' || context.importCountry === 'United States') {
            return 'US import valuation is normally reviewed under transaction-value principles. Freight and insurance treatment depends on whether charges are international, separately identified, and supported by evidence, so this result should be treated as a variance flag, not a final duty bill.';
        }
        if (['CN', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'JP', 'KR'].includes(importCountry)) {
            return 'This screen uses an Incoterm-based landed-value estimate. The final customs value still depends on local valuation rules, related-party pricing, assists, royalties, and whether charges are dutiable at the import border.';
        }
        return 'This screen uses an Incoterm-based valuation estimate. Confirm the destination-country valuation method before treating the amount as final customs value.';
    }

    function buildComplianceMeaning(result) {
        if (result.risk.tone === 'high') {
            return 'This looks like a material value gap. If the lower declared amount was filed, it may create under-declaration, duty/tax shortfall, or a weak audit file.';
        }
        if (result.risk.tone === 'medium') {
            return 'This is not just rounding. The value should be reconciled before filing or closing the entry.';
        }
        if (result.risk.tone === 'low') {
            return 'The gap is small. Keep the calculation trail so the declared value can be traced if reviewed.';
        }
        return 'No value gap is visible from the entered costs.';
    }

    function buildRecommendedAction(result) {
        if (result.risk.tone === 'high') {
            return 'Do not rely on the declared amount. Use the estimated customs value as the correction target unless a broker documents why the added costs are not dutiable.';
        }
        if (result.risk.tone === 'medium') {
            return 'Hold the entry file for value reconciliation. Amend the declared value if the freight/insurance treatment cannot be supported.';
        }
        if (result.risk.tone === 'low') {
            return 'Proceed only with the variance note saved in the file.';
        }
        return 'Proceed with normal file retention.';
    }

    function formatDecisionMoney(value, currency = 'USD') {
        const numeric = Number(value || 0);
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency,
                maximumFractionDigits: 2
            }).format(numeric);
        } catch (error) {
            return `${currency} ${numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        }
    }

    function classifyRateSourceTrust(sourceBreakdown = []) {
        const rows = Array.isArray(sourceBreakdown) ? sourceBreakdown : [];
        const statuses = new Set(rows
            .map(item => item && item.status)
            .filter(Boolean));
        const officialLinkRows = rows.filter(item => item?.status === 'official_link_checked');
        const estimateRows = rows.filter(item => ['benchmark_source_checked', 'indicative'].includes(item?.status));
        const estimateComponents = new Set(estimateRows.map(item => item?.component).filter(Boolean));
        const taxOnlyEstimate = estimateRows.length > 0
            && estimateRows.every(item => /vat|gst|igst|sst|sales_tax|business_tax|consumption_tax|import_tax/i.test(item?.component || ''));
        if (!statuses.size || statuses.has('not_covered')) {
            return {
                level: 'not_covered',
                label: 'Not covered',
                usableForFiling: false
            };
        }
        if (statuses.has('scope_check_required') || statuses.has('flag_only')) {
            return {
                level: 'official_heading_only',
                label: 'Official heading only',
                usableForFiling: false
            };
        }
        if (statuses.has('official_source_checked')) {
            const estimateLayer = statuses.has('benchmark_source_checked') || statuses.has('indicative');
            if (estimateLayer && taxOnlyEstimate) {
                return {
                    level: 'official_duty_tax_estimate',
                    label: 'Official duty + tax estimate',
                    usableForFiling: false,
                    estimateComponents: Array.from(estimateComponents)
                };
            }
            return {
                level: estimateLayer ? 'mixed_official_estimate' : 'official_exact',
                label: estimateLayer ? 'Mixed official + estimate' : 'Official exact',
                usableForFiling: !estimateLayer,
                estimateComponents: Array.from(estimateComponents)
            };
        }
        if (statuses.has('official_link_checked')) {
            return {
                level: 'official_link_estimate',
                label: 'Official link estimate',
                usableForFiling: false,
                officialLinkComponents: Array.from(new Set(officialLinkRows.map(item => item?.component).filter(Boolean))),
                estimateComponents: Array.from(estimateComponents)
            };
        }
        if (statuses.has('benchmark_source_checked')) {
            return {
                level: 'precheck_estimate',
                label: 'Pre-check estimate',
                usableForFiling: false
            };
        }
        return {
            level: 'indicative_only',
            label: 'Indicative only',
            usableForFiling: false
        };
    }

    function buildImportPostEntryDecision(result, dutyImpact = {}, options = {}) {
        const currency = options.currency || 'USD';
        const trust = classifyRateSourceTrust(dutyImpact.sourceBreakdown || []);
        const valueGap = Number(result?.difference || 0);
        const absValueGap = Math.abs(valueGap);
        const dutyGap = Number(dutyImpact.dutyVariance || 0);
        const absDutyGap = Math.abs(dutyGap);
        const hasValueGap = absValueGap > 0.01;
        const hasDutyGap = dutyImpact.covered && absDutyGap > 0.01;
        const valueText = formatDecisionMoney(absValueGap, currency);
        const dutyText = formatDecisionMoney(absDutyGap, currency);

        if (!dutyImpact.covered) {
            if (hasValueGap) {
                return {
                    level: 'value_gap_only',
                    trust,
                    coreConclusion: `Value gap detected: ${valueText}. Duty impact is not covered for this route / HS yet.`,
                    nextAction: 'Use the value gap as a filing-risk flag; confirm the official tariff line before calculating duty correction.'
                };
            }
            return {
                level: 'rate_not_covered',
                trust,
                coreConclusion: 'No value gap detected, but duty impact is not covered for this route / HS yet.',
                nextAction: 'Keep the value math only; do not rely on this page for payable duty until the route is covered.'
            };
        }

        if (dutyGap > 0.01) {
            const confidence = trust.usableForFiling ? 'Likely' : 'Estimated';
            return {
                level: trust.usableForFiling ? 'likely_duty_shortfall' : 'estimated_duty_shortfall',
                trust,
                coreConclusion: `${confidence} duty shortfall: ${dutyText}${hasValueGap ? `, driven by a ${valueText} value gap` : ''}. Rate basis: ${trust.label}.`,
                nextAction: dutyImpact.filingGradeFocus
                    || (trust.usableForFiling
                    ? 'Correct the declared value or duty unless support proves the added costs are non-dutiable.'
                    : 'Treat this as a screening alert; confirm the exact tariff line before filing a correction.')
            };
        }

        if (dutyGap < -0.01) {
            return {
                level: 'possible_overpayment',
                trust,
                coreConclusion: `Declared duty may be high by ${dutyText}. Rate basis: ${trust.label}.`,
                nextAction: 'Check whether the original entry overpaid duty before preparing any amendment or refund path.'
            };
        }

        if (hasValueGap) {
            return {
                level: 'value_gap_no_duty_gap',
                trust,
                coreConclusion: `Value gap detected: ${valueText}, but no duty gap appears against entered duty. Rate basis: ${trust.label}.`,
                nextAction: dutyImpact.filingGradeFocus
                    || 'Reconcile the invoice, freight, insurance, and declared duty so the file explains why no duty correction is needed.'
            };
        }

        return {
            level: 'no_gap',
            trust,
            coreConclusion: `No material value or duty gap detected. Rate basis: ${trust.label}.`,
            nextAction: dutyImpact.filingGradeFocus
                || (trust.usableForFiling
                ? 'Keep the calculation and official rate source with the entry file.'
                : 'Keep the calculation as a pre-check and confirm the official tariff line before relying on it.')
        };
    }

    function buildExportPostEntryReview(result, context = {}) {
        const originCountryCode = String(context.originCountryCode || '').toUpperCase();
        const originCountry = context.originCountry || 'origin country';
        const destinationCountry = context.importCountry || 'destination country';
        const hsCode = String(context.hsCode || '').trim() || 'the declared HS / Schedule B code';
        const entryDate = String(context.entryDate || '').trim() || 'the filing date';
        const valueGap = result.exportRebateBase - result.declaredAmount;
        const gapPhrase = Math.abs(valueGap) > 0.01
            ? 'The entered Incoterm/costs create an export-value gap that may require filing-value reconciliation.'
            : 'No export filing value gap is visible from the entered Incoterm/costs.';

        if (originCountryCode === 'US') {
            return {
                covered: true,
                label: 'US export post-entry review',
                impact: `US export review is focused on AES/EEI accuracy, Schedule B/HTS classification, ECCN/license basis, destination/end-user, and export value as of ${entryDate}.`,
                complianceMeaning: `${gapPhrase} For US exports from ${originCountry} to ${destinationCountry}, the main correction question is whether filed EEI data, export value, ${hsCode}, ECCN/license, or routed-export responsibility was inaccurate.`,
                action: 'If the filed AES/EEI value, Schedule B/HTS, ECCN/license, destination, or end-user differs from the corrected file, prepare an AES correction and keep the support package together.',
                evidence: [
                    'Commercial invoice and export value basis used for EEI/AES.',
                    'Schedule B or HTS classification support for the exported product.',
                    'ECCN/license or EAR99 rationale, destination, end-user, and end-use support.',
                    'AES filing / ITN record and any correction history.'
                ]
            };
        }

        if (originCountryCode === 'CN') {
            return {
                covered: true,
                label: 'China export post-entry review',
                impact: `China export review is focused on export declaration value, HS/CN code, rebate basis, license/control status, and customs declaration consistency as of ${entryDate}.`,
                complianceMeaning: `${gapPhrase} For China exports to ${destinationCountry}, the key question is whether the export declaration, FOB/rebate basis, HS/CN code, and license/control documents still align.`,
                action: 'If the export value, HS/CN code, rebate basis, or license-control status is inconsistent, treat the file as a declaration/rebate correction candidate before relying on the record.',
                evidence: [
                    'China export declaration and invoice showing currency, Incoterm, and value.',
                    'HS/CN classification and export rebate basis support.',
                    'Freight, insurance, and payment evidence used to reconcile FOB value.',
                    'Export license/control review and customs correction record if applicable.'
                ]
            };
        }

        return {
            covered: false,
            label: `${originCountry} export post-entry review`,
            impact: `Built-in export-side filing rules are limited for ${originCountry}. The value math is shown, but local export filing and correction rules need official confirmation.`,
            complianceMeaning: `${gapPhrase} Confirm whether ${originCountry} export filings require value, classification, license, or statistical declaration correction for shipments to ${destinationCountry}.`,
            action: 'Use the export filing value result as a variance flag, then confirm local export declaration correction rules for the origin country.',
            evidence: [
                'Export invoice showing Incoterm, currency, and declared value.',
                'Origin-country export declaration or statistical filing record.',
                'HS/export classification support and license-control review.',
                'Freight, insurance, and payment evidence supporting the export value basis.'
            ]
        };
    }

    function buildEvidenceList(context = {}) {
        const importCountry = context.importCountry || 'destination country';
        return [
            'Invoice showing Incoterm, currency, and declared value.',
            'Freight/insurance evidence supporting included or excluded charges.',
            `Customs entry or declaration filed in ${importCountry}.`
        ];
    }

    const api = {
        INCOTERM_RULES,
        FALLBACK_DUTY_RULES,
        normalizeIncoterm,
        normalizeHsCode,
        loadDutyRules,
        setDutyRulesForTest,
        calculatePostEntryValue,
        calculateDutyImpact,
        findDutyRule,
        buildReviewChecklist,
        buildExplanation,
        buildValuationMethod,
        buildComplianceMeaning,
        buildRecommendedAction,
        classifyRateSourceTrust,
        buildImportPostEntryDecision,
        buildExportPostEntryReview,
        buildEvidenceList
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.TraceWizePostEntryValue = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
