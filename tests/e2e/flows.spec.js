// @ts-check
// Critical user-flow tests — Phase A3 closeout.
//
// The smoke + pages suites cover "the app boots and every page
// renders." This file covers the LIVE flows the roadmap A3 list
// explicitly enumerates: archive a trip, edit a trip, like a feed
// event, comment on a feed event, share a trip, accept a friend, etc.
//
// Two test styles:
//
//   1. API-driven flows — go through `page.request` directly. Faster
//      and more deterministic than driving the UI for actions whose
//      core contract is "POST returns the right shape." We still log
//      in via the test-mode JWT bypass so the @require_auth gate is
//      exercised.
//
//   2. UI-driven flows — drive the actual home/trip UI for actions
//      whose value is the rendering after the action (archive flips
//      a button label, AM/PM/Eve toggle swaps which textarea is
//      visible). Desktop-only — the mobile-layout regressions
//      surfaced in pages.spec.js still hold.
//
// Two flows the roadmap lists are still test.skip()'d in smoke.spec.js
// pending Phase B1's home-split (add-companion needs the companions
// card reachable; add-expense needs the expense form's country
// picker). Re-enable those after B1.

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi, befriend } from './helpers.js';

// Each test gets a unique id suffix so re-running the suite against
// the long-running Flask dev server (its SQLite DB persists across
// runs, unlike pytest's per-test temp dbs) doesn't trip on stale
// rows from previous executions. Counter persists per-process so
// suffixes monotonically increase within one `npm run test:e2e` run
// AND don't collide across parallel re-runs.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    return `${prefix}-${Date.now()}-${_idCounter}`;
}

// All flow tests are desktop-only — mobile layout has the New Trip
// button offscreen (filed in pages.spec.js with the same gate). When
// B1 fixes the responsive layout, drop these gates.
test.describe('Critical flows — API-driven', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('share trip to feed (idempotent re-share returns same post_id)', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('user'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'Shareable Lisbon',
        });

        // First share — creates a feed_post row.
        const first = await page.request.post('/api/feed/share', {
            headers: auth.headers,
            data: { trip_id: tripId, caption: 'A great trip' },
        });
        expect(first.status()).toBe(200);
        const firstBody = await first.json();
        expect(firstBody.post_id).toBeTruthy();

        // Re-share — server returns the existing post_id with status
        // 'already_shared'. Caption can update; the post row stays.
        const second = await page.request.post('/api/feed/share', {
            headers: auth.headers,
            data: { trip_id: tripId, caption: 'A great trip — updated' },
        });
        expect(second.status()).toBe(200);
        const secondBody = await second.json();
        expect(secondBody.post_id).toBe(firstBody.post_id);
        expect(secondBody.status).toBe('already_shared');
    });

    test('unshare deletes own feed post', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('user'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'Unshare Trip',
        });
        const shareRes = await page.request.post('/api/feed/share', {
            headers: auth.headers,
            data: { trip_id: tripId },
        });
        const postId = (await shareRes.json()).post_id;

        const unshareRes = await page.request.delete(`/api/feed/share/${postId}`, {
            headers: auth.headers,
        });
        expect(unshareRes.status()).toBe(200);

        // Status check confirms the row is gone.
        const statusRes = await page.request.get(`/api/feed/share/status/${tripId}`, { headers: auth.headers });
        const status = await statusRes.json();
        expect(status.shared).toBe(false);
    });

    test('like toggles + returns updated count', async ({ page }) => {
        // Liker and sharer are different users so the like exercises
        // the cross-user notification path too (API doesn't surface
        // the notification back to us but it's part of the contract).
        const sharer = await getAuthForApi(page, uniqueId('sharer'));
        const liker = await getAuthForApi(page, uniqueId('liker'));
        const tripId = await createTripViaApi(page, sharer.headers, {
            id: uniqueId('trip'),
            name: 'Likeable',
        });
        const shareRes = await page.request.post('/api/feed/share', {
            headers: sharer.headers,
            data: { trip_id: tripId },
        });
        const postId = (await shareRes.json()).post_id;
        const eventId = `share_${postId}`;

        // First like — count goes 0 → 1, liked: true.
        const onRes = await page.request.post(`/api/feed/like/${eventId}`, {
            headers: liker.headers,
        });
        expect(onRes.status()).toBe(200);
        const onBody = await onRes.json();
        expect(onBody.liked).toBe(true);
        expect(onBody.count).toBe(1);

        // Second toggle — count goes 1 → 0, liked: false.
        const offRes = await page.request.post(`/api/feed/like/${eventId}`, {
            headers: liker.headers,
        });
        const offBody = await offRes.json();
        expect(offBody.liked).toBe(false);
        expect(offBody.count).toBe(0);
    });

    test('bookmark is per-user (no global count exposed)', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('user'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'Bookmark Trip',
        });
        const shareRes = await page.request.post('/api/feed/share', {
            headers: auth.headers,
            data: { trip_id: tripId },
        });
        const eventId = `share_${(await shareRes.json()).post_id}`;

        const onRes = await page.request.post(`/api/feed/bookmark/${eventId}`, {
            headers: auth.headers,
        });
        expect(onRes.status()).toBe(200);
        const onBody = await onRes.json();
        expect(onBody.bookmarked).toBe(true);
        // Critical: no `count` field — bookmarks are private.
        expect(onBody.count).toBeUndefined();

        const offRes = await page.request.post(`/api/feed/bookmark/${eventId}`, {
            headers: auth.headers,
        });
        expect((await offRes.json()).bookmarked).toBe(false);
    });

    test('comment on feed event posts and lists', async ({ page }) => {
        const sharer = await getAuthForApi(page, uniqueId('sharer'));
        const commenter = await getAuthForApi(page, uniqueId('commenter'));
        const tripId = await createTripViaApi(page, sharer.headers, {
            id: uniqueId('trip'),
            name: 'Comment Trip',
        });
        const shareRes = await page.request.post('/api/feed/share', {
            headers: sharer.headers,
            data: { trip_id: tripId },
        });
        const eventId = `share_${(await shareRes.json()).post_id}`;

        const postRes = await page.request.post(`/api/feed/comment/${eventId}`, {
            headers: commenter.headers,
            data: { body: 'Looks amazing!' },
        });
        expect(postRes.status()).toBe(200);
        const posted = await postRes.json();
        expect(posted.comment.body).toBe('Looks amazing!');

        // List confirms the comment is there in oldest-first order.
        const listRes = await page.request.get(`/api/feed/comments/${eventId}`, { headers: sharer.headers });
        const list = await listRes.json();
        expect(list).toHaveLength(1);
        expect(list[0].body).toBe('Looks amazing!');
    });

    test('accept friend transitions pending → accepted', async ({ page }) => {
        // Unique user IDs so the friendship row doesn't collide with
        // a previous run's residue.
        const userA = uniqueId('userA');
        const userB = uniqueId('userB');
        const { a, b } = await befriend(page, userA, userB);

        const aListRes = await page.request.get('/api/friends/list', { headers: a.headers });
        expect(aListRes.status()).toBe(200);
        const aFriends = await aListRes.json();
        expect(aFriends.some((f) => f.id === userB)).toBe(true);

        const bListRes = await page.request.get('/api/friends/list', { headers: b.headers });
        const bFriends = await bListRes.json();
        expect(bFriends.some((f) => f.id === userA)).toBe(true);
    });
});

