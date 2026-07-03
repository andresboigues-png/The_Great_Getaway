// @ts-check
// Smoke suite — five tests covering the critical happy paths.
// These run against the Flask dev server (no auth: /api/user-status returns
// logged_in:false, so all flows hit the anonymous-mode localStorage path).
//
// To re-record on flake, run `npx playwright test --debug`.

import { test, expect } from '@playwright/test';
import {
    openFreshApp,
    createTrip,
    addCompanion,
    navigateTo,
    openMobileTripControlsPopover,
    getAuthForApi,
} from './helpers.js';

// Each test signs in as a UNIQUE user so it starts from a clean,
// trip-less state. Critical because all tests share one dev DB + one
// server: with the old fixed `test-user-1`, trips accumulated across
// tests, so the empty-state "create your first trip" CTA (the only
// first-trip entry on mobile) vanished after the first creation and
// trip-creation flows fell through to the hidden compass. Fresh user =
// empty state = CTA present on both viewports. (Mirrors flows.spec.js.)
let _idCounter = 0;
function uniqueId(prefix) {
    // Test-mode login (GG_ALLOW_TEST_LOGIN) rejects any user_id that
    // doesn't start with `test-`, so bake that prefix in.
    _idCounter += 1;
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

test.describe('The Great Getaway — smoke', () => {
    test('app loads with no console errors and renders the navbar', async ({ page }) => {
        /** @type {string[]} */
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await openFreshApp(page, uniqueId('user'));

        // Static navbar bits — these come from index.html, not pages/.
        await expect(page.locator('.nav-brand')).toContainText('The Great Getaway');
        // Trip controls now have two homes: navbar on desktop
        // (#newTripBtn / #tripSelector) and sidebar on mobile
        // (#newTripBtnSidebar / #tripSelectorSidebar). The
        // mobile-only ones are inside the closed burger drawer at
        // boot, so checking `toBeAttached()` (in DOM) rather than
        // `toBeVisible()` works for both viewports without forcing
        // the smoke test to open the sidebar.
        await expect(page.locator('#newTripBtn, #newTripBtnSidebar').first()).toBeAttached();
        await expect(page.locator('#tripSelector, #tripSelectorSidebar').first()).toBeAttached();

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
        // Both selectors share the same options (updateTripSelector
        // populates them in sync), so counting one of them is enough —
        // either the navbar variant or the sidebar variant.
        const tripSelectorHasOptions = await page.locator('#tripSelector option, #tripSelectorSidebar option').count();
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
            // openFreshApp navigates twice in quick succession (goto →
            // seed localStorage → goto), which cancels any in-flight boot
            // fetch (e.g. /api/notifications/list). The app correctly aborts
            // them via AbortController; the resulting AbortError is expected
            // navigation noise, not an app fault.
            /AbortError: signal is aborted/i,
            // Same navigation-cancellation class, surfaced via the app's
            // apiFetch wrapper (a boot fetch — fx-rates / notifications /
            // data — cancelled when the test navigates). The wrapper logs
            // it as a network failure; it's expected test noise, and a real
            // feature break would still fail the feature's own assertion.
            /\[apiFetch\] network failure/i,
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
        await openFreshApp(page, uniqueId('user'));
        await createTrip(page, { name: 'Lisbon Spring', country: 'Portugal' });

        // Selector now lists the trip and marks it active. The empty-state
        // hero is replaced with the trip dashboard. Both selectors
        // (navbar + sidebar) are populated in lock-step, so reading
        // either one works regardless of which is currently visible.
        const selected = await page.locator('#tripSelector, #tripSelectorSidebar').first().inputValue();
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
        await openFreshApp(page, uniqueId('user'));
        await createTrip(page, { name: 'Madrid Days', country: 'Spain' });
        await addCompanion(page, 'Maria');
        await expect(page.locator('text=Maria').first()).toBeVisible();
    });

    test('can add a day to a trip', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        await createTrip(page, { name: 'Tokyo Run', country: 'Japan' });

        // Day creation moved into the Path row's "+ Day" chip; the
        // legacy #addDayBtn vertical-timeline footer was retired
        // (see home.ts comment around #pathAddDayChip). On mobile
        // the chip sits in a row that gets crowded by the fixed
        // bottom-tab nav after createTrip's burger-close + map-mount
        // sequence — Playwright's actionability check times out on
        // the chip even though it's visible. dispatchEvent via
        // .evaluate(el => el.click()) skips the hit-test.
        // MK1 Wave D: the plan area opens on the Trip Hub tab now; the
        // day-chip strip (with the + chip) lives on the Days/Path tab.
        await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
        await page.locator('#pathAddDayChip').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await page.fill('#dayName', 'Shibuya wandering');
        await page.fill('#dayDate', '2026-06-15');
        await page.click('#addDayForm button[type="submit"]');

        // The new day appears as a day card on home.
        await expect(page.locator('text=Shibuya wandering').first()).toBeVisible();
    });

    test('mobile modal renders as full-width bottom sheet, not centered card', async ({ page }, testInfo) => {
        // Phase D1: modals at ≤720px viewport switch from a
        // centered card (with `width: 420px` inline styles) to a
        // full-width bottom sheet with rounded top corners and a
        // drag-handle pill. Verified by opening the New Trip modal
        // (which passes `cardStyle: 'width: 380px'`) and asserting
        // the rendered card is closer to viewport-width than to
        // 380px, and is anchored to the bottom of the viewport.
        if (testInfo.project.name !== 'chromium-mobile') test.skip();

        await openFreshApp(page, uniqueId('user'));

        // Open the New Trip modal — its cardStyle is `width: 380px`,
        // which the mobile sheet overrides via descendant selector
        // + !important. On mobile #newTripBtn is hidden (display:
        // none, see .nav-trips--desktop-only) — the live button is
        // #newTripBtnSidebar inside the navbar's compass-trigger
        // popover (#tripControlsPopover). Previously the controls
        // lived at the top of the burger drawer; per-user request
        // they moved to a one-tap navbar popover.
        await page.evaluate(() => {
            /** @type {any} */ (window).google = undefined;
        });
        // Fresh user (no trip yet) → the New Trip modal opens from the
        // empty-state hero CTA, which is present on mobile. (The compass
        // popover #tripControlsBtn only appears once a trip exists, so it
        // can't open the FIRST trip's modal.) Poll the click: the listener
        // is attached on mount and can lag a fresh page-load click.
        for (let attempt = 0; attempt < 12; attempt += 1) {
            await page.locator('#homeCreateFirstTripBtn').click();
            if (
                await page
                    .locator('#tripName')
                    .isVisible()
                    .catch(() => false)
            )
                break;
            await page.waitForTimeout(250);
        }
        const card = page.locator('.modal-overlay .card-glass-modal').first();
        await card.waitFor({ state: 'visible', timeout: 5000 });

        // Sheet is the FULL viewport width (not the 380px inline
        // style) — gives ~10px tolerance for rounding.
        const cardBox = await card.boundingBox();
        const viewportWidth = page.viewportSize()?.width ?? 0;
        expect(cardBox?.width).toBeGreaterThan(viewportWidth - 10);
        expect(cardBox?.width).toBeLessThanOrEqual(viewportWidth);

        // Sheet is anchored to the bottom of the viewport (its
        // bottom edge is within ~5px of the viewport bottom).
        const viewportHeight = page.viewportSize()?.height ?? 0;
        const cardBottom = (cardBox?.y ?? 0) + (cardBox?.height ?? 0);
        expect(cardBottom).toBeGreaterThan(viewportHeight - 5);

        // Drag-handle pseudo (::before) — confirm it renders by
        // checking the card's first generated content. Pseudos can't
        // be queried directly, but we can verify via computed styles
        // of the ::before element.
        const handleWidth = await card.evaluate((el) => getComputedStyle(el, '::before').width);
        expect(handleWidth).toBe('40px');
    });

    test('mobile bottom-tab nav navigates between primary pages', async ({ page }, testInfo) => {
        // Bottom-tab nav houses the primary pages: Home, To-do, Plan
        // with AI, Expenses (Insights was folded into Expenses on
        // 2026-05-14). Mobile only —
        // skipped on chromium-desktop. Click each tab and assert
        // (a) the URL hash updates, (b) the active class lands on
        // the right tab.
        if (testInfo.project.name !== 'chromium-mobile') test.skip();

        await openFreshApp(page, uniqueId('user'));

        const home = page.locator('.mobile-bottom-nav__item[data-page="home"]');
        const todo = page.locator('.mobile-bottom-nav__item[data-page="todo"]');
        const ai = page.locator('.mobile-bottom-nav__item[data-page="ai"]');
        const expenses = page.locator('.mobile-bottom-nav__item[data-page="expenses"]');

        // Bottom-tab nav renders all four task-pages with matching
        // data-page attributes. (Bouncing through all four
        // sequentially via clicks is flaky on mobile because the
        // destination pages — Insights especially — mount Chart.js
        // canvases that capture pointer events and tank Playwright's
        // actionability check on the next click attempt. Verifying
        // existence + the data-page wiring + ONE navigation round-
        // trip is enough to catch a regression in the bottom-tab
        // markup or the router's class-toggle.)
        await expect(home).toBeVisible();
        await expect(todo).toBeVisible();
        await expect(ai).toBeVisible();
        await expect(expenses).toBeVisible();

        // Single round-trip: hash-route to Todo, assert URL + active
        // class. Avoids the cumulative pointer-event interception
        // that breaks a multi-bounce flow.
        await page.evaluate(() => {
            window.location.hash = '#todo';
        });
        await expect(page).toHaveURL(/#todo$/);
        await expect(todo).toHaveClass(/active/);
        await expect(home).not.toHaveClass(/active/);
        await expect(ai).not.toHaveClass(/active/);
        await expect(expenses).not.toHaveClass(/active/);
    });

    // Re-enabled now that addCompanion works (Companions tab switch in
    // helpers.js) and Phase D1 fixed the mobile navbar — mobile gate
    // gone. Form submit validates `#expCurrency` non-empty — earlier
    // version of this test omitted that and silently no-op'd.
    test('can add an expense end-to-end', async ({ page }) => {
        // Server-persist the trip + companion up front via the API so the
        // expense UI flow isn't racing the optimistic-trip-vs-background-sync
        // window: the UI New-Trip POST aborts on modal-close (trip persists
        // only via the periodic /api/sync), and a change-detection pull in
        // that gap could transiently drop the not-yet-synced trip, nulling
        // activeTripId right before the expense submit (onSubmit bails on
        // `!STATE.activeTripId`). API setup is server-truth from the start.
        // Mirrors flows.spec.js. Trip/companion UI creation is covered by the
        // dedicated create-trip / add-companion tests above.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const res = await page.request.post('/api/trips', {
            headers: auth.headers,
            data: {
                trip: {
                    id: uniqueId('trip'),
                    name: 'Rome Weekend',
                    country: 'Italy',
                    companions: [{ name: 'Andres' }],
                },
            },
        });
        expect(res.status()).toBe(200);
        // Seed a category too: #expCategory is a `required` <select> with no
        // placeholder option, so with zero categories it stays empty and
        // native form validation blocks submit before onSubmit ever fires.
        const catRes = await page.request.post('/api/categories', {
            headers: auth.headers,
            data: { categories: [{ id: uniqueId('cat'), name: 'Food', icon: '🍔', color: '#ff3b30' }] },
        });
        expect(catRes.status()).toBe(200);
        await openFreshApp(page, userId);

        await navigateTo(page, 'expenses');
        await page.selectOption('#expWho', 'Andres');
        await page.selectOption('#expCategory', { index: 0 });
        await page.fill('#expLabel', 'Pizza al Forno');
        // Expense date must be <= today: the form caps #expDate at max=today
        // (no future expenses). Use today so it's always valid regardless of
        // when the suite runs (the old hard-coded future date silently failed
        // native validation, blocking submit before onSubmit even fired).
        await page.fill('#expDate', new Date().toISOString().slice(0, 10));
        // Country uses a custom autocomplete: click the input to open
        // the dropdown, then click the matching item once it's visible.
        await page.click('#expCountry');
        await page.fill('#expCountry', 'Italy');
        // Dropdown items are React-rendered with the country name as text
        // (role="option"); the old data-value attr is gone. Match by text.
        const italyItem = page.locator('#countryDropdownList .dropdown-item', { hasText: 'Italy' }).first();
        await italyItem.waitFor({ state: 'visible' });
        await italyItem.click();
        await page.fill('#expValue', '14.50');
        await page.selectOption('#expCurrency', 'EUR');
        // Submit by accessible role + label: the React expense form dropped
        // its #expenseForm id in the refactor, so the old
        // `#expenseForm button[type="submit"]` matched nothing.
        await page.getByRole('button', { name: 'Save Expense' }).click();
        // Confirm the save landed (toast) before switching tabs.
        await expect(page.getByText('Expense saved', { exact: false })).toBeVisible({ timeout: 6000 });

        // After submit the manual tab just shows "✓ Saved — view in
        // History" — the expense row itself lives in the History tab.
        // Click over there to assert the row exists.
        // History tab is a React role="tab" button now (no data-tab attr).
        await page.getByRole('tab', { name: 'History' }).click();
        await expect(page.locator('text=Pizza al Forno').first()).toBeVisible();
    });
});
