// @ts-check
// markedPlaces.js — Helpers for the per-trip "marked places" list.
//
// A MarkedPlace is a Google Place the user has stamped (from the home
// map InfoWindow) for inclusion in either:
//   - the AI planner's prompt context (forAI: true), or
//   - the manual-planning shortlist (forManual: true).
//
// Stored per-trip on `trip.markedPlaces` (serialised as
// `marked_places_json` on the server). All read sites should treat the
// field as optional and default to []; write sites use these helpers
// so the array shape stays consistent.

/**
 * @typedef {object} MarkedPlace
 * @property {string} placeId
 * @property {string} name
 * @property {string} address
 * @property {number} lat
 * @property {number} lng
 * @property {string} icon                Category emoji from POI_CATEGORIES
 * @property {string} color               Category color
 * @property {boolean} forAI              Include in AI planner prompt
 * @property {boolean} forManual          Show in manual shortlist
 * @property {string | null} [dayId]      Optional day assignment (AI honour)
 * @property {'morning'|'afternoon'|'evening'|null} [timeOfDay]
 */

/** Read marked places off a trip object (always returns an array). */
export function getMarkedPlaces(trip) {
    return Array.isArray(trip?.markedPlaces) ? trip.markedPlaces : [];
}

/** Find a marked place by its placeId. Returns the entry or undefined. */
export function findMarkedPlace(trip, placeId) {
    if (!placeId) return undefined;
    return getMarkedPlaces(trip).find(p => p.placeId === placeId);
}

/** Toggle a flag on a marked place — if the place isn't yet tracked,
 *  insert it with this flag set. If both flags end up false after the
 *  toggle, remove the entry entirely so the list stays clean. */
export function toggleMarkedPlaceFlag(trip, place, flag /* 'forAI' | 'forManual' */, cat) {
    if (!trip || !place?.place_id) return;
    if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
    const existing = trip.markedPlaces.find(p => p.placeId === place.place_id);
    if (existing) {
        existing[flag] = !existing[flag];
        if (!existing.forAI && !existing.forManual) {
            trip.markedPlaces = trip.markedPlaces.filter(p => p.placeId !== place.place_id);
        }
        return;
    }
    /** @type {MarkedPlace} */
    const fresh = {
        placeId: place.place_id,
        name: place.name || '',
        address: place.vicinity || place.formatted_address || '',
        lat: place.geometry?.location?.lat?.() ?? place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng?.() ?? place.geometry?.location?.lng ?? 0,
        icon: cat?.icon || '📍',
        color: cat?.color || '#0071e3',
        forAI: flag === 'forAI',
        forManual: flag === 'forManual',
        dayId: null,
        timeOfDay: null,
    };
    trip.markedPlaces.push(fresh);
}

/** Drop a marked place entirely (called from the AI planner panel's
 *  remove button). Safe no-op if the place isn't there. */
export function removeMarkedPlace(trip, placeId) {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    trip.markedPlaces = trip.markedPlaces.filter(p => p.placeId !== placeId);
}

/** Update day / time-of-day assignment on a marked place (or remove the
 *  assignment if both are null). */
export function setMarkedPlaceAssignment(trip, placeId, dayId, timeOfDay) {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find(p => p.placeId === placeId);
    if (!entry) return;
    entry.dayId = dayId || null;
    entry.timeOfDay = timeOfDay || null;
}
