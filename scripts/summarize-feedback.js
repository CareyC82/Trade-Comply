#!/usr/bin/env node
/**
 * Summarize structured feedback records from OSS or a local export directory.
 *
 * Usage:
 *   node scripts/summarize-feedback.js
 *   node scripts/summarize-feedback.js --days 7
 *   node scripts/summarize-feedback.js --dir ./feedback-export
 *   node scripts/summarize-feedback.js --json --output reports/feedback-summary.json
 */

const fs = require('fs');
const path = require('path');

const {
    getOssConfig,
    loadFeedbackRecordsFromOss,
    parseFeedbackRecord
} = require('../feedback-store');

const ROOT = path.join(__dirname, '..');

function printHelp() {
    console.log(`Usage: node scripts/summarize-feedback.js [options]

Options:
  --days <n>       Look back N days from now (default: 7)
  --since <iso>    Include records on/after this ISO date
  --until <iso>    Include records on/before this ISO date
  --dir <path>     Read JSON files from a local directory instead of OSS
  --json           Print JSON summary to stdout
  --output <path>  Write JSON summary to a file
  --top <n>       Top no-result list size (default: 20)
  --top-gap <n>   Top in-scope gap list size (default: 10)
  --help           Show this help
`);
}

function parseArgs(argv) {
    const options = {
        days: 7,
        since: null,
        until: null,
        dir: null,
        json: false,
        output: null,
        topNoResult: 20,
        topInScopeGap: 10,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--days':
                options.days = Number(argv[index + 1]);
                index += 1;
                break;
            case '--since':
                options.since = new Date(argv[index + 1]);
                index += 1;
                break;
            case '--until':
                options.until = new Date(argv[index + 1]);
                index += 1;
                break;
            case '--dir':
                options.dir = argv[index + 1];
                index += 1;
                break;
            case '--json':
                options.json = true;
                break;
            case '--output':
                options.output = argv[index + 1];
                index += 1;
                break;
            case '--top':
                options.topNoResult = Number(argv[index + 1]);
                index += 1;
                break;
            case '--top-gap':
                options.topInScopeGap = Number(argv[index + 1]);
                index += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isFinite(options.days) || options.days <= 0) {
        throw new Error('--days must be a positive number.');
    }
    if (options.since && Number.isNaN(options.since.getTime())) {
        throw new Error('--since must be a valid ISO date.');
    }
    if (options.until && Number.isNaN(options.until.getTime())) {
        throw new Error('--until must be a valid ISO date.');
    }

    return options;
}

function resolveDateRange(options) {
    const until = options.until || new Date();
    const since = options.since || new Date(until.getTime() - options.days * 24 * 60 * 60 * 1000);
    return { since, until };
}

function walkJsonFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkJsonFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(fullPath);
        }
    }

    return files;
}

function loadFeedbackRecordsFromDir(dirPath, { since, until } = {}) {
    const absoluteDir = path.resolve(dirPath);
    if (!fs.existsSync(absoluteDir)) {
        throw new Error(`Directory not found: ${absoluteDir}`);
    }

    const sinceMs = since ? since.getTime() : null;
    const untilMs = until ? until.getTime() : null;
    const records = [];

    for (const filePath of walkJsonFiles(absoluteDir)) {
        const rawText = fs.readFileSync(filePath, 'utf8');
        const record = parseFeedbackRecord(rawText, path.relative(ROOT, filePath));
        if (!record) {
            continue;
        }

        const submittedMs = Date.parse(record.submitted_at || '');
        if (Number.isFinite(submittedMs)) {
            if (sinceMs !== null && submittedMs < sinceMs) {
                continue;
            }
            if (untilMs !== null && submittedMs > untilMs) {
                continue;
            }
        }

        records.push({
            ...record,
            _source_key: path.relative(ROOT, filePath)
        });
    }

    records.sort((left, right) => {
        const leftMs = Date.parse(left.submitted_at || '') || 0;
        const rightMs = Date.parse(right.submitted_at || '') || 0;
        return rightMs - leftMs;
    });

    return records;
}

function normalizeQuery(text) {
    return String(text || '').trim().toLowerCase();
}

function incrementCounter(counter, key) {
    if (!key) {
        return;
    }
    counter.set(key, (counter.get(key) || 0) + 1);
}

function counterToSortedList(counter, limit, labelMap = null) {
    return Array.from(counter.entries())
        .sort((left, right) => {
            if (right[1] !== left[1]) {
                return right[1] - left[1];
            }
            return left[0].localeCompare(right[0]);
        })
        .slice(0, limit)
        .map(([key, count]) => ({
            key,
            count,
            label: labelMap?.get(key) || key
        }));
}

