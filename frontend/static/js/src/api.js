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

// ── Auth token storage ──────────────────────────────────────────────────────
// Phase G: server issues a JWT after Google verification; we store it in
// localStorage and attach it to every API request. Replaces the old
// trust-the-client-user_id pattern where the server believed whatever
// user_id was in the request body.

const TOKEN_KEY = 'gg_auth_token';

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);
export const setAuthToken = (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
};
export const clearAuthToken = () => localStorage.removeItem(TOKEN_KEY);

/** Merge Authorization: Bearer <token> into an options object's headers,
 *  preserving anything the caller already set. */
function _withAuth(options = {}) {
    const token = getAuthToken();
    if (!token) return options;
    return {
        ...options,
        headers: { ...(options.headers || {}), 'Authorization': `Bearer ${token}` },
    };
}

/** Centralized fetch wrapper that:
 *  1. Prepends API_BASE_URL when called with a relative path
 *  2. Attaches Authorization: Bearer <token> if a token is stored
 *  3. On 401 (token rejected — expired, invalid, deleted user), clears
 *     the stored token + STATE.user and triggers a re-render so the
 *     login wall comes back into view.
 *  Returns the raw Response so callers can branch on .ok / .status. */
export async function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : apiUrl(path);
    const res = await fetch(url, _withAuth(options));
    if (res.status === 401 && getAuthToken()) {
        clearAuthToken();
        STATE.user = null;
        emit(EVENTS.STATE_CHANGED);
    }
    return res;
}

export async function syncWithServer() {
    if (!STATE.user) return;
    try {
        await apiFetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Phase G: caller's user_id is now derived from the JWT;
                // server ignores any user_id in the body. Kept off the
                // payload entirely so it's clear who the source of truth is.
                trips: STATE.trips,
                archived_trips: STATE.archivedTrips || [],
                expenses: STATE.expenses,
                activities: STATE.activities,
                photos: STATE.photos,
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
        const res = await apiFetch('/api/data');
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

const _post = (url, body) => apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
}).catch(e => console.error(`POST ${url} failed:`, e));

const _delete = (url, body) => apiFetch(url, {
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
        const res = await apiFetch(url, {
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

// All the helpers below: caller's user_id is now derived from the JWT
// server-side (see /src/auth.py current_user_id()). We no longer pass
// user_id in the body — the server ignores it anyway.

/** Upsert a single trip to the server. */
export function upsertTrip(trip) {
    if (!STATE.user) return;
    return _post('/api/trips', { trip });
}

/** Permanently delete a trip and its expenses from the server. */
export function deleteTrip(tripId) {
    if (!STATE.user) return;
    return _delete(`/api/trips/${tripId}`, {});
}

/** Mark a trip as archived on the server. Phase 3: archive is PER-USER —
 *  flips the caller's `trip_members.is_archived`, leaving other members'
 *  state untouched. Owners additionally mirror to legacy `trips.is_archived`
 *  so collections / public-trips rendering keeps working. */
export function archiveTripOnServer(tripId) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/archive`, {});
}

/** Inverse of archiveTripOnServer — flips the caller's
 *  `trip_members.is_archived` back to 0 (and `trips.is_archived` for
 *  owners). Restore-from-Collections must call this; otherwise the
 *  trip re-archives on every reload because /api/data reads the
 *  per-user member flag, which the local STATE mutation alone can't fix. */
export function unarchiveTripOnServer(tripId) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/unarchive`, {});
}

// ── Feed (social / sharing) ────────────────────────────────────────
// All four return `{ ok, status, body }` so the calling UI can branch
// on success, surface errors, and roll back optimistic state when the
// server rejects (forbidden / archived / 429 rate limit). The feed page
// treats failure on like/bookmark as transient — keeps the UI in the
// new state and lets the next refresh reconcile.

/** Post the user's trip to their feed (their friends' feeds will surface
 *  it as a `friend_shared_trip` event). Idempotent server-side: re-sharing
 *  the same trip returns the existing post id rather than duplicating;
 *  re-sharing with a different caption updates the caption on the
 *  existing row.
 *  @param {string} tripId
 *  @param {string} [caption] - optional ≤280-char blurb above the trip
 */
export function shareTripToFeed(tripId, caption) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/feed/share', { trip_id: tripId, caption });
}

/** Check whether the caller has already shared this trip (and read back
 *  the caption + post_id if so). Used by the home page on mount to set
 *  the Share-to-feed button's initial state without a needless write. */
export async function fetchShareStatus(tripId) {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch(`/api/feed/share/status/${encodeURIComponent(tripId)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error('fetchShareStatus failed:', e);
        return null;
    }
}

/** Delete one of your own shares. Server cascade-deletes any reposts
 *  pointing at it so the feed doesn't end up with broken-reference
 *  cards. Author-only; idempotent — silently no-ops on someone else's
 *  post or an already-deleted one. */
export async function unshareFeedPost(postId) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/share/${postId}`, { method: 'DELETE' });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('unshareFeedPost failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Repost an existing feed post (any user's). Spreads the trip beyond
 *  your immediate friend graph — your friends see the repost in their
 *  feed even if they don't know the original sharer. Idempotent per
 *  (caller, original_post). */
export function repostFeedPost(postId) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/repost/${postId}`, {});
}

/** Toggle a like on a feed event. The server returns the new state
 *  AND the new global count so a single round-trip lets us reconcile
 *  any drift from optimistic UI. event_id is the synthesised id from
 *  /api/feed (e.g. "trip_created_<trip>", "share_<post>"). */
export function toggleFeedLike(eventId) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/like/${encodeURIComponent(eventId)}`, {});
}

