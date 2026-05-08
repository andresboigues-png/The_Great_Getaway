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

        // Home page rendered. Two valid states depending on whether
        // the dev SQLite carries leftover trips from prior test runs:
        //   - Truly empty: #homeHeroImg + Create-first-trip CTA.
        //   - Existing trips: trip dashboard with #tripSelector
        //     populated. (After the activeTripId-on-pull fix landed,
        //     STATE.activeTripId now auto-picks the first trip when
        //     /api/data returns trips, so this branch is the more
        //     common one in CI's persistent-DB world.)
        // Either way, navbar + new-trip button are the real smoke
        // signals — the home content shape is incidental.
        const heroVisible = await page
            .locator('#homeHeroImg')
            .isVisible()
            .catch(() => false);
        const tripSelectorHasOptions = await page.locator('#tripSelector option').count();
        expect(
            heroVisible || tripSelectorHasOptions > 0,
            'home rendered neither empty-state nor a populated trip selector'
        ).toBeTruthy();

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
        // Phase D1 (mobile responsive sweep) shrunk #newTripBtn into a
        // compact pill on mobile and tightened the nav layout, so the
        // button now sits comfortably on a 375px viewport. The
        // mobile-skip that was here is gone — desktop and mobile now
        // share the same flow.
        await openFreshApp(page);
        await createTrip(page, { name: 'Lisbon Spring', country: 'Portugal' });

        // Selector now lists the trip and marks it active. The empty-state
        // hero is replaced with the trip dashboard.
        const selected = await page.locator('#tripSelector').inputValue();
        expect(selected).toBeTruthy();
        await expect(page.locator('#homeCreateFirstTripBtn')).toBeHidden();
    });

    // Re-enabled: home.ts split (Phase B1) closed the layout-instability
    // problem that originally made this flake — the companions card sits
    // in its own home-tab content block now and addCompanion()'s
    // sidebar-overlay close + scrollIntoViewIfNeeded chain reliably
    // reaches the trigger. Phase D1 closed the mobile gap too (compact
    // navbar lets createTrip work at 375px), so the test now runs on
    // both projects.
    test('can add a companion to a trip', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Madrid Days', country: 'Spain' });
        await addCompanion(page, 'Maria');
        await expect(page.locator('text=Maria').first()).toBeVisible();
    });

    test('can add a day to a trip', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Tokyo Run', country: 'Japan' });

        // Day creation moved into the Path row's "+ Day" chip; the
        // legacy #addDayBtn vertical-timeline footer was retired
        // (see home.ts comment around #pathAddDayChip).
        await page.click('#pathAddDayChip');
        await page.fill('#dayName', 'Shibuya wandering');
        await page.fill('#dayDate', '2026-06-15');
        await page.click('#addDayForm button[type="submit"]');

        // The new day appears as a day card on home.
        await expect(page.locator('text=Shibuya wandering').first()).toBeVisible();
    });

    test('mobile bottom-tab nav navigates between primary pages', async ({ page }, testInfo) => {
        // Phase D1: bottom-tab nav for Home / Feed / Collections /
        // Profile is mobile-only — test only runs on the chromium-
        // mobile project. Click each tab and assert (a) the URL hash
        // updates, (b) the active class lands on the right tab.
        if (testInfo.project.name !== 'chromium-mobile') test.skip();

        await openFreshApp(page);

        // Home is the default landing page; the Home tab should be
        // pre-marked .active by the router on first paint.
        const home = page.locator('.mobile-bottom-nav__item[data-page="home"]');
        const feed = page.locator('.mobile-bottom-nav__item[data-page="feed"]');
        const collections = page.locator('.mobile-bottom-nav__item[data-page="collections"]');
        const profile = page.locator('.mobile-bottom-nav__item[data-page="profile"]');

        await expect(home).toBeVisible();
        await expect(home).toHaveClass(/active/);

        await collections.click();
        await expect(page).toHaveURL(/#collections$/);
        await expect(collections).toHaveClass(/active/);
        await expect(home).not.toHaveClass(/active/);

        await feed.click();
        await expect(page).toHaveURL(/#feed$/);
        await expect(feed).toHaveClass(/active/);

        await profile.click();
        await expect(page).toHaveURL(/#profile$/);
        await expect(profile).toHaveClass(/active/);

        // Profile renders #legaciesMap (a Google Maps container) which
        // captures pointer events on mobile and trips Playwright's
        // strict actionability check on the bounce back to home —
        // even though the bottom-tab nav sits at z-index 1500 above
        // it visually. Force the click since the visual stacking is
        // correct; this matches what a user's tap does in reality.
        await home.click({ force: true });
        await expect(page).toHaveURL(/#home$/);
        await expect(home).toHaveClass(/active/);
    });

    // Re-enabled now that addCompanion works (Companions tab switch in
    // helpers.js) and Phase D1 fixed the mobile navbar — mobile gate
    // gone. Form submit validates `#expCurrency` non-empty — earlier
    // version of this test omitted that and silently no-op'd.
    test('can add an expense end-to-end', async ({ page }) => {
        await openFreshApp(page);
        await createTrip(page, { name: 'Rome Weekend', country: 'Italy' });
        await addCompanion(page, 'Andres');

        await navigateTo(page, 'expenses');
        await page.selectOption('#expWho', 'Andres');
        await page.selectOption('#expCategory', { index: 0 });
        await page.fill('#expLabel', 'Pizza al Forno');
        await page.fill('#expDate', '2026-06-15');
        // Country uses a custom autocomplete: click the input to open
        // the dropdown, then click the matching item once it's visible.
        await page.click('#expCountry');
        await page.fill('#expCountry', 'Italy');
        const italyItem = page.locator('#countryDropdownList .dropdown-item[data-value="Italy"]');
        await italyItem.waitFor({ state: 'visible' });
        await italyItem.click();
        await page.fill('#expValue', '14.50');
        await page.selectOption('#expCurrency', 'EUR');
        await page.click('#expenseForm button[type="submit"]');

        // After submit the manual tab just shows "✓ Saved — view in
        // History" — the expense row itself lives in the History tab.
        // Click over there to assert the row exists.
        await page.click('.expenses-tabnav__tab[data-tab="history"]');
        await expect(page.locator('text=Pizza al Forno').first()).toBeVisible();
    });
});