function buildQueryGroups(records, predicate) {
    const groups = new Map();

    for (const record of records) {
        if (!predicate(record)) {
            continue;
        }

        const normalized = normalizeQuery(record.product_query);
        if (!normalized) {
            continue;
        }

        const existing = groups.get(normalized) || {
            query: record.product_query.trim(),
            count: 0,
            latest_submitted_at: record.submitted_at || null,
            sample_regulation_needed: record.regulation_needed || '',
            views: new Set(),
            trust_statuses: new Set()
        };

        existing.count += 1;
        if (record.view) {
            existing.views.add(record.view);
        }
        if (record.trust_status) {
            existing.trust_statuses.add(record.trust_status);
        }
        if (!existing.sample_regulation_needed && record.regulation_needed) {
            existing.sample_regulation_needed = record.regulation_needed;
        }

        const submittedMs = Date.parse(record.submitted_at || '') || 0;
        const latestMs = Date.parse(existing.latest_submitted_at || '') || 0;
        if (submittedMs >= latestMs) {
            existing.latest_submitted_at = record.submitted_at || existing.latest_submitted_at;
            if (record.regulation_needed) {
                existing.sample_regulation_needed = record.regulation_needed;
            }
        }

        groups.set(normalized, existing);
    }

    return Array.from(groups.values())
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            return left.query.localeCompare(right.query);
        });
}

function summarizeFeedbackRecords(records, { since, until, topNoResult, topInScopeGap }) {
    const trustStatusCounts = new Map();
    const viewCounts = new Map();
    const directionCounts = new Map();
    const riskLevelCounts = new Map();
    const precheckAttributeCounts = new Map();
    const matchedTagCounts = new Map();
    const noMatchViewCounts = new Map();
    const noMatchPrecheckCounts = new Map();

    let withEmail = 0;
    let withRegulationText = 0;
    let noResultCount = 0;
    let inScopeGapCount = 0;
    let outOfScopeCount = 0;

    for (const record of records) {
        incrementCounter(trustStatusCounts, record.trust_status || 'unknown');
        incrementCounter(viewCounts, record.view || 'unknown');
        incrementCounter(directionCounts, record.direction || 'unknown');
        incrementCounter(riskLevelCounts, record.risk_level || 'unknown');

        if (record.email) {
            withEmail += 1;
        }
        if (record.regulation_needed) {
            withRegulationText += 1;
        }

        if (!record.had_results || record.trust_status === 'no_match') {
            noResultCount += 1;
        }
        if (record.trust_status === 'no_match') {
            inScopeGapCount += 1;
            incrementCounter(noMatchViewCounts, record.view || 'unknown');
            (record.selected_precheck_attributes || []).forEach(attribute => {
                incrementCounter(noMatchPrecheckCounts, attribute);
            });
        }
        if (record.trust_status === 'out_of_scope') {
            outOfScopeCount += 1;
        }

        (record.matched_tag_ids || []).forEach(tagId => {
            incrementCounter(matchedTagCounts, tagId);
        });
    }

    const topNoResultQueries = buildQueryGroups(
        records,
        record => !record.had_results || record.trust_status === 'no_match'
    ).slice(0, topNoResult);

    const topInScopeGapProducts = buildQueryGroups(
        records,
        record => record.trust_status === 'no_match'
    ).slice(0, topInScopeGap);

    return {
        generated_at: new Date().toISOString(),
        period: {
            since: since.toISOString(),
            until: until.toISOString()
        },
        totals: {
            records: records.length,
            no_result: noResultCount,
            in_scope_no_rules: inScopeGapCount,
            out_of_scope: outOfScopeCount,
            with_email: withEmail,
            with_regulation_text: withRegulationText
        },
        breakdowns: {
            trust_status: counterToSortedList(trustStatusCounts, 20),
            view: counterToSortedList(viewCounts, 20),
            direction: counterToSortedList(directionCounts, 10),
            risk_level: counterToSortedList(riskLevelCounts, 10),
            no_match_by_view: counterToSortedList(noMatchViewCounts, 20),
            no_match_precheck_attributes: counterToSortedList(noMatchPrecheckCounts, 20),
            matched_tag_ids: counterToSortedList(matchedTagCounts, 20)
        },
        top_no_result_queries: topNoResultQueries.map(item => ({
            product_query: item.query,
            count: item.count,
            latest_submitted_at: item.latest_submitted_at,
            sample_regulation_needed: item.sample_regulation_needed,
            views: Array.from(item.views).sort()
        })),
        top_in_scope_gap_products: topInScopeGapProducts.map(item => ({
            product_query: item.query,
            count: item.count,
            latest_submitted_at: item.latest_submitted_at,
            sample_regulation_needed: item.sample_regulation_needed,
            views: Array.from(item.views).sort()
        }))
    };
}

