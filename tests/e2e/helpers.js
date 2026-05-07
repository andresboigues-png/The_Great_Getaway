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
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; country: string }} options
 */
export async function createTrip(page, { name, country }) {
    await page.click('#newTripBtn');
    await page.fill('#tripName', name);
    // The country input is a custom autocomplete — type, then click matching item.
    await page.fill('#tripCountryInput', country);
    await page.locator(`#tripCountryList .dropdown-item[data-value="${country}"]`).click();
    await page.click('#newTripForm button[type="submit"]');
    // Trip should now be in the selector, marked active.
    await expect(page.locator('#tripSelector')).toContainText(name);
}

/**
 * Add a companion via the personalization page.
 * Navigates by clicking the sidebar — `page.goto('/#x')` is unreliable when
 * the SPA's `isInternalNav` flag is set (router.js suppresses the next
 * hashchange after every internal navigate).
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function addCompanion(page, name) {
    await page.click('#hamburgerBtn');
    await page.click('.sidebar-item[data-page="personalization"]');
    await page.waitForSelector('#persMenu', { state: 'visible' });
    await page.click('.pers-tab-card[data-tab="companions"]');
    await page.waitForSelector('#newPerson', { state: 'visible' });
    await page.fill('#newPerson', name);
    await page.click('#addPersonBtn');
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
