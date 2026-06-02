// @ts-check
// Photo lightbox gallery e2e (FIXING_ROADMAP §4.9 — coverage gap fill).
//
// The lightbox + swipe gallery was shipped earlier in §4.9 with zero
// test coverage. This file pins the user-facing flow in a real browser:
// open the photos modal, click a thumbnail, navigate the gallery with
// chevrons + keyboard, confirm the counter chip + close paths work.
//
// Why no pytest coverage instead: the lightbox is pure DOM behaviour
// (Playwright owns the contract). The pytest suite covers the data
// path (photos_json round-trip via /api/trips upsert + /api/data read)
// already; this adds the rendering + interaction contract on top.
//
// Drag-to-reorder + EXIF-auto-day-assign are intentionally NOT covered
// here:
//   - Drag-to-reorder uses raw pointer events with element capture, a
//     known-difficult-to-simulate pattern in Playwright. Out of scope
//     for this slice; the §4.9 implementation has been live + visible
//     to manual QA for several sessions.
//   - EXIF auto-day-assign needs a real JPEG fixture with embedded
//     DateTimeOriginal — a binary in the repo. Worth doing in its own
//     follow-up slice; the unit-level path (src/exif.ts) is bounded
//     enough that we'd want a Python-side fixture-generation step too.

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi } from './helpers.js';

// Same uniqueId pattern as flows.spec.js + share-public.spec.js — the
// dev server's SQLite persists across runs, so per-test unique IDs
// prevent stale-row collisions.
let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    // `test-` prefix required: test-mode login rejects non-test- user_ids.
    return `test-${prefix}-${Date.now()}-${_idCounter}`;
}

// Same-origin photo URLs that always resolve. The icons set
// (frontend/static/icons/) shipped with §4.10 and lands at predictable
// URLs — no external network dependency, no fixture binaries to ship.
const PHOTO_A = '/static/icons/icon-180.png';
const PHOTO_B = '/static/icons/icon-192.png';
const PHOTO_C = '/static/icons/icon-512.png';

/** Seed a trip + its anchor day + a photo set. Returns the trip id
 *  so the test can navigate to it. The anchor day is required for
 *  the Path component to render the `📸 Photos` button (the button
 *  only appears on `isAnchor` days per pathTab.ts).
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers
 *  @param {string[]} photoSrcs
 */
