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

import { guessCategoryByTypes } from './pages/home/poiCategories.js';
import type { Trip, MarkedPlace } from './types';

/** Trips passed in are sometimes the active trip (present) and sometimes
 *  a `.find()` result (maybe undefined); accept both. */
type MaybeTrip = Trip | null | undefined;

/** A raw Google Places result. Externally typed by the Maps SDK (declared
 *  `any` in types.d.ts) — kept loose on purpose at this boundary. */
type PlaceResult = google.maps.places.PlaceResult;

/** Read marked places off a trip object (always returns an array). */
export function getMarkedPlaces(trip: MaybeTrip): MarkedPlace[] {
    return Array.isArray(trip?.markedPlaces) ? trip.markedPlaces : [];
}

/** Find a marked place by its placeId. Returns the entry or undefined. */
export function findMarkedPlace(trip: MaybeTrip, placeId: string | null | undefined) {
    if (!placeId) return undefined;
    return getMarkedPlaces(trip).find((p) => p.placeId === placeId);
}

/** Drop a marked place entirely (called from the AI planner panel's
 *  remove button and from the Home → To do list tab). Safe no-op if
 *  the place isn't there. */
export function removeMarkedPlace(trip: MaybeTrip, placeId: string): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    trip.markedPlaces = trip.markedPlaces.filter((p) => p.placeId !== placeId);
}

/** Update day / time-of-day assignment on a marked place (or remove the
 *  assignment if both are null). */
export function setMarkedPlaceAssignment(
    trip: MaybeTrip,
    placeId: string,
    dayId: string | null,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | null,
): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find((p) => p.placeId === placeId);
    if (!entry) return;
    entry.dayId = dayId || null;
    entry.timeOfDay = timeOfDay || null;
}

/** Set (or clear) the user's preferred hour (0–23, local clock) for a to-do
 *  place. This is the finer-grained replacement for the old
 *  morning/afternoon/evening picker: it feeds the AI prompt as a concrete
 *  time hint and drives the day-detail display slot. Pass null (or an
 *  out-of-range value) to clear it ("Any time"). Deliberately leaves
 *  `timeOfDay` — the coarse slot the AI assigns — untouched. */
export function setMarkedPlacePreferredHour(
    trip: MaybeTrip,
    placeId: string,
    hour: number | null,
): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find((p) => p.placeId === placeId);
    if (!entry) return;
    entry.preferredHour = (typeof hour === 'number' && hour >= 0 && hour <= 23)
        ? hour
        : null;
}

/** Toggle a place's membership in the To-do list — the unified surface
 *  (Path → To do list tab on Home + the AI planner's pre-ticked list).
 *
 *  Add semantics: if the place isn't tracked, insert with forManual=true
 *  AND forAI=true so the AI panel pre-ticks it. The "common case" assumption
 *  is "I added this place to consider; yes the AI should consider it"; the
 *  user unticks in the AI panel for places they want to slot manually only.
 *
 *  When `currentDayId` is provided, the new entry is also stamped with
 *  that dayId so it shows up in that day's plan panes immediately. The
 *  caller (home InfoWindow) passes the wheel-selected day so a "+ Add
 *  to to-do" click while looking at Day 3 lands the place on Day 3's
 *  plan with no further user action needed.
 *
 *  Remove semantics: if the place IS tracked, drop it entirely — there's no
 *  "in to-do but invisible" state in the merged model.
 *
 *  @param place — Google Places result (uses place.place_id, name, etc.)
 *  @param cat — POI_CATEGORIES entry for visuals
 *  @param currentDayId — wheel-selected day to auto-pin to.
 */