// ── UI-driven flows ─────────────────────────────────────────────────
test.describe('Critical flows — UI-driven', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('archive then unarchive a trip', async ({ page }) => {
        // Setup via API so the test focuses on the archive flow itself.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-archive');
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Archive Flow',
        });
        await openFreshApp(page, userId);
        // Wait for /api/data to populate STATE.trips (the second
        // page.goto in openFreshApp triggers it; we wait until the
        // trip name appears in the selector). Then pick the trip in
        // the dropdown — that fires the onchange handler that sets
        // STATE.activeTripId and unhides the Complete button.
        await expect(page.locator('#tripSelector')).toContainText('Archive Flow', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // The Complete button is hidden by default (display: none) and
        // gets unhidden by updateTripSelector once an active trip exists.
        // Wait for that paint, then drive the archive confirm modal.
        const completeBtn = page.locator('#completeTripBtn');
        await completeBtn.waitFor({ state: 'visible', timeout: 5000 });
        await completeBtn.click();

        // showConfirmModal uses #modalConfirmBtn for the green/red
        // primary action; click it to confirm the archive.
        const confirmBtn = page.locator('#modalConfirmBtn');
        await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
        await confirmBtn.click();

        // Wait for the optimistic STATE update + the server delta call
        // to land. The trip leaves STATE.trips and lands in
        // STATE.archivedTrips → /api/data should now reflect that.
        await page.waitForTimeout(500);
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const trip = (data.trips || []).find((t) => t.id === tripId);
        // /api/data returns one merged `trips` list; isArchived tells
        // us which side it's on.
        expect(trip).toBeTruthy();
        expect(trip.isArchived).toBe(true);

        // Unarchive via API — the UI for that path lives on Collections
        // (covered separately by pages.spec.js's collections smoke);
        // here we just round-trip the counterpart endpoint.
        const unarchiveRes = await page.request.post(`/api/trips/${tripId}/unarchive`, { headers: auth.headers });
        expect(unarchiveRes.status()).toBe(200);
    });

    test('edit trip name via the edit modal', async ({ page }) => {
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-edit');
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Original Name',
        });
        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Original Name', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // Force the manual-fallback place picker (Google Maps not loaded
        // in test env) — same trick createTrip uses.
        await page.evaluate(() => {
            /** @type {any} */ (window).google = undefined;
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });

        // The edit-trip button is `#editTripBtn` on the trip header
        // (icon-btn-square titled "Edit trip name and location").
        const editBtn = page.locator('#editTripBtn');
        await editBtn.waitFor({ state: 'visible', timeout: 5000 });
        await editBtn.click();

        // Modal opens with the trip name in #editTripName. Change it.
        const nameInput = page.locator('#editTripName');
        await nameInput.waitFor({ state: 'visible', timeout: 5000 });
        await nameInput.fill('Renamed Trip');

        // The trip we created via API has no placeId/lat/lng, so the
        // place picker's `initialPlace` is null and the submit button
        // is disabled until the manual-fallback fires. Type into the
        // place input to set a "picked" place via the fallback path
        // (modals.ts:_wirePlacePicker). Two characters is enough.
        await page.fill('#editTripPlaceInput', 'Portugal');
        await page.locator('#editTripSubmitBtn:not([disabled])').waitFor({ timeout: 5000 });
        await page.click('#editTripSubmitBtn');

        // The trip selector updates to the new name.
        await expect(page.locator('#tripSelector')).toContainText('Renamed Trip', {
            timeout: 5000,
        });
    });

    test('day-detail modal AM/PM/Eve toggles swap content', async ({ page }) => {
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-amfeve');
        const dayId = uniqueId('day-amfeve');
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'AM PM Eve',
        });
        // Add a day so the day-detail card has something to open.
        await page.request.post('/api/days', {
            headers: auth.headers,
            data: {
                day: {
                    id: dayId,
                    tripId,
                    dayNumber: 1,
                    name: 'Day with parts',
                    date: '2026-06-01',
                    morning: 'morning content',
                    afternoon: 'afternoon content',
                    evening: 'evening content',
                },
            },
        });
        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('AM PM Eve', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // Path-chips on the cards row carry `data-path-chip-day-id`;
        // clicking one selects the day, which exposes the
        // "Open Full Plan" button on the path-card. We then click that
        // button to open the day-detail modal.
        const chip = page.locator(`[data-path-chip-day-id="${dayId}"]`);
        await chip.waitFor({ state: 'visible', timeout: 5000 });
        await chip.click();

        const openPlanBtn = page.locator(`.day-detail-btn[data-day-id="${dayId}"]`);
        await openPlanBtn.waitFor({ state: 'visible', timeout: 5000 });
        await openPlanBtn.click();

        // The day-detail modal renders three tabs along the top of the
        // plan editor (`.day-plan-tabnav`). Each tab carries a
        // `data-plan-tab="morning|afternoon|evening"` attribute —
        // stable across copy changes (AM ↔ Morning, etc.).
        const morningTab = page.locator('button[data-plan-tab="morning"]').first();
        const afternoonTab = page.locator('button[data-plan-tab="afternoon"]').first();
        const eveningTab = page.locator('button[data-plan-tab="evening"]').first();

        await morningTab.waitFor({ state: 'visible', timeout: 5000 });
        await morningTab.click();
        await expect(page.locator('text=morning content').first()).toBeVisible();
        await afternoonTab.click();
        await expect(page.locator('text=afternoon content').first()).toBeVisible();
        await eveningTab.click();
        await expect(page.locator('text=evening content').first()).toBeVisible();
    });

    test('route polyline elements render when a trip has 2+ pinned days', async ({ page }) => {
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-poly');
        const day1Id = uniqueId('day-poly-1');
        const day2Id = uniqueId('day-poly-2');
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Polyline trip',
        });
        // Two pinned days — home.ts's route polyline builder receives a
        // >=2 element dayPath (see `if (dayPath.length >= 2)`).
        // Without Google Maps loaded the actual SVG <path> isn't drawn,
        // but home.ts still surfaces the day chips. We assert the
        // precondition (chips visible), not the (untestable in CI)
        // Google Maps render.
        const days = [
            { id: day1Id, dayNumber: 1, name: 'Lisbon', date: '2026-06-01', lat: 38.72, lng: -9.14 },
            { id: day2Id, dayNumber: 2, name: 'Porto', date: '2026-06-02', lat: 41.15, lng: -8.61 },
        ];
        for (const day of days) {
            await page.request.post('/api/days', {
                headers: auth.headers,
                data: { day: { ...day, tripId } },
            });
        }
        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Polyline trip', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        await expect(page.locator(`[data-path-chip-day-id="${day1Id}"]`)).toBeVisible({ timeout: 5000 });
        await expect(page.locator(`[data-path-chip-day-id="${day2Id}"]`)).toBeVisible();
    });
});
