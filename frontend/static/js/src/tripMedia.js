// @ts-check
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

/** @typedef {{id?: string, name: string, url: string, dayId?: string|null, addedAt?: string, _source?: 'trip'|'day'}} TripDocument */
/** @typedef {{id?: string, src: string, dayId?: string|null, addedAt?: string, _source?: 'trip'|'day'}} TripPhoto */

/** Pull every document tied to this trip — both trip-level entries AND
 *  legacy day.tickets entries surfaced as if they had `dayId` set. */
export function getAllTripDocuments(trip) {
    if (!trip) return [];
    /** @type {TripDocument[]} */
    const tripScoped = (Array.isArray(trip.documents) ? trip.documents : [])
        .map(d => ({ ...d, _source: /** @type {'trip'} */ ('trip') }));
    const days = (STATE.tripDays || []).filter(d => d.tripId === trip.id);
    /** @type {TripDocument[]} */
    const dayScoped = days.flatMap(d =>
        (Array.isArray(d.tickets) ? d.tickets : []).map((t, i) => ({
            // Legacy day.tickets entries don't carry an id; synthesise
            // one from `${dayId}#${index}` so delete handlers can find
            // them again. Stable as long as the array length doesn't
            // shift while the user is mid-interaction.
            id: t.id || `${d.id}#${i}`,
            name: t.name || 'Document',
            url: t.url || '',
            dayId: d.id,
            addedAt: t.addedAt,
            _source: /** @type {'day'} */ ('day'),
        }))
    );
    return [...tripScoped, ...dayScoped];
}

/** Same idea as getAllTripDocuments — union of trip.photos + day.photos. */
export function getAllTripPhotos(trip) {
    if (!trip) return [];
    /** @type {TripPhoto[]} */
    const tripScoped = (Array.isArray(trip.photos) ? trip.photos : [])
        .map(p => ({ ...p, _source: /** @type {'trip'} */ ('trip') }));
    const days = (STATE.tripDays || []).filter(d => d.tripId === trip.id);
    // Legacy day.photos is a flat array of strings (URLs); promote to
    // the object shape so the union has uniform fields.
    /** @type {TripPhoto[]} */
    const dayScoped = days.flatMap(d =>
        (Array.isArray(d.photos) ? d.photos : []).map((src, i) => ({
            id: `${d.id}#${i}`,
            src,
            dayId: d.id,
            _source: /** @type {'day'} */ ('day'),
        }))
    );
    return [...tripScoped, ...dayScoped];
}

/** Filter the union to a specific day. `dayId` may be null for
 *  trip-wide-only items (those with no dayId on the trip-level store). */
export function getDocumentsForDay(trip, dayId) {
    return getAllTripDocuments(trip).filter(d => d.dayId === dayId);
}
export function getPhotosForDay(trip, dayId) {
    return getAllTripPhotos(trip).filter(p => p.dayId === dayId);
}

/** Append a new trip-level document. Returns the appended entry so
 *  callers can use the assigned id for follow-up actions. */
