/**
 * Policy announcement crawl — shared by fetch-policy-news.js, FC /test-crawl, and admin API.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Standard Chrome 120 desktop fingerprint (GAC / WAF-heavy sources). */
const CHROME_STEALTH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
};

const DEFAULT_USER_AGENT = CHROME_STEALTH_HEADERS['User-Agent'];

const GAC_SOURCE_ID = 'gac-customs-notices';
const MANIFEST_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isGacSource(source) {
    if (!source) {
        return false;
    }
    if (source.id === GAC_SOURCE_ID) {
        return true;
    }
    const blob = `${source.url || ''} ${source.fallback_url || ''} ${source.warmup_url || ''}`;
    return /customs\.gov\.cn/i.test(blob);
}

function usesStealthProfile(source) {
    return Boolean(source.stealth || source.waf_heavy || isGacSource(source));
}

function buildFetchHeaders(source, overrides = {}) {
    const stealth = usesStealthProfile(source);
    const base = stealth
        ? { ...CHROME_STEALTH_HEADERS }
        : {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        };

    const referer = overrides.referer
        || source.referer
        || (stealth ? 'https://www.customs.gov.cn/' : null);
    if (referer) {
        base.Referer = referer;
    } else if (source.url) {
        try {
            const origin = new URL(source.url);
            base.Referer = `${origin.protocol}//${origin.host}/`;
        } catch (error) {
            /* ignore invalid URL */
        }
    }

    if (overrides.cookie) {
        base.Cookie = overrides.cookie;
    }
    if (source.user_agent) {
        base['User-Agent'] = source.user_agent;
    }
    if (source.headers && typeof source.headers === 'object') {
        Object.assign(base, source.headers);
    }
    return base;
}

function urlsToTry(source) {
    const primary = source.url;
    const extras = [
        source.fallback_url,
        source.warmup_url
    ].filter(Boolean);
    if (isGacSource(source) && primary && !primary.includes('www.customs.gov.cn')) {
        extras.unshift('http://www.customs.gov.cn/');
    }
    return [...new Set([primary, ...extras].filter(Boolean))];
}

