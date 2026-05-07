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
         fetchFeedComments, postFeedComment, deleteFeedComment,
         unshareFeedPost } from '../api.js';
import { esc, q, showLiquidAlert, showConfirmModal } from '../utils.js';
import { navigate } from '../router.js';
import { viewArchivedDetails } from './collections.js';

// Show like-count chips only above this threshold. Below it the heart
// still fills when YOU've liked it, but the global tally stays hidden —
// avoids vanity-metric pressure on shares with one or two likes (which
// would otherwise turn into "your friend got 2 likes" notifications-of-
// -irrelevance). Picked at 3 = "this got real attention" without
// raising the bar so high small circles never see counts at all.
const LIKE_COUNT_THRESHOLD = 3;

// Per-card expanded state for aggregated bundles. Module-level so the
// expand state survives a paintList re-render (filter toggle, tab
// switch). Keyed by the bundle's stable id (see `bundleEvents`).
const expandedBundles: Set<string> = new Set();

/** Pull the YYYY-MM-DD calendar day out of an ISO/SQLite timestamp.
 *  Used as part of the bundle key so events from different days never
 *  merge even when the actor + type match. */
function dayKey(iso) {
    if (!iso) return '';
    const normalised = typeof iso === 'string' && iso.includes(' ') && !iso.includes('T')
        ? iso.replace(' ', 'T') + 'Z'
        : iso;
    const t = new Date(normalised);
    if (Number.isNaN(t.getTime())) return '';
    return t.toISOString().slice(0, 10);
}

/** Bundle adjacent same-(actor, type, calendar-day) events into single
 *  cards. Aggregation only kicks in when there are ≥2 candidates in
 *  the same bucket — a single event renders as it always did, with no
 *  bundle wrapping.
 *
 *  Posts (shares + reposts) are NOT bundled. They're explicit user
 *  posts and each one deserves its own card (think Twitter — you don't
 *  see "Anna posted 3 times today" as one card). Only Actions get
 *  aggregated since they're passive activity logs where 3 trip-creates
 *  in a day is repetitive noise.
 *
 *  @param {FeedEvent[]} events
 *  @returns {Array<FeedEvent | {bundled: true, id: string, type: string, actor: Actor, when: string|null, members: FeedEvent[]}>}
 */
function bundleEvents(events) {
        const groups: Map<string, FeedEvent[]> = new Map();
        const out: Array<FeedEvent | {bundled: true, id: string, type: string, actor: Actor, when: string|null, members: FeedEvent[]}> = [];
    // First pass: group bundleable events by (actor, type, day); keep
    // ordering of first-occurrence so the result reads in the same
    // chronological flow as the input.
    for (const ev of events) {
        if (POSTS_EVENT_TYPES.has(ev.type)) {
            // Posts are never bundled; emit as-is, leave a placeholder
            // in `out` to preserve order.
            out.push(ev);
            continue;
        }
        const key = `${ev.actor?.id || 'anon'}|${ev.type}|${dayKey(ev.when)}`;
        let bucket = groups.get(key);
        if (!bucket) {
            bucket = [];
            groups.set(key, bucket);
            // Reserve slot in `out` so the bundle lands at the position
            // of its first-seen event. Slot becomes the placeholder we
            // resolve in the second pass.
            out.push(({ __slot: key } as any));
        }
        bucket.push(ev);
    }
    // Second pass: replace each placeholder with either the lone event
    // (group size 1) or a synthesised bundle (group size ≥2).
    return out.map(slot => {
        const slotKey = (slot as any).__slot;
        if (!slotKey) return (slot as FeedEvent);  // already a Post
        const members = groups.get(slotKey) || [];
        if (members.length === 1) return members[0];
        return {
            bundled: true,
            id: `bundle_${slotKey}`,
            type: members[0].type,
            actor: members[0].actor,
            when: members[0].when,
            members,
        };
    });
}

/** Verb for an aggregated bundle. Mirrors the singular `eventLine`
 *  shapes but pluralises the trip count. Examples:
 *    "Andrés started planning 3 new trips"
 *    "Andrés joined 4 trips"
 *    "Andrés just completed 2 trips" */
function bundleLine(bundle) {
    const who = `<strong style="color:#002d5b;">${esc(bundle.actor.name)}</strong>`;
    const n = bundle.members.length;
    const noun = n === 1 ? 'trip' : 'trips';
    switch (bundle.type) {
        case 'friend_created_trip':
            return `${who} started planning <strong style="color:#002d5b;">${n} new ${noun}</strong>`;
        case 'friend_archived_trip':
            return `${who} just completed <strong style="color:#002d5b;">${n} ${noun}</strong> 🎉`;
        case 'friend_joined_trip':
            return `${who} joined <strong style="color:#002d5b;">${n} ${noun}</strong>`;
        case 'new_friendship':
            return `You and <strong style="color:#002d5b;">${n} new people</strong> are now friends 🤝`;
        default:
            return `${who} did ${n} new things`;
    }
}

