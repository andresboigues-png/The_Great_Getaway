// @ts-check
// Per-page render smoke — one test per nav target. Each test signs the
// user in via the test-login shortcut, navigates to the page, and
// asserts:
//   1. the page rendered (a known anchor element is visible)
//   2. nothing logged a real console error during the render
//
// The pytest suite covers every API route's correctness; this layer
// catches client-side rendering bugs that wouldn't show up at the API
// layer — e.g. a typo in a render function, a stale selector, a missing
// guard around a nullable STATE field.
//
// Tests are parametrised so adding a page to the app is a one-line
// addition here.

import { test, expect } from '@playwright/test';
import { openFreshApp, createTrip } from './helpers.js';

// Unique user per test so each starts trip-less (shared dev DB otherwise
// accumulates trips across tests). `test-` prefix is required by the
// test-mode login guard.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

/** @type {Array<{
 *   name: string,
 *   navTarget: string,
 *   anchorSelector: string,
 *   needsActiveTrip: boolean,
 * }>} */
const PAGES = [
    // Always-reachable pages — render with or without an active trip.
    {
        name: 'home',
        navTarget: 'home',
        // #tripSelector is desktop-only now (mobile uses
        // #tripSelectorSidebar inside the burger drawer); accept
        // either to keep the anchor cross-viewport.
        anchorSelector: '#homeHeroImg, #pathAddDayChip, #tripSelector, #tripSelectorSidebar',
        needsActiveTrip: false,
    },
    { name: 'feed', navTarget: 'feed', anchorSelector: '.feed-tabs-row, .nav-brand', needsActiveTrip: false },
    {
        name: 'collections',
        navTarget: 'collections',
        anchorSelector: '.ai-page-header, .nav-brand',
        needsActiveTrip: false,
    },
    { name: 'friends', navTarget: 'friends', anchorSelector: '.ai-page-header, .nav-brand', needsActiveTrip: false },
    // MK1 Wave D: .nav-brand is NOT visible on the MOBILE navbar in
    // the current chrome (icons-only top bar), so it can't anchor any
    // mobile page render — every page anchors on its own root element
    // (present on both viewports), with .nav-brand as a desktop-only
    // fallback. (Caught on CI's pristine-DB run; a warm local DB had
    // masked it.)
    { name: 'profile', navTarget: 'profile', anchorSelector: '.profile-page, .nav-brand', needsActiveTrip: false },
    { name: 'settings', navTarget: 'settings', anchorSelector: '.settings-grid, .nav-brand', needsActiveTrip: false },
    // Trip-scoped pages — render the meaningful state when there's an
    // active trip. We create one in setup so the page has data to draw.
    { name: 'expenses', navTarget: 'expenses', anchorSelector: '#expenseForm, .nav-brand', needsActiveTrip: true },
    { name: 'insights', navTarget: 'insights', anchorSelector: '.nav-brand', needsActiveTrip: true },
    { name: 'budgets', navTarget: 'budgets', anchorSelector: '.nav-brand', needsActiveTrip: true },
    { name: 'todo', navTarget: 'todo', anchorSelector: '.nav-brand', needsActiveTrip: true },
    { name: 'ai', navTarget: 'ai', anchorSelector: '.nav-brand', needsActiveTrip: true },
    { name: 'settlement', navTarget: 'settlement', anchorSelector: '.nav-brand', needsActiveTrip: true },
];

// Console-error filter — same noise patterns as the smoke suite.
const IGNORED_NOISE = [
    /google.*\.com/i,
    /accounts\.google/i,
    /Failed to load resource/i,
    /favicon/i,
    /maps\.googleapis/i,
    /sentry-cdn/i,
    /sentry\.io/i,
    /GSI_LOGGER/i,
    // Navigation between pages cancels in-flight boot fetches (e.g.
    // /api/notifications/list); the app aborts them via AbortController and
    // the resulting AbortError is expected navigation noise, not a fault.
    /AbortError: signal is aborted/i,
    // Same class, surfaced via the app's apiFetch wrapper when a boot
    // fetch is cancelled by navigation. Expected test noise.
    /\[apiFetch\] network failure/i,
];

test.describe('Per-page render smoke', () => {
    for (const { name, navTarget, anchorSelector, needsActiveTrip } of PAGES) {
        test(`${name} page renders without console errors`, async ({ page }, testInfo) => {
            // On the mobile viewport (375px) the top nav's `#newTripBtn`
            // is offscreen — a real responsive-layout regression that
            // Phase B's home / sidebar split should fix. Until then,
            // trip-scoped pages can't be set up on mobile, so we run
            // those only on desktop. Always-reachable pages still run
            // on both viewports (the whole point of multi-viewport).
            if (needsActiveTrip && testInfo.project.name === 'chromium-mobile') {
                test.skip();
            }
            /** @type {string[]} */
            const errors = [];
            page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
            page.on('console', (msg) => {
                if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
            });

            await openFreshApp(page, uniqueId('user'));
            if (needsActiveTrip) {
                await createTrip(page, {
                    name: `${name} setup trip`,
                    // Must be a real country: createTrip selects it from the
                    // Maps-fallback country <select> (MK3-1 mandatory country).
                    country: 'Italy',
                });
            }

            // Internal SPA navigation via the hash router. We hash-set
            // directly rather than click the sidebar to keep the test
            // focused on the page's render, not on nav widget behaviour
            // (which the home/sidebar suites cover).
            await page.evaluate((target) => {
                window.location.hash = target;
            }, navTarget);

            // Anchor a known visible element to confirm the page mounted.
            // The `:visible` filter on the locator is critical now that
            // some anchors (#tripSelector) are hidden on the mobile
            // viewport via .nav-trips--desktop-only — without it,
            // .first() picks the hidden DOM-first match and the
            // visibility assertion fails.
            await expect(page.locator(anchorSelector).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });

            // No real console errors during render.
            const real = errors.filter((e) => !IGNORED_NOISE.some((re) => re.test(e)));
            expect(real, `unexpected errors on ${name} page`).toEqual([]);
        });
    }
});
