// @ts-check
// Trip checklist modal — full CRUD journey through the real UI.
//
// Written alongside MK1 Wave M, where this modal became the PILOT for
// the React modal convergence (react/components/ChecklistModal.tsx via
// the openReactModal bridge). The journey below is
// implementation-agnostic on purpose: it drives the same selectors the
// imperative version rendered (ids/classes were preserved in the
// conversion), so it guards BOTH the pilot itself and every future
// modal that migrates onto the bridge — if the bridge breaks focus,
// Escape, or the close path, this spec goes red in a real browser.
//
// Persistence contract under test: checklist lives on the trips row's
// checklist_json media column. The modal's writes ride
// upsertTrip()'s R12-B4 dual-write, whose MEDIA half
// (persistTripMedia → POST /api/trips/<id>/media) is the ONLY path
// that may carry it — /api/data never ships it and the /api/trips
// metadata upsert ignores it. So the server-side asserts here read
// GET /api/trips/<id>/media, exactly like the app's cold-load does.

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

// Unique per worker (each project runs its own worker against the
// shared per-run throwaway DB). `test-` prefix required by test login.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const USER_ID = `test-checklist-${RUN}`;
const TRIP_ID = `test-trip-checklist-${RUN}`;

/** Open the checklist modal from the Trip Hub tab (its real opener).
 *  @param {import('@playwright/test').Page} page */
async function openChecklist(page) {
    // Hub is the default trip tab, but a persisted tab pref could
    // differ — click it explicitly (photo-drag-reorder precedent).
    await page.locator('.trip-tabnav__tab[data-tab="hub"]').click({ timeout: 10000 });
    await page.locator('[data-hub-action="checklist"]').click({ timeout: 10000 });
    await expect(page.locator('.modal-overlay [role="dialog"]')).toBeVisible();
}

/** The modal's add-task input.
 *  @param {import('@playwright/test').Page} page */
const addInput = (page) => page.locator('#checklistAddInput');

/** One checklist row by its task text.
 *  @param {import('@playwright/test').Page} page @param {string} text */
const rowByText = (page, text) => page.locator('.checklist-row', { hasText: text });

/** Server truth: the trip's checklist via the dedicated media endpoint.
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers */
async function serverChecklist(page, headers) {
    const res = await page.request.get(`/api/trips/${TRIP_ID}/media`, { headers });
    expect(res.ok()).toBe(true);
    return (await res.json()).checklist || [];
}

/** Arm a wait for the media POST that persists a checklist mutation.
 *  upsertTrip's media half is fire-and-forget, so tests that assert
 *  server state (or reboot) must await the write LANDING, not just the
 *  optimistic repaint.
 *  @param {import('@playwright/test').Page} page */
const armMediaPost = (page) =>
    page.waitForResponse((r) => r.url().includes(`/api/trips/${TRIP_ID}/media`) && r.request().method() === 'POST', {
        timeout: 10000,
    });

test.describe('Trip checklist modal', () => {
    test.describe.configure({ mode: 'serial' });

    test('add → toggle → edit → delete, all persisted through the media write path', async ({ page }) => {
        const auth = await getAuthForApi(page, USER_ID);
        await createTripViaApi(page, auth.headers, { id: TRIP_ID, name: 'Checklist Trip' });
        await openTripWithMedia(page, USER_ID, TRIP_ID);

        await openChecklist(page);

        // Initial focus lands in the add input — the "open and start
        // typing" gesture the modal optimizes for. (In the React pilot
        // this pins the bridge's flushSync-before-microtask ordering +
        // Modal.ts's focus-steal guard.)
        await expect(addInput(page)).toBeFocused();

        // ── Add two tasks. Focus must return to the input after each
        // submit so additions chain naturally.
        let posted = armMediaPost(page);
        await addInput(page).fill('Pack power adapter');
        await addInput(page).press('Enter');
        expect((await posted).ok()).toBe(true);
        await expect(rowByText(page, 'Pack power adapter')).toBeVisible();
        await expect(addInput(page)).toBeFocused();
        await expect(addInput(page)).toHaveValue('');

        posted = armMediaPost(page);
        await addInput(page).fill('Print tickets');
        await addInput(page).press('Enter');
        expect((await posted).ok()).toBe(true);
        await expect(page.locator('.checklist-row')).toHaveCount(2);
        await expect(page.getByText('2 of 2 left')).toBeVisible();

        // ── Toggle the first done. aria-pressed is the state hook.
        posted = armMediaPost(page);
        await rowByText(page, 'Pack power adapter').locator('.checklist-toggle-btn').click();
        expect((await posted).ok()).toBe(true);
        await expect(rowByText(page, 'Pack power adapter').locator('.checklist-toggle-btn')).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        await expect(page.getByText('1 of 2 left')).toBeVisible();

        // ── Inline-edit the second: click text → input appears
        // preselected → type replacement → Enter commits.
        await rowByText(page, 'Print tickets').locator('.checklist-item-text').click();
        const editInput = page.locator('.checklist-edit-input');
        await expect(editInput).toBeFocused();
        posted = armMediaPost(page);
        await editInput.fill('Print Sintra tickets');
        await editInput.press('Enter');
        expect((await posted).ok()).toBe(true);
        await expect(rowByText(page, 'Print Sintra tickets')).toBeVisible();

        // ── Escape during an edit cancels the EDIT, not the modal.
        await rowByText(page, 'Print Sintra tickets').locator('.checklist-item-text').click();
        await page.locator('.checklist-edit-input').press('Escape');
        await expect(page.locator('.checklist-edit-input')).toHaveCount(0);
        await expect(page.locator('.modal-overlay [role="dialog"]')).toBeVisible();

        // ── Delete the done task.
        posted = armMediaPost(page);
        await rowByText(page, 'Pack power adapter').locator('.checklist-delete-btn').click();
        expect((await posted).ok()).toBe(true);
        await expect(page.locator('.checklist-row')).toHaveCount(1);

        // ── Server truth via the media endpoint (the R12 contract).
        const list = await serverChecklist(page, auth.headers);
        expect(list).toHaveLength(1);
        expect(list[0].body).toBe('Print Sintra tickets');
        expect(list[0].done).toBe(false);

        // ── ✕ closes.
        await page.locator('#checklistModalClose').click();
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
    });

    test('checklist survives a fresh boot; Escape closes the modal', async ({ page }) => {
        // Cold boot → the media GET hydrates the checklist from the
        // server (openTripWithMedia awaits it) — proves test 1's writes
        // were durable rows, not a lingering optimistic echo.
        await openTripWithMedia(page, USER_ID, TRIP_ID);
        await openChecklist(page);
        await expect(rowByText(page, 'Print Sintra tickets')).toBeVisible();
        await expect(page.getByText('1 of 1 left')).toBeVisible();

        // Escape (outside any inline edit) dismisses the whole modal —
        // Modal.ts plumbing working through whatever renders the body.
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
    });
});
