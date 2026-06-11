// pages/collections-mount/helpers.ts — pure derived-field helpers for
// the Collections page. Lifted out of the legacy renderCollections() in
// pages/collections.ts during the §3.3 React migration so the new JSX
// component can import them as-is.
//
// Each helper takes a Trip and returns a primitive (or null). No DB,
// no STATE, no DOM — just shape transformations. Reusable across any
// future surface that wants to sort/filter trips on the same fields.

import { shortPlaceName } from '../../utils.js';
import { countryCodeToContinent, countryNameToContinent } from '../../utils/place-names.js';
import type { Trip } from '../../types';


/** Earliest tripDay date on a trip (its start). MK3-4: falls back to the
 *  trip-level `dateFrom` when no day is individually dated, then null — so
 *  "group by year" and the card date aren't lost for date-range trips. */
export function tripStartDate(trip: Trip): string | null {
    const dates = (trip.tripDays || [])
        .map((d) => d.date)
        .filter(Boolean)
        .sort();
    return dates[0] || trip.dateFrom || null;
}


/** "Year" used for the year filter — earliest day's year, or null. */
export function tripYear(trip: Trip): number | null {
    const start = tripStartDate(trip);
    if (!start) return null;
    const y = parseInt(String(start).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}


/** Cleaned-up destination name. Handles localised formatted_address
 *  ("Atlanta, Geórgia, Estados Unidos" → "Atlanta") via shortPlaceName. */
export function tripDestination(trip: Trip): string {
    return shortPlaceName(trip.country || '') || (trip.country || '').trim();
}


/** Total non-settlement EUR spent on the trip. Same logic the per-card
 *  display uses. */
export function tripTotalSpent(trip: Trip): number {
    return (trip.expenses || [])
        .filter((e) => !e.isSettlement)
        .reduce((sum, e) => sum + (e.euroValue || 0), 0);
}


/** Sort modes for the Collections list. The string union is the source
 *  of truth for the `<select>` option values — keep them in sync if
 *  adding a new sort. */
export type CollectionsSort =
    | 'recent'
    | 'oldest'
    | 'tripStartDesc'
    | 'tripStartAsc'
    | 'nameAsc'
    | 'nameDesc'
    | 'spentDesc'
    | 'daysDesc';


/** Apply the current sort + filter + search state to the trip list.
 *  Returns a new array; never mutates `archived`. Used by Collections.tsx
 *  to derive `filteredTrips` on every render. */
export function applyCollectionsView(
    archived: Trip[],
    sort: CollectionsSort,
    filterYear: string,
    filterDestination: string,
    searchText: string,
): Trip[] {
    const text = searchText.trim().toLowerCase();
    const filtered = archived.filter((t) => {
        if (filterYear) {
            if (String(tripYear(t) || '') !== filterYear) return false;
        }
        if (filterDestination) {
            if (tripDestination(t) !== filterDestination) return false;
        }
        if (text) {
            const hay = `${t.name || ''} ${t.country || ''}`.toLowerCase();
            if (!hay.includes(text)) return false;
        }
        return true;
    });
    const out = [...filtered];
    switch (sort) {
        case 'recent': {
            // archivedAt timestamp descending; trips without one fall
            // back to array-order (newest pushed last). Mixed cohort
            // handled by isoFor returning a comparable string for both.
            const isoFor = (t: Trip, idx: number) =>
                t.archivedAt || `0000-${String(idx).padStart(8, '0')}`;
            out.sort((a, b) =>
                isoFor(b, archived.indexOf(b)).localeCompare(
                    isoFor(a, archived.indexOf(a)),
                ),
            );
            break;
        }
        case 'oldest':
            out.sort((a, b) => {
                const aIso = a.archivedAt || `0000-${String(archived.indexOf(a)).padStart(8, '0')}`;
                const bIso = b.archivedAt || `0000-${String(archived.indexOf(b)).padStart(8, '0')}`;
                return aIso.localeCompare(bIso);
            });
            break;
        case 'tripStartDesc':
            out.sort((a, b) =>
                String(tripStartDate(b) || '').localeCompare(String(tripStartDate(a) || '')),
            );
            break;
        case 'tripStartAsc':
            out.sort((a, b) =>
                String(tripStartDate(a) || '￿').localeCompare(String(tripStartDate(b) || '￿')),
            );
            break;
        case 'nameAsc':
            out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'nameDesc':
            out.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'spentDesc':
            out.sort((a, b) => tripTotalSpent(b) - tripTotalSpent(a));
            break;
        case 'daysDesc':
            // DSGN-035: count only itinerary days (dayNumber > 0);
            // day-0 (Trip Hub anchor) is excluded so the sort
            // reflects actual travel days, matching the displayed
            // day count on ArchivedCard.
            out.sort(
                (a, b) =>
                    (b.tripDays?.filter((d) => (d.dayNumber || 0) > 0).length || 0) -
                    (a.tripDays?.filter((d) => (d.dayNumber || 0) > 0).length || 0),
            );
            break;
    }
    return out;
}


/** Sentinel continent/year key for trips we can't bucket. Always sorts
 *  last in an album list and gets a localized "Other" label in the UI. */
export const ALBUM_OTHER = 'Other';


/** Continent a trip belongs to, for the Collections album grouping.
 *  Primary source is `countryCode` — the country where the Trip Hub
 *  (day-0 anchor) sits, set from the Google Places pick at creation.
 *  Falls back to the first multi-country code, then a free-text parse of
 *  the legacy `country` string, then ALBUM_OTHER. */
export function resolveTripContinent(trip: Trip): string {
    const primary = trip.countryCode || (trip.countries && trip.countries[0]);
    const byCode = primary ? countryCodeToContinent(primary) : null;
    if (byCode) return byCode;
    const byName = countryNameToContinent(trip.country || '');
    return byName || ALBUM_OTHER;
}


/** Representative cover image for an album tile. Mirrors the archived-
 *  detail hero priority chain: explicit coverUrl → first trip-level photo
 *  → first day photo → null (caller renders a gradient placeholder). */
export function tripCover(trip: Trip): string | null {
    if (trip.coverUrl) return trip.coverUrl;
    if (trip.photos && trip.photos.length > 0) return trip.photos[0]!.src;
    for (const day of trip.tripDays || []) {
        if (day.photos && day.photos.length > 0) return day.photos[0]!;
    }
    return null;
}


/** How the Collections grid is partitioned into albums. */
export type GroupBy = 'continent' | 'year' | 'none';

export interface TripAlbum {
    /** Continent key ('Europe'…/ALBUM_OTHER) or year string ('2024'). */
    key: string;
    trips: Trip[];
}


/** Partition an already-sorted/filtered trip list into albums. Album
 *  order follows the first appearance of each key in `trips`, so it
 *  inherits whatever sort the caller applied; ALBUM_OTHER always sorts
 *  last. `groupBy === 'none'` returns a single 'all' album (flat list). */
export function groupTrips(trips: Trip[], groupBy: GroupBy): TripAlbum[] {
    if (groupBy === 'none') return [{ key: 'all', trips }];
    const order: string[] = [];
    const buckets = new Map<string, Trip[]>();
    for (const trip of trips) {
        let key: string;
        if (groupBy === 'continent') {
            key = resolveTripContinent(trip);
        } else {
            const y = tripYear(trip);
            key = y ? String(y) : ALBUM_OTHER;
        }
        if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
        }
        buckets.get(key)!.push(trip);
    }
    const ordered = order.filter((k) => k !== ALBUM_OTHER);
    // DSGN-033: for year albums, sort keys newest-first so the
    // shelf always reads 2025 → 2024 → 2023, regardless of the
    // order trips appear after the caller's sort. Continent albums
    // keep first-appearance order (no meaningful numeric sort).
    if (groupBy === 'year') ordered.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    if (buckets.has(ALBUM_OTHER)) ordered.push(ALBUM_OTHER);
    return ordered.map((key) => ({ key, trips: buckets.get(key)! }));
}
