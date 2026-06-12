// pages/home/accommodationColors.ts — shared accommodation → colour map.
//
// Used by BOTH the map (dayMarkers) and the Trip Hub accommodation
// manager so a day's colour is identical in both places. Days that share
// an accommodation (keyed by Google place id, or by name when there's no
// id) get the same colour; days with no accommodation get the default
// blue pin (this map simply omits them). Pin POSITION stays decoupled —
// this only drives colour.

import type { TripDay } from '../../types';

// Seven distinct hues, all clearly different from the default day-pin
// blue (#007aff = "no accommodation set"). Chosen to stay distinguishable
// from one another at a glance on a map.
export const ACCOMMODATION_PALETTE = [
    '#e6550d', // orange
    '#31a354', // green
    '#756bb1', // purple
    '#00a3a3', // teal
    '#d6326b', // magenta
    '#b5912a', // gold
    '#8c564b', // brown
];

/** The grouping key for a day's accommodation: its place id when present
 *  (most precise — two days at the literal same hotel), else the lower-
 *  cased name. null = no accommodation set. */
export function accommodationKey(day: TripDay): string | null {
    const pid = (day.accommodationPlaceId || '').trim();
    if (pid) return `pid:${pid}`;
    const name = (day.accommodation || '').trim().toLowerCase();
    return name ? `name:${name}` : null;
}

/** Map each numbered day's id → its accommodation colour. Distinct
 *  accommodations are assigned palette colours in ascending day order, so
 *  the result is stable for a given set of days; the palette cycles if
 *  there are more distinct accommodations than colours. Days with no
 *  accommodation are absent from the map (callers fall back to default). */
export function buildAccommodationColorMap(days: TripDay[]): Record<string, string> {
    const sorted = [...days]
        .filter((d) => (d.dayNumber || 0) > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const keyColor = new Map<string, string>();
    const out: Record<string, string> = {};
    let next = 0;
    for (const d of sorted) {
        const k = accommodationKey(d);
        if (!k) continue;
        let color = keyColor.get(k);
        if (!color) {
            color = ACCOMMODATION_PALETTE[next % ACCOMMODATION_PALETTE.length]!;
            keyColor.set(k, color);
            next += 1;
        }
        out[d.id] = color;
    }
    return out;
}
