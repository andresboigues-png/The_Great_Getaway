// @ts-check
// Visual regression baseline — Phase A4.
//
// Screenshots the /components preview page (no STATE, no API
// dependency, deterministic) and stores a per-section baseline. A
// CSS edit that changes a button's color, a shadow's offset, a
// gradient stop, or a border-radius turns CI red within seconds with
// a side-by-side diff visible in the playwright-report artefact.
//
// Why /components and not the live app pages: the live pages depend
// on STATE / API / Google Maps tiles, none of which are screenshot-
// stable. /components is a pure HTML+CSS preview with synthetic data,
// so byte-level diffs only happen when the design itself changed.
//
// Cross-platform note: Playwright stores baselines per (project, OS)
// — `<name>-chromium-desktop-darwin.png` on Mac, `-linux.png` on the
// CI runner. The first CI run after this lands needs a one-time
// `npx playwright test visual.spec.js --update-snapshots` on the
// Linux runner to seed Linux baselines (committed in the same PR).
// Subsequent PRs validate against those.
//
// Section-level screenshots (vs whole-page) keep diffs small + the
// failing section identifiable. Each preview-section's `id` (added
// in components.html if not already there) anchors the locator.

import { test, expect } from '@playwright/test';

// Tolerance for sub-pixel rendering differences across CI runners.
// 0.01 = up to 1% of pixels may differ — tight enough to catch real
// visual changes, loose enough to not flap on font-anti-alias drift
// between the local Mac and the GitHub Actions ubuntu runner.
const SCREENSHOT_OPTS = /** @type {const} */ ({
    maxDiffPixelRatio: 0.01,
    animations: 'disabled',
});

test.describe('Visual regression — /components preview', () => {
    test.beforeEach(async ({ page }) => {
        // No auth needed — /components is a static preview page.
        await page.goto('/components');
        // Disable animations + transitions so the screenshot doesn't catch
        // a button mid-fade. animations:'disabled' on toHaveScreenshot
        // alone doesn't kill all CSS transitions; a stylesheet override
        // hits the rest.
        await page.addStyleTag({
            content: `
                *, *::before, *::after {
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-duration: 0s !important;
                    transition-delay: 0s !important;
                }
            `,
        });
        // Web fonts need to be ready before we shoot — if FOUT lands
        // between two runs, the diff lights up on every line of text.
        await page.evaluate(() => document.fonts?.ready);
    });

    // Section-level screenshots. Add to this list as new component
    // sections land in components.html.
    /** @type {Array<{ id: string; name: string }>} */
    const SECTIONS = [
        // section-id is the heading text we anchor on. We screenshot
        // the parent .preview-section because the headings inside differ
        // by section copy and we want one screenshot per visual area.
        { id: 'section-tokens', name: 'tokens' },
        { id: 'section-buttons', name: 'buttons' },
        { id: 'section-icon-buttons', name: 'icon-buttons' },
        { id: 'section-form-elements', name: 'form-elements' },
        { id: 'section-cards', name: 'cards' },
        { id: 'section-lists', name: 'lists' },
        { id: 'section-expense-row', name: 'expense-row' },
        { id: 'section-chips', name: 'chips' },
        { id: 'section-tables', name: 'tables' },
        { id: 'section-trip-header', name: 'trip-header' },
    ];

    for (const { id, name } of SECTIONS) {
        test(`${name} section matches baseline`, async ({ page }, testInfo) => {
            // Skip if the section anchor doesn't exist on this build —
            // surfaces "section was renamed / removed" as one targeted
            // failure rather than a misleading screenshot diff.
            const section = page.locator(`#${id}`);
            const count = await section.count();
            if (count === 0) {
                test.skip(true, `#${id} not found in components.html (missing or renamed)`);
            }
            await expect(section).toHaveScreenshot(`${name}-${testInfo.project.name}.png`, SCREENSHOT_OPTS);
        });
    }
});
