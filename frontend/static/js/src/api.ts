// api.ts — Backend fetch helpers

import { STATE, emit } from './state.js';
import { navigate } from './router.js';
import { API_BASE_URL, EVENTS, PAGES, type PageName } from './constants.js';
import { validateServerData } from './schemas.js';
import { normalizeTripCompanions } from './companions.js';

// All fetch URLs are built via apiUrl() so the API_BASE_URL constant is the
// single point that needs to change when the backend isn't co-located with
// the frontend (e.g. the Capacitor mobile shell can't talk to localhost).
// Exported so page-level files can use it for their direct fetches too.
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

// ── Auth token storage ──────────────────────────────────────────────────────
// Phase G: server issues a JWT after Google verification; we store it in
// localStorage and attach it to every API request. Replaces the old
// trust-the-client-user_id pattern where the server believed whatever
// user_id was in the request body.

const TOKEN_KEY = 'gg_auth_token';

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);
export const setAuthToken = (token: string | null | undefined): void => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
};
export const clearAuthToken = () => localStorage.removeItem(TOKEN_KEY);

/** Merge Authorization: Bearer <token> into an options object's headers,
 *  preserving anything the caller already set. */
function _withAuth(options: RequestInit = {}): RequestInit {
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
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
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
            const hasSelf = trip.companions.some((c: { linkedUserId?: string }) => c.linkedUserId === me.id);
            if (!hasSelf) {
                trip.companions.unshift({ name: myFirstName, linkedUserId: me.id });
            }
        }
        STATE.trips = allTrips.filter(t => !t.isArchived);
        STATE.archivedTrips = allTrips.filter(t => t.isArchived);

        // Re-validate STATE.activeTripId after replacing the trips
        // list. Without this:
        //  - First-load: activeTripId starts null. loadState() picks
        //    the first trip as a fallback BUT only on its initial run
        //    against localStorage; the subsequent pullFromServer
        //    overwrites STATE.trips and never re-runs the fallback,
        //    so activeTripId stays null even though there are now
        //    trips. UI surfaces (`#completeTripBtn`, `#editTripBtn`,
        //    the Companions tab) all gate on activeTripId being set.
        //  - Stale ID: if activeTripId pointed to a trip that's been
        //    deleted server-side, the lookup `STATE.trips.find(t =>
        //    t.id === STATE.activeTripId)` returns undefined every
        //    render until the user manually picks another trip.
        // The two-clause guard mirrors loadState's identical check.
        if (STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips.find(t => t.id === STATE.activeTripId))) {
            STATE.activeTripId = STATE.trips[0]!.id;
        }

        STATE.expenses = data.expenses || [];
        // Account-level companions (data.companions) is no longer used —
        // companions live per-trip on `trip.companions`.
        STATE.categories = data.categories || [];
        STATE.budgets = data.budgets || [];
        STATE.tripDays = data.tripDays || [];

        // Populate per-trip snapshots on archived trips so
        // collections.js renderArchivedTripDetail (which reads
        // trip.tripDays / trip.expenses directly off the trip
        // object, not from the global lists) works after a page
        // reload. The original archive operation in main.js
        // stamped these onto the trip locally — but on a fresh
        // pull the trip is rebuilt from the trips row alone, so
        // the snapshot was missing and the archived-trip detail
        // page rendered "no days." Re-stamping here keeps the
        // shape consistent regardless of how the trip arrived in
        // STATE.archivedTrips.
        for (const archived of STATE.archivedTrips) {
            archived.tripDays = STATE.tripDays.filter(d => d.tripId === archived.id);
            archived.expenses = STATE.expenses.filter(e => e.tripId === archived.id);
        }

        emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber

        await fetchNotifications(); // already emits 'notifications:changed'

        // Re-render current page to show new data
        const known: readonly string[] = Object.values(PAGES);
        const hash = window.location.hash.replace('#', '');
        const current: PageName = (known.includes(hash) ? hash : PAGES.HOME) as PageName;
        navigate(current);
    } catch (e) {
        console.error("Pull from server failed:", e);
    }
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.

const _post = (url: string, body: unknown) => apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`POST ${url} failed:`, e));

const _delete = (url: string, body: unknown) => apiFetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
}).catch(e => console.error(`DELETE ${url} failed:`, e));

