/**
 * Load DEEPSEEK_API_KEY and other secrets from .env.local / .env (not committed).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadLocalEnvFiles(rootDir) {
    const root = rootDir || path.join(__dirname, '..');
    const loaded = [];

    for (const name of ['.env.local', '.env']) {
        const filePath = path.join(root, name);
        if (!fs.existsSync(filePath)) {
            continue;
        }

        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith('\'') && value.endsWith('\''))
            ) {
                value = value.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
        loaded.push(name);
    }

    return loaded;
}

module.exports = { loadLocalEnvFiles };
