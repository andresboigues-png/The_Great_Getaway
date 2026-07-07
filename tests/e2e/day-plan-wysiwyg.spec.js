// @ts-check
// Day-plan WYSIWYG editor (react/components/DayDetailModal + planRichText).
// The note editor is a contentEditable that shows formatting AS formatting —
// type, select, hit Bold and the text renders bold with NO visible ** — while
// still PERSISTING the plain markdown string the read-only PlanText reads.
// This pins the whole contract: toolbar → live render, stored markdown, and
// the reload round-trip (markdown → formatted editable again).

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

let _n = 0;
const uniqueId = (p) => `test-${p}-${Date.now()}-${(_n += 1)}`;

const USER_ID = uniqueId('wys-user');
const TRIP_ID = uniqueId('wys-trip');
const DAY_ID = uniqueId('wys-day');

/** Seed a trip + one numbered day with empty plan, then open its modal. */
async function seedAndOpen(page) {
    const auth = await getAuthForApi(page, USER_ID);
    await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'WYS Trip' });
    const dayRes = await page.request.post('/api/days', {
        headers: auth.headers,
        data: {
            day: {
                id: DAY_ID,
                tripId: TRIP_ID,
                dayNumber: 1,
                name: 'WYS day',
                date: '2026-08-10',
                plan: { morning: '', afternoon: '', evening: '' },
            },
        },
    });
    expect(dayRes.ok(), `seed failed: ${dayRes.status()}`).toBe(true);

    await openTripWithMedia(page, USER_ID, TRIP_ID);
    await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
    const detailBtn = page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`);
    if (!(await detailBtn.isVisible().catch(() => false))) {
        await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
    }
    await detailBtn.click({ timeout: 10000 });
    const dialog = page.locator('.modal-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();
    return { dialog, auth };
}

const armDaysPost = (page) =>
    page.waitForResponse((r) => r.url().includes('/api/days') && r.request().method() === 'POST', {
        timeout: 10000,
    });

test.describe('Day-plan WYSIWYG editor', () => {
    test('Bold renders live (no ** shown), stores plain markdown, and survives reload', async ({ page }) => {
        const { dialog, auth } = await seedAndOpen(page);

        // Reveal the editor and type into the first (empty) text block.
        await dialog.locator('.day-plan-pane[data-plan-pane="morning"] .plan-readonly__edit').click();
        const rte = dialog.locator('.day-plan-pane[data-plan-pane="morning"] .plan-block__rte').first();
        await rte.click();
        await page.keyboard.type('Hey there');

        // Select all + Bold via the toolbar (first toolbar button = Bold).
        const posted = armDaysPost(page);
        await page.keyboard.press('ControlOrMeta+a');
        await dialog.locator('.day-plan-pane[data-plan-pane="morning"] .plan-md-toolbar__btn').first().click();

        // Live render: the text is a real bold tag (Chromium's execCommand
        // emits <b>; after reload mdToHtml emits <strong>), and NO literal **.
        await expect(rte.locator('b, strong')).toHaveText('Hey there');
        await expect(rte).not.toContainText('**');

        // Storage is plain markdown — the read-only PlanText contract.
        expect((await posted).ok()).toBe(true);
        const day = (
            (await (await page.request.get('/api/data', { headers: auth.headers })).json()).tripDays || []
        ).find((d) => d.id === DAY_ID);
        expect(day.plan.morning).toBe('**Hey there**');

        // ── Reload round-trip: cold boot renders the saved plan formatted,
        // and re-opening the editor rebuilds the contentEditable as <strong>
        // (markdown → formatting), never as literal markers.
        await openTripWithMedia(page, USER_ID, TRIP_ID);
        await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
        const detailBtn = page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`);
        if (!(await detailBtn.isVisible().catch(() => false))) {
            await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
        }
        await detailBtn.click({ timeout: 10000 });
        const dialog2 = page.locator('.modal-overlay [role="dialog"]');
        await expect(dialog2).toBeVisible();

        // Read-only shows bold, no markers.
        const ro = dialog2.locator('.day-plan-pane[data-plan-pane="morning"] .plan-blocks-ro');
        await expect(ro.locator('strong')).toHaveText('Hey there');
        await expect(ro).not.toContainText('**');

        // Editor rebuilds as formatted, not raw markdown.
        await dialog2.locator('.day-plan-pane[data-plan-pane="morning"] .plan-readonly__edit').click();
        const rte2 = dialog2.locator('.day-plan-pane[data-plan-pane="morning"] .plan-block__rte').first();
        await expect(rte2.locator('strong')).toHaveText('Hey there');
        await expect(rte2).not.toContainText('**');
    });

    test('Bullet toolbar renders a real list and stores "- " markdown', async ({ page }) => {
        const { dialog, auth } = await seedAndOpen(page);

        // Switch to the afternoon tab FIRST (its Edit button is hidden while
        // the pane is inactive), then reveal its editor.
        await dialog.locator('button[data-plan-tab="afternoon"]').click();
        await dialog.locator('.day-plan-pane[data-plan-pane="afternoon"] .plan-readonly__edit').click();
        const rte = dialog.locator('.day-plan-pane[data-plan-pane="afternoon"] .plan-block__rte').first();
        await rte.click();
        await page.keyboard.type('pack bags');

        const posted = armDaysPost(page);
        // Bullet is the 4th toolbar button (B, I, U, bullet).
        await dialog.locator('.day-plan-pane[data-plan-pane="afternoon"] .plan-md-toolbar__btn').nth(3).click();

        await expect(rte.locator('ul li')).toHaveText('pack bags');
        expect((await posted).ok()).toBe(true);
        const day = (
            (await (await page.request.get('/api/data', { headers: auth.headers })).json()).tripDays || []
        ).find((d) => d.id === DAY_ID);
        expect(day.plan.afternoon).toBe('- pack bags');
    });
});
