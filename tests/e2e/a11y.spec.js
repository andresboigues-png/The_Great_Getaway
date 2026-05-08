// @ts-check
// D3 — accessibility regression gate.
//
// Runs axe-core against every authenticated app route + the unauth
// login wall + the /components preview. Fails the build if any rule
// in the wcag2a/wcag2aa tag set produces a violation.
//
// SCOPE NOTE: this is the gate for the actual product surfaces. The
// /components preview page renders many synthetic swatches whose
// "violation" is really an intentional design demonstration (ghost
// chip on light bg, faint chip on near-white, etc.) — for that page
// we filter color-contrast out of the assertion list and gate only
// on the structural rules (button-name, label, select-name, etc.).
//
// To debug a fail locally: `npx playwright test tests/e2e/a11y.spec.js
// --headed --project=chromium-desktop`. Each route's full violation
// list prints as part of the test output.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openFreshApp } from './helpers.js';

/**
 * Authenticated app routes — every page the router serves under a
 * signed-in session. Hash-routed because the legacy router uses
 * location.hash. Each entry is `[hash, label]`.
 */
const AUTH_ROUTES = [
    ['#home', 'home'],
    ['#expenses', 'expenses'],
    ['#insights', 'insights'],
    ['#todo', 'todo'],
    ['#budgets', 'budgets'],
    ['#feed', 'feed'],
    ['#profile', 'profile'],
    ['#collections', 'collections'],
    ['#settings', 'settings'],
    ['#search', 'search'],
    ['#friends', 'friends'],
    ['#ai', 'ai'],
    ['#settlement', 'settlement'],
];

test.describe('A11y — axe-core regression gate', () => {
    // ── Pre-login (unauthenticated) ─────────────────────────────────
    test('login wall (unauth) has zero wcag2a/wcag2aa violations', async ({ page }) => {
        await page.goto('/');
        // Be defensive — if a stale token is in storage from a prior
        // run, kick it before scanning so we definitely test the
        // signed-out surface.
        await page.evaluate(() => {
            localStorage.clear();
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        if (result.violations.length) {
            console.log('login-wall violations:', JSON.stringify(result.violations, null, 2));
        }
        expect(result.violations).toEqual([]);
    });

    // ── /components preview ─────────────────────────────────────────
    // Synthetic demo page. Color-contrast there is intentional UI-
    // design demonstration so we gate only on structural rules.
    test('components preview: zero structural a11y violations', async ({ page }) => {
        await page.goto('/components');
        await page.waitForLoadState('networkidle');
        const result = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .disableRules(['color-contrast'])
            .analyze();
        if (result.violations.length) {
            console.log('components violations:', JSON.stringify(result.violations, null, 2));
        }
        expect(result.violations).toEqual([]);
    });

    // ── Authenticated routes ────────────────────────────────────────
    // One test case per route so a failure is unambiguously scoped.
    for (const [hash, label] of AUTH_ROUTES) {
        test(`auth route ${label} has zero wcag2a/wcag2aa violations`, async ({ page }) => {
            await openFreshApp(page);
            await page.evaluate((h) => {
                location.hash = h;
            }, hash);
            await page.waitForLoadState('networkidle');
            // Pages with async charts / maps / image grids need a
            // moment to settle so axe scans against the rendered DOM,
            // not the loading skeleton.
            await page.waitForTimeout(800);
            const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
            if (result.violations.length) {
                console.log(`${label} violations:`, JSON.stringify(result.violations, null, 2));
            }
            expect(result.violations).toEqual([]);
        });
    }
});
