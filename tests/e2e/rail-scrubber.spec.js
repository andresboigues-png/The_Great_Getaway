// @ts-check
// Mobile "roulette" nav rail (bootstrap/railScrubber.ts). On a phone the
// rail is a SHORT 3-icon window; the icons form a reel spun by swiping the
// rail or dragging the right-edge line, and it navigates to whatever icon
// it settles on. The spin FEEL needs a real device; the structural
// contract (line shows on mobile, reel scrolls, spin→settle→navigate) is
// what's guarded here.

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

    test('dragging the line to an icon spins the reel + navigates on settle', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        await page.locator('#railPeek').click();
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);
        const line = page.locator('.rail-scrubber');
        await expect(line).toHaveClass(/is-shown/, { timeout: 3000 });

        // The line maps linearly to the reel: fraction i/(N-1) centres item i.
        // Items: templates, collections, friends, budgets, insights(4), … so
        // dragging to 4/(N-1) settles on Insights.
        const N = await page.locator('#sidebarRail .sidebar-rail__item').count();
        const idx = await page
            .locator('#sidebarRail .sidebar-rail__item')
            .evaluateAll((els) => els.findIndex((e) => e.getAttribute('data-page') === 'insights'));
        expect(idx).toBeGreaterThan(0);

        const box = await line.boundingBox();
        expect(box).toBeTruthy();
        const x = box.x + box.width / 2;
        const startY = box.y + 4;
        const targetY = box.y + (idx / (N - 1)) * box.height;

        await page.mouse.move(x, startY);
        await page.mouse.down();
        await page.mouse.move(x, (startY + targetY) / 2);
        await page.mouse.move(x, targetY);
        await page.mouse.up();

        await expect.poll(() => page.evaluate(() => location.hash)).toContain('insights');
        await expect(page.locator('#sidebarRail')).not.toHaveClass(/is-open/);
    });
});
