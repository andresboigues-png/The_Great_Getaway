// pages/feed/render.ts
//
// Pure render-time helpers + types pulled out of pages/feed.ts in B1's
// split pass. These are the building blocks for one feed-card: the
// avatar, the actor verb-line, the bundle aggregator, the action row,
// and the comment row. Each is a string-returning HTML helper; none
// touch the DOM directly. The host file (pages/feed.ts) keeps the
// page-lifecycle pieces — fetch + cache + paintList + renderFeed +
// click delegation — and imports these helpers for the actual markup.

import { STATE } from '../../state.js';
import { esc } from '../../utils.js';
import { getIntlLocale } from '../../i18n.js';

export interface Actor {
    id: string;
    name: string;
    picture?: string | null;
}
export interface TripRef {
    id: string;
    name: string;
    country?: string | null;
}
export interface FeedEvent {
    id: string;
    type:
        | 'friend_created_trip'
        | 'friend_archived_trip'
        | 'friend_joined_trip'
        | 'new_friendship'
        | 'friend_shared_trip'
        | 'friend_reposted_trip'
        | 'achievement_unlocked'
        | 'settled_up';
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
    // achievement_unlocked carries the badge label/emoji on the payload
    // so the renderer doesn't need a separate /api/achievements call.
    badge?: { id?: string; emoji?: string; label?: string; description?: string };
    // settled_up carries the from/to display names + the amount + the
    // trip context (for the message body).
    from?: { id?: string; name?: string };
    to?: { id?: string; name?: string };
    amount?: number;
    currency?: string;
}
export interface FeedComment {
    id: number;
    author: Actor;
    body: string;
    when: string;
}

// Show like-count chips only above this threshold. Below it the heart
// still fills when YOU've liked it, but the global tally stays hidden —
// avoids vanity-metric pressure on shares with one or two likes.
export const LIKE_COUNT_THRESHOLD = 3;

// Event-type → tab membership. Posts are user-initiated, interactionable
// (like / comment / repost). Actions are passive activity logs — nothing
// to react to, only to bookmark.
//
// Audit fix (2026-05-26): added `achievement_unlocked` and `settled_up`
// to ACTIONS_EVENT_TYPES. Pre-fix the backend was building + shipping
// both event types in /api/feed payloads, _attach_engagement_counts
// was setting like/comment/bookmark counters on them, the registry
// handled their visibility checks — but the frontend tab-filter
// sets didn't include them, so they were silently dropped by
// `visible.filter(inActiveTab)`. Two whole event types were
// invisible — unlocking a badge or settling a debt with a friend
// generated a perfectly-shaped feed event that nobody could see.
export const POSTS_EVENT_TYPES = new Set(['friend_shared_trip', 'friend_reposted_trip']);
export const ACTIONS_EVENT_TYPES = new Set([
    'friend_created_trip',
    'friend_archived_trip',
    'friend_joined_trip',
    'new_friendship',
    'achievement_unlocked',
    'settled_up',
]);

// Action-row accent palette. Picked once and reused at render time AND
// inside the click handlers (so optimistic toggles can flip --accent
// without re-deriving the colour each time).
export const ACTION_ACCENTS = {
    muted: '142,142,147', // system grey — inactive state
    like: '255,59,48', // red — heart
    comment: '0,113,227', // accent-blue
    repost: '52,199,89', // green
    bookmark: '255,149,0', // orange
};


/** Pull the YYYY-MM-DD calendar day out of an ISO/SQLite timestamp.
 *  Used as part of the bundle key so events from different days never
 *  merge even when the actor + type match. */
export function dayKey(iso: string | null | undefined): string {
    if (!iso) return '';
    const normalised =
        typeof iso === 'string' && iso.includes(' ') && !iso.includes('T')
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
 *  posts and each one deserves its own card. Only Actions get
 *  aggregated since they're passive activity logs where 3 trip-creates
 *  in a day is repetitive noise. */
export function bundleEvents(events: FeedEvent[]) {
    const groups: Map<string, FeedEvent[]> = new Map();
    const out: Array<
        FeedEvent | { bundled: true; id: string; type: string; actor: Actor; when: string | null; members: FeedEvent[] }
    > = [];
    for (const ev of events) {
        if (POSTS_EVENT_TYPES.has(ev.type)) {
            out.push(ev);
            continue;
        }
        const key = `${ev.actor?.id || 'anon'}|${ev.type}|${dayKey(ev.when)}`;
        let bucket = groups.get(key);
        if (!bucket) {
            bucket = [];
            groups.set(key, bucket);
            out.push({ __slot: key } as any);
        }
        bucket.push(ev);
    }
    return out.map((slot) => {
        const slotKey = (slot as any).__slot;
        if (!slotKey) return slot as FeedEvent;
        const members = groups.get(slotKey) || [];
        if (members.length === 1) return members[0]!;
        // length > 1 here, so members[0] is guaranteed.
        const first = members[0]!;
        return {
            bundled: true,
            id: `bundle_${slotKey}`,
            type: first.type,
            actor: first.actor,
            when: first.when,
            members,
        };
    });
}

/** Verb for an aggregated bundle. Mirrors the singular eventLine shapes
 *  but pluralises the trip count. */
export function bundleLine(bundle: { actor: any; members: FeedEvent[]; type: string }) {
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
        case 'achievement_unlocked':
            return `${who} unlocked <strong style="color:#002d5b;">${n} new badges</strong> 🏅`;
        case 'settled_up':
            return `${who} settled up <strong style="color:#002d5b;">${n} times</strong> 🤝`;
        default:
            return `${who} did ${n} new things`;
    }
}

