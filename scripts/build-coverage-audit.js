const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tags = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tags.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cases.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'country-registry.json'), 'utf8'));

const COUNTRIES = ['US', 'EU', 'DE', 'NL', 'SG', 'MX', 'VN', 'MY', 'JP', 'KR', 'ASEAN', 'RU', 'TW'];
const IMPORT_DIMENSIONS = [
    {
        id: 'wireless_telecom',
        label: 'Wireless / telecom market access',
        match: /WIRELESS|TELECOM|FCC|IMDA|RRA|MIC|GITEKI|RADIO|BLUETOOTH|WIFI|WI-FI|KC WIRELESS/i
    },
    {
        id: 'electrical_safety',
        label: 'Electrical safety certification',
        match: /COMPULSORY|SAFETY|PSE|KC ELECTRICAL|NOM|CCC|CPSC|CPSR|SAFETY MARK|ELECTRICAL/i
    },
    {
        id: 'battery_energy',
        label: 'Battery / ESS / energy-storage safety',
        match: /BATTERY|LITHIUM|ESS|ENERGY STORAGE|SCDF|FIRE|EV CHARGER|POWER BANK/i
    },
    {
        id: 'customs_import',
        label: 'Customs import declaration / tariff classification',
        match: /IMPORT_REG|CUSTOMS|TARIFF|HS CLASSIFICATION|NICO|TIGIE|NACCS|UNI-PASS|UNIPASS|PEDIMENTO|VALUATION/i
    },
    {
        id: 'labeling_consumer',
        label: 'Labeling / consumer information / product-market records',
        match: /LABEL|LABELING|COMMERCIAL INFORMATION|CONSUMER|WARRANTY|MANUAL|PACKAGING|WEEE|EPR|PRODUCER RESPONSIBILITY|VERPACKG|LUCID/i
    }
];
const EXPORT_DIMENSIONS = [
    {
        id: 'export_control_sanctions',
        label: 'Export controls / sanctions / dual-use',
        match: /EXPORT_CTRL|EXPORT CONTROL|DUAL-USE|SANCTION|STRATEGIC GOODS|ENTITY LIST|SEMICONDUCTOR|FAB|LITHOGRAPHY|MEMORY/i
    },
    {
        id: 'origin_transshipment',
        label: 'Origin / re-export / anti-circumvention',
        match: /ORIGIN|RE-EXPORT|TRANSIT|TRANSSHIPMENT|ANTI-CIRCUMVENTION|CIRCUMVENTION|USMCA|RCEP|FORM E/i
    },
    {
        id: 'export_customs',
        label: 'Export declaration / outbound customs',
        match: /CUSTOMS|EXPORT DECLARATION|TARIFF|HS CLASSIFICATION|LICENSE|PERMIT|VALUATION/i
    }
];

function tagText(tag) {
    return [
        tag.tag_id,
        tag.category,
        tag.category_label,
        tag.short_name,
        tag.short_description,
        tag.description,
        ...(tag.related_keywords || [])
    ].filter(Boolean).join(' ');
}

function importFocusTags(country) {
    return tags.filter((tag) => (
        tag.country === country
        && tag.direction === 'export'
        && (tag.route_focus || tag.compliance_focus || '') === 'import'
    ));
}

function exportFocusTags(country) {
    return tags.filter((tag) => (
        tag.country === country
        && tag.direction === 'export'
        && (tag.route_focus || tag.compliance_focus || '') === 'export'
    ));
}

function originImportTags(country) {
    return tags.filter((tag) => tag.country === country && tag.direction === 'import');
}

function linkedCaseIds(scopeTags) {
    return Array.from(new Set(scopeTags.flatMap((tag) => tag.related_cases || [])))
        .filter((caseId) => cases.some((item) => item.case_id === caseId))
        .sort();
}

