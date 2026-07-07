// @ts-check
// Editable day-detail modal — the regression net for its React conversion.
//
// pages/home/dayDetailModal.ts (imperative, ~1.4k lines) is the next modal
// slated for the openReactModal bridge. This spec pins the CONTRACTS the
// implementation promises — persistence paths, state transitions, server
// truth — through selectors a faithful conversion must preserve (ids,
// data-attrs, aria state, i18n copy). It deliberately complements (does
// NOT duplicate) flows.spec.js:741, which already covers the AM/PM/Eve
// tab strip swapping visible content.
//
// The write paths under test (each is a distinct contract):
//   • Plan slots  → upsertDay → POST /api/days, debounced 700ms
//     (dayDetailModal.ts queueSave: `setTimeout(..., 700)`), surfaced in
//     /api/data's tripDays[].plan.{morning,afternoon,evening}.
//   • Checklist / photos / marked places → upsertTrip's R12-B4 dual
//     write, whose MEDIA half (persistTripMedia → POST /api/trips/<id>/
//     media) is the ONLY path that may carry them (R12 invariant) — so
//     every server-side assert here reads GET /api/trips/<id>/media,
//     exactly like the app's cold-load does.
//   • Drawer tabs → pure view state (`data-open` on .day-detail-drawer),
//     the real-user mobile bug fixed in 704b438b.
//
// NOT covered here, by design:
//   • The anchor (dayNumber === 0) variant. Post-Wave-1 the Trip Hub tab
//     replaced the anchor Path card, and its hub actions open the trip
//     checklist / documents / photos MODALS — nothing in the current UI
//     calls openDayDetail with the anchor day, and the module isn't
//     exposed on window, so the gold-chip/quick-links branch is
//     unreachable dead-ish code. Finding recorded for the conversion:
//     porting it is optional until an entry point returns.
//   • Read-only gate (relaxer → openDayView): day-view-readonly.spec.js.
//   • Checklist CRUD via the Trip Hub modal: trip-checklist.spec.js.

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

// Unique per worker (each project runs its own worker against the shared
// per-run throwaway DB). `test-` prefix required by the test login.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const USER_ID = `test-daydetail-${RUN}`;
const TRIP_ID = `test-trip-daydetail-${RUN}`;
const DAY_ID = `test-day-daydetail-${RUN}`;
const DAY_NAME = 'Baixa wander day';
const PLACE_ID = `test-place-daydetail-${RUN}`;
const PLACE_NAME = 'Mercado da Ribeira';
const MORNING_TEXT = 'Pastéis at the Manteigaria counter';
const EVENING_TEXT = 'Fado dinner in Chiado';
const CHECK_ITEM_1 = `chk-1-${RUN}`;
const CHECK_ITEM_2 = `chk-2-${RUN}`;

// 1×1 RGBA PNG (70 bytes) — passes the upload route's magic-number sniff
// AND PIL's EXIF-strip re-encode (verified against this repo's Pillow).
// Fabricated in-test rather than committed as a fixture because — unlike
// photo-exif.spec.js — nothing here depends on real EXIF payloads.
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

/** Open THE day's editable modal from the Path tab. Same dance as
 *  day-view-readonly.spec.js: the plan tab's data-tab is 'days', and the
 *  day card's option stack starts COLLAPSED (per-day localStorage pref,
 *  empty on a fresh boot) — expand via the collapse toggle so the
 *  "Open full plan" button (.day-detail-btn) renders, then click it.
 *  @param {import('@playwright/test').Page} page */
