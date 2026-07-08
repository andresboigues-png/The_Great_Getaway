// @ts-check
import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi, createTripViaApi } from './helpers.js';

test('feed card exposes data-post-id anchor for deep-link + highlight class works (E6)', async ({ page }) => {
    const U = `test-e6-${Date.now()}`;
    const auth = await getAuthForApi(page, U);
    const T = `trip-e6-${Date.now()}`;
    await createTripViaApi(page, auth.headers, { id: T, name: 'E6 Trip', country: 'Portugal' });
    // Share the trip to the feed (creates a feed_post row).
    const shareRes = await page.request.post('/api/feed/share', { headers: auth.headers, data: { trip_id: T } });
    console.log('SHARE_STATUS', shareRes.status());
    const feedRaw = await (await page.request.get('/api/feed', { headers: auth.headers })).json();
    const events = Array.isArray(feedRaw) ? feedRaw : feedRaw.events;
    const ev = (events || []).find((e) => e.post_id);
    console.log('POST_ID', ev && ev.post_id);
    expect(ev, 'a shared feed event with a post_id should exist').toBeTruthy();

    await openFreshApp(page, U);
    await page.evaluate(() => {
        location.hash = 'feed';
    });
    await page.waitForTimeout(1800);

    // The card must carry the data-post-id anchor the highlight queries.
    const res = await page.evaluate((pid) => {
        const el = document.querySelector(`[data-post-id="${pid}"]`);
        if (!el) return { found: false };
        // Prove the highlight class the Feed effect adds is honoured by CSS.
        el.classList.add('feed-card-highlight');
        const outline = getComputedStyle(el).outlineStyle;
        return { found: true, outline };
    }, String(ev.post_id));
    console.log('ANCHOR', JSON.stringify(res));
    expect(res.found).toBe(true);
    expect(res.outline).toBe('solid');
});
