/**
 * Policy announcement crawl — shared by fetch-policy-news.js, FC /test-crawl, and admin API.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'TradeComplyPolicyTracker/1.0 (+https://github.com/CareyC82/Trade-Comply)';

const RELEVANCE_KEYWORDS = [
    '半导体', '芯片', '集成电路', '电子', '出口', '进口', '管制', '两用', '海关',
    'semiconductor', 'chip', 'integrated circuit', 'electronics', 'export', 'import',
    'control', 'dual-use', 'customs', 'hs code', 'hs编码', 'gpu', 'hbm'
];

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

/** policy-sources.json paths are repo-relative (data/inbox/...); dataDir is already .../data */
function resolveDataArtifact(dataDir, configuredPath, defaultRelative) {
    const rel = String(configuredPath || defaultRelative).replace(/^data\//, '');
    return path.join(dataDir, rel);
}

function isRelevantSnippet(text) {
    const lower = text.toLowerCase();
    return RELEVANCE_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
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

/**
 * @param {object} options
 * @param {string} options.dataDir - directory containing policy-sources.json
 * @param {boolean} [options.persist=true] - write manifest + inbox (false for FC smoke test)
 * @param {number} [options.previewChars=600] - chars to include in response/log per source
 * @param {string} [options.label='policy-crawl'] - log prefix
 */
async function runPolicyCrawl(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    const persist = options.persist !== false;
    const previewChars = options.previewChars ?? 600;
    const label = options.label || 'policy-crawl';

    console.log(`=== CRON JOB START: 凌晨2点全球海关规则数据抓取开始 (${label}) ===`);

    const configPath = path.join(dataDir, 'policy-sources.json');
    if (!fs.existsSync(configPath)) {
        const error = `Missing ${configPath} in deployment bundle`;
        console.error(`=== CRON JOB FAILED: ${error} ===`);
        return { ok: false, error, sources: [] };
    }

    const config = readJson(configPath);
    const manifestPath = resolveDataArtifact(dataDir, config.manifest_path, 'inbox/manifest.json');
    const outputPath = resolveDataArtifact(dataDir, config.output_path, 'inbox/latest_announcement.txt');
    const manifest = persist
        ? readJson(manifestPath, { schema_version: '1.0', updated_at: null, sources: {} })
        : { schema_version: '1.0', updated_at: null, sources: {} };

    const enabledSources = (config.sources || []).filter((source) => source.enabled !== false);
    if (enabledSources.length === 0) {
        console.log('=== CRON JOB SUCCESS: 无启用数据源 ===');
        return { ok: true, message: 'No enabled policy sources', sources: [], changed_count: 0 };
    }

    const sourceResults = [];
    const changedBlocks = [];
    let fetchErrors = 0;

    for (const source of enabledSources) {
        const row = {
            id: source.id,
            label: source.label,
            url: source.url,
            ok: false
        };

        try {
            const result = await fetchSource(source);
            const previous = manifest.sources[source.id];
            const changed = !previous || previous.content_hash !== result.content_hash;
            const relevant = isRelevantSnippet(result.text);

            row.ok = true;
            row.fetched_at = result.fetched_at;
            row.byte_length = result.byte_length;
            row.content_hash = result.content_hash;
            row.changed = changed;
            row.relevant = relevant;
            row.preview = truncateText(result.text, previewChars);

            manifest.sources[source.id] = {
                id: source.id,
                label: source.label,
                url: source.url,
                content_hash: result.content_hash,
                fetched_at: result.fetched_at,
                byte_length: result.byte_length,
                last_changed_at: changed ? result.fetched_at : (previous?.last_changed_at || result.fetched_at)
            };

            console.log(`[${source.id}] ${changed ? 'CHANGED' : 'UNCHANGED'} relevant=${relevant} bytes=${result.byte_length}`);
            console.log(`[${source.id}] PREVIEW: ${row.preview}`);

            if (changed && relevant) {
                changedBlocks.push({
                    id: source.id,
                    label: source.label,
                    url: source.url,
                    fetched_at: result.fetched_at,
                    preview: row.preview,
                    text: result.text
                });
                console.log(`=== NEW RELEVANT: ${source.id} ===`);
            } else if (changed) {
                console.log(`CHANGED but low relevance, skipped for AI: ${source.id}`);
            }
        } catch (error) {
            fetchErrors += 1;
            row.error = error.message;
            console.warn(`WARN: Failed to fetch ${source.id}: ${error.message}`);
        }

        sourceResults.push(row);
    }

    manifest.updated_at = new Date().toISOString();

    let inboxWritten = false;
    if (persist) {
        writeJson(manifestPath, manifest);
    }

    if (changedBlocks.length === 0) {
        const allFailed = fetchErrors > 0 && fetchErrors === enabledSources.length;
        console.log(allFailed
            ? '=== CRON JOB FAILED: 全部数据源抓取失败 ==='
            : '=== CRON JOB SUCCESS: 无新相关政策内容 (抓取逻辑正常) ===');
        return {
            ok: !allFailed,
            message: allFailed ? 'All sources failed' : 'No new relevant policy content',
            sources: sourceResults,
            changed_count: 0,
            fetch_errors: fetchErrors,
            persist,
            manifest_path: persist ? manifestPath : null
        };
    }

    const combined = [
        'Trade Comply policy tracker inbox',
        `Generated: ${new Date().toISOString()}`,
        '',
        ...changedBlocks.map((block) => [
            `=== SOURCE: ${block.label} ===`,
            `URL: ${block.url}`,
            `Fetched: ${block.fetched_at}`,
            '',
            block.text
        ].join('\n'))
    ].join('\n');

    if (persist) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${combined}\n`, 'utf8');
        inboxWritten = true;
        console.log(`Wrote inbox: ${outputPath} (${changedBlocks.length} block(s))`);
    }

    console.log('=== CRON JOB SUCCESS: 成功洗入最新规则数据 ===');

    return {
        ok: true,
        message: `Fetched ${changedBlocks.length} new relevant source(s)`,
        sources: sourceResults,
        changed_count: changedBlocks.length,
        changed: changedBlocks.map((block) => ({
            id: block.id,
            label: block.label,
            url: block.url,
            preview: block.preview
        })),
        fetch_errors: fetchErrors,
        persist,
        inbox_written: inboxWritten,
        manifest_path: persist ? manifestPath : null,
        output_path: persist && inboxWritten ? outputPath : null
    };
}

/** FC / admin manual test — fetch only, no disk writes by default. */
async function runPolicyCrawlTest(options = {}) {
    return runPolicyCrawl({
        ...options,
        persist: options.persist === true,
        label: options.label || 'test-crawl',
        previewChars: options.previewChars ?? 800
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runPolicyCrawl,
        runPolicyCrawlTest,
        fetchSource,
        isRelevantSnippet
    };
}
