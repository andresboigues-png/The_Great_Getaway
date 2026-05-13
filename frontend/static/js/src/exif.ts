// src/exif.ts — FIXING_ROADMAP §4.9 sub-item.
//
// Read the photo's capture date from its EXIF metadata and resolve it
// to the matching trip day. The point: drop a photo from your camera
// roll and it lands on the right day automatically, instead of
// everything piling into the Anchor bucket where you have to manually
// re-tag each one.
//
// We use `exifr` rather than hand-rolling a TIFF parser because:
//   - JPEG, HEIC, PNG, WebP all carry EXIF in different container
//     layouts. HEIC in particular is non-trivial — iPhones default
//     to HEIC and we want this to "just work" there.
//   - exifr also handles timezone-shifted timestamps via the
//     OffsetTimeOriginal tag where present, so "Sep 14 2024 23:50
//     in Lisbon" doesn't accidentally bucket into Sep 15.
//
// exifr is dynamic-imported below so the ~27KB gz it weighs only
// downloads when the user actually opens the photo-upload flow.
// Cold-load of the home page stays ~75KB lighter than a static
// `import exifr from 'exifr'` would make it. Vite handles the
// chunk split automatically — the dynamic import becomes its own
// JS chunk in the build output.
//
// Failure mode is silent + benign: anything we can't parse returns
// `null`, and the caller falls back to the anchor day. The user can
// still re-tag manually.

import { STATE } from './state.js';

// Memoize the exifr module load — first photo-upload triggers the
// chunk fetch, subsequent uploads reuse it. The promise itself is
// cached, so a parallel batch upload doesn't kick off multiple
// concurrent chunk loads racing each other.
let _exifrModule: Promise<typeof import('exifr').default> | null = null;
function _loadExifr() {
    if (!_exifrModule) {
        _exifrModule = import('exifr').then((m) => m.default);
    }
    return _exifrModule;
}


/** Pull the capture date from a File's EXIF metadata. Returns the
 *  canonical YYYY-MM-DD string (matches trip_days.date in storage),
 *  or null if no usable date is available.
 *
 *  Tries `DateTimeOriginal` (camera capture time) first, then falls
 *  back to `DateTime` (file modification time) — same precedence Apple
 *  Photos / Google Photos use. Both come back from exifr as JS Date
 *  objects; we render them as YYYY-MM-DD in the LOCAL TIME ZONE so the
 *  matching against `trip_days.date` (also local-day-grained) is
 *  intuitive: a sunset shot at 18:00 local time goes to that day's
 *  bucket, not "the day after" in UTC. */
export async function readPhotoDate(file: File | Blob): Promise<string | null> {
    if (!file) return null;
    try {
        const exifr = await _loadExifr();
        // pick: small allowlist — we don't need orientation / GPS /
        // make/model here, just the two date tags. Keeps the parse
        // fast and the memory footprint low for batch uploads.
        const parsed = await exifr.parse(file, {
            pick: ['DateTimeOriginal', 'DateTime', 'CreateDate'],
        }) as Record<string, Date | undefined> | undefined;
        if (!parsed) return null;
        const dt = parsed.DateTimeOriginal
            ?? parsed.CreateDate
            ?? parsed.DateTime;
        if (!dt || !(dt instanceof Date) || isNaN(dt.getTime())) return null;
        // Local-day key — avoids the midnight-near-DST UTC shift that
        // would push an 11pm photo into the next day's bucket.
        const yyyy = dt.getFullYear().toString().padStart(4, '0');
        const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
        const dd = dt.getDate().toString().padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    } catch {
        // exifr throws on truly corrupt files or unsupported containers.
        // Quiet failure — we degrade to anchor-day default.
        return null;
    }
}


/** Best-effort: find the trip day whose `date` matches the photo's
 *  EXIF capture date. Returns the day's id, or null when no day on
 *  the trip has that date (photo predates the trip / was taken
 *  off-trip / EXIF missing).
 *
 *  Caller chains this with the existing anchor-day fallback:
 *
 *      const dayId = (await resolveDayIdForFile(file, trip)) ?? anchorDayId;
 *      addTripPhoto(trip, { src, dayId });
 */
export async function resolveDayIdForFile(
    file: File | Blob,
    trip: { id: string },
): Promise<string | null> {
    const photoDate = await readPhotoDate(file);
    if (!photoDate) return null;
    // Reads STATE directly rather than receiving the days as a
    // parameter — the caller is already in the middle of an upload
    // loop and has STATE in scope. Keeping the API a one-arg call
    // makes the upload-loop diff minimal.
    const day = (STATE.tripDays || []).find(
        (d) => d.tripId === trip.id && d.date === photoDate,
    );
    return day ? day.id : null;
}