async function seedTripWithPhotos(page, headers, photoSrcs) {
    const tripId = await createTripViaApi(page, headers, {
        id: uniqueId('trip'),
        name: 'Lightbox e2e trip',
        country: 'Portugal',
        // photos is a JSON-serialized array of {id, src, dayId}.
        // dayId is set below after we create the anchor day.
        // For now, leave dayId out — Anchor-bucket photos are fine.
        photos: photoSrcs.map((src, i) => ({
            id: `photo-lb-${Date.now()}-${i}`,
            src,
        })),
    });
    // Anchor day — required for the Path component to expose the
    // Photos button. dayNumber=0 is the Anchor convention.
    await page.request.post('/api/days', {
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
    return tripId;
}

test.describe('Photo lightbox gallery (§4.9)', () => {
    // Lightbox behaviour is viewport-agnostic — same DOM, same key
    // handlers, same swipe gesture path. Desktop-only keeps the suite
    // fast; the mobile-bottom-nav doesn't affect modal rendering.
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('clicking a photo opens the lightbox with the right image + counter', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B, PHOTO_C]);

        // openFreshApp re-uses the seed token + boots into Home.
        await openFreshApp(page, auth.user.id);
        // Sometimes the dev DB has leftover trips from prior runs; set
        // the active trip explicitly so the Path component shows OUR
        // seeded trip rather than whatever was active for this user
        // previously. Drives the trip-selector dropdown that exists at
        // both navbar + sidebar (whichever is visible at this viewport).
        await page.evaluate((id) => {
            // @ts-ignore — STATE is on window in dev/test (state.ts)
            window.STATE = window.STATE || {};
            // The state-loader hydrates from localStorage on boot; mutate
            // there too so a router-triggered re-render picks it up.
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

        // The Path tab is the default landing on a trip; click the
        // 📸 Photos button. It lives on the Anchor day's options stack.
        const photosBtn = page.locator('.path-photos-btn').first();
        await photosBtn.waitFor({ state: 'visible', timeout: 8000 });
        await photosBtn.click();

        // Modal opens with the photo grid. 3 photos seeded → 3 image cards.
        const cards = page.locator('.trip-photo-card[data-photo-kind="image"]');
        await expect(cards).toHaveCount(3);

        // Click the FIRST card → lightbox opens. The image src in the
        // lightbox should match PHOTO_A (the first in the array).
        await cards.first().click();
        const lbImg = page.locator('#lbImg');
        await expect(lbImg).toBeVisible();
        const firstImgSrc = await lbImg.getAttribute('src');
        expect(firstImgSrc).toContain('icon-180.png');

        // Counter chip shows "1 / 3".
        await expect(page.locator('#lbCounter')).toContainText('1 / 3');
    });

    test('next/prev chevrons + counter cycle through the gallery', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B, PHOTO_C]);
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
        await page.locator('.path-photos-btn').first().click();
        await page.locator('.trip-photo-card[data-photo-kind="image"]').first().click();

        // Start: counter is 1/3, prev hidden, next visible.
        await expect(page.locator('#lbCounter')).toContainText('1 / 3');
        await expect(page.locator('#lbPrev')).toBeHidden();
        await expect(page.locator('#lbNext')).toBeVisible();

        // Next → 2/3, both chevrons visible.
        await page.locator('#lbNext').click();
        await expect(page.locator('#lbCounter')).toContainText('2 / 3');
        await expect(page.locator('#lbImg')).toHaveAttribute('src', /icon-192\.png/);
        await expect(page.locator('#lbPrev')).toBeVisible();
        await expect(page.locator('#lbNext')).toBeVisible();

        // Next → 3/3, next hidden (last photo), prev visible.
        await page.locator('#lbNext').click();
        await expect(page.locator('#lbCounter')).toContainText('3 / 3');
        await expect(page.locator('#lbImg')).toHaveAttribute('src', /icon-512\.png/);
        await expect(page.locator('#lbNext')).toBeHidden();
        await expect(page.locator('#lbPrev')).toBeVisible();

        // Prev twice → back to 1/3, prev hidden again.
        await page.locator('#lbPrev').click();
        await expect(page.locator('#lbCounter')).toContainText('2 / 3');
        await page.locator('#lbPrev').click();
        await expect(page.locator('#lbCounter')).toContainText('1 / 3');
        await expect(page.locator('#lbPrev')).toBeHidden();
    });

    test('keyboard ArrowRight/ArrowLeft navigates, Escape closes', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B, PHOTO_C]);
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
        await page.locator('.path-photos-btn').first().click();
        await page.locator('.trip-photo-card[data-photo-kind="image"]').first().click();

        await expect(page.locator('#lbCounter')).toContainText('1 / 3');

        // ArrowRight → 2/3
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#lbCounter')).toContainText('2 / 3');

        // ArrowRight → 3/3
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#lbCounter')).toContainText('3 / 3');

        // ArrowLeft → 2/3 (back)
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('#lbCounter')).toContainText('2 / 3');

        // Escape closes — the lightbox image is removed from the DOM.
        await page.keyboard.press('Escape');
        await expect(page.locator('#lbImg')).toHaveCount(0);
    });

    test('explicit close button + backdrop click both dismiss the lightbox', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await seedTripWithPhotos(page, auth.headers, [PHOTO_A, PHOTO_B]);
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
        await page.locator('.path-photos-btn').first().click();
        await page.locator('.trip-photo-card[data-photo-kind="image"]').first().click();
        await expect(page.locator('#lbImg')).toBeVisible();

        // ✕ button closes.
        await page.locator('#lbClose').click();
        await expect(page.locator('#lbImg')).toHaveCount(0);

        // Re-open and test backdrop click. Click on the modal-overlay
        // area OUTSIDE the image — the lightbox uses click delegation
        // that ignores image-area clicks (to prevent stray taps during
        // swipe from killing the modal) but closes on any other hit.
        await page.locator('.trip-photo-card[data-photo-kind="image"]').first().click();
        await expect(page.locator('#lbImg')).toBeVisible();
        // Two `.modal-overlay` elements are present at this point —
        // the photos-grid modal underneath, and the lightbox on top.
        // `.last()` picks the most-recently-opened (the lightbox),
        // which is what we want to click the backdrop of.
        await page
            .locator('.modal-overlay')
            .last()
            .click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#lbImg')).toHaveCount(0);
    });

    test('single-photo trip shows no nav controls but still opens cleanly', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        const tripId = await seedTripWithPhotos(page, auth.headers, [PHOTO_A]);
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
        await page.locator('.path-photos-btn').first().click();
        await page.locator('.trip-photo-card[data-photo-kind="image"]').first().click();

        // Image opens, but the gallery chrome (counter + chevrons)
        // is suppressed for single-photo case — the lightbox falls
        // through to the simple "click anywhere to dismiss" path.
        await expect(page.locator('#lbImg')).toBeVisible();
        await expect(page.locator('#lbCounter')).toHaveCount(0);
        await expect(page.locator('#lbPrev')).toHaveCount(0);
        await expect(page.locator('#lbNext')).toHaveCount(0);

        // Close button is still there (always present per lightbox.ts
        // — guaranteed dismiss affordance even if other paths break).
        await expect(page.locator('#lbClose')).toBeVisible();
    });
});
