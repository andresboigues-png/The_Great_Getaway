// @ts-check
import { test, expect } from '@playwright/test';
import { openFreshApp } from './helpers.js';

test('same-hash navigate does not swallow browser Back (F3)', async ({ page }) => {
    await openFreshApp(page, `test-f3-${Date.now()}`);
    // Build history: home -> expenses -> insights (real hashchanges).
    await page.evaluate(() => {
        location.hash = 'expenses';
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        location.hash = 'insights';
    });
    await page.waitForTimeout(800);

    // Simulate the 15s poll's navigate(current): tapping the ALREADY-active
    // tab calls navigate('insights') with the hash UNCHANGED — the exact code
    // path the poll hits. Pre-fix this armed isInternalNav=true which never
    // got consumed (no hashchange on a same-hash assignment).
    await page.locator('[data-page="insights"]').first().click({ force: true });
    await page.waitForTimeout(500);

    // A real browser Back must now actually navigate to expenses. Pre-fix the
    // dangling guard swallowed this hashchange — the URL changed to #expenses
    // but the app stayed mounted on insights (user had to press Back twice).
    await page.goBack();
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => ({
        hash: location.hash,
        current: document.querySelector('[aria-current="page"]')?.getAttribute('data-page') ?? null,
    }));
    console.log('AFTER_BACK', JSON.stringify(after));
    expect(after.hash).toBe('#expenses');
    expect(after.current).toBe('expenses');
});
