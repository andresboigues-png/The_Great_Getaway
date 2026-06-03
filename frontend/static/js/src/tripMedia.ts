// tripMedia.js — Helpers for the per-trip "documents" and "photos"
// stores plus the legacy day-level tickets/photos arrays.
//
// The Documents tab and the Photos tab on Home present a UNION view:
//   - `trip.documents[]` / `trip.photos[]` — the new canonical stores,
//     each item carries an optional `dayId` (no dayId = trip-wide).
//   - `day.tickets[]` / `day.photos[]` — legacy per-day arrays. The
//     existing data continues to live there until the user deletes it,
//     so old trips don't lose anything when this feature lands.
//
// Read sites should always consume the union via getAllTrip*() so the
// distinction is invisible to UI code. Write sites always go to the
// new trip-level store.
//
// Item shapes:
//   Document: { id, name, url, dayId?, addedAt? }
//   Photo:    { id, src,  dayId?, addedAt? }
//
// Each item from the union also carries a synthesised `_source` field
// ('trip' | 'day') so delete handlers know which array to splice.

import { STATE } from './state.js';
import { generateId } from './utils.js';
import type { Trip, TripDocument as BaseTripDocument, TripPhoto as BaseTripPhoto } from './types';

/** Same as `TripDocument` from types but with an extra `_source` tag the
 *  union view (getAllTripDocuments) attaches so delete handlers know
 *  whether to splice the trip-level or legacy day-level array. */
type TripDocument = BaseTripDocument & { _source?: 'trip' | 'day' };
type TripPhoto = BaseTripPhoto & { _source?: 'trip' | 'day' };

/** Trips passed in are sometimes the active trip (always present) and
 *  sometimes a `.find()` result (maybe undefined); accept both. */
type MaybeTrip = Trip | null | undefined;

/** Pull every document tied to this trip — both trip-level entries AND
 *  legacy day.tickets entries surfaced as if they had `dayId` set. */
export function getAllTripDocuments(trip: MaybeTrip): TripDocument[] {
    if (!trip) return [];
    const tripScoped: TripDocument[] = (Array.isArray(trip.documents) ? trip.documents : [])
        .map((d) => ({ ...d, _source: 'trip' as const }));
    const days = (STATE.tripDays || []).filter((d) => d.tripId === trip.id);
    const dayScoped: TripDocument[] = days.flatMap((d) =>
        (Array.isArray(d.tickets) ? d.tickets : []).map((t, i) => ({
            // Legacy day.tickets entries don't carry an id;
            // synthesise one from `${dayId}#${index}` so delete
            // handlers can find them again. Stable as long as
            // the array length doesn't shift while the user is
            // mid-interaction.
            id: t.id || `${d.id}#${i}`,
            name: t.name || 'Document',
            url: t.url || '',
            dayId: d.id,
            // exactOptionalPropertyTypes: only set addedAt when present
            // (legacy rows have none) — don't pass an explicit undefined.
            ...(t.addedAt !== undefined ? { addedAt: t.addedAt } : {}),
            _source: 'day' as const,
        })),
    );
    return [...tripScoped, ...dayScoped];
}

/** Same idea as getAllTripDocuments — union of trip.photos + day.photos. */
export function getAllTripPhotos(trip: MaybeTrip): TripPhoto[] {
    if (!trip) return [];
    const tripScoped: TripPhoto[] = (Array.isArray(trip.photos) ? trip.photos : [])
        .map((p) => ({ ...p, _source: 'trip' as const }));
    const days = (STATE.tripDays || []).filter((d) => d.tripId === trip.id);
    // Legacy day.photos is a flat array of strings (URLs);
    // promote to the object shape so the union has uniform
    // fields.
    const dayScoped: TripPhoto[] = days.flatMap((d) =>
        (Array.isArray(d.photos) ? d.photos : []).map((src: string, i: number) => ({
            id: `${d.id}#${i}`,
            src,
            dayId: d.id,
            _source: 'day' as const,
        })),
    );
    return [...tripScoped, ...dayScoped];
}

/** Filter the union to a specific day. `dayId` may be null for
 *  trip-wide-only items (those with no dayId on the trip-level
 *  store). */
export function getDocumentsForDay(trip: MaybeTrip, dayId: string | null): TripDocument[] {
    return getAllTripDocuments(trip).filter((d) => d.dayId === dayId);
}
export function getPhotosForDay(trip: MaybeTrip, dayId: string | null): TripPhoto[] {
    return getAllTripPhotos(trip).filter((p) => p.dayId === dayId);
}

/** Append a new trip-level document. Returns the appended entry so
 *  callers can use the assigned id for follow-up actions. */
