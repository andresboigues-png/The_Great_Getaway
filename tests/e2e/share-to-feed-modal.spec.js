// @ts-check
// Share-to-feed modal — render + consent-warning + caption mechanics.
//
// Written alongside MK1 Wave M (the modal moved onto the openReactModal
// bridge). Deliberately scoped to the modal itself — the downstream
// feed POST/like/comment mechanics belong to a future feed journey.
// What must stay true here:
//   - the trip-header Share button opens the modal;
//   - a PRIVATE trip shows the BUG-14 consent note ("sharing makes it
//     public") — the informed-choice fix an earlier audit landed;
//   - the caption counter tracks typing against the 280 limit;
//   - Cancel closes without posting anything (server feed stays empty).

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const USER_ID = `test-share-${RUN}`;
const TRIP_ID = `test-trip-share-${RUN}`;

test('share modal: consent note on private trips, live counter, cancel posts nothing', async ({ page }) => {
    const auth = await getAuthForApi(page, USER_ID);
    await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'Share Trip' });
    await openTripWithMedia(page, USER_ID, TRIP_ID);

    // The Share button lives in the trip header (HomeHeader) and opens
    // the CHOOSER first (share to feed vs. get share link) — the
    // caption modal is behind the "Share to feed" option.
    await page.getByRole('button', { name: /share/i }).first().click({ timeout: 10000 });
    await expect(page.locator('.modal-overlay [role="dialog"]').last()).toContainText('Choose how you want to share');
    await page.getByText('Share to feed', { exact: true }).click();
    // The chooser closes and the caption modal replaces it.
    const dialog = page.locator('.modal-overlay [role="dialog"]').last();
    await expect(dialog).toContainText('Share to your feed');
    await expect(dialog).toContainText('Share Trip');

    // Fresh API-seeded trips are PRIVATE → the BUG-14 consent note must
    // render (role=note with the make-public warning).
    await expect(dialog.locator('[role="note"]')).toBeVisible();

    // Caption counter tracks typing; the textarea autofocuses (the
    // bridge's flushSync-before-microtask contract again).
    const textarea = dialog.locator('#shareCaptionInput');
    await expect(textarea).toBeFocused();
    await expect(dialog.locator('#shareCaptionCount')).toHaveText('0/280');
    await textarea.fill('Anyone been to Lisbon in spring?');
    await expect(dialog.locator('#shareCaptionCount')).toHaveText('32/280');

    // Cancel closes; nothing was posted — the user's feed stays empty
    // AND the trip stays private (the consent flip only happens on an
    // actual share).
    await dialog.locator('#shareModalCancel').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    const feedRes = await page.request.get('/api/feed', { headers: auth.headers });
    if (feedRes.ok()) {
        const feed = await feedRes.json();
        const posts = Array.isArray(feed) ? feed : feed.posts || [];
        expect(posts.filter((p) => p.tripId === TRIP_ID)).toHaveLength(0);
    }
    const dataRes = await page.request.get('/api/data', { headers: auth.headers });
    const data = await dataRes.json();
    const trip = (data.trips || []).find((tr) => tr.id === TRIP_ID);
    expect(trip.isPublic).toBeFalsy();
});
