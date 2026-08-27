#!/usr/bin/env node
/**
 * Local review API for admin.html (password-protected).
 *
 * Usage:
 *   ADMIN_ROUTES_ENABLED=1 ADMIN_REVIEW_PASSWORD=your-secret node scripts/admin-server.js
 *   open http://127.0.0.1:8787/admin.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
    listPendingItems,
    approvePendingItem,
    rejectPendingItem,
    loadQueue,
    getDataPaths
} = require('../lib/data-review');
const {
    maybeTriggerPublishSyncAfterApprove,
    publishReviewedDataToGit
} = require('../lib/publish-sync');
const { buildCrawlSummary } = require('../lib/crawl-summary');
const {
    PRIMARY_ADMIN_HEADER,
    authorizeAdminRouteAccess,
    isProtectedAdminPath,
    logUnauthorizedAdminAccess,
    buildAdminForbiddenPayload,
    resolveClientIpFromRequest,
    areAdminRoutesEnabled,
    getConfiguredAdminSecrets
} = require('../lib/admin-route-security');

const ROOT = path.join(__dirname, '..');
const { loadLocalEnvFiles } = require('../lib/load-local-env');
let envFiles = loadLocalEnvFiles(ROOT);

const PORT = Number(process.env.ADMIN_REVIEW_PORT || 8787);
const ADMIN_BUILD_ID = '20260725-admin-data-workbench-v1';
const LOG_PREFIX = '[GLOBAL-CRAWL]';
const COVERAGE_MATRIX_PATH = path.join(ROOT, 'data', 'coverage-matrix.json');
const DUTY_RATES_PATH = path.join(ROOT, 'data', 'duty-rates.json');
const DUTY_RATE_SOURCES_PATH = path.join(ROOT, 'data', 'duty-rate-sources.json');
const DUTY_RATE_SYNC_STATUS_PATH = path.join(ROOT, 'data', 'duty-rate-sync-status.json');
const MY_DUTY_RATE_IMPORT_STATUS_PATH = path.join(ROOT, 'data', 'my-duty-rate-import-status.json');
const P2_DUTY_RATE_IMPORT_STATUS_PATH = path.join(ROOT, 'data', 'p2-duty-rate-import-status.json');
const EXACT_TARIFF_PRIORITIES_PATH = path.join(ROOT, 'data', 'exact-tariff-parser-priorities.json');
const DUTY_RATE_IMPORT_AUDIT_PATH = path.join(ROOT, 'data', 'duty-rate-import-audit.json');
const DUTY_RATE_VERSIONS_DIR = path.join(ROOT, 'data', 'duty-rate-versions');
const AUTOMATION_LAUNCH_STATUS_PATH = path.join(ROOT, 'data', 'automation-launch-status.json');
const EXPORT_TAX_RATES_PATH = path.join(ROOT, 'data', 'export-tax-rates.json');
const UNMET_SEARCH_BACKLOG_PATH = path.join(ROOT, 'data', 'unmet-search-backlog.json');
const REGULATORY_SNAPSHOTS_PATH = path.join(ROOT, 'data', 'consumer-regulatory-snapshots.json');
const REGULATORY_CHANGES_PATH = path.join(ROOT, 'data', 'consumer-regulatory-changes.json');
const REGULATORY_REVIEW_AUDIT_PATH = path.join(ROOT, 'data', 'consumer-regulatory-review-audit.json');
const REGULATORY_ACCURACY_STATUS_PATH = path.join(ROOT, 'data', 'regulatory-accuracy-status.json');
const COVERAGE_LEVELS = new Set(['full', 'partial', 'baseline', 'none']);

/** Re-read .env.local / .env so keys work without restart after file is created. */
function refreshLocalEnv() {
    envFiles = loadLocalEnvFiles(ROOT);
    return Boolean(String(process.env.DEEPSEEK_API_KEY || '').trim());
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function buildAdminAuthContext(req, queryParams = {}) {
    return {
        query: queryParams,
        headers: req.headers,
        bearerToken: getBearerToken(req)
    };
}

function denyAdminRoute(req, res, auth, urlPath) {
    logUnauthorizedAdminAccess({
        reason: auth.reason,
        method: req.method,
        path: urlPath,
        ip: resolveClientIpFromRequest(req),
        credential_source: auth.credential_source
    });
    sendJson(res, 403, buildAdminForbiddenPayload(auth));
}

function readBody(req, maxBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error(`Request body exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') {
        urlPath = '/admin.html';
    }

    const relative = path.normalize(urlPath.replace(/^\//, '')).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(ROOT, relative);

    if (!filePath.startsWith(ROOT)) {
        sendJson(res, 403, { ok: false, error: 'Forbidden' });
        return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
}

function normalizeApiPath(url) {
    const raw = String(url || '').split('?')[0];
    const trimmed = raw.replace(/\/+$/, '') || '/';
    return trimmed;
}

function parseRequestQuery(req) {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
    return Object.fromEntries(requestUrl.searchParams.entries());
}

async function handleReviewHealth(req, res, urlPath) {
    const dataPaths = getDataPaths();
    sendJson(res, 200, {
        ok: true,
        build: ADMIN_BUILD_ID,
        project_root: ROOT,
        data_paths: dataPaths,
        supported_kinds: ['tag', 'case', 'risk_signal'],
        admin_routes_enabled: areAdminRoutesEnabled(),
        secrets_configured: getConfiguredAdminSecrets().length > 0,
        test_crawl: '/api/test-crawl (GET/POST, global crawl engine)',
        engine: 'global-crawl-engine',
        engine_build: ADMIN_BUILD_ID,
        got_scraping: Boolean(require('fs').existsSync(path.join(ROOT, 'node_modules', 'got-scraping'))),
        deepseek_configured: refreshLocalEnv(),
        env_files_loaded: envFiles,
        env_local_exists: fs.existsSync(path.join(ROOT, '.env.local'))
    });
}

async function handleTestCrawl(req, res, queryParams) {
    if (!refreshLocalEnv()) {
        sendJson(res, 400, {
            ok: false,
            error: 'DEEPSEEK_API_KEY is not configured. Create .env.local from .env.example, set DEEPSEEK_API_KEY=sk-..., then refresh this page or restart: npm run restart:admin',
            changed: 0,
            errors: 0,
            deepseek_configured: false,
            env_files_loaded: envFiles,
            env_local_exists: fs.existsSync(path.join(ROOT, '.env.local'))
        });
        return;
    }
    const {
        runGlobalCrawlTest,
        ENGINE_BUILD_ID,
        parsePersistQueryFlag,
        buildCrawlTelemetry
    } = require('../lib/global-compliance-crawler');
    const requestUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const persist = parsePersistQueryFlag(requestUrl.searchParams);
    console.log(`${LOG_PREFIX} [INFO] -> /api/test-crawl persist=${persist}`);
    const result = await runGlobalCrawlTest({
        dataDir: path.join(ROOT, 'data'),
        persist,
        label: 'admin-test-crawl'
    });
    const telemetry = buildCrawlTelemetry(result);
    const status = result.ok ? 200 : (telemetry.errors > 0 ? 502 : 200);
    sendJson(res, status, {
        ...result,
        changed: telemetry.changed,
        errors: telemetry.errors,
        telemetry,
        engine_build: ENGINE_BUILD_ID
    });
}

async function handleReviewPending(req, res) {
    const items = listPendingItems();
    const queue = loadQueue();
    sendJson(res, 200, {
        ok: true,
        updated_at: queue.updated_at,
        count: items.length,
        items
    });
}

async function handleReviewCrawlSummary(req, res) {
    sendJson(res, 200, buildCrawlSummary(ROOT));
}

function readJsonFile(filePath, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function readDutyArtifactAudit() {
    const audit = readJsonFile(DUTY_RATE_IMPORT_AUDIT_PATH, { schema_version: 1, updated_at: null, events: [] });
    return {
        ...audit,
        events: (audit.events || []).map(({ version_path, ...event }) => ({
            ...event,
            rollback_available: event.type === 'publish' && event.rollback_available === true
                ? fs.existsSync(path.join(DUTY_RATE_VERSIONS_DIR, `${event.id}.json`))
                : false
        }))
    };
}

function buildHybridTariffPromotionQueue() {
    const priorities = readJsonFile(EXACT_TARIFF_PRIORITIES_PATH, { priorities: [] }).priorities || [];
    const myStatus = readJsonFile(MY_DUTY_RATE_IMPORT_STATUS_PATH, {});
    const p2Markets = readJsonFile(P2_DUTY_RATE_IMPORT_STATUS_PATH, { markets: {} }).markets || {};
    return ['MY', 'KR', 'IN', 'VN', 'TW', 'RU'].map((country) => {
        const status = country === 'MY' ? myStatus : p2Markets[country] || {};
        const seen = new Set();
        const routes = priorities.filter((row) => row.import_country === country && !seen.has(row.product_id) && seen.add(row.product_id)).slice(0, 5);
        return {
            country,
            promotion_status: status.ok === true ? 'official_artifact_imported' : 'artifact_required',
            last_good_at: status.last_good_at || null,
            exact_row_count: status.artifact?.parsed_row_count || 0,
            priority_routes: routes.map((row) => ({ product_id: row.product_id, route: row.route, hs_code: row.hs_code, impact_score: row.impact_score, next_action: row.next_action })),
            safe_next_action: status.ok === true
                ? 'Run filing-grade regression and review remaining ambiguous tariff lines before promotion.'
                : 'Import a complete official artifact through Preview import; do not promote heading-only rows.'
        };
    });
}

function buildDutyRateStatusPayload() {
    const { runDutyRateHealthCheck } = require('./check-duty-rates');
    const { runPostEntryTaxCoverageCheck } = require('./check-post-entry-tax-coverage');
    const health = runDutyRateHealthCheck();
    const taxCoverage = runPostEntryTaxCoverageCheck();
    const { buildFilingGradeRegression } = require('../lib/filing-grade-regression');
    const sourcesPayload = readJsonFile(DUTY_RATE_SOURCES_PATH, { sources: [] });
    const dutyPayload = readJsonFile(DUTY_RATES_PATH, { rules: [] });
    const exportTaxPayload = readJsonFile(EXPORT_TAX_RATES_PATH, { rules: [] });
    const automationLaunchStatus = readJsonFile(AUTOMATION_LAUNCH_STATUS_PATH, {
        summary: {},
        regulatory: [],
        duty_rates: []
    });
    const syncStatus = readJsonFile(DUTY_RATE_SYNC_STATUS_PATH, {
        status: 'not_run',
        updated_at: null,
        counts: {},
        exceptions: [],
        auto_applied: []
    });
    if (!Array.isArray(syncStatus.source_run_plan)) {
        const { buildSourceRunPlan } = require('./auto-sync-duty-rates');
        syncStatus.source_run_plan = buildSourceRunPlan({
            sourcesPayload,
            runs: Array.isArray(syncStatus.runs) ? syncStatus.runs : []
        });
    }
    if (!syncStatus.automation_digest) {
        const { buildAutomationDigest } = require('./auto-sync-duty-rates');
        syncStatus.automation_digest = buildAutomationDigest({
            runs: Array.isArray(syncStatus.runs) ? syncStatus.runs : [],
            sourceRunPlan: Array.isArray(syncStatus.source_run_plan) ? syncStatus.source_run_plan : [],
            health: null
        });
    }
    return {
        ...health,
        generated_at: new Date().toISOString(),
        duty_rates_updated_at: dutyPayload.updated_at || null,
        export_tax_rates_updated_at: exportTaxPayload.updated_at || null,
        source_roadmap_updated_at: sourcesPayload.updated_at || null,
        source_roadmap_notes: sourcesPayload.notes || '',
        post_entry_tax_coverage: {
            ok: taxCoverage.ok,
            export_tax: taxCoverage.export_tax,
            failures: taxCoverage.failures
        },
        filing_grade_regression: buildFilingGradeRegression(dutyPayload),
        duty_rate_sync_status: syncStatus,
        automation_launch_status: automationLaunchStatus,
        sources: Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : [],
        exact_tariff_feeds: buildExactTariffFeedStatus(dutyPayload),
        my_official_artifact_import: readJsonFile(MY_DUTY_RATE_IMPORT_STATUS_PATH, {
            ok: null,
            trust_gate: 'not_run',
            last_good_at: null,
            checked_at: null
        }),
        p2_official_artifact_imports: readJsonFile(P2_DUTY_RATE_IMPORT_STATUS_PATH, {
            schema_version: 1,
            updated_at: null,
            markets: {}
        }),
        artifact_import_audit: readDutyArtifactAudit(),
        hybrid_promotion_queue: buildHybridTariffPromotionQueue()
    };
}

function buildExactTariffFeedStatus(dutyPayload = readJsonFile(DUTY_RATES_PATH, { rules: [] })) {
    const feedEnv = {
        EU: 'EU_TARIC_EXACT_LINES_URL',
        CN: 'CN_CUSTOMS_EXACT_TARIFF_URL',
        SG: 'SG_AHTN_EXACT_TARIFF_URL',
        MX: 'MX_TIGIE_NICO_EXACT_TARIFF_URL'
    };
    const sync = dutyPayload.last_exact_national_tariff_sync || {};
    const results = new Map((sync.results || []).map((row) => [row.country, row]));
    const euSync = dutyPayload.last_eu_taric_benchmark_sync || {};
    return {
        checked_at: sync.checked_at || euSync.official_fetch?.checked_at || dutyPayload.last_exact_national_tariff_sync_at || null,
        ok: [euSync.ok, sync.ok].filter((value) => value !== undefined).every((value) => value !== false),
        markets: Object.entries(feedEnv).map(([country, envName]) => {
            const result = country === 'EU' && Object.keys(euSync).length
                ? {
                    ok: euSync.ok && euSync.official_fetch?.ok,
                    row_count: euSync.official_candidate_rows || 0,
                    changed_rules: (euSync.changes || []).map((row) => row.rule),
                    error: euSync.errors?.[0]?.error || euSync.official_fetch_degraded_detail || ''
                }
                : results.get(country) || {};
            const targetMarkets = country === 'EU' ? ['EU', 'DE', 'NL'] : [country];
            const officialExactRows = (dutyPayload.rules || [])
                .filter((rule) => targetMarkets.includes(rule.import_country))
                .flatMap((rule) => rule.exact_code_overrides || [])
                .filter((row) => String(row.confidence || '').toLowerCase().includes('official exact tariff line'));
            return {
                country,
                target_markets: targetMarkets,
                env_name: envName,
                configured: ['EU', 'CN', 'SG', 'MX'].includes(country) || Boolean(String(process.env[envName] || '').trim()),
                connector_type: ['EU', 'CN', 'SG', 'MX'].includes(country) ? 'direct_official' : 'normalized_feed',
                status: result.ok === false ? 'failed'
                    : result.skipped ? 'not_configured'
                        : result.ok ? 'current'
                            : 'not_run',
                row_count: result.row_count || officialExactRows.length,
                changed_rule_count: (result.changed_rules || []).length,
                changed_rules: result.changed_rules || [],
                error: result.error || '',
                last_checked_at: country === 'EU' ? euSync.official_fetch?.checked_at || null : sync.checked_at || null
            };
        })
    };
}

async function handleDutyRateStatus(req, res) {
    sendJson(res, 200, buildDutyRateStatusPayload());
}

function artifactStatusPath(country) {
    return String(country || '').toUpperCase() === 'MY'
        ? MY_DUTY_RATE_IMPORT_STATUS_PATH
        : P2_DUTY_RATE_IMPORT_STATUS_PATH;
}

async function handleDutyRateArtifacts(req, res) {
    const workflow = require('../lib/duty-rate-artifact-workflow');
    if (req.method === 'GET') {
        return sendJson(res, 200, {
            ok: true,
            supported_countries: [...workflow.SUPPORTED],
            max_artifact_bytes: workflow.MAX_ARTIFACT_BYTES,
            audit: readDutyArtifactAudit()
        });
    }
    const body = await readBody(req, workflow.MAX_UPLOAD_BODY_BYTES);
    const common = {
        country: body.country,
        fileName: body.file_name,
        contentBase64: body.content_base64,
        manifest: body.manifest,
        dutyRatesPath: DUTY_RATES_PATH,
        statusPath: artifactStatusPath(body.country),
        auditPath: DUTY_RATE_IMPORT_AUDIT_PATH,
        versionsDir: DUTY_RATE_VERSIONS_DIR
    };
    if (body.action === 'preview') return sendJson(res, 200, workflow.previewArtifact(common));
    if (body.action === 'publish') return sendJson(res, 200, workflow.publishArtifact({ ...common, previewDigest: body.preview_digest }));
    if (body.action === 'rollback') return sendJson(res, 200, workflow.rollbackArtifact({
        versionId: body.version_id,
        dutyRatesPath: DUTY_RATES_PATH,
        auditPath: DUTY_RATE_IMPORT_AUDIT_PATH,
        versionsDir: DUTY_RATE_VERSIONS_DIR
    }));
    return sendJson(res, 400, { ok: false, error: 'action must be preview, publish or rollback' });
}

function buildConsumerRegulatoryStatusPayload() {
    const { enrichChanges } = require('../lib/regulatory-change-review');
    const { buildLifecycleAudit } = require('../lib/regulatory-lifecycle-audit');
    const models = require('../lib/wearable-product-models');
    const snapshots = readJsonFile(REGULATORY_SNAPSHOTS_PATH, { sources: [], source_count: 0 });
    const changes = readJsonFile(REGULATORY_CHANGES_PATH, { changes: [], pending_review_count: 0 });
    const counts = snapshots.sources.reduce((result, source) => {
        result[source.lifecycle_state || 'unknown'] = (result[source.lifecycle_state || 'unknown'] || 0) + 1;
        result[source.status || 'unknown_status'] = (result[source.status || 'unknown_status'] || 0) + 1;
        if (source.status === 'last_good_degraded') result.degraded = (result.degraded || 0) + 1;
        return result;
    }, {});
    const enriched = enrichChanges(changes);
    return { ok: snapshots.sources.every((source) => source.content_hash && source.last_good_at), generated_at: snapshots.generated_at, source_count: snapshots.source_count, counts, sources: snapshots.sources, lifecycle_audit: buildLifecycleAudit(models.sources), accuracy_status: readJsonFile(REGULATORY_ACCURACY_STATUS_PATH, null), pending_review_count: enriched.changes.filter((item) => item.review_status === 'pending_review').length, changes: enriched.changes, audit: readJsonFile(REGULATORY_REVIEW_AUDIT_PATH, { events: [] }) };
}

async function handleConsumerRegulatoryStatus(req, res) {
    if (req.method === 'GET') return sendJson(res, 200, buildConsumerRegulatoryStatusPayload());
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    try {
        const body = await readBody(req);
        const { reviewChange } = require('../lib/regulatory-change-review');
        const result = reviewChange({
            changesFile: REGULATORY_CHANGES_PATH,
            auditFile: REGULATORY_REVIEW_AUDIT_PATH,
            id: String(body.id || ''),
            type: String(body.type || ''),
            action: String(body.action || ''),
            note: body.note || '',
            testEvidence: body.test_evidence || null,
            releaseCommit: body.release_commit || ''
        });
        sendJson(res, 200, { ok: true, result, status: buildConsumerRegulatoryStatusPayload() });
    } catch (error) { sendJson(res, 400, { ok: false, error: error.message }); }
}

function buildQualityStatusPayload() {
    const { buildQualityStatus } = require('./build-quality-status');
    return buildQualityStatus();
}

async function handleQualityStatus(req, res) {
    sendJson(res, 200, buildQualityStatusPayload());
}

function buildUnmetSearchBacklogPayload() {
    const { enrichBacklog } = require('../lib/unmet-search-admin');
    return enrichBacklog(readJsonFile(UNMET_SEARCH_BACKLOG_PATH, {
        schema_version: '1.0',
        generated_at: null,
        items: []
    }));
}

async function handleUnmetSearchBacklog(req, res) {
    const {
        updateBacklogItem,
        writeBacklogAtomic
    } = require('../lib/unmet-search-admin');
    if (req.method === 'GET') {
        sendJson(res, 200, buildUnmetSearchBacklogPayload());
        return;
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }
    try {
        const body = await readBody(req);
        const id = String(body.id || '').trim();
        if (!id) throw new Error('id is required');
        const current = readJsonFile(UNMET_SEARCH_BACKLOG_PATH, { schema_version: '1.0', items: [] });
        const updated = updateBacklogItem(current, id, body.patch || {});
        writeBacklogAtomic(UNMET_SEARCH_BACKLOG_PATH, updated);
        sendJson(res, 200, { ok: true, item: updated.items.find((item) => item.id === id), payload: updated });
    } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
    }
}

function getAllowedCoverageCodes() {
    const registry = readJsonFile(path.join(ROOT, 'data', 'country-registry.json'), {});
    const routeOptions = Array.isArray(registry.route_options) ? registry.route_options : [];
    return new Set([
        ...routeOptions.map((row) => row?.value).filter(Boolean),
        'GLOBAL'
    ]);
}

function normalizeCoveragePayload(body) {
    const source = body?.matrix && typeof body.matrix === 'object' ? body.matrix : body;
    if (!source || typeof source !== 'object') {
        throw new Error('matrix object is required');
    }
    const allowedCodes = getAllowedCoverageCodes();
    const out = { import: {}, export: {} };

    ['import', 'export'].forEach((focus) => {
        const focusMatrix = source[focus];
        if (!focusMatrix || typeof focusMatrix !== 'object' || Array.isArray(focusMatrix)) {
            throw new Error(`${focus} matrix is required`);
        }
        Object.entries(focusMatrix).forEach(([rawCode, rawLevel]) => {
            const code = String(rawCode || '').trim().toUpperCase();
            const level = String(rawLevel || '').trim().toLowerCase();
            if (!allowedCodes.has(code)) {
                throw new Error(`Unsupported coverage country code: ${code}`);
            }
            if (!COVERAGE_LEVELS.has(level)) {
                throw new Error(`Unsupported coverage level for ${focus}.${code}: ${rawLevel}`);
            }
            out[focus][code] = level;
        });
        if (!out[focus].GLOBAL) {
            out[focus].GLOBAL = 'baseline';
        }
    });

    return out;
}

async function handleCoverageMatrix(req, res) {
    if (req.method === 'GET') {
        sendJson(res, 200, readJsonFile(COVERAGE_MATRIX_PATH, {
            version: 1,
            updated_at: null,
            matrix: { import: { GLOBAL: 'baseline' }, export: { GLOBAL: 'baseline' } }
        }));
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
    }

    let body;
    try {
        body = await readBody(req);
        const current = readJsonFile(COVERAGE_MATRIX_PATH, { version: 1, levels: {} });
        const matrix = normalizeCoveragePayload(body);
        const payload = {
            version: Number(current.version || 1),
            updated_at: new Date().toISOString(),
            levels: current.levels || {},
            matrix
        };
        fs.writeFileSync(COVERAGE_MATRIX_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        sendJson(res, 200, {
            ok: true,
            message: 'Coverage matrix saved',
            path: COVERAGE_MATRIX_PATH,
            payload
        });
    } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
    }
}

async function handleReviewApproveReject(req, res, urlPath) {
    let body;
    try {
        body = await readBody(req);
    } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
        return;
    }

    const pendingId = typeof body.pending_id === 'string' ? body.pending_id.trim() : '';
    if (!pendingId) {
        sendJson(res, 400, { ok: false, error: 'pending_id is required' });
        return;
    }

    if (urlPath.endsWith('/approve')) {
        let result;
        try {
            result = approvePendingItem(pendingId);
        } catch (error) {
            sendJson(res, 500, { ok: false, error: error.message });
            return;
        }
        if (result.ok) {
            const dataPaths = getDataPaths();
            result.written_paths = {
                tags: dataPaths.prodTags,
                cases: dataPaths.prodCases,
                queue: dataPaths.queue,
                catalog: path.join(dataPaths.root, 'data', 'catalog.json')
            };
            const sync = await maybeTriggerPublishSyncAfterApprove({ pendingId });
            result.sync = sync;
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
    }

    const result = rejectPendingItem(pendingId);
    sendJson(res, result.ok ? 200 : 400, result);
}

async function handlePublishSync(req, res) {
    try {
        const body = await readBody(req);
        const dispatch = body.dispatch === true || process.env.PUBLISH_DISPATCH === '1';
        const result = await publishReviewedDataToGit({ dispatch });
        sendJson(res, 200, result);
    } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
    }
}

async function handleApi(req, res) {
    refreshLocalEnv();
    const urlPath = normalizeApiPath(req.url);
    const queryParams = parseRequestQuery(req);

    if (!isProtectedAdminPath(urlPath, req.method, queryParams)) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
    }

    const auth = authorizeAdminRouteAccess(buildAdminAuthContext(req, queryParams));
    if (!auth.ok) {
        denyAdminRoute(req, res, auth, urlPath);
        return;
    }

    try {
        if (req.method === 'GET' && urlPath === '/api/review/health') {
            await handleReviewHealth(req, res, urlPath);
            return;
        }

        if (urlPath === '/api/test-crawl' && (req.method === 'GET' || req.method === 'POST')) {
            await handleTestCrawl(req, res, queryParams);
            return;
        }

        if (req.method === 'GET' && urlPath === '/api/review/pending') {
            await handleReviewPending(req, res);
            return;
        }

        if (req.method === 'GET' && urlPath === '/api/review/crawl-summary') {
            await handleReviewCrawlSummary(req, res);
            return;
        }

        if (req.method === 'GET' && urlPath === '/api/review/duty-rates') {
            await handleDutyRateStatus(req, res);
            return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/review/duty-artifacts') {
            await handleDutyRateArtifacts(req, res);
            return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/review/consumer-regulations') {
            await handleConsumerRegulatoryStatus(req, res);
            return;
        }

        if (req.method === 'GET' && urlPath === '/api/review/quality-status') {
            await handleQualityStatus(req, res);
            return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/review/unmet-searches') {
            await handleUnmetSearchBacklog(req, res);
            return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && urlPath === '/api/review/coverage-matrix') {
            await handleCoverageMatrix(req, res);
            return;
        }

        if (req.method === 'POST' && (urlPath === '/api/review/approve' || urlPath === '/api/review/reject')) {
            await handleReviewApproveReject(req, res, urlPath);
            return;
        }

        if (req.method === 'POST' && urlPath === '/api/review/publish-sync') {
            await handlePublishSync(req, res);
            return;
        }

        sendJson(res, 403, {
            ok: false,
            error: 'Forbidden. This administrative endpoint is not available.',
            reason: 'route_not_implemented'
        });
    } catch (error) {
        console.error('[admin-server] route error', urlPath, error.message);
        sendJson(res, 500, { ok: false, error: error.message, engine_build: ADMIN_BUILD_ID });
    }
}

function createAdminServer() {
    return http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', `Content-Type, Authorization, ${PRIMARY_ADMIN_HEADER}`);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url.startsWith('/api/')) {
            await handleApi(req, res);
            return;
        }

        serveStatic(req, res);
    });
}

function startAdminServer() {
    const server = createAdminServer();
    server.listen(PORT, '127.0.0.1', () => {
        const dataPaths = getDataPaths();
        if (!areAdminRoutesEnabled()) {
            console.warn('WARNING: ADMIN_ROUTES_ENABLED is not set. All /api/* admin routes return 403 until enabled.');
            console.warn('Add ADMIN_ROUTES_ENABLED=1 to .env.local (npm run restart:admin sets this).');
        }
        if (getConfiguredAdminSecrets().length === 0) {
            console.warn('WARNING: TEST_CRAWL_SECRET / ADMIN_REVIEW_PASSWORD not set. Admin API will reject all requests.');
            console.warn('Example: ADMIN_REVIEW_PASSWORD=your-secret ADMIN_ROUTES_ENABLED=1 npm run dev:admin');
        }
        console.log(`Review admin listening on http://127.0.0.1:${PORT}/admin.html`);
        console.log(`Build: ${ADMIN_BUILD_ID}`);
        console.log(`Project root: ${ROOT}`);
        console.log(`Writes to: ${dataPaths.prodTags}`);
        console.log(`Pending queue: ${dataPaths.queue}`);
        console.log(`Admin gate: header ${PRIMARY_ADMIN_HEADER} or Authorization: Bearer`);
        if (envFiles.length > 0) {
            console.log(`Loaded env: ${envFiles.join(', ')}`);
        }
        if (refreshLocalEnv()) {
            console.log('DEEPSEEK_API_KEY: configured (AI filter active)');
        } else {
            console.warn('DEEPSEEK_API_KEY: NOT SET — create .env.local from .env.example, then npm run restart:admin');
        }
    });
    return server;
}

if (require.main === module) {
    startAdminServer();
}

module.exports = {
    buildDutyRateStatusPayload,
    buildConsumerRegulatoryStatusPayload,
    buildExactTariffFeedStatus,
    buildQualityStatusPayload,
    buildUnmetSearchBacklogPayload,
    createAdminServer,
    startAdminServer
};
