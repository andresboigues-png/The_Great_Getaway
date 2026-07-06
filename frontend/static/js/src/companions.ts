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

/** Minimal accepted-member shape, as shipped on `Trip.members` by
 *  /api/data (data.py builds `{userId, role, archived, name, picture}`
 *  from `trip_members` JOIN users). We only need userId + name here. */
type TripWithMembers = TripWithCompanions & {
    members?: Array<{ userId?: string | null; name?: string | null } | null>;
};

/** Resolve a settlement-balance display name (the first-name-ish key the
 *  balance map uses) to an ACCEPTED-member user id, for deciding whether
 *  a settle-up can take the real `/api/settlements` path vs the legacy
 *  fake-expense path.
 *
 *  Priority:
 *    1. The companion's explicit `linkedUserId` (set when the companion
 *       was added from a friend / linked via the invite modal).
 *    2. The trip's accepted-members roster (`Trip.members`, shipped on
 *       every /api/data poll) matched by FULL name or FIRST-name token.
 *
 *  Why (2) matters — integration audit INT-2 / personas 1·2·3: accepting
 *  a trip invite writes a `trip_members` row but does NOT populate the
 *  matching `companions[].linkedUserId`, so the common "invite, then a
 *  separately-named companion" case left an accepted member unlinked.
 *  `settleDebt` then fell to the legacy fake-expense path EVEN THOUGH the
 *  server would have accepted a real settlement (it gates on
 *  `_is_accepted_member`, i.e. the members roster — settlements.py:226).
 *  Resolving via the members roster realigns the client's real-vs-legacy
 *  decision with what the API actually accepts.
 *
 *  MK4 SETL-5: disambiguate before giving up. An EXACT full-name match
 *  wins over first-name-token matches, so a companion keyed on a full
 *  name ("Sara Lopez") still resolves even when another member shares the
 *  first name ("Sara Kim") — pre-fix that collision returned undefined
 *  and pushed a real member-to-member settlement down the legacy
 *  fake-expense path (losing the notification, feed event, server audit
 *  trail, and server-side Undo). Only a genuinely ambiguous key (two
 *  members matching the SAME first name, with no exact full-name match and
 *  no companion `linkedUserId` to break the tie) falls back.
 *
 *  Returns undefined when the name doesn't resolve to exactly ONE accepted
 *  member — the caller falls back to the legacy path. */
export function findAcceptedMemberUserId(
    trip: TripWithMembers | null | undefined,
    name: string,
): string | undefined {
    if (!trip || !name) return undefined;
    // 1. Explicit companion link wins outright.
    const linked = findTripCompanion(trip, name)?.linkedUserId;
    if (linked) return linked;
    const lower = name.toLocaleLowerCase();
    const members = (Array.isArray(trip.members) ? trip.members : [])
        .filter((m): m is { userId: string; name?: string | null } =>
            !!(m && m.userId && m.name),
        );
    // 2. EXACT full-name match — preferred, and disambiguates a full-name
    //    companion key from same-first-name namesakes.
    const exact = members.filter((m) => (m.name || '').toLocaleLowerCase() === lower);
    if (exact.length === 1) return exact[0]!.userId;
    // 3. First-name-token match — only usable when it resolves to ONE
    //    member (otherwise the key is genuinely ambiguous; fall back).
    const byFirst = members.filter(
        (m) => (m.name || '').toLocaleLowerCase().split(/\s+/)[0] === lower,
    );
    return byFirst.length === 1 ? byFirst[0]!.userId : undefined;
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

/** Collapse duplicate companions that all link to the SAME account down
 *  to one, after a link action. Fixes the "duplicate Me" bug: linking self
 *  (or a friend) to an existing companion used to leave the auto-created
 *  self row AND the freshly-linked row both carrying `linkedUserId`.
 *
 *  `survivorName` is the row the user explicitly linked — it always wins.
 *  Every OTHER companion on the same `linkedUserId`:
 *    - is DELETED when nothing references its name (`isReferenced` false —
 *      the auto-stamped self row is the common, history-less case), or
 *    - is DE-LINKED (kept as a plain unlinked companion) when its name
 *      still carries expense / budget history, so balances never orphan
 *      onto a phantom key (settlements are user_id-keyed, so they follow
 *      the surviving link automatically and need no repointing).
 *
 *  `isReferenced(name)` is supplied by the caller (it owns the expense /
 *  budget state) so this stays pure + unit-testable and avoids importing
 *  STATE back into a module that state.ts itself imports.
 *
 *  Mutates `trip.companions` in place; the caller persists via upsertTrip. */
export function dedupeLinkedCompanions(
    trip: TripWithCompanions,
    linkedUserId: string,
    survivorName: string,
    isReferenced: (name: string) => boolean,
): void {
    if (!trip.companions || !linkedUserId) return;
    const survivorLower = survivorName.toLocaleLowerCase();
    const toDelete: string[] = [];
    for (const c of trip.companions) {
        if (c.linkedUserId !== linkedUserId) continue;
        if ((c.name || '').toLocaleLowerCase() === survivorLower) continue;
        // Another companion resolves to the same account → collapse it.
        if (isReferenced(c.name)) {
            delete c.linkedUserId; // keep the name + its history, drop the link
        } else {
            toDelete.push(c.name);
        }
    }
    for (const name of toDelete) removeTripCompanion(trip, name);
}
