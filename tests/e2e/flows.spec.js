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
import { openFreshApp, getAuthForApi, createTripViaApi, befriend, navigateTo } from './helpers.js';

// Each test gets a unique id suffix so re-running the suite against
// the long-running Flask dev server (its SQLite DB persists across
// runs, unlike pytest's per-test temp dbs) doesn't trip on stale
// rows from previous executions. Counter persists per-process so
// suffixes monotonically increase within one `npm run test:e2e` run
// AND don't collide across parallel re-runs.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    // `test-` prefix required: test-mode login rejects non-test- user_ids.
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
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

    test('mutual follow makes each user appear in the other friend list', async ({ page }) => {
        // Model B (follow graph): befriend() makes A follow B AND B follow
        // A, so the pair is now MUTUAL. /api/friends/list returns mutuals,
        // so each must see the other. (There is no pending/accept state —
        // see the reject test below for that contract.)
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

    test('reject is a no-op under the follow model (pending stays empty, no mutual formed)', async ({ page }) => {
        // friends.py is "Model B": a follow graph, NOT a pending/accept/
        // reject request dance. add = follow (immediate, idempotent),
        // /api/friends/pending ALWAYS returns [] (kept only so the bell
        // badge poller doesn't error), reject is a no-op success (so old
        // clients clicking a stale "Reject" notification don't toast an
        // error), and /api/friends/list returns MUTUALS. This test pins
        // that contract: a one-way follow does NOT create a friendship,
        // and reject changes nothing.
        const userA = uniqueId('userA');
        const userB = uniqueId('userB');
        const aAuth = await getAuthForApi(page, userA);
        const bAuth = await getAuthForApi(page, userB);
        // Drop the gg_session cookie left by the two logins — the server
        // resolves cookie OVER Bearer (auth.py _extract_token), so the
        // stale B-cookie would mis-identify A's Bearer-authed requests as
        // B (→ self-friend 400). Bearer-only after this. See befriend().
        await page.context().clearCookies();

        // A follows B (B does NOT follow back).
        const addRes = await page.request.post('/api/friends/add', {
            headers: aAuth.headers,
            data: { friend_id: userB },
        });
        expect(addRes.status()).toBe(200);

        // Model B contract: pending is always empty — there is no
        // pending state for B to see, even though A just followed.
        const pendingBefore = await page.request.get('/api/friends/pending', {
            headers: bAuth.headers,
        });
        expect(await pendingBefore.json()).toEqual([]);

        // B "rejects" — a no-op that still returns success.
        const rejectRes = await page.request.post('/api/friends/reject', {
            headers: bAuth.headers,
            data: { friend_id: userA },
        });
        expect(rejectRes.status()).toBe(200);
        expect((await rejectRes.json()).status).toBe('success');

        // Post-conditions: pending still empty, and NEITHER appears in the
        // other's friend list — a one-way follow is not a mutual, and
        // reject didn't (and couldn't) change that.
        const pendingAfter = await page.request.get('/api/friends/pending', {
            headers: bAuth.headers,
        });
        expect(await pendingAfter.json()).toEqual([]);

        const aFriends = await (await page.request.get('/api/friends/list', { headers: aAuth.headers })).json();
        const bFriends = await (await page.request.get('/api/friends/list', { headers: bAuth.headers })).json();
        expect(aFriends.some((f) => f.id === userB)).toBe(false);
        expect(bFriends.some((f) => f.id === userA)).toBe(false);

        // Re-follow is idempotent — Model B has no "blocked" state.
        const reAddRes = await page.request.post('/api/friends/add', {
            headers: aAuth.headers,
            data: { friend_id: userB },
        });
        expect(reAddRes.status()).toBe(200);
    });

    test('edit expense round-trips via UPSERT (re-POST same id updates row)', async ({ page }) => {
        // /api/expenses uses INSERT ... ON CONFLICT(id) DO UPDATE so
        // editing an expense is just a re-POST with the same id and
        // updated fields. Pin: the second POST overwrites label /
        // value / currency / euro_value (all tracked by the SET
        // clause) and the row count stays at 1.
        const auth = await getAuthForApi(page, uniqueId('user'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip-edit-exp'),
            name: 'Edit Expense Trip',
        });
        const expId = uniqueId('exp');

        const initial = await page.request.post('/api/expenses', {
            headers: auth.headers,
            data: {
                expense: {
                    id: expId,
                    tripId,
                    who: 'Me',
                    categoryId: 'c-food',
                    label: 'Cafe',
                    date: '2026-06-01',
                    country: 'Portugal',
                    value: 10,
                    currency: 'EUR',
                    euroValue: 10,
                },
            },
        });
        expect(initial.status()).toBe(200);

        // Re-POST with same id but new label / value / currency.
        // The UPSERT path takes over.
        const edited = await page.request.post('/api/expenses', {
            headers: auth.headers,
            data: {
                expense: {
                    id: expId,
                    tripId,
                    who: 'Me',
                    categoryId: 'c-food',
                    label: 'Cafe with friends',
                    date: '2026-06-01',
                    country: 'Portugal',
                    value: 25,
                    currency: 'GBP',
                    euroValue: 29,
                },
            },
        });
        expect(edited.status()).toBe(200);

        // Round-trip: GET /api/data and confirm exactly ONE row, with
        // the edited fields. If the UPSERT regressed to two rows or
        // the SET clause dropped a column, the assert below fails.
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const matches = (data.expenses || []).filter((e) => e.id === expId);
        expect(matches).toHaveLength(1);
        expect(matches[0].label).toBe('Cafe with friends');
        expect(matches[0].value).toBe(25);
        expect(matches[0].currency).toBe('GBP');
        // euroValue is SERVER-computed, not stored verbatim: expenses.py
        // (R3-Fix #6) runs compute_euro_value() and overrides the client's
        // euroValue hint whenever a live FX rate exists — so a tampered
        // `{value:1, currency:JPY, euroValue:1000000}` can't poison
        // Insights. The posted 29 is therefore ignored; the server stamps
        // 25 GBP × today's GBP→EUR rate. We assert the camelCase
        // read-mapping contract (field is `euroValue`, not snake_case
        // `euro_value`) + a plausible conversion band rather than an exact
        // value that drifts with the daily rate.
        expect(typeof matches[0].euroValue).toBe('number');
        expect(matches[0].euroValue).toBeGreaterThan(20);
        expect(matches[0].euroValue).toBeLessThan(40);
    });

    test('settle-shape expense round-trips with country=Settlement marker', async ({ page }) => {
        // settleDebt() in pages/settlement.ts records a settlement as
        // a regular expense row with country='Settlement' + a
        // 'Settlement: A → B' label. The `splits` and `isSettlement`
        // fields live in localStorage only (no DB columns), but the
        // country marker DOES persist — and pages/settlement.ts's
        // archived-trip filter keys off it. Pin: the round-trip
        // preserves the Settlement marker so a regression that drops
        // the country field would surface here.
        const auth = await getAuthForApi(page, uniqueId('user'));
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip-settle'),
            name: 'Settle Trip',
        });
        const settlementId = uniqueId('exp-settlement');

        const settleRes = await page.request.post('/api/expenses', {
            headers: auth.headers,
            data: {
                expense: {
                    id: settlementId,
                    tripId,
                    who: 'Alice',
                    categoryId: 'c-food',
                    label: 'Settlement: Alice → Bob',
                    date: '2026-06-15',
                    country: 'Settlement', // critical marker
                    value: 50,
                    currency: 'EUR',
                    euroValue: 50,
                },
            },
        });
        expect(settleRes.status()).toBe(200);

        // GET /api/data and assert the country marker survived. The
        // settlement-page filter does
        // `e.tripId === t.id && e.country === 'Settlement'`, so the
        // round-trip is the contract this test pins.
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const settlement = (data.expenses || []).find((e) => e.id === settlementId);
        expect(settlement).toBeTruthy();
        expect(settlement.country).toBe('Settlement');
        expect(settlement.label).toBe('Settlement: Alice → Bob');
    });

    test('companions: unlinked survives, spoofed link stripped, verified-member link round-trips', async ({ page }) => {
        // Trips carry a `companions` JSON array of two shapes:
        //   - unlinked: `{ name: 'Maria' }` — typed into the picker, no
        //     real account behind it.
        //   - linked:   `{ name, linkedUserId }` — promoted when the
        //     picker matches a real trip member.
        //
        // R2 audit fix (clean_companions + _cleaned_companions in
        // trips.py): a linkedUserId is preserved ONLY if it belongs to a
        // VERIFIED trip member (a row in trip_members). Any other
        // linkedUserId — a client trying to plant a spoofed link — is
        // coerced to null; the name + UI presence survive but the fake
        // link silently disappears. This pins all three outcomes.
        const auth = await getAuthForApi(page, uniqueId('user'));
        const ownerId = auth.user.id;
        const tripId = uniqueId('trip-companions');
        const spoofId = uniqueId('not-a-member');

        // First POST creates the trip. The owner-self-stamp
        // (ensure_owner_member_row) adds ownerId to trip_members — but it
        // runs AFTER companions are cleaned on this insert, so we set the
        // companions on a SECOND POST below where ownerId is already a
        // verified member.
        const createRes = await page.request.post('/api/trips', {
            headers: auth.headers,
            data: { trip: { id: tripId, name: 'Companions trip', country: 'Spain' } },
        });
        expect(createRes.status()).toBe(200);

        const updateRes = await page.request.post('/api/trips', {
            headers: auth.headers,
            data: {
                trip: {
                    id: tripId,
                    name: 'Companions trip',
                    country: 'Spain',
                    companions: [
                        { name: 'Maria' }, // unlinked
                        { name: 'Spoof', linkedUserId: spoofId }, // unverified → stripped
                        { name: 'Owner', linkedUserId: ownerId }, // verified member → survives
                    ],
                },
            },
        });
        expect(updateRes.status()).toBe(200);

        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const trip = (data.trips || []).find((t) => t.id === tripId);
        expect(trip).toBeTruthy();
        const companions = trip.companions || [];

        const maria = companions.find((c) => c.name === 'Maria');
        const spoof = companions.find((c) => c.name === 'Spoof');
        const owner = companions.find((c) => c.name === 'Owner');
        expect(maria).toBeTruthy();
        expect(spoof).toBeTruthy();
        expect(owner).toBeTruthy();

        // Unlinked stays unlinked (no linkedUserId leaked from elsewhere).
        expect(maria.linkedUserId).toBeFalsy();
        // Spoofed link to a non-member is stripped (R2 security fix).
        expect(spoof.linkedUserId).toBeFalsy();
        // Link to a verified trip member (the owner) round-trips verbatim.
        expect(owner.linkedUserId).toBe(ownerId);
    });
});

