// markedPlaces.js — Helpers for the per-trip "marked places" list.
//
// A MarkedPlace is a Google Place the user has stamped from the home
// map InfoWindow ("Add to to-do"). It powers the trip's To-do list
// (the Path → To do list tab on Home, plus the per-day "From your
// to-do list" row in the Day Detail modal) AND the AI planner's
// pre-ticked-by-default "include in this generation" checklist.
//
// Two flags govern this:
//   - forManual: present in the To-do list. THIS is what the to-do
//     surface filters by. New items default to true.
//   - forAI:     ticked in the AI planner. The AI generation prompt
//     only includes items where forAI is true. Defaults to true on
//     new items so the common case ("yes, consider this place") needs
//     zero clicks; the user can untick in the AI panel for places
//     they've added but want to slot manually.
//
// Removing an item from the To-do list deletes the entry entirely
// (both flags fall to false). The legacy "Mark for AI" surface that
// used to set forAI without forManual was retired when the two lists
// were merged; state.js loadState() back-fills any pre-merge entries
// (forAI: true, forManual: false) so they show up in the to-do list.
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
 * @property {boolean} forAI              Ticked in AI planner — included in generation
 * @property {boolean} forManual          Lives in the To-do list
 * @property {string | null} [dayId]      Optional day assignment (AI honour)
 * @property {'morning'|'afternoon'|'evening'|null} [timeOfDay]
 */

/** Read marked places off a trip object (always returns an array). */
export function getMarkedPlaces(trip: any): any[] {
    return Array.isArray(trip?.markedPlaces) ? trip.markedPlaces : [];
}

/** Find a marked place by its placeId. Returns the entry or undefined. */
export function findMarkedPlace(trip: any, placeId: string | null | undefined) {
    if (!placeId) return undefined;
    return getMarkedPlaces(trip).find((p: any) => p.placeId === placeId);
}

/** Drop a marked place entirely (called from the AI planner panel's
 *  remove button and from the Home → To do list tab). Safe no-op if
 *  the place isn't there. */
export function removeMarkedPlace(trip: any, placeId: string): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    trip.markedPlaces = trip.markedPlaces.filter((p: any) => p.placeId !== placeId);
}

/** Update day / time-of-day assignment on a marked place (or remove the
 *  assignment if both are null). */
export function setMarkedPlaceAssignment(
    trip: any,
    placeId: string,
    dayId: string | null,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | null,
): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find((p: any) => p.placeId === placeId);
    if (!entry) return;
    entry.dayId = dayId || null;
    entry.timeOfDay = timeOfDay || null;
}

/** Toggle a place's membership in the To-do list — the unified surface
 *  (Path → To do list tab on Home + the AI planner's pre-ticked list).
 *
 *  Add semantics: if the place isn't tracked, insert with forManual=true
 *  AND forAI=true so the AI panel pre-ticks it. The "common case" assumption
 *  is "I added this place to consider; yes the AI should consider it"; the
 *  user unticks in the AI panel for places they want to slot manually only.
 *
 *  Remove semantics: if the place IS tracked, drop it entirely — there's no
 *  "in to-do but invisible" state in the merged model.
 *
 *  @param {any} trip
 *  @param {any} place — Google Places result (uses place.place_id, name, etc.)
 *  @param {{icon?:string, color?:string}=} cat — POI_CATEGORIES entry for visuals
 */
export function toggleTodoListMembership(trip: any, place: any, cat?: { icon?: string; color?: string }): void {
    if (!trip || !place?.place_id) return;
    if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
    const existing = trip.markedPlaces.find((p: any) => p.placeId === place.place_id);
    if (existing) {
        // Already in to-do — remove entirely.
        trip.markedPlaces = trip.markedPlaces.filter((p: any) => p.placeId !== place.place_id);
        return;
    }
    /** @type {MarkedPlace} */
    const fresh: any = {
        placeId: place.place_id,
        name: place.name || '',
        address: place.vicinity || place.formatted_address || '',
        lat: place.geometry?.location?.lat?.() ?? place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng?.() ?? place.geometry?.location?.lng ?? 0,
        icon: cat?.icon || '📍',
        color: cat?.color || '#9b59b6',
        forAI: true,        // pre-ticked for AI by default — see helper docs
        forManual: true,    // present in the To-do list
        dayId: null,
        timeOfDay: null,
        // Phase G slice 2: when the InfoWindow's place came from a
        // Places search (it always does — POI pills + free-form
        // search both go through PlacesService), it already has a
        // place_id so we mark verified:true. Rating + photo aren't
        // available from the JS Places client without a separate
        // getDetails call (a cost we don't want to pay automatically
        // for every "Add to to-do" click); to-do markers still render
        // since lat/lng are on this entry. Items added via the
        // home-map flow won't show photos in the to-do list, but
        // items added via Accept Plan WILL — the gap closes when the
        // user runs an AI generation that includes the place.
        verified: true,
    };
    if (place.rating != null) fresh.rating = place.rating;
    if (place.user_ratings_total != null) fresh.userRatingsTotal = place.user_ratings_total;
    if (place.url) fresh.mapsUrl = place.url;
    trip.markedPlaces.push(fresh);
}