function formatTextReport(summary) {
    const lines = [];
    lines.push('Trade Comply feedback summary');
    lines.push(`Generated: ${summary.generated_at}`);
    lines.push(`Period: ${summary.period.since} -> ${summary.period.until}`);
    lines.push('');
    lines.push('Totals');
    lines.push(`  Records: ${summary.totals.records}`);
    lines.push(`  No-result submissions: ${summary.totals.no_result}`);
    lines.push(`  In-scope / no rules (no_match): ${summary.totals.in_scope_no_rules}`);
    lines.push(`  Out of scope: ${summary.totals.out_of_scope}`);
    lines.push(`  With regulation text: ${summary.totals.with_regulation_text}`);
    lines.push(`  With email: ${summary.totals.with_email}`);
    lines.push('');

    lines.push('Trust status');
    summary.breakdowns.trust_status.forEach(item => {
        lines.push(`  ${item.key}: ${item.count}`);
    });
    lines.push('');

    lines.push(`Top ${summary.top_no_result_queries.length} no-result search terms`);
    if (summary.top_no_result_queries.length === 0) {
        lines.push('  (none)');
    } else {
        summary.top_no_result_queries.forEach((item, index) => {
            lines.push(`  ${index + 1}. ${item.product_query} (${item.count})`);
            if (item.sample_regulation_needed) {
                lines.push(`     regulation needed: ${item.sample_regulation_needed}`);
            }
        });
    }
    lines.push('');

    lines.push(`Top ${summary.top_in_scope_gap_products.length} in-scope products with no matched rules`);
    if (summary.top_in_scope_gap_products.length === 0) {
        lines.push('  (none)');
    } else {
        summary.top_in_scope_gap_products.forEach((item, index) => {
            lines.push(`  ${index + 1}. ${item.product_query} (${item.count})`);
            if (item.sample_regulation_needed) {
                lines.push(`     regulation needed: ${item.sample_regulation_needed}`);
            }
        });
    }
    lines.push('');

    lines.push('No-match gap signals');
    lines.push('  By view:');
    if (summary.breakdowns.no_match_by_view.length === 0) {
        lines.push('    (none)');
    } else {
        summary.breakdowns.no_match_by_view.forEach(item => {
            lines.push(`    ${item.key}: ${item.count}`);
        });
    }
    lines.push('  By precheck attribute:');
    if (summary.breakdowns.no_match_precheck_attributes.length === 0) {
        lines.push('    (none)');
    } else {
        summary.breakdowns.no_match_precheck_attributes.forEach(item => {
            lines.push(`    ${item.key}: ${item.count}`);
        });
    }
    lines.push('');

    lines.push('Most cited matched tag IDs (when results existed)');
    if (summary.breakdowns.matched_tag_ids.length === 0) {
        lines.push('  (none)');
    } else {
        summary.breakdowns.matched_tag_ids.forEach(item => {
            lines.push(`  ${item.key}: ${item.count}`);
        });
    }

    return `${lines.join('\n')}\n`;
}

async function loadRecords(options, dateRange) {
    if (options.dir) {
        return loadFeedbackRecordsFromDir(options.dir, dateRange);
    }

    const config = getOssConfig();
    if (!config.bucket || !config.accessKeyId || !config.accessKeySecret) {
        throw new Error(
            'OSS is not configured. Set OSS_* env vars or pass --dir <local-export-path>.'
        );
    }

    return loadFeedbackRecordsFromOss(dateRange);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const dateRange = resolveDateRange(options);
    const records = await loadRecords(options, dateRange);
    const summary = summarizeFeedbackRecords(records, {
        since: dateRange.since,
        until: dateRange.until,
        topNoResult: options.topNoResult,
        topInScopeGap: options.topInScopeGap
    });

    if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        console.error(`Wrote ${path.relative(ROOT, outputPath)}`);
    }

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
        return;
    }

    if (!options.output) {
        process.stdout.write(formatTextReport(summary));
    }
}

main().catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
