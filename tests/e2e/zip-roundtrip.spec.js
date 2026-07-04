// @ts-check
// Trip ZIP export → import round-trip — the trip-portability promise.
//
// The home "Download" action offers a full-trip ZIP (routes/trip_io.py
// export_trip: manifest.json with SELECT*-driven sections + media files),
// and the New-Trip modal's "Import a trip file" pill feeds that ZIP back
// through POST /api/trips/import, which rebuilds the trip as a BRAND-NEW,
// importer-owned trip (fresh ids, sharing state reset, media columns
// written as a sanctioned exception to the R12 media-write invariant).
// A silent field drop anywhere on that path = user data loss, so this
// suite drives the REAL UI for both halves and then verifies fidelity
// against server truth (/api/data + GET /api/trips/<id>/media).
//
// Sections covered (trip_io._SECTIONS + the media columns on the trips
// row): trips, trip_days, expenses, and the checklist media column —
// four distinct sections. Budgets/settlements ride the same generic
// _insert_remapped path; photo BINARIES are deliberately not seeded
// (uploading real files + re-zipping them would eat most of the 15s
// test budget for no extra code coverage — the media/ folder plumbing
// is exercised by the empty-set case, and checklist covers the heavy
// JSON columns).
//
// Serial describe: the downloaded ZIP + the imported trip id must flow
// between tests (export → import → verify), and splitting keeps each
// test comfortably inside the 15s budget.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { openTripWithMedia, getAuthForApi, createTripViaApi } from './helpers.js';

// Unique per worker run (each project gets a fresh worker, so desktop and
// mobile runs never collide in the shared per-run SQLite DB). `test-`
// prefix required: test-mode login rejects non-test- user ids.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const USER_ID = `test-zipper-${RUN}`;
const SOURCE_TRIP_ID = `test-trip-zip-${RUN}`;
const TRIP_NAME = 'ZIP Roundtrip Source';

// Seeded content — asserted field-by-field after the round-trip.
// Day/expense payload shapes mirror services/day_writes.py /
// services/expense_writes.py (camelCase in, snake_case stored).
const SEED_DAYS = [
    { id: `test-day-a-${RUN}`, dayNumber: 1, name: 'Alfama sunrise walk', date: '2026-07-10' },
    { id: `test-day-b-${RUN}`, dayNumber: 2, name: 'Sintra castles loop', date: '2026-07-11' },
];
// EUR-only so the C1 "no live FX rate" gate in expense_writes can never
// reject the seed in an offline test env (EUR needs no conversion).
const SEED_EXPENSES = [
    {
        id: `test-exp-a-${RUN}`,
        label: 'Pastel de nata run',
        value: 12.5,
        currency: 'EUR',
        who: 'Alex',
        date: '2026-07-10',
        country: 'Portugal',
    },
    {
        id: `test-exp-b-${RUN}`,
        label: 'Tram 28 tickets',
        value: 6.8,
        currency: 'EUR',
        who: 'Sam',
        date: '2026-07-11',
        country: 'Portugal',
    },
];
// Checklist lives in the trips row's checklist_json media column — the
// import path writes it directly (the sanctioned media-write exception).
// Item shape mirrors types.d.ts TripChecklistItem.
const SEED_CHECKLIST = [
    { id: `test-chk-a-${RUN}`, body: 'Pack power adapter', done: false },
    { id: `test-chk-b-${RUN}`, body: 'Print Sintra tickets', done: true },
];

// State that flows between the serial tests.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-zip-roundtrip-'));
const ZIP_PATH = path.join(TMP_DIR, 'roundtrip.ggtrip.zip');
/** @type {string} */
let importedTripId = '';

