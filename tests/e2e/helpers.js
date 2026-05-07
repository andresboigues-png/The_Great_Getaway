// @ts-check
// Shared helpers for the smoke suite. Each test starts from a known empty
// state by clearing localStorage and signing in via the test-mode auth
// shortcut, so the post-Phase-G login wall doesn't gate the sidebar.

import { expect } from '@playwright/test';

/**
 * Sign the page in as a deterministic test user. Hits /api/auth/google
 * with the `test:<user_id>` token shortcut (gated by GG_ALLOW_TEST_LOGIN
 * which playwright.config.js sets when booting the dev server). On
 * success we seed the JWT + a default-shaped STATE object into
 * localStorage so the app boots straight into the authenticated home.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [userId]
 */
export async function loginAsTestUser(page, userId = 'test-user-1') {
    const res = await page.request.post('/api/auth/google', {
        data: { token: `test:${userId}`, name: 'Test User' },
    });
    if (!res.ok()) {
        throw new Error(`test login failed: ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();

    // Mirror the post-login STATE that profile.ts's handleGoogleLogin
    // would set up. Keeping this in lock-step with state.ts's
    // initialiser is what lets schemas.ts's validateLoadedState ACCEPT
    // the snapshot — a partial / mis-shaped object would be rejected
    // and the app would boot back into anonymous mode.
    await page.evaluate((auth) => {
        localStorage.clear();
        localStorage.setItem('gg_auth_token', auth.token);
        const state = {
            trips: [],
            activeTripId: null,
            categories: [
                { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
                { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
                { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' },
            ],
            expenses: [],
            draftExpense: {
                who: '',
                categoryId: '',
                label: '',
                date: '',
                country: '',
                value: '',
                currency: 'EUR',
                euroValue: '',
            },
            insightCurrency: 'EUR',
            rateMode: 'at_trip',
            rateCache: {},
            user: auth.user,
            hasLoggedInBefore: true,
            geminiApiKey: '',
            excelMapping: {
                who: 'Who',
                categoryId: 'Category',
                label: 'Label',
                date: 'Date',
                country: 'Country',
                value: 'Value',
                currency: 'Currency',
                euroValue: 'Euro Value',
            },
            activities: [],
            photos: [],
            budgets: [],
            savedFormats: [],
            tripDays: [],
            archivedTrips: [],
            activeDetailId: null,
            notifications: [],
            preferences: {
                mapDefaultPois: ['sights', 'parks', 'transit'],
                poiFilters: {},
                pillEpicenters: {},
                poiAnchoring: {},
                poiVisible: {},
                enabledPois: {},
            },
        };
        localStorage.setItem('theGreatEscapeState', JSON.stringify(state));
    }, body);
}

/**
 * Open the app at a clean state, signed in as the test user. Two
 * navigations: the first lets us touch localStorage on the right
 * origin, the second is the actual app boot under the seeded session.
 * @param {import('@playwright/test').Page} page
 */
export async function openFreshApp(page) {
    await page.goto('/');
    await loginAsTestUser(page);
    await page.goto('/');
    await expect(page.locator('#sidebar')).toBeVisible();
}

/**
 * Create a trip via the +New Trip modal in the navbar.
 *
 * The destination input is wired to Google Places Autocomplete in
 * production. modals.ts:_wirePlacePicker has a manual-fallback path
 * that kicks in when `google.maps.places` isn't available — typing
 * into `#tripPlaceInput` directly sets the "picked place" with the
 * typed text. We force that path by stubbing `google` to `undefined`
 * before opening the modal so the test doesn't have to drive a real
 * Google Places dropdown (which requires a valid API key + works
 * against a real Google service the CI env doesn't have).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; country: string }} options
 */
export async function createTrip(page, { name, country }) {
    await page.evaluate(() => {
        /** @type {any} */ (window).google = undefined;
    });
    await page.click('#newTripBtn');
    await page.fill('#tripName', name);
    await page.fill('#tripPlaceInput', country);
    // Wait for the manual-fallback to enable the submit button.
    await page.locator('#newTripSubmitBtn:not([disabled])').waitFor({ timeout: 5000 });
    await page.click('#newTripSubmitBtn');
    await expect(page.locator('#tripSelector')).toContainText(name);
}

/**
 * Add an unlinked companion to the active trip via the trip-header
 * companion picker. Companions moved per-trip post-Phase-G — there's no
 * longer an account-wide companion roster, so this helper assumes the
 * caller has already created a trip (the picker button only appears on
 * the trip header).
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function addCompanion(page, name) {
    // Close the sidebar overlay if it's still up — it intercepts clicks
    // on the trip header. Idempotent (no-op if already closed).
    await page.evaluate(() => {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
    });
    // The companions card lives lower on the home page; the trip-cards
    // row above it pushes it past the initial viewport. Scroll the
    // edit-companions button into view so playwright can click it.
    const btn = page.locator('#tripCompanionsBtn');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForSelector('#companionPickerAddInput', { state: 'visible' });
    await page.fill('#companionPickerAddInput', name);
    await page.click('#companionPickerAddForm button[type="submit"]');
    // Wait for the new row to appear inside the picker before closing —
    // refreshList() re-renders the row list synchronously, so this only
    // takes one event loop tick.
    await page.locator(`.companion-row[data-name="${name}"]`).waitFor({ timeout: 3000 });
    // Close the picker — the close handler triggers navigate('home') so
    // give the re-render a moment before subsequent assertions.
    await page.click('#companionPickerCloseBtn');
    await page.waitForLoadState('domcontentloaded');
}

/**
 * Navigate to a page via the sidebar (or top nav for the always-visible
 * items). Robust against SPA hashchange suppression.
 * @param {import('@playwright/test').Page} page
 * @param {string} dataPage
 */
export async function navigateTo(page, dataPage) {
    // Top nav has direct items; sidebar covers the rest.
    const topNav = page.locator(`.nav-item[data-page="${dataPage}"]`);
    if (await topNav.count()) {
        await topNav.first().click();
        return;
    }
    await page.click('#hamburgerBtn');
    await page.click(`.sidebar-item[data-page="${dataPage}"]`);
}