/** Toggle just the AI tick on an existing to-do entry. Used by the AI
 *  planner's checkbox. No-op if the entry isn't found. */
export function toggleMarkedPlaceForAI(trip: any, placeId: string): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find((p: any) => p.placeId === placeId);
    if (!entry) return;
    entry.forAI = !entry.forAI;
}

/** Phase G slice 2 — verified-place item from a Gemini-enriched
 *  itinerary. The shape emitted by `_enrich_itinerary` server-side
 *  (see routes/integrations.py). */
export interface VerifiedAIItem {
    text: string;
    verified: boolean;
    placeId?: string;
    photoUrl?: string;
    rating?: number;
    userRatingsTotal?: number;
    address?: string;
    mapsUrl?: string;
    verifiedName?: string;
    lat?: number;
    lng?: number;
}

/** Phase G slice 2 — push a verified AI itinerary item into the
 *  trip's to-do list, carrying the full Place details so the to-do
 *  list, map markers, and AI day cards all share one source of
 *  truth. Three behaviours by placeId:
 *
 *    1. Place isn't tracked yet  → insert a fresh entry stamped with
 *       this item's dayId / timeOfDay so the home map's per-day
 *       to-do filter can find it.
 *    2. Place is tracked AND has a different dayId → re-stamp with
 *       this dayId. The most-recent Accept Plan wins; users who run
 *       multiple AI generations don't end up with stale day pinning.
 *    3. Place is tracked AND already has THIS dayId → no-op
 *       (idempotent — safe to call from re-renders).
 *
 *  Unverified items (verified:false OR no placeId) are skipped — we
 *  only auto-add places we can identify, otherwise we'd litter the
 *  to-do list with the LLM's freeform suggestions. */
export function addOrUpdatePlaceFromVerified(
    trip: any,
    item: VerifiedAIItem,
    dayId: string | null,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | null = null,
): void {
    if (!trip || !item || !item.verified || !item.placeId) return;
    if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
    const existing = trip.markedPlaces.find((p: any) => p.placeId === item.placeId);
    if (existing) {
        // Refresh rich fields so a second AI run picks up updated
        // photo URLs / ratings (these can drift, e.g. ratings tick
        // up over time). Day pinning re-stamps to the most recent
        // generation's assignment.
        existing.dayId = dayId ?? existing.dayId ?? null;
        existing.timeOfDay = timeOfDay ?? existing.timeOfDay ?? null;
        existing.verified = true;
        if (item.verifiedName) existing.verifiedName = item.verifiedName;
        if (item.photoUrl) existing.photoUrl = item.photoUrl;
        if (typeof item.rating === 'number') existing.rating = item.rating;
        if (typeof item.userRatingsTotal === 'number') existing.userRatingsTotal = item.userRatingsTotal;
        if (item.address) existing.address = item.address;
        if (item.mapsUrl) existing.mapsUrl = item.mapsUrl;
        // Don't flip forManual / forAI off — the user may have
        // already curated these flags on a previous addition.
        if (!existing.forManual) existing.forManual = true;
        return;
    }
    const fresh: any = {
        placeId: item.placeId,
        name: item.verifiedName || item.text || '',
        address: item.address || '',
        // Lat/lng come from Places API NEW's location field — added
        // to the FieldMask in routes/integrations.py at Basic-tier
        // pricing (free since we're already paying Advanced for
        // rating). Falls back to 0 if a future Places response drops
        // location for some reason — to-do marker rendering checks
        // truthy lat/lng so 0,0 won't accidentally drop a marker
        // off the coast of West Africa.
        lat: typeof item.lat === 'number' ? item.lat : 0,
        lng: typeof item.lng === 'number' ? item.lng : 0,
        icon: '📋',
        color: '#9b59b6',
        forAI: true,
        forManual: true,
        dayId: dayId || null,
        timeOfDay: timeOfDay || null,
        verified: true,
        verifiedName: item.verifiedName,
        photoUrl: item.photoUrl,
        rating: item.rating,
        userRatingsTotal: item.userRatingsTotal,
        mapsUrl: item.mapsUrl,
    };
    trip.markedPlaces.push(fresh);
}