/**
 * Open the trip-controls popover (#tripControlsPopover) — the single
 * home of Download / New Trip on BOTH viewports since round 21:
 *   - desktop: the navbar "+" (#newTripBtn) toggles it (commit 52fea5d1);
 *   - mobile: the centre "Your trip ▾" banner control (#navTripChange),
 *     which updateTripSelector only shows once a trip is ACTIVE (so the
 *     caller must have activated a trip first).
 * NOTE: helpers.openMobileTripControlsPopover still clicks the retired
 * #tripControlsBtn compass, so it can't be reused here. Same poll-the-
 * click pattern though — main.ts's listener attachment can lag a fresh
 * page-load click, which would no-op and leave the popover closed.
 * @param {import('@playwright/test').Page} page
 */
async function openTripControlsPopover(page) {
    const isMobile = (page.viewportSize()?.width ?? 1280) <= 720;
    const trigger = isMobile ? '#navTripChange' : '#newTripBtn';
    // The mobile trigger starts display:none and is unhidden by
    // updateTripSelector once /api/data lands STATE.trips + an active
    // trip — wait for that rather than clicking a hidden element.
    await page.locator(trigger).waitFor({ state: 'visible', timeout: 8000 });
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await page.click(trigger);
        const opened = await page
            .locator('#tripControlsPopover')
            .evaluate((el) => /** @type {HTMLElement} */ (el).style.display === 'block')
            .catch(() => false);
        if (opened) return;
        await page.waitForTimeout(250);
    }
    throw new Error('trip-controls popover never opened');
}

/**
 * POST helper that fails loudly — a silent 4xx during seeding would
 * otherwise surface as a confusing count mismatch three tests later.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {{ Authorization: string }} headers
 * @param {any} data
 */
async function mustPost(page, url, headers, data) {
    const res = await page.request.post(url, { headers, data });
    if (!res.ok()) {
        throw new Error(`seed POST ${url} failed: ${res.status()} ${await res.text()}`);
    }
    return res;
}

