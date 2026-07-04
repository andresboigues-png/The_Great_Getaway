// @ts-check
// "Pin a day on a place" modal — the Maps-unavailable fallback.
//
// Written alongside MK1 Wave M (the modal moved onto the openReactModal
// bridge). The e2e server has no Google Maps key, so the deterministic
// branch here is the fallback the modal promises: a pin needs real
// coordinates (free text is useless), so without Places the input must
// DISABLE and point the user at the manual map-drop instead of
// pretending to accept a search. The happy Places path needs a live
// Google session and stays manual/visual territory.

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const USER_ID = `test-pinplace-${RUN}`;
const TRIP_ID = `test-trip-pinplace-${RUN}`;
const DAY_ID = `test-day-pinplace-${RUN}`;

test('pin-by-place modal disables its input when Maps is unavailable', async ({ page }) => {
    // Force the fallback deterministically: block the Maps SDK script
    // so whenGoogleMapsReady() rejects on its 10s timeout... which is
    // too slow for the 15s test budget — so ALSO stub the timeout by
    // blocking BEFORE boot and letting the modal's catch-path fire.
    // (Blocking makes `google` undefined; whenGoogleMapsReady polls and
    // rejects after timeoutMs. 10s reject + asserts fits inside a
    // test.slow() budget of 45s.)
    test.slow();
    await page.route('**maps.googleapis.com**', (route) => route.abort());
    const auth = await getAuthForApi(page, USER_ID);
    await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'PinPlace Trip' });
    const dayRes = await page.request.post('/api/days', {
        headers: auth.headers,
        data: { day: { id: DAY_ID, tripId: TRIP_ID, dayNumber: 1, name: 'Pin day', date: '2026-08-02' } },
    });
    expect(dayRes.ok()).toBe(true);

    await openTripWithMedia(page, USER_ID, TRIP_ID);
    await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
    // Owner (editable trip) → full option stack, but it starts
    // collapsed (same dance as day-view-readonly.spec.js).
    const placeBtn = page.locator(`.day-pin-place-btn[data-day-id="${DAY_ID}"]`);
    if (!(await placeBtn.isVisible().catch(() => false))) {
        await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
    }
    await placeBtn.click({ timeout: 10000 });

    const dialog = page.locator('.modal-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();
    // No Maps in the e2e env → the REQUIRED-Places contract kicks in:
    // input disabled + the "use the manual drop" placeholder.
    const input = dialog.locator('#dayPinPlaceInput');
    // whenGoogleMapsReady rejects after its 10s poll timeout → the
    // catch path disables the input.
    await expect(input).toBeDisabled({ timeout: 15000 });
    await expect(input).toHaveAttribute('placeholder', /manual|unavailable/i);
    // Cancel closes through the bridge.
    await dialog.locator('#dayPinPlaceCancel').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
});
