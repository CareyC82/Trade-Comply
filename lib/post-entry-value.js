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
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
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
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
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
            tradeRemedy: 'EU customs duty plus Germany VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Germany benchmark split by HS prefix. Confirm exact TARIC line.',
            sourceHts: '847130 benchmark',
            sourceRateText: 'Benchmark: duty 2.7% + Germany VAT placeholder',
            sourceUrl: 'https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en'
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
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
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
            tradeRemedy: 'EU customs duty plus Netherlands VAT benchmark; verify TARIC code and import VAT treatment.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Netherlands benchmark split by HS prefix. Confirm exact TARIC line.',
            sourceHts: '847130 benchmark',
            sourceRateText: 'Benchmark: duty 2.7% + Netherlands VAT placeholder',
            sourceUrl: 'https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en'
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
            sourceUrl: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en'
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
            confidence: 'Benchmark source checked',
            sourceStatus: 'benchmark_source_checked',
            sourceNote: 'Singapore benchmark refreshed locally. Verify exact HS code, GST value basis, and whether the goods are dutiable before filing.',
            sourceHts: 'SG electronics benchmark',
            sourceRateText: 'Benchmark: 0% customs duty + 9% GST',
            sourceUrl: 'https://www.customs.gov.sg/businesses/valuation-duties-taxes-fees/duties-and-dutiable-goods/'
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
            tradeRemedy: 'Mexico import VAT benchmark; verify TIGIE tariff line, NOM labeling/safety requirements, and any preferential origin claim.',
            confidence: 'Benchmark source checked',
            sourceStatus: 'benchmark_source_checked',
            sourceNote: 'Mexico benchmark refreshed locally. Verify exact TIGIE tariff line, VAT base, NOM scope, and preferential origin before filing.',
            sourceHts: 'MX electronics benchmark',
            sourceRateText: 'Benchmark: VAT 16%; IGI depends on tariff line',
            sourceUrl: 'https://www.snice.gob.mx/'
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
            tradeRemedy: 'Japan consumption tax benchmark; verify tariff schedule, PSE/telecom product requirements, and valuation treatment.',
            confidence: 'Benchmark source checked',
            sourceStatus: 'benchmark_source_checked',
            sourceNote: 'Japan benchmark refreshed locally. Verify exact tariff line, consumption tax basis, and product approval scope before filing.',
            sourceHts: 'JP electronics benchmark',
            sourceRateText: 'Benchmark: 0% duty for many electronics + 10% consumption tax',
            sourceUrl: 'https://www.customs.go.jp/english/tariff/'
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
            tradeRemedy: 'Korea import VAT benchmark; verify tariff schedule, KC/product approvals, and origin preference.',
            confidence: 'Benchmark source checked',
            sourceStatus: 'benchmark_source_checked',
            sourceNote: 'Korea benchmark refreshed locally. Verify exact tariff line, VAT basis, KC scope, and origin preference before filing.',
            sourceHts: 'KR electronics benchmark',
            sourceRateText: 'Benchmark: 0% duty for many electronics + 10% VAT',
            sourceUrl: 'https://www.customs.go.kr/english/main.do'
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
            tradeRemedy: 'Vietnam import VAT benchmark; verify HS code, preferential tariff, MIC/MOIT product requirements, and entry-date VAT policy.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Vietnam benchmark only. VAT and preferential duty can change by product, origin, and entry date.',
            sourceHts: 'VN electronics benchmark',
            sourceRateText: 'Benchmark: duty depends on tariff line + VAT placeholder',
            sourceUrl: 'https://www.customs.gov.vn/'
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
            tradeRemedy: 'Malaysia sales tax benchmark; verify customs duty, SST exemption, SIRIM/MCMC approvals, and preferential origin.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Malaysia benchmark only. SST, duty, and exemptions vary by tariff line and product.',
            sourceHts: 'MY electronics benchmark',
            sourceRateText: 'Benchmark: SST 10%; customs duty depends on tariff line',
            sourceUrl: 'https://mysst.customs.gov.my/'
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
            tradeRemedy: 'Taiwan import business tax benchmark; verify tariff code, commodity inspection, telecom approvals, and origin treatment.',
            confidence: 'Indicative',
            sourceStatus: 'indicative',
            sourceNote: 'Taiwan benchmark only. Confirm exact customs duty and business tax basis before filing.',
            sourceHts: 'TW electronics benchmark',
            sourceRateText: 'Benchmark: 5% business tax; customs duty depends on tariff line',
            sourceUrl: 'https://web.customs.gov.tw/'
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
            baseRate: 0.08,
            additionalRate: 0.13,
            addOnLayers: [
                {
                    type: 'import_vat',
                    label: 'China import VAT estimate',
                    rate: 0.13,
                    basis: 'customs_value_plus_duty',
                    status: 'indicative'
                }
            ],
            tradeRemedy: 'Import VAT and MFN duty estimate; confirm exact tariff line',
            confidence: 'Indicative'
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

    function normalizeSourceStatus(status, hasOfficialSource) {
        if (status === 'flag_only' || status === 'scope_check_required') {
            return 'scope_check_required';
        }
        if (status === 'benchmark_source_checked') {
            return 'benchmark_source_checked';
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
            lastCheckedAt: raw.lastCheckedAt || raw.last_checked_at || ''
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
        return loadDutyRules().find((rule) => {
            const importMatches = rule.importCountry === importCountry;
            const originMatches = rule.originCountry === '*' || rule.originCountry === originCountry;
            const hsMatches = rule.hsPrefixes.some(prefix => hsCode.startsWith(prefix));
            return importMatches && originMatches && hsMatches;
        }) || null;
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
        const statuses = new Set((Array.isArray(sourceBreakdown) ? sourceBreakdown : [])
            .map(item => item && item.status)
            .filter(Boolean));
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
            return {
                level: estimateLayer ? 'mixed_official_estimate' : 'official_exact',
                label: estimateLayer ? 'Mixed official + estimate' : 'Official exact',
                usableForFiling: !estimateLayer
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
                nextAction: trust.usableForFiling
                    ? 'Correct the declared value or duty unless support proves the added costs are non-dutiable.'
                    : 'Treat this as a screening alert; confirm the exact tariff line before filing a correction.'
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
                nextAction: 'Reconcile the invoice, freight, insurance, and declared duty so the file explains why no duty correction is needed.'
            };
        }

        return {
            level: 'no_gap',
            trust,
            coreConclusion: `No material value or duty gap detected. Rate basis: ${trust.label}.`,
            nextAction: trust.usableForFiling
                ? 'Keep the calculation and official rate source with the entry file.'
                : 'Keep the calculation as a pre-check and confirm the official tariff line before relying on it.'
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
