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
        // hits. GG_E2E disables rate limits so 30+ parallel tests
        // don't trip per-IP throttles. FLASK_ENV=development selects the
        // dev behaviours the harness needs — the ephemeral JWT-secret
        // fallback (no GG_JWT_SECRET in CI) and the localhost-http cookie
        // (Secure omitted so Chrome saves it) — plus skipping the
        // CLIENT_ID_GOOGLE_AUTH boot guard.
        //
        // MK6: these are deliberately SEPARATE flags. Pre-fix,
        // GG_ALLOW_TEST_LOGIN alone implied all of the above, so one
        // stray test-login env var in prod would silently weaken the JWT
        // secret + drop the cookie Secure flag. Now GG_ALLOW_TEST_LOGIN
        // does nothing but gate the test-login route; the dev relaxations
        // ride on FLASK_ENV, and rate-limit disabling on GG_E2E. All
        // three are off by default — production sets none of them.
        env: {
            ...process.env,
            GG_ALLOW_TEST_LOGIN: '1',
            GG_E2E: '1',
            FLASK_ENV: 'development',
        },
    },
});