export function addTripDocument(trip, { name, url, dayId = null }) {
    if (!trip || !name || !url) return null;
    if (!Array.isArray(trip.documents)) trip.documents = [];
    /** @type {TripDocument} */
    const entry = {
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
export function addTripPhoto(trip, { src, dayId = null }) {
    if (!trip || !src) return null;
    if (!Array.isArray(trip.photos)) trip.photos = [];
    /** @type {TripPhoto} */
    const entry = {
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
export function removeTripDocument(trip, id) {
    if (!trip || !id) return null;
    if (Array.isArray(trip.documents)) {
        const before = trip.documents.length;
        trip.documents = trip.documents.filter(d => d.id !== id);
        if (trip.documents.length !== before) return /** @type {const} */ ('trip');
    }
    // Legacy day.tickets entries — id is `${dayId}#${index}`.
    const hashIdx = id.indexOf('#');
    if (hashIdx > 0) {
        const dayId = id.slice(0, hashIdx);
        const idx = parseInt(id.slice(hashIdx + 1), 10);
        const day = (STATE.tripDays || []).find(d => d.id === dayId);
        if (day && Array.isArray(day.tickets) && Number.isFinite(idx) && idx >= 0 && idx < day.tickets.length) {
            day.tickets.splice(idx, 1);
            return /** @type {const} */ ('day');
        }
    }
    return null;
}

/** Same shape as removeTripDocument, but for photos. */
export function removeTripPhoto(trip, id) {
    if (!trip || !id) return null;
    if (Array.isArray(trip.photos)) {
        const before = trip.photos.length;
        trip.photos = trip.photos.filter(p => p.id !== id);
        if (trip.photos.length !== before) return /** @type {const} */ ('trip');
    }
    const hashIdx = id.indexOf('#');
    if (hashIdx > 0) {
        const dayId = id.slice(0, hashIdx);
        const idx = parseInt(id.slice(hashIdx + 1), 10);
        const day = (STATE.tripDays || []).find(d => d.id === dayId);
        if (day && Array.isArray(day.photos) && Number.isFinite(idx) && idx >= 0 && idx < day.photos.length) {
            day.photos.splice(idx, 1);
            return /** @type {const} */ ('day');
        }
    }
    return null;
}

/** Move a document from trip-wide → day-scoped or vice-versa. Only
 *  works for trip-level entries (legacy day.tickets entries can't be
 *  reassigned without losing the legacy index reference; we treat
 *  them as immutable until the user deletes + re-adds). */
export function setDocumentDay(trip, id, dayId) {
    if (!trip || !Array.isArray(trip.documents)) return false;
    const entry = trip.documents.find(d => d.id === id);
    if (!entry) return false;
    entry.dayId = dayId || null;
    return true;
}
export function setPhotoDay(trip, id, dayId) {
    if (!trip || !Array.isArray(trip.photos)) return false;
    const entry = trip.photos.find(p => p.id === id);
    if (!entry) return false;
    entry.dayId = dayId || null;
    return true;
}

// ── Gmail deep-link helpers ───────────────────────────────────────────
// Path A from the rollout plan: a "Search Gmail for bookings" button
// that opens Gmail in a new tab with a smart pre-filled query. Two
// flavours, depending on whether the user is searching a whole trip
// or a single day.
//
// Search syntax docs: https://support.google.com/mail/answer/7190
// We use simple AND/OR plus optional `after:` / `before:` operators
// (Gmail wants `YYYY/MM/DD`, NOT ISO). Multiple keywords combine with
// implicit AND; the OR group brackets the booking-related terms so
// any one matches.

const BOOKING_KEYWORDS = 'booking OR confirmation OR reservation OR ticket OR itinerary OR voucher';

/** Build a Gmail-search URL for the whole trip — destination + the
 *  full date range across all days, plus the booking keyword group. */
export function buildGmailTripSearchUrl(trip) {
    if (!trip) return null;
    const destination = (trip.country || '').trim();
    const dateRange = computeTripDateRange(trip);
    /** @type {string[]} */
    const parts = [];
    if (destination) parts.push(destination);
    parts.push(`(${BOOKING_KEYWORDS})`);
    if (dateRange.from) parts.push(`after:${dateRange.from.replace(/-/g, '/')}`);
    if (dateRange.to) parts.push(`before:${dateRange.to.replace(/-/g, '/')}`);
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(parts.join(' '))}`;
}

/** Build a Gmail-search URL for a single day — destination + a tighter
 *  ±1-day window around the day's date + booking keywords. */
export function buildGmailDaySearchUrl(trip, day) {
    if (!trip || !day) return null;
    const destination = (trip.country || '').trim();
    /** @type {string[]} */
    const parts = [];
    if (destination) parts.push(destination);
    parts.push(`(${BOOKING_KEYWORDS})`);
    if (day.date) {
        const d = new Date(day.date);
        if (!isNaN(d.getTime())) {
            const before = new Date(d);
            before.setDate(d.getDate() + 2);
            const after = new Date(d);
            after.setDate(d.getDate() - 1);
            parts.push(`after:${formatDateForGmail(after)}`);
            parts.push(`before:${formatDateForGmail(before)}`);
        }
    }
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(parts.join(' '))}`;
}

/** Earliest → latest dates across all numbered days on this trip.
 *  Used to bracket the Gmail search and surface bookings made within
 *  the trip window without leaking unrelated emails from years prior. */
function computeTripDateRange(trip) {
    const days = (STATE.tripDays || []).filter(d => d.tripId === trip.id && d.date);
    if (days.length === 0) return { from: null, to: null };
    const sorted = [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { from: sorted[0].date, to: sorted[sorted.length - 1].date };
}

function formatDateForGmail(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
}
