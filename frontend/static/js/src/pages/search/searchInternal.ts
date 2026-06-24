// pages/search/searchInternal.ts — the cross-trip internal search filter,
// extracted from Search.tsx (round 20) so BOTH the legacy Search page AND the
// home universal search bar (pages/home/mapSearch.ts) share ONE source of
// truth. Pure: takes the query + the four STATE slices, returns grouped hits.
//
// Searches active + archived trips, all days (active flat in tripDays, archived
// nested per archived trip), and all expenses (active + nested archived). The
// home universal search shows a Google-Places group ABOVE these internal
// groups; this module is only the internal half.

import type { Trip, TripDay, Expense } from '../../types';

export interface TripHit {
    kind: 'trip';
    trip: Trip;
    archived: boolean;
}
export interface DayHit {
    kind: 'day';
    day: TripDay;
    trip: Trip;
    archived: boolean;
}
export interface ExpenseHit {
    kind: 'expense';
    expense: Expense;
    trip: Trip | null;
    archived: boolean;
}

export interface InternalSearchResults {
    trips: TripHit[];
    days: DayHit[];
    expenses: ExpenseHit[];
}

export interface InternalSearchSources {
    trips: Trip[];
    archivedTrips: Trip[];
    tripDays: TripDay[];
    expenses: Expense[];
}

const EMPTY: InternalSearchResults = { trips: [], days: [], expenses: [] };

/** Filter trips / days / expenses by a free-text query. Case-insensitive
 *  substring match across the relevant text fields of each entity. Returns
 *  empty groups for a blank query. */
export function searchInternal(query: string, src: InternalSearchSources): InternalSearchResults {
    const q = query.trim().toLowerCase();
    if (!q) return EMPTY;

    const matches = (...fields: Array<string | undefined | null>): boolean =>
        fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));

    // Trip lookup — joins days + expenses back to their parent trip name, and
    // tags archived vs active. Covers both sets.
    const tripById = new Map<string, { trip: Trip; archived: boolean }>();
    for (const t of src.trips) tripById.set(t.id, { trip: t, archived: false });
    for (const t of src.archivedTrips) tripById.set(t.id, { trip: t, archived: true });

    const trips: TripHit[] = [];
    for (const t of src.trips) {
        if (matches(t.name, t.country, t.notes)) trips.push({ kind: 'trip', trip: t, archived: false });
    }
    for (const t of src.archivedTrips) {
        if (matches(t.name, t.country, t.notes)) trips.push({ kind: 'trip', trip: t, archived: true });
    }

    const days: DayHit[] = [];
    for (const d of src.tripDays) {
        const parent = tripById.get(d.tripId);
        if (!parent) continue; // orphan day with no parent trip — skip
        const plan = d.plan || ({} as TripDay['plan']);
        if (matches(d.name, d.notes, plan.morning, plan.afternoon, plan.evening)) {
            days.push({ kind: 'day', day: d, trip: parent.trip, archived: parent.archived });
        }
    }
    for (const t of src.archivedTrips) {
        for (const d of t.tripDays || []) {
            const plan = d.plan || ({} as TripDay['plan']);
            if (matches(d.name, d.notes, plan.morning, plan.afternoon, plan.evening)) {
                days.push({ kind: 'day', day: d, trip: t, archived: true });
            }
        }
    }

    const expenses: ExpenseHit[] = [];
    for (const e of src.expenses) {
        if (matches(e.label, e.country, e.who, e.currency)) {
            const parent = tripById.get(e.tripId);
            expenses.push({
                kind: 'expense',
                expense: e,
                trip: parent?.trip ?? null,
                archived: parent?.archived ?? false,
            });
        }
    }
    for (const t of src.archivedTrips) {
        for (const e of t.expenses || []) {
            if (matches(e.label, e.country, e.who, e.currency)) {
                expenses.push({ kind: 'expense', expense: e, trip: t, archived: true });
            }
        }
    }

    return { trips, days, expenses };
}