// ── UI-driven flows ─────────────────────────────────────────────────
test.describe('Critical flows — UI-driven', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('to-do list AI-tick checkbox toggles + persists to STATE', async ({ page }) => {
        // Regression for "to-do list tagging for AI not working".
        // The Todo page renders one checkbox per markedPlace; clicking
        // it calls toggleMarkedPlaceForAI, which mutates
        // `entry.forAI` deeply on the trip object then emits
        // state:changed. Pre-fix the React store's
        // useSyncExternalStore snapshot was `selector(STATE)` —
        // returning the same `STATE.trips` reference each render —
        // so React's Object.is check saw no change and skipped the
        // re-render. Visible bug: checkbox flips its underlying
        // data but doesn't update its rendered checked state.
        // Post-fix: store snapshot is a monotonic version counter
        // bumped on every emit, forcing re-render on every state
        // change regardless of selector identity.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-todo');
        // Seed a trip with one marked place (forManual:true so it
        // shows on the to-do list, forAI:false so we can flip it).
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Todo Test Trip',
            country: 'Spain',
        });
        // markedPlaces are trip-MEDIA: seed via the dedicated endpoint
        // (upsert_trip ignores media + /api/data won't ship it).
        const mediaRes = await page.request.post(`/api/trips/${tripId}/media`, {
            headers: auth.headers,
            data: {
                markedPlaces: [
                    {
                        placeId: 'p-1',
                        name: 'Test Place',
                        icon: '📍',
                        color: '#0071e3',
                        forManual: true,
                        forAI: false,
                    },
                ],
            },
        });
        expect(mediaRes.status()).toBe(200);
        await openFreshApp(page, userId);
        // Activate the seeded trip + re-boot so the boot-time pull fires
        // fetchTripMedia(activeTrip) and loads the marked place. (Media isn't
        // shipped by /api/data; selecting via the dropdown alone won't reload
        // it.) Mirrors the photo-spec setup.
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
        await page.goto('/');

        // Navigate to the to-do list.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'todo');

        // The seeded place renders one row with a checkbox. forAI
        // starts false → checkbox unchecked, count "0/1 ticked".
        const checkbox = page.locator('input.todo-ai-tick').first();
        await checkbox.waitFor({ state: 'visible', timeout: 5000 });
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator('text=0 of 1 marked for AI')).toBeVisible();

        // Click the checkbox: flips entry.forAI true, the React
        // store re-renders, the checkbox visually flips checked AND
        // the counter row updates to "1/1".
        await checkbox.click();
        await expect(checkbox).toBeChecked();
        await expect(page.locator('text=1 of 1 marked for AI')).toBeVisible();

        // Click again: flips back to false. Both the checkbox and
        // the counter must follow the underlying data — same shape
        // of bug would silently stick at the post-flip state if
        // the store re-render is broken.
        await checkbox.click();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator('text=0 of 1 marked for AI')).toBeVisible();
    });

    test('desktop sidebar rail is visible and clicks navigate to deep pages', async ({ page }) => {
        // Per-user request: an always-visible icon rail on the left
        // edge of the viewport at desktop sizes that bypasses the
        // burger drawer for the "deep" pages (Search, Collections,
        // Friends, Budgets, Settlement, Personalization, Settings,
        // Profile). The hamburger drawer still works as before; the
        // rail is a one-click shortcut, not a replacement.
        const userId = uniqueId('user');
        await getAuthForApi(page, userId);
        await openFreshApp(page, userId);

        // Sanity: the rail is rendered and visible at desktop width.
        const rail = page.locator('#sidebarRail');
        await expect(rail).toBeVisible();
        // Each rail item is reachable WITHOUT opening the burger
        // drawer first. Click Settings via the rail and assert
        // the URL hash flips. Use Playwright's normal .click() so
        // the browser's hit-test runs — same shape as the post-D6
        // sidebar regression test above.
        const railSettings = rail.locator('.sidebar-rail__item[data-page="settings"]');
        await railSettings.click({ timeout: 5000 });
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#settings');

        // Click Collections via the rail. (Personalization was folded into
        // Settings on 2026-05-14, so it's no longer a rail item.)
        const railCollections = rail.locator('.sidebar-rail__item[data-page="collections"]');
        await railCollections.click({ timeout: 5000 });
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#collections');

        // Click Friends via the rail.
        const railFriends = rail.locator('.sidebar-rail__item[data-page="friends"]');
        await railFriends.click({ timeout: 5000 });
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#friends');

        // Active-state highlight: the current page's rail item gets
        // .active. Verifies the router's nav-item-active sweep
        // covers the rail too.
        await expect(railFriends).toHaveClass(/active/);
    });

    test('rail Settings + Settlement items are clickable (no overlay intercept)', async ({ page }) => {
        // MK1 Wave D rewrite: the burger drawer + .sidebar this test
        // originally exercised were REMOVED in round 18 — navigation is
        // now the always-visible icon rail island (#sidebarRail, ≥721px
        // viewports). The regression class it guards is unchanged and
        // still worth guarding: an overlay/spacer stealing the browser
        // hit-test from a nav item. helpers.navigateTo uses el.click()
        // in the page context (bypasses hit-testing), so only a real
        // Playwright .click() catches that shape of bug.
        const userId = uniqueId('user');
        await getAuthForApi(page, userId);
        await openFreshApp(page, userId);

        // The rail is an always-visible island on desktop — no drawer
        // to open. Click Settings with hit-test enabled.
        await page.locator('#sidebarRail .sidebar-rail__item[data-page="settings"]:visible').click({ timeout: 5000 });
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#settings');

        // Settlement sits in a different rail group (its own dot
        // cluster) — same hit-test requirement.
        await page.locator('#sidebarRail .sidebar-rail__item[data-page="settlement"]:visible').click({ timeout: 5000 });
        await expect.poll(() => page.evaluate(() => location.hash)).toBe('#settlement');
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
        // trip name appears in the selector). pullFromServer
        // auto-sets activeTripId now (api.ts), so explicitly picking
        // the dropdown is no longer required — but keep the
        // selectOption as a defensive guard against the dev SQLite
        // carrying *another* trip from a previous run that auto-
        // selected first instead of our test's `Archive Flow`.
        await expect(page.locator('#tripSelector')).toContainText('Archive Flow', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // MK1 Wave D rewrite: the inline #completeTripBtn was removed
        // when desktop trip controls consolidated into the single "+"
        // button (#newTripBtn) that opens #tripControlsPopover
        // (commit 52fea5d1). Complete lives there as
        // #completeTripBtnSidebar, unhidden by updateTripSelector once
        // an active trip exists.
        await page.locator('#newTripBtn:visible').click({ timeout: 5000 });
        const completeBtn = page.locator('#completeTripBtnSidebar');
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
        // Seed WITH place data: initialPlace (modals/trip.ts) keys off
        // placeId/lat, and only a placed trip gets the documented
        // pure-rename path (edit mode keeps the existing destination;
        // Maps stubbed off wires NO fallback select for placed trips).
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Original Name',
            placeId: 'test-place-original',
            lat: 38.72,
            lng: -9.14,
            countryCode: 'PT',
        });
        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Original Name', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // Force the manual-fallback place picker (Google Maps not loaded
        // in test env) — same trick createTrip uses. (The old #sidebar
        // drawer cleanup is gone with the drawer itself — round 18.)
        await page.evaluate(() => {
            /** @type {any} */ (window).google = undefined;
        });

        // MK1 Wave D rewrite: the standalone #editTripBtn header button
        // was consolidated into the "+" trip-options popover
        // (#newTripBtn → #tripControlsPopover → #editTripBtnSidebar,
        // commit 52fea5d1). The modal it opens is unchanged.
        await page.locator('#newTripBtn:visible').click({ timeout: 5000 });
        const editBtn = page.locator('#editTripBtnSidebar');
        await editBtn.waitFor({ state: 'visible', timeout: 5000 });
        await editBtn.click();

        // Modal opens with the trip name in #editTripName. Change it.
        const nameInput = page.locator('#editTripName');
        await nameInput.waitFor({ state: 'visible', timeout: 5000 });
        await nameInput.fill('Renamed Trip');

        // Edit mode starts with submit ENABLED — _wirePlacePicker keeps the
        // trip's existing place as the picked place ("the user might only
        // want to rename"), and the submit handler allows a pure rename when
        // the destination is unchanged (modals.ts: `placeChanged` gate). So
        // we deliberately DON'T touch #editTripPlaceInput: with Maps stubbed
        // off the edit picker wires no free-text fallback, and if the Maps
        // script happens to race in, typing a new destination would null the
        // countryCode and re-disable submit — the old source of this test's
        // flake. Renaming via the name field alone is the deterministic path.
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

    test('appearance setting flips html data-theme between light and dark', async ({ page }) => {
        // Phase D2: Settings → General → Appearance sub-tab surfaces
        // a tri-state theme picker. Picking Dark sets <html
        // data-theme="dark">, picking Light removes the attribute,
        // picking System resolves via prefers-color-scheme.
        // Persistence + first-paint FOUC guard live in theme.ts +
        // the inline <head> script — this test covers the click-
        // through round-trip.
        const userId = uniqueId('user');
        await getAuthForApi(page, userId);
        await openFreshApp(page, userId);

        // Navigate to Settings → General → Appearance sub-tab.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'settings');
        // Settings is a menu of cards now; open the General Settings card,
        // then its Appearance sub-tab (role=tab). The old
        // .settings-tab-card[data-tab] / .general-subtab[data-general-sub]
        // selectors were dropped in the settings refactor.
        await page.locator('.management-card', { hasText: 'General Settings' }).click();
        await page.getByRole('tab', { name: 'Appearance' }).click();

        // The three options should render with System the default
        // active state (legacy snapshots without preferences.theme
        // default to 'system' in the theme manager).
        // Theme cards are label-identified now (the data-theme-value attr
        // was dropped in the settings refactor).
        const lightBtn = page.locator('.theme-option-card', { has: page.getByText('Light', { exact: true }) });
        const darkBtn = page.locator('.theme-option-card', { has: page.getByText('Dark', { exact: true }) });
        const systemBtn = page.locator('.theme-option-card', { has: page.getByText('System', { exact: true }) });
        await expect(lightBtn).toBeVisible();
        await expect(systemBtn).toHaveClass(/is-active/);

        // Pick Dark → <html> gets data-theme="dark", the dark option
        // card lights up.
        await darkBtn.click();
        await expect(darkBtn).toHaveClass(/is-active/);
        const themeAfterDark = await page.evaluate(() => document.documentElement.dataset.theme);
        expect(themeAfterDark).toBe('dark');

        // Pick Light → attribute removed (theme.ts deletes rather than
        // setting `="light"` so the default cascade stays clean).
        await lightBtn.click();
        await expect(lightBtn).toHaveClass(/is-active/);
        const themeAfterLight = await page.evaluate(() => document.documentElement.dataset.theme);
        expect(themeAfterLight).toBeFalsy();

        // Persistence: the choice lives in STATE.preferences.theme.
        // setTheme() emits state:changed synchronously, but the
        // localStorage write itself is DEBOUNCED 250ms (state.ts
        // saveState) — so wait past the debounce before reading, else
        // we'd see the pre-click snapshot (no theme key → undefined).
        await page.waitForTimeout(350);
        const persistedTheme = await page.evaluate(() => {
            const raw = localStorage.getItem('theGreatEscapeState');
            if (!raw) return null;
            const s = JSON.parse(raw);
            return (s.preferences || {}).theme;
        });
        expect(persistedTheme).toBe('light');
    });

    test('language picker switches navbar copy + persists to localStorage', async ({ page }) => {
        // Phase D6: Settings → General has three peer sub-tabs:
        // Map pills, Appearance, and (per user request) Language as
        // its own card. Picking pt rewrites STATE.preferences.locale
        // and emits state:changed; main.ts's paintI18nBindings
        // subscriber re-paints every `[data-i18n-key]` in the DOM.
        const userId = uniqueId('user');
        await getAuthForApi(page, userId);
        await openFreshApp(page, userId);

        // Sanity: navbar link starts as English ("Home").
        const homeLink = page.locator('.nav-links .nav-item[data-page="home"]');
        await expect(homeLink).toHaveText('Home');

        // Navigate to Settings → General → Language.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'settings');
        // Settings menu → General Settings card → Language sub-tab (role=tab).
        await page.locator('.management-card', { hasText: 'General Settings' }).click();
        await page.getByRole('tab', { name: 'Language' }).click();

        // Click Português; expect the navbar text to update without a
        // page reload (paintI18nBindings re-runs on state:changed).
        // Locale cards are label-identified now (no data-locale-value attr).
        const ptBtn = page.locator('.theme-option-card', { hasText: 'Português' });
        await ptBtn.waitFor({ state: 'visible', timeout: 5000 });
        await ptBtn.click();
        await expect(homeLink).toHaveText('Início');

        // Persistence: the choice lives in STATE.preferences.locale.
        // setLocale() emits state:changed, but the localStorage write is
        // DEBOUNCED 250ms (state.ts saveState) — wait past the debounce
        // before reading, else we'd see the pre-click snapshot (no locale
        // key → undefined).
        await page.waitForTimeout(350);
        const persistedLocale = await page.evaluate(() => {
            const raw = localStorage.getItem('theGreatEscapeState');
            if (!raw) return null;
            const s = JSON.parse(raw);
            return (s.preferences || {}).locale;
        });
        expect(persistedLocale).toBe('pt');

        // Switching back to English re-paints the original copy. The card
        // is label-identified by its native name span ('English'), which
        // stays constant regardless of the active locale (the data-locale-
        // value attr was dropped in the settings refactor).
        const enBtn = page.locator('.theme-option-card', { hasText: 'English' });
        await enBtn.click();
        await expect(homeLink).toHaveText('Home');
    });

    test('system theme follows prefers-color-scheme on boot (no FOUC)', async ({ browser }) => {
        // Verifies the inline <head> script in index.html sets
        // data-theme="dark" BEFORE first paint when (a) the user
        // preference is system OR unset, and (b) the OS reports
        // prefers-color-scheme: dark. The script reads localStorage
        // synchronously and applies the attribute before the bundle
        // even loads, so this test uses Playwright's colorScheme
        // override to simulate a dark-OS user opening the app fresh.
        const ctx = await browser.newContext({ colorScheme: 'dark' });
        const page = await ctx.newPage();
        try {
            // Fresh user who's never set a theme — should follow system
            // (which Playwright is reporting as dark in this context).
            await page.goto('/');
            const themeOnFirstPaint = await page.evaluate(() => document.documentElement.dataset.theme);
            expect(themeOnFirstPaint).toBe('dark');
        } finally {
            await ctx.close();
        }
    });

    test('expense receipt clip icon renders in History when receiptUrl is set', async ({ page }) => {
        // Receipts on expenses (post-Phase-C "small things" release —
        // sister feature to cover photo). Same test shape: skip the
        // upload UI (real image bytes + magic-number sniff = overkill
        // for a display-priority test), set receiptUrl directly via
        // /api/expenses, navigate to the History tab, assert the clip
        // icon button renders with the right data-receipt-url.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-receipt');
        const expId = uniqueId('exp-receipt');
        const receiptUrl = '/static/uploads/test-receipt.jpg';

        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Receipt Test Trip',
        });
        await page.request.post('/api/expenses', {
            headers: auth.headers,
            data: {
                expense: {
                    id: expId,
                    tripId,
                    who: 'Andres',
                    categoryId: 'c1',
                    label: 'Lunch',
                    date: '2026-06-01',
                    country: 'Portugal',
                    value: 25.5,
                    currency: 'EUR',
                    euroValue: 25.5,
                    splits: { Andres: 100 },
                    receiptUrl,
                },
            },
        });

        // Confirm round-trip via /api/data — proves the snake_case
        // → camelCase translation kicks in (routes/data.py:expenses
        // explicit `receipt_url → receiptUrl` mapping).
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const expense = (data.expenses || []).find((e) => e.id === expId);
        expect(expense).toBeTruthy();
        expect(expense.receiptUrl).toBe(receiptUrl);

        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Receipt Test Trip', {
            timeout: 5000,
        });
        await page.selectOption('#tripSelector', tripId);

        // Navigate to Expenses → History tab.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'expenses');
        await page.getByRole('tab', { name: 'History' }).click();

        // The history row renders a "View receipt" icon button ONLY when
        // receiptUrl is set (HistoryTab.tsx: `{e.receiptUrl ? <button…> }`).
        // The React refactor replaced the old `.expense-receipt-btn` +
        // `data-receipt-url` with a generic `icon-action-btn` whose URL is
        // wired into a window.open onClick — so we identify it by its
        // accessible name and assert presence. The exact URL round-trip is
        // already pinned above via /api/data (receipt_url → receiptUrl).
        const receiptBtn = page.getByRole('button', { name: 'View receipt' });
        await receiptBtn.waitFor({ state: 'visible', timeout: 5000 });
        await expect(receiptBtn).toHaveCount(1);
    });

    test('trip cover photo renders on the collections card', async ({ page }) => {
        // Trip cover photo (post-Phase-C feature). The Edit Trip modal
        // uploads via /api/upload and sets `trip.coverUrl`; this test
        // skips the upload UI (Playwright can drive setInputFiles but
        // the upload requires a valid image with magic-number bytes
        // matching the server-side allowlist — overkill for the
        // display-priority assertion this test cares about).
        // Instead we set coverUrl via /api/trips directly, then archive
        // the trip and assert the thumbnail renders on the Collections
        // list card.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-cover');
        const coverUrl = '/static/uploads/test-cover.jpg';

        // Create the trip with coverUrl set, then archive it via the
        // /archive endpoint so it lands on the Collections page.
        await page.request.post('/api/trips', {
            headers: auth.headers,
            data: {
                trip: {
                    id: tripId,
                    name: 'Cover Photo Trip',
                    country: 'Portugal',
                    coverUrl,
                },
            },
        });
        await page.request.post(`/api/trips/${tripId}/archive`, { headers: auth.headers });

        // Confirm the round-trip: /api/data returns the cover URL.
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        const data = await dataRes.json();
        const trip = (data.trips || []).find((t) => t.id === tripId);
        expect(trip).toBeTruthy();
        expect(trip.coverUrl).toBe(coverUrl);

        await openFreshApp(page, userId);
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'collections');
        // Collections defaults to the grouped "album" view
        // (groupBy='continent'), which renders fanned album stacks — the
        // flat per-trip `.archived-trip-card` rows only appear under
        // groupBy='none'. Switch to the flat list via the group-by select
        // (the only one with an `option[value="none"]`) so the individual
        // card + its cover thumb are directly assertable.
        await page
            .locator('select')
            .filter({ has: page.locator('option[value="none"]') })
            .selectOption('none');
        // The card thumbnail uses class="archived-card-cover" + the
        // src attribute carries the URL. Wait for the page to render
        // the archived card first.
        const card = page.locator('.archived-trip-card', { hasText: 'Cover Photo Trip' });
        await card.waitFor({ state: 'visible', timeout: 5000 });
        const thumb = card.locator('.archived-card-cover');
        await expect(thumb).toBeVisible();
        // MK1 Wave C: covers request the server-derived display variant
        // (?size=display appended by utils/mediaUrl.ts::sizedUploadUrl;
        // the server falls back to the original when no variant exists).
        await expect(thumb).toHaveAttribute('src', `${coverUrl}?size=display`);
    });

    test('search page finds trips, expenses, and days across active trips', async ({ page }) => {
        // Cross-trip search (post-Phase-C feature). One input, three
        // result groups (Trips / Days / Expenses), all filtered
        // client-side from STATE. Click-through navigates to the right
        // page with the right active trip set.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);

        // Two trips so we can prove cross-trip matching: the search for
        // "Lisbon" should find ONE trip (the Lisbon one) and ONE
        // expense (logged against the Tokyo trip but with country
        // "Lisbon" — tests the country field matcher).
        const lisbonTripId = uniqueId('trip-lisbon');
        const tokyoTripId = uniqueId('trip-tokyo');
        await createTripViaApi(page, auth.headers, {
            id: lisbonTripId,
            name: 'Lisbon Adventure',
            country: 'Portugal',
        });
        await createTripViaApi(page, auth.headers, {
            id: tokyoTripId,
            name: 'Tokyo Highlights',
            country: 'Japan',
        });

        // Add a day to Lisbon — its name carries the search term.
        await page.request.post('/api/days', {
            headers: auth.headers,
            data: {
                day: {
                    id: uniqueId('day'),
                    tripId: lisbonTripId,
                    dayNumber: 1,
                    name: 'Belém Tower walk',
                    date: '2026-06-01',
                    morning: 'Visit the historic Belém district',
                    afternoon: '',
                    evening: '',
                },
            },
        });

        // Add an expense on the Tokyo trip with country=Lisbon — proves
        // the search matches the expense's country field, not just
        // the parent trip's name.
        const expId = uniqueId('exp');
        await page.request.post('/api/expenses', {
            headers: auth.headers,
            data: {
                expense: {
                    id: expId,
                    tripId: tokyoTripId,
                    who: 'Andres',
                    categoryId: 'c1',
                    label: 'Pastéis de Lisboa',
                    date: '2026-06-02',
                    country: 'Portugal',
                    value: 12.5,
                    currency: 'EUR',
                    euroValue: 12.5,
                    splits: { Andres: 100 },
                },
            },
        });

        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Lisbon Adventure', {
            timeout: 5000,
        });

        // Navigate to Search via the navbar icon. data-page="search"
        // is on the search button next to the brand.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        // navigateTo() picks the right path per viewport: on mobile
        // the navbar's #navSearchBtn is visible (top banner); on
        // desktop it's hidden and the entry point lives in the
        // sidebar burger drawer (.sidebar-item[data-page="search"]).
        await navigateTo(page, 'search');
        await page.locator('#searchInput').waitFor({ state: 'visible', timeout: 5000 });

        // Empty state should show before typing.
        await expect(page.locator('text=Start typing to search.')).toBeVisible();

        // Type the query — note: matches BOTH the trip name and the
        // expense label, so we expect at least 1 trip + 1 expense
        // group rendered.
        await page.locator('#searchInput').fill('lisb');

        // Trips group: 1 hit (Lisbon Adventure). Days group: 1 hit
        // (Belém Tower walk's morning text mentions "Belém"). Expenses
        // group: 1 hit (Pastéis de Lisboa OR country=Portugal — the
        // label match drives this).
        await expect(page.locator('[data-search-group="trips"]')).toBeVisible();
        await expect(page.locator('[data-search-group="trips"] .search-result-row')).toContainText('Lisbon Adventure');
        await expect(page.locator('[data-search-group="expenses"]')).toBeVisible();
        await expect(page.locator('[data-search-group="expenses"] .search-result-row')).toContainText(
            'Pastéis de Lisboa'
        );

        // Click the trip result — should switch active trip to Lisbon
        // and navigate to home.
        await page
            .locator('[data-search-group="trips"] .search-result-row')
            .filter({ hasText: 'Lisbon Adventure' })
            .click();
        await expect(page).toHaveURL(/#home$/);
        // After navigation, the trip selector reflects the search-
        // selected trip rather than whatever was active before.
        await expect(page.locator('#tripSelector')).toHaveValue(lisbonTripId);
    });

    test('search page shows empty state when no results match', async ({ page }) => {
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip'),
            name: 'Some Trip',
            country: 'Spain',
        });
        await openFreshApp(page, userId);
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        // navigateTo() picks the right path per viewport: on mobile
        // the navbar's #navSearchBtn is visible (top banner); on
        // desktop it's hidden and the entry point lives in the
        // sidebar burger drawer (.sidebar-item[data-page="search"]).
        await navigateTo(page, 'search');
        await page.locator('#searchInput').waitFor({ state: 'visible', timeout: 5000 });

        // Query that won't match anything — proves the no-results
        // empty state renders + isn't a generic crash.
        await page.locator('#searchInput').fill('zzzzzzzz');
        await expect(page.locator('[data-testid="search-empty"]')).toBeVisible();
        await expect(page.locator('[data-testid="search-empty"]')).toContainText('zzzzzzzz');
    });

    test('expense form auto-suggests currency from country pick', async ({ page }) => {
        // Currency auto-suggest (post-Phase-C feature). Picking a country
        // in the expense form's country picker flips the currency
        // dropdown to that country's ISO 4217 code, but only when the
        // user hasn't already changed the currency themselves —
        // explicit picks always win.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = uniqueId('trip-currency-suggest');
        await createTripViaApi(page, auth.headers, {
            id: tripId,
            name: 'Currency Suggest Trip',
        });
        await openFreshApp(page, userId);
        await expect(page.locator('#tripSelector')).toContainText('Currency Suggest Trip', { timeout: 5000 });
        await page.selectOption('#tripSelector', tripId);

        // Navigate to the Expenses page (lives in the top nav,
        // .nav-item[data-page="expenses"]). The expenses page renders
        // the Manual Upload form by default (activeExpensesTab =
        // 'manual'), which is the form we need.
        await page.evaluate(() => {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        });
        await navigateTo(page, 'expenses');

        // Wait for the manual-tab country picker to be in the DOM —
        // setTimeout(mountTab, 0) inside renderExpenses defers the tab
        // mount one tick.
        const country = page.locator('#expCountry');
        const currency = page.locator('#expCurrency');
        await country.waitFor({ state: 'visible', timeout: 5000 });

        // ── Suggest path: pick Japan → currency flips to JPY. ──
        await country.click();
        await country.fill('Japan');
        await page.locator('#countryDropdownList .dropdown-item', { hasText: 'Japan' }).first().click();
        await expect(currency).toHaveValue('JPY');

        // ── Manual-pick wins: change currency to USD, then re-pick a
        // country (France, normally EUR). Currency should stay USD —
        // the change-flag prevents the suggest from overwriting an
        // explicit user choice.
        await currency.selectOption('USD');
        await country.click();
        // Clear typed text first; the input's filter would otherwise
        // hide the France row.
        await country.fill('');
        await country.fill('France');
        await page.locator('#countryDropdownList .dropdown-item', { hasText: 'France' }).first().click();
        await expect(currency).toHaveValue('USD');
    });
});

