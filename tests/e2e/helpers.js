// @ts-check
// Shared helpers for the smoke suite. Each test starts from a known empty
// state by clearing localStorage before navigating.

import { expect } from '@playwright/test';

/**
 * Open the app at a clean state. Clears localStorage, then navigates to '/'.
 * @param {import('@playwright/test').Page} page
 */
export async function openFreshApp(page) {
    // navigate first so localStorage is accessible
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    // Wait for the main app shell to render — sidebar nav is always present.
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