/** Like `_post` but returns `{ ok, status, body }` so callers can branch
 *  on the result. Used by the invite-response flows where a stale
 *  invitation (already cancelled, already accepted, deleted trip) should
 *  surface an error message rather than silently optimistically-update
 *  the UI. */
/** Result envelope returned by every `_postJson` caller. `body` is `any`
 *  so each call site can read its own response shape without an extra
 *  cast — these endpoints are loosely typed; tightening them is a job
 *  for Phase A4 (zod schema validation at API boundaries). */
export interface ApiJsonResult {
    ok: boolean;
    status: number;
    body: any;
}

const _postJson = async (url: string, body: unknown): Promise<ApiJsonResult> => {
    try {
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let payload: any = null;
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
export function upsertTrip(trip: any) {
    if (!STATE.user) return;
    return _post('/api/trips', { trip });
}

/** Permanently delete a trip and its expenses from the server. */
export function deleteTrip(tripId: string) {
    if (!STATE.user) return;
    return _delete(`/api/trips/${tripId}`, {});
}

/** Mark a trip as archived on the server. Phase 3: archive is PER-USER —
 *  flips the caller's `trip_members.is_archived`, leaving other members'
 *  state untouched. Owners additionally mirror to legacy `trips.is_archived`
 *  so collections / public-trips rendering keeps working. */
export function archiveTripOnServer(tripId: string) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/archive`, {});
}

/** Inverse of archiveTripOnServer — flips the caller's
 *  `trip_members.is_archived` back to 0 (and `trips.is_archived` for
 *  owners). Restore-from-Collections must call this; otherwise the
 *  trip re-archives on every reload because /api/data reads the
 *  per-user member flag, which the local STATE mutation alone can't fix. */
export function unarchiveTripOnServer(tripId: string) {
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
export function shareTripToFeed(tripId: string, caption?: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/feed/share', { trip_id: tripId, caption });
}

/** Toggle the per-trip Actions-feed silencing flag. When `hidden=true`,
 *  the trip's create / archive / join events disappear from every
 *  viewer's Actions feed (owner included). Owner-only on the server —
 *  non-owner callers get 403 and we surface that as a non-ok result.
 *  Doesn't affect Posts (explicit shares stay shared).
 *  @param {string} tripId
 *  @param {boolean} hidden
 */
export async function setTripActionsHidden(tripId: string, hidden: boolean) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/silence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hidden: !!hidden }),
        });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('setTripActionsHidden failed:', e);
        return { ok: false, status: 0, body: null };
    }
}

/** Check whether the caller has already shared this trip (and read back
 *  the caption + post_id if so). Used by the home page on mount to set
 *  the Share-to-feed button's initial state without a needless write. */
export async function fetchShareStatus(tripId: string) {
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
export async function unshareFeedPost(postId: string | number) {
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
export function repostFeedPost(postId: string | number) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/repost/${postId}`, {});
}

/** Toggle a like on a feed event. The server returns the new state
 *  AND the new global count so a single round-trip lets us reconcile
 *  any drift from optimistic UI. event_id is the synthesised id from
 *  /api/feed (e.g. "trip_created_<trip>", "share_<post>"). */
export function toggleFeedLike(eventId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/like/${encodeURIComponent(eventId)}`, {});
}

/** Toggle a personal bookmark on a feed event. No global count exposed
 *  (bookmarks are private — nobody sees what you save). */
export function toggleFeedBookmark(eventId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/bookmark/${encodeURIComponent(eventId)}`, {});
}

/** Fetch the full comment thread for one feed event. Lazy — only called
 *  when the user expands the thread. Returns oldest-first order so the
 *  UI can append-render without re-sorting. Returns the parsed array
 *  on success or null on failure (callers treat null as "show nothing
 *  yet, will retry when user re-expands"). */