interface Actor { id: string; name: string; picture?: string | null }
interface TripRef { id: string; name: string; country?: string | null }
interface FeedEvent {
    id: string;
    type: 'friend_created_trip' | 'friend_archived_trip' | 'friend_joined_trip'
        | 'new_friendship' | 'friend_shared_trip' | 'friend_reposted_trip';
    actor: Actor;
    trip?: TripRef;
    original_sharer?: Actor;
    post_id?: number;
    caption?: string | null;
    when: string | null;
    like_count?: number;
    is_liked?: boolean;
    is_bookmarked?: boolean;
    comment_count?: number;
}
interface FeedComment { id: number; author: Actor; body: string; when: string }

// Module-level cache survives navigation away and back, so the second
// visit paints from cache before the network call returns.
let cachedEvents: FeedEvent[] = [];
// Per-event comment cache. Lazy-populated when the user expands a thread,
// then re-used on collapse + re-expand within the same session so we
// don't refetch on every click. Cleared whenever the feed itself is
// refreshed from the server (cachedEvents replacement clears stale
// counts; the thread cache becomes stale-but-still-readable, which is
// fine — the next expand re-fetches anyway).
const cachedThreads: Record<string, FeedComment[]> = {};

// Feed view state. Persists across renders so a tab switch + page-leave +
// page-return restores you to where you were. Defaults: Posts tab,
// bookmark filter off.
let activeFeedTab: 'posts' | 'actions' = 'posts';
let bookmarkedOnly = false;

// Event-type → tab membership. Posts are user-initiated, interactionable
// (like / comment / repost). Actions are passive activity logs — nothing
// to react to, only to bookmark. New event types added later need to
// land in one of these sets or paintList will silently filter them out.
const POSTS_EVENT_TYPES = new Set(['friend_shared_trip', 'friend_reposted_trip']);
const ACTIONS_EVENT_TYPES = new Set([
    'friend_created_trip', 'friend_archived_trip', 'friend_joined_trip', 'new_friendship',
]);

/** Avatar circle — picture if available, otherwise a gradient initials
 *  badge so empty avatars don't break the visual rhythm. Mirrors the
 *  helper in friends.js so both pages render the same way.
 *  Google profile pictures (lh3.googleusercontent.com) require
 *  referrerpolicy="no-referrer" to load reliably; without it Google
 *  often returns a 403 / blank image. onerror swaps to the initials
 *  fallback if the URL is broken or rate-limited.
 *
 *  When user.id is set, the avatar is wrapped in a transparent
 *  button so clicking it navigates to that user's profile.
 *  Without the id (rare — anonymous events) we render the bare
 *  avatar with no click affordance. */
function avatar(user, size = 44) {
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    const fallback = `<div style="width:${size}px; height:${size}px; border-radius:50%; background: linear-gradient(135deg, #007aff, #5856d6); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size * 0.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${esc(initial)}</div>`;
    const inner = user?.picture
        ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer"
            onerror="this.outerHTML=this.dataset.fallback;"
            data-fallback="${esc(fallback)}"
            style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`
        : fallback;
    if (!user?.id) return inner;
    // Wrap in a button so the click semantic + cursor:pointer
    // come for free + the avatar is keyboard-focusable. Inline
    // styles keep the button visually invisible: no background,
    // no border, no padding — the avatar fills it entirely.
    return `<button type="button" class="feed-avatar-btn" data-feed-avatar-user-id="${esc(user.id)}"
        title="View ${esc(user.name || 'profile')}"
        aria-label="View ${esc(user.name || 'profile')}'s profile"
        style="background:transparent; border:0; padding:0; margin:0; cursor:pointer; line-height:0; flex-shrink:0; border-radius:50%;">${inner}</button>`;
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
    // en-US lock keeps the format identical regardless of browser
    // locale — matches utils.js formatDayDate's "Mon D" output.
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Build the human verb line for one event. Kept switch-style so adding
 *  a new event type is one branch — no clever inference. The actor name
 *  is bolded; the trip name (when present) is bolded too so the eye
 *  catches "WHO did WHAT to WHICH trip" at a glance.
 *  When the actor is the caller themselves (own posts now appear in the
 *  Posts tab — see /api/feed queries 6-7), the verb flips to second
 *  person so it reads naturally: "You shared a trip — …" instead of
 *  "Andrés shared a trip" when Andrés is the caller. */
function eventLine(ev) {
    const meId = STATE.user?.id;
    const isSelf = !!meId && ev.actor?.id === meId;
    const who = isSelf
        ? `<strong style="color:#002d5b;">You</strong>`
        : `<strong style="color:#002d5b;">${esc(ev.actor.name)}</strong>`;
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
            const origIsSelf = !!meId && ev.original_sharer?.id === meId;
            const orig = !ev.original_sharer
                ? 'someone'
                : (origIsSelf
                    ? `<strong style="color:#002d5b;">your</strong> share`
                    : `<strong style="color:#002d5b;">${esc(ev.original_sharer.name)}</strong>'s trip`);
            // origIsSelf path swaps "X's trip" with "your share" so
            // self-attribution reads naturally; everyone else keeps
            // the standard possessive form.
            const verb = origIsSelf ? 'reposted' : 'reposted';
            return `${who} ${verb} ${orig} — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
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

/** SVG icon paths for action-row buttons. Lucide-outline aesthetic
 *  matching the navbar's Complete-Trip / Delete-Trip glyphs:
 *  stroke="currentColor" + stroke-width 2.2 + linecap/linejoin round.
 *  Toggled actions (heart, bookmark) flip between outline and filled
 *  to signal state — fill="currentColor" on the path inside the
 *  outline shape. The svg viewBox + 14×14 render size matches the
 *  navbar icons exactly so the buttons share visual weight when they
 *  share a row.
 *  @param {'heart'|'comment'|'repost'|'bookmark'} name
 *  @param {boolean} [filled=false]
 *  @returns {string}
 */
function actionIconSvg(name, filled = false) {
    const head = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
    const close = `</svg>`;
    const fillAttr = filled ? ' fill="currentColor"' : '';
    let body = '';
    switch (name) {
        case 'heart':
            // Lucide heart — symmetric two-lobe outline. fill swaps
            // for the "liked" state.
            body = `<path${fillAttr} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`;
            break;
        case 'comment':
            // Lucide message-square — speech bubble with a tail.
            // No filled state; comments aren't a per-user toggle.
            body = `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`;
            break;
        case 'repost':
            // Lucide refresh-cw — two arrows in a cycle. No fill;
            // we communicate "reposted" via a checkmark replacement
            // (see actionsRow) instead.
            body = `<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;
            break;
        case 'bookmark':
            // Lucide bookmark — page-corner outline. fill swaps for
            // the "bookmarked" state.
            body = `<path${fillAttr} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>`;
            break;
    }
    return head + body + close;
}

