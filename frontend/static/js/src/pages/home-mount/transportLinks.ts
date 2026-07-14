// pages/home-mount/transportLinks.ts — pure Google Maps deep-link builders for
// the Transport tab's arrival/departure legs + curated terminals.
//
// Extracted from TransportTab so the URL logic is unit-testable in isolation
// (no React, no `google` global, no DOM) — see transportLinks.test.ts. The
// whole value of this tab is that ONE tap opens Google Maps already set to the
// right route + travel mode, no manual filters; getting these URLs exactly
// right is what "saves the user the trip to Google Maps", so they get their
// own tested module.

/** A directions endpoint — a display label plus an OPTIONAL exact place_id /
 *  "lat,lng" coords. When present, placeId/coords make Maps resolve the EXACT
 *  place (no ambiguous geocode of the label); `label` is the human-readable
 *  fallback query and what Maps shows the user. */
export type Pt = { label: string; placeId?: string; coords?: string };

/** Map a GG TransportMode → a Google Maps `travelmode`. Station-based modes
 *  (metro/bus/train/tram/ferry) → transit; car/taxi → driving; walk/bike get
 *  their own. `flight` has no door-to-door Maps travelmode, so the ground
 *  portion of a flight leg is routed as transit. Unknown/`mixed` → omitted
 *  (Maps picks a sensible default). */
export const TRAVELMODE: Record<string, string> = {
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
};

/** Build a Google Maps directions deep link. `null`/'current' origin = the
 *  device's current location (Maps omits the origin param and uses GPS).
 *  Returns null when there's no destination to route to. */
export function buildDirUrl(
    origin: Pt | 'current' | null,
    dest: Pt | null,
    travelmode?: string,
): string | null {
    if (!dest) return null;
    const p = new URLSearchParams();
    p.set('api', '1');
    p.set('destination', dest.coords || dest.label);
    if (dest.placeId) p.set('destination_place_id', dest.placeId);
    if (origin && origin !== 'current') {
        p.set('origin', origin.coords || origin.label);
        if (origin.placeId) p.set('origin_place_id', origin.placeId);
    }
    if (travelmode) p.set('travelmode', travelmode);
    return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** A plain Google Maps SEARCH link ("<query> <near>") — the fallback when we
 *  can't build a real route (e.g. a terminal with no known home base yet). */
export function mapsSearch(query: string, near: Pt | null): string {
    const q = near ? `${query} ${near.coords || near.label}` : query;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** A curated arrival/departure terminal → a one-tap Maps DIRECTIONS link
 *  (transit) pre-routed between the station and the trip's home base:
 *  arrival = station → your stay, departure = your stay → station. No base
 *  yet (no accommodation/place set) → a plain search so the pill still works.
 *  `city` disambiguates the bare station name for geocoding. */
export function terminalHref(
    name: string,
    city: string,
    base: Pt | null,
    which: 'arrival' | 'departure',
): string {
    if (!base) return mapsSearch(name, city ? { label: city } : null);
    const term: Pt = { label: city ? `${name}, ${city}` : name };
    return (
        which === 'arrival'
            ? buildDirUrl(term, base, 'transit')
            : buildDirUrl(base, term, 'transit')
    ) as string;
}
