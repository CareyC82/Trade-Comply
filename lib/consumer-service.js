'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RETENTION_DAYS = Number(process.env.CONSUMER_FILE_RETENTION_DAYS || 30);
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, file);
}

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const value = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `${salt}:${value}`;
}

function verifyPassword(password, stored) {
    const [salt, expected] = String(stored || '').split(':');
    if (!salt || !expected) return false;
    const actual = hashPassword(password, salt).split(':')[1];
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function deriveKey(secret) {
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function detectType(buffer) {
    if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return '';
}

function scanBuffer(buffer, type) {
    if (!type) return { ok: false, reason: 'File signature is not supported.' };
    if (type === 'application/pdf') {
        const sample = buffer.toString('latin1');
        if (/\/(JavaScript|JS|Launch|OpenAction|EmbeddedFile)\b/i.test(sample)) {
            return { ok: false, reason: 'Active or embedded PDF content is not accepted.' };
        }
    }
    return { ok: true };
}

function encrypt(buffer, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function decrypt(buffer, key) {
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
}

function safeText(value, max = 4000) {
    return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function extractFields(text, expectedModel = '') {
    const compact = safeText(text, 50000);
    const take = (re) => compact.match(re)?.[1]?.trim() || '';
    const model = take(/(?:model(?:\s*(?:no|number))?|type)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/i);
    const manufacturer = take(/(?:manufacturer|applicant|factory)\s*[:#]?\s*([^\r\n]{3,100})/i);
    const reportNumber = take(/(?:report\s*(?:no|number)|certificate\s*(?:no|number))\s*[:#]?\s*([A-Z0-9._/-]{3,60})/i);
    const reportDate = take(/(?:report\s*date|date\s*of\s*issue|issue\s*date)\s*[:#]?\s*([0-9A-Za-z,./ -]{6,30})/i);
    const standards = [...new Set(compact.match(/(?:EN|IEC|ISO|FCC|ETSI|UL|ASTM)\s*[A-Z0-9-]*(?:\s*\d{2,6}(?:[-:]\d+)*)?/gi) || [])].slice(0, 12);
    const fccId = take(/FCC\s*ID\s*[:#]?\s*([A-Z0-9-]{5,30})/i);
    const batteryModel = take(/(?:battery|cell)\s*model(?:\s*(?:no|number))?\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/i);
    const documentKind = /UN\s*38\.3|test\s*summary/i.test(compact) ? 'UN38.3'
        : /FCC\s*ID|47\s*CFR|equipment\s*authorization/i.test(compact) ? 'FCC'
            : /radio\s*equipment\s*directive|2014\/53\/EU|ETSI/i.test(compact) ? 'CE / RED'
                : /RoHS|2011\/65\/EU|restricted\s*substances/i.test(compact) ? 'RoHS'
                    : /PSE|DENAN/i.test(compact) ? 'PSE'
                        : /IMDA|telecommunication\s*equipment\s*registration/i.test(compact) ? 'IMDA'
                            : /SAFETY\s*Mark|CPSR/i.test(compact) ? 'SAFETY Mark'
                                : 'Unclassified evidence';
    const normalized = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const missingFields = [
        !model && 'model',
        !manufacturer && 'manufacturer',
        !reportNumber && 'report/certificate number',
        !reportDate && 'report/issue date',
        !standards.length && 'test standard'
    ].filter(Boolean);
    return {
        model, manufacturer, reportNumber, reportDate, standards, fccId, batteryModel, documentKind, missingFields,
        expectedModel: safeText(expectedModel, 80),
        modelMatch: expectedModel && model ? normalized(expectedModel) === normalized(model) : null,
        excerpt: compact.slice(0, 1200)
    };
}

function outputText(payload) {
    if (typeof payload?.output_text === 'string') return payload.output_text.trim();
    return (payload?.output || []).flatMap((item) => item.content || [])
        .filter((item) => item.type === 'output_text' || typeof item.text === 'string')
        .map((item) => item.text || '').join('\n').trim();
}

class ConsumerService {
    constructor(options = {}) {
        this.root = options.root || process.env.CONSUMER_DATA_DIR || path.join(os.tmpdir(), 'tracewize-consumer');
        this.databaseFile = path.join(this.root, 'database.json');
        this.fileRoot = path.join(this.root, 'private-files');
        this.sessionSecret = options.sessionSecret || process.env.CONSUMER_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
        this.explicitSessionSecret = Boolean(options.sessionSecret || process.env.CONSUMER_SESSION_SECRET);
        this.fileKey = deriveKey(options.fileKey || process.env.CONSUMER_FILE_ENCRYPTION_KEY || this.sessionSecret);
        this.explicitFileKey = Boolean(options.fileKey || process.env.CONSUMER_FILE_ENCRYPTION_KEY);
        this.fetch = options.fetch || globalThis.fetch;
        fs.mkdirSync(this.fileRoot, { recursive: true, mode: 0o700 });
        if (!fs.existsSync(this.databaseFile)) atomicJson(this.databaseFile, { users: [], assessments: [], files: [] });
        this.cleanupExpiredFiles();
    }

    read() { return readJson(this.databaseFile, { users: [], assessments: [], files: [] }); }
    write(db) { atomicJson(this.databaseFile, db); }

    register(emailValue, password) {
        const email = normalizeEmail(emailValue);
        if (!email) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
        if (String(password || '').length < 10) throw Object.assign(new Error('Password must contain at least 10 characters.'), { status: 400 });
        const db = this.read();
        if (db.users.some((user) => user.email === email)) throw Object.assign(new Error('This email is already registered.'), { status: 409 });
        const user = { id: crypto.randomUUID(), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
        db.users.push(user); this.write(db);
        return { user: this.publicUser(user), token: this.createToken(user) };
    }

    login(emailValue, password) {
        const email = normalizeEmail(emailValue);
        const user = this.read().users.find((item) => item.email === email);
        if (!user || !verifyPassword(password, user.passwordHash)) throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
        return { user: this.publicUser(user), token: this.createToken(user) };
    }

    publicUser(user) { return { id: user.id, email: user.email, createdAt: user.createdAt }; }
    createToken(user) {
        const encoded = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 7 * 86400000 })).toString('base64url');
        const signature = crypto.createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
        return `${encoded}.${signature}`;
    }

    authenticate(token) {
        try {
            const [encoded, supplied] = String(token || '').split('.');
            const expected = crypto.createHmac('sha256', this.sessionSecret).update(encoded).digest();
            if (!supplied || !crypto.timingSafeEqual(Buffer.from(supplied, 'base64url'), expected)) return null;
            const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
            if (payload.exp < Date.now()) return null;
            const user = this.read().users.find((item) => item.id === payload.sub);
            return user ? this.publicUser(user) : null;
        } catch { return null; }
    }

    listAssessments(userId) {
        return this.read().assessments.filter((item) => item.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    saveAssessment(userId, payload) {
        const db = this.read();
        const record = {
            id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(),
            productLabel: safeText(payload.productLabel, 120), market: safeText(payload.market, 12),
            platform: safeText(payload.platform, 80), input: payload.input || {}, assessment: payload.assessment || {}
        };
        db.assessments.push(record); this.write(db);
        return record;
    }

    deleteAssessment(userId, id) {
        const db = this.read();
        const before = db.assessments.length;
        db.assessments = db.assessments.filter((item) => !(item.id === id && item.userId === userId));
        this.write(db); return before !== db.assessments.length;
    }

    saveFile(userId, payload) {
        const raw = String(payload.data || '').replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw Object.assign(new Error('Each file must be between 1 byte and 10 MB.'), { status: 413 });
        const detected = detectType(buffer);
        if (!ALLOWED_TYPES.has(detected) || (payload.type && payload.type !== detected)) throw Object.assign(new Error('File type does not match its content.'), { status: 415 });
        const scan = scanBuffer(buffer, detected);
        if (!scan.ok) throw Object.assign(new Error(scan.reason), { status: 422 });
        const id = crypto.randomUUID();
        const filePath = path.join(this.fileRoot, `${id}.bin`);
        fs.writeFileSync(filePath, encrypt(buffer, this.fileKey), { mode: 0o600 });
        const db = this.read();
        const record = {
            id, userId, name: path.basename(safeText(payload.name, 180)), type: detected, size: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'), status: 'stored_private',
            expectedModel: safeText(payload.expectedModel, 80), createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString()
        };
        db.files.push(record); this.write(db);
        return record;
    }

    listFiles(userId) { return this.read().files.filter((item) => item.userId === userId); }

    deleteFile(userId, id) {
        const db = this.read();
        const file = db.files.find((item) => item.id === id && item.userId === userId);
        if (!file) return false;
        try { fs.unlinkSync(path.join(this.fileRoot, `${id}.bin`)); } catch {}
        db.files = db.files.filter((item) => item !== file); this.write(db); return true;
    }

    async parseFile(userId, id) {
        const db = this.read();
        const file = db.files.find((item) => item.id === id && item.userId === userId);
        if (!file) throw Object.assign(new Error('File not found.'), { status: 404 });
        const encrypted = fs.readFileSync(path.join(this.fileRoot, `${id}.bin`));
        const plain = decrypt(encrypted, this.fileKey);
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracewize-parse-'));
        const extension = file.type === 'application/pdf' ? '.pdf' : file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
        const tempFile = path.join(tempDir, `document${extension}`);
        fs.writeFileSync(tempFile, plain, { mode: 0o600 });
        let text = '';
        let engine = '';
        try {
            if (file.type === 'application/pdf') {
                const output = await execFileAsync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', tempFile, '-'], { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
                text = output.stdout; engine = 'pdftotext';
            } else {
                const output = await execFileAsync(process.env.TESSERACT_BIN || 'tesseract', [tempFile, 'stdout', '-l', process.env.OCR_LANG || 'eng'], { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
                text = output.stdout; engine = 'tesseract';
            }
        } catch (error) {
            throw Object.assign(new Error(`Document parser is unavailable or failed: ${error.message}`), { status: 503 });
        } finally {
            try { fs.unlinkSync(tempFile); fs.rmdirSync(tempDir); } catch {}
        }
        file.parsing = { engine, parsedAt: new Date().toISOString(), ...extractFields(text, file.expectedModel) };
        file.status = file.parsing.modelMatch === false
            ? 'model_mismatch'
            : file.parsing.missingFields.length >= 4 ? 'parsed_incomplete' : 'parsed';
        this.write(db);
        return file;
    }

    async askAssistant(userId, payload) {
        const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
        if (!apiKey) throw Object.assign(new Error('AI Assistant is not configured on this server.'), { status: 503 });
        const question = safeText(payload.question, 1200);
        const assessment = payload.assessment || {};
        if (!question) throw Object.assign(new Error('Enter a question.'), { status: 400 });
        const response = await this.fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
                store: false,
                max_output_tokens: 800,
                instructions: 'You are TraceWize assessment assistant. Use only the structured assessment supplied. Never invent tariff rates, certifications, legal conclusions, or source citations. Clearly distinguish known facts, gaps, and recommended verification. This is a pre-check, not legal advice.',
                input: `USER QUESTION:\n${question}\n\nSTRUCTURED ASSESSMENT:\n${JSON.stringify(assessment).slice(0, 30000)}`
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw Object.assign(new Error(`AI provider returned ${response.status}.`), { status: 502 });
        const data = await response.json();
        return { answer: outputText(data) || 'No answer was generated.', model: data.model || process.env.OPENAI_MODEL || 'gpt-5.6-luna' };
    }

    deleteAccount(userId) {
        const db = this.read();
        db.files.filter((item) => item.userId === userId).forEach((item) => {
            try { fs.unlinkSync(path.join(this.fileRoot, `${item.id}.bin`)); } catch {}
        });
        db.users = db.users.filter((item) => item.id !== userId);
        db.assessments = db.assessments.filter((item) => item.userId !== userId);
        db.files = db.files.filter((item) => item.userId !== userId);
        this.write(db);
    }

    cleanupExpiredFiles() {
        const db = this.read();
        const expired = db.files.filter((item) => Date.parse(item.expiresAt) <= Date.now());
        expired.forEach((item) => { try { fs.unlinkSync(path.join(this.fileRoot, `${item.id}.bin`)); } catch {} });
        if (expired.length) {
            const ids = new Set(expired.map((item) => item.id));
            db.files = db.files.filter((item) => !ids.has(item.id));
            this.write(db);
        }
    }

    health() {
        return {
            ok: true,
            productionReady: this.explicitSessionSecret && this.explicitFileKey && Boolean(process.env.OPENAI_API_KEY),
            accounts: true, privateEncryptedFiles: true, retentionDays: RETENTION_DAYS,
            pdfParser: process.env.PDFTOTEXT_BIN || 'pdftotext', imageOcr: process.env.TESSERACT_BIN || 'tesseract',
            openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
            warnings: [
                !this.explicitSessionSecret && 'CONSUMER_SESSION_SECRET is using a temporary development value.',
                !this.explicitFileKey && 'CONSUMER_FILE_ENCRYPTION_KEY is derived from the development session secret.',
                !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY is not configured.'
            ].filter(Boolean)
        };
    }
}

module.exports = { ConsumerService, MAX_FILE_BYTES, detectType, extractFields, hashPassword, verifyPassword };
