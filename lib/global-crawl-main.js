/**
 * Global Crawl Engine — Step 1 (fetch only, English-only).
 *
 * Config-driven multi-jurisdiction source registry + in-memory raw text cache.
 * Steps 2–4 live in global-compliance-crawler.js (AI refiner, storage, admin route).
 */
'use strict';

const {
    fetchSource,
    fetchUrlOnce,
    fetchUrlViaGotScraping
} = require('./policy-crawl');
// ---------------------------------------------------------------------------
// GLOBAL_CRAWL_SOURCES — single source of truth (edit URLs here)
// ---------------------------------------------------------------------------

/**
 * Global source registry (English-only metadata). Edit URLs and methods here.
 * @type {Array<{ id: string, country: 'CN'|'US'|'EU'|'JP'|'KR'|'SG'|'IN'|'MX', type: 'import'|'export'|'both', url: string, method: 'fetch'|'got-scraping', label?: string, fallback_url?: string, waf_heavy?: boolean, optional?: boolean, monitor_only?: boolean, enabled?: boolean, max_chars?: number, legacy_profile?: string, legacy_options?: object }>}
 */
const GLOBAL_CRAWL_SOURCES = [
    {
        id: 'zh-mofcom',
        country: 'CN',
        type: 'export',
        url: 'https://www.mofcom.gov.cn/zwgk/zcfb/',
        method: 'fetch',
        label: 'China MOFCOM export control announcements',
        waf_heavy: true,
        max_chars: 12000
    },
    {
        id: 'zh-gac',
        country: 'CN',
        type: 'both',
        url: 'http://www.customs.gov.cn/customs/302249/302266/index.html',
        method: 'got-scraping',
        label: 'China GAC customs notices',
        legacy_profile: 'cn-gac',
        waf_heavy: true,
        optional: true,
        legacy_options: {
            fallback_url: 'http://www.customs.gov.cn/customs/302249/302270/index.html',
            warmup_url: 'http://www.customs.gov.cn/',
            use_homepage_fallback: 'filtered',
            referer: 'https://www.customs.gov.cn/',
            stealth: true,
            use_manifest_cache: true,
            pre_fetch_delay_sec: [3, 7],
            max_chars: 12000
        }
    },
    {
        id: 'us-bis',
        country: 'US',
        type: 'export',
        url: 'https://www.bis.doc.gov/index.php/about-bis/newsroom',
        method: 'fetch',
        label: 'US BIS newsroom',
        max_chars: 12000
    },
    {
        id: 'us-cbp',
        country: 'US',
        type: 'import',
        url: 'https://www.cbp.gov/trade/automated/newsflash',
        method: 'fetch',
        label: 'US CBP trade newsflash',
        fallback_url: 'https://www.cbp.gov/trade/automated',
        max_chars: 12000
    },
    {
        id: 'us-ustr',
        country: 'US',
        type: 'import',
        url: 'https://ustr.gov/issue-areas/enforcement/section-301-investigations/tariff-actions',
        method: 'fetch',
        label: 'US USTR Section 301 tariff actions',
        max_chars: 12000
    },
    {
        id: 'us-ofac',
        country: 'US',
        type: 'both',
        url: 'https://ofac.treasury.gov/recent-actions',
        method: 'fetch',
        label: 'US OFAC recent sanctions actions',
        max_chars: 12000
    },
    {
        id: 'us-fcc',
        country: 'US',
        type: 'import',
        url: 'https://www.fcc.gov/news-events/headlines',
        method: 'fetch',
        label: 'US FCC equipment authorization and enforcement headlines',
        optional: true,
        max_chars: 12000
    },
    {
        id: 'eu-lex',
        country: 'EU',
        type: 'both',
        url: 'https://eur-lex.europa.eu/homepage.html?ihcl=en',
        method: 'fetch',
        label: 'EU EUR-Lex Official Journal index',
        max_chars: 12000
    },
    {
        id: 'eu-trade',
        country: 'EU',
        type: 'both',
        url: 'https://policy.trade.ec.europa.eu/news_en',
        method: 'fetch',
        label: 'European Commission trade policy news',
        max_chars: 12000
    },
    {
        id: 'jp-meti',
        country: 'JP',
        type: 'both',
        url: 'https://www.meti.go.jp/english/press/',
        method: 'fetch',
        label: 'Japan METI policy and trade control press releases',
        max_chars: 12000
    },
    {
        id: 'kr-kcs',
        country: 'KR',
        type: 'both',
        url: 'https://www.customs.go.kr/english/main.do',
        method: 'fetch',
        label: 'Korea Customs Service official notices',
        max_chars: 12000
    },
    {
        id: 'sg-customs',
        country: 'SG',
        type: 'both',
        url: 'https://www.customs.gov.sg/news/',
        method: 'fetch',
        label: 'Singapore Customs news and notices',
        max_chars: 12000
    },
    {
        id: 'in-dgft',
        country: 'IN',
        type: 'both',
        url: 'https://www.dgft.gov.in/CP/?opt=notification',
        method: 'fetch',
        label: 'India DGFT notifications',
        max_chars: 12000
    },
    {
        id: 'mx-snice',
        country: 'MX',
        type: 'both',
        url: 'https://www.snice.gob.mx/',
        method: 'fetch',
        label: 'Mexico SNICE trade portal monitor',
        monitor_only: true,
        max_chars: 12000
    }
];

