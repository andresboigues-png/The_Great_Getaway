// pages/collections-mount/helpers.ts — pure derived-field helpers for
// the Collections page. Lifted out of the legacy renderCollections() in
// pages/collections.ts during the §3.3 React migration so the new JSX
// component can import them as-is.
//
// Each helper takes a Trip and returns a primitive (or null). No DB,
// no STATE, no DOM — just shape transformations. Reusable across any
// future surface that wants to sort/filter trips on the same fields.

import { shortPlaceName } from '../../utils.js';
import type { Trip } from '../../types';


/** Earliest tripDay date on a trip (its start). Falls back to null
 *  for trips with no dated days — those float to the end on date sorts. */
export function tripStartDate(trip: Trip): string | null {
    const dates = (trip.tripDays || [])
        .map((d) => d.date)
        .filter(Boolean)
        .sort();
    return dates[0] || null;
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
            out.sort(
                (a, b) => (b.tripDays?.length || 0) - (a.tripDays?.length || 0),
            );
            break;
    }
    return out;
}