/** Toggle a personal bookmark on a feed event. No global count exposed
 *  (bookmarks are private — nobody sees what you save). */
export function toggleFeedBookmark(eventId) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/bookmark/${encodeURIComponent(eventId)}`, {});
}

/** Fetch the full comment thread for one feed event. Lazy — only called
 *  when the user expands the thread. Returns oldest-first order so the
 *  UI can append-render without re-sorting. Returns the parsed array
 *  on success or null on failure (callers treat null as "show nothing
 *  yet, will retry when user re-expands"). */
export async function fetchFeedComments(eventId) {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch(`/api/feed/comments/${encodeURIComponent(eventId)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data : null;
    } catch (e) {
        console.error('fetchFeedComments failed:', e);
        return null;
    }
}

/** Post a new comment on a feed event. Returns `{ ok, body }` where
 *  `body.comment` is the freshly-inserted row (server-set id + created_at)
 *  so the UI can append without a follow-up GET — saves a round-trip
 *  and avoids the "you posted but the thread is stale" race. */
export function postFeedComment(eventId, body) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/comment/${encodeURIComponent(eventId)}`, { body });
}

/** Delete one of your own comments. Author-only on the server; silently
 *  no-ops if the row is already gone (idempotent DELETE). Returns
 *  `{ ok, body }` shape consistent with the other feed helpers. */
export async function deleteFeedComment(commentId) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/comment/${commentId}`, { method: 'DELETE' });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('deleteFeedComment failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Phase 3 — invite a friend (linked-companion's user_id) to a trip with a role.
 *  Server creates a pending member row + fires `trip_invite` notification. */
export function inviteTripMember(tripId, targetUserId, role) {
    if (!STATE.user) return;
    return _post('/api/trips/invite', {
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
        trip_id: tripId,
        target_user_id: targetUserId,
    });
}

/** Upsert a single expense to the server. */
export function upsertExpense(expense) {
    if (!STATE.user) return;
    return _post('/api/expenses', { expense });
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, {});
}

/** Fetch the user's accepted friends. Used by the trip companions
 *  picker to surface friend candidates that aren't already on the trip. */
export async function fetchAcceptedFriends() {
    if (!STATE.user) return [];
    try {
        const res = await apiFetch('/api/friends/list');
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
    return _post('/api/categories', { categories: STATE.categories });
}

/** Upsert a single budget to the server. */
export function upsertBudget(budget) {
    if (!STATE.user) return;
    return _post('/api/budgets', { budget });
}

/** Delete a single budget from the server. */
export function deleteBudgetOnServer(budgetId) {
    if (!STATE.user) return;
    return _delete(`/api/budgets/${budgetId}`, {});
}

/** Upsert a single trip day to the server. */
export function upsertDay(day) {
    if (!STATE.user) return;
    return _post('/api/days', { day });
}

/** Delete a single trip day from the server. */
export function deleteDayOnServer(dayId) {
    if (!STATE.user) return;
    return _delete(`/api/days/${dayId}`, {});
}

/** POST a file to /api/upload. Returns the parsed JSON response, or null on failure.
 *  Auth is JWT-gated server-side; apiFetch attaches the bearer header. */
export async function uploadMedia(file) {
    if (!STATE.user) return null;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
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
        const res = await apiFetch('/api/notifications/list');
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
        await apiFetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
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

