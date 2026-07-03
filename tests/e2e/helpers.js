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
 * Open the mobile compass-trigger popover. Late in a heavy suite the
 * chunk-load + main.ts init that wires the click listener can lag
 * behind a fresh-page-load click on `#tripControlsBtn` — the click
 * fires with no listener and `#newTripBtnSidebar` stays hidden. Poll
 * by re-clicking until the popover transitions to display:block,
 * bounded at 12 attempts (~3s) which is well under the test's 15s
 * default timeout but generous for cold-cache mobile chunk-load.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openMobileTripControlsPopover(page) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await page.click('#tripControlsBtn');
        const opened = await page
            .locator('#tripControlsPopover')
            .evaluate((el) => /** @type {HTMLElement} */ (el).style.display === 'block')
            .catch(() => false);
        if (opened) break;
        await page.waitForTimeout(250);
    }
    await page.locator('#newTripBtnSidebar').waitFor({ state: 'visible', timeout: 8000 });
}

/**
 * Open the app at a clean state, signed in as the test user. Two
 * navigations: the first lets us touch localStorage on the right
 * origin, the second is the actual app boot under the seeded session.
 * @param {import('@playwright/test').Page} page
 * @param {string} [userId]
 */
export async function openFreshApp(page, userId = 'test-user-1') {
    await page.goto('/');
    await loginAsTestUser(page, userId);
    await page.goto('/');
    // App booted + authed = the static navbar chrome is rendered. (Was
    // `#sidebar` — but post nav-restructure `#sidebar` is a slide-out DRAWER
    // that's hidden by default and only opens via the hamburger/swipe, so it's
    // never visible on a fresh boot. `.navbar` is always present from
    // index.html on both desktop + mobile.)
    await expect(page.locator('.navbar')).toBeVisible();
}

/**
 * Boot the app, activate `tripId`, and WAIT for that trip's media
 * (photos / markedPlaces / documents) to finish loading before returning.
 *
 * Media is a separate write/read path (R12 invariant): /api/data never
 * ships it; the client lazy-loads the active trip's media via
 * fetchTripMedia() on the boot pull (api.ts). If a test opens the photos
 * modal before that GET lands, the modal renders an empty grid and does
 * NOT repopulate when the arrays arrive — so the first card never appears.
 * Awaiting the media GET makes the seed deterministic.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} userId
 * @param {string} tripId
 */
