// @ts-check
// feed.js — Activity feed page. Pulls /api/feed (synthesised server-side
// from trips + friends + trip_members in the last 30 days) and renders a
// vertical list of "your friend did a thing" cards.
//
// Two-phase render: first paint shows whatever's in the module-level
// cache (so navigating back to the feed feels instant), then the
// background fetch repaints with fresh data. Empty state is reachable
// in two distinct ways and both use the same dashed-purple block:
//   - "No friends yet" (the prerequisite for any event to exist)
//   - "No recent activity" (you have friends, they're just quiet)
// We don't render fake placeholder events — silence is honest.

import { STATE } from '../state.js';
import { apiFetch } from '../api.js';
import { esc, q } from '../utils.js';
import { navigate } from '../router.js';

/** @typedef {{id:string,name:string,picture?:string|null}} Actor */
/** @typedef {{id:string,name:string,country?:string|null}} TripRef */
/** @typedef {{
 *   id:string,
 *   type:'friend_created_trip'|'friend_archived_trip'|'friend_joined_trip'|'new_friendship',
 *   actor: Actor,
 *   trip?: TripRef,
 *   when:string|null,
 * }} FeedEvent */

// Module-level cache survives navigation away and back, so the second
// visit paints from cache before the network call returns.
/** @type {FeedEvent[]} */
let cachedEvents = [];

/** Avatar circle — picture if available, otherwise a gradient initials
 *  badge so empty avatars don't break the visual rhythm. Mirrors the
 *  helper in friends.js so both pages render the same way. */
function avatar(user, size = 44) {
    const initial = (user.name || '?').charAt(0).toUpperCase();
    if (user.picture) {
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
        default:                      return { color: '#8e8e93', icon: '✨' };
    }
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
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">When your friends create trips, complete adventures or join in on plans you're part of, you'll see it here.<br>Head to <strong>Your network</strong> to add more friends and grow the feed.</p>
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
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${accent.color}22; border-left: 4px solid ${accent.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; align-items:flex-start; gap:14px;">
                    ${avatar(ev.actor)}
                    <div style="flex:1; min-width:0;">
                        <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                            <span style="margin-right:6px;">${accent.icon}</span>${eventLine(ev)}
                        </div>
                        ${time ? `<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${esc(time)}</div>` : ''}
                    </div>
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

    // First paint from cache (instant), then background refresh.
    paintList();
    refresh();

    return div;
}