export function addTripDocument(
    trip: MaybeTrip,
    { name, url, dayId = null }: { name: string; url: string; dayId?: string | null },
): TripDocument | null {
    if (!trip || !name || !url) return null;
    if (!Array.isArray(trip.documents)) trip.documents = [];
    const entry: TripDocument = {
        id: `doc-${generateId()}`,
        name,
        url,
        dayId: dayId || null,
        addedAt: new Date().toISOString(),
    };
    trip.documents.push(entry);
    return entry;
}

/** Append a new trip-level photo. */
export function addTripPhoto(
    trip: MaybeTrip,
    { src, dayId = null }: { src: string; dayId?: string | null },
): TripPhoto | null {
    if (!trip || !src) return null;
    if (!Array.isArray(trip.photos)) trip.photos = [];
    const entry: TripPhoto = {
        id: `photo-${generateId()}`,
        src,
        dayId: dayId || null,
        addedAt: new Date().toISOString(),
    };
    trip.photos.push(entry);
    return entry;
}

/** Remove a document by id. Looks in BOTH stores so legacy day.tickets
 *  entries get cleaned up too — the union view obscures the source, so
 *  the user's "delete" interaction shouldn't have to care.
 *
 *  Returns the source it was removed from ('trip' | 'day' | null) so
 *  callers can decide whether to upsertTrip vs upsertDay. */
export function removeTripDocument(trip: MaybeTrip, id: string): 'trip' | 'day' | null {
    if (!trip || !id) return null;
    if (Array.isArray(trip.documents)) {
        const before = trip.documents.length;
        trip.documents = trip.documents.filter((d) => d.id !== id);
        if (trip.documents.length !== before) return 'trip';
    }
    // Legacy day.tickets entries — id is `${dayId}#${index}`.
    const hashIdx = id.indexOf('#');
    if (hashIdx > 0) {
        const dayId = id.slice(0, hashIdx);
        const idx = parseInt(id.slice(hashIdx + 1), 10);
        const day = (STATE.tripDays || []).find((d) => d.id === dayId);
        if (day && Array.isArray(day.tickets) && Number.isFinite(idx) && idx >= 0 && idx < day.tickets.length) {
            day.tickets.splice(idx, 1);
            return 'day';
        }
    }
    return null;
}

/** Same shape as removeTripDocument, but for photos. */
export function removeTripPhoto(trip: MaybeTrip, id: string): 'trip' | 'day' | null {
    if (!trip || !id) return null;
    if (Array.isArray(trip.photos)) {
        const before = trip.photos.length;
        trip.photos = trip.photos.filter((p) => p.id !== id);
        if (trip.photos.length !== before) return 'trip';
    }
    const hashIdx = id.indexOf('#');
    if (hashIdx > 0) {
        const dayId = id.slice(0, hashIdx);
        const idx = parseInt(id.slice(hashIdx + 1), 10);
        const day = (STATE.tripDays || []).find((d) => d.id === dayId);
        if (day && Array.isArray(day.photos) && Number.isFinite(idx) && idx >= 0 && idx < day.photos.length) {
            day.photos.splice(idx, 1);
            return 'day';
        }
    }
    return null;
}

/** Edit name / url / dayId of an existing document. Looks in BOTH
 *  stores so both new trip-level and legacy day.tickets entries can
 *  be renamed without the user having to know which list they live in.
 *
 *  Returns the source it found the doc in ('trip' | 'day' | null) so
 *  callers can decide whether to upsertTrip vs upsertDay.
 *
 *  Note: legacy day.tickets entries don't carry a stable id — their
 *  synthesized id is `${dayId}#${index}`. Renaming one is fine since
 *  we keep the array index. But moving the doc between days would
 *  break the index reference, so dayId reassignment is REJECTED on
 *  legacy entries (matches setDocumentDay's behaviour).
 */
export function updateTripDocument(
    trip: MaybeTrip,
    id: string,
    patch: { name?: string; url?: string; dayId?: string | null },
): 'trip' | 'day' | null {
    if (!trip || !id || !patch) return null;
    if (Array.isArray(trip.documents)) {
        const entry = trip.documents.find((d) => d.id === id);
        if (entry) {
            if (typeof patch.name === 'string') entry.name = patch.name;
            if (typeof patch.url === 'string') entry.url = patch.url;
            if (patch.dayId !== undefined) entry.dayId = patch.dayId || null;
            return 'trip';
        }
    }
    // Legacy day.tickets entry — id is `${dayId}#${index}`.
    const hashIdx = id.indexOf('#');
    if (hashIdx > 0) {
        const dayId = id.slice(0, hashIdx);
        const idx = parseInt(id.slice(hashIdx + 1), 10);
        const day = (STATE.tripDays || []).find((d) => d.id === dayId);
        if (day && Array.isArray(day.tickets) && Number.isFinite(idx) && idx >= 0 && idx < day.tickets.length) {
            // Bounds-checked above, so the index is in range.
            const t = day.tickets[idx]!;
            if (typeof patch.name === 'string') t.name = patch.name;
            if (typeof patch.url === 'string') t.url = patch.url;
            // dayId reassignment is intentionally NOT supported
            // here.
            return 'day';
        }
    }
    return null;
}

