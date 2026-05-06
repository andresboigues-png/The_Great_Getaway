// @ts-check
// feed.js — Activity feed page. Pulls /api/feed (mostly synthesised
// server-side from trips + friends + trip_members; explicit shares and
// reposts come from `feed_posts`) and renders a vertical list of "your
// friend did a thing" cards.
//
// Two-phase render: first paint shows whatever's in the module-level
// cache (so navigating back to the feed feels instant), then the
// background fetch repaints with fresh data. Empty state is reachable
// in two distinct ways and both use the same dashed-purple block:
//   - "No friends yet" (the prerequisite for any event to exist)
//   - "No recent activity" (you have friends, they're just quiet)
// We don't render fake placeholder events — silence is honest.
//
// Like / repost / bookmark all use optimistic UI: the card flips to its
// new state immediately on click, then the network call reconciles
// (the server returns authoritative count + state). Failures keep the
// new state and let the next refresh sort it out — for a "nice to know"
// feature an alarming red toast on every transient blip is too much.

import { STATE } from '../state.js';
import { apiFetch, toggleFeedLike, toggleFeedBookmark, repostFeedPost,
         fetchFeedComments, postFeedComment, deleteFeedComment } from '../api.js';
import { esc, q, showLiquidAlert } from '../utils.js';
import { navigate } from '../router.js';

/** @typedef {{id:string,name:string,picture?:string|null}} Actor */
/** @typedef {{id:string,name:string,country?:string|null}} TripRef */
/** @typedef {{
 *   id: string,
 *   type: 'friend_created_trip'|'friend_archived_trip'|'friend_joined_trip'|'new_friendship'|'friend_shared_trip'|'friend_reposted_trip',
 *   actor: Actor,
 *   trip?: TripRef,
 *   original_sharer?: Actor,
 *   post_id?: number,
 *   when: string|null,
 *   like_count?: number,
 *   is_liked?: boolean,
 *   is_bookmarked?: boolean,
 *   comment_count?: number,
 * }} FeedEvent */
/** @typedef {{ id: number, author: Actor, body: string, when: string }} FeedComment */

// Module-level cache survives navigation away and back, so the second
// visit paints from cache before the network call returns.
/** @type {FeedEvent[]} */
let cachedEvents = [];
// Per-event comment cache. Lazy-populated when the user expands a thread,
// then re-used on collapse + re-expand within the same session so we
// don't refetch on every click. Cleared whenever the feed itself is
// refreshed from the server (cachedEvents replacement clears stale
// counts; the thread cache becomes stale-but-still-readable, which is
// fine — the next expand re-fetches anyway).
/** @type {Object<string, FeedComment[]>} */
const cachedThreads = {};

/** Avatar circle — picture if available, otherwise a gradient initials
 *  badge so empty avatars don't break the visual rhythm. Mirrors the
 *  helper in friends.js so both pages render the same way. */
function avatar(user, size = 44) {
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    if (user?.picture) {
        return `<img src="${esc(user.picture)}" alt="" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`;
    }
    return `<div style="width:${size}px; height:${size}px; border-radius:50%; background: linear-gradient(135deg, #007aff, #5856d6); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size * 0.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${esc(initial)}</div>`;
}

/** Format an ISO timestamp as a relative phrase ("5m ago", "2h ago",
 *  "3d ago"). Falls back to a locale-formatted date for anything
 *  beyond a week so old activity reads naturally. NULL/invalid input
 *  → empty string (the card just hides the time line). */
