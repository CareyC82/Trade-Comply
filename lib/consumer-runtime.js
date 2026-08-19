'use strict';

const fs = require('fs');
const path = require('path');

function positiveInteger(value, fallback, name) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
    return parsed;
}

function validateConsumerEnvironment(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const dataDir = path.resolve(env.CONSUMER_DATA_DIR || '.runtime/consumer');
    const errors = [];
    if (production && String(env.CONSUMER_SESSION_SECRET || '').length < 32) errors.push('CONSUMER_SESSION_SECRET must contain at least 32 characters.');
    if (production && String(env.CONSUMER_FILE_ENCRYPTION_KEY || '').length < 32) errors.push('CONSUMER_FILE_ENCRYPTION_KEY must contain at least 32 characters.');
    if (production && !path.isAbsolute(env.CONSUMER_DATA_DIR || '')) errors.push('CONSUMER_DATA_DIR must be an absolute persistent path in production.');
    const config = {
        production,
        host: String(env.CONSUMER_HOST || (production ? '0.0.0.0' : '127.0.0.1')),
        port: positiveInteger(env.CONSUMER_PORT, 8790, 'CONSUMER_PORT'),
        dataDir,
        diskWarningPercent: positiveInteger(env.CONSUMER_DISK_WARNING_PERCENT, 85, 'CONSUMER_DISK_WARNING_PERCENT'),
        shutdownTimeoutMs: positiveInteger(env.CONSUMER_SHUTDOWN_TIMEOUT_MS, 10000, 'CONSUMER_SHUTDOWN_TIMEOUT_MS')
    };
    if (config.port > 65535) errors.push('CONSUMER_PORT must be at most 65535.');
    if (config.diskWarningPercent >= 100) errors.push('CONSUMER_DISK_WARNING_PERCENT must be below 100.');
    if (errors.length) throw new Error(`Invalid consumer environment:\n- ${errors.join('\n- ')}`);
    return config;
}

function diskStatus(directory, warningPercent = 85) {
    try {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const stats = fs.statfsSync(directory);
        const totalBytes = Number(stats.blocks) * Number(stats.bsize);
        const freeBytes = Number(stats.bavail) * Number(stats.bsize);
        const usedPercent = totalBytes ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10 : 0;
        return { ok: usedPercent < warningPercent, totalBytes, freeBytes, usedPercent, warningPercent };
    } catch (error) {
        return { ok: false, error: error.message, warningPercent };
    }
}

function createLogger(stream = process.stdout) {
    return function log(level, event, fields = {}) {
        const safe = {};
        for (const [key, value] of Object.entries(fields)) {
            if (/password|secret|token|cookie|authorization|email|body/i.test(key)) continue;
            safe[key] = typeof value === 'string' ? value.slice(0, 300) : value;
        }
        stream.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe })}\n`);
    };
}

module.exports = { createLogger, diskStatus, validateConsumerEnvironment };
