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
import { apiFetch, toggleFeedLike, toggleFeedBookmark, repostFeedPost } from '../api.js';
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
 * }} FeedEvent */

// Module-level cache survives navigation away and back, so the second
// visit paints from cache before the network call returns.
/** @type {FeedEvent[]} */
let cachedEvents = [];

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

/** Build the action-row HTML — like, repost, bookmark. Repost only
 *  appears on shareable events (friend_shared_trip + friend_reposted_trip),
 *  since reposting an auto-synthesised "X created a trip" event has no
 *  source post to point back to. The like + bookmark live on every event. */
function actionsRow(ev) {
    const liked = !!ev.is_liked;
    const bookmarked = !!ev.is_bookmarked;
    const count = ev.like_count || 0;
    const canRepost = (ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip') && ev.post_id;
    const likeBtn = `
        <button type="button" class="feed-like-btn" data-event-id="${esc(ev.id)}" data-liked="${liked ? '1' : '0'}"
            title="${liked ? 'Unlike' : 'Like'}" aria-label="${liked ? 'Unlike' : 'Like'}"
            style="display:inline-flex; align-items:center; gap:5px; background:transparent; border:0; padding:4px 8px; border-radius:999px; cursor:pointer; color:${liked ? '#ff3b30' : 'var(--text-secondary)'}; font-weight:700; font-size:0.82rem; transition: background 0.15s;">
            <span style="font-size:1.05rem;">${liked ? '❤️' : '🤍'}</span>
            <span class="feed-like-count">${count > 0 ? count : ''}</span>
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
            ${repostBtn}
            ${bookmarkBtn}
        </div>
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

    // First paint from cache (instant), then background refresh.
    paintList();
    refresh();

    return div;
}
