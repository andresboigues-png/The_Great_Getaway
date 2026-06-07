// utils/tripDays.ts — keep a trip's itinerary day numbers clean.

import type { Trip, TripDay } from '../types';

const DEFAULT_DAY_NAME = /^Day \d+$/;

/**
 * Re-number a trip's itinerary days so they are UNIQUE and CONTIGUOUS
 * (1..N) in date order. Day 0 (the Trip Hub / starting-point anchor) is
 * left untouched — its dayNumber is legitimately 0.
 *
 * Mutates the matching day objects inside `allDays` in place and returns
 * the subset whose `dayNumber` actually changed, so the caller can persist
 * exactly those (and skip writes entirely when nothing drifted).
 *
 * Why this exists: the edit-dates flow scaffolded new days numbered as
 * `existingCount + 1`, which silently breaks if the existing day numbers
 * ever contain a gap or a duplicate — producing the "two Day 2 / no Day 1"
 * state a user hit after editing trip dates. This is the single source of
 * truth that collapses any such drift back to a clean 1..N. Run it at the
 * end of a date edit AND as a boot self-heal so an already-corrupted trip
 * repairs itself on next load.
 */
export function normalizeDayNumbers(
    allDays: TripDay[] | null | undefined,
    tripId: string,
): TripDay[] {
    if (!allDays || allDays.length === 0) return [];
    const days = allDays.filter((d) => d.tripId === tripId && Number(d.dayNumber) > 0);
    if (days.length === 0) return [];

    // Itinerary order is date order. Sort by date asc; undated days sort
    // last (they're typically freshly-added, un-pinned rows). Ties (same or
    // both-empty date) break by current number then id so the result is
    // deterministic + stable.
    days.sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        if (da && db) {
            if (da !== db) return da < db ? -1 : 1;
        } else if (da) {
            return -1;
        } else if (db) {
            return 1;
        }
        const byNum = Number(a.dayNumber) - Number(b.dayNumber);
        if (byNum !== 0) return byNum;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const changed: TripDay[] = [];
    days.forEach((d, i) => {
        const n = i + 1;
        if (Number(d.dayNumber) !== n) {
            // Only rewrite the auto-generated "Day N" label — leave a name
            // the user customised ("Beach day", "Flight home") alone.
            if (typeof d.name === 'string' && DEFAULT_DAY_NAME.test(d.name)) {
                d.name = `Day ${n}`;
            }
            d.dayNumber = n;
            changed.push(d);
        }
    });
    return changed;
}

/**
 * Mirror the server's delete_day media cascade on the client (Audit MK5
 * BUG-033). When a day is deleted, the server prunes photos/documents tagged
 * with that dayId and NULLs the dayId on its marked places, so a saved place
 * survives — just detached from the now-gone day. The loss-free union media
 * merge has NO deletion awareness, so unless the client mirrors this prune the
 * next media write (or a warm-409 re-merge) resurrects the day-tagged
 * photos/docs. Mutates `trip` in place so local STATE matches the server.
 *
 * Note the deliberate asymmetry — DON'T "simplify" it: photos and documents
 * tied to the day are REMOVED, but marked places are KEPT with `dayId = null`
 * (they move to the Unsorted bucket). This matches days.py's cascade, which
 * deletes media rows but uses drop=False for places.
 */
export function pruneDayMediaInPlace(trip: Trip, dayId: string): void {
    if (Array.isArray(trip.photos)) {
        trip.photos = trip.photos.filter((p) => p.dayId !== dayId);
    }
    if (Array.isArray(trip.documents)) {
        trip.documents = trip.documents.filter((doc) => doc.dayId !== dayId);
    }
    if (Array.isArray(trip.markedPlaces)) {
        for (const mp of trip.markedPlaces) {
            if (mp.dayId === dayId) mp.dayId = null;
        }
    }
}