function isGacSource(entry) {
    return entry?.id === 'zh-gac' || entry?.legacy_profile === 'cn-gac';
}

// ---------------------------------------------------------------------------
// Fetch loop infrastructure (no LLM / no tags.json writes)
// ---------------------------------------------------------------------------

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getEnabledSources(registry = GLOBAL_CRAWL_SOURCES) {
    return registry.filter((entry) => entry.enabled !== false);
}

function logLine(logger, level, message, meta) {
    if (level === 'fetching' && logger?.fetching && meta?.sourceId) {
        logger.fetching(meta.sourceId);
        return;
    }
    if (level === 'crawl' && logger?.fetching && meta?.sourceId) {
        logger.fetching(meta.sourceId);
        return;
    }
    if (level === 'crawl' && logger?.crawl && meta) {
        logger.crawl(meta.country, meta.sourceId, meta.transport, message);
        return;
    }
    if (logger && typeof logger[level] === 'function') {
        logger[level](message);
        return;
    }
    const prefix = '[GLOBAL-CRAWL]';
    if (level === 'fail') {
        console.error(`${prefix} [FAIL] ${message}`);
    } else if (level === 'warn') {
        console.warn(`${prefix} [WARN] ${message}`);
    } else if (level === 'ok') {
        console.log(`${prefix} [OK] ${message}`);
    } else {
        console.log(`${prefix} [INFO] ${message}`);
    }
}

function buildFetchHeaders(entry) {
    const acceptLanguage = entry.country === 'CN'
        ? 'zh-CN,zh;q=0.9,en;q=0.8'
        : 'en-US,en;q=0.9';
    const headers = {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': acceptLanguage,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Upgrade-Insecure-Requests': '1'
    };
    try {
        const origin = new URL(entry.url);
        headers.Referer = `${origin.protocol}//${origin.host}/`;
    } catch (error) {
        /* ignore invalid URL */
    }
    return headers;
}

function entryAsPolicySource(entry) {
    return {
        id: entry.id,
        label: entry.label,
        url: entry.url,
        max_chars: entry.max_chars || 12000,
        country: entry.country,
        trade_type: entry.type
    };
}

function legacySourceFromGlobal(entry) {
    if (!isGacSource(entry)) {
        return entryAsPolicySource(entry);
    }
    return {
        id: 'gac-customs-notices',
        label: entry.label,
        url: entry.url,
        enabled: true,
        optional: Boolean(entry.optional),
        max_chars: entry.max_chars || 12000,
        ...(entry.legacy_options || {})
    };
}

function shouldEscalateToGotScraping(entry, error) {
    if (!error || (error.status !== 412 && error.status !== 403)) {
        return false;
    }
    if (entry.method === 'got-scraping') {
        return false;
    }
    return Boolean(entry.waf_heavy || entry.country === 'CN');
}

async function fetchWithMethod(entry, method, targetUrl) {
    const policySource = entryAsPolicySource({ ...entry, url: targetUrl });

    if (method === 'got-scraping') {
        const got = await fetchUrlViaGotScraping(targetUrl, policySource);
        if (!got?.result) {
            throw new Error('got-scraping returned empty body');
        }
        return {
            rawText: got.result.text,
            fetched_url: got.result.fetched_url || targetUrl,
            byte_length: got.result.byte_length,
            content_hash: got.result.content_hash,
            transport: 'got-scraping'
        };
    }

    const headers = buildFetchHeaders({ ...entry, url: targetUrl });
    const fetched = await fetchUrlOnce(targetUrl, headers, policySource);
    return {
        rawText: fetched.result.text,
        fetched_url: fetched.result.fetched_url || targetUrl,
        byte_length: fetched.result.byte_length,
        content_hash: fetched.result.content_hash,
        transport: 'fetch'
    };
}

