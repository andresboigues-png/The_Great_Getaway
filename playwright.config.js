// @ts-check
import { defineConfig, devices } from '@playwright/test';

const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // Flask dev server is single-threaded; serialize.
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [['list']],
    timeout: 15000,

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'off',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Boots the Flask app before tests, kills it after.
    webServer: {
        command: 'cd src && python3 main.py',
        url: BASE_URL,
        timeout: 30000,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
