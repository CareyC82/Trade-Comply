/**
 * Policy announcement crawl — shared by fetch-policy-news.js, FC /test-crawl, and admin API.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { evaluatePolicyRelevance } = require('./policy-ai-filter');
const { applyIndustryPulseToProd } = require('./policy-industry-tags');
const { applyNoiseFilterToPolicyText } = require('./policy-title-filter');

/** Chrome 124 macOS — full Client Hints (GAC / WAF-heavy). */
const CHROME_STEALTH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

const DEFAULT_USER_AGENT = CHROME_STEALTH_HEADERS['User-Agent'];

const GOT_SCRAPING_HEADER_OPTIONS = {
    browsers: [{ name: 'chrome', minVersion: 124, maxVersion: 124 }],
    devices: ['desktop'],
    locales: ['zh-CN'],
    operatingSystems: ['macos']
};

let gotScrapingLoader = null;

const GAC_SOURCE_ID = 'gac-customs-notices';
const MANIFEST_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function inferSourceCountry(source) {
    if (source?.country) {
        return String(source.country).toUpperCase();
    }
    const blob = `${source?.id || ''} ${source?.url || ''}`;
    if (/mofcom|customs\.gov\.cn/i.test(blob)) {
        return 'CN';
    }
    if (/bis\.doc|cbp\.gov/i.test(blob)) {
        return 'US';
    }
    if (/eur-lex/i.test(blob)) {
        return 'EU';
    }
    return 'GLOBAL';
}

function inferSourceTradeType(source) {
    if (source?.type) {
        return String(source.type).toLowerCase();
    }
    if (source?.trade_type) {
        return String(source.trade_type).toLowerCase();
    }
    return 'both';
}

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

function buildGacChromeHeaders(source, overrides = {}) {
    const base = { ...CHROME_STEALTH_HEADERS };
    const referer = overrides.referer || source.referer || 'https://www.customs.gov.cn/';
    if (referer) {
        base.Referer = referer;
        base['Sec-Fetch-Site'] = overrides.secFetchSite || (referer.includes('customs.gov.cn') ? 'same-origin' : 'cross-site');
    }
    if (source.headers && typeof source.headers === 'object') {
        Object.assign(base, source.headers);
    }
    return base;
}

async function loadGotScraping() {
    if (gotScrapingLoader === false) {
        return null;
    }
    if (gotScrapingLoader) {
        return gotScrapingLoader;
    }
    try {
        const mod = await import('got-scraping');
        gotScrapingLoader = mod.gotScraping;
        console.log('[policy-crawl] got-scraping ready (TLS/JA3 browser fingerprint)');
        return gotScrapingLoader;
    } catch (error) {
        gotScrapingLoader = false;
        console.warn(`[policy-crawl] got-scraping unavailable (${error.message}); falling back to fetch`);
        return null;
    }
}

function allowsFilteredHomepageFallback(source) {
    return source.use_homepage_fallback === true || source.use_homepage_fallback === 'filtered';
}