function dimensionStatus(scopeTags, dimensions) {
    return dimensions.map((dimension) => {
        const matchedTags = scopeTags.filter((tag) => dimension.match.test(tagText(tag)));
        return {
            id: dimension.id,
            label: dimension.label,
            status: matchedTags.length > 0 ? 'covered' : 'gap',
            tag_ids: matchedTags.map((tag) => tag.tag_id).sort()
        };
    });
}

function summarizeStatus(dimensions, caseIds) {
    const covered = dimensions.filter((dimension) => dimension.status === 'covered').length;
    if (covered === dimensions.length && caseIds.length > 0) return 'strong';
    if (covered >= Math.ceil(dimensions.length / 2)) return 'partial';
    if (covered > 0) return 'thin';
    return 'none';
}

function priority(status, caseCount) {
    if (status === 'none') return 'high';
    if (status === 'thin') return 'high';
    if (status === 'partial' && caseCount === 0) return 'medium';
    if (status === 'partial') return 'medium';
    return 'low';
}

function countryLabel(code) {
    return (registry.route_options || []).find((item) => item.value === code)?.label || code;
}

const countries = COUNTRIES.map((country) => {
    const destinationImportTags = importFocusTags(country);
    const originExportTags = exportFocusTags(country);
    const originToChinaTags = originImportTags(country);
    const importCases = linkedCaseIds(destinationImportTags);
    const exportCases = linkedCaseIds(originExportTags);
    const originCases = linkedCaseIds(originToChinaTags);
    const importDimensions = dimensionStatus(destinationImportTags, IMPORT_DIMENSIONS);
    const exportDimensions = dimensionStatus(originExportTags, EXPORT_DIMENSIONS);
    const importStatus = summarizeStatus(importDimensions, importCases);
    const exportStatus = summarizeStatus(exportDimensions, exportCases);

    return {
        country,
        label: countryLabel(country),
        destination_import: {
            status: importStatus,
            priority: priority(importStatus, importCases.length),
            tag_count: destinationImportTags.length,
            case_count: importCases.length,
            tag_ids: destinationImportTags.map((tag) => tag.tag_id).sort(),
            case_ids: importCases,
            dimensions: importDimensions,
            gaps: importDimensions.filter((dimension) => dimension.status === 'gap').map((dimension) => dimension.id)
        },
        origin_export: {
            status: exportStatus,
            priority: priority(exportStatus, exportCases.length),
            tag_count: originExportTags.length,
            case_count: exportCases.length,
            tag_ids: originExportTags.map((tag) => tag.tag_id).sort(),
            case_ids: exportCases,
            dimensions: exportDimensions,
            gaps: exportDimensions.filter((dimension) => dimension.status === 'gap').map((dimension) => dimension.id)
        },
        origin_to_china_import: {
            tag_count: originToChinaTags.length,
            case_count: originCases.length,
            tag_ids: originToChinaTags.map((tag) => tag.tag_id).sort(),
            case_ids: originCases
        }
    };
});

const next_actions = countries
    .flatMap((entry) => ([
        {
            country: entry.country,
            label: entry.label,
            focus: 'destination_import',
            priority: entry.destination_import.priority,
            status: entry.destination_import.status,
            gaps: entry.destination_import.gaps
        },
        {
            country: entry.country,
            label: entry.label,
            focus: 'origin_export',
            priority: entry.origin_export.priority,
            status: entry.origin_export.status,
            gaps: entry.origin_export.gaps
        }
    ]))
    .filter((item) => item.priority !== 'low')
    .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority]
            || a.focus.localeCompare(b.focus)
            || a.country.localeCompare(b.country);
    });

const audit = {
    version: 1,
    generated_at: new Date().toISOString(),
    dimensions: {
        destination_import: IMPORT_DIMENSIONS.map(({ id, label }) => ({ id, label })),
        origin_export: EXPORT_DIMENSIONS.map(({ id, label }) => ({ id, label }))
    },
    countries,
    next_actions
};

fs.writeFileSync(path.join(root, 'data', 'coverage-audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(`Wrote data/coverage-audit.json (${countries.length} countries, ${next_actions.length} next actions).`);
