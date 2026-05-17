// @ts-check
// EXIF auto-day-assign e2e (FIXING_ROADMAP §4.9 — coverage gap fill).
//
// Closes the EXIF-side coverage gap noted in photo-lightbox.spec.js's
// header comment. The §4.9 EXIF auto-day-assign feature reads
// DateTimeOriginal from an uploaded photo's metadata and matches it
// against the trip's day dates, assigning the photo to the matching
// day's bucket automatically (rather than dumping everything into the
// Anchor day for manual re-tagging).
//
// Test surface:
//   1. Seed a trip with multiple days, one of which has date 2026-06-02.
//   2. Upload tests/e2e/fixtures/photo-2026-06-02.jpg — a 393-byte JPEG
//      with EXIF DateTime + DateTimeOriginal both set to 2026-06-02.
//   3. After the upload completes, the new photo card's day-chip must
//      show the matching day's number, NOT the Anchor.
//   4. As a negative-space pin, also upload a photo to a trip whose
//      days DON'T include 2026-06-02 — should fall back to Anchor.
//
// Why a real fixture file (not a synthesized Blob in page.evaluate):
//   - exifr's parser is what matters here; testing through the actual
//     File upload path (input.setInputFiles) exercises the real
//     contract — File API → exifr.parse → readPhotoDate →
//     resolveDayIdForFile → addTripPhoto. A synthesized Blob would
//     skip the exifr parse, which is the part we want to verify.
//   - The fixture is 393 bytes — trivially small. Regeneration is
//     deterministic via scripts/generate_test_fixtures.py.

import { test, expect } from '@playwright/test';
import { getAuthForApi, createTripViaApi, openFreshApp } from './helpers.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const PHOTO_2026_06_02 = path.join(FIXTURE_DIR, 'photo-2026-06-02.jpg');

let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter += 1;
    return `${prefix}-${Date.now()}-${_idCounter}`;
}

/** Seed a trip + an anchor day + N numbered days at the given dates.
 *  Returns {tripId, days} so the test can match day-id ↔ date.
 *  @param {import('@playwright/test').Page} page
 *  @param {{ Authorization: string }} headers
 *  @param {string[]} numberedDayDates — ISO dates, one per numbered day.
 */
async function seedTripWithDays(page, headers, numberedDayDates) {
    const tripId = await createTripViaApi(page, headers, {
        id: uniqueId('trip'),
        name: 'EXIF e2e trip',
        country: 'Portugal',
    });
    // Anchor day — required for the Path component to expose the
    // 📸 Photos button. dayNumber=0 is the Anchor convention.
    const anchorId = uniqueId('day-anchor');
    await page.request.post('/api/days', {
        headers,
        data: {
            day: {
                id: anchorId,
                tripId,
                dayNumber: 0,
                date: '',
                name: 'Trip Anchor',
            },
        },
    });
    /** @type {{ id: string; dayNumber: number; date: string }[]} */
    const days = [{ id: anchorId, dayNumber: 0, date: '' }];
    // Numbered days at the requested dates.
    for (let i = 0; i < numberedDayDates.length; i += 1) {
        const dayDate = numberedDayDates[i];
        const id = uniqueId(`day-${i + 1}`);
        await page.request.post('/api/days', {
            headers,
            data: {
                day: {
                    id,
                    tripId,
                    dayNumber: i + 1,
                    date: dayDate,
                    name: `Day ${i + 1}`,
                },
            },
        });
        days.push({ id, dayNumber: i + 1, date: dayDate });
    }
    return { tripId, days };
}

/** Drive the photo-upload flow: open the modal, hand the file to the
 *  hidden input, wait for the upload toast + a new card to land. */
async function uploadFixture(page, filePath, expectedCardCountAfter) {
    await page.locator('.path-photos-btn').first().click();
    // The file input is hidden — set the file directly. Browser-native
    // upload then fires the existing change handler which runs the
    // EXIF parse + uploadMedia + addTripPhoto pipeline.
    await page.locator('#addPhotosInput').setInputFiles(filePath);
    // Wait for the modal to repaint with the new card. The upload
    // path emits 'state:changed' + upsertTrip + repaint(); the new
    // card appearing is the most reliable user-facing signal.
    await expect(page.locator('.trip-photo-card[data-photo-kind="image"]')).toHaveCount(expectedCardCountAfter);
}

test.describe('EXIF auto-day-assign (§4.9)', () => {
    test.beforeEach(async ({}, testInfo) => {
        if (testInfo.project.name === 'chromium-mobile') test.skip();
    });

    test('photo with matching DateTimeOriginal lands on the right day', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        // 3-day trip; day 2 sits on the fixture's EXIF date.
        const { tripId, days } = await seedTripWithDays(page, auth.headers, ['2026-06-01', '2026-06-02', '2026-06-03']);
        // Set this trip active so the Path component renders our trip
        // (not whatever was active for the test user previously).
        await openFreshApp(page, auth.user.id);
        await page.evaluate((id) => {
            try {
                const raw = localStorage.getItem('theGreatEscapeState');
                const parsed = raw ? JSON.parse(raw) : {};
                parsed.activeTripId = id;
                localStorage.setItem('theGreatEscapeState', JSON.stringify(parsed));
            } catch (_) {
                /* ignore */
            }
        }, tripId);
        await page.goto('/');

        await uploadFixture(page, PHOTO_2026_06_02, 1);

        // The new card carries a `.trip-photo-day-select` <select>
        // whose selected option text is "Day N" where N matches the
        // day with date 2026-06-02. We seeded that as Day 2.
        const select = page.locator('.trip-photo-day-select').first();
        await expect(select).toHaveValue(days[2].id);
        // Sanity: the option label visible to the user.
        const selectedLabel = await select.evaluate((el) => {
            const sel = /** @type {HTMLSelectElement} */ (el);
            return sel.options[sel.selectedIndex]?.textContent?.trim() || '';
        });
        expect(selectedLabel).toBe('Day 2');
    });

    test('photo with no day-date match falls back to Anchor', async ({ page }) => {
        const auth = await getAuthForApi(page, uniqueId('owner'));
        // 3-day trip in a DIFFERENT year — EXIF date 2026-06-02 won't
        // match any of these, so the upload must land on Anchor.
        const { tripId, days } = await seedTripWithDays(page, auth.headers, ['2025-09-10', '2025-09-11', '2025-09-12']);
        await openFreshApp(page, auth.user.id);
        await page.evaluate((id) => {
            try {
                const raw = localStorage.getItem('theGreatEscapeState');
                const parsed = raw ? JSON.parse(raw) : {};
                parsed.activeTripId = id;
                localStorage.setItem('theGreatEscapeState', JSON.stringify(parsed));
            } catch (_) {
                /* ignore */
            }
        }, tripId);
        await page.goto('/');

        await uploadFixture(page, PHOTO_2026_06_02, 1);

        const select = page.locator('.trip-photo-day-select').first();
        // Anchor is days[0] (dayNumber=0).
        await expect(select).toHaveValue(days[0].id);
        const selectedLabel = await select.evaluate((el) => {
            const sel = /** @type {HTMLSelectElement} */ (el);
            return sel.options[sel.selectedIndex]?.textContent?.trim() || '';
        });
        // The option label for the Anchor includes the anchor glyph.
        expect(selectedLabel).toContain('Anchor');
    });
});
