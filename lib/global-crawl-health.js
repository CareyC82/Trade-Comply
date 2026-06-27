'use strict';

function summarizeFetchHealth(result) {
    const sources = Array.isArray(result.sources) ? result.sources : [];
    const byCountry = sources.reduce((acc, row) => {
        const country = row.country || 'GLOBAL';
        if (!acc[country]) {
            acc[country] = {
                country,
                source_count: 0,
                ok_count: 0,
                error_count: 0,
                optional_error_count: 0,
                monitor_count: 0,
                status: 'pending'
            };
        }
        acc[country].source_count += 1;
        if (row.monitor_only) {
            acc[country].monitor_count += 1;
        } else if (row.ok) {
            acc[country].ok_count += 1;
        } else if (row.optional) {
            acc[country].optional_error_count += 1;
        } else {
            acc[country].error_count += 1;
        }
        return acc;
    }, {});

    Object.values(byCountry).forEach((row) => {
        if (row.error_count > 0) {
            row.status = row.ok_count > 0 ? 'partial' : 'failed';
        } else if (row.monitor_count === row.source_count && row.source_count > 0) {
            row.status = 'monitor';
        } else if ((row.ok_count + row.optional_error_count + row.monitor_count) === row.source_count && row.ok_count > 0) {
            row.status = 'ok';
        } else {
            row.status = 'pending';
        }
    });

    return {
        schema_version: 1,
        generated_at: result.fetched_at || new Date().toISOString(),
        ok: Boolean(result.ok),
        errors: result.errors || 0,
        source_count: sources.length,
        ok_count: sources.filter(row => row.ok).length,
        countries: Object.values(byCountry).sort((a, b) => a.country.localeCompare(b.country)),
        sources: sources.map((row) => ({
            id: row.id,
            country: row.country,
            label: row.label || row.id,
            type: row.type,
            method: row.method,
            url: row.url,
            ok: Boolean(row.ok),
            optional: Boolean(row.optional),
            monitor_only: Boolean(row.monitor_only),
            fetched_at: row.fetched_at || null,
            fetched_url: row.fetched_url || '',
            byte_length: row.byte_length || 0,
            transport: row.transport || '',
            error: row.error || ''
        }))
    };
}

module.exports = {
    summarizeFetchHealth
};
