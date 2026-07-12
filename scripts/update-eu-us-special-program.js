#!/usr/bin/env node
/**
 * Parse and monitor the official Annex I/II/III tables in Regulation (EU) 2026/1455.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const PROGRAM_ID = 'EU-US-2026-1455';
const OFFICIAL_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R1455';
const ORIGIN_PROCEDURE_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R1422';
const QUOTA_URL = 'https://ec.europa.eu/taxation_customs/dds2/taric/quota_list.jsp';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function decodeHtml(value) {
    const entities = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
        ge: '≥', le: '≤', thinsp: ' ', ndash: '–', mdash: '—'
    };
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, token) => {
            if (token[0] === '#') {
                const radix = token[1].toLowerCase() === 'x' ? 16 : 10;
                const number = parseInt(token.replace(/^#x?/i, ''), radix);
                return Number.isFinite(number) ? String.fromCodePoint(number) : match;
            }
            return Object.prototype.hasOwnProperty.call(entities, token.toLowerCase())
                ? entities[token.toLowerCase()]
                : match;
        })
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCnCode(value) {
    return String(value || '').replace(/^ex\s+/i, '').replace(/\D/g, '');
}

function parseCellAttributes(value) {
    const attrs = String(value || '');
    return {
        rowspan: Number((attrs.match(/rowspan\s*=\s*["']?(\d+)/i) || [])[1] || 1),
        colspan: Number((attrs.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1)
    };
}

function parseTableGrid(tableHtml) {
    const pending = [];
    const rows = [];
    for (const rowMatch of String(tableHtml || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = [];
        for (let column = 0; column < pending.length; column += 1) {
            if (pending[column]?.remaining > 0) {
                row[column] = pending[column].value;
            }
        }
        let column = 0;
        for (const cellMatch of rowMatch[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
            while (row[column] !== undefined) column += 1;
            const value = decodeHtml(cellMatch[2]);
            const { rowspan, colspan } = parseCellAttributes(cellMatch[1]);
            for (let offset = 0; offset < colspan; offset += 1) {
                row[column + offset] = value;
                if (rowspan > 1) {
                    pending[column + offset] = { remaining: rowspan, value };
                }
            }
            column += colspan;
        }
        for (let index = 0; index < pending.length; index += 1) {
            if (pending[index]?.remaining > 0) {
                pending[index].remaining -= 1;
                if (pending[index].remaining === 0) pending[index] = null;
            }
        }
        if (row.some(Boolean)) rows.push(row);
    }
    return rows;
}

function extractAnnexHtml(html, annex, nextAnnex = '') {
    const body = String(html || '');
    const start = body.indexOf(`id="anx_${annex}"`);
    if (start < 0) throw new Error(`Annex ${annex} container not found.`);
    const end = nextAnnex ? body.indexOf(`id="anx_${nextAnnex}"`, start) : body.length;
    return body.slice(start, end > start ? end : body.length);
}

function extractTables(sectionHtml) {
    return [...String(sectionHtml || '').matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
        .map((match) => parseTableGrid(match[1]));
}

function isCnCode(value) {
    return /^(?:ex\s+)?\d{2}(?:\s*\d{2}){0,3}$/i.test(String(value || '').trim());
}

function parsePercent(value) {
    const match = String(value || '').match(/(\d+(?:[,.]\d+)?)\s*%/);
    return match ? Number(match[1].replace(',', '.')) / 100 : null;
}

function buildEntry(cnCode, description, extra = {}) {
    return {
        cn_code: String(cnCode || '').trim(),
        normalized_code: normalizeCnCode(cnCode),
        ex_code: /^ex\s+/i.test(String(cnCode || '').trim()),
        description: String(description || '').trim(),
        ...extra
    };
}

function parseAnnexI(html) {
    const rows = extractTables(extractAnnexHtml(html, 'I', 'II')).flat();
    return rows
        .filter((row) => row.length >= 2 && isCnCode(row[0]))
        .map((row) => buildEntry(row[0], row[1], {
            treatment: 'Common Customs Tariff duty becomes 0% for listed US-origin CN lines.'
        }));
}

function parseAnnexII(html) {
    const rows = extractTables(extractAnnexHtml(html, 'II', 'III')).flat();
    return rows
        .filter((row) => row.length >= 3 && isCnCode(row[0]))
        .map((row) => buildEntry(row[0], row[1], {
            treatment: row[2],
            suspended_ad_valorem_rate: parsePercent(row[2])
        }));
}

function parseAnnexIII(html) {
    return extractTables(extractAnnexHtml(html, 'III'))
        .flatMap((rows) => rows.slice(1))
        .filter((row) => row.length >= 5 && /^\d{2}\.\d{4}$/.test(String(row[0] || '')) && isCnCode(row[1]))
        .map((row) => buildEntry(row[1], row[2], {
            order_number: row[0],
            in_quota_rate: row[3],
            in_quota_ad_valorem_rate: parsePercent(row[3]),
            quota_volume: row[4],
            treatment: `In-quota rate ${row[3]} while quota ${row[0]} remains available.`
        }));
}

function hashAnnexes(annexes) {
    return crypto.createHash('sha256').update(JSON.stringify(annexes)).digest('hex');
}

function hashOfficialText(value) {
    return crypto.createHash('sha256')
        .update(decodeHtml(String(value || '')))
        .digest('hex');
}

function parseQuotaStatusHtml(html, orderNumber = '') {
    const cells = [...String(html || '').matchAll(/<td[^>]*data-ecl-table-header=["']?\s*([^"'>]+)["']?[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((match) => ({ key: decodeHtml(match[1]).toLowerCase(), value: decodeHtml(match[2]) }));
    const find = (name) => cells.find((cell) => cell.key.includes(name))?.value || '';
    const normalizedOrder = normalizeCnCode(find('order number') || orderNumber);
    const balanceText = find('balance');
    const balanceMatch = balanceText.match(/([\d.,]+)\s*(.*)/);
    const balance = balanceMatch ? Number(balanceMatch[1].replace(/,/g, '')) : null;
    const unit = balanceMatch ? balanceMatch[2].trim() : '';
    const startDate = find('start date');
    const endDate = find('end date');
    const origin = find('origins');
    if (!normalizedOrder || !startDate || !endDate || balance === null || !Number.isFinite(balance)) {
        return null;
    }
    return {
        order_number: `${normalizedOrder.slice(0, 2)}.${normalizedOrder.slice(2)}`,
        origin,
        start_date: startDate,
        end_date: endDate,
        balance,
        unit,
        available: balance > 0,
        exhausted: balance <= 0
    };
}

function quotaLookupUrl(orderNumber, year = new Date().getUTCFullYear()) {
    const code = normalizeCnCode(orderNumber);
    return `${QUOTA_URL}?Lang=en&Code=${encodeURIComponent(code)}&Year=${encodeURIComponent(year)}&Status=&Critical=&Expand=false&Offset=0`;
}

async function fetchQuotaStatuses(orderNumbers = [], fetcher = fetchOfficialHtml) {
    const uniqueOrders = [...new Set(asArray(orderNumbers).filter(Boolean))];
    const rows = [];
    const errors = [];
    for (const orderNumber of uniqueOrders) {
        try {
            const url = quotaLookupUrl(orderNumber);
            const html = await fetcher(url);
            const parsed = parseQuotaStatusHtml(html, orderNumber);
            if (!parsed) throw new Error('Quota response did not contain a complete balance row.');
            rows.push({ ...parsed, official_url: url });
        } catch (error) {
            errors.push({ order_number: orderNumber, error: error.message });
        }
    }
    return { rows, errors };
}

function diffAnnexes(previous = {}, next = {}) {
    const flatten = (annexes) => ['I', 'II', 'III'].flatMap((annex) => asArray(annexes?.[annex]?.entries).map((row) => ({
        key: `${annex}|${row.normalized_code || normalizeCnCode(row.cn_code)}|${row.order_number || ''}`,
        annex,
        cn_code: row.cn_code,
        order_number: row.order_number || '',
        fingerprint: JSON.stringify(row)
    })));
    const before = new Map(flatten(previous).map((row) => [row.key, row]));
    const after = new Map(flatten(next).map((row) => [row.key, row]));
    const added = [...after.values()].filter((row) => !before.has(row.key));
    const removed = [...before.values()].filter((row) => !after.has(row.key));
    const changed = [...after.values()].filter((row) => before.has(row.key) && before.get(row.key).fingerprint !== row.fingerprint);
    return { added, removed, changed };
}

function parseRegulationHtml(html) {
    const annexI = parseAnnexI(html);
    const annexII = parseAnnexII(html);
    const annexIII = parseAnnexIII(html);
    const quotaCount = new Set(annexIII.map((row) => row.order_number)).size;
    if (annexI.length < 100 || annexII.length < 10 || annexIII.length < 50 || quotaCount < 15) {
        throw new Error(`Official annex parser returned incomplete rows: I=${annexI.length}, II=${annexII.length}, III=${annexIII.length}, quotas=${quotaCount}.`);
    }
    const annexes = {
        I: {
            treatment: 'Common Customs Tariff duty becomes 0% for listed US-origin CN lines.',
            line_count: annexI.length,
            entries: annexI
        },
        II: {
            treatment: 'Ad valorem component is suspended to zero; the entry-price specific duty remains.',
            line_count: annexII.length,
            entries: annexII
        },
        III: {
            treatment: 'Listed in-quota rate applies while the applicable quota remains available.',
            quota_count: quotaCount,
            line_count: annexIII.length,
            entries: annexIII
        }
    };
    return {
        annexes,
        content_hash: hashAnnexes(annexes),
        counts: {
            annex_i: annexI.length,
            annex_ii: annexII.length,
            annex_iii: annexIII.length,
            quotas: quotaCount
        }
    };
}

async function fetchOfficialHtml(url = OFFICIAL_URL) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'TraceWize tariff monitor (+https://tracewize.com)',
            Accept: 'text/html,application/xhtml+xml'
        },
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
}

function readDutyRates() {
    return JSON.parse(fs.readFileSync(DUTY_RATES_PATH, 'utf8'));
}

function writeDutyRates(payload) {
    fs.writeFileSync(DUTY_RATES_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

async function updateEuUsSpecialProgram({
    dryRun = false,
    html = '',
    originProcedureHtml = '',
    fetcher = fetchOfficialHtml,
    originProcedureFetcher = null,
    quotaFetcher = fetchOfficialHtml,
    skipQuotaStatus = false
} = {}) {
    const checkedAt = new Date().toISOString();
    try {
        const officialHtml = html || await fetcher(OFFICIAL_URL);
        const procedureHtml = originProcedureHtml || await (originProcedureFetcher || fetcher)(ORIGIN_PROCEDURE_URL);
        const parsed = parseRegulationHtml(officialHtml);
        const procedureHash = hashOfficialText(procedureHtml);
        const payload = readDutyRates();
        const program = asArray(payload.special_programs).find((row) => row.id === PROGRAM_ID);
        if (!program) throw new Error(`${PROGRAM_ID} is missing from duty-rates.json.`);
        const oldHash = program.annex_content_hash || '';
        const oldCounts = program.annex_counts || null;
        const oldProcedureHash = program.origin_procedure_content_hash || '';
        const annexDiff = diffAnnexes(program.annexes, parsed.annexes);
        const quotaOrders = [...new Set(parsed.annexes.III.entries.map((row) => row.order_number).filter(Boolean))];
        const quotaResult = skipQuotaStatus
            ? { rows: asArray(program.quota_status?.rows), errors: [] }
            : await fetchQuotaStatuses(quotaOrders, quotaFetcher);
        const previousQuotaHash = program.quota_status?.content_hash || '';
        const quotaHash = hashOfficialText(JSON.stringify(quotaResult.rows));
        const initialized = !oldHash;
        const changed = Boolean(oldHash && oldHash !== parsed.content_hash);
        const nextProgram = {
            ...program,
            scope_status: 'official_annex_parsed',
            scope_note: 'Eligibility is resolved against the official Annex I/II/III CN entries. Entries marked ex still require product-description confirmation.',
            annex_counts: parsed.counts,
            annexes: parsed.annexes,
            annex_content_hash: parsed.content_hash,
            annex_source_url: OFFICIAL_URL,
            annex_last_checked_at: checkedAt,
            origin_procedure_content_hash: procedureHash,
            origin_procedure_last_checked_at: checkedAt,
            quota_status: {
                source_url: QUOTA_URL,
                checked_at: checkedAt,
                content_hash: quotaHash,
                rows: quotaResult.rows,
                errors: quotaResult.errors
            },
            last_verified_at: checkedAt.slice(0, 10)
        };
        payload.special_programs = asArray(payload.special_programs).map((row) => row.id === PROGRAM_ID ? nextProgram : row);
        if (!dryRun) writeDutyRates(payload);
        const changes = initialized || changed ? [{
            rule: PROGRAM_ID,
            change_type: initialized ? 'special_program_initialized' : 'special_program_annex_change',
            old_content_hash: oldHash,
            new_content_hash: parsed.content_hash,
            old_counts: oldCounts,
            new_counts: parsed.counts,
            source_url: OFFICIAL_URL,
            affected_hs: [...annexDiff.added, ...annexDiff.removed, ...annexDiff.changed].map((row) => row.cn_code),
            added_hs: annexDiff.added.map((row) => row.cn_code),
            removed_hs: annexDiff.removed.map((row) => row.cn_code),
            changed_hs: annexDiff.changed.map((row) => row.cn_code)
        }] : [];
        if (oldProcedureHash && oldProcedureHash !== procedureHash) {
            changes.push({
                rule: PROGRAM_ID,
                change_type: 'special_program_origin_procedure_change',
                old_content_hash: oldProcedureHash,
                new_content_hash: procedureHash,
                source_url: ORIGIN_PROCEDURE_URL
            });
        }
        if (previousQuotaHash && previousQuotaHash !== quotaHash) {
            const beforeRows = new Map(asArray(program.quota_status?.rows).map((row) => [row.order_number, row]));
            const quotaChanges = quotaResult.rows.filter((row) => {
                const before = beforeRows.get(row.order_number);
                return !before || before.balance !== row.balance || before.available !== row.available;
            });
            changes.push({
                rule: PROGRAM_ID,
                change_type: 'special_program_quota_change',
                affected_order_numbers: quotaChanges.map((row) => row.order_number),
                before_after: quotaChanges.map((row) => {
                    const before = beforeRows.get(row.order_number);
                    return `${row.order_number}: ${before?.balance ?? 'new'} -> ${row.balance} ${row.unit}`;
                }),
                source_url: QUOTA_URL
            });
        }
        return {
            ok: true,
            countries: ['EU', 'DE', 'NL'],
            writes_official_machine_rates: true,
            changes,
            errors: [],
            special_program: {
                id: PROGRAM_ID,
                initialized,
                changed,
                counts: parsed.counts,
                content_hash: parsed.content_hash,
                origin_procedure_content_hash: procedureHash,
                quota_checked: quotaResult.rows.length,
                quota_errors: quotaResult.errors.length
            },
            official_fetch: {
                ok: true,
                checked_at: checkedAt,
                official_url: OFFICIAL_URL,
                row_count: parsed.counts.annex_i + parsed.counts.annex_ii + parsed.counts.annex_iii,
                machine_parser_ready: true
            }
        };
    } catch (error) {
        return {
            ok: false,
            countries: ['EU', 'DE', 'NL'],
            writes_official_machine_rates: false,
            changes: [],
            errors: [{ rule: PROGRAM_ID, error: error.message }],
            official_fetch: {
                ok: false,
                checked_at: checkedAt,
                official_url: OFFICIAL_URL,
                error: error.message,
                machine_parser_ready: false
            }
        };
    }
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const htmlArg = process.argv.find((arg) => arg.startsWith('--html-file='));
    const html = htmlArg ? fs.readFileSync(htmlArg.split('=').slice(1).join('='), 'utf8') : '';
    const result = await updateEuUsSpecialProgram({ dryRun, html });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    OFFICIAL_URL,
    ORIGIN_PROCEDURE_URL,
    QUOTA_URL,
    decodeHtml,
    normalizeCnCode,
    parseTableGrid,
    parseAnnexI,
    parseAnnexII,
    parseAnnexIII,
    parseRegulationHtml,
    hashOfficialText,
    parseQuotaStatusHtml,
    quotaLookupUrl,
    fetchQuotaStatuses,
    diffAnnexes,
    updateEuUsSpecialProgram
};