export function toggleTodoListMembership(
    trip: MaybeTrip,
    place: PlaceResult,
    cat?: { icon?: string; color?: string },
    currentDayId?: string | null,
): void {
    if (!trip || !place?.place_id) return;
    if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
    const existing = trip.markedPlaces.find((p) => p.placeId === place.place_id);
    if (existing) {
        // Already in to-do — remove entirely.
        trip.markedPlaces = trip.markedPlaces.filter((p) => p.placeId !== place.place_id);
        return;
    }
    const fresh: MarkedPlace = {
        placeId: place.place_id,
        name: place.name || '',
        address: place.vicinity || place.formatted_address || '',
        lat: place.geometry?.location?.lat?.() ?? place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng?.() ?? place.geometry?.location?.lng ?? 0,
        icon: cat?.icon || '📍',
        color: cat?.color || '#9b59b6',
        forAI: true,        // pre-ticked for AI by default — see helper docs
        forManual: true,    // present in the To-do list
        // Auto-pin to the wheel-selected day so manual adds show up
        // in that day's plan panes immediately. Falls back to
        // unassigned (null) when no day is selected (e.g. user adds
        // from the Anchor view), in which case the place stays
        // visible in the to-do list but doesn't slot into a day
        // until the user assigns one via the AI page.
        dayId: currentDayId || null,
        timeOfDay: null,
        preferredHour: null,
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
        // Provenance — manual additions survive a smart-replace
        // when the user runs an AI plan. Only AI-sourced markedPlaces
        // get dropped on Accept Plan.
        source: 'manual',
    };
    if (place.rating != null) fresh.rating = place.rating;
    if (place.user_ratings_total != null) fresh.userRatingsTotal = place.user_ratings_total;
    if (place.url) fresh.mapsUrl = place.url;
    trip.markedPlaces.push(fresh);
}

/** Toggle just the AI tick on an existing to-do entry. Used by the AI
 *  planner's checkbox. No-op if the entry isn't found. */
export function toggleMarkedPlaceForAI(trip: MaybeTrip, placeId: string): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const entry = trip.markedPlaces.find((p) => p.placeId === placeId);
    if (!entry) return;
    entry.forAI = !entry.forAI;
}

/** Set the AI tick on a SUBSET of to-do-list entries, identified
 *  by placeId. Powers the "Mark all for AI" button when the user
 *  has narrowed the visible list via the Show / Type filters —
 *  ticking should only apply to what they're actually looking at,
 *  not to hidden rows. Like the bulk-all variant above, only
 *  touches forManual rows. Items whose placeId isn't in the set
 *  are left exactly as they were. */
