// react/TripContext.tsx — FIXING_ROADMAP §3.4.
//
// Single canonical hook (`useActiveTrip`) that resolves the currently
// active trip + every derived field a consumer is likely to want. Pre-
// §3.4 the recipe `STATE.trips.find(t => t.id === STATE.activeTripId)`
// was copy-pasted across ~12 React components, each followed by its
// own `STATE.expenses.filter(e => e.tripId === ...)` and a permission
// check. Drift was inevitable.
//
// ── Why a hook and not a Provider ───────────────────────────────────
//
// The filename keeps `TripContext` for roadmap parity but the v1 ship
// is intentionally just a hook on top of `useStore`. Reasons:
//   - There's no setter we'd inject through Context — mutations still
//     go through `STATE.* writes + emit('state:changed')`, the same
//     way every legacy imperative page does.
//   - A Provider would force every React-mounted page to wrap in one
//     more element; useStore already gives subscribers reactive
//     access to STATE, so the Provider would be ceremonial.
//   - If a future need shows up (storybook injection, multi-trip
//     compare views, etc.) we add the Provider then — call sites
//     keep working because the hook is the interface.
//
// ── Backwards compatibility ─────────────────────────────────────────
//
// The unmigrated `.ts` pages (home.ts, expenses.ts, etc.) still read
// STATE directly. This hook reads from the SAME STATE container, so
// React and imperative code see the same active trip at any moment.
// No projection layer needed.

import { useMemo } from 'react';

import { canDelete, canEdit, canEditExpenses, isOwner } from '../permissions.js';
import type { Expense, Settlement, Trip, TripDay, TripMember } from '../types';
import { useStore } from './store.js';


export interface ActiveTripSelection {
    /** The active Trip object, or null when no trip is active
     *  (cold-load / freshly-wiped state). Callers must null-check. */
    trip: Trip | null;
    /** Convenience mirror of trip?.id ?? null — saves callers from
     *  having to optional-chain just to render a `data-trip-id`. */
    activeTripId: string | null;
    /** Expenses scoped to the active trip. Empty when trip is null. */
    expenses: Expense[];
    /** Days scoped to the active trip, in array order (consumers
     *  that need sort-by-dayNumber should re-sort — kept un-sorted
     *  here so the hook stays O(n) on `STATE.tripDays`. */
    tripDays: TripDay[];
    /** §4.5 — settlements scoped to the active trip. */
    settlements: Settlement[];
    /** Accepted member list (from trip.members, populated by
     *  /api/data on each pull). */
    members: TripMember[];
    /** True iff the signed-in user is the trip's owner. */
    isOwner: boolean;
    /** True iff the user can edit TRIP-LEVEL fields (name, days,
     *  members, etc.). Owners + planners; budgeteers + relaxers
     *  excluded. */
    canEdit: boolean;
    /** True iff the user can edit EXPENSE rows. Owners + planners +
     *  budgeteers; relaxers excluded. */
    canEditExpenses: boolean;
    /** True iff the user can delete the trip (owner only — the
     *  destructive op). */
    canDelete: boolean;
}


/** The single source of truth for "what's the user looking at right
 *  now". Returns a stable object — the useMemo deps catch the slices
 *  that actually feed each derived field, so a notification poll (which
 *  bumps STATE's version counter via state:changed) doesn't recompute
 *  the expenses filter if STATE.expenses itself didn't change. */
export function useActiveTrip(): ActiveTripSelection {
    const activeTripId = useStore((s) => s.activeTripId);
    const trips = useStore((s) => s.trips);
    const expensesAll = useStore((s) => s.expenses);
    const tripDaysAll = useStore((s) => s.tripDays);
    const settlementsAll = useStore((s) => s.settlements);

    return useMemo(() => {
        const trip = activeTripId
            ? trips.find((t) => t.id === activeTripId) ?? null
            : null;
        const expenses = trip
            ? expensesAll.filter((e) => e.tripId === trip.id)
            : [];
        const tripDays = trip
            ? tripDaysAll.filter((d) => d.tripId === trip.id)
            : [];
        const settlements = trip
            ? settlementsAll.filter((s) => s.tripId === trip.id)
            : [];
        const members = trip?.members ?? [];

        return {
            trip,
            activeTripId,
            expenses,
            tripDays,
            settlements,
            members,
            isOwner: isOwner(trip),
            canEdit: canEdit(trip),
            canEditExpenses: canEditExpenses(trip),
            canDelete: canDelete(trip),
        };
        // Deps: the selectors above already track everything we need.
        // useStore re-runs the component on state:changed; useMemo
        // re-derives only when its deps change identity (which happens
        // for trips/expenses/days/settlements arrays whenever
        // pullFromServer assigns them anew on /api/data).
    }, [activeTripId, trips, expensesAll, tripDaysAll, settlementsAll]);
}


/** Pick a single trip by id with the same derived-field shape as
 *  `useActiveTrip`. Useful for components that view a NON-active
 *  trip (e.g. the collections detail page when a specific archived
 *  trip is being inspected). Pass `null` to skip — returns the same
 *  empty shape as `useActiveTrip` when no active trip is set. */
export function useTrip(tripId: string | null | undefined): ActiveTripSelection {
    const trips = useStore((s) => s.trips);
    const archivedTrips = useStore((s) => s.archivedTrips);
    const expensesAll = useStore((s) => s.expenses);
    const tripDaysAll = useStore((s) => s.tripDays);
    const settlementsAll = useStore((s) => s.settlements);

    return useMemo(() => {
        if (!tripId) {
            return {
                trip: null,
                activeTripId: null,
                expenses: [],
                tripDays: [],
                settlements: [],
                members: [],
                isOwner: false,
                canEdit: false,
                canEditExpenses: false,
                canDelete: false,
            };
        }
        // Archived trips have their snapshot fields baked onto the
        // Trip object (tripDays, expenses) — but the global lists
        // are still authoritative. Prefer the live lists; fall back
        // to the snapshot only if needed.
        const trip = trips.find((t) => t.id === tripId)
            ?? archivedTrips.find((t) => t.id === tripId)
            ?? null;
        const expenses = trip
            ? (expensesAll.filter((e) => e.tripId === trip.id).length > 0
                ? expensesAll.filter((e) => e.tripId === trip.id)
                : (trip.expenses ?? []))
            : [];
        const tripDays = trip
            ? (tripDaysAll.filter((d) => d.tripId === trip.id).length > 0
                ? tripDaysAll.filter((d) => d.tripId === trip.id)
                : (trip.tripDays ?? []))
            : [];
        const settlements = trip
            ? settlementsAll.filter((s) => s.tripId === trip.id)
            : [];

        return {
            trip,
            activeTripId: tripId,
            expenses,
            tripDays,
            settlements,
            members: trip?.members ?? [],
            isOwner: isOwner(trip),
            canEdit: canEdit(trip),
            canEditExpenses: canEditExpenses(trip),
            canDelete: canDelete(trip),
        };
    }, [tripId, trips, archivedTrips, expensesAll, tripDaysAll, settlementsAll]);
}
