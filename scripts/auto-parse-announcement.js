#!/usr/bin/env node
/**
 * Auto-parse policy announcements and propose/merge tag entries into data/tags.json.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/auto-parse-announcement.js
 *   DEEPSEEK_API_KEY=sk-... node scripts/auto-parse-announcement.js --apply
 *   node scripts/auto-parse-announcement.js --input scripts/fixtures/mock_news.txt --dry-run
 *   node scripts/auto-parse-announcement.js --offline --dry-run
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(__dirname, 'fixtures', 'mock_news.txt');
const TAGS_PATH = path.join(ROOT, 'data', 'tags.json');
const { autoPublishBatch } = require(path.join(ROOT, 'lib', 'auto-publish'));
const SCHEMA_PATH = path.join(ROOT, 'data', 'catalog.schema.json');
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const TIMEOUT_MS = 90000;

require(path.join(ROOT, 'js', 'catalog.js'));
const { validateCatalogData } = globalThis.Catalog;

const ALLOWED_CATEGORIES = new Set([
    'COMPULSORY_CERT',
    'EXPORT_CTRL',
    'OTHER',
    'TAX_INCENTIVE'
]);

const CATEGORY_LABELS = {
    COMPULSORY_CERT: 'Mandatory Certification',
    EXPORT_CTRL: 'Export Control',
    OTHER: 'Other Requirements',
    TAX_INCENTIVE: 'Tax Incentive'
};

const TAG_OBJECT_SCHEMA = {
    tag_id: 'CL-CHIP-004',
    category: 'EXPORT_CTRL',
    category_label: 'Export Control',
    tag_type: 'MATCHED',
    short_name: '[Chip Export Control]',
    short_description: 'One-line summary for search cards',
    description: 'Full regulatory summary grounded in the announcement text.',
    source_citation: 'MOFCOM Announcement 2026 No.18',
    source_url: 'https://www.mofcom.gov.cn/',
    effective_date: '2026-06-01',
    status: 'ACTIVE',
    direction: 'export',
    related_hs_codes: ['8541.40', '8542.31'],
    related_keywords: ['ai chip', 'gpu', 'hbm', 'inference accelerator'],
    exemptions: 'Optional plain-text exemptions.',
    risk_scenarios: 'Optional risk scenarios for exporters.',
    display_order: 99,
    related_cases: []
};

function printHelp() {
    console.log(`Usage: node scripts/auto-parse-announcement.js [options]

Options:
  --input <path>   Announcement text file (default: scripts/fixtures/mock_news.txt)
  --apply          Auto-publish accepted tags to production (guardrail intercepts failures)
  --dry-run        Preview only; do not write (default when --apply is omitted)
  --offline        Use scripts/fixtures/<input>.response.json instead of DeepSeek
  --help           Show this help

Environment:
  DEEPSEEK_API_KEY   Required unless --offline is used
`);
}

function parseArgs(argv) {
    const options = {
        input: DEFAULT_INPUT,
        apply: false,
        dryRun: true,
        offline: false,
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--offline':
                options.offline = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--input':
                options.input = path.resolve(argv[index + 1]);
                index += 1;
                break;
            case '--apply':
                options.apply = true;
                options.dryRun = false;
                break;
            case '--dry-run':
                options.dryRun = true;
                options.apply = false;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function readText(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Input file not found: ${filePath}`);
    }
    const text = fs.readFileSync(filePath, 'utf8').trim();
    if (!text) {
        throw new Error(`Input file is empty: ${filePath}`);
    }
    return text;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildExistingTagContext(tags) {
    return tags.map(tag => ({
        tag_id: tag.tag_id,
        short_description: tag.short_description,
        direction: tag.direction,
        related_hs_codes: tag.related_hs_codes || []
    }));
}

function buildSystemPrompt(catalogSchema, existingTags) {
    return [
        'You are a trade compliance data engineer for Trade Comply.',
        'Analyze Chinese or English customs/MOFCOM/GAC policy announcements.',
        'Only extract changes relevant to semiconductor or electronics import/export compliance.',
        'If the text is unrelated, set has_relevant_changes to false and proposed_tags to [].',
        'When relevant, output one or more NEW tag objects to append to the rule library.',
        'Do NOT duplicate existing tag_id values listed in existing_tags.',
        'Prefer updating semantics via a new tag_id with the next sequence number in the same family (e.g. CL-CHIP-004).',
        'Use tag_id pattern from catalog schema.',
        'Return JSON only. No markdown fences.',
        '',
        `catalog.schema.json: ${JSON.stringify(catalogSchema)}`,
        '',
        `tag object template: ${JSON.stringify(TAG_OBJECT_SCHEMA, null, 2)}`,
        '',
        `Allowed category values: ${Array.from(ALLOWED_CATEGORIES).join(', ')}`,
        'Allowed direction values: export, import, both',
        'Allowed tag_type values: MATCHED, CHECK_REQUIRED',
        'related_cases must be [] for newly proposed tags.',
        'related_keywords must contain at least 3 lowercase search terms.',
        'All text fields must be English except proper nouns and official Chinese agency names in source_citation.',
        '',
        `existing_tags (${existingTags.length}): ${JSON.stringify(buildExistingTagContext(existingTags))}`
    ].join('\n');
}

function buildUserPrompt(announcementText, sourceName) {
    return [
        `Source file: ${sourceName}`,
        'Analyze the announcement below and return JSON with this exact shape:',
        JSON.stringify({
            has_relevant_changes: true,
            analysis_summary: 'Short English summary of what changed.',
            proposed_tags: [TAG_OBJECT_SCHEMA]
        }, null, 2),
        '',
        '--- ANNOUNCEMENT TEXT ---',
        announcementText
    ].join('\n');
}

function extractJsonObject(text) {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(trimmed.slice(start, end + 1));
        }
        throw new Error(`Model response was not valid JSON: ${error.message}`);
    }
}

function loadOfflineFixture(inputPath) {
    const basename = path.basename(inputPath, path.extname(inputPath));
    const fixturePath = path.join(path.dirname(inputPath), `${basename}.response.json`);
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Offline fixture not found: ${fixturePath}`);
    }
    return readJson(fixturePath);
}

async function callDeepSeek({ systemPrompt, userPrompt }) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is not set.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API error (${response.status}): ${errorText.slice(0, 300)}`);
        }

        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('DeepSeek API returned an empty response.');
        }

        return extractJsonObject(content);
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeString(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!maxLength || trimmed.length <= maxLength) {
        return trimmed;
    }
    return `${trimmed.slice(0, maxLength - 3)}...`;
}

function normalizeStringArray(values, { lowercase = false, minItems = 0 } = {}) {
    if (!Array.isArray(values)) {
        return minItems > 0 ? null : [];
    }

    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (typeof value !== 'string') {
            continue;
        }
        const trimmed = lowercase ? value.trim().toLowerCase() : value.trim();
        if (!trimmed || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        result.push(trimmed);
    }

    if (result.length < minItems) {
        return null;
    }

    return result;
}

function compileTagIdPattern(schema) {
    try {
        return new RegExp(schema.tag_id_pattern || '^CL-[A-Z]+-\\d+$');
    } catch (error) {
        return /^CL-[A-Z]+-\d+$/;
    }
}

function getNextTagId(prefix, existingIds, pattern) {
    const normalizedPrefix = prefix.toUpperCase();
    const familyPattern = new RegExp(`^${normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
    let maxNumber = 0;

    for (const tagId of existingIds) {
        const match = tagId.match(familyPattern);
        if (match) {
            maxNumber = Math.max(maxNumber, Number(match[1]));
        }
    }

    const nextNumber = String(maxNumber + 1).padStart(3, '0');
    const candidate = `${normalizedPrefix}-${nextNumber}`;
    if (!pattern.test(candidate)) {
        throw new Error(`Generated tag_id does not match schema pattern: ${candidate}`);
    }
    return candidate;
}

function inferTagPrefix(tag) {
    const category = tag.category || 'OTHER';
    if (category === 'EXPORT_CTRL') {
        if ((tag.related_keywords || []).some(keyword => /chip|semiconductor|gpu|hbm|wafer|foundry|eda/i.test(keyword))) {
            return 'CL-CHIP';
        }
        return 'CL-DU';
    }
    if (category === 'COMPULSORY_CERT') {
        return 'CL-CCC';
    }
    return 'CL-CTRL';
}

function sanitizeProposedTag(rawTag, existingIds, tagIdPattern) {
    if (!rawTag || typeof rawTag !== 'object') {
        return { ok: false, error: 'Tag is not an object.' };
    }

    const category = ALLOWED_CATEGORIES.has(rawTag.category) ? rawTag.category : 'EXPORT_CTRL';
    const direction = ['export', 'import', 'both'].includes(rawTag.direction) ? rawTag.direction : 'export';
    const tagType = ['MATCHED', 'CHECK_REQUIRED'].includes(rawTag.tag_type) ? rawTag.tag_type : 'MATCHED';
    const relatedKeywords = normalizeStringArray(rawTag.related_keywords, { lowercase: true, minItems: 3 });
    const relatedHsCodes = normalizeStringArray(rawTag.related_hs_codes, { minItems: 0 });
    const relatedCases = normalizeStringArray(rawTag.related_cases, { minItems: 0 });

    if (!relatedKeywords) {
        return { ok: false, error: 'related_keywords must contain at least 3 unique terms.' };
    }

    let tagId = normalizeString(rawTag.tag_id, 40).toUpperCase();
    if (!tagId || !tagIdPattern.test(tagId) || existingIds.has(tagId)) {
        const prefix = tagId && tagId.startsWith('CL-')
            ? tagId.replace(/-\d+$/, '')
            : inferTagPrefix({ category, related_keywords: relatedKeywords });
        tagId = getNextTagId(prefix, existingIds, tagIdPattern);
    }

    const shortDescription = normalizeString(rawTag.short_description, 240);
    const description = normalizeString(rawTag.description, 4000);
    const sourceCitation = normalizeString(rawTag.source_citation, 500);
    const sourceUrl = normalizeString(rawTag.source_url, 500);

    if (!shortDescription || !description || !sourceCitation) {
        return { ok: false, error: 'short_description, description, and source_citation are required.' };
    }

    const sanitized = {
        tag_id: tagId,
        category,
        category_label: CATEGORY_LABELS[category] || normalizeString(rawTag.category_label, 80) || category,
        tag_type: tagType,
        short_name: normalizeString(rawTag.short_name, 80) || `[${category.replace(/_/g, ' ')}]`,
        short_description: shortDescription,
        description,
        source_citation: sourceCitation,
        source_url: sourceUrl || 'https://www.mofcom.gov.cn/',
        effective_date: normalizeString(rawTag.effective_date, 20) || new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
        direction,
        related_hs_codes: relatedHsCodes,
        related_keywords: relatedKeywords,
        related_cases: relatedCases
    };

    const exemptions = normalizeString(rawTag.exemptions, 2000);
    const riskScenarios = normalizeString(rawTag.risk_scenarios, 3000);
    const displayOrder = Number.isFinite(rawTag.display_order) ? Math.floor(rawTag.display_order) : 99;

    if (exemptions) {
        sanitized.exemptions = exemptions;
    }
    if (riskScenarios) {
        sanitized.risk_scenarios = riskScenarios;
    }
    sanitized.display_order = displayOrder;

    return { ok: true, tag: sanitized };
}

function validateMergedCatalog(tags) {
    const sources = {
        tags,
        cases: readJson(path.join(ROOT, 'data', 'cases.json')),
        categories: readJson(path.join(ROOT, 'data', 'categories.json')),
        scopeConfig: readJson(path.join(ROOT, 'data', 'scope-keywords.json')),
        catalogSchema: readJson(SCHEMA_PATH)
    };

    const result = validateCatalogData(sources);
    result.warnings.forEach(message => console.warn(`WARN: ${message}`));
    if (!result.ok) {
        result.errors.forEach(message => console.error(`ERROR: ${message}`));
        throw new Error('Merged catalog failed validation.');
    }

    return result;
}

function mergeTags(existingTags, proposedTags) {
    const existingIds = new Set(existingTags.map(tag => tag.tag_id));
    const accepted = [];
    const skipped = [];

    for (const rawTag of proposedTags) {
        const catalogSchema = readJson(SCHEMA_PATH);
        const tagIdPattern = compileTagIdPattern(catalogSchema);
        const sanitized = sanitizeProposedTag(rawTag, existingIds, tagIdPattern);
        if (!sanitized.ok) {
            skipped.push({ rawTag, reason: sanitized.error });
            continue;
        }

        if (existingIds.has(sanitized.tag.tag_id)) {
            skipped.push({ rawTag, reason: `Duplicate tag_id ${sanitized.tag.tag_id}` });
            continue;
        }

        existingIds.add(sanitized.tag.tag_id);
        accepted.push(sanitized.tag);
    }

    return {
        mergedTags: [...existingTags, ...accepted],
        accepted,
        skipped
    };
}

function runNodeScript(relativePath, args = []) {
    const scriptPath = path.join(ROOT, relativePath);
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env
    });

    if (result.status !== 0) {
        throw new Error(`${relativePath} exited with code ${result.status}`);
    }
}

function autoPublishTags(acceptedTags, meta) {
    return autoPublishBatch({
        tags: acceptedTags,
        meta,
        source: 'policy-tracker'
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const announcementText = readText(options.input);
    const existingTags = readJson(TAGS_PATH);
    const catalogSchema = readJson(SCHEMA_PATH);

    console.log(`Analyzing announcement: ${path.relative(ROOT, options.input)}`);
    const modelResult = options.offline
        ? loadOfflineFixture(options.input)
        : await callDeepSeek({
            systemPrompt: buildSystemPrompt(catalogSchema, existingTags),
            userPrompt: buildUserPrompt(announcementText, path.basename(options.input))
        });

    if (options.offline) {
        console.log('Using offline fixture response (--offline).');
    }

    console.log('\nModel summary:');
    console.log(modelResult.analysis_summary || '(no summary)');

    if (!modelResult.has_relevant_changes) {
        console.log('\nNo semiconductor/electronics control changes detected. Nothing to merge.');
        return;
    }

    const proposedTags = Array.isArray(modelResult.proposed_tags) ? modelResult.proposed_tags : [];
    if (proposedTags.length === 0) {
        console.log('\nModel flagged relevant changes but returned no proposed_tags.');
        return;
    }

    const { mergedTags, accepted, skipped } = mergeTags(existingTags, proposedTags);

    console.log(`\nProposed tags accepted: ${accepted.length}`);
    accepted.forEach(tag => {
        console.log(`  + ${tag.tag_id} — ${tag.short_description}`);
    });

    if (skipped.length > 0) {
        console.log(`\nSkipped tags: ${skipped.length}`);
        skipped.forEach(item => {
            console.log(`  - ${item.reason}`);
        });
    }

    if (accepted.length === 0) {
        throw new Error('No valid tags to merge after sanitization.');
    }

    validateMergedCatalog(mergedTags);
    console.log('\nPre-write catalog validation passed.');

    if (options.dryRun) {
        console.log('\nDry run only. Re-run with --apply to auto-publish tags to production.');
        console.log(JSON.stringify(accepted, null, 2));
        return;
    }

    const announcementSource = path.basename(options.input);
    const publishResult = autoPublishTags(accepted, {
        announcement_file: announcementSource,
        analysis_summary: modelResult.analysis_summary || ''
    });

    console.log(`\nAuto-published ${publishResult.counts.published_tags} tag(s) to production.`);
    publishResult.published.tags.forEach((tagId) => {
        console.log(`  + ${tagId}`);
    });
    if (publishResult.counts.intercepted > 0) {
        console.log(`\nGuardrail intercepted ${publishResult.counts.intercepted} tag(s) → data/pending_data.json`);
        publishResult.intercepted.forEach((row) => {
            const id = row.raw?.tag_id || 'unknown';
            console.log(`  ! ${id}: ${row.reasons.join('; ')}`);
        });
    }

    if (publishResult.counts.published_tags === 0 && publishResult.counts.intercepted === 0) {
        throw new Error('No tags were published (all duplicates or empty batch).');
    }

    if (publishResult.catalog_warning) {
        console.warn(`\nWARN: catalog rebuild: ${publishResult.catalog_warning}`);
    }

    console.log('\nRunning catalog validation...');
    runNodeScript('scripts/validate-catalog.js');

    console.log('\nAnnouncement parsing pipeline completed successfully.');
}

main().catch(error => {
    console.error(`\nERROR: ${error.message}`);
    process.exit(1);
});
