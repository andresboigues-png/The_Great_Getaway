// permissions.ts — Single boundary for role-based UI decisions.
//
// Roles:
//   planner   — full edit (trip details, days, expenses, can archive own copy)
//   budgeteer — relaxer + can add/edit expenses (no trip details, no days, no roster)
//   relaxer   — read-only (can archive own copy, otherwise just observes)
//
// Adding a role is a one-file edit here + the dropdown in the companion picker.
// Every page that hides or shows an edit affordance goes through these helpers,
// not the role string directly.
//
// Source-of-truth flow:
//   server (trip_members.role) → /api/data → trip.myRole → these helpers

import { STATE } from './state.js';
import type { Trip, TripRole } from './types';

export const ROLE_PLANNER = 'planner';
export const ROLE_BUDGETEER = 'budgeteer';
export const ROLE_RELAXER = 'relaxer';

/** Trip subset every helper here actually reads. Some legacy snapshots
 *  carry an old `user_id` mirror of `ownerId` (server schema lag); we
 *  accept either. */
type TripPermInput = (Pick<Trip, 'ownerId' | 'myRole'> & { user_id?: string }) | null | undefined;

/** True when the current user created the trip. Owners have implicit
 *  Planner-tier rights and can additionally manage roster + delete the
 *  trip outright (powers Planners alone do not have). */
export function isOwner(trip: TripPermInput): boolean {
    if (!trip) return false;
    const me = STATE.user?.id;
    if (!me) return false;
    return trip.ownerId === me || trip.user_id === me;
}

/** Read the current user's role on the trip, or 'planner' for owners as a
 *  defensive fallback (a freshly-created trip might fetch /api/data before
 *  the owner-row backfill lands). */
export function getMyRole(trip: TripPermInput): TripRole | null {
    if (!trip) return null;
    if (isOwner(trip)) return ROLE_PLANNER;
    return trip.myRole ?? null;
}

/** Can the current user edit trip-level content (rename, days, plan)?
 *  Planner-only. Budgeteers are *NOT* allowed here — they only edit
 *  expenses (see canEditExpenses). */
export function canEdit(trip: TripPermInput): boolean {
    return getMyRole(trip) === ROLE_PLANNER;
}

/** Can the current user add/edit/delete expenses on this trip?
 *  Planners and Budgeteers; Relaxers cannot. Use this on the expense
 *  form, settlement page, and the History tab's edit/delete buttons. */
export function canEditExpenses(trip: TripPermInput): boolean {
    const role = getMyRole(trip);
    return role === ROLE_PLANNER || role === ROLE_BUDGETEER;
}

/** Can the current user manage the trip's roster (companions / members /
 *  invitations)? Owners only — sidesteps "two planners both labelled the
 *  same companion differently" naming-conflict for now. */
export function canManageRoster(trip: TripPermInput): boolean {
    return isOwner(trip);
}

/** Can the current user delete the entire trip (not archive — actual
 *  destruction)? Owner-only by design; Phase 3 spec is explicit on this. */
export function canDelete(trip: TripPermInput): boolean {
    return isOwner(trip);
}