async function openDayModal(page) {
    await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
    const detailBtn = page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`);
    if (!(await detailBtn.isVisible().catch(() => false))) {
        await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
    }
    await detailBtn.click({ timeout: 10000 });
    const dialog = page.locator('.modal-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();
    return dialog;
}

/** Arm a wait for the debounced plan autosave landing (upsertDay →
 *  POST /api/days). Always arm BEFORE the triggering keystroke — the
 *  700ms debounce means the response can land any time after.
 *  @param {import('@playwright/test').Page} page */
const armDaysPost = (page) =>
    page.waitForResponse((r) => r.url().includes('/api/days') && r.request().method() === 'POST', {
        timeout: 10000,
    });

/** Arm a wait for the media half of upsertTrip's dual write (checklist /
 *  photos / markedPlaces all persist through THIS, never /api/trips).
 *  Fire-and-forget client-side, so server-truth asserts must await the
 *  write LANDING, not the optimistic repaint.
 *  @param {import('@playwright/test').Page} page */
const armMediaPost = (page) =>
    page.waitForResponse((r) => r.url().includes(`/api/trips/${TRIP_ID}/media`) && r.request().method() === 'POST', {
        timeout: 10000,
    });

/** Server truth for everything on the media path.
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers */
async function serverMedia(page, headers) {
    const res = await page.request.get(`/api/trips/${TRIP_ID}/media`, { headers });
    expect(res.ok()).toBe(true);
    return await res.json();
}

test.describe('Day-detail modal (editable)', () => {
    test.describe.configure({ mode: 'serial' });

    test('plan autosave: 700ms debounce → POST /api/days, per-slot persistence, status transitions', async ({
        page,
    }) => {
        // ── Seed everything the serial suite shares. Trip + one numbered
        // day via the same endpoints the UI drives; checklist + shortlist
        // via the DEDICATED media endpoint (the only sanctioned seed path
        // for those fields — createTripViaApi's media passthrough rides
        // /api/trips, which the server ignores for media by design).
        const auth = await getAuthForApi(page, USER_ID);
        await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'DayDetail Trip' });
        const dayRes = await page.request.post('/api/days', {
            headers: auth.headers,
            data: {
                day: {
                    id: DAY_ID,
                    tripId: TRIP_ID,
                    dayNumber: 1,
                    name: DAY_NAME,
                    date: '2026-08-10',
                    plan: { morning: '', afternoon: '', evening: '' },
                },
            },
        });
        expect(dayRes.ok(), `day seed failed: ${dayRes.status()}`).toBe(true);
        const mediaRes = await page.request.post(`/api/trips/${TRIP_ID}/media`, {
            headers: auth.headers,
            data: {
                checklist: [
                    { id: CHECK_ITEM_1, body: 'Pack sunscreen', done: false },
                    { id: CHECK_ITEM_2, body: 'Book Sintra train', done: false },
                ],
                // forManual is what the modal's shortlist section filters by;
                // dayId/timeOfDay null = not yet slotted (test 4 slots it).
                markedPlaces: [
                    {
                        placeId: PLACE_ID,
                        name: PLACE_NAME,
                        address: 'Av. 24 de Julho, Lisboa',
                        icon: '🍽️',
                        color: '#ff9500',
                        forManual: true,
                        forAI: true,
                        dayId: null,
                        timeOfDay: null,
                        preferredHour: null,
                    },
                ],
            },
        });
        expect(mediaRes.ok(), `media seed failed: ${mediaRes.status()}`).toBe(true);

        await openTripWithMedia(page, USER_ID, TRIP_ID);
        const dialog = await openDayModal(page);

        // Header contract: "Day N" chip + the day name as the title.
        await expect(dialog).toContainText('Day 1');
        await expect(dialog.locator('.day-detail-header__title')).toHaveText(DAY_NAME);

        // Idle status = the standing autosave promise (i18n statusAuto).
        const status = dialog.locator('#autosaveStatus');
        await expect(status).toHaveText('Changes save automatically');

        // ── Morning slot. Arm the POST BEFORE typing — the 700ms debounce
        // (queueSave) fires it whenever it pleases after the keystroke.
        let posted = armDaysPost(page);
        // Notes are read-only by default now — tap Edit to reveal the block
        // editor, then type into its first (default, empty) text block.
        await dialog.locator('.day-plan-pane[data-plan-pane="morning"] .plan-readonly__edit').click();
        const morningTa = dialog.locator('.day-plan-pane[data-plan-pane="morning"] textarea.plan-block__text').first();
        await morningTa.fill(MORNING_TEXT);
        // Status leaves idle immediately ('Editing…'), then walks
        // Editing… → Saving… → Saved ✓. The intermediate states are
        // sub-second windows on a local server, so accept any of the
        // three here and pin the TERMINAL state exactly below.
        await expect(status).toHaveText(/Editing…|Saving…|Saved ✓/);
        expect((await posted).ok()).toBe(true);
        await expect(status).toHaveText('Saved ✓');

        // The per-tab count chip tracks non-empty plan lines live (one
        // line typed → "1"). Conversion must keep this glance-preview.
        await expect(dialog.locator('[data-plan-tab-count="morning"]')).toHaveText('1');

        // ── Evening slot persists INDEPENDENTLY through the same day row.
        const eveningTab = dialog.locator('button[data-plan-tab="evening"]');
        await eveningTab.click();
        await expect(eveningTab).toHaveAttribute('aria-selected', 'true');
        posted = armDaysPost(page);
        await dialog.locator('.day-plan-pane[data-plan-pane="evening"] .plan-readonly__edit').click();
        await dialog
            .locator('.day-plan-pane[data-plan-pane="evening"] textarea.plan-block__text')
            .first()
            .fill(EVENING_TEXT);
        expect((await posted).ok()).toBe(true);

        // 'Saved ✓' decays back to the idle promise after 1400ms so the
        // badge never lies about "nothing pending".
        await expect(status).toHaveText('Changes save automatically');

        // ── Server truth: /api/data ships tripDays with the plan object
        // (routes/data.py packs morning/afternoon/evening into day.plan).
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        expect(dataRes.ok()).toBe(true);
        const day = ((await dataRes.json()).tripDays || []).find((d) => d.id === DAY_ID);
        expect(day, 'seeded day missing from /api/data').toBeTruthy();
        expect(day.plan.morning).toBe(MORNING_TEXT);
        expect(day.plan.evening).toBe(EVENING_TEXT);
        expect(day.plan.afternoon).toBe('');
    });

    test('fresh boot re-renders the saved plan; inline checklist toggle persists via the media path', async ({
        page,
    }) => {
        const auth = await getAuthForApi(page, USER_ID);
        // Cold boot → /api/data hydrates tripDays from the server; the
        // modal rendering test 1's text proves durable rows, not an
        // optimistic echo lingering in the previous page's STATE.
        await openTripWithMedia(page, USER_ID, TRIP_ID);
        const dialog = await openDayModal(page);
        // Cold boot renders the saved plan READ-ONLY (the block editor stays
        // collapsed until Edit). Both slots' read-only renders live in the
        // DOM (only .is-active is visible), so textContent asserts the
        // durable plan regardless of which tab is active — proving the
        // saved rows re-hydrated from the server, not an optimistic echo.
        await expect(dialog.locator('.day-plan-pane[data-plan-pane="morning"] .plan-blocks-ro')).toContainText(
            MORNING_TEXT
        );
        await expect(dialog.locator('.day-plan-pane[data-plan-pane="evening"] .plan-blocks-ro')).toContainText(
            EVENING_TEXT
        );

        // ── Checklist lives in the bookmark drawer (numbered days only —
        // the panel renders inside .day-detail-drawer__view[data-view=
        // "checklist"]). Open its tab, toggle, and assert BOTH the summary
        // chip repaint and the server flip.
        await dialog.locator('.day-detail-drawer__tab[data-drawer="checklist"]').click();
        const summary = dialog.locator('.day-checklist-summary');
        await expect(summary).toHaveText('2 of 2 left'); // i18n checklistRemaining

        const toggle = dialog.locator(`.day-checklist-toggle[data-item-id="${CHECK_ITEM_1}"]`);
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        // The toggle's persist is upsertTrip's media dual-write — arm the
        // media POST before the click (fire-and-forget client-side).
        const posted = armMediaPost(page);
        await toggle.click();
        expect((await posted).ok()).toBe(true);
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(summary).toHaveText('1 of 2 left');

        // Server truth through the SAME endpoint cold-load reads.
        const media = await serverMedia(page, auth.headers);
        const item1 = media.checklist.find((i) => i.id === CHECK_ITEM_1);
        const item2 = media.checklist.find((i) => i.id === CHECK_ITEM_2);
        expect(item1.done).toBe(true);
        expect(item2.done).toBe(false);
    });

    test('day photo upload auto-tags the day and rides the media path; remove deletes server-side', async ({
        page,
    }) => {
        const auth = await getAuthForApi(page, USER_ID);
        await openTripWithMedia(page, USER_ID, TRIP_ID);
        const dialog = await openDayModal(page);

        // Photos are another drawer bookmark; open it so the thumb (and
        // the empty-state copy) are actually visible, like a real user.
        await dialog.locator('.day-detail-drawer__tab[data-drawer="photos"]').click();
        await expect(dialog.locator('#dayPhotoItems')).toContainText('No photos for this day yet.');

        // Drive the hidden file input directly (the visible
        // [data-media-add="photos-file"] button just proxies a .click()
        // to it — setInputFiles is the deterministic equivalent). The
        // change handler uploads (POST /api/upload), appends via
        // addTripPhoto with dayId = THIS day (the auto-tag promise),
        // then persists via upsertTrip → media POST. Arm both.
        const uploaded = page.waitForResponse(
            (r) => r.url().includes('/api/upload') && r.request().method() === 'POST',
            { timeout: 10000 }
        );
        const posted = armMediaPost(page);
        await dialog.locator('#dayPhotoFileInput').setInputFiles({
            name: 'day-photo.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
        });
        expect((await uploaded).ok()).toBe(true);
        expect((await posted).ok()).toBe(true);

        // Optimistic repaint: one thumb with a remove affordance.
        const thumb = dialog.locator('#dayPhotoItems .day-media__thumb');
        await expect(thumb).toHaveCount(1);

        // Server truth: photos[] carries the day tag.
        let media = await serverMedia(page, auth.headers);
        expect(media.photos).toHaveLength(1);
        expect(media.photos[0].dayId).toBe(DAY_ID);
        expect(media.photos[0].src).toContain('/static/uploads/');

        // ── Remove via the modal's ✕ — same dual-write, arm again.
        const removed = armMediaPost(page);
        await thumb.locator('.day-media__remove[data-remove-photo]').click();
        expect((await removed).ok()).toBe(true);
        await expect(dialog.locator('#dayPhotoItems')).toContainText('No photos for this day yet.');
        media = await serverMedia(page, auth.headers);
        expect(media.photos).toHaveLength(0);
    });

    test('shortlist add-to-slot assigns the place to this day+slot, renders its card, and toggles back off', async ({
        page,
    }) => {
        const auth = await getAuthForApi(page, USER_ID);
        await openTripWithMedia(page, USER_ID, TRIP_ID);
        const dialog = await openDayModal(page);

        // "From your to-do list" section: count chip + one row per
        // forManual marked place.
        await expect(dialog.locator('.day-shortlist-count')).toHaveText('1');
        const row = dialog.locator(`.day-shortlist-row[data-place-id="${PLACE_ID}"]`);
        await expect(row).toBeVisible();

        // ── Add to Afternoon. The click ASSIGNS the place to this day +
        // coarse slot (setMarkedPlaceAssignment — dayId + timeOfDay on
        // the markedPlaces entry, which rides the MEDIA write path), then
        // switches the plan tab to the slot so the new card is on-screen.
        const pmBtn = row.locator(`.day-shortlist-add-btn[data-time="afternoon"]`);
        await expect(pmBtn).toHaveAttribute('aria-pressed', 'false');
        let posted = armMediaPost(page);
        await pmBtn.click();
        expect((await posted).ok()).toBe(true);

        // The afternoon pane is now active and hosts the place card
        // (same representation AI-planned places get).
        await expect(dialog.locator('button[data-plan-tab="afternoon"]')).toHaveAttribute('aria-selected', 'true');
        // Scope to the read-only render (.plan-blocks-ro): the block editor
        // also mounts the card in the DOM, so an unscoped locator would
        // resolve to two elements and trip Playwright's strict mode.
        const card = dialog.locator(
            `.day-plan-pane[data-plan-pane="afternoon"] .plan-blocks-ro .day-plan-place-wrap[data-place-id="${PLACE_ID}"]`
        );
        await expect(card).toBeVisible();
        await expect(card).toContainText(PLACE_NAME);
        // The slot button reflects membership: aria-pressed + ✓-prefixed
        // localized label (refreshShortlistButtons).
        await expect(pmBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(pmBtn).toHaveText(/^✓ /);

        // Server truth: the assignment persisted on the markedPlaces entry.
        let media = await serverMedia(page, auth.headers);
        let place = media.markedPlaces.find((p) => p.placeId === PLACE_ID);
        expect(place.dayId).toBe(DAY_ID);
        expect(place.timeOfDay).toBe('afternoon');

        // ── Same button is a TOGGLE: second click un-slots (dayId/
        // timeOfDay back to null), card disappears, place stays in the
        // shortlist pool. Leaves the seed in its pristine state.
        posted = armMediaPost(page);
        await pmBtn.click();
        expect((await posted).ok()).toBe(true);
        await expect(card).toHaveCount(0);
        await expect(pmBtn).toHaveAttribute('aria-pressed', 'false');
        media = await serverMedia(page, auth.headers);
        place = media.markedPlaces.find((p) => p.placeId === PLACE_ID);
        expect(place.dayId).toBeNull();
        expect(place.timeOfDay).toBeNull();
    });

    test('mobile drawer tabs: opening one closes the other; data-open mirrors aria state', async ({
        page,
        isMobile,
    }) => {
        // The 704b438b regression was mobile-specific (the drawer renders
        // as a 2×2 accordion under the plan on ≤720px) — pin it there.
        test.skip(!isMobile, 'drawer-accordion layout bug was mobile-only (704b438b)');

        await openTripWithMedia(page, USER_ID, TRIP_ID);
        const dialog = await openDayModal(page);
        const drawer = dialog.locator('.day-detail-drawer');
        const notesTab = drawer.locator('.day-detail-drawer__tab[data-drawer="notes"]');
        const checklistTab = drawer.locator('.day-detail-drawer__tab[data-drawer="checklist"]');
        const notesView = drawer.locator('.day-detail-drawer__view[data-view="notes"]');
        const checklistView = drawer.locator('.day-detail-drawer__view[data-view="checklist"]');

        // Collapsed by default — the plan owns the sheet until asked.
        await expect(drawer).toHaveAttribute('data-open', '');
        await expect(notesView).toBeHidden();

        // Open Notes: data-open names the panel; the tab carries BOTH
        // aria-pressed and aria-expanded (the a11y contract).
        await notesTab.click();
        await expect(drawer).toHaveAttribute('data-open', 'notes');
        await expect(notesTab).toHaveAttribute('aria-pressed', 'true');
        await expect(notesTab).toHaveAttribute('aria-expanded', 'true');
        await expect(notesView).toBeVisible();
        await expect(dialog.locator('#detailNotes')).toBeVisible();

        // Switching to Checklist CLOSES Notes — exactly one panel open.
        await checklistTab.click();
        await expect(drawer).toHaveAttribute('data-open', 'checklist');
        await expect(checklistView).toBeVisible();
        await expect(notesView).toBeHidden();
        await expect(notesTab).toHaveAttribute('aria-pressed', 'false');
        await expect(notesTab).toHaveAttribute('aria-expanded', 'false');

        // Re-clicking the open tab collapses the drawer entirely.
        await checklistTab.click();
        await expect(drawer).toHaveAttribute('data-open', '');
        await expect(checklistView).toBeHidden();
        await expect(checklistTab).toHaveAttribute('aria-pressed', 'false');
    });
});