/** Avatar circle — picture if available, otherwise a gradient initials
 *  badge. When user.id is set, wrapped in a transparent button so
 *  clicking navigates to the profile. */
export function avatar(
    user: { id?: string; name?: string; picture?: string | null } | null | undefined,
    size: number = 44,
): string {
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    const fallback = `<div style="width:${size}px; height:${size}px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size * 0.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${esc(initial)}</div>`;
    const inner = user?.picture
        ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer"
            onerror="this.outerHTML=this.dataset.fallback;"
            data-fallback="${esc(fallback)}"
            style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`
        : fallback;
    if (!user?.id) return inner;
    return `<button type="button" class="feed-avatar-btn" data-feed-avatar-user-id="${esc(user.id)}"
        title="View ${esc(user.name || 'profile')}"
        aria-label="View ${esc(user.name || 'profile')}'s profile"
        style="background:transparent; border:0; padding:0; margin:0; cursor:pointer; line-height:0; flex-shrink:0; border-radius:50%;">${inner}</button>`;
}

/** Format an ISO timestamp as a relative phrase ("5m ago"). Falls back
 *  to a locale-formatted date for anything beyond a week. */
export function relativeTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const normalised =
        typeof iso === 'string' && iso.includes(' ') && !iso.includes('T')
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
    return new Date(t).toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' });
}

/** Build the human verb line for one event. Switch-style so adding a
 *  new event type is one branch — no clever inference. Self-attribution
 *  flips to second person ("You shared ...") when the actor is the caller. */
export function eventLine(ev: any) {
    const meId = STATE.user?.id;
    const isSelf = !!meId && ev.actor?.id === meId;
    const who = isSelf
        ? `<strong style="color:#002d5b;">You</strong>`
        : `<strong style="color:#002d5b;">${esc(ev.actor.name)}</strong>`;
    const tripName = ev.trip
        ? `<strong style="color:#002d5b;">${esc(ev.trip.name || ev.trip.country || 'a trip')}</strong>`
        : '';
    switch (ev.type) {
        case 'friend_created_trip':
            return `${who} started planning a new trip — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
        case 'friend_archived_trip':
            // Self-attribution flips "their" → "your" so the user
            // doesn't see "You just completed their trip to X" when
            // it's their own archive event surfaced in their own feed.
            return `${who} just completed ${isSelf ? 'your' : 'their'} trip to <strong style="color:#002d5b;">${esc(ev.trip?.country || ev.trip?.name || 'somewhere')}</strong> 🎉`;
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
                : origIsSelf
                  ? `<strong style="color:#002d5b;">your</strong> share`
                  : `<strong style="color:#002d5b;">${esc(ev.original_sharer.name)}</strong>'s trip`;
            return `${who} reposted ${orig} — ${tripName}${ev.trip?.country ? ` (${esc(ev.trip.country)})` : ''}`;
        }
        case 'achievement_unlocked': {
            const badgeLabel = ev.badge?.label
                ? `<strong style="color:#002d5b;">${esc(ev.badge.label)}</strong>`
                : 'a new badge';
            const emoji = ev.badge?.emoji ? ` ${esc(ev.badge.emoji)}` : '';
            return `${who} unlocked ${badgeLabel}${emoji}`;
        }
        case 'settled_up': {
            // Settled-up events are visible only to the two parties
            // (server-side gate); from the viewer's POV one of them
            // is always themselves. Render "you ↔ X" symmetrically
            // rather than picking a direction the user might find
            // confusing.
            const fromIsSelf = !!meId && ev.from?.id === meId;
            const otherName = fromIsSelf
                ? esc(ev.to?.name || 'someone')
                : esc(ev.from?.name || 'someone');
            return `${who} settled up with <strong style="color:#002d5b;">${otherName}</strong> on ${tripName || 'a trip'} 🤝`;
        }
        default:
            return `${who} did something new`;
    }
}

/** Per-event accent — picks a tint and emoji per type. Keeps cards
 *  visually grouped so a busy feed reads at a glance instead of a wall
 *  of identical glass blocks. */
