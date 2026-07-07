// @ts-check
// Friends page network tabs (pages/friends/Friends.tsx). A "friend" is a
// mutual follow. Contract: a friend belongs in BOTH the Followers and
// Following tabs (they follow you AND you follow them), not only the Friends
// tab — so becoming friends must NOT make someone vanish from the other two.

import { test, expect } from '@playwright/test';
import { openFreshApp, getAuthForApi } from './helpers.js';

let _n = 0;
const uid = (p) => `test-${p}-${Date.now()}-${(_n += 1)}`;

test('a friend (mutual follow) shows in Followers, Following AND Friends tabs', async ({ page }) => {
    const A = uid('fnet-a');
    const B = uid('fnet-b');
    // page.request shares ONE session cookie, and the follow is attributed to
    // the logged-in caller — so re-auth right before each follow so the cookie
    // matches the follower (else it self-follows the last-authed user).
    await getAuthForApi(page, B); // create B
    const authA = await getAuthForApi(page, A);
    expect((await page.request.post(`/api/follows/${B}`, { headers: authA.headers })).ok()).toBe(true);
    const authB = await getAuthForApi(page, B);
    expect((await page.request.post(`/api/follows/${A}`, { headers: authB.headers })).ok()).toBe(true);

    // Browse as A; open the Friends page (hash nav works on both viewports —
    // the mobile rail is a collapsed reel).
    await openFreshApp(page, A);
    await page.evaluate(() => {
        location.hash = 'friends';
    });

    const tabs = page.locator('.network-tabnav__tab');
    await expect(tabs).toHaveCount(3, { timeout: 10000 });
    const friendRow = page.locator(`[data-user-id="${B}"]`);

    // Tabs render in order: Followers, Following, Friends. The friend B must
    // appear in every one — including Followers + Following, not just Friends.
    for (const i of [0, 1, 2]) {
        await tabs.nth(i).click();
        await expect(friendRow).toBeVisible({ timeout: 10000 });
    }

    // The Followers + Following counts include the friend (match the profile
    // totals), so each tab's badge reads at least 1.
    for (const i of [0, 1, 2]) {
        await expect(tabs.nth(i).locator('.network-tabnav__count')).toHaveText(/[1-9]/);
    }
});