/** Compact "icon button + count" pair. Mirrors the navbar's
 *  `.icon-btn-circle` aesthetic for the button itself; the count sits
 *  outside as a small grey number, kept out of the button so the
 *  button stays a clean colored circle (no width-juggling per count).
 *
 *  `count` and `countThreshold`:
 *    Pass `count: undefined` for actions that have no count (repost,
 *    bookmark) — no chip element rendered.
 *    Pass `count: <number>` to render a chip; threshold gates whether
 *    the number is visible. Default threshold = 1 (any non-zero
 *    count shows). Likes use threshold = LIKE_COUNT_THRESHOLD so
 *    "your friend got 1 like" doesn't read as a vanity metric.
 *    Below threshold, the chip element is still in DOM (empty
 *    text) so the click handlers can patch it as the count
 *    crosses the threshold without re-rendering the button.
 *
 *  @param {{className: string, accent: string, dataAttrs?: string, title: string, svg: string, count?: number, countThreshold?: number, marginLeftAuto?: boolean}} opts
 */
function actionButton(opts) {
    const wrapStyle = `display:inline-flex; align-items:center; gap:6px;${opts.marginLeftAuto ? ' margin-left:auto;' : ''}`;
    const threshold = opts.countThreshold ?? 1;
    // typeof guard narrows opts.count to number for the comparison below.
    const showChip = typeof opts.count === 'number';
    const chipText = showChip && (opts.count as number) >= threshold
        ? String(opts.count)
        : '';
    return `
        <span style="${wrapStyle}">
            <button type="button" class="icon-btn-circle ${opts.className}" style="--accent: ${opts.accent};" ${opts.dataAttrs || ''} title="${opts.title}" aria-label="${opts.title}">
                ${opts.svg}
            </button>
            ${showChip ? `<span class="feed-action-count" data-threshold="${threshold}" style="font-size:0.78rem; color:var(--text-secondary); font-weight:700; min-width:0.8em;">${chipText}</span>` : ''}
        </span>
    `;
}

/** Action-row accent palette. Picked once and reused both at render
 *  time and inside the click handlers (so optimistic toggles can flip
 *  --accent without re-deriving the colour each time).
 *  Inactive buttons share the `muted` (system grey) tint so the row
 *  reads as "neutral until you act"; active buttons take their semantic
 *  colour (red heart, orange bookmark, green repost). The blue comment
 *  button has no inactive state — it always looks "ready to be opened".
 */
const ACTION_ACCENTS = {
    muted:    '142,142,147',  // system grey — inactive state
    like:     '255,59,48',    // red — heart
    comment:  '0,113,227',    // accent-blue
    repost:   '52,199,89',    // green
    bookmark: '255,149,0',    // orange
};

/** Build the action-row HTML. Event-class aware:
 *
 *   Posts events  (friend_shared_trip, friend_reposted_trip)
 *     → like + comment + repost + bookmark, full row
 *
 *   Actions events (friend_created_trip / archived / joined,
 *                   new_friendship)
 *     → bookmark only, right-aligned
 *
 *   Rationale: Posts are user-initiated content that someone consciously
 *   pushed for engagement. Actions are passive activity logs — heart-ing
 *   "X created a trip" feels like surveillance with a button. Bookmarks
 *   stay on both classes because saving an Action ("come back to this
 *   trip later") is a useful private gesture even if reacting publicly
 *   isn't.
 *
 *   Toggled buttons (like, bookmark) flip `--accent` AND swap the SVG
 *   between outline / filled to signal state. Repost toggles to a green
 *   checkmark when the caller has reposted.
 *
 *   The thread itself renders below the action row when expanded
 *   (built lazily by the click handler — empty `<div class="feed-thread">`
 *   shipped with every card so the slot is always there; only emitted
 *   for Posts since Actions don't have comments). */
