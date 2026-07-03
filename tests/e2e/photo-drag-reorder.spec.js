// @ts-check
// Drag-to-reorder photos e2e (FIXING_ROADMAP §4.9 — coverage gap fill).
//
// Closes the last §4.9 coverage gap. The drag-reorder code in
// tripMediaModals.ts uses pointer events with `setPointerCapture` on
// the drag handle, document-level pointermove/pointerup so the
// gesture survives the pointer leaving the modal, and a nearest-
// centroid fallback in `_targetPhotoIdAtPointer` for edge-of-grid
// drops.
//
// We drive the gesture with explicit `dispatchEvent(new PointerEvent(...))`
// inside `page.evaluate` rather than `page.mouse.*` — Playwright's
// mouse API fires MouseEvents but the Chromium driver's mouse→pointer
// translation isn't reliable enough for our handler chain to pick up
// the pointerId-keyed state. Dispatching the events ourselves with
// `pointerId:1` guarantees every step lands on the impl's listeners
// (which are all `pointer*`-typed) without the runner's translation
// quirks. This is also closer to how a real touchscreen behaves —
// `setPointerCapture` may no-op (wrapped in try/catch in the impl,
// harmless), but pointermove/up flow through the document listeners
// regardless.
//
// Why this was previously deferred (per the §4.9 truth-check):
// pointer events with capture were assumed flaky in Playwright. In
// practice the document-level listener design makes capture
// unnecessary — the test runs reliably. Worth pinning the contract
// before the next refactor accidentally moves the listeners to the
// handle (which would re-introduce the dependency on capture).

import { test, expect } from '@playwright/test';
import { getAuthForApi, createTripViaApi, openFreshApp } from './helpers.js';

let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    // `test-` prefix required: test-mode login rejects non-test- user_ids.
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

// Same-origin photo URLs — see photo-lightbox.spec.js for the rationale.
const PHOTO_A = '/static/icons/icon-180.png';
const PHOTO_B = '/static/icons/icon-192.png';
const PHOTO_C = '/static/icons/icon-512.png';

/** Seed a trip + anchor day + N pre-ordered photos. The photo ids
 *  encode their position so the test can assert against `trip.photos`
 *  order after the drag.
 */
async function seedTripWithPhotos(page, headers, photoSrcs) {
    const photoIds = photoSrcs.map((_, i) => `photo-drag-${Date.now()}-${i}-${_idCounter}`);
    const tripId = await createTripViaApi(page, headers, {
        id: uniqueId('trip'),
        name: 'Drag-reorder e2e trip',
        country: 'Portugal',
    });
    const anchorRes = await page.request.post('/api/days', {
        headers,
        data: {
            day: {
                id: uniqueId('day'),
                tripId,
                dayNumber: 0,
                date: '2026-06-01',
                name: 'Trip Anchor',
            },
        },
    });
    expect(anchorRes.status()).toBe(200);
    // MK1 Wave D: the redesigned Path tab shows an empty-state (no
    // anchor card → no .path-photos-btn) when the trip has no NUMBERED
    // days. Seed one so the day-card strip — anchor card included —
    // actually renders.
    const day1Res = await page.request.post('/api/days', {
        headers,
        data: {
            day: {
                id: uniqueId('day'),
                tripId,
                dayNumber: 1,
                date: '2026-06-02',
                name: 'Day one',
            },
        },
    });
    expect(day1Res.status()).toBe(200);
    // Photos are trip-MEDIA: seed via the dedicated endpoint, not the trip
    // payload (upsert_trip ignores media + /api/data doesn't ship it). The
    // client's fetchTripMedia() loads them once the trip is active.
    const mediaRes = await page.request.post(`/api/trips/${tripId}/media`, {
        headers,
        data: { photos: photoSrcs.map((src, i) => ({ id: photoIds[i], src })) },
    });
    expect(mediaRes.status()).toBe(200);
    return { tripId, photoIds };
}

