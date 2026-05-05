// @ts-check
// api.js — Backend fetch helpers

import { STATE, emit } from './state.js';
import { navigate } from './router.js';
import { API_BASE_URL, EVENTS, PAGES } from './constants.js';
import { validateServerData } from './schemas.js';
import { normalizeTripCompanions } from './companions.js';

// All fetch URLs are built via apiUrl() so the API_BASE_URL constant is the
// single point that needs to change when the backend isn't co-located with
// the frontend (e.g. the Capacitor mobile shell can't talk to localhost).
// Exported so page-level files can use it for their direct fetches too.
export const apiUrl = (path) => `${API_BASE_URL}${path}`;

export async function syncWithServer() {
    if (!STATE.user) return;
    try {
        await fetch(apiUrl('/api/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: STATE.user.id,
                trips: STATE.trips,
                archived_trips: STATE.archivedTrips || [],
                expenses: STATE.expenses,
                activities: STATE.activities,
                photos: STATE.photos,
                // groups (account-level companions) was removed — companions
                // are now per-trip. Server-side endpoint already drops the
                // field if present, but we don't send it at all.
                categories: STATE.categories || [],
                budgets: STATE.budgets || []
            })
        });
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

export async function pullFromServer() {
    if (!STATE.user) return;
    try {
        const res = await fetch(apiUrl(`/api/data?user_id=${encodeURIComponent(STATE.user.id)}`));
        const raw = await res.json();
        // Schema gate: a malformed response (HTML error page, partial outage,
        // schema drift) used to silently overwrite STATE with junk. Now we
        // log + skip the update so the next pull can retry against good data.
        const result = validateServerData(raw);
        if (!result.ok) {
            console.error('pullFromServer: server data invalid —', result.error);
            return;
        }
        const data = result.value;

        // Split trips into active and archived. Each trip's `companions`
        // field is normalized through the trip-companion shape upgrade so
        // legacy `string[]` payloads (or partial objects from older clients)
        // get promoted to the canonical `Companion[]` shape.
        const allTrips = (data.trips || []).map(t => ({
            ...t,
            companions: normalizeTripCompanions(t.companions),
        }));
        // Backfill: every trip the current user OWNS should carry a
        // self-linked companion entry so they appear in the Who-Paid
        // dropdown / settlement balance / chip panel without an extra
        // step. Matches the stamp openNewTripModal applies for new trips.
        const me = STATE.user;
        const myFirstName = me?.name?.split(' ')[0] || 'Me';
        for (const trip of allTrips) {
            if (!me || trip.ownerId !== me.id) continue;
            const hasSelf = trip.companions.some(c => c.linkedUserId === me.id);
            if (!hasSelf) {
                trip.companions.unshift({ name: myFirstName, linkedUserId: me.id });
            }
        }
        STATE.trips = allTrips.filter(t => !t.isArchived);
        STATE.archivedTrips = allTrips.filter(t => t.isArchived);

        STATE.expenses = data.expenses || [];
        // Account-level companions (data.companions) is no longer used —
        // companions live per-trip on `trip.companions`.
        STATE.categories = data.categories || [];
        STATE.budgets = data.budgets || [];
        STATE.tripDays = data.tripDays || [];

        emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber

        await fetchNotifications(); // already emits 'notifications:changed'

        // Re-render current page to show new data
        const known = /** @type {string[]} */ (Object.values(PAGES));
        const hash = window.location.hash.replace('#', '');
        const current = /** @type {import('./constants.js').PageName} */ (
            known.includes(hash) ? hash : PAGES.HOME
        );
        navigate(current);
    } catch (e) {
        console.error("Pull from server failed:", e);
    }
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.

const _post = (url, body) => fetch(apiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
}).catch(e => console.error(`POST ${url} failed:`, e));

const _delete = (url, body) => fetch(apiUrl(url), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
}).catch(e => console.error(`DELETE ${url} failed:`, e));

/** Like `_post` but returns `{ ok, status, body }` so callers can branch
 *  on the result. Used by the invite-response flows where a stale
 *  invitation (already cancelled, already accepted, deleted trip) should
 *  surface an error message rather than silently optimistically-update
 *  the UI. */