export function setMarkedPlacesForAIByIds(
    trip: MaybeTrip,
    placeIds: Iterable<string>,
    value: boolean,
): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    const targetIds = new Set(placeIds);
    for (const p of trip.markedPlaces) {
        if (!p.forManual) continue;
        if (!p.placeId || !targetIds.has(p.placeId)) continue;
        p.forAI = !!value;
    }
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
    /** LLM-supplied "why this place" sentence. */
    why?: string;
    /** LLM-supplied surprising fact about the place. */
    fact?: string;
    /** Google Places `types[]` array. Used to bucket AI items into
     *  the right POI category (Restaurants / Hotels / Sights / …)
     *  via guessCategoryByTypes(). Optional because the field was
     *  added in the 2026-05-14 backend bump — pre-existing
     *  itineraries cached in trip.aiPlan won't have it. */
    types?: string[];
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
    trip: MaybeTrip,
    item: VerifiedAIItem,
    dayId: string | null,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | null = null,
): void {
    if (!trip || !item || !item.verified || !item.placeId) return;
    if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
    // Resolve a real POI category from the Google Places `types[]`
    // array (added to the backend response 2026-05-14). When the
    // lookup hits, the AI item lands under Restaurants / Hotels /
    // Sights / … on the to-do list instead of the generic 📋. Falls
    // back to null on a miss — caller branches below decide the
    // fallback shape (existing: keep stored icon; fresh: stamp 📋).
    const cat = guessCategoryByTypes(item.types);
    const existing = trip.markedPlaces.find((p) => p.placeId === item.placeId);
    if (existing) {
        // Refresh rich fields so a second AI run picks up updated
        // photo URLs / ratings (these can drift, e.g. ratings tick
        // up over time). Day pinning re-stamps to the most recent
        // generation's assignment.
        existing.dayId = dayId ?? existing.dayId ?? null;
        existing.timeOfDay = timeOfDay ?? existing.timeOfDay ?? null;
        existing.verified = true;
        // Provenance — DO NOT promote an already-tracked place to 'ai'.
        // It existed before this AI run: the user either added it by hand
        // (source 'manual' / legacy undefined) or a prior run did. Because
        // dropAITaggedPlaces() deletes EVERY 'ai' place before the next
        // Accept Plan, flipping a user's manual to-do to 'ai' here meant the
        // NEXT Accept Plan silently DELETED it — real data loss (a
        // hand-built to-do list vanished after running the planner a second
        // time). Keep the original source untouched so manual picks survive
        // every AI run; only brand-new, AI-only places (the fresh-insert
        // branch below) are ever stamped 'ai' and thus replaceable.
        if (item.verifiedName) existing.verifiedName = item.verifiedName;
        if (item.photoUrl) existing.photoUrl = item.photoUrl;
        if (typeof item.rating === 'number') existing.rating = item.rating;
        if (typeof item.userRatingsTotal === 'number') existing.userRatingsTotal = item.userRatingsTotal;
        if (item.address) existing.address = item.address;
        if (item.mapsUrl) existing.mapsUrl = item.mapsUrl;
        if (item.why) existing.why = item.why;
        if (item.fact) existing.fact = item.fact;
        // Backfill the icon/color when a category resolves AND the
        // existing entry is still on the generic 📋 fallback. This
        // re-categorises pre-2026-05-14 AI items on the next AI run
        // (or Accept Plan) without touching items the user had
        // already given a real category. Only mutates from 📋 →
        // something real — never overwrites a non-📋 icon, so
        // manually-categorised places stay put.
        if (cat && (existing.icon === '📋' || !existing.icon)) {
            existing.icon = cat.icon;
            existing.color = cat.color;
        }
        // Don't flip forManual / forAI off — the user may have
        // already curated these flags on a previous addition.
        if (!existing.forManual) existing.forManual = true;
        return;
    }
    const fresh: MarkedPlace = {
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
        // Real category from Google Places `types[]` when we have it;
        // 📋 generic + purple fallback when types are missing (legacy
        // itineraries) or didn't match any POI_CATEGORIES entry.
        icon: cat ? cat.icon : '📋',
        color: cat ? cat.color : '#9b59b6',
        forAI: true,
        forManual: true,
        dayId: dayId || null,
        timeOfDay: timeOfDay || null,
        preferredHour: null,
        verified: true,
        // Provenance — see dropAITaggedPlaces for the cleanup contract.
        source: 'ai',
        // exactOptionalPropertyTypes: include the rich optional fields only
        // when the item actually carries them (don't write explicit undefined).
        ...(item.verifiedName !== undefined ? { verifiedName: item.verifiedName } : {}),
        ...(item.photoUrl !== undefined ? { photoUrl: item.photoUrl } : {}),
        ...(item.rating !== undefined ? { rating: item.rating } : {}),
        ...(item.userRatingsTotal !== undefined ? { userRatingsTotal: item.userRatingsTotal } : {}),
        ...(item.mapsUrl !== undefined ? { mapsUrl: item.mapsUrl } : {}),
        ...(item.why !== undefined ? { why: item.why } : {}),
        ...(item.fact !== undefined ? { fact: item.fact } : {}),
    };
    trip.markedPlaces.push(fresh);
}

/** Drop every markedPlace whose `source === 'ai'` from the trip.
 *  Used by Accept Plan to cleanly replace the previous AI run's
 *  items WITHOUT clobbering manually-added ones (the user's home-map
 *  picks stay; only the previous LLM-suggested set is wiped). Safe
 *  no-op if the trip has no markedPlaces or no AI-sourced ones.
 *
 *  Pre-Phase-G-v3 entries don't carry `source` at all — they're
 *  treated as manual (the safer default — never auto-delete an item
 *  whose origin we can't be sure of). The cost is that on the FIRST
 *  Accept Plan after upgrading, those legacy items stay; subsequent
 *  AI runs replace cleanly because the new items DO carry source. */
export function dropAITaggedPlaces(trip: MaybeTrip): void {
    if (!trip || !Array.isArray(trip.markedPlaces)) return;
    trip.markedPlaces = trip.markedPlaces.filter((p) => p?.source !== 'ai');
}

/** Drop EVERY markedPlace from the trip — the "Clean slate" path
 *  the user invokes from the to-do page when they want to start
 *  over. Skips the source filter; this is the user's explicit
 *  "wipe it all" action, no smart replacement. */
export function clearAllMarkedPlaces(trip: MaybeTrip): void {
    if (!trip) return;
    trip.markedPlaces = [];
}