function actionsRow(ev) {
    const isPost = POSTS_EVENT_TYPES.has(ev.type);
    const bookmarked = !!ev.is_bookmarked;

    const bookmarkBtn = actionButton({
        className: 'feed-bookmark-btn',
        accent: bookmarked ? ACTION_ACCENTS.bookmark : ACTION_ACCENTS.muted,
        dataAttrs: `data-event-id="${esc(ev.id)}" data-bookmarked="${bookmarked ? '1' : '0'}"`,
        title: bookmarked ? 'Remove bookmark' : 'Bookmark',
        svg: actionIconSvg('bookmark', bookmarked),
        marginLeftAuto: true,
    });

    if (!isPost) {
        // Actions get a slim row — bookmark only. Same divider line so
        // the cards still feel symmetrical with their Posts neighbours.
        return `
            <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
                ${bookmarkBtn}
            </div>
        `;
    }

    // Posts get the full row.
    const liked = !!ev.is_liked;
    const likeCount = ev.like_count || 0;
    const commentCount = ev.comment_count || 0;
    const canRepost = !!ev.post_id;

    // Like-count chip: rendered with the threshold so "1 like" stays
    // hidden as a tally (the heart still fills to confirm YOU liked it).
    // The chip element itself is in DOM regardless so the click handler
    // can update it as the count crosses the threshold either way.
    const likeBtn = actionButton({
        className: 'feed-like-btn',
        accent: liked ? ACTION_ACCENTS.like : ACTION_ACCENTS.muted,
        dataAttrs: `data-event-id="${esc(ev.id)}" data-liked="${liked ? '1' : '0'}"`,
        title: liked ? 'Unlike' : 'Like',
        svg: actionIconSvg('heart', liked),
        count: likeCount,
        countThreshold: LIKE_COUNT_THRESHOLD,
    });
    const commentBtn = actionButton({
        className: 'feed-comment-btn',
        accent: ACTION_ACCENTS.comment,
        dataAttrs: `data-event-id="${esc(ev.id)}"`,
        title: 'Comments',
        svg: actionIconSvg('comment'),
        count: commentCount,
    });
    const repostBtn = canRepost ? actionButton({
        className: 'feed-repost-btn',
        accent: ACTION_ACCENTS.muted,
        dataAttrs: `data-post-id="${ev.post_id}"`,
        title: 'Repost to your friends',
        svg: actionIconSvg('repost'),
    }) : '';

    return `
        <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
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
    // wide app-container would feel off.
    //
    // Below the header sit two tabs (Posts / Actions) and an Apple-style
    // Bookmarked toggle on the same row. The list itself paints into
    // #feedList so the network refresh can swap the body without
    // re-rendering the header (which would steal scroll position) and
    // tab/toggle changes only repaint the list.
    div.innerHTML = `
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Feed</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">What your friends are up to lately</p>
            </div>

            <div id="feedTabsRow" style="position:relative; display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom: 16px; flex-wrap: wrap;">
                <!-- Posts tab gets the share/repost purple (matches the
                     event accent for shares); Actions tab gets orange,
                     borrowed from the friend-joined-trip event accent.
                     Both colours come from the GG palette and read as
                     "different but related" — same visual weight, easy
                     to scan at a glance. --accent is consumed by the
                     home-tabnav--centered CSS rules. -->
                <nav class="home-tabnav home-tabnav--centered" role="tablist" aria-label="Feed sections">
                    <button class="home-tabnav__tab${activeFeedTab === 'posts' ? ' is-active' : ''}" data-feed-tab="posts" role="tab" type="button" style="--accent: 88, 86, 214;">Posts</button>
                    <button class="home-tabnav__tab${activeFeedTab === 'actions' ? ' is-active' : ''}" data-feed-tab="actions" role="tab" type="button" style="--accent: 255, 149, 0;">Actions</button>
                </nav>
                <label class="apple-toggle" id="feedBookmarkToggle" title="Filter to bookmarked items only" style="position:absolute; right:0; top:50%; transform:translateY(-50%);">
                    <input type="checkbox" class="apple-toggle__input" ${bookmarkedOnly ? 'checked' : ''}>
                    <span class="apple-toggle__track"><span class="apple-toggle__thumb"></span></span>
                    <span class="apple-toggle__label">🔖 Bookmarked</span>
                </label>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;

    /** Paint #feedList from `cachedEvents`, filtered by the active tab
     *  and the bookmarked-only toggle. Pure DOM swap; no fetch.
     *  Empty-state copy varies by combo — "no posts yet" reads very
     *  differently from "no bookmarked actions." */
    const paintList = () => {
        const listEl = q(div, '#feedList');
        if (!listEl) return;

        const inActiveTab = (ev) => activeFeedTab === 'posts'
            ? POSTS_EVENT_TYPES.has(ev.type)
            : ACTIONS_EVENT_TYPES.has(ev.type);
        const visible = cachedEvents.filter(ev => {
            if (!inActiveTab(ev)) return false;
            if (bookmarkedOnly && !ev.is_bookmarked) return false;
            return true;
        });

        if (visible.length === 0) {
            // Two distinct empty states. The "bookmarked filter on but
            // empty" case needs different copy than "no events at all" —
            // otherwise the user sees the same generic "no activity"
            // message regardless of what they're actually looking at.
            let title, body, ctaLabel, ctaAction;
            if (bookmarkedOnly) {
                title = activeFeedTab === 'posts' ? 'No bookmarked posts yet' : 'No bookmarked actions yet';
                body = `Tap 🔖 on any card to save it for later — bookmarks are private and never expire.`;
                ctaLabel = 'Show all';
                ctaAction = () => {
                    bookmarkedOnly = false;
                    const toggleInput = (div.querySelector('#feedBookmarkToggle .apple-toggle__input') as HTMLInputElement | null);
                    if (toggleInput) toggleInput.checked = false;
                    paintList();
                };
            } else if (activeFeedTab === 'posts') {
                title = 'No posts yet';
                body = `Posts are trips your friends shared (or reposted) for the world to see. Share one of your own from the trip header to kick things off — or check the <strong>Actions</strong> tab for what's been happening behind the scenes.`;
                ctaLabel = 'See Actions';
                ctaAction = () => {
                    activeFeedTab = 'actions';
                    paintList();
                    div.querySelectorAll('.home-tabnav__tab').forEach(b => b.classList.toggle('is-active', (b as HTMLElement).dataset.feedTab === 'actions'));
                };
            } else {
                title = 'Quiet over here';
                body = `When your friends create trips, complete adventures or join in on plans, you'll see it here. Add more friends in <strong>Your network</strong> to grow the feed.`;
                ctaLabel = 'Go to Your network';
                ctaAction = () => navigate('friends');
            }
            listEl.innerHTML = `
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">${bookmarkedOnly ? '🔖' : '🌱'}</div>
                    <h3 style="margin:0 0 8px; color:#9b59b6; font-weight:800; font-size: 1.1rem;">${esc(title)}</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">${body}</p>
                    <button id="feedEmptyCtaBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">${esc(ctaLabel)}</button>
                </div>
            `;
            const btn = listEl.querySelector('#feedEmptyCtaBtn');
            if (btn) (btn as HTMLButtonElement).onclick = ctaAction;
            return;
        }

        const meId = STATE.user?.id;
        // Aggregation. Posts pass through unchanged; Actions of the same
        // (actor, type, day) get rolled into a bundle card with an
        // expand affordance. Inside an expanded bundle the individual
        // events render as small inline rows so the user can see
        // exactly what's bundled.
        const renderedItems = bundleEvents(visible);
        listEl.innerHTML = renderedItems.map(item => {
            if ((item as any).bundled) {
                const bundle = (item as {bundled: true, id: string, type: string, actor: Actor, when: string|null, members: FeedEvent[]});
                const accent = eventAccent(bundle.type);
                const time = relativeTime(bundle.when);
                const isExpanded = expandedBundles.has(bundle.id);
                // Each member shows its own bookmark control inside the
                // expanded list — bookmarks are per-event, not per-bundle.
                const memberRowsHtml = bundle.members.map(m => {
                    const memberLine = eventLine(m);  // reuse single-event verb
                    const bookmarked = !!m.is_bookmarked;
                    return `
                        <div class="feed-bundle-member" data-event-id="${esc(m.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed rgba(0,45,91,0.06);">
                            <div style="flex:1; min-width:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.4;">${memberLine}</div>
                            <button type="button" class="icon-btn-circle feed-bookmark-btn" style="--accent: ${bookmarked ? ACTION_ACCENTS.bookmark : ACTION_ACCENTS.muted};" data-event-id="${esc(m.id)}" data-bookmarked="${bookmarked ? '1' : '0'}" title="${bookmarked ? 'Remove bookmark' : 'Bookmark'}" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'}">
                                ${actionIconSvg('bookmark', bookmarked)}
                            </button>
                        </div>
                    `;
                }).join('');
                return `
                    <div class="card glass feed-event feed-bundle" data-bundle-id="${esc(bundle.id)}"
                        style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${accent.color}22; border-left: 4px solid ${accent.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            ${avatar(bundle.actor)}
                            <div style="flex:1; min-width:0;">
                                <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                    <span style="margin-right:6px;">${accent.icon}</span>${bundleLine(bundle)}
                                </div>
                                ${time ? `<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${esc(time)}</div>` : ''}
                            </div>
                            <button type="button" class="feed-bundle-toggle" data-bundle-id="${esc(bundle.id)}"
                                style="background:transparent; border:0; color:var(--accent-blue); cursor:pointer; padding:4px 10px; font-size:0.78rem; font-weight:800; flex-shrink:0;">${isExpanded ? 'Collapse' : 'View all'}</button>
                        </div>
                        <div class="feed-bundle-members" style="margin-top: ${isExpanded ? '8px' : '0'}; padding-top: ${isExpanded ? '4px' : '0'}; display: ${isExpanded ? 'block' : 'none'};">
                            ${memberRowsHtml}
                        </div>
                    </div>
                `;
            }
            const ev = (item as FeedEvent);
            const accent = eventAccent(ev.type);
            const time = relativeTime(ev.when);
            // Caption block — only on shares/reposts that have one.
            // Renders above the trip card as the poster's commentary;
            // the trip card sits right below as "what they're talking
            // about". Pre-wrap so newlines survive.
            const captionHtml = ev.caption ? `
                <div style="margin-top:10px; padding:10px 12px; background:rgba(88,86,214,0.06); border-radius:12px; font-size:0.92rem; color:#002d5b; line-height:1.45; white-space:pre-wrap; word-wrap:break-word;">${esc(ev.caption)}</div>
            ` : '';
            // Trip card — visual anchor showing WHICH trip is being
            // shared/reposted. Without it the trip name was buried
            // as inline-bold prose in the verb line; users couldn't
            // tell a share apart from a caption-only message. Click
            // opens the SAME read-only trip detail page that
            // collections / profile reach via their "View" button —
            // viewArchivedDetails handles foreign trips by lazy-
            // fetching /api/public-trip when the trip isn't in the
            // caller's local state.
            const isShareLike = ev.type === 'friend_shared_trip' || ev.type === 'friend_reposted_trip';
            const tripCardHtml = (isShareLike && ev.trip?.id) ? (() => {
                const country = ev.trip.country ? esc(ev.trip.country) : '';
                return `
                    <button type="button" class="feed-trip-card" data-trip-id="${esc(ev.trip.id)}"
                        style="margin-top:10px; width:100%; text-align:left; background:white; border:1px solid rgba(88,86,214,0.22); border-left:4px solid #5856d6; border-radius:14px; padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,45,91,0.04); transition: transform 0.15s ease, box-shadow 0.15s ease;">
                        <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">🗺️</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.98rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(ev.trip.name || 'Trip')}</div>
                            ${country ? `<div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${country}</div>` : ''}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#5856d6; flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                `;
            })() : '';
            // Unshare ✕ — only on YOUR own original shares (reposts of
            // someone else's share are deleted by the original author,
            // not re-deletable by the reposter; reposting your own
            // repost is impossible anyway). Reposts of YOUR share are
            // deleted automatically when you unshare the original.
            const isMyOriginalShare = ev.type === 'friend_shared_trip' && ev.actor?.id === meId && ev.post_id;
            const unshareBtn = isMyOriginalShare ? `
                <button type="button" class="feed-unshare-btn" data-post-id="${ev.post_id}" title="Unshare — removes from your friends' feeds" aria-label="Unshare"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.55); cursor:pointer; padding:2px 6px; font-size:0.85rem; font-weight:800; flex-shrink:0; line-height:1;">✕</button>
            ` : '';
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
                        ${unshareBtn}
                    </div>
                    ${captionHtml}
                    ${tripCardHtml}
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

    // ── Tab + Bookmark filter wiring ──────────────────────────────────
    // Tab nav: clicking a pill switches `activeFeedTab` + toggles
    // is-active classes + repaints the list.
    div.querySelectorAll('.home-tabnav__tab[data-feed-tab]').forEach(btn => {
        (btn as HTMLButtonElement).onclick = () => {
            const tab = (btn as HTMLElement).dataset.feedTab as 'posts' | 'actions' | undefined;
            if (!tab || activeFeedTab === tab) return;
            activeFeedTab = tab;
            div.querySelectorAll('.home-tabnav__tab[data-feed-tab]').forEach(b => {
                b.classList.toggle('is-active', (b as HTMLElement).dataset.feedTab === tab);
            });
            paintList();
        };
    });

    // Bookmarked toggle: persists across tab switches via the module-
    // level `bookmarkedOnly`. Native checkbox change event so keyboard
    // (space) and click both fire.
    const bookmarkToggleInput = div.querySelector('#feedBookmarkToggle .apple-toggle__input') as HTMLInputElement | null;
    if (bookmarkToggleInput) {
        bookmarkToggleInput.addEventListener('change', () => {
            bookmarkedOnly = !!bookmarkToggleInput.checked;
            paintList();
        });
    }

    // ── Action wiring (delegated) ─────────────────────────────────────
    // Single click handler covers like / repost / bookmark — cheaper than
    // re-attaching per-card after every render.
    div.addEventListener('click', async (e) => {
        const target = (e.target as HTMLElement | null);
        if (!target) return;

        // Avatar click → friend profile. Wraps event-actor avatars
        // (the round headshot top-left of each card) AND comment-
        // author avatars in the thread. Checked first so the click
        // doesn't bubble to the card-level handlers (the avatar is
        // inside the card body for shares; without this guard a
        // click on the avatar would also trigger like / repost
        // depending on what's nested where).
        const avatarBtn = (target.closest('.feed-avatar-btn') as HTMLElement | null);
        if (avatarBtn?.dataset.feedAvatarUserId) {
            navigate('profile', { userId: avatarBtn.dataset.feedAvatarUserId });
            return;
        }

        // Trip card on share/repost events. Opens the same read-only
        // trip detail page that profile/collections "View" buttons
        // reach. viewArchivedDetails handles both local trips
        // (synchronous, from STATE) and foreign trips (async fetch
        // from /api/public-trip), so the click works whether the
        // shared trip belongs to the viewer or to a friend.
        const tripCard = (target.closest('.feed-trip-card') as HTMLElement | null);
        if (tripCard?.dataset.tripId) {
            viewArchivedDetails(tripCard.dataset.tripId);
            return;
        }

        const likeBtn = (target.closest('.feed-like-btn') as HTMLButtonElement | null);
        if (likeBtn?.dataset.eventId) {
            const eventId = likeBtn.dataset.eventId;
            const wasLiked = likeBtn.dataset.liked === '1';
            const newLiked = !wasLiked;
            // Optimistic flip. Find the cached event so the next paint
            // doesn't snap back if the user double-clicks before the
            // server responds.
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) {
                ev.is_liked = newLiked;
                ev.like_count = Math.max(0, (ev.like_count || 0) + (wasLiked ? -1 : 1));
            }
            // Patch the button inline: --accent CSS var (red↔grey), the
            // SVG inner shape (filled↔outline), and the sibling count
            // chip. The button itself is `.icon-btn-circle` so all the
            // tinting cascades from --accent.
            likeBtn.dataset.liked = newLiked ? '1' : '0';
            likeBtn.style.setProperty('--accent', newLiked ? ACTION_ACCENTS.like : ACTION_ACCENTS.muted);
            likeBtn.innerHTML = actionIconSvg('heart', newLiked);
            const countEl = (likeBtn.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
            const renderCount = (n) => (n >= LIKE_COUNT_THRESHOLD ? String(n) : '');
            if (countEl && ev) countEl.textContent = renderCount(ev.like_count);
            // Server reconcile.
            const result = await toggleFeedLike(eventId);
            if (result.ok && result.body && ev) {
                ev.is_liked = !!result.body.liked;
                ev.like_count = Number(result.body.count) || 0;
                if (countEl) countEl.textContent = renderCount(ev.like_count);
            }
            return;
        }

        const bookmarkBtn = (target.closest('.feed-bookmark-btn') as HTMLButtonElement | null);
        if (bookmarkBtn?.dataset.eventId) {
            const eventId = bookmarkBtn.dataset.eventId;
            const wasBookmarked = bookmarkBtn.dataset.bookmarked === '1';
            const newBookmarked = !wasBookmarked;
            const ev = cachedEvents.find(e => e.id === eventId);
            if (ev) ev.is_bookmarked = newBookmarked;
            bookmarkBtn.dataset.bookmarked = newBookmarked ? '1' : '0';
            bookmarkBtn.style.setProperty('--accent', newBookmarked ? ACTION_ACCENTS.bookmark : ACTION_ACCENTS.muted);
            bookmarkBtn.innerHTML = actionIconSvg('bookmark', newBookmarked);
            // If the Bookmarked filter is on and the user just UN-bookmarked,
            // the card no longer matches the filter — repaint so it
            // disappears (otherwise it'd linger until next refresh,
            // confusing the visible list vs the filter state).
            if (bookmarkedOnly && !newBookmarked) {
                paintList();
            }
            await toggleFeedBookmark(eventId);
            return;
        }

        // Bundle expand/collapse — toggles `expandedBundles` set and
        // repaints. The set is module-level so the state survives
        // tab switches + bookmark filter toggles.
        const bundleToggle = (target.closest('.feed-bundle-toggle') as HTMLElement | null);
        if (bundleToggle?.dataset.bundleId) {
            const id = bundleToggle.dataset.bundleId;
            if (expandedBundles.has(id)) expandedBundles.delete(id);
            else expandedBundles.add(id);
            paintList();
            return;
        }

        // Comment expand/collapse — clicking 💬 toggles the thread
        // open/closed under the card. First open lazy-fetches the
        // comments via /api/feed/comments; subsequent toggles re-use
        // the cached array so opening + closing is instant.
        const commentBtn = (target.closest('.feed-comment-btn') as HTMLElement | null);
        if (commentBtn?.dataset.eventId) {
            const eventId = commentBtn.dataset.eventId;
            const card = commentBtn.closest('.feed-event');
            const threadEl = (card?.querySelector('.feed-thread') as HTMLElement | null);
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
            if (input) (input as HTMLInputElement).focus();
            return;
        }

        // Comment delete — author-only ✕ on a row.
        const commentDeleteBtn = (target.closest('.feed-comment-delete-btn') as HTMLElement | null);
        if (commentDeleteBtn?.dataset.commentId) {
            const commentId = Number(commentDeleteBtn.dataset.commentId);
            const row = commentDeleteBtn.closest('.feed-comment-row');
            const threadEl = (commentDeleteBtn.closest('.feed-thread') as HTMLElement | null);
            const eventId = threadEl?.dataset.eventId;
            // Optimistic remove from DOM + cache.
            if (row) (row as HTMLElement).remove();
            if (eventId && cachedThreads[eventId]) {
                cachedThreads[eventId] = cachedThreads[eventId].filter(c => c.id !== commentId);
            }
            const ev = eventId ? cachedEvents.find(e => e.id === eventId) : null;
            if (ev) {
                ev.comment_count = Math.max(0, (ev.comment_count || 0) - 1);
                // Patch the count chip — it sits as a sibling of the
                // comment button inside the same wrapper span.
                const card = threadEl?.closest('.feed-event');
                const btn = card?.querySelector('.feed-comment-btn');
                const countEl = (btn?.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
                if (countEl) countEl.textContent = ev.comment_count > 0 ? String(ev.comment_count) : '';
            }
            const result = await deleteFeedComment(commentId);
            if (!result.ok) {
                showLiquidAlert("Couldn't delete — try again in a moment.");
                // No rollback for v1 — the next refresh reconciles.
            }
            return;
        }

        // Unshare ✕ — author-only, on your own original shares. Removes
        // the share from every friend's feed AND cascade-removes any
        // reposts of it (server-side). Confirm modal before firing
        // since this is destructive and can't be undone.
        const unshareBtn = (target.closest('.feed-unshare-btn') as HTMLButtonElement | null);
        if (unshareBtn?.dataset.postId) {
            const postId = Number(unshareBtn.dataset.postId);
            showConfirmModal({
                title: 'Unshare this trip?',
                message: `It'll disappear from your friends' feeds. Any reposts of it will be removed too. This can't be undone.`,
                confirmText: 'Unshare',
                onConfirm: async () => {
                    const result = await unshareFeedPost(postId);
                    if (!result || !result.ok) {
                        showLiquidAlert("Couldn't unshare — try again in a moment.");
                        return;
                    }
                    // Refresh from the server. The unshare cascades to
                    // reposts on the backend, but the client-side
                    // friend_reposted_trip events don't expose their
                    // parent_post_id so we can't filter them out
                    // accurately in memory. Refresh re-fetches the
                    // authoritative list.
                    await refresh();
                    showLiquidAlert('Removed from your feed.');
                },
            });
            return;
        }

        const repostBtn = (target.closest('.feed-repost-btn') as HTMLButtonElement | null);
        if (repostBtn?.dataset.postId) {
            const postId = Number(repostBtn.dataset.postId);
            // Disable + nudge --accent to a "pending" tone while the
            // request is in flight; the icon stays the cycle so the
            // user sees the action they pressed. Restored on failure.
            const origAccent = repostBtn.style.getPropertyValue('--accent') || ACTION_ACCENTS.muted;
            repostBtn.disabled = true;
            repostBtn.style.setProperty('--accent', ACTION_ACCENTS.muted);
            const result = await repostFeedPost(postId);
            if (result.ok && result.body?.status !== 'same_user') {
                const wasAlready = result.body?.status === 'already_reposted';
                showLiquidAlert(wasAlready ? 'Already reposted' : 'Reposted to your feed');
                // Settle into the "reposted" state: green tint + a
                // checkmark glyph in place of the cycle icon. Stays
                // disabled — reposting twice is a no-op server-side
                // anyway, so the disabled state matches reality.
                repostBtn.style.setProperty('--accent', ACTION_ACCENTS.repost);
                repostBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            } else if (result.body?.status === 'same_user') {
                repostBtn.disabled = false;
                repostBtn.style.setProperty('--accent', origAccent);
                showLiquidAlert("That's your own share — no need to repost it.");
            } else {
                repostBtn.disabled = false;
                repostBtn.style.setProperty('--accent', origAccent);
                showLiquidAlert('Repost failed — try again in a moment.');
            }
            return;
        }
    });

    // Comment form submit — delegated. Posts the new comment, appends
    // it to the thread + cache, and bumps the count chip. Optimistic:
    // input clears immediately so the user can keep typing follow-ups.
    div.addEventListener('submit', async (e) => {
        const form = (e.target as HTMLFormElement | null);
        if (!form?.classList?.contains('feed-comment-form')) return;
        e.preventDefault();
        const eventId = form.dataset.eventId;
        if (!eventId) return;
        const input = (form.querySelector('input[name="body"]') as HTMLInputElement | null);
        const body = input?.value.trim();
        if (!body) return;
        const submitBtn = (form.querySelector('.feed-comment-submit') as HTMLButtonElement | null);
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
        const newComment = (result.body.comment as FeedComment);
        if (!cachedThreads[eventId]) cachedThreads[eventId] = [];
        cachedThreads[eventId].push(newComment);
        const threadEl = (form.closest('.feed-thread') as HTMLElement | null);
        if (threadEl) renderThread(threadEl, eventId, cachedThreads[eventId]);
        // Re-focus the new (re-rendered) input so the user can keep typing.
        const refocus = threadEl?.querySelector('input[name="body"]');
        if (refocus) (refocus as HTMLInputElement).focus();
        const ev = cachedEvents.find(e => e.id === eventId);
        if (ev) {
            ev.comment_count = (ev.comment_count || 0) + 1;
            const card = threadEl?.closest('.feed-event');
            const btn = card?.querySelector('.feed-comment-btn');
            const countEl = (btn?.parentElement?.querySelector('.feed-action-count') as HTMLElement | null);
            if (countEl) countEl.textContent = String(ev.comment_count);
        }
    });

    // First paint from cache (instant), then background refresh.
    paintList();
    refresh();

    return div;
}