export async function openTripWithMedia(page, userId, tripId) {
    await openFreshApp(page, userId);
    // Mark the seeded trip active in the persisted snapshot so the next
    // boot's pull picks it up and triggers fetchTripMedia(activeTrip).
    await page.evaluate((id) => {
        try {
            const raw = localStorage.getItem('theGreatEscapeState');
            const parsed = raw ? JSON.parse(raw) : {};
            parsed.activeTripId = id;
            localStorage.setItem('theGreatEscapeState', JSON.stringify(parsed));
        } catch (_) {
            /* ignore */
        }
    }, tripId);
    // Arm the media-GET wait BEFORE the navigation that triggers it.
    const mediaLoaded = page
        .waitForResponse((r) => r.url().includes(`/api/trips/${tripId}/media`) && r.request().method() === 'GET', {
            timeout: 10000,
        })
        .catch(() => null);
    await page.goto('/');
    await mediaLoaded;
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
        // Close the sidebar overlay if it auto-opened on render.
        // Idempotent — the open path below will re-open it on mobile.
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
    });
    // Open the +New Trip modal. Entry point depends on app state + viewport:
    //   - Empty state (no trips yet — e.g. the smoke flows' FIRST trip):
    //     the hero CTA #homeCreateFirstTripBtn, present on BOTH desktop +
    //     mobile and wired to openNewTripModal() (WelcomePage.tsx). This is
    //     the only first-trip entry on mobile, where the navbar compass
    //     (#tripControlsBtn) stays hidden until there's an active trip.
    //   - Trips already exist: desktop navbar #newTripBtn; mobile compass
    //     popover (#tripControlsBtn → #newTripBtnSidebar).
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    const firstTripCta = page.locator('#homeCreateFirstTripBtn');
    // Wait for the empty-state CTA to mount — on mobile the home content
    // mounts a beat after `.navbar`, so an immediate isVisible() check
    // raced ahead of it and fell through to the (hidden) compass path.
    const hasFirstTripCta = await firstTripCta
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    if (hasFirstTripCta) {
        // Poll the click: main.ts's listener attachment can lag a fresh
        // page-load click, which would no-op and leave #tripName unmounted.
        for (let attempt = 0; attempt < 12; attempt += 1) {
            await firstTripCta.click();
            if (
                await page
                    .locator('#tripName')
                    .isVisible()
                    .catch(() => false)
            )
                break;
            await page.waitForTimeout(250);
        }
    } else if (viewportWidth <= 720) {
        // Mobile, trip already exists: compass-popover path. See
        // openMobileTripControlsPopover for the chunk-load race it guards.
        await openMobileTripControlsPopover(page);
        await page.click('#newTripBtnSidebar');
    } else {
        // Desktop navbar. Same chunk-load race: main.ts's modal-listener
        // attachment can lag a click on #newTripBtn, leaving #tripName
        // unmounted. Poll until the modal appears.
        for (let attempt = 0; attempt < 12; attempt += 1) {
            await page.click('#newTripBtn');
            const opened = await page
                .locator('#tripName')
                .isVisible()
                .catch(() => false);
            if (opened) break;
            await page.waitForTimeout(250);
        }
    }
    await page.fill('#tripName', name);
    await page.fill('#tripPlaceInput', country);
    // MK3-1: new-trip submit now gates on a real ISO countryCode. With Google
    // Maps stubbed out (above), modals.ts injects a country <select> right
    // after the place input; selecting a country is what calls setPicked()
    // with a countryCode and enables Create. This mirrors the real
    // Maps-unavailable user flow (type destination + pick country).
    await page.selectOption('#tripPlaceInput + select', { label: country });
    // Wait for the manual-fallback to enable the submit button.
    await page.locator('#newTripSubmitBtn:not([disabled])').waitFor({ timeout: 5000 });
    await page.click('#newTripSubmitBtn');
    // The trip name appears in EITHER selector (whichever is visible at
    // the current viewport). Use a generic locator that matches both.
    await expect(page.locator('#tripSelector, #tripSelectorSidebar').first()).toContainText(name);
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
    // The companions card sits inside the Companions tab of the trip
    // tab-nav (Path / Companions). It's React-rendered now (TripBody.tsx)
    // as role="tab" buttons with no data-* hook, so select by accessible
    // role + label. Switching tabs makes #tripCompanionsBtn visible +
    // clickable (the Path tab's content is display:none when inactive).
    await page.getByRole('tab', { name: 'Companions' }).click();
    // The companions card lives lower on the home page; the trip-cards
    // row above it pushes it past the initial viewport. Scroll the
    // edit-companions button into view so playwright can click it.
    const btn = page.locator('.trip-companions-card__cta');
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

// ── API-level helpers ────────────────────────────────────────────────
// The flow suite exercises the JWT-gated endpoints directly via
// page.request rather than driving the UI for setup. Same auth
// (loginAsTestUser issues a real JWT and seeds it in localStorage,
// but `page.request` is its own context so we replay the
// Authorization header manually). Faster + more deterministic for
// the API contract tests.

/**
 * Issue a fresh JWT via the test-mode bypass and return the
 * Authorization header for use with page.request. Independent of any
 * existing localStorage / cookies.
 * @param {import('@playwright/test').Page} page
 * @param {string} [userId]
 * @returns {Promise<{ token: string, user: any, headers: { Authorization: string } }>}
 */
