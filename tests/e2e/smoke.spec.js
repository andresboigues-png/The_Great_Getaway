// @ts-check
// Smoke suite — five tests covering the critical happy paths.
// These run against the Flask dev server (no auth: /api/user-status returns
// logged_in:false, so all flows hit the anonymous-mode localStorage path).
//
// To re-record on flake, run `npx playwright test --debug`.

import { test, expect } from '@playwright/test';
import { openFreshApp, createTrip, addCompanion, navigateTo } from './helpers.js';

test.describe('The Great Getaway — smoke', () => {
    test('app loads with no console errors and renders the navbar', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await openFreshApp(page);

        // Static navbar bits — these come from index.html, not pages/.
        await expect(page.locator('.nav-brand')).toContainText('The Great Getaway');
        await expect(page.locator('#newTripBtn')).toBeVisible();
        await expect(page.locator('#tripSelector')).toBeVisible();

        // Empty home: shows the inspirational hero.
        await expect(page.locator('#homeHeroImg')).toBeVisible();
        await expect(page.locator('#homeCreateFirstTripBtn')).toContainText('Create Trip');

        // Filter the well-known noise (Google Maps + auth scripts that don't
        // load offline, missing favicon variants, etc). If anything else
        // shows up, that's a regression.
        const ignored = [
            /google.*\.com/i,
            /accounts\.google/i,
            /Failed to load resource/i,
            /favicon/i,
            /maps\.googleapis/i,
            // Sentry CDN can fail to load behind firewalls / on flaky
            // network — we don't want test runs gated on it.
            /sentry-cdn/i,
            /sentry\.io/i,
            // Google Identity Services boot warning when running on
            // localhost (the configured origin doesn't include it).
            // The test signs in via the test-mode shortcut anyway, so
            // GSI's warning is irrelevant.
            /GSI_LOGGER/i,
        ];
        const real = errors.filter((e) => !ignored.some((re) => re.test(e)));
        expect(real, 'unexpected console errors').toEqual([]);
    });

    test('can create a trip and it shows up in the selector', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Lisbon Spring', country: 'Portugal' });

        // Selector now lists the trip and marks it active. The empty-state
        // hero is replaced with the trip dashboard.
        const selected = await page.locator('#tripSelector').inputValue();
        expect(selected).toBeTruthy();
        await expect(page.locator('#homeCreateFirstTripBtn')).toBeHidden();
    });

    test('can add a companion via personalization', async ({ page }) => {
        await openFreshApp(page);
        await addCompanion(page, 'Maria');
        await expect(page.locator('#persCompanions')).toContainText('Maria');
    });

    test('can add a day to a trip', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Tokyo Run', country: 'Japan' });

        await page.click('#addDayBtn');
        await page.fill('#dayName', 'Shibuya wandering');
        await page.fill('#dayDate', '2026-06-15');
        await page.click('#addDayForm button[type="submit"]');

        // The new day appears as a day card on home.
        await expect(page.locator('text=Shibuya wandering').first()).toBeVisible();
    });

    test('can add an expense end-to-end', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Rome Weekend', country: 'Italy' });
        await addCompanion(page, 'Andres');

        await navigateTo(page, 'expenses');
        await page.selectOption('#expWho', 'Andres');
        await page.selectOption('#expCategory', { index: 0 });
        await page.fill('#expLabel', 'Pizza al Forno');
        await page.fill('#expDate', '2026-06-15');
        // Country uses a custom autocomplete: click the input to open the
        // dropdown, then click the matching item once it's visible.
        await page.click('#expCountry');
        await page.fill('#expCountry', 'Italy');
        const italyItem = page.locator('#countryDropdownList .dropdown-item[data-value="Italy"]');
        await italyItem.waitFor({ state: 'visible' });
        await italyItem.click();
        await page.fill('#expValue', '14.50');
        await page.click('#expenseForm button[type="submit"]');

        // The expense list re-renders with the new row.
        await expect(page.locator('text=Pizza al Forno').first()).toBeVisible();
    });
});
