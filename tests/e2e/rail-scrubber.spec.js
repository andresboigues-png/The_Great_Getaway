// @ts-check
// Rail scrubber — the right-edge thumb-reach nav aid (bootstrap/
// railScrubber.ts). The haptics + drag FEEL can only be judged on a real
// device, but the structural contract is testable: the line shows only on
// a phone-width viewport with the rail open, and dragging it to an icon's
// vertical position navigates to that page. This guards the mapping +
// navigation so a refactor can't silently break the feature.

import { test, expect } from '@playwright/test';
import { openFreshApp } from './helpers.js';

let _n = 0;
const uniqueId = (p) => `test-${p}-${Date.now()}-${(_n += 1)}`;

test.describe('Rail scrubber', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // The scrubber line is mobile-only (≤720px + rail open). On the
        // desktop project the rail is permanent and the line never shows,
        // so this journey is meaningful on the mobile project.
        if (testInfo.project.name !== 'chromium-mobile') test.skip();
    });

    test('line appears when the rail opens on mobile, and a drag navigates', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));

        const line = page.locator('.rail-scrubber');
        // Hidden while the rail island is closed.
        await expect(line).toBeAttached();
        await expect(line).not.toHaveClass(/is-shown/);

        // Open the rail via its left-edge peek handle.
        await page.locator('#railPeek').click();
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);
        await expect(line).toHaveClass(/is-shown/, { timeout: 3000 });
        await expect(line).toBeVisible();

        // Drag from the top of the line down to the Insights icon's vertical
        // centre and release → should navigate to Insights. Uses real mouse
        // events (Chromium synthesises pointer events from them).
        const lineBox = await line.boundingBox();
        const insightsItem = page.locator('#sidebarRail .sidebar-rail__item[data-page="insights"]');
        const itemBox = await insightsItem.boundingBox();
        expect(lineBox && itemBox).toBeTruthy();
        const startX = lineBox.x + lineBox.width / 2;
        const startY = lineBox.y + 6;
        const targetY = itemBox.y + itemBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Step the move so pointermove fires and the selector tracks.
        await page.mouse.move(startX, (startY + targetY) / 2);
        await page.mouse.move(startX, targetY);
        // The glass selector should be visible on the rail mid-drag.
        await expect(page.locator('.rail-selector')).toHaveClass(/is-visible/);
        await page.mouse.up();

        // Landed on Insights (hash-routed) and the rail closed.
        await expect.poll(() => page.evaluate(() => location.hash)).toContain('insights');
        await expect(page.locator('#sidebarRail')).not.toHaveClass(/is-open/);
    });

    test('a normal rail tap flashes the selector', async ({ page }) => {
        await openFreshApp(page, uniqueId('user'));
        await page.locator('#railPeek').click();
        await expect(page.locator('#sidebarRail')).toHaveClass(/is-open/);

        // Tapping an item shows the glass selector (then it fades). Assert it
        // becomes visible right after the tap.
        await page.locator('#sidebarRail .sidebar-rail__item[data-page="budgets"]').click();
        await expect(page.locator('.rail-selector')).toHaveClass(/is-visible/);
    });
});