function sleepMs(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function randomHumanDelay(source) {
    const range = source.pre_fetch_delay_sec || (usesStealthProfile(source) ? [3, 7] : [0, 0]);
    const minSec = Number(range[0]) || 0;
    const maxSec = Number(range[1] ?? range[0]) || minSec;
    if (maxSec <= 0) {
        return;
    }
    const waitSec = minSec + Math.random() * Math.max(0, maxSec - minSec);
    const waitMs = Math.round(waitSec * 1000);
    console.log(`[${source.id}] stealth human delay ${(waitMs / 1000).toFixed(1)}s before HTTP`);
    await sleepMs(waitMs);
}

function collectCookieHeader(response) {
    if (!response?.headers?.getSetCookie) {
        return '';
    }
    const parts = response.headers.getSetCookie();
    if (!Array.isArray(parts) || parts.length === 0) {
        return '';
    }
    return parts.map((line) => line.split(';')[0].trim()).filter(Boolean).join('; ');
}

function normalizeFetchedBody(rawBody, contentType, maxChars) {
    const text = (contentType || '').includes('html') ? htmlToText(rawBody) : rawBody.trim();
    const normalized = truncateText(text, maxChars || 12000);
    if (!normalized) {
        throw new Error('Empty response body after normalization.');
    }
    return normalized;
}

function buildFetchResult(text, url) {
    return {
        ok: true,
        fetched_url: url,
        text,
        fetched_at: new Date().toISOString(),
        content_hash: hashText(text),
        byte_length: Buffer.byteLength(text, 'utf8')
    };
}

function manifestCacheFresh(manifestEntry) {
    if (!manifestEntry?.cached_text || !manifestEntry?.cached_at) {
        return false;
    }
    const age = Date.now() - new Date(manifestEntry.cached_at).getTime();
    return age >= 0 && age <= MANIFEST_CACHE_MAX_AGE_MS;
}

function loadFromManifestCache(source, manifestEntry) {
    if (source.use_manifest_cache === false || !manifestCacheFresh(manifestEntry)) {
        return null;
    }
    console.log(`[${source.id}] using manifest cache from ${manifestEntry.cached_at} (WAF fallback)`);
    return {
        ...buildFetchResult(manifestEntry.cached_text, manifestEntry.last_fetched_url || source.url),
        from_cache: true,
        cache_reason: 'waf_or_http_error'
    };
}

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

async function fetchUrlOnce(url, headers, source, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            headers,
            signal: controller.signal,
            redirect: 'follow'
        });
        if (!response.ok) {
            const blocked = response.status === 412 || response.status === 403;
            const error = new Error(
                blocked
                    ? `HTTP ${response.status} (site WAF may block bots; tried ${url})`
                    : `HTTP ${response.status} (${url})`
            );
            error.status = response.status;
            error.cookies = collectCookieHeader(response);
            throw error;
        }
        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') || '';
        const normalized = normalizeFetchedBody(rawBody, contentType, source.max_chars);
        return {
            result: buildFetchResult(normalized, url),
            cookies: collectCookieHeader(response)
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

/** GAC: warm up homepage, keep cookies, then hit notice list like a browser session. */
async function fetchGacWithStealthSession(source) {
    const warmupUrl = source.warmup_url || 'http://www.customs.gov.cn/';
    const listUrl = source.url;
    let cookieJar = '';

    await randomHumanDelay(source);

    const warmupHeaders = buildFetchHeaders(source, { referer: 'https://www.customs.gov.cn/' });
    console.log(`[${source.id}] stealth warmup GET ${warmupUrl}`);
    try {
        const warmup = await fetchUrlOnce(warmupUrl, warmupHeaders, source);
        cookieJar = warmup.cookies || cookieJar;
        if (!listUrl || listUrl === warmupUrl) {
            return warmup.result;
        }
    } catch (warmupError) {
        console.warn(`[${source.id}] warmup failed: ${warmupError.message}`);
        if (warmupError.cookies) {
            cookieJar = warmupError.cookies;
        }
    }

    await sleepMs(2000 + Math.floor(Math.random() * 2000));

    const listHeaders = buildFetchHeaders(source, {
        referer: warmupUrl,
        cookie: cookieJar || undefined
    });
    console.log(`[${source.id}] stealth session GET ${listUrl}`);
    try {
        const listFetch = await fetchUrlOnce(listUrl, listHeaders, source);
        return listFetch.result;
    } catch (listError) {
        console.warn(`[${source.id}] notice list failed: ${listError.message}`);
    }

    return null;
}

async function fetchSource(source, options = {}) {
    const manifestEntry = options.manifestEntry || null;
    const stealth = usesStealthProfile(source);

    if (stealth && isGacSource(source)) {
        try {
            const sessionResult = await fetchGacWithStealthSession(source);
            if (sessionResult) {
                return sessionResult;
            }
        } catch (error) {
            console.warn(`[${source.id}] stealth session error: ${error.message}`);
        }
    } else if (stealth) {
        await randomHumanDelay(source);
    }

    const candidates = urlsToTry(source);
    let lastError = null;
    let cookieJar = '';

    for (let index = 0; index < candidates.length; index += 1) {
        const url = candidates[index];
        if (stealth && index > 0) {
            await sleepMs(1500 + Math.floor(Math.random() * 1500));
        }

        const headers = buildFetchHeaders(source, {
            referer: isGacSource(source) ? 'https://www.customs.gov.cn/' : undefined,
            cookie: cookieJar || undefined
        });

        try {
            const fetched = await fetchUrlOnce(url, headers, source);
            if (fetched.cookies) {
                cookieJar = fetched.cookies;
            }
            return fetched.result;
        } catch (error) {
            lastError = error;
            if (error.cookies) {
                cookieJar = error.cookies;
            }
        }
    }

    const cached = loadFromManifestCache(source, manifestEntry);
    if (cached) {
        return cached;
    }

    throw lastError || new Error('No fetch URL configured');
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
            const result = await fetchSource(source, { manifestEntry: manifest.sources[source.id] });
            const previous = manifest.sources[source.id];
            const changed = !previous || previous.content_hash !== result.content_hash;
            const relevant = isRelevantSnippet(result.text);

            row.ok = true;
            row.fetched_at = result.fetched_at;
            row.fetched_url = result.fetched_url || source.url;
            row.byte_length = result.byte_length;
            row.content_hash = result.content_hash;
            row.changed = changed;
            row.relevant = relevant;
            row.preview = truncateText(result.text, previewChars);
            row.from_cache = Boolean(result.from_cache);
            if (isGacSource(source) && result.fetched_url && result.fetched_url !== source.url) {
                row.stealth_note = 'Notice list blocked by WAF; used customs.gov.cn homepage fallback';
            }

            manifest.sources[source.id] = {
                id: source.id,
                label: source.label,
                url: source.url,
                content_hash: result.content_hash,
                fetched_at: result.fetched_at,
                byte_length: result.byte_length,
                last_changed_at: changed ? result.fetched_at : (previous?.last_changed_at || result.fetched_at),
                last_fetched_url: result.fetched_url,
                cached_at: result.from_cache ? (previous?.cached_at || result.fetched_at) : result.fetched_at,
                cached_text: truncateText(result.text, 8000)
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
            if (!source.optional) {
                fetchErrors += 1;
            }
            row.error = error.message;
            row.optional = Boolean(source.optional);
            console.warn(`WARN: Failed to fetch ${source.id}${source.optional ? ' (optional)' : ''}: ${error.message}`);
        }

        sourceResults.push(row);
    }

    manifest.updated_at = new Date().toISOString();

    let inboxWritten = false;
    if (persist) {
        writeJson(manifestPath, manifest);
    }

    if (changedBlocks.length === 0) {
        const successCount = sourceResults.filter((row) => row.ok).length;
        const allFailed = successCount === 0;
        const warnings = sourceResults
            .filter((row) => !row.ok)
            .map((row) => `${row.id}: ${row.error}`);
        console.log(allFailed
            ? '=== CRON JOB FAILED: 全部数据源抓取失败 ==='
            : '=== CRON JOB SUCCESS: 无新相关政策内容 (抓取逻辑正常) ===');
        return {
            ok: !allFailed,
            message: allFailed
                ? 'All sources failed'
                : `No new relevant policy content (${successCount}/${enabledSources.length} sources reachable)`,
            sources: sourceResults,
            changed_count: 0,
            fetch_errors: fetchErrors,
            warnings,
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
        isRelevantSnippet,
        buildFetchHeaders,
        usesStealthProfile,
        isGacSource
    };
}