export async function getAuthForApi(page, userId = 'test-user-1') {
    const res = await page.request.post('/api/auth/google', {
        data: { token: `test:${userId}`, name: userId === 'test-user-1' ? 'Test User' : `Test ${userId}` },
    });
    if (!res.ok()) {
        throw new Error(`getAuthForApi failed: ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    return {
        token: body.token,
        user: body.user,
        // `Origin` satisfies the 2026-05-27 CSRF same-origin gate on mutating
        // routes. page.request (APIRequestContext) doesn't send one
        // automatically, so without it every authed API POST 403s.
        headers: {
            Authorization: `Bearer ${body.token}`,
            Origin: 'http://localhost:5001',
        },
    };
}

/**
 * Create a trip via /api/trips POST. Faster than the UI modal +
 * deterministic — Playwright doesn't need to drive the place picker.
 * @param {import('@playwright/test').APIRequestContext | import('@playwright/test').Page} ctx
 * @param {{ Authorization: string }} headers
 * @param {{ id?: string; name?: string; country?: string; isPublic?: boolean }} [trip]
 */
export async function createTripViaApi(ctx, headers, trip = {}) {
    // Accept either a Page (use .request) or a raw APIRequestContext.
    /** @type {import('@playwright/test').APIRequestContext} */
    const api = 'request' in ctx ? ctx.request : ctx;
    const id = trip.id || `trip-flow-${Math.random().toString(36).slice(2, 8)}`;
    /** @type {Record<string, any>} */
    const tripPayload = {
        id,
        name: trip.name || 'Flow Test Trip',
        country: trip.country || 'Portugal',
        isPublic: trip.isPublic ?? false,
    };
    // Forward optional fields when the test seeds them — the
    // upsert-trip endpoint accepts these as serialised JSON columns
    // (see routes/trips.py). Skipping when undefined so the server
    // falls back to its own defaults (NULL / empty array).
    // MK1 Wave D: place fields — a REAL trip always has a destination,
    // and the edit-trip modal's pure-rename path requires one
    // (initialPlace keys off placeId/lat). Tests seeding placeless
    // trips get the manual-fallback picker instead.
    if (trip.placeId !== undefined) tripPayload.placeId = trip.placeId;
    if (trip.lat !== undefined) tripPayload.lat = trip.lat;
    if (trip.lng !== undefined) tripPayload.lng = trip.lng;
    if (trip.countryCode !== undefined) tripPayload.countryCode = trip.countryCode;
    if (trip.markedPlaces !== undefined) tripPayload.markedPlaces = trip.markedPlaces;
    if (trip.companions !== undefined) tripPayload.companions = trip.companions;
    if (trip.documents !== undefined) tripPayload.documents = trip.documents;
    if (trip.photos !== undefined) tripPayload.photos = trip.photos;
    if (trip.checklist !== undefined) tripPayload.checklist = trip.checklist;
    const res = await api.post('/api/trips', {
        headers,
        data: { trip: tripPayload },
    });
    if (!res.ok()) throw new Error(`createTripViaApi failed: ${res.status()} ${await res.text()}`);
    return id;
}

/**
 * Establish a mutually-accepted friendship between two test users by
 * driving the friend-add and friend-accept endpoints. Uses
 * GG_ALLOW_TEST_LOGIN's test-mode auth shortcut for both halves so
 * the test isn't sensitive to row ordering.
 * @param {import('@playwright/test').Page} page
 * @param {string} userIdA
 * @param {string} userIdB
 * @returns {Promise<{ a: { headers: { Authorization: string } }, b: { headers: { Authorization: string } } }>}
 */
export async function befriend(page, userIdA, userIdB) {
    const a = await getAuthForApi(page, userIdA);
    const b = await getAuthForApi(page, userIdB);
    // Each /api/auth/google login Set-Cookies a gg_session into the SHARED
    // page.request cookie jar, so after B's login the jar holds B's
    // session. The server resolves identity cookie-OVER-Bearer (auth.py
    // _extract_token: `_cookie_token() or _bearer_token()`), so an A→B
    // request authed with A's Bearer would be mis-read as B (→ 400
    // "Can't friend yourself"). Drop the cookie so every request below is
    // identified purely by its Authorization: Bearer header.
    await page.context().clearCookies();
    const addRes = await page.request.post('/api/friends/add', {
        headers: a.headers,
        data: { friend_id: userIdB },
    });
    if (!addRes.ok()) {
        throw new Error(`befriend (add) failed: ${addRes.status()} ${await addRes.text()}`);
    }
    const acceptRes = await page.request.post('/api/friends/accept', {
        headers: b.headers,
        data: { friend_id: userIdA },
    });
    if (!acceptRes.ok()) {
        throw new Error(`befriend (accept) failed: ${acceptRes.status()} ${await acceptRes.text()}`);
    }
    return { a, b };
}

/**
 * Navigate to a page via whatever surface currently exposes it —
 * top-nav, mobile bottom-tab, or sidebar burger. Phase D1 added the
 * mobile bottom-tab nav and HID the top-nav-link row at ≤720px, so
 * a naive `.nav-item[data-page=…]` lookup picks up DOM-present-but-
 * `display:none` items on mobile and times out on click. The
 * `:visible` filter restricts the match to elements that actually
 * render.
 *
 * Order: visible nav-item first (top nav on desktop, bottom-tab on
 * mobile), then sidebar burger as a universal fallback.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} dataPage
 */
export async function navigateTo(page, dataPage) {
    // (1) Visible non-sidebar element with `data-page="<X>"`.
    // Catches the top-nav links (.nav-item), mobile bottom-tab items,
    // and navbar icons (#navSearchBtn, #navFeedBtn — both have
    // data-page). Sidebar items are EXCLUDED here via `:not(.sidebar-item)`
    // because the sidebar drawer hides itself with `transform:
    // translateX(-100%)` — display + visibility stay normal, so
    // Playwright's `:visible` selector considers sidebar items
    // "visible" even when the drawer is closed and they're scrolled
    // off-screen. The click would then attempt + time out trying
    // to scroll the element into view (impossible — it's
    // translated, not overflow-scrolled).
    const nonSidebar = page.locator(`[data-page="${dataPage}"]:visible:not(.sidebar-item)`);
    if (await nonSidebar.count()) {
        await nonSidebar.first().click();
        return;
    }
    // (2) Sidebar drawer item — open the burger, then click.
    // `.sidebar.open` lands the drawer on-screen so the click works.
    const sidebarItemAny = page.locator(`.sidebar-item[data-page="${dataPage}"]`);
    if (await sidebarItemAny.count()) {
        await page.click('#hamburgerBtn');
        // Re-resolve with `:visible` to skip mobile-only / desktop-only
        // items that are hidden via parent marker class (display:none
        // from .sidebar-item--mobile-only / --desktop-only doesn't
        // require the transform-trick workaround above).
        const sidebarVisible = page.locator(`.sidebar.open .sidebar-item[data-page="${dataPage}"]:visible`);
        if (await sidebarVisible.count()) {
            // Use el.click() in the page context rather than
            // Playwright's .click() — the sidebar slides in via
            // CSS transform transition, and Playwright's "wait
            // for stable" check times out during the animation.
            // The DOM click() event fires the same listener; once
            // it lands, the router does its work synchronously.
            await sidebarVisible.first().evaluate((el) => /** @type {HTMLElement} */ (el).click());
            return;
        }
    }
    // (3) Hash-route fallback — for pages with no UI entry point
    // at this viewport. The router's onhashchange listener picks up
    // the change and fires the navigation.
    await page.evaluate((p) => {
        window.location.hash = `#${p}`;
    }, dataPage);
    await page.waitForLoadState('domcontentloaded');
}
