// api/feed.ts — feed / social / trip-members / follow + friends / explore /
// clone + share. Depends only on core (apiFetch, _post, _postJson,
// errMessage) + external (state). NEVER imports api.ts.

import { STATE } from '../state.js';
import { apiFetch, _post, _postJson, errMessage } from './core.js';

/** Audit fix (2026-05-27 fix #36/#59): block primitive helpers.
 *  Powers the Settings → Blocked-users tab + the per-row block
 *  affordance on profile cards. Block / unblock are idempotent
 *  per the server route. */
export interface BlockedUser {
    id: string;
    name: string | null;
    picture: string | null;
    createdAt: string;
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
    if (!STATE.user) return [];
    try {
        const res = await apiFetch('/api/blocks');
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body && body.blocks) ? body.blocks : [];
    } catch {
        return [];
    }
}

export async function blockUser(userId: string): Promise<boolean> {
    if (!STATE.user) return false;
    try {
        const res = await apiFetch(`/api/blocks/${encodeURIComponent(userId)}`, {
            method: 'POST',
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function unblockUser(userId: string): Promise<boolean> {
    if (!STATE.user) return false;
    try {
        const res = await apiFetch(`/api/blocks/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Deep-copy a trip the caller can see (their own archived trip OR a
 *  trip they're a member of OR a public trip) into a fresh draft
 *  owned by them. Server returns `{ tripId }` for the new clone.
 *  See §4.6 in src/routes/trips.py for the privacy contract on
 *  what's copied vs. dropped. */
export function cloneTrip(sourceTripId: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/trips/clone/${encodeURIComponent(sourceTripId)}`, {});
}

/** Same as cloneTrip but resolves the source via a share-link token.
 *  Used by the "I want this trip" CTA on /share/<token> — the
 *  recipient may not be a member of the source trip; possession of
 *  the token IS the proof of intent to share. */
export function cloneTripFromShareToken(token: string) {
    if (!STATE.user) return Promise.resolve({ ok: false, status: 0, body: null });
    return _postJson(`/api/share/${encodeURIComponent(token)}/clone`, {});
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

/** MK4 SOC-4: fetch the caller's saved items as fully-resolved feed
 *  events. Unlike the live /api/feed (capped to a 30-day window), the
 *  server re-resolves each saved event_id independently of the window
 *  AND re-runs the per-event visibility check — so an item that aged
 *  out of the feed still surfaces here, while a since-gone-private /
 *  since-deleted item silently drops out. Returns the parsed array of
 *  event dicts (same wire shape as /api/feed's bare-array response) or
 *  null on failure (callers treat null as "couldn't load saved items").
 *
 *  Typed loosely (api/feed.ts is a leaf module that must not import the
 *  render-layer FeedEvent type); the Feed page casts to FeedEvent[]. */
export async function fetchFeedBookmarks(): Promise<Array<Record<string, unknown>> | null> {
    if (!STATE.user) return null;
    try {
        const res = await apiFetch('/api/feed/bookmarks');
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data : null;
    } catch (e) {
        console.error('fetchFeedBookmarks failed:', e);
        return null;
    }
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

/** Audit fix (2026-05-27 fix #60): edit one of your own comments in place.
 *  Pairs with the PATCH /api/feed/comment/<id> server route (fix #35).
 *  Pre-fix the only way to fix a typo was delete + re-post, which lost
 *  the comment's chronological position. Author-only on the server; body
 *  is silently truncated to 500 chars to mirror the create path. */
export async function editFeedComment(commentId: string | number, body: string) {
    if (!STATE.user) return { ok: false, status: 0, body: null };
    try {
        const res = await apiFetch(`/api/feed/comment/${commentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
        });
        let payload = null;
        try { payload = await res.json(); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: payload };
    } catch (e) {
        console.error('editFeedComment failed:', e);
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

// ── §4.7 Follows ─────────────────────────────────────────────────────
// One-way social graph. Symmetric `friends` still exists for private
// trip sharing; follows is the public/audience layer on top.

export interface FollowState {
    isFollowing: boolean;
    followers: number;
    following: number;
}

export async function followUser(userId: string): Promise<{ state?: FollowState; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch(`/api/follows/${encodeURIComponent(userId)}`, { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return { state: body as FollowState };
    } catch (e) {
        return { error: errMessage(e) || 'Network error' };
    }
}

export async function unfollowUser(userId: string): Promise<{ state?: FollowState; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch(`/api/follows/${encodeURIComponent(userId)}`, { method: 'DELETE' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return { state: body as FollowState };
    } catch (e) {
        return { error: errMessage(e) || 'Network error' };
    }
}


// ── §4.2 Explore feed ────────────────────────────────────────────────
// Ranked public-trip discovery for the cold-start case. Backend at
// /api/feed/explore returns up to 24 cards scored on recency × country
// relevance × engagement; see routes/feed.py for the heuristic.

/** Shape of one card returned by /api/feed/explore. Matches the
 *  backend serializer; kept inline rather than in types.d.ts because
 *  it's a transient view-model (not part of STATE). */
export interface ExploreFeedItem {
    tripId: string;
    name: string;
    country: string;
    countryCode: string;
    coverUrl: string | null;
    shareToken: string;
    shareViews: number;
    owner: {
        id: string;
        name: string;
        firstName: string;
        picture: string | null;
    };
    createdAt: string | null;
}

export async function fetchExploreFeed(): Promise<{ items?: ExploreFeedItem[]; error?: string }> {
    if (!STATE.user) return { error: 'Not signed in' };
    try {
        const res = await apiFetch('/api/feed/explore');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body?.error || `HTTP ${res.status}` };
        return body;
    } catch (e) {
        return { error: errMessage(e) || 'Network error' };
    }
}
