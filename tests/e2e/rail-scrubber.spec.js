// @ts-check
// Mobile "roulette" nav rail (bootstrap/railScrubber.ts). On a phone the
// rail is a SHORT 3-icon window; the icons form a reel spun by swiping the
// rail or dragging the right-edge line. Spinning only MOVES the selection
// (focus ring) — it does NOT navigate. Committing takes a deliberate TAP:
// a simple tap on the line commits whatever's centred, or a direct tap on
// an icon commits it; either way the reel closes. The spin FEEL needs a
// real device; the structural contract (line shows on mobile, reel scrolls,
// scroll≠navigate, tap→navigate+close) is what's guarded here.

import { test, expect } from '@playwright/test';
import { openFreshApp } from './helpers.js';

let _n = 0;
const uniqueId = (p) => `test-${p}-${Date.now()}-${(_n += 1)}`;

test.describe('Rail reel', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Mobile-only (≤720px + rail open); on desktop the rail is the full
        // static list and the line never shows.
        if (testInfo.project.name !== 'chromium-mobile') test.skip();
    });

    test('the open rail is a short spinnable reel with a focused centre icon', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));

        const line = page.locator('.rail-scrubber');
        await expect(line).toBeAttached();
        await expect(line).not.toHaveClass(/is-shown/);

        await page.locator('#railPeek').click();
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);
        await expect(line).toHaveClass(/is-shown/, { timeout: 3000 });

        // Short window: content taller than the box (so it's a reel).
        const scrollable = await page.locator('#sidebarRail').evaluate((el) => el.scrollHeight > el.clientHeight + 10);
        expect(scrollable).toBeTruthy();

        // Exactly one icon sits in the focused centre slot.
        await expect(page.locator('#sidebarRail .sidebar-rail__item.is-focus')).toHaveCount(1, {
            timeout: 2000,
        });
    });

    /** Open the reel and drag the line so `insights` is the centred icon.
     *  Returns the line's bounding box for the follow-up tap. */
    async function openAndCentreInsights(page) {
        await page.locator('#railPeek').click();
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);
        const line = page.locator('.rail-scrubber');
        await expect(line).toHaveClass(/is-shown/, { timeout: 3000 });

        // The line maps to the reel's scroll: compute the exact fraction that
        // centres Insights (robust to the coloured-dot spacing between icons).
        const frac = await page.locator('#sidebarRail').evaluate((rail) => {
            const items = [...rail.querySelectorAll('.sidebar-rail__item')];
            const ins = items.find((e) => e.getAttribute('data-page') === 'insights');
            if (!ins) return -1;
            const max = rail.scrollHeight - rail.clientHeight;
            const target = ins.offsetTop - (rail.clientHeight - ins.offsetHeight) / 2;
            return Math.max(0, Math.min(1, target / max));
        });
        expect(frac).toBeGreaterThan(0);

        const box = await line.boundingBox();
        expect(box).toBeTruthy();
        const x = box.x + box.width / 2;
        const startY = box.y + 4;
        const targetY = box.y + frac * box.height;

        // A real drag (well past TAP_SLOP) — this is a scrub, not a tap.
        await page.mouse.move(x, startY);
        await page.mouse.down();
        await page.mouse.move(x, (startY + targetY) / 2);
        await page.mouse.move(x, targetY);
        await page.mouse.up();

        // Insights is now the centred/focused icon.
        await expect(page.locator('#sidebarRail .sidebar-rail__item[data-page="insights"]')).toHaveClass(/is-focus/, {
            timeout: 2000,
        });
        return box;
    }

    test('scrubbing the line MOVES the selection but does NOT navigate', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        await openAndCentreInsights(page);

        // Scrolling/scrubbing alone must never navigate, and the reel stays
        // open waiting for a deliberate commit.
        await page.waitForTimeout(300); // past the old 150ms auto-settle window
        expect(await page.evaluate(() => location.hash)).not.toContain('insights');
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);
    });

    test('a simple tap on the line commits the centred icon + closes the reel', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        const box = await openAndCentreInsights(page);

        // A tap (down+up, no travel) on the line commits whatever's centred —
        // it must NOT reposition the reel to the tapped Y.
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

        await expect.poll(() => page.evaluate(() => location.hash)).toContain('insights');
        await expect(page.locator('#sidebarRail')).not.toHaveClass(/is-open/);
    });

    test('a direct tap on an icon commits it + closes the reel', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        await openAndCentreInsights(page);

        // Tap the centred icon itself — the delegated [data-page] handler
        // navigates and the reel collapses on selection.
        await page.locator('#sidebarRail .sidebar-rail__item[data-page="insights"]').click();

        await expect.poll(() => page.evaluate(() => location.hash)).toContain('insights');
        await expect(page.locator('#sidebarRail')).not.toHaveClass(/is-open/);
    });
});