async function fetchUrlViaGotScraping(url, source, overrides = {}) {
    const gotScraping = await loadGotScraping();
    if (!gotScraping) {
        return null;
    }

    const headers = buildGacChromeHeaders(source, overrides);
    let response = await gotScraping({
        url,
        timeout: { request: 30000 },
        throwHttpErrors: false,
        followRedirect: true,
        headerGeneratorOptions: GOT_SCRAPING_HEADER_OPTIONS,
        headers
    });

    let status = response.statusCode || 0;
    if (status === 412 || status === 403) {
        console.warn(`[${source.id}] got-scraping ${status} with Chrome headers; retry bare TLS for ${url}`);
        response = await gotScraping({
            url,
            timeout: { request: 30000 },
            throwHttpErrors: false,
            followRedirect: true
        });
        status = response.statusCode || 0;
    }

    if (status === 412 || status === 403) {
        const error = new Error(`HTTP ${status} (got-scraping WAF; ${url})`);
        error.status = status;
        throw error;
    }
    if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status} (got-scraping; ${url})`);
    }

    const contentType = String(response.headers['content-type'] || '');
    const normalized = normalizeFetchedBody(String(response.body || ''), contentType, source.max_chars, source);
    return {
        result: buildFetchResult(normalized, url),
        transport: 'got-scraping'
    };
}

function buildFetchHeaders(source, overrides = {}) {
    const stealth = usesStealthProfile(source);
    const base = stealth
        ? buildGacChromeHeaders(source, overrides)
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
    const warmup = source.warmup_url || source.fallback_url;
    const fallback = source.fallback_url;
    if (isGacSource(source)) {
        if (!allowsFilteredHomepageFallback(source)) {
            return [...new Set([primary, fallback].filter(Boolean))];
        }
        return [...new Set([warmup, primary, fallback].filter(Boolean))];
    }
    return [...new Set([primary, fallback, warmup].filter(Boolean))];
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

function normalizeFetchedBody(rawBody, contentType, maxChars, source = null) {
    const text = (contentType || '').includes('html') ? htmlToText(rawBody) : rawBody.trim();
    let normalized = truncateText(text, maxChars || 12000);
    if (!normalized) {
        throw new Error('Empty response body after normalization.');
    }

    if (source) {
        const filtered = applyNoiseFilterToPolicyText(normalized);
        if (filtered.skipped.length > 0) {
            console.log(
                `[${source.id}] noise blacklist: skipped ${filtered.skipped.length}, `
                + `kept ${filtered.stats.kept ?? 0}/${filtered.stats.total ?? 0}`
            );
            filtered.skipped.slice(0, 8).forEach((row) => {
                console.log(`  - skip: ${(row.title || row.line || '').slice(0, 100)}`);
            });
        }
        normalized = truncateText(filtered.text, maxChars || 12000);
        if (!normalized) {
            throw new Error(
                `All headlines matched administrative noise blacklist (${filtered.skipped.length} skipped)`
            );
        }
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

function isStaleGacManifestCache(source, manifestEntry) {
    if (!isGacSource(source) || !manifestEntry?.last_fetched_url) {
        return false;
    }
    const fetched = String(manifestEntry.last_fetched_url);
    const configured = String(source.url || '');
    if (!allowsFilteredHomepageFallback(source)) {
        if (fetched === 'http://www.customs.gov.cn/' || fetched === 'https://www.customs.gov.cn/') {
            return true;
        }
        if (configured && fetched !== configured) {
            return true;
        }
    }
    return false;
}

function loadFromManifestCache(source, manifestEntry) {
    if (source.use_manifest_cache === false || !manifestCacheFresh(manifestEntry)) {
        return null;
    }
    if (isStaleGacManifestCache(source, manifestEntry)) {
        console.warn(`[${source.id}] ignoring stale manifest cache (${manifestEntry.last_fetched_url})`);
        return null;
    }
    const filtered = applyNoiseFilterToPolicyText(manifestEntry.cached_text || '');
    const cleanText = filtered.text.trim();
    if (!cleanText) {
        console.warn(`[${source.id}] manifest cache empty after noise blacklist`);
        return null;
    }
    console.log(`[${source.id}] using manifest cache from ${manifestEntry.cached_at} (WAF fallback)`);
    return {
        ...buildFetchResult(cleanText, manifestEntry.last_fetched_url || source.url),
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
        const normalized = normalizeFetchedBody(rawBody, contentType, source.max_chars, source);
        return {
            result: buildFetchResult(normalized, url),
            cookies: collectCookieHeader(response)
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * GAC: got-scraping (TLS/JA3) — session warmup, then regulations/notices list (no homepage body fallback by default).
 */
async function fetchGacWithGotScraping(source) {
    const warmupUrl = source.warmup_url || 'http://www.customs.gov.cn/';
    const listUrl = source.url;
    const allowHomepageFallback = allowsFilteredHomepageFallback(source);
    let homepagePayload = null;

    await randomHumanDelay(source);

    console.log(`[${source.id}] got-scraping warmup ${warmupUrl}`);
    try {
        const warmup = await fetchUrlViaGotScraping(warmupUrl, source, {
            referer: 'https://www.customs.gov.cn/',
            secFetchSite: 'none'
        });
        if (warmup?.result) {
            homepagePayload = warmup.result;
        }
    } catch (warmupError) {
        console.warn(`[${source.id}] got-scraping warmup failed: ${warmupError.message}`);
    }

    if (listUrl && listUrl !== warmupUrl) {
        await sleepMs(2000 + Math.floor(Math.random() * 2000));
        console.log(`[${source.id}] got-scraping notice list ${listUrl}`);
        try {
            const listFetch = await fetchUrlViaGotScraping(listUrl, source, {
                referer: warmupUrl,
                secFetchSite: 'same-origin'
            });
            if (listFetch?.result) {
                return { ...listFetch.result, transport: 'got-scraping' };
            }
        } catch (listError) {
            console.warn(
                `[${source.id}] got-scraping list blocked (${listError.message}); `
                + (allowHomepageFallback && homepagePayload
                    ? 'using homepage body'
                    : 'homepage fallback disabled — will try fetch fallback')
            );
        }
    }

    if (homepagePayload && allowHomepageFallback) {
        const filteredMode = source.use_homepage_fallback === 'filtered';
        const note = listUrl && listUrl !== warmupUrl
            ? (filteredMode
                ? 'Regulations list WAF 412; using noise-filtered homepage digest via got-scraping'
                : 'Notice list WAF 412; homepage OK via got-scraping (TLS fingerprint)')
            : undefined;
        return {
            ...homepagePayload,
            transport: 'got-scraping',
            stealth_note: note
        };
    }

    if (homepagePayload && !allowHomepageFallback) {
        console.warn(`[${source.id}] regulations list unavailable; not using homepage (use_homepage_fallback=false)`);
    }

    return null;
}

/** GAC fetch fallback when got-scraping is not installed (e.g. Alibaba FC zip). */
async function fetchGacWithStealthSession(source) {
    const warmupUrl = source.warmup_url || 'http://www.customs.gov.cn/';
    const listUrl = source.url;
    let cookieJar = '';
    let homepagePayload = null;

    await randomHumanDelay(source);

    const warmupHeaders = buildFetchHeaders(source, { referer: 'https://www.customs.gov.cn/', secFetchSite: 'none' });
    console.log(`[${source.id}] fetch warmup GET ${warmupUrl}`);
    try {
        const warmup = await fetchUrlOnce(warmupUrl, warmupHeaders, source);
        cookieJar = warmup.cookies || cookieJar;
        homepagePayload = warmup.result;
        if (!listUrl || listUrl === warmupUrl) {
            return { ...homepagePayload, transport: 'fetch' };
        }
    } catch (warmupError) {
        console.warn(`[${source.id}] fetch warmup failed: ${warmupError.message}`);
        if (warmupError.cookies) {
            cookieJar = warmupError.cookies;
        }
    }

    await sleepMs(2000 + Math.floor(Math.random() * 2000));

    const listHeaders = buildFetchHeaders(source, {
        referer: warmupUrl,
        secFetchSite: 'same-origin',
        cookie: cookieJar || undefined
    });
    console.log(`[${source.id}] fetch notice list ${listUrl}`);
    try {
        const listFetch = await fetchUrlOnce(listUrl, listHeaders, source);
        return { ...listFetch.result, transport: 'fetch' };
    } catch (listError) {
        console.warn(`[${source.id}] fetch list blocked: ${listError.message}`);
    }

    const allowHomepageFallback = allowsFilteredHomepageFallback(source);
    if (homepagePayload && allowHomepageFallback) {
        return {
            ...homepagePayload,
            transport: 'fetch',
            stealth_note: 'Notice list WAF 412; homepage OK via fetch fallback'
        };
    }

    if (homepagePayload && !allowHomepageFallback) {
        console.warn(`[${source.id}] fetch: regulations list unavailable; homepage fallback disabled`);
    }

    return null;
}

async function fetchSource(source, options = {}) {
    const manifestEntry = options.manifestEntry || null;
    const stealth = usesStealthProfile(source);

    if (stealth && isGacSource(source)) {
        try {
            const gotResult = await fetchGacWithGotScraping(source);
            if (gotResult) {
                return gotResult;
            }
        } catch (error) {
            console.warn(`[${source.id}] got-scraping session error: ${error.message}`);
        }
        try {
            const sessionResult = await fetchGacWithStealthSession(source);
            if (sessionResult) {
                return sessionResult;
            }
        } catch (error) {
            console.warn(`[${source.id}] fetch stealth session error: ${error.message}`);
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
 * @param {boolean} [options.aiFilter=true] - LLM relevance gate before inbox/tags
 * @param {boolean} [options.offlineAiFilter] - use test fixture instead of DeepSeek
 * @param {boolean} [options.applyIndustryTags=true] - upsert industry pulse in tags.json when relevant
 * @param {Function} [options.evaluateRelevance] - inject for tests
 */
async function runPolicyCrawl(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    const persist = options.persist !== false;
    const previewChars = options.previewChars ?? 600;
    const label = options.label || 'policy-crawl';
    const aiFilterEnabled = options.aiFilter !== false;
    const evaluateRelevance = options.evaluateRelevance || evaluatePolicyRelevance;

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
    let industryTagsUpdated = [];

    for (const source of enabledSources) {
        const row = {
            id: source.id,
            label: source.label,
            url: source.url,
            ok: false
        };

        try {
            const previous = manifest.sources[source.id];
            if (previous?.url && previous.url !== source.url) {
                console.log(`[${source.id}] source URL changed — invalidating manifest entry`);
                delete manifest.sources[source.id];
            }
            const result = await fetchSource(source, { manifestEntry: manifest.sources[source.id] });
            const rawChanged = !previous || previous.content_hash !== result.content_hash;

            let aiResult = previous?.ai_filter || null;
            const canReuseAiFilter = aiResult
                && previous?.content_hash === result.content_hash
                && aiResult.content_hash === result.content_hash;

            if (aiFilterEnabled && !canReuseAiFilter) {
                try {
                    aiResult = await evaluateRelevance({
                        sourceId: source.id,
                        sourceLabel: source.label,
                        sourceUrl: result.fetched_url || source.url,
                        sourceCountry: inferSourceCountry(source),
                        sourceType: inferSourceTradeType(source),
                        text: result.text,
                        offline: Boolean(options.offlineAiFilter),
                        offlineFixturePath: options.offlineAiFilterFixturePath,
                        fallbackWithoutApiKey: options.aiFilterFallbackWithoutApiKey
                    });
                    aiResult.content_hash = result.content_hash;
                } catch (filterError) {
                    console.warn(`[${source.id}] AI filter error: ${filterError.message}`);
                    aiResult = {
                        relevant: false,
                        impact_countries: [],
                        direction: 'BOTH',
                        industry: 'None',
                        summary_en: '',
                        method: 'error',
                        evaluated_at: new Date().toISOString(),
                        content_hash: result.content_hash,
                        error: filterError.message
                    };
                }
            } else if (!aiFilterEnabled) {
                const keywordRelevant = isRelevantSnippet(result.text);
                aiResult = {
                    relevant: keywordRelevant,
                    impact_countries: keywordRelevant ? [inferSourceCountry(source)] : [],
                    direction: 'BOTH',
                    industry: keywordRelevant ? 'Electronics' : 'None',
                    summary_en: '',
                    method: 'keyword-only',
                    evaluated_at: new Date().toISOString(),
                    content_hash: result.content_hash
                };
            }

            const pipelineRelevant = Boolean(aiResult?.relevant);
            const previousPipelineHash = previous?.pipeline_hash
                || (previous?.ai_filter?.relevant ? previous.content_hash : null);
            const pipelineChanged = pipelineRelevant
                && rawChanged
                && result.content_hash !== previousPipelineHash;

            row.ok = true;
            row.fetched_at = result.fetched_at;
            row.fetched_url = result.fetched_url || source.url;
            row.byte_length = result.byte_length;
            row.content_hash = result.content_hash;
            row.raw_changed = rawChanged;
            row.changed = pipelineChanged;
            row.relevant = pipelineRelevant;
            row.ai_relevant = pipelineRelevant;
            row.ai_industry = aiResult?.industry || 'None';
            row.ai_impact_countries = aiResult?.impact_countries || [];
            row.ai_direction = aiResult?.direction || 'BOTH';
            row.ai_summary_en = aiResult?.summary_en || '';
            row.ai_filter_method = aiResult?.method || 'unknown';
            row.preview = truncateText(result.text, previewChars);
            row.from_cache = Boolean(result.from_cache);
            row.transport = result.transport || 'fetch';
            if (result.stealth_note) {
                row.stealth_note = result.stealth_note;
            } else if (isGacSource(source) && result.fetched_url && result.fetched_url !== source.url) {
                row.stealth_note = `Notice list WAF; used ${result.fetched_url} via ${row.transport}`;
            }
            if (!pipelineRelevant && rawChanged) {
                row.stealth_note = row.stealth_note
                    ? `${row.stealth_note}; AI filter: not relevant (${row.ai_filter_method})`
                    : `AI filter: not relevant (${row.ai_filter_method})`;
            }

            manifest.sources[source.id] = {
                id: source.id,
                label: source.label,
                url: source.url,
                content_hash: result.content_hash,
                pipeline_hash: pipelineRelevant ? result.content_hash : (previous?.pipeline_hash || null),
                fetched_at: result.fetched_at,
                byte_length: result.byte_length,
                last_changed_at: pipelineChanged ? result.fetched_at : (previous?.last_changed_at || result.fetched_at),
                last_fetched_url: result.fetched_url,
                cached_at: result.from_cache ? (previous?.cached_at || result.fetched_at) : result.fetched_at,
                cached_text: truncateText(result.text, 8000),
                ai_filter: aiResult
            };

            console.log(
                `[${source.id}] raw=${rawChanged ? 'CHANGED' : 'UNCHANGED'} `
                + `pipeline=${pipelineChanged ? 'CHANGED' : 'UNCHANGED'} `
                + `ai_relevant=${pipelineRelevant} industry=${row.ai_industry} `
                + `direction=${row.ai_direction} impact=${(row.ai_impact_countries || []).join(',') || '-'} `
                + `bytes=${result.byte_length}`
            );
            console.log(`[${source.id}] PREVIEW: ${row.preview}`);
            if (pipelineRelevant && row.ai_summary_en) {
                console.log(`[${source.id}] AI_SUMMARY_EN: ${row.ai_summary_en}`);
            }

            if (pipelineChanged) {
                changedBlocks.push({
                    id: source.id,
                    label: source.label,
                    url: source.url,
                    fetched_at: result.fetched_at,
                    preview: row.preview,
                    text: result.text,
                    ai_industry: row.ai_industry,
                    ai_impact_countries: row.ai_impact_countries,
                    ai_direction: row.ai_direction,
                    ai_summary_en: row.ai_summary_en
                });
                console.log(`=== NEW RELEVANT (AI PASS): ${source.id} ===`);

                if (persist && options.applyIndustryTags !== false && row.ai_summary_en) {
                    try {
                        const tagResult = applyIndustryPulseToProd({
                            industry: row.ai_industry,
                            summaryEn: row.ai_summary_en,
                            sourceId: source.id,
                            sourceLabel: source.label,
                            sourceUrl: result.fetched_url || source.url,
                            fetchedAt: result.fetched_at
                        });
                        if (tagResult.ok) {
                            industryTagsUpdated.push(tagResult.tag_id);
                            console.log(`[${source.id}] industry pulse tag ${tagResult.created ? 'created' : 'updated'}: ${tagResult.tag_id}`);
                        }
                    } catch (tagError) {
                        console.warn(`[${source.id}] industry pulse tag update failed: ${tagError.message}`);
                    }
                }
            } else if (rawChanged && !pipelineRelevant) {
                console.log(`[${source.id}] raw page changed but AI filter rejected — no inbox/tags write`);
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
            `AI Industry: ${block.ai_industry || 'None'}`,
            `AI Impact Countries: ${(block.ai_impact_countries || []).join(', ') || 'n/a'}`,
            `AI Direction: ${block.ai_direction || 'BOTH'}`,
            `AI Summary (EN): ${block.ai_summary_en || '(none)'}`,
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

    if (industryTagsUpdated.length > 0) {
        try {
            const { rebuildCatalog } = require('./data-review');
            rebuildCatalog();
            console.log(`Rebuilt catalog after industry pulse update (${industryTagsUpdated.join(', ')})`);
        } catch (catalogError) {
            console.warn(`WARN: catalog rebuild after industry pulse: ${catalogError.message}`);
        }
    }

    return {
        ok: true,
        message: `Fetched ${changedBlocks.length} new relevant source(s)`,
        sources: sourceResults,
        changed_count: changedBlocks.length,
        changed: changedBlocks.map((block) => ({
            id: block.id,
            label: block.label,
            url: block.url,
            preview: block.preview,
            ai_industry: block.ai_industry,
            ai_impact_countries: block.ai_impact_countries,
            ai_direction: block.ai_direction,
            ai_summary_en: block.ai_summary_en
        })),
        fetch_errors: fetchErrors,
        industry_tags_updated: industryTagsUpdated,
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
        fetchUrlOnce,
        fetchUrlViaGotScraping,
        evaluatePolicyRelevance,
        isRelevantSnippet,
        buildFetchHeaders,
        usesStealthProfile,
        isGacSource,
        loadGotScraping
    };
}