export function eventAccent(type: string) {
    switch (type) {
        case 'friend_created_trip':   return { color: '#0071e3', icon: '🗺️' };
        case 'friend_archived_trip':  return { color: '#34c759', icon: '🏁' };
        case 'friend_joined_trip':    return { color: '#ff9500', icon: '👥' };
        case 'new_friendship':        return { color: '#9b59b6', icon: '🤝' };
        case 'friend_shared_trip':    return { color: '#5856d6', icon: '📣' };
        case 'friend_reposted_trip':  return { color: '#5856d6', icon: '🔁' };
        case 'achievement_unlocked':  return { color: '#ffd60a', icon: '🏅' };
        case 'settled_up':            return { color: '#34c759', icon: '🤝' };
        default:                      return { color: '#8e8e93', icon: '✨' };
    }
}

/** SVG icon paths for action-row buttons (Lucide-outline aesthetic).
 *  Toggled actions (heart, bookmark) flip between outline and filled
 *  to signal state. */
export function actionIconSvg(name: 'heart' | 'comment' | 'repost' | 'bookmark', filled: boolean = false): string {
    const head = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
    const close = `</svg>`;
    const fillAttr = filled ? ' fill="currentColor"' : '';
    let body = '';
    switch (name) {
        case 'heart':
            body = `<path${fillAttr} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`;
            break;
        case 'comment':
            body = `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`;
            break;
        case 'repost':
            body = `<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;
            break;
        case 'bookmark':
            body = `<path${fillAttr} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>`;
            break;
    }
    return head + body + close;
}

/** Compact "icon button + count" pair. */
export function actionButton(opts: {
    className: string;
    accent: string;
    dataAttrs?: string;
    title: string;
    svg: string;
    count?: number;
    countThreshold?: number;
    marginLeftAuto?: boolean;
}) {
    const wrapStyle = `display:inline-flex; align-items:center; gap:6px;${opts.marginLeftAuto ? ' margin-left:auto;' : ''}`;
    const threshold = opts.countThreshold ?? 1;
    const showChip = typeof opts.count === 'number';
    const chipText = showChip && (opts.count as number) >= threshold ? String(opts.count) : '';
    return `
        <span style="${wrapStyle}">
            <button type="button" class="icon-btn-circle ${opts.className}" style="--accent: ${opts.accent};" ${opts.dataAttrs || ''} title="${opts.title}" aria-label="${opts.title}">
                ${opts.svg}
            </button>
            ${showChip ? `<span class="feed-action-count" data-threshold="${threshold}" style="font-size:0.78rem; color:var(--text-secondary); font-weight:700; min-width:0.8em;">${chipText}</span>` : ''}
        </span>
    `;
}

/** Build the action-row HTML. Posts get like + comment + repost +
 *  bookmark; Actions get bookmark only (no comments/likes on passive
 *  activity logs). The thread `<div>` ships with every Posts card so
 *  the lazy expand handler always has a slot to populate. */
export function actionsRow(ev: any) {
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
        return `
            <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
                ${bookmarkBtn}
            </div>
        `;
    }

    const liked = !!ev.is_liked;
    const likeCount = ev.like_count || 0;
    const commentCount = ev.comment_count || 0;
    const canRepost = !!ev.post_id;

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
    const repostBtn = canRepost
        ? actionButton({
              className: 'feed-repost-btn',
              accent: ACTION_ACCENTS.muted,
              dataAttrs: `data-post-id="${ev.post_id}"`,
              title: 'Repost to your friends',
              svg: actionIconSvg('repost'),
          })
        : '';

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

/** Render a single comment row for the thread. canDelete=true when
 *  the current user authored the comment — adds a small ✕ button. */
export function commentRowHtml(c: any, canDelete: boolean) {
    // Audit fix (2026-05-27): escape `c.id` everywhere it's
    // interpolated. The server normally returns an auto-increment
    // INTEGER, but the type is `any` here and a tampered API
    // response (post-XSS-in-the-API future scenario) could put
    // a string-with-quotes in `id`, breaking out of the
    // `data-comment-id="..."` attribute. Defense-in-depth.
    const idAttr = esc(c.id);
    return `
        <div class="feed-comment-row" data-comment-id="${idAttr}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,45,91,0.06);">
            ${avatar(c.author, 32)}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <strong style="color:#002d5b; font-size:0.85rem;">${esc(c.author?.name || 'Someone')}</strong>
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">${esc(relativeTime(c.when))}</span>
                </div>
                <div style="font-size:0.88rem; color:#002d5b; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-wrap:break-word;">${esc(c.body || '')}</div>
            </div>
            ${
                canDelete
                    ? `
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    <button type="button" class="feed-comment-edit-btn" data-comment-id="${idAttr}" title="Edit your comment" aria-label="Edit comment"
                        style="background:transparent; border:0; color:rgba(0,113,227,0.65); cursor:pointer; padding:2px 6px; font-size:0.78rem; font-weight:800;">✎</button>
                    <button type="button" class="feed-comment-delete-btn" data-comment-id="${idAttr}" title="Delete your comment" aria-label="Delete comment"
                        style="background:transparent; border:0; color:rgba(255,59,48,0.6); cursor:pointer; padding:2px 6px; font-size:0.72rem; font-weight:800;">✕</button>
                </div>`
                    : ''
            }
        </div>
    `;
}