const _postJson = async (url, body) => {
    try {
        const res = await fetch(apiUrl(url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON, ignore */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error(`POST ${url} failed:`, e);
        return { ok: false, status: 0, body: null };
    }
};

/** Upsert a single trip to the server. */
export function upsertTrip(trip) {
    if (!STATE.user) return;
    return _post('/api/trips', { user_id: STATE.user.id, trip });
}

/** Permanently delete a trip and its expenses from the server. */
export function deleteTrip(tripId) {
    if (!STATE.user) return;
    return _delete(`/api/trips/${tripId}`, { user_id: STATE.user.id });
}

/** Mark a trip as archived on the server. Phase 3: archive is PER-USER —
 *  flips the caller's `trip_members.is_archived`, leaving other members'
 *  state untouched. Owners additionally mirror to legacy `trips.is_archived`
 *  so collections / public-trips rendering keeps working. */
export function archiveTripOnServer(tripId) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/archive`, { user_id: STATE.user.id });
}

/** Phase 3 — invite a friend (linked-companion's user_id) to a trip with a role.
 *  Server creates a pending member row + fires `trip_invite` notification. */
export function inviteTripMember(tripId, targetUserId, role) {
    if (!STATE.user) return;
    return _post('/api/trips/invite', {
        user_id: STATE.user.id,
        trip_id: tripId,
        target_user_id: targetUserId,
        role,
    });
}

/** Accept or decline a pending trip invitation. Returns `{ok, status, body}`
 *  so the response modal can show a useful error if the invitation went
 *  stale (e.g. the trip was deleted or the user was already removed). */
export function respondTripInvite(tripId, accept) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/trips/invite/respond', {
        user_id: STATE.user.id,
        trip_id: tripId,
        accept,
    });
}

/** Planner-only — hard-remove a member from a trip. Their member row is
 *  deleted, the trip stops appearing in their /api/data response, and they
 *  get a `trip_member_removed` notification. */
export function removeTripMember(tripId, targetUserId) {
    if (!STATE.user) return;
    return _post('/api/trips/members/remove', {
        user_id: STATE.user.id,
        trip_id: tripId,
        target_user_id: targetUserId,
    });
}

/** Upsert a single expense to the server. */
export function upsertExpense(expense) {
    if (!STATE.user) return;
    return _post('/api/expenses', { user_id: STATE.user.id, expense });
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, { user_id: STATE.user.id });
}

/** Fetch the user's accepted friends. Used by the trip companions
 *  picker to surface friend candidates that aren't already on the trip. */
export async function fetchAcceptedFriends() {
    if (!STATE.user) return [];
    try {
        const res = await fetch(apiUrl(`/api/friends/list?user_id=${encodeURIComponent(STATE.user.id)}`));
        const friends = await res.json();
        return Array.isArray(friends) ? friends : [];
    } catch (e) {
        console.error('fetchAcceptedFriends failed:', e);
        return [];
    }
}

/** Replace the full category list on the server. */
export function syncCategories() {
    if (!STATE.user) return;
    return _post('/api/categories', { user_id: STATE.user.id, categories: STATE.categories });
}

/** Upsert a single budget to the server. */
export function upsertBudget(budget) {
    if (!STATE.user) return;
    return _post('/api/budgets', { user_id: STATE.user.id, budget });
}

/** Delete a single budget from the server. */
export function deleteBudgetOnServer(budgetId) {
    if (!STATE.user) return;
    return _delete(`/api/budgets/${budgetId}`, { user_id: STATE.user.id });
}

/** Upsert a single trip day to the server. */
export function upsertDay(day) {
    if (!STATE.user) return;
    return _post('/api/days', { user_id: STATE.user.id, day });
}

/** Delete a single trip day from the server. */
export function deleteDayOnServer(dayId) {
    if (!STATE.user) return;
    return _delete(`/api/days/${dayId}`, { user_id: STATE.user.id });
}

/** POST a file to /api/upload. Returns the parsed JSON response, or null on failure.
 *  Includes the caller's user_id so the server can reject anonymous uploads
 *  (the endpoint used to accept any POST, which let unauthenticated traffic
 *  dump arbitrary files into /static/uploads). */
export async function uploadMedia(file) {
    if (!STATE.user) return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', STATE.user.id);
    try {
        const res = await fetch(apiUrl('/api/upload'), { method: 'POST', body: formData });
        return await res.json();
    } catch (e) {
        console.error("Upload failed", e);
        return null;
    }
}
// ── END DELTA SYNC HELPERS ────────────────────────────────────────────────────

export async function fetchNotifications() {
    if (!STATE.user) return;
    try {
        const res = await fetch(apiUrl(`/api/notifications/list?user_id=${encodeURIComponent(STATE.user.id)}`));
        const notifications = await res.json();
        STATE.notifications = notifications;
        emit(EVENTS.NOTIFICATIONS_CHANGED);
    } catch (e) {
        console.error("Failed to fetch notifications:", e);
    }
}

export async function markNotificationsRead() {
    if (!STATE.user) return;
    try {
        await fetch(apiUrl('/api/notifications/read'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: STATE.user.id })
        });
        STATE.notifications.forEach(n => n.is_read = 1);
        emit(EVENTS.NOTIFICATIONS_CHANGED);
    } catch (e) {
        console.error("Failed to mark notifications read:", e);
    }
}

export async function fetchHistoricalRates(dates) {
    if (dates.length === 0) return;

    // Sort dates to find range
    const sorted = [...dates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];

    if (!start || !end) return;

    try {
        // We fetch conversion from EUR to others for the range
        // Frankfurter range limit is 1 year, we'll just fetch for the trip range
        const url = `https://api.frankfurter.app/${start}..${end}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }
            Object.entries(data.rates).forEach(([date, rates]) => {
                Object.entries(rates).forEach(([curr, rate]) => {
                    STATE.rateCache[`${date}_${curr}_EUR`] = 1 / rate; // Store as curr -> EUR
                });
            });
            emit('state:changed');
        }
    } catch (e) {
        console.error("Failed to fetch historical rates:", e);
    }
}

