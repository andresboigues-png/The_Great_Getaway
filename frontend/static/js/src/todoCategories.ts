// todoCategories.ts — shared helpers for grouping & labelling marked
// places by category. Extracted from pages/todo/Todo.tsx so the AI
// page can render the same category sections without a copy-paste
// drift hazard.
//
// All four exports are pure (no module-level mutable state, no DOM
// access). Safe to import from anywhere — the i18n.js dependency only
// fires inside iconToLabel() at call time, so the active locale is
// always read fresh.

import { t } from './i18n.js';
import type { MarkedPlace, Trip, TripDay } from './types';

/** Resolve the icon used for filtering + grouping. Treats the
 *  AI-generic 📋 the same as 📍 — see the iconToLabel comment.
 *  Anything else passes through.
 *
 *  Falls back to 📍 when the place has no icon at all (rare — every
 *  AI-verified item gets one stamped by addOrUpdatePlaceFromVerified;
 *  the InfoWindow uses 📍 when no category pill was active). */
export function groupingIcon(raw: string | undefined): string {
    const i = raw || '📍';
    return i === '📋' ? '📍' : i;
}

/** Map the per-place `icon` (which mirrors POI_CATEGORIES emoji) to a
 *  human-readable, locale-aware section heading. Falls through to
 *  "Other places" for icons not in the table — covers the 📋 default
 *  that `addOrUpdatePlaceFromVerified` stamps on AI-only items + the
 *  📍 default that the home InfoWindow uses when no category was
 *  active. Pre-G items keyed by their POI emoji always hit a known
 *  label.
 *
 *  Function (not const map) so each call resolves via t() against
 *  the active locale. Previous iteration was a module-level
 *  Record<string, string> baked at load time — fine in English but
 *  silently leaked English strings into pt/es/fr.
 *
 *  Note: 📋 is intentionally absent — `groupingIcon()` normalises
 *  AI-sourced items (which carry icon='📋' on their data) into 📍
 *  "Other places" for filter + grouping purposes. They keep their
 *  raw icon on the row data (so the `+ AI` chip + edit-modal can
 *  read it), but visually merge into the "Other places" bucket
 *  instead of getting a dedicated section. */
export function iconToLabel(icon: string): string {
    switch (icon) {
        case '🍽️': return t('poi.restaurants');
        case '🛒': return t('poi.supermarkets');
        case '🛏️': return t('poi.hotels');
        // 🏛️ is the Sights category icon (monuments / museums / landmarks).
        // 🏖️ is the LEGACY Sights icon (a beach — wrong for sights); kept
        // here so any place still carrying the old emoji still labels as
        // Sights. state.ts heals stored 🏖️ → 🏛️ on load.
        case '🏛️':
        case '🏖️': return t('poi.sights');
        case '🌳': return t('poi.parks');
        case '⛪': return t('poi.worship');
        case '🏥': return t('poi.medical');
        case '💊': return t('poi.pharmacies');
        case '🩺': return t('poi.doctors');
        case '🦷': return t('poi.dentists');
        case '🐾': return t('poi.pets');
        case '🐶': return t('poi.petStores');
        case '🎓': return t('poi.schools');
        case '🏟️': return t('poi.sports');
        case '🚉': return t('poi.transit');
        case '🛣️': return t('poi.roadsTraffic');
        case '📍': return t('poi.otherPlaces');
        default: return t('poi.other');
    }
}

/** Canonical sort order for category groups, mirroring the
 *  `iconToLabel` switch above (which itself mirrors the POI_CATEGORIES
 *  order on the home map). When the user picks sort=category the
 *  grouped view renders sections in this order — food first, lodging
 *  next, then sights/parks, then medical (incl. AI verifier
 *  sub-buckets), then niche, with the catch-all 📍 "Other places"
 *  last so unsorted Maps-grounded items don't dominate the top of
 *  the page. Anything not in this list lands at the end (preserving
 *  insertion order via the fallback). */
export const CATEGORY_ORDER: string[] = [
    '🍽️', '🛒', '🛏️', '🏛️', '🌳', '⛪',
    '🏥', '💊', '🩺', '🦷',
    '🐾', '🐶', '🎓', '🏟️', '🚉', '🛣️',
    '📍',
];

/** Build a Google Maps URL for a marked place. Prefers the canonical
 *  short `mapsUrl` set by the AI verifier (it points to the canonical
 *  Google Maps place page when the verifier could ground the entry),
 *  otherwise falls back to a `place_id` deep link. Returns null only
 *  when the item has neither — those are pre-Phase-G entries added
 *  without Maps grounding, and we don't try to look up Maps from a
 *  raw address client-side because the geocoder isn't always cheap
 *  + we don't want a render-blocking lookup.
 *
 *  Used by Todo (the to-do list rows) AND AI (the marked-card grid)
 *  so a click on the name reliably opens the same canonical place. */