async function fetchSingleSource(entry, options = {}) {
    if (isGacSource(entry)) {
        const legacy = legacySourceFromGlobal(entry);
        const manifestEntry = options.manifestEntry || null;
        const result = await fetchSource(legacy, { manifestEntry });
        return {
            rawText: result.text,
            fetched_url: result.fetched_url || entry.url,
            byte_length: result.byte_length,
            content_hash: result.content_hash,
            transport: result.transport || entry.method,
            stealth_note: result.stealth_note || null
        };
    }

    const preferred = entry.method || 'fetch';
    const urls = [...new Set([entry.url, entry.fallback_url].filter(Boolean))];
    let lastError = null;

    for (let index = 0; index < urls.length; index += 1) {
        const targetUrl = urls[index];
        try {
            return await fetchWithMethod(entry, preferred, targetUrl);
        } catch (error) {
            lastError = error;
            if (shouldEscalateToGotScraping(entry, error)) {
                logLine(options.logger, 'warn',
                    `${entry.id}: ${preferred} WAF ${error.status || ''} — escalating to got-scraping`);
                try {
                    return await fetchWithMethod(entry, 'got-scraping', targetUrl);
                } catch (gotError) {
                    lastError = gotError;
                }
            }
            if (index < urls.length - 1) {
                logLine(options.logger, 'warn', `${entry.id}: retrying fallback URL ${urls[index + 1]}`);
            }
        }
    }

    throw lastError || new Error('No fetch URL configured');
}

/**
 * Main Step-1 loop: iterate GLOBAL_CRAWL_SOURCES and cache parsed raw text in memory.
 *
 * @returns {Promise<{ ok: boolean, fetched_at: string, sources: object[], rawTextStore: Record<string, object>, errors: number }>}
 */
async function runGlobalSourceFetchLoop(options = {}) {
    const registry = options.sources || GLOBAL_CRAWL_SOURCES;
    const enabled = getEnabledSources(registry);
    const logger = options.logger;
    const rawTextStore = Object.create(null);
    const sourceRows = [];
    let errors = 0;

    logLine(logger, 'info', `Fetch loop start — ${enabled.length} source(s)`);

    for (const entry of enabled) {
        const row = {
            id: entry.id,
            country: entry.country,
            type: entry.type,
            label: entry.label,
            url: entry.url,
            method: entry.method,
            ok: false
        };

        logLine(logger, 'fetching', '', { sourceId: entry.id });

        try {
            if (entry.monitor_only) {
                row.ok = true;
                row.monitor_only = true;
                row.fetched_at = new Date().toISOString();
                row.fetched_url = entry.url;
                row.byte_length = 0;
                row.transport = 'official-link-monitor';
                row.raw_text_preview = '';
                logLine(logger, 'ok', `country=${entry.country} official-link monitor only`);
                sourceRows.push(row);
                continue;
            }

            const manifestKey = entry.legacy_profile === 'cn-gac' ? 'gac-customs-notices' : entry.id;
            const manifestEntry = options.manifestSources?.[manifestKey] || null;
            const payload = await fetchSingleSource(entry, { manifestEntry, logger });

            const rawText = String(payload.rawText || '').trim();
            if (!rawText) {
                throw new Error('Empty body after fetch');
            }

            row.ok = true;
            row.fetched_at = new Date().toISOString();
            row.fetched_url = payload.fetched_url;
            row.byte_length = payload.byte_length ?? Buffer.byteLength(rawText, 'utf8');
            row.content_hash = payload.content_hash;
            row.transport = payload.transport;
            row.stealth_note = payload.stealth_note || null;
            row.raw_text_preview = rawText.slice(0, 400);

            rawTextStore[entry.id] = {
                id: entry.id,
                country: entry.country,
                type: entry.type,
                label: entry.label,
                url: entry.url,
                method: entry.method,
                fetched_at: row.fetched_at,
                fetched_url: payload.fetched_url,
                rawText,
                byte_length: row.byte_length,
                content_hash: row.content_hash,
                transport: payload.transport
            };

            logLine(logger, 'ok', `country=${entry.country} ${row.byte_length} bytes via ${payload.transport}`);
        } catch (error) {
            if (!entry.optional) {
                errors += 1;
            }
            row.error = error.message;
            row.optional = Boolean(entry.optional);
            logLine(logger, 'fail', `country=${entry.country} source=${entry.id}: ${error.message}${row.optional ? ' [optional]' : ''}`);
        }

        sourceRows.push(row);
    }

    const okCount = sourceRows.filter((row) => row.ok).length;
    logLine(logger, 'info', `Fetch loop end — ${okCount}/${enabled.length} OK, errors=${errors}`);

    return {
        ok: errors === 0 || okCount > 0,
        fetched_at: new Date().toISOString(),
        sources: sourceRows,
        rawTextStore,
        errors
    };
}

/** Alias used by pipeline / CLI */
const runGlobalCrawlFetchAll = runGlobalSourceFetchLoop;

module.exports = {
    GLOBAL_CRAWL_SOURCES,
    isGacSource,
    getEnabledSources,
    runGlobalSourceFetchLoop,
    runGlobalCrawlFetchAll,
    fetchSingleSource
};