function relativeTime(iso) {
    if (!iso) return '';
    // SQLite emits 'YYYY-MM-DD HH:MM:SS' which `new Date()` parses as
    // local time on Safari but UTC on Chrome — splice in a 'T' and
    // 'Z' so it's unambiguously ISO-8601 UTC across browsers.
    const normalised = typeof iso === 'string' && iso.includes(' ') && !iso.includes('T')
        ? iso.replace(' ', 'T') + 'Z'
        : iso;
    const t = new Date(normalised).getTime();
    if (Number.isNaN(t)) return '';
    const diffMs = Date.now() - t;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Build the human verb line for one event. Kept switch-style so adding
 *  a new event type is one branch — no clever inference. The actor name
 *  is bolded; the trip name (when present) is bolded too so the eye
 *  catches "WHO did WHAT to WHICH trip" at a glance. */
function eventLine(ev) {
    const who = `<strong style="color:#002d5b;">${esc(ev.actor.name)}</strong>`;
    const tripName = ev.trip ? `<strong style="color:#002d5b;">${esc(ev.trip.name || ev.trip.country || 'a trip')}</strong>` : '';
    switch (ev.type) {
        case 'friend_created_trip':
            return `${who} started planning a new trip — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
        case 'friend_archived_trip':
            return `${who} just completed their trip to <strong style="color:#002d5b;">${esc(ev.trip?.country || ev.trip?.name || 'somewhere')}</strong> 🎉`;
        case 'friend_joined_trip':
            return `${who} joined the trip ${tripName}`;
        case 'new_friendship':
            return `You and ${who} are now friends 🤝`;
        case 'friend_shared_trip':
            return `${who} shared a trip — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
        case 'friend_reposted_trip': {
            const orig = ev.original_sharer
                ? `<strong style="color:#002d5b;">${esc(ev.original_sharer.name)}</strong>`
                : 'someone';
            return `${who} reposted ${orig}'s trip — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
        }
        default:
            // Unknown type — render a generic "did something" line
            // rather than crash. Forward-compat for new types the
            // backend may add before the frontend bundles roll out.
            return `${who} did something new`;
    }
}

/** Per-event accent — picks a tint and emoji per type. Keeps cards
 *  visually grouped so a busy feed reads as "trips × N, friendships × M"
 *  at a glance instead of a wall of identical glass blocks. */
function eventAccent(type) {
    switch (type) {
        case 'friend_created_trip':   return { color: '#0071e3', icon: '🗺️' };
        case 'friend_archived_trip':  return { color: '#34c759', icon: '🏁' };
        case 'friend_joined_trip':    return { color: '#ff9500', icon: '👥' };
        case 'new_friendship':        return { color: '#9b59b6', icon: '🤝' };
        case 'friend_shared_trip':    return { color: '#5856d6', icon: '📣' };
        case 'friend_reposted_trip':  return { color: '#5856d6', icon: '🔁' };
        default:                      return { color: '#8e8e93', icon: '✨' };
    }
}

/** Build the action-row HTML — like, comment, repost, bookmark. Repost
 *  only appears on shareable events (friend_shared_trip + friend_reposted_trip),
 *  since reposting an auto-synthesised "X created a trip" event has no
 *  source post to point back to. Like + comment + bookmark live on every
 *  event. The thread itself renders below the action row when expanded
 *  (built lazily by the click handler — empty `<div class="feed-thread">`
 *  shipped with every card so the slot is always there). */
function actionsRow(ev) {
    const liked = !!ev.is_liked;
    const bookmarked = !!ev.is_bookmarked;
    const count = ev.like_count || 0;
    const commentCount = ev.comment_count || 0;
    const canRepost = (ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip') && ev.post_id;
    const likeBtn = `
        <button type="button" class="feed-like-btn" data-event-id="${esc(ev.id)}" data-liked="${liked ? '1' : '0'}"
            title="${liked ? 'Unlike' : 'Like'}" aria-label="${liked ? 'Unlike' : 'Like'}"
            style="display:inline-flex; align-items:center; gap:5px; background:transparent; border:0; padding:4px 8px; border-radius:999px; cursor:pointer; color:${liked ? '#ff3b30' : 'var(--text-secondary)'}; font-weight:700; font-size:0.82rem; transition: background 0.15s;">
            <span style="font-size:1.05rem;">${liked ? '❤️' : '🤍'}</span>
            <span class="feed-like-count">${count > 0 ? count : ''}</span>
        </button>
    `;
    const commentBtn = `
        <button type="button" class="feed-comment-btn" data-event-id="${esc(ev.id)}"
            title="Comments" aria-label="Comments"
            style="display:inline-flex; align-items:center; gap:5px; background:transparent; border:0; padding:4px 8px; border-radius:999px; cursor:pointer; color:var(--text-secondary); font-weight:700; font-size:0.82rem; transition: background 0.15s;">
            <span style="font-size:1.05rem;">💬</span>
            <span class="feed-comment-count">${commentCount > 0 ? commentCount : ''}</span>
        </button>
    `;
    const repostBtn = canRepost ? `
        <button type="button" class="feed-repost-btn" data-post-id="${ev.post_id}"
            title="Repost to your friends" aria-label="Repost"
            style="display:inline-flex; align-items:center; gap:5px; background:transparent; border:0; padding:4px 8px; border-radius:999px; cursor:pointer; color:var(--text-secondary); font-weight:700; font-size:0.82rem; transition: background 0.15s;">
            <span style="font-size:1.05rem;">🔁</span>
            <span>Repost</span>
        </button>
    ` : '';
    const bookmarkBtn = `
        <button type="button" class="feed-bookmark-btn" data-event-id="${esc(ev.id)}" data-bookmarked="${bookmarked ? '1' : '0'}"
            title="${bookmarked ? 'Remove bookmark' : 'Bookmark'}" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'}"
            style="display:inline-flex; align-items:center; gap:5px; background:transparent; border:0; padding:4px 8px; border-radius:999px; cursor:pointer; color:${bookmarked ? '#ff9500' : 'var(--text-secondary)'}; font-weight:700; font-size:0.82rem; margin-left:auto; transition: background 0.15s;">
            <span style="font-size:1.05rem;">${bookmarked ? '🔖' : '📑'}</span>
        </button>
    `;
    return `
        <div class="feed-actions" style="display:flex; align-items:center; gap:4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
            ${likeBtn}
            ${commentBtn}
            ${repostBtn}
            ${bookmarkBtn}
        </div>
        <div class="feed-thread" data-event-id="${esc(ev.id)}" data-loaded="0" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,45,91,0.06);"></div>
    `;
}

/** Render a single comment row for the thread. `canDelete` is true when
 *  the current user authored the comment — adds a small ✕ button. */
function commentRowHtml(c, canDelete) {
    return `
        <div class="feed-comment-row" data-comment-id="${c.id}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,45,91,0.06);">
            ${avatar(c.author, 32)}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <strong style="color:#002d5b; font-size:0.85rem;">${esc(c.author?.name || 'Someone')}</strong>
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">${esc(relativeTime(c.when))}</span>
                </div>
                <div style="font-size:0.88rem; color:#002d5b; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-wrap:break-word;">${esc(c.body || '')}</div>
            </div>
            ${canDelete ? `
                <button type="button" class="feed-comment-delete-btn" data-comment-id="${c.id}" title="Delete your comment" aria-label="Delete comment"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.6); cursor:pointer; padding:2px 6px; font-size:0.72rem; font-weight:800; flex-shrink:0;">✕</button>
            ` : ''}
        </div>
    `;
}

/** Render the full thread block (comment list + add-input) into the
 *  `.feed-thread` container for an event. Called after the lazy fetch
 *  resolves and after every optimistic add/delete. */
function renderThread(threadEl, eventId, comments) {
    const meId = STATE.user?.id;
    const listHtml = comments.length > 0
        ? comments.map(c => commentRowHtml(c, c.author?.id === meId)).join('')
        : '<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">No comments yet — be the first.</div>';
    threadEl.innerHTML = `
        <div class="feed-comment-list">${listHtml}</div>
        <form class="feed-comment-form" data-event-id="${esc(eventId)}" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" name="body" placeholder="Add a comment…" maxlength="500" autocomplete="off"
                style="flex:1; min-width:0; padding:8px 12px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.85rem; background:rgba(0,113,227,0.04); color:#002d5b; font-family: inherit;">
            <button type="submit" class="feed-comment-submit" title="Post comment" aria-label="Post comment"
                style="background:var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-size:0.82rem; font-weight:800; cursor:pointer;">Post</button>
        </form>
    `;
}

export function renderFeed() {
    const div = document.createElement('div');
    div.style.cssText = `font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;

    // Header + container shell. Both the header and the list live inside
    // the same centered column (max-width 760, margin auto) so they share
    // a vertical alignment line — left-aligning either one against the
    // wide app-container would feel off. The list itself paints into
    // #feedList so the network refresh can swap the body without
    // re-rendering the header (which would steal scroll position).
    div.innerHTML = `
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Feed</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">What your friends are up to lately</p>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;

    /** Paint #feedList from `cachedEvents`. Pure DOM swap; no fetch. */
    const paintList = () => {
        const listEl = q(div, '#feedList');
        if (!listEl) return;
        if (cachedEvents.length === 0) {
            listEl.innerHTML = `
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">🌱</div>
                    <h3 style="margin:0 0 8px; color:#9b59b6; font-weight:800; font-size: 1.1rem;">No recent activity</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">When your friends create trips, complete adventures, share trips or join in on plans, you'll see it here.<br>Head to <strong>Your network</strong> to add more friends and grow the feed.</p>
                    <button id="feedGoToNetworkBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">Go to Your network</button>
                </div>
            `;
            const btn = listEl.querySelector('#feedGoToNetworkBtn');
            if (btn) /** @type {HTMLButtonElement} */ (btn).onclick = () => navigate('friends');
            return;
        }

        listEl.innerHTML = cachedEvents.map(ev => {
            const accent = eventAccent(ev.type);
            const time = relativeTime(ev.when);
            return `
                <div class="card glass feed-event" data-event-id="${esc(ev.id)}"
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${accent.color}22; border-left: 4px solid ${accent.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        ${avatar(ev.actor)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                <span style="margin-right:6px;">${accent.icon}</span>${eventLine(ev)}
                            </div>
                            ${time ? `<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${esc(time)}</div>` : ''}
                        </div>
                    </div>
                    ${actionsRow(ev)}
                </div>
            `;
        }).join('');
    };

    /** Background refresh from the server. Errors are swallowed quietly
     *  — leaving the cached list intact is friendlier than an alarming
     *  banner for a feature that's "nice to know" rather than critical. */
    const refresh = async () => {
        if (!STATE.user) return;
        try {
            const res = await apiFetch('/api/feed');
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) {
                cachedEvents = data;
                paintList();
            }
        } catch (e) {
            console.error('Feed refresh failed:', e);
        }
    };

    // ── Action wiring (delegated) ─────────────────────────────────────
    // Single click handler covers like / repost / bookmark — cheaper than
    // re-attaching per-card after every render.
    div.addEventListener('click', async (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        const likeBtn = /** @type {HTMLElement | null} */ (target.closest('.feed-like-btn'));
        if (likeBtn?.dataset.eventId) {
            const eventId = likeBtn.dataset.eventId;
            const wasLiked = likeBtn.dataset.liked === '1';
            // Optimistic flip. Find the cached event so the next paint
            // doesn't snap back if the user double-clicks before the
            // server responds.
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) {
                ev.is_liked = !wasLiked;
                ev.like_count = Math.max(0, (ev.like_count || 0) + (wasLiked ? -1 : 1));
            }
            // Patch the button inline (no full re-paint).
            const heart = likeBtn.querySelector('span');
            const countEl = likeBtn.querySelector('.feed-like-count');
            const newLiked = !wasLiked;
            likeBtn.dataset.liked = newLiked ? '1' : '0';
            likeBtn.style.color = newLiked ? '#ff3b30' : 'var(--text-secondary)';
            if (heart) heart.textContent = newLiked ? '❤️' : '🤍';
            if (countEl && ev) countEl.textContent = ev.like_count > 0 ? String(ev.like_count) : '';
            // Server reconcile.
            const result = await toggleFeedLike(eventId);
            if (result.ok && result.body && ev) {
                ev.is_liked = !!result.body.liked;
                ev.like_count = Number(result.body.count) || 0;
                if (countEl) countEl.textContent = ev.like_count > 0 ? String(ev.like_count) : '';
            }
            return;
        }

        const bookmarkBtn = /** @type {HTMLElement | null} */ (target.closest('.feed-bookmark-btn'));
        if (bookmarkBtn?.dataset.eventId) {
            const eventId = bookmarkBtn.dataset.eventId;
            const wasBookmarked = bookmarkBtn.dataset.bookmarked === '1';
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) ev.is_bookmarked = !wasBookmarked;
            const newBookmarked = !wasBookmarked;
            bookmarkBtn.dataset.bookmarked = newBookmarked ? '1' : '0';
            bookmarkBtn.style.color = newBookmarked ? '#ff9500' : 'var(--text-secondary)';
            const icon = bookmarkBtn.querySelector('span');
            if (icon) icon.textContent = newBookmarked ? '🔖' : '📑';
            await toggleFeedBookmark(eventId);
            return;
        }

        // Comment expand/collapse — clicking 💬 toggles the thread
        // open/closed under the card. First open lazy-fetches the
        // comments via /api/feed/comments; subsequent toggles re-use
        // the cached array so opening + closing is instant.
        const commentBtn = /** @type {HTMLElement | null} */ (target.closest('.feed-comment-btn'));
        if (commentBtn?.dataset.eventId) {
            const eventId = commentBtn.dataset.eventId;
            const card = commentBtn.closest('.feed-event');
            const threadEl = /** @type {HTMLElement | null} */ (card?.querySelector('.feed-thread'));
            if (!threadEl) return;
            const isOpen = threadEl.style.display !== 'none';
            if (isOpen) {
                threadEl.style.display = 'none';
                return;
            }
            threadEl.style.display = 'block';
            // Reuse cache when present, else fetch.
            if (cachedThreads[eventId]) {
                renderThread(threadEl, eventId, cachedThreads[eventId]);
            } else {
                threadEl.innerHTML = '<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">Loading…</div>';
                const comments = await fetchFeedComments(eventId);
                cachedThreads[eventId] = comments || [];
                renderThread(threadEl, eventId, cachedThreads[eventId]);
            }
            // Auto-focus the input so the user can type immediately.
            const input = threadEl.querySelector('input[name="body"]');
            if (input) /** @type {HTMLInputElement} */ (input).focus();
            return;
        }

        // Comment delete — author-only ✕ on a row.
        const commentDeleteBtn = /** @type {HTMLElement | null} */ (target.closest('.feed-comment-delete-btn'));
        if (commentDeleteBtn?.dataset.commentId) {
            const commentId = Number(commentDeleteBtn.dataset.commentId);
            const row = commentDeleteBtn.closest('.feed-comment-row');
            const threadEl = /** @type {HTMLElement | null} */ (commentDeleteBtn.closest('.feed-thread'));
            const eventId = threadEl?.dataset.eventId;
            // Optimistic remove from DOM + cache.
            if (row) /** @type {HTMLElement} */ (row).remove();
            if (eventId && cachedThreads[eventId]) {
                cachedThreads[eventId] = cachedThreads[eventId].filter(c => c.id !== commentId);
            }
            const ev = eventId ? cachedEvents.find(e => e.id === eventId) : null;
            if (ev) {
                ev.comment_count = Math.max(0, (ev.comment_count || 0) - 1);
                // Patch the count chip on the comment button.
                const card = threadEl?.closest('.feed-event');
                const btn = card?.querySelector('.feed-comment-btn .feed-comment-count');
                if (btn) btn.textContent = ev.comment_count > 0 ? String(ev.comment_count) : '';
            }
            const result = await deleteFeedComment(commentId);
            if (!result.ok) {
                showLiquidAlert("Couldn't delete — try again in a moment.");
                // No rollback for v1 — the next refresh reconciles.
            }
            return;
        }

        const repostBtn = /** @type {HTMLElement | null} */ (target.closest('.feed-repost-btn'));
        if (repostBtn?.dataset.postId) {
            const postId = Number(repostBtn.dataset.postId);
            // Disable to prevent double-fire while the request is in
            // flight; re-enable after, even on failure.
            const orig = repostBtn.innerHTML;
            /** @type {HTMLButtonElement} */ (repostBtn).disabled = true;
            repostBtn.innerHTML = '<span style="font-size:1.05rem;">⏳</span><span>Reposting…</span>';
            const result = await repostFeedPost(postId);
            /** @type {HTMLButtonElement} */ (repostBtn).disabled = false;
            if (result.ok && result.body?.status !== 'same_user') {
                const wasAlready = result.body?.status === 'already_reposted';
                showLiquidAlert(wasAlready ? 'Already reposted' : 'Reposted to your feed');
                repostBtn.innerHTML = '<span style="font-size:1.05rem;">✓</span><span>Reposted</span>';
                /** @type {HTMLButtonElement} */ (repostBtn).disabled = true;
                repostBtn.style.color = '#34c759';
            } else if (result.body?.status === 'same_user') {
                repostBtn.innerHTML = orig;
                showLiquidAlert("That's your own share — no need to repost it.");
            } else {
                repostBtn.innerHTML = orig;
                showLiquidAlert('Repost failed — try again in a moment.');
            }
            return;
        }
    });

    // Comment form submit — delegated. Posts the new comment, appends
    // it to the thread + cache, and bumps the count chip. Optimistic:
    // input clears immediately so the user can keep typing follow-ups.
    div.addEventListener('submit', async (e) => {
        const form = /** @type {HTMLFormElement | null} */ (e.target);
        if (!form?.classList?.contains('feed-comment-form')) return;
        e.preventDefault();
        const eventId = form.dataset.eventId;
        if (!eventId) return;
        const input = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="body"]'));
        const body = input?.value.trim();
        if (!body) return;
        const submitBtn = /** @type {HTMLButtonElement | null} */ (form.querySelector('.feed-comment-submit'));
        if (input) input.value = '';
        if (submitBtn) submitBtn.disabled = true;
        const result = await postFeedComment(eventId, body);
        if (submitBtn) submitBtn.disabled = false;
        if (!result.ok || !result.body?.comment) {
            // Restore the typed text so the user doesn't lose it.
            if (input) input.value = body;
            showLiquidAlert("Couldn't post comment — try again.");
            return;
        }
        // Append to cache + DOM, bump the count chip.
        const newComment = /** @type {FeedComment} */ (result.body.comment);
        if (!cachedThreads[eventId]) cachedThreads[eventId] = [];
        cachedThreads[eventId].push(newComment);
        const threadEl = /** @type {HTMLElement | null} */ (form.closest('.feed-thread'));
        if (threadEl) renderThread(threadEl, eventId, cachedThreads[eventId]);
        // Re-focus the new (re-rendered) input so the user can keep typing.
        const refocus = threadEl?.querySelector('input[name="body"]');
        if (refocus) /** @type {HTMLInputElement} */ (refocus).focus();
        const ev = cachedEvents.find(e => e.id === eventId);
        if (ev) {
            ev.comment_count = (ev.comment_count || 0) + 1;
            const card = threadEl?.closest('.feed-event');
            const countEl = card?.querySelector('.feed-comment-btn .feed-comment-count');
            if (countEl) countEl.textContent = String(ev.comment_count);
        }
    });

    // First paint from cache (instant), then background refresh.
    paintList();
    refresh();

    return div;
}
