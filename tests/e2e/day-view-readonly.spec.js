// @ts-check
// Read-only day view — the non-planner permission gate + the modal it
// opens. Written alongside MK1 Wave M, where dayViewModal became the
// second modal on the openReactModal bridge (after the checklist
// pilot); like trip-checklist.spec.js the selectors are the ones the
// imperative version rendered, so this guards the conversion AND the
// permission short-circuit that routes non-planners here.
//
// The gate under test (dayDetailModal.ts): clicking a day's "Open full
// plan" as a trip member WITHOUT plan-edit rights (role=relaxer) must
// open the READ-ONLY day view — no editable fields, a "View only"
// chip — instead of the editable day-detail modal.

import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const OWNER_ID = `test-dayview-owner-${RUN}`;
const VIEWER_ID = `test-dayview-viewer-${RUN}`;
const TRIP_ID = `test-trip-dayview-${RUN}`;
const DAY_ID = `test-day-dayview-${RUN}`;
const DAY_NAME = 'Alfama sunrise walk';
const MORNING_PLAN = 'Coffee at the miradouro, then the flea market.';

test('relaxer gets the read-only day view with the plan content', async ({ page, browser }) => {
    // ── Owner seeds trip + a planned day, invites the viewer as
    // relaxer (the weakest role — no plan editing). API seeding via
    // the same endpoints the UI drives (convergence-spec precedent).
    const ownerAuth = await getAuthForApi(page, OWNER_ID);
    await createTripViaApi(page, ownerAuth.headers, { id: TRIP_ID, name: 'DayView Trip' });
    const dayRes = await page.request.post('/api/days', {
        headers: ownerAuth.headers,
        data: {
            day: {
                id: DAY_ID,
                tripId: TRIP_ID,
                dayNumber: 1,
                name: DAY_NAME,
                date: '2026-08-01',
                plan: { morning: MORNING_PLAN, afternoon: '', evening: '' },
            },
        },
    });
    expect(dayRes.ok(), `day seed failed: ${dayRes.status()}`).toBe(true);

    // Viewer must exist (test login creates the row) BEFORE the invite.
    const viewerAuth = await getAuthForApi(page, VIEWER_ID);
    // Cookie-over-Bearer gotcha (befriend() precedent): the second
    // login above rewrote the shared gg_session cookie to the VIEWER,
    // and auth.py resolves the cookie BEFORE the Authorization header —
    // the owner's invite below would silently run as the viewer (403).
    // Clear cookies so the Bearer headers decide identity.
    await page.context().clearCookies();
    const inv = await page.request.post('/api/trips/invite', {
        headers: ownerAuth.headers,
        data: { trip_id: TRIP_ID, target_user_id: VIEWER_ID, role: 'relaxer' },
    });
    expect(inv.ok()).toBe(true);
    const acc = await page.request.post('/api/trips/invite/respond', {
        headers: viewerAuth.headers,
        data: { trip_id: TRIP_ID, accept: true },
    });
    expect(acc.ok()).toBe(true);

    // ── Viewer boots with the shared trip ACTIVE (openTripWithMedia
    // stamps activeTripId pre-boot — a bare fresh boot can land on the
    // no-trip home surface without the trip tabnav), then opens the
    // Path tab and the day's full plan.
    await openTripWithMedia(page, VIEWER_ID, TRIP_ID);
    // (The plan tab's data-tab is 'days'; it's also the default, but a
    // persisted tab pref could differ — click it explicitly.)
    await page.locator('.trip-tabnav__tab[data-tab="days"]').click({ timeout: 10000 });
    // The day card's option stack starts collapsed (per-day localStorage
    // pref, empty on a fresh boot ⇒ pathTab's default) — expand it so
    // the "Open full plan" button renders.
    const detailBtn = page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`);
    if (!(await detailBtn.isVisible().catch(() => false))) {
        await page.locator(`.path-card-collapse-btn[data-day-id="${DAY_ID}"]`).click({ timeout: 10000 });
    }
    await detailBtn.click({ timeout: 10000 });

    // The READ-ONLY modal opened: dialog + "View only" chip + the day
    // name — and the owner's plan text is visible to the viewer.
    const dialog = page.locator('.modal-overlay [role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('View only');
    await expect(dialog.locator('h2')).toHaveText(DAY_NAME);
    await expect(dialog).toContainText(MORNING_PLAN);
    // Empty slots render the placeholder, not editable fields — there
    // is no input/textarea anywhere in the read-only view.
    await expect(dialog).toContainText('Nothing planned');
    await expect(dialog.locator('input, textarea')).toHaveCount(0);

    // ✕ closes; a second open closes via Escape (Modal.ts plumbing
    // through the bridge, same pair the checklist spec pins).
    await page.locator('#closeViewBtn').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await page.locator(`.day-detail-btn[data-day-id="${DAY_ID}"]`).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
});
