'use strict';

const os = require('node:os');
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const port = 8791;

module.exports = defineConfig({
    testDir: './test/browser',
    testMatch: 'consumer-journeys.spec.js',
    timeout: 30000,
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
        { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } } }
    ],
    webServer: {
        command: 'node scripts/consumer-server.js',
        url: `http://127.0.0.1:${port}/api/consumer/health`,
        reuseExistingServer: false,
        timeout: 15000,
        env: {
            ...process.env,
            CONSUMER_PORT: String(port),
            CONSUMER_DATA_DIR: path.join(os.tmpdir(), `tracewize-consumer-browser-${process.pid}`),
            CONSUMER_SESSION_SECRET: 'browser-test-session-secret-at-least-32-bytes',
            CONSUMER_FILE_ENCRYPTION_KEY: 'browser-test-file-key-at-least-32-bytes'
        }
    }
});