export async function fetchFeedComments(eventId: string) {
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
export function postFeedComment(eventId: string, body: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/feed/comment/${encodeURIComponent(eventId)}`, { body });
}

/** Delete one of your own comments. Author-only on the server; silently
 *  no-ops if the row is already gone (idempotent DELETE). Returns
 *  `{ ok, body }` shape consistent with the other feed helpers. */
export async function deleteFeedComment(commentId: string | number) {
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
export function inviteTripMember(tripId: string, targetUserId: string, role: string) {
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
export function respondTripInvite(tripId: string, accept: boolean) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson('/api/trips/invite/respond', {
        trip_id: tripId,
        accept,
    });
}

/** Planner-only — hard-remove a member from a trip. Their member row is
 *  deleted, the trip stops appearing in their /api/data response, and they
 *  get a `trip_member_removed` notification. */
export function removeTripMember(tripId: string, targetUserId: string) {
    if (!STATE.user) return;
    return _post('/api/trips/members/remove', {
        trip_id: tripId,
        target_user_id: targetUserId,
    });
}

/** Upsert a single expense to the server. */
export function upsertExpense(expense: any) {
    if (!STATE.user) return;
    return _post('/api/expenses', { expense });
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId: string) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, {});
}

/** Shape of a friend row returned by /api/friends/list. The picker
 *  needs id (to add as linked companion + invite), name (display),
 *  email (secondary line on the row), picture (avatar). */
export interface FriendListEntry {
    id: string;
    name: string;
    email: string;
    picture: string;
}

/** Fetch the user's accepted friends. Used by the trip companions
 *  picker to surface friend candidates that aren't already on the trip. */
export async function fetchAcceptedFriends(): Promise<FriendListEntry[]> {
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
export function upsertBudget(budget: any) {
    if (!STATE.user) return;
    return _post('/api/budgets', { budget });
}

/** Delete a single budget from the server. */
export function deleteBudgetOnServer(budgetId: string) {
    if (!STATE.user) return;
    return _delete(`/api/budgets/${budgetId}`, {});
}

/** Upsert a single trip day to the server. */
export function upsertDay(day: any) {
    if (!STATE.user) return;
    return _post('/api/days', { day });
}

/** Delete a single trip day from the server. */
export function deleteDayOnServer(dayId: string) {
    if (!STATE.user) return;
    return _delete(`/api/days/${dayId}`, {});
}

/** POST a file to /api/upload. Returns the parsed JSON response, or
 *  an `{error: string}` shape on failure. Round 1 audit fix: previous
 *  versions returned `null` on failure which made it impossible for
 *  callers (cover-photo upload, expense receipt, etc.) to surface a
 *  WHY message — the user just saw a generic "upload failed". Now
 *  the function returns the server's error body when available
 *  ("file too large", "MIME not allowed") so callers can show
 *  actionable feedback.
 *
 *  Auth is JWT-gated server-side; apiFetch attaches the bearer
 *  header. */
export async function uploadMedia(file: File | Blob): Promise<{ url?: string; name?: string; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    // Client-side size guard. Server enforces 10MB via MAX_CONTENT_LENGTH
    // but Flask returns a generic 413 with no helpful body — easier to
    // catch the obvious case here and skip the round trip.
    const MAX_BYTES = 10 * 1024 * 1024;
    if ((file as File).size && (file as File).size > MAX_BYTES) {
        const mb = ((file as File).size / (1024 * 1024)).toFixed(1);
        return { error: `File is ${mb} MB — max is 10 MB. Try compressing it.` };
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            // Server explicitly rejected — try to read its error body.
            try {
                const body = await res.json();
                if (body?.error) return { error: String(body.error) };
            } catch (_) { /* not JSON */ }
            // Fallbacks by status code so the user sees SOMETHING useful.
            if (res.status === 413) return { error: 'File is too large (max 10 MB).' };
            if (res.status === 415) return { error: 'That file type isn\'t supported.' };
            if (res.status === 401) return { error: 'Sign in expired — refresh the page.' };
            return { error: `Upload failed (HTTP ${res.status}).` };
        }
        return await res.json();
    } catch (e) {
        // Network error / timeout / DNS — the request never completed.
        console.error('Upload failed', e);
        return { error: 'Network error — check your connection and try again.' };
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

export async function fetchHistoricalRates(dates: string[]) {
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
            const data: { rates: Record<string, Record<string, number>> } = await resp.json();
            // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }
            Object.entries(data.rates).forEach(([date, rates]) => {
                Object.entries(rates).forEach(([curr, rate]) => {
                    STATE.rateCache[`${date}_${curr}_EUR`] = 1 / rate; // Store as curr -> EUR
                });
            });
            emit(EVENTS.STATE_CHANGED);
        }
    } catch (e) {
        console.error("Failed to fetch historical rates:", e);
    }
}

