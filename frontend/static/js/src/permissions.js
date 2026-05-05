// @ts-check
// permissions.js — Single boundary for role-based UI decisions.
//
// Phase 3 introduces shared trips with two roles (Planner / Relaxer). Future
// phases may add Editor, Observer, Treasurer, etc.; the surface area for
// adding a role is this module + maybe the dropdown in the companion picker
// — every page that hides or shows an edit affordance goes through these
// helpers, not the role string directly.
//
// Source-of-truth flow:
//   server (trip_members.role) → /api/data → trip.myRole → these helpers

import { STATE } from './state.js';

export const ROLE_PLANNER = 'planner';
export const ROLE_RELAXER = 'relaxer';

/** True when the current user created the trip. Owners have implicit
 *  Planner-tier rights and can additionally manage roster + delete the
 *  trip outright (powers Planners alone do not have). */
export function isOwner(trip) {
    if (!trip) return false;
    const me = STATE.user?.id;
    if (!me) return false;
    return trip.ownerId === me || trip.user_id === me;
}

/** Read the current user's role on the trip, or 'planner' for owners as a
 *  defensive fallback (a freshly-created trip might fetch /api/data before
 *  the owner-row backfill lands). */
export function getMyRole(trip) {
    if (!trip) return null;
    if (isOwner(trip)) return ROLE_PLANNER;
    return trip.myRole ?? null;
}

/** Can the current user edit the trip's contents (expenses, days, plan)?
 *  Phase 3: planner-only. Adding 'editor' later means one new branch. */
export function canEdit(trip) {
    return getMyRole(trip) === ROLE_PLANNER;
}

/** Can the current user manage the trip's roster (companions / members /
 *  invitations)? Owners only — sidesteps "two planners both labelled the
 *  same companion differently" naming-conflict for now. */
export function canManageRoster(trip) {
    return isOwner(trip);
}

/** Can the current user delete the entire trip (not archive — actual
 *  destruction)? Owner-only by design; Phase 3 spec is explicit on this. */
export function canDelete(trip) {
    return isOwner(trip);
}

/** Can the current user invite/kick members? Same as `canManageRoster` for
 *  now; kept as a separate helper so a future "Co-Planner can invite but
 *  can't change roster names" rule is a single-line edit here. */
export function canInviteMembers(trip) {
    return isOwner(trip);
}

/** Can the current user archive their own copy of the trip? Always true
 *  for any accepted member (incl. relaxers — archive is just a personal
 *  hide flag, not a write to shared trip data). */
export function canArchive(trip) {
    return getMyRole(trip) !== null;
}