/** Move a document from trip-wide → day-scoped or vice-versa. Only
 *  works for trip-level entries (legacy day.tickets entries can't be
 *  reassigned without losing the legacy index reference; we treat
 *  them as immutable until the user deletes + re-adds). */
export function setDocumentDay(trip: MaybeTrip, id: string, dayId: string | null): boolean {
    if (!trip || !Array.isArray(trip.documents)) return false;
    const entry = trip.documents.find((d) => d.id === id);
    if (!entry) return false;
    entry.dayId = dayId || null;
    return true;
}
export function setPhotoDay(trip: MaybeTrip, id: string, dayId: string | null): boolean {
    if (!trip || !Array.isArray(trip.photos)) return false;
    const entry = trip.photos.find((p) => p.id === id);
    if (!entry) return false;
    entry.dayId = dayId || null;
    return true;
}

// ── Gmail deep-link helpers ───────────────────────────────────────────
// Path A from the rollout plan: a "Search Gmail for bookings" button
// that opens Gmail in a new tab with a smart pre-filled query.
//
// Search syntax docs: https://support.google.com/mail/answer/7190
//
// Two earlier failures, both fixed here:
//
// 1. `after:tripStart before:tripEnd` filtered by the email's Date
//    header, which excluded the very emails the user wants — booking
//    confirmations are sent weeks-to-months BEFORE the trip itself.
//    A test user got zero results on a forwarded "Fw: Your itinerary
//    for Atlanta" because the email was received in Feb but the trip
//    is in June. Dropped the date filter entirely.
//
// 2. Using `trip.country` directly as the location term wasn't enough.
//    For an Atlanta trip the user might have entered country as
//    "USA", "Atlanta, GA", "Atlanta, Georgia, USA", etc. — and many
//    booking emails subject-mention the city, not the country. Now
//    the location group is an OR over multiple alternatives:
//    `(trip.name OR firstChunkOfCountry OR fullCountry)`, with
//    multi-word terms quoted. That way at least one alternative
//    is likely to match what the email actually says.

const BOOKING_KEYWORDS = 'booking OR confirmation OR reservation OR ticket OR itinerary OR voucher OR boarding';

/** Wrap a search term in quotes if it contains spaces. Single-word
 *  terms stay unquoted because Gmail handles them best that way. */
function gmailQuote(term: string): string {
    return term.includes(' ') ? `"${term.replace(/"/g, '')}"` : term;
}

/** Pull location alternatives from a trip — trip.name, the first
 *  chunk of trip.country (split on comma or " - " for legacy
 *  "USA - California" entries), and the full country if it has no
 *  ambiguous separators. De-duplicates and drops empties. */
function locationAlternatives(trip: Trip): string[] {
    const out: string[] = [];
    const push = (s: string | null | undefined) => {
        const v = (s || '').trim();
        if (v && !out.includes(v)) out.push(v);
    };
    push(trip.name || '');
    const country = (trip.country || '').trim();
    if (country) {
        // First chunk (handles "Atlanta, GA" → "Atlanta", "USA -
        // California" → "USA"). Best signal in most cases.
        const firstChunk = country.split(/[,–-]/)[0]!.trim();
        push(firstChunk);
        // Full country only if it didn't split — otherwise
        // commas/hyphens confuse Gmail's tokeniser.
        if (firstChunk === country) push(country);
    }
    return out;
}

/** Build a Gmail-search URL for a trip — location-alternatives
 *  OR group + booking-keyword OR group, no date filter. Result:
 *  `("Atlanta dad trip" OR Atlanta) (booking OR confirmation OR …)`
 *  which Gmail interprets as `(any-location-term) AND (any-keyword)`.
 *  Wide enough to catch forwarded confirmations sent months ahead;
 *  tight enough to filter out unrelated emails. */
export function buildGmailTripSearchUrl(trip: MaybeTrip): string | null {
    if (!trip) return null;
    const locations = locationAlternatives(trip);
    const parts: string[] = [];
    if (locations.length > 0) {
        parts.push(`(${locations.map(gmailQuote).join(' OR ')})`);
    }
    parts.push(`(${BOOKING_KEYWORDS})`);
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(parts.join(' '))}`;
}
