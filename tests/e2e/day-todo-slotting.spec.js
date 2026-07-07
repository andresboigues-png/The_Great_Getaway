// @ts-check
// To-do place slotting (DayDetailModal.placesForSlot). A place tagged to a
// day but WITHOUT a slot (timeOfDay/preferredHour null) — how the AI planner
// leaves "sights", and how a manual home-map add lands — must NOT auto-fill
// all three time-parts. It stays in the "to-do list" panel until the user
// drops it into a specific AM/PM/Eve. This pins that contract.

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

let _n = 0;
const uniqueId = (p) => `test-${p}-${Date.now()}-${(_n += 1)}`;

const USER_ID = uniqueId('todo-user');
const TRIP_ID = uniqueId('todo-trip');
const DAY_ID = uniqueId('todo-day');
const PLACE_ID = uniqueId('todo-place');

const armMediaPost = (page) =>
    page.waitForResponse((r) => r.url().includes(`/api/trips/${TRIP_ID}/media`) && r.request().method() === 'POST', {
        timeout: 10000,
    });

test('a day-tagged, slot-less place stays in the to-do panel — not auto-added to every slot', async ({ page }) => {
    const auth = await getAuthForApi(page, USER_ID);
    await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'Todo Trip' });
    await page.request.post('/api/days', {
        headers: auth.headers,
        data: {
            day: {
                id: DAY_ID,
                tripId: TRIP_ID,
                dayNumber: 1,
                name: 'Sightseeing day',
                date: '2026-08-10',
                plan: { morning: '', afternoon: '', evening: '' },
            },
        },
    });
    // The "AI sight" shape: tagged to THIS day, but no timeOfDay/preferredHour.
    await page.request.post(`/api/trips/${TRIP_ID}/media`, {
        headers: auth.headers,
        data: {
            markedPlaces: [
                {
                    placeId: PLACE_ID,
                    name: 'Belém Tower',
                    address: 'Av. Brasília, Lisboa',
                    icon: '🏛️',
                    color: '#0071e3',
                    forManual: true,
                    forAI: true,
                    dayId: DAY_ID, // tagged to the day…
                    timeOfDay: null, // …but NOT to a slot
                    preferredHour: null,
                },
            ],
        },
    });

    await openTripWithMedia(page, USER_ID, TRIP_ID);
    await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
    const detailBtn = page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`);
    if (!(await detailBtn.isVisible().catch(() => false))) {
        await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
    }
    await detailBtn.click({ timeout: 10000 });
    const dialog = page.locator('.modal-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();

    // It must NOT auto-render as a card in ANY slot pane (the old behaviour
    // showed it in all three via the `|| !placeSlot` fallback).
    await expect(dialog.locator(`.day-plan-pane .day-plan-place-wrap[data-place-id="${PLACE_ID}"]`)).toHaveCount(0);

    // The per-slot count chips reflect PLACES pinned to each slot — with the
    // place still slot-less, every badge is empty (not "1" in all three).
    await expect(dialog.locator('[data-plan-tab-count="morning"]')).toHaveText('');
    await expect(dialog.locator('[data-plan-tab-count="afternoon"]')).toHaveText('');
    await expect(dialog.locator('[data-plan-tab-count="evening"]')).toHaveText('');

    // It IS offered in the to-do panel, with the AM/PM/Eve add buttons.
    const row = dialog.locator(`.day-shortlist-row[data-place-id="${PLACE_ID}"]`);
    await expect(row).toBeVisible();
    const amBtn = row.locator('.day-shortlist-add-btn[data-time="morning"]');
    await expect(amBtn).toHaveAttribute('aria-pressed', 'false');

    // Dropping it into Morning slots it there (and only there).
    const posted = armMediaPost(page);
    await amBtn.click();
    expect((await posted).ok()).toBe(true);
    await expect(amBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(
        dialog.locator(
            `.day-plan-pane[data-plan-pane="morning"] .plan-blocks-ro .day-plan-place-wrap[data-place-id="${PLACE_ID}"]`
        )
    ).toBeVisible();
    // Still absent from afternoon + evening.
    await expect(
        dialog.locator(`.day-plan-pane[data-plan-pane="afternoon"] .day-plan-place-wrap[data-place-id="${PLACE_ID}"]`)
    ).toHaveCount(0);
    await expect(
        dialog.locator(`.day-plan-pane[data-plan-pane="evening"] .day-plan-place-wrap[data-place-id="${PLACE_ID}"]`)
    ).toHaveCount(0);

    // Count chip now matches: morning has one place → "1"; the rest empty.
    await expect(dialog.locator('[data-plan-tab-count="morning"]')).toHaveText('1');
    await expect(dialog.locator('[data-plan-tab-count="afternoon"]')).toHaveText('');
    await expect(dialog.locator('[data-plan-tab-count="evening"]')).toHaveText('');
});
