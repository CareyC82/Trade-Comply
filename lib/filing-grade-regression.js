'use strict';

const postEntry = require('./post-entry-value');
const { activeOn, isoDay } = require('./versioned-duty-overrides');

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function sampleDate(row = {}, fallback) {
    return isoDay(row.effective_from) || isoDay(row.effective_to) || fallback;
}
function expectedAddOnRate(rule = {}) {
    const layers = rule.add_on_layers || rule.addOnLayers;
    if (Array.isArray(layers)) return layers.reduce((sum, layer) => sum + Number(layer.rate || 0), 0);
    return Number(rule.additional_rate ?? rule.additionalRate ?? 0);
}
function previousDay(value) {
    const day = isoDay(value);
    if (!day) return '';
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}
function programActiveOn(program = {}, date) {
    const day = isoDay(date);
    const start = isoDay(program.effective_from);
    const end = isoDay(program.effective_to);
    return Boolean(day && (!start || start <= day) && (!end || end >= day));
}

function buildFilingGradeRegression(payload = {}, { asOfDate = new Date().toISOString().slice(0, 10) } = {}) {
    const failures = [];
    const rows = [];
    const programRows = [];
    const rules = payload.rules || [];
    postEntry.setDutyRateData(payload);
    try {
        for (const rule of rules) {
            const byCode = new Map();
            for (const override of rule.exact_code_overrides || []) {
                const hs = digits(override.hs_code);
                if (!hs) continue;
                const periods = byCode.get(hs) || [];
                for (const prior of periods) {
                    const priorStart = isoDay(prior.effective_from) || '0000-01-01';
                    const priorEnd = isoDay(prior.effective_to) || '9999-12-31';
                    const nextStart = isoDay(override.effective_from) || '0000-01-01';
                    const nextEnd = isoDay(override.effective_to) || '9999-12-31';
                    if (priorStart <= nextEnd && nextStart <= priorEnd) failures.push({ type: 'overlapping_effective_periods', rule_id: rule.id, hs_code: hs });
                }
                periods.push(override);
                byCode.set(hs, periods);
                const date = sampleDate(override, asOfDate);
                const context = { importCountryCode: rule.import_country, originCountryCode: rule.origin_country === '*' ? 'ZZ' : rule.origin_country, hsCode: hs, entryDate: date };
                const resolved = postEntry.findDutyRule(context);
                const rateMatches = resolved && Number(resolved.baseRate) === Number(override.base_rate);
                if (!rateMatches) failures.push({ type: 'entry_date_rate_mismatch', rule_id: rule.id, hs_code: hs, entry_date: date });
                const wrongMarket = postEntry.findDutyRule({ ...context, importCountryCode: 'ZZ' });
                if (wrongMarket?.id === rule.id) failures.push({ type: 'market_isolation_failure', rule_id: rule.id, hs_code: hs });
                if (rule.origin_country && rule.origin_country !== '*') {
                    const alternateOrigin = rule.origin_country === 'CN' ? 'US' : 'CN';
                    const wrongOrigin = postEntry.findDutyRule({ ...context, originCountryCode: alternateOrigin });
                    if (wrongOrigin?.id === rule.id) failures.push({ type: 'origin_isolation_failure', rule_id: rule.id, hs_code: hs });
                }
                const expectedAddOn = expectedAddOnRate(rule);
                const addOnMatches = resolved && Number(resolved.additionalRate || 0) === expectedAddOn;
                if (!addOnMatches) failures.push({ type: 'add_on_layer_mismatch', rule_id: rule.id, hs_code: hs });
                rows.push({ rule_id: rule.id, market: rule.import_country, origin: rule.origin_country, hs_code: hs, entry_date: date, expected_rate: override.base_rate, resolved_rate: resolved?.baseRate ?? null, expected_add_on_rate: expectedAddOn, resolved_add_on_rate: resolved?.additionalRate ?? null, effective_status: activeOn(override, asOfDate) ? 'current' : (isoDay(override.effective_from) > asOfDate ? 'future' : 'historical'), ok: Boolean(rateMatches && addOnMatches) });
            }
        }
    } finally {
        postEntry.setDutyRulesForTest(null);
    }
    for (const program of payload.special_programs || []) {
        const start = isoDay(program.effective_from);
        const before = previousDay(start);
        const markets = Array.isArray(program.import_markets) ? program.import_markets.filter(Boolean) : [];
        const origins = Array.isArray(program.origin_countries) ? program.origin_countries.filter(Boolean) : [];
        const boundaryOk = Boolean(start && before && !programActiveOn(program, before) && programActiveOn(program, start));
        const scopeOk = markets.length > 0 && origins.length > 0 && /^https:\/\//.test(String(program.official_url || ''));
        if (!boundaryOk) failures.push({ type: 'special_program_effective_boundary_failure', program_id: program.id || '' });
        if (!scopeOk) failures.push({ type: 'special_program_scope_failure', program_id: program.id || '' });
        programRows.push({
            program_id: program.id || '', effective_from: start || null, effective_to: isoDay(program.effective_to) || null,
            before_date: before || null, active_before: before ? programActiveOn(program, before) : null,
            active_on_start: start ? programActiveOn(program, start) : null, markets, origins,
            official_url: program.official_url || '', ok: boundaryOk && scopeOk
        });
    }
    return { ok: failures.length === 0, as_of_date: asOfDate, checked_rows: rows.length, market_count: new Set(rows.map((row) => row.market)).size, current_rows: rows.filter((row) => row.effective_status === 'current').length, historical_rows: rows.filter((row) => row.effective_status === 'historical').length, future_rows: rows.filter((row) => row.effective_status === 'future').length, special_program_count: programRows.length, special_program_rows: programRows, rows, failures };
}

module.exports = { buildFilingGradeRegression };
