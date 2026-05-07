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

    // Two projects: desktop + mobile-sized viewports. Roadmap A3 calls for
    // critical-path tests to run on both so a CSS regression that only
    // breaks one form factor surfaces in CI. Both run sequentially against
    // the same Flask server because the dev server is single-threaded.
    projects: [
        {
            name: 'chromium-desktop',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 800 },
            },
        },
        {
            name: 'chromium-mobile',
            // iPhone 13 Pro viewport — small enough to surface
            // mobile-layout regressions, large enough to clear most
            // hit-target sizes the desktop CSS assumes.
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 375, height: 812 },
                isMobile: true,
                hasTouch: true,
            },
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
        // GG_ALLOW_TEST_LOGIN unlocks the /api/auth/google
        // `test:<user_id>` shortcut that helpers.js's loginAsTestUser
        // hits. Off by default — production deploys would never set
        // this; the dev server on a developer's box also doesn't
        // unless they're explicitly running e2e tests.
        env: {
            ...process.env,
            GG_ALLOW_TEST_LOGIN: '1',
        },
    },
});