// Mobile-only flows. The "Critical flows — UI-driven" describe above
// skips on mobile because most of those tests target the trip-header
// + map setup that mobile compresses heavily; the cases below are
// genuinely mobile-only chrome (the burger-drawer paths the desktop
// inline navbar bypasses).
test.describe('Critical flows — UI-driven (mobile)', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name !== 'chromium-mobile') test.skip();
    });

    test('mobile trip-switcher opens the trip-controls popover with +New Trip, selector, actions', async ({ page }) => {
        // The trip controls (+New Trip, selector, complete + delete) live
        // in a popover (#tripControlsPopover). On mobile the navbar compass
        // (#tripControlsBtn) was REMOVED (2026-05-21, per user request:
        // "shouldn't be a button in the top banner at all" — it's now
        // display:none !important ≤720px). The trigger is the in-content
        // circular-arrow #mobileTripSwitcherBtn beside the trip name
        // (TripBody.tsx), wired to the SAME popover via the delegated
        // click handler in nav-chrome.ts. The switcher only renders when a
        // trip is active, so seed + activate one first.
        const userId = uniqueId('user');
        const auth = await getAuthForApi(page, userId);
        const tripId = await createTripViaApi(page, auth.headers, {
            id: uniqueId('trip-mobile'),
            name: 'Switcher Trip',
            country: 'Portugal',
        });
        await openFreshApp(page, userId);
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
        await page.goto('/');

        const switcher = page.locator('#mobileTripSwitcherBtn');
        const popover = page.locator('#tripControlsPopover');
        await switcher.waitFor({ state: 'visible', timeout: 8000 });
        await expect(popover).toBeHidden();

        // Open the popover.
        await switcher.click({ timeout: 5000 });
        await expect(popover).toBeVisible();

        // The relocated controls all live inside the popover with the same
        // IDs the burger-drawer block used — so the dual-instance mirroring
        // (#tripSelector ↔ #tripSelectorSidebar) and the existing JS
        // handlers keep working without any wiring-layer change.
        await expect(popover.locator('#newTripBtnSidebar')).toBeVisible();
        await expect(popover.locator('#tripSelectorSidebar')).toBeVisible();

        // Click outside closes the popover (nav-chrome.ts outside-click
        // handler: not the switcher + not inside the popover → hide).
        await page.locator('main#app-container').click({ position: { x: 50, y: 400 } });
        await expect(popover).toBeHidden();
    });
});
