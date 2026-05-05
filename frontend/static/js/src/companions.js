// @ts-check
// companions.js — Helpers for trip-scoped companions.
//
// Companions live ONLY inside `Trip.companions` now — there's no
// account-wide roster. Friends are the only account-level "people"
// concept; a trip's companion list is built by either picking from your
// friends (linked entry → auto-invite) or typing a name (unlinked entry).
//
// All helpers take a Trip (or a companion array) explicitly so the
// caller decides which trip's roster to query.

/**
 * @typedef {{ name: string, linkedUserId?: string }} Companion
 */

/** Idempotent shape upgrade — accepts either the old `string[]` shape or
 *  the new `Companion[]` shape and returns Companion[]. Used at every
 *  boundary where companion data crosses the wire (server → client) or
 *  comes back from older local storage.
 *  @param {Array<string | Companion> | undefined | null} raw
 *  @returns {Companion[]} */
export function normalizeTripCompanions(raw) {
    if (!Array.isArray(raw)) return [];
    /** @type {Companion[]} */
    const out = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            if (item) out.push({ name: item });
        } else if (item && typeof item === 'object' && typeof item.name === 'string' && item.name) {
            const c = /** @type {Companion} */ ({ name: item.name });
            if (item.linkedUserId) c.linkedUserId = item.linkedUserId;
            out.push(c);
        }
    }
    return out;
}

/** Return the names of every companion on the trip — convenience for
 *  call sites that still want a `string[]` (option lists, equal-split
 *  fallbacks, settlement balance roster).
 *  @param {{ companions?: Companion[] } | null | undefined} trip
 *  @returns {string[]} */
export function getTripCompanionNames(trip) {
    return (trip?.companions ?? []).map(c => c.name);
}

/** @param {{ companions?: Companion[] } | null | undefined} trip @param {string} name */
export function findTripCompanion(trip, name) {
    if (!name) return undefined;
    return (trip?.companions ?? []).find(c => c.name === name);
}

/** @param {{ companions?: Companion[] } | null | undefined} trip @param {string} userId */
export function findTripCompanionByLinkedUser(trip, userId) {
    if (!userId) return undefined;
    return (trip?.companions ?? []).find(c => c.linkedUserId === userId);
}

/** @param {{ companions?: Companion[] } | null | undefined} trip @param {string} name */
export function tripHasCompanion(trip, name) {
    return findTripCompanion(trip, name) !== undefined;
}

/** Add a companion to the trip's roster if a row with that name doesn't
 *  already exist. Returns the (existing or newly-created) Companion. The
 *  caller is responsible for persisting the trip via upsertTrip.
 *  @param {{ companions?: Companion[] }} trip @param {string} name @param {string} [linkedUserId]
 *  @returns {Companion} */
export function addTripCompanion(trip, name, linkedUserId) {
    if (!trip.companions) trip.companions = [];
    const existing = trip.companions.find(c => c.name === name);
    if (existing) {
        if (linkedUserId && !existing.linkedUserId) existing.linkedUserId = linkedUserId;
        return existing;
    }
    /** @type {Companion} */
    const c = { name };
    if (linkedUserId) c.linkedUserId = linkedUserId;
    trip.companions.push(c);
    return c;
}

/** Remove a companion from the trip's roster by name. Returns `true` if
 *  a row was removed.
 *  @param {{ companions?: Companion[] }} trip @param {string} name */
export function removeTripCompanion(trip, name) {
    if (!trip.companions) return false;
    const before = trip.companions.length;
    trip.companions = trip.companions.filter(c => c.name !== name);
    return trip.companions.length < before;
}
