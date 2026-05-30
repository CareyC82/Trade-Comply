#!/usr/bin/env node
/**
 * Fetch policy announcement pages and write a combined inbox file when content changes.
 *
 * Usage:
 *   node scripts/fetch-policy-news.js
 *   node scripts/fetch-policy-news.js --config data/policy-sources.json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG = path.join(ROOT, 'data', 'policy-sources.json');
const USER_AGENT = 'TradeComplyPolicyTracker/1.0 (+https://github.com/CareyC82/Trade-Comply)';

function parseArgs(argv) {
    const options = { config: DEFAULT_CONFIG };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--config') {
            options.config = path.resolve(argv[index + 1]);
            index += 1;
        }
    }
    return options;
}

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        if (fallback !== undefined) {
            return fallback;
        }
        throw error;
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hashText(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateText(text, maxChars) {
    if (!maxChars || text.length <= maxChars) {
        return text;
    }
    return `${text.slice(0, maxChars - 3)}...`;
}

function isRelevantSnippet(text) {
    const lower = text.toLowerCase();
    const keywords = [
        '半导体', '芯片', '集成电路', '电子', '出口', '进口', '管制', '两用', '海关',
        'semiconductor', 'chip', 'integrated circuit', 'electronics', 'export', 'import',
        'control', 'dual-use', 'customs', 'hs code', 'hs编码', 'gpu', 'hbm'
    ];
    return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
}

async function fetchSource(source) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(source.url, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal,
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') || '';
        const text = contentType.includes('html') ? htmlToText(rawBody) : rawBody.trim();
        const normalized = truncateText(text, source.max_chars || 12000);

        if (!normalized) {
            throw new Error('Empty response body after normalization.');
        }

        return {
            ok: true,
            text: normalized,
            fetched_at: new Date().toISOString(),
            content_hash: hashText(normalized),
            byte_length: Buffer.byteLength(normalized, 'utf8')
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function main() {
    console.log('=== CRON JOB START: 政策源网页抓取 (fetch-policy-news) ===');
    const options = parseArgs(process.argv.slice(2));
    const config = readJson(options.config);
    const manifestPath = path.resolve(ROOT, config.manifest_path || 'data/inbox/manifest.json');
    const outputPath = path.resolve(ROOT, config.output_path || 'data/inbox/latest_announcement.txt');
    const manifest = readJson(manifestPath, { schema_version: '1.0', updated_at: null, sources: {} });

    const enabledSources = (config.sources || []).filter(source => source.enabled !== false);
    if (enabledSources.length === 0) {
        console.log('No enabled policy sources configured.');
        process.exitCode = 10;
        return;
    }

    const changedBlocks = [];
    let fetchErrors = 0;

    for (const source of enabledSources) {
        try {
            const result = await fetchSource(source);
            const previous = manifest.sources[source.id];
            const changed = !previous || previous.content_hash !== result.content_hash;

            manifest.sources[source.id] = {
                id: source.id,
                label: source.label,
                url: source.url,
                content_hash: result.content_hash,
                fetched_at: result.fetched_at,
                byte_length: result.byte_length,
                last_changed_at: changed ? result.fetched_at : (previous?.last_changed_at || result.fetched_at)
            };

            if (changed && isRelevantSnippet(result.text)) {
                changedBlocks.push([
                    `=== SOURCE: ${source.label} ===`,
                    `URL: ${source.url}`,
                    `Fetched: ${result.fetched_at}`,
                    '',
                    result.text
                ].join('\n'));
                console.log(`CHANGED relevant source: ${source.id}`);
            } else if (changed) {
                console.log(`CHANGED but low relevance, skipped for AI: ${source.id}`);
            } else {
                console.log(`UNCHANGED: ${source.id}`);
            }
        } catch (error) {
            fetchErrors += 1;
            console.warn(`WARN: Failed to fetch ${source.id}: ${error.message}`);
        }
    }

    manifest.updated_at = new Date().toISOString();
    writeJson(manifestPath, manifest);

    if (changedBlocks.length === 0) {
        console.log('=== CRON JOB SUCCESS: 无新相关政策内容 (fetch-policy-news) ===');
        process.exitCode = fetchErrors > 0 && fetchErrors === enabledSources.length ? 1 : 10;
        return;
    }

    const combined = [
        'Trade Comply policy tracker inbox',
        `Generated: ${new Date().toISOString()}`,
        '',
        changedBlocks.join('\n\n')
    ].join('\n');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${combined}\n`, 'utf8');
    console.log(`Wrote inbox file: ${path.relative(ROOT, outputPath)} (${changedBlocks.length} source block(s))`);
    console.log('=== CRON JOB SUCCESS: 政策公告已写入 inbox，等待 DeepSeek 解析 ===');
}

main().catch(error => {
    console.error('=== CRON JOB FAILED: fetch-policy-news ===');
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
