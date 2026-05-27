// companions.ts — Helpers for trip-scoped companions.
//
// Companions live ONLY inside `Trip.companions` now — there's no
// account-wide roster. Friends are the only account-level "people"
// concept; a trip's companion list is built by either picking from your
// friends (linked entry → auto-invite) or typing a name (unlinked entry).
//
// All helpers take a Trip (or a companion array) explicitly so the
// caller decides which trip's roster to query.

import type { Companion } from './types';

/** Trip-shaped argument accepted by every helper here — we only need
 *  the `companions` field, so the rest of `Trip` is irrelevant. */
type TripWithCompanions = { companions?: Companion[] };

/** Idempotent shape upgrade — accepts either the old `string[]` shape or
 *  the new `Companion[]` shape and returns Companion[]. Used at every
 *  boundary where companion data crosses the wire (server → client) or
 *  comes back from older local storage. */
export function normalizeTripCompanions(
    raw: Array<string | Companion> | undefined | null,
): Companion[] {
    if (!Array.isArray(raw)) return [];
    const out: Companion[] = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            if (item) out.push({ name: item });
        } else if (item && typeof item === 'object' && typeof item.name === 'string' && item.name) {
            const c: Companion = { name: item.name };
            if (item.linkedUserId) c.linkedUserId = item.linkedUserId;
            out.push(c);
        }
    }
    return out;
}

/** Return the names of every companion on the trip — convenience for
 *  call sites that still want a `string[]` (option lists, equal-split
 *  fallbacks, settlement balance roster). */
export function getTripCompanionNames(trip: TripWithCompanions | null | undefined): string[] {
    return (trip?.companions ?? []).map(c => c.name);
}

export function findTripCompanion(trip: TripWithCompanions | null | undefined, name: string): Companion | undefined {
    if (!name) return undefined;
    // R3-Round 2 fix: case-insensitive match to mirror the server.
    // `clean_companions` (validators.py) NFC-normalises and case-folds
    // dedupe keys, so "Alice" and "alice" become the same row server-
    // side. Pre-fix the client looked up by exact string === — so
    // expenses with `who: "alice"` couldn't find the "Alice" companion
    // row from the trip's roster, producing ghost balances. Use a
    // locale-insensitive lower-case compare; the existing roster
    // names stay in their original casing for display.
    const lower = name.toLocaleLowerCase();
    return (trip?.companions ?? []).find(c => (c.name || '').toLocaleLowerCase() === lower);
}

export function findTripCompanionByLinkedUser(trip: TripWithCompanions | null | undefined, userId: string): Companion | undefined {
    if (!userId) return undefined;
    return (trip?.companions ?? []).find(c => c.linkedUserId === userId);
}

export function tripHasCompanion(trip: TripWithCompanions | null | undefined, name: string): boolean {
    return findTripCompanion(trip, name) !== undefined;
}

/** Add a companion to the trip's roster if a row with that name doesn't
 *  already exist. Returns the (existing or newly-created) Companion. The
 *  caller is responsible for persisting the trip via upsertTrip. */
export function addTripCompanion(
    trip: TripWithCompanions,
    name: string,
    linkedUserId?: string,
): Companion {
    if (!trip.companions) trip.companions = [];
    // R3-Round 2 fix: case-insensitive existence check mirrors
    // `clean_companions` server-side dedupe so "Alice" and "alice"
    // don't both land in the roster.
    const lower = name.toLocaleLowerCase();
    const existing = trip.companions.find(c => (c.name || '').toLocaleLowerCase() === lower);
    if (existing) {
        if (linkedUserId && !existing.linkedUserId) existing.linkedUserId = linkedUserId;
        return existing;
    }
    const c: Companion = { name };
    if (linkedUserId) c.linkedUserId = linkedUserId;
    trip.companions.push(c);
    return c;
}

/** Remove a companion from the trip's roster by name. Returns `true` if
 *  a row was removed. */
export function removeTripCompanion(trip: TripWithCompanions, name: string): boolean {
    if (!trip.companions) return false;
    const before = trip.companions.length;
    // R3-Round 2 fix: case-insensitive match for the remove path too.
    const lower = name.toLocaleLowerCase();
    trip.companions = trip.companions.filter(c => (c.name || '').toLocaleLowerCase() !== lower);
    return trip.companions.length < before;
}