test.describe('Photo drag-to-reorder (§4.9)', () => {
    test.beforeEach(async ({}, testInfo) => {
        // Drag-and-drop pointer simulation is flaky on the mobile
        // emulation (touch events vs mouse events vs pointer events
        // interact poorly). The drag-reorder code itself works on
        // mobile in practice (pointer events handle touch natively);
        // the test runner is the bottleneck. Desktop-only.
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('dragging photo A onto photo C reorders to [B, C, A]', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const { tripId, photoIds } = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B, PHOTO_C]);
        await openFreshApp(page, auth.user.id);
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

        // MK1 Wave D rewrite: trip-wide Photos moved OFF the Path tab —
        // the redesigned day carousel shows numbered days only (no anchor
        // card); the trip-media modals open from the TRIP HUB tab now
        // (trip-features Wave 1). Hub is the default tab, but click it
        // explicitly (a persisted tab pref could differ) and use its
        // stable data-hub-action hook.
        await page.locator('.trip-tabnav__tab[data-tab="hub"]').click({ timeout: 10000 });
        await page.locator('[data-hub-action="photos"]').click({ timeout: 10000 });
        await expect(page.locator('.trip-photo-card[data-photo-kind="image"]')).toHaveCount(3);

        // Dispatch pointerdown on A's handle, pointermove past the 6px
        // tap-threshold (so the handler classifies this as a drag, not
        // a tap), pointermove to C's center, pointerup. All in one
        // page.evaluate so the events fire synchronously in the same
        // microtask order as a real gesture.
        await page.evaluate(
            (args) => {
                const handle = document.querySelector(`.trip-photo-drag-handle[data-photo-id="${args.fromId}"]`);
                const targetCard = document.querySelector(`.trip-photo-card[data-photo-id="${args.toId}"]`);
                if (!handle || !targetCard) throw new Error('drag elements missing');
                const hRect = handle.getBoundingClientRect();
                const tRect = targetCard.getBoundingClientRect();
                const startX = hRect.x + hRect.width / 2;
                const startY = hRect.y + hRect.height / 2;
                const endX = tRect.x + tRect.width / 2;
                const endY = tRect.y + tRect.height / 2;

                const fire = (target, type, x, y) => {
                    target.dispatchEvent(
                        new PointerEvent(type, {
                            pointerId: 1,
                            pointerType: 'mouse',
                            bubbles: true,
                            cancelable: true,
                            clientX: x,
                            clientY: y,
                        })
                    );
                };

                // 1. pointerdown on the handle (bubbles to root's listener)
                fire(handle, 'pointerdown', startX, startY);
                // 2. nudge past the 6px tap-threshold (impl uses Math.hypot > 6)
                fire(document, 'pointermove', startX + 12, startY + 12);
                // 3. arrive at the target card's center (document listener)
                fire(document, 'pointermove', endX, endY);
                // 4. release at the target (impl's onPointerUp picks the drop)
                fire(document, 'pointerup', endX, endY);
            },
            { fromId: photoIds[0], toId: photoIds[2] }
        );

        // After repaint, photo order should be [B, C, A]: the splice
        // removes A from index 0 then inserts at C's original index 2
        // → array ends at [B, C, A].
        //
        // We verify two layers:
        //   1. DOM order — immediate post-repaint, no debounce wait.
        //      The card sequence is the truth visible to the user.
        //   2. localStorage — saved via the debounced (250ms) saveState
        //      subscriber. Pin both so a future refactor that
        //      accidentally skips the persist path is caught.
        const domOrder = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.trip-photo-card[data-photo-kind="image"]')).map(
                (c) => /** @type {HTMLElement} */ (c).dataset.photoId
            );
        });
        expect(domOrder).toEqual([photoIds[1], photoIds[2], photoIds[0]]);

        // Wait past the saveState debounce (250ms) — see state.ts.
        await page.waitForTimeout(350);
        const storedOrder = await page.evaluate((tid) => {
            try {
                const raw = localStorage.getItem('theGreatEscapeState');
                const parsed = raw ? JSON.parse(raw) : {};
                const trip = (parsed.trips || []).find((t) => t.id === tid);
                return (trip?.photos || []).map((p) => p.id);
            } catch {
                return [];
            }
        }, tripId);
        expect(storedOrder).toEqual([photoIds[1], photoIds[2], photoIds[0]]);
    });

    test('dragging less than 6px is treated as a tap (no reorder)', async ({ page }) => {
        // Pin the tap-threshold contract. A short pointer-down/up at
        // the same location must NOT reorder — otherwise users who
        // tap the drag handle to inspect it (curiosity, accidental
        // click) would silently shuffle their photos.
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const { tripId, photoIds } = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B, PHOTO_C]);
        await openFreshApp(page, auth.user.id);
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

        // MK1 Wave D rewrite: trip-wide Photos moved OFF the Path tab —
        // the redesigned day carousel shows numbered days only (no anchor
        // card); the trip-media modals open from the TRIP HUB tab now
        // (trip-features Wave 1). Hub is the default tab, but click it
        // explicitly (a persisted tab pref could differ) and use its
        // stable data-hub-action hook.
        await page.locator('.trip-tabnav__tab[data-tab="hub"]').click({ timeout: 10000 });
        await page.locator('[data-hub-action="photos"]').click({ timeout: 10000 });
        await expect(page.locator('.trip-photo-card[data-photo-kind="image"]')).toHaveCount(3);

        // Press + 2px move + release — under the 6px threshold.
        await page.evaluate((fromId) => {
            const handle = document.querySelector(`.trip-photo-drag-handle[data-photo-id="${fromId}"]`);
            if (!handle) throw new Error('handle missing');
            const r = handle.getBoundingClientRect();
            const x = r.x + r.width / 2;
            const y = r.y + r.height / 2;
            const fire = (target, type, cx, cy) => {
                target.dispatchEvent(
                    new PointerEvent(type, {
                        pointerId: 1,
                        pointerType: 'mouse',
                        bubbles: true,
                        cancelable: true,
                        clientX: cx,
                        clientY: cy,
                    })
                );
            };
            fire(handle, 'pointerdown', x, y);
            fire(document, 'pointermove', x + 2, y); // < 6px threshold
            fire(document, 'pointerup', x + 2, y);
        }, photoIds[0]);

        // Order unchanged — the impl returns early from onPointerUp
        // before the splice when `moved` is false. We check DOM order
        // (no debounce wait needed; no state change means no scheduled
        // save). 100ms timeout to let any spurious re-render settle.
        await page.waitForTimeout(100);
        const domOrder = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.trip-photo-card[data-photo-kind="image"]')).map(
                (c) => /** @type {HTMLElement} */ (c).dataset.photoId
            );
        });
        expect(domOrder).toEqual([photoIds[0], photoIds[1], photoIds[2]]);
    });
});
