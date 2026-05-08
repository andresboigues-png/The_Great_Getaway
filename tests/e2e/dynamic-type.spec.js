// @ts-check
// D3 — dynamic-type regression gate.
//
// macOS / iOS users can scale text up via System Settings → Display →
// Larger Text (or the Dock zoom keyboard shortcut). This test bumps the
// root font-size to 200% and verifies that the app's main pages don't
// produce horizontal scrollbars (which would mean a layout broke and
// pushed content past the viewport).
//
// CSS is already 100% rem-based for type sizes (B3 token discipline +
// audit), so most of the work is already done — this gate exists to
// catch a future regression where someone hard-codes a px font-size or
// builds a fixed-px-wide column that doesn't scale.
//
// Why 200%, not 150%? WCAG SC 1.4.4 calls for "200% without loss of
// content or functionality"; that's the max users can crank in real-
// world settings panels. If the layout holds at 200% it holds at every
// step below.

import { test, expect } from '@playwright/test';
import { openFreshApp } from './helpers.js';

/**
 * Pages worth checking. Skipping settlement / collections / search /
 * friends / ai / etc. for now — the gate is here to catch *new* px-
 * based regressions, not audit every inline-style page-by-page. The
 * core surfaces below cover the navbar, sidebar, the dense expense
 * form, the chart-heavy insights view, the modal-heavy home page,
 * and the bottom-tab nav.
 */
const PAGES = [
    ['#home', 'home'],
    ['#expenses', 'expenses'],
    ['#insights', 'insights'],
    ['#feed', 'feed'],
    ['#profile', 'profile'],
    ['#settings', 'settings'],
];

test.describe('Dynamic Type — 200% scale gate', () => {
    for (const [hash, label] of PAGES) {
        test(`${label} has no horizontal overflow at 200% root font-size`, async ({ page }) => {
            await openFreshApp(page);
            await page.evaluate((h) => {
                location.hash = h;
            }, hash);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(700);

            // Bump root font-size to 200%. Default is browser-default
            // (16px); 200% = 32px. Every rem in the app doubles.
            await page.evaluate(() => {
                document.documentElement.style.fontSize = '200%';
            });
            // Give the layout one frame to settle.
            await page.waitForTimeout(300);

            // Horizontal overflow check. The viewport width is what
            // playwright.config.js sets per project (1280 desktop /
            // 375 mobile). Allow 1px slack for sub-pixel rounding.
            const overflow = await page.evaluate(() => {
                const docEl = document.documentElement;
                const body = document.body;
                return {
                    scrollW: Math.max(docEl.scrollWidth, body.scrollWidth),
                    clientW: docEl.clientWidth,
                };
            });
            const slack = 2;
            // Print on failure so we know which page broke.
            if (overflow.scrollW > overflow.clientW + slack) {
                console.log(`[${label}] overflow: scrollW=${overflow.scrollW}, clientW=${overflow.clientW}`);
            }
            expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + slack);
        });
    }
});