export function placeMapsUrl(p: {
    mapsUrl?: string;
    placeId?: string;
}): string | null {
    if (p.mapsUrl) return p.mapsUrl;
    if (p.placeId) {
        return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`;
    }
    return null;
}

// ── Transportation P1: free per-day directions deep link ─────────────
// Built entirely from STORED coords — zero Directions-API billing; the
// link opens live routing in the user's Google Maps app, which handles
// any geography (transit schedules, walking, driving) far better than
// an in-app render could.

/** Transport mode → Google Maps `travelmode` URL param. Rail/boat modes
 *  collapse to `transit` (Maps picks the concrete line); no mode → transit. */
const _TRAVELMODE: Record<string, string> = {
    walk: 'walking',
    bike: 'bicycling',
    car: 'driving',
    taxi: 'driving',
    metro: 'transit',
    bus: 'transit',
    train: 'transit',
    tram: 'transit',
    ferry: 'transit',
    flight: 'transit',
    mixed: 'transit',
};

const _SLOT_RANK: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };
const _SLOT_DEFAULT_HOUR: Record<string, number> = { morning: 9, afternoon: 14, evening: 19 };

/** The place's effective day-part slot (preferredHour wins over the coarse
 *  timeOfDay — mirrors DayDetailModal's hourToSlot rule). Null = slot-less;
 *  slot-less day-tagged places deliberately DON'T join the route (they live
 *  in the to-do panel, not the day plan — planBlocks invariant). */
function _effectiveSlot(p: MarkedPlace): 'morning' | 'afternoon' | 'evening' | null {
    if (typeof p.preferredHour === 'number') {
        return p.preferredHour < 12 ? 'morning' : p.preferredHour < 18 ? 'afternoon' : 'evening';
    }
    return p.timeOfDay && p.timeOfDay in _SLOT_RANK ? p.timeOfDay : null;
}

/** Build a free Google Maps directions URL for a day's route: origin =
 *  the day's accommodation (place-id form — accommodation rows carry no
 *  lat/lng) else the day pin; stops = the day's slot-ordered places
 *  (morning → afternoon → evening, preferredHour within a slot), last one
 *  as destination, the rest as waypoints capped at 9 (the Maps mobile
 *  handoff limit). travelmode derives from day.transport?.mode. Returns
 *  null when the day has nothing routable (no placed stops and no pin). */
export function dayDirectionsUrl(
    day: TripDay,
    trip: Trip,
): string | null {
    const stops = (trip.markedPlaces || [])
        .map((p) => ({ p, slot: _effectiveSlot(p) }))
        .filter(
            (x): x is { p: MarkedPlace; slot: 'morning' | 'afternoon' | 'evening' } =>
                x.slot !== null
                && x.p.dayId === day.id
                && typeof x.p.lat === 'number'
                && typeof x.p.lng === 'number',
        )
        .sort((a, b) => {
            const ra = _SLOT_RANK[a.slot]! - _SLOT_RANK[b.slot]!;
            if (ra !== 0) return ra;
            const ha = a.p.preferredHour ?? _SLOT_DEFAULT_HOUR[a.slot]!;
            const hb = b.p.preferredHour ?? _SLOT_DEFAULT_HOUR[b.slot]!;
            return ha - hb;
        })
        .map(({ p }) => `${p.lat},${p.lng}`);

    // `lon` and `lng` are both written on days — accept either (routePolyline
    // precedent); explicit null-tests so a 0 coordinate survives.
    const dayLat = day.lat;
    const dayLon = day.lon != null ? day.lon : day.lng;
    const dayPin = dayLat != null && dayLon != null ? `${dayLat},${dayLon}` : null;

    let destination: string | null = null;
    let waypoints: string[] = [];
    if (stops.length > 0) {
        destination = stops[stops.length - 1]!;
        // Cap at 9 — beyond that the URL fails to hand off to the Google Maps
        // mobile app. Keep the LAST 9 intermediates so the kept run is
        // contiguous into the destination: a start-of-route jump (origin →
        // first kept stop) renders as a normal route, whereas a mid-route gap
        // would silently skip the stops right before the finale.
        waypoints = stops.slice(0, -1).slice(-9);
    } else if (dayPin) {
        destination = dayPin;
    }
    if (!destination) return null;

    const params = new URLSearchParams();
    params.set('api', '1');
    params.set('destination', destination);
    if (waypoints.length) params.set('waypoints', waypoints.join('|'));
    // Origin: tonight's hotel anchors the day. Accommodation has a place_id
    // but no stored lat/lng, so use the place-id URL form; else the day pin
    // (when it isn't already the destination); else Maps defaults to the
    // user's current location — the right live-usage fallback.
    if (day.accommodation && day.accommodationPlaceId) {
        params.set('origin', day.accommodation);
        params.set('origin_place_id', day.accommodationPlaceId);
    } else if (dayPin && dayPin !== destination) {
        params.set('origin', dayPin);
    }
    const mode = day.transport?.mode;
    params.set('travelmode', (mode && _TRAVELMODE[mode]) || 'transit');
    return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Group an array of items by their `icon` field (normalised via
 *  groupingIcon). Returns a Map whose entries are in CATEGORY_ORDER —
 *  empty buckets are stripped. Use the spread `[...result.entries()]`
 *  to drive a React render loop with the section headers in canonical
 *  order. */
export function groupByCategory<T extends { icon?: string }>(
    items: T[],
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const p of items) {
        const key = groupingIcon(p.icon);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
    }
    for (const [k, v] of groups) {
        if (v.length === 0) groups.delete(k);
    }
    return groups;
}