test.describe('Trip ZIP export → import round-trip', () => {
    test.describe.configure({ mode: 'serial' });

    test('export: Download → ZIP produces a valid .ggtrip.zip', async ({ page }) => {
        // ── Seed the source trip via API (deterministic, fast) ──
        const auth = await getAuthForApi(page, USER_ID);
        await createTripViaApi(page, auth.headers, { id: SOURCE_TRIP_ID, name: TRIP_NAME });
        for (const d of SEED_DAYS) {
            await mustPost(page, '/api/days', auth.headers, {
                day: { ...d, tripId: SOURCE_TRIP_ID },
            });
        }
        for (const e of SEED_EXPENSES) {
            await mustPost(page, '/api/expenses', auth.headers, {
                expense: { ...e, tripId: SOURCE_TRIP_ID },
            });
        }
        // Checklist goes through the dedicated media write path (R12
        // invariant: /api/trips upsert ignores media columns entirely).
        await mustPost(page, `/api/trips/${SOURCE_TRIP_ID}/media`, auth.headers, {
            checklist: SEED_CHECKLIST,
        });

        // ── Boot the app with the source trip ACTIVE ──
        // The Download row (#downloadTripBtnSidebar) is unhidden by
        // updateTripSelector only while a trip is active, and its click
        // handler resolves the trip from STATE.activeTripId.
        await openTripWithMedia(page, USER_ID, SOURCE_TRIP_ID);

        // ── Drive the UI: popover → Download → chooser → ZIP ──
        await openTripControlsPopover(page);
        const downloadRow = page.locator('#downloadTripBtnSidebar');
        await downloadRow.waitFor({ state: 'visible', timeout: 8000 });
        await downloadRow.click();

        // The chooser modal (modals/tripExport.ts) lazy-loads its chunk on
        // first use — wait for the ZIP option to mount rather than racing it.
        const zipBtn = page.locator('#chooserZipBtn');
        await zipBtn.waitFor({ state: 'visible', timeout: 8000 });

        // Arm the download listener BEFORE the click. downloadTripZip
        // fetches /api/trips/<id>/export, then triggers an <a download>
        // click on a blob URL — Playwright surfaces that as a 'download'.
        // (Both projects use the Desktop Chrome UA — Windows, no "Mac"
        // substring — so tripExport's iOS window.open branch never fires
        // even on the touch-enabled mobile project.)
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await zipBtn.click();
        const download = await downloadPromise;

        // Client names the file <safeName(trip)>.ggtrip.zip.
        expect(download.suggestedFilename()).toMatch(/\.ggtrip\.zip$/);
        await download.saveAs(ZIP_PATH);

        // Sanity: non-trivial size + the ZIP magic bytes. The manifest
        // alone (trip + 2 days + 2 expenses + checklist) is well over 100
        // bytes even deflated, so an empty/error blob fails here.
        const buf = fs.readFileSync(ZIP_PATH);
        expect(buf.length).toBeGreaterThan(100);
        expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    });

    test('import: New Trip → Import rebuilds the trip and opens it', async ({ page }) => {
        expect(fs.existsSync(ZIP_PATH), 'export test must have produced the ZIP').toBe(true);

        // Fresh boot, source trip active — on mobile the popover trigger
        // (#navTripChange) only shows with an active trip, and reusing the
        // same activation helper keeps both viewports on one code path.
        await openTripWithMedia(page, USER_ID, SOURCE_TRIP_ID);

        // New Trip modal lives inside the same trip-controls popover.
        await openTripControlsPopover(page);
        await page.click('#newTripBtnSidebar');
        await page.locator('#importTripBtn').waitFor({ state: 'visible', timeout: 8000 });

        // Feed the ZIP through the REAL hidden file input (#importTripFileInput,
        // modals/trip.ts). setInputFiles fires its change handler, which POSTs
        // to /api/trips/import, pulls fresh state, selects the new trip and
        // navigates home. Arm the response wait before the trigger.
        const importResponse = page.waitForResponse(
            (r) => r.url().includes('/api/trips/import') && r.request().method() === 'POST',
            { timeout: 10000 }
        );
        await page.setInputFiles('#importTripFileInput', ZIP_PATH);
        const res = await importResponse;
        expect(res.ok(), `import failed: ${res.status()}`).toBe(true);
        const body = await res.json();
        expect(body.tripId).toBeTruthy();
        // The portability contract: import ALWAYS creates a separate,
        // new trip — never merges into / overwrites the source.
        expect(body.tripId).not.toBe(SOURCE_TRIP_ID);
        importedTripId = body.tripId;

        // ── UI spot-checks ──
        // importTripFromFile sets STATE.activeTripId to the new trip and
        // updateTripSelector mirrors it into BOTH selects (#tripSelector /
        // #tripSelectorSidebar), so the desktop select's value flips to the
        // imported id even on mobile where it's CSS-hidden. Poll rather than
        // sleep — the pull + re-render lands asynchronously after the POST.
        await expect
            .poll(
                () =>
                    page.evaluate(
                        () =>
                            /** @type {HTMLSelectElement|null} */ (document.getElementById('tripSelector'))?.value ?? ''
                    ),
                { timeout: 8000 }
            )
            .toBe(importedTripId);
        // And the imported trip's CONTENT renders: the home path tab draws a
        // day card per trip_days row, so the seeded day name must be visible.
        await expect(page.getByText(SEED_DAYS[0].name).first()).toBeVisible({ timeout: 8000 });
    });

    test('fidelity: imported content matches the source; source untouched', async ({ page }) => {
        expect(importedTripId, 'import test must have produced a trip id').toBeTruthy();

        // Server truth via the same API the app polls. page.request needs
        // its own JWT (fresh context per test) — same deterministic user.
        const auth = await getAuthForApi(page, USER_ID);
        const dataRes = await page.request.get('/api/data', { headers: auth.headers });
        expect(dataRes.ok()).toBe(true);
        const data = await dataRes.json();

        // Both trips exist, separately, with the same name/destination.
        const source = (data.trips || []).find((t) => t.id === SOURCE_TRIP_ID);
        const imported = (data.trips || []).find((t) => t.id === importedTripId);
        expect(source, 'source trip still exists').toBeTruthy();
        expect(imported, 'imported trip exists').toBeTruthy();
        expect(imported.name).toBe(TRIP_NAME);
        expect(imported.country).toBe(source.country);

        // ── trip_days round-trip ──
        const daysOf = (tripId) => (data.tripDays || []).filter((d) => d.tripId === tripId);
        const importedDays = daysOf(importedTripId);
        expect(importedDays).toHaveLength(SEED_DAYS.length);
        for (const seed of SEED_DAYS) {
            const match = importedDays.find((d) => d.dayNumber === seed.dayNumber);
            expect(match, `imported day ${seed.dayNumber} exists`).toBeTruthy();
            expect(match.name).toBe(seed.name);
            expect(match.date).toBe(seed.date);
            // Import re-keys every row (fresh ids) — a matching id would
            // mean the import wrote INTO the source trip's rows.
            expect(match.id).not.toBe(seed.id);
        }

        // ── expenses round-trip ──
        const expensesOf = (tripId) => (data.expenses || []).filter((e) => e.tripId === tripId);
        const importedExpenses = expensesOf(importedTripId);
        const sourceExpenses = expensesOf(SOURCE_TRIP_ID);
        expect(importedExpenses).toHaveLength(SEED_EXPENSES.length);
        for (const seed of SEED_EXPENSES) {
            const match = importedExpenses.find((e) => e.label === seed.label);
            expect(match, `imported expense "${seed.label}" exists`).toBeTruthy();
            expect(match.value).toBeCloseTo(seed.value, 6);
            expect(match.currency).toBe(seed.currency);
            expect(match.who).toBe(seed.who);
            expect(match.date).toBe(seed.date);
            expect(match.country).toBe(seed.country);
            expect(match.id).not.toBe(seed.id);
            // euro_value is server-frozen at write time and must carry
            // VERBATIM through export→import (money invariant: settlements/
            // budgets math reads the nominal frozen value, so an import
            // that recomputed it would silently change historical totals).
            const sourceMatch = sourceExpenses.find((e) => e.id === seed.id);
            expect(sourceMatch).toBeTruthy();
            expect(match.euroValue).toBe(sourceMatch.euroValue);
        }

        // ── checklist (media column) round-trip ──
        // Media never rides /api/data (R12 invariant) — read it from the
        // dedicated per-trip endpoint, exactly like the app does on open.
        const importedMediaRes = await page.request.get(`/api/trips/${importedTripId}/media`, {
            headers: auth.headers,
        });
        expect(importedMediaRes.ok()).toBe(true);
        const importedMedia = await importedMediaRes.json();
        expect(importedMedia.checklist).toEqual(SEED_CHECKLIST);
        // No media binaries were seeded, so the other arrays round-trip empty.
        expect(importedMedia.photos).toEqual([]);
        expect(importedMedia.documents).toEqual([]);

        // ── source untouched ──
        // Export is read-only and import only INSERTs a new trip — the
        // source rows must survive with their exact original ids/content.
        const sourceDays = daysOf(SOURCE_TRIP_ID);
        expect(sourceDays.map((d) => d.id).sort()).toEqual(SEED_DAYS.map((d) => d.id).sort());
        expect(sourceExpenses.map((e) => e.id).sort()).toEqual(SEED_EXPENSES.map((e) => e.id).sort());
        const sourceMediaRes = await page.request.get(`/api/trips/${SOURCE_TRIP_ID}/media`, {
            headers: auth.headers,
        });
        expect(sourceMediaRes.ok()).toBe(true);
        expect((await sourceMediaRes.json()).checklist).toEqual(SEED_CHECKLIST);
        expect(source.name).toBe(TRIP_NAME);
    });
});
