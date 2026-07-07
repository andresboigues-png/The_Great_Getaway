// src/bootstrap/notifications.ts
//
// Notification UI primitives — badge counter, dropdown renderer, and
// click-to-route handler. Pre-§3.2 these lived inline in main.ts; lifted
// here so main.ts can be a thin boot orchestrator and so nav-chrome.ts
// (the DOM wiring) can import the render/click handlers without dragging
// the whole main.ts import graph.

import { STATE } from '../state.js';
import { t, getIntlLocale } from '../i18n.js';
import { navigate } from '../router.js';
import { PAGES } from '../constants.js';
import { esc } from '../utils.js';
// MK1 Wave F (T2-6/PERF-4): lazy — see nav-chrome.ts. Loaded when the
// user clicks an invite notification, not on every cold boot.
const openTripInviteResponseModal = async (n: unknown) =>
    (await import('../modals/share.js')).openTripInviteResponseModal(
        n as Parameters<typeof import('../modals/share.js').openTripInviteResponseModal>[0]
    );
import { markNotificationRead } from '../api.js';

/**
 * R3-Round 2 fix: server emits SQLite-naive UTC timestamps
 * (`YYYY-MM-DD HH:MM:SS`, no timezone). ECMAScript's `new Date(...)`
 * parses that shape as LOCAL time, so a Tokyo (UTC+9) user reading
 * a notification recorded at 23:00 UTC sees it 9 hours later in
 * "today" semantics — and crucially the displayed date can flip
 * around midnight UTC. `feed/render.ts:relativeTime` already does
 * this normalisation; mirroring it here keeps the dropdown timestamp
 * honest.
 */
function _normaliseServerIso(s: string | null | undefined): string {
    if (!s) return '';
    return (typeof s === 'string' && s.includes(' ') && !s.includes('T'))
        ? s.replace(' ', 'T') + 'Z'
        : s;
}

export function updateNotificationUI() {
    // Two badges live in the DOM: #notificationBadge in the mobile
    // top-banner bell, #notificationBadgeDesktop on the bell now sitting
    // inside .nav-links (just left of "Home"). Only one is visible at a
    // time — CSS media query hides the other — but both stay in sync so
    // a viewport resize doesn't lose unread state. Same dual-instance
    // pattern as the trip selector / complete + delete buttons.
    // R5-B5: prefer the server's authoritative `notificationsTotalUnread`
    // when present (uncapped). Pre-fix the badge counted from the local
    // notifications array which is LIMIT 50 from the server — a user
    // with 80 unread saw "9+" but "Mark all read" silently wiped 80
    // including the 30 they could never see in the dropdown. Falls back
    // to the local-filter count on legacy responses.
    const unread = typeof STATE.notificationsTotalUnread === 'number'
        ? STATE.notificationsTotalUnread
        : (STATE.notifications || []).filter(n => !n.is_read).length;
    const display = unread > 0 ? 'flex' : 'none';
    const text = unread > 9 ? '9+' : String(unread);
    for (const id of ['notificationBadge', 'notificationBadgeDesktop']) {
        const badge = document.getElementById(id);
        if (!badge) continue;
        badge.style.display = display;
        badge.textContent = text;
    }
}

/** Pick the accent colour rgb-triple for a notification type. Drives both
 *  the title indicator dot and the box-shadow glow on it. */
function notificationAccent(type: string) {
    switch (type) {
        case 'alert': return '255,59,48';
        case 'trip_public': return '52,199,89';
        case 'trip_invite': return '175,82,222';
        case 'trip_invite_accepted': return '52,199,89';
        case 'trip_invite_declined': return '142,142,147';
        case 'trip_member_removed': return '255,59,48';
        // Feed engagement: same purple as the share/repost event accent
        // on the feed page, so the notification visually traces back
        // to where the engagement happened.
        case 'share_liked': return '255,59,48';
        case 'share_commented': return '0,113,227';
        case 'share_reposted': return '88,86,214';
        case 'memory_left_on_profile': return '175,82,222';
        // Model B — `followed_you` replaces the legacy friend_request /
        // accepted_request pair on the produce side. The two legacy
        // types are kept here in the switch so historical rows still
        // render with the correct accent until they age out.
        case 'followed_you':
        case 'friend_request':
        case 'accepted_request':
        default: return '0,113,227';
    }
}

/** Localize an English notification message body for display. Server
 *  inserts notifications with pre-formatted English copy in the
 *  `message` column (see src/routes/{follows,trips,feed,settlements,
 *  notifications}.py); we can't change that without a schema migration
 *  to ship structured slot data alongside, so this function parses the
 *  English template per `type`, extracts the variable slots, and
 *  re-renders the message through t() in the active locale.
 *
 *  Designed to be defensive: if the type isn't known OR the regex
 *  doesn't match (server format drifted), the original English message
 *  is returned untouched. Net effect = same UI as before for unknown
 *  rows + localized rendering for the 11 documented patterns.
 *
 *  Pattern catalogue (matches the Python sources):
 *    - followed_you / friend_request / accepted_request:
 *        "{actor} started following you."
 *    - trip_public:
 *        "{actor} completed their trip to {trip} and made it public!"
 *    - trip_invite:
 *        "{actor} invited you to {trip} as a {Role}."
 *        Role is one of: Planner / Budgeteer / Relaxer.
 *    - trip_invite_accepted:  "{actor} joined {trip}."
 *    - trip_invite_declined:  "{actor} declined the invite to {trip}."
 *    - trip_member_removed:   "{actor} removed you from {trip}."
 *    - share_liked / share_commented / share_reposted:
 *        "{actor} liked|commented on|reposted your share."
 *    - settled_up:
 *        "{from} settled {amount} {currency} with you for {trip}."
 */
export function localizeNotificationMessage(type: string | undefined, message: string | undefined): string {
    const raw = message ?? '';
    if (!raw || !type) return raw;
    // Map of regex → t() builder. Each entry returns null if the
    // regex doesn't match, otherwise the localized string.
    type Match = (m: string) => string | null;
    const handlers: Record<string, Match> = {
        followed_you:        (m) => _matchActor(m, /^(.+?) started following you\.?$/, 'notifications.msgFollowedYou'),
        friend_request:      (m) => _matchActor(m, /^(.+?) started following you\.?$/, 'notifications.msgFollowedYou'),
        accepted_request:    (m) => _matchActor(m, /^(.+?) started following you\.?$/, 'notifications.msgFollowedYou'),
        trip_public:         (m) => _matchActorTrip(m, /^(.+?) completed their trip to (.+?) and made it public!$/, 'notifications.msgTripPublic'),
        trip_invite_accepted:(m) => _matchActorTrip(m, /^(.+?) joined (.+?)\.?$/, 'notifications.msgTripAccepted'),
        trip_invite_declined:(m) => _matchActorTrip(m, /^(.+?) declined the invite to (.+?)\.?$/, 'notifications.msgTripDeclined'),
        trip_member_removed: (m) => _matchActorTrip(m, /^(.+?) removed you from (.+?)\.?$/, 'notifications.msgTripMemberRemoved'),
        share_liked:         (m) => _matchActor(m, /^(.+?) liked your share\.?$/, 'notifications.msgShareLiked'),
        share_commented:     (m) => _matchActor(m, /^(.+?) commented on your share\.?$/, 'notifications.msgShareCommented'),
        share_reposted:      (m) => _matchActor(m, /^(.+?) reposted your share\.?$/, 'notifications.msgShareReposted'),
        memory_left_on_profile: (m) => {
            const found = /^(.+?) left a memory on your profile\.?$/.exec(m);
            if (!found || !found[1]) return null;
            return t('notifications.msgMemoryLeft', { actor: found[1] });
        },
        trip_invite:         (m) => {
            // "{actor} invited you to {trip} as a {Role}."
            const re = /^(.+?) invited you to (.+?) as a (Planner|Budgeteer|Relaxer)\.?$/;
            const found = re.exec(m);
            if (!found) return null;
            const [, actor, trip, role] = found;
            const roleLocalized = role === 'Planner' ? t('companions.rolePlanner')
                : role === 'Budgeteer' ? t('companions.roleBudgeteer')
                : t('companions.roleRelaxer');
            return t('notifications.msgTripInvite', { actor: actor!, trip: trip!, role: roleLocalized });
        },
        settled_up:          (m) => {
            // "{from} settled {amount} {currency} with you for {trip}."
            // Amount is a number formatted by Python's `:g` so it may be
            // an integer ("50") or a decimal ("50.5"); capture loosely.
            const re = /^(.+?) settled ([\d.,]+) (\S+) with you for (.+?)\.?$/;
            const found = re.exec(m);
            if (!found) return null;
            const [, from, amount, currency, trip] = found;
            return t('notifications.msgSettledUp', { from: from!, amount: amount!, currency: currency!, trip: trip! });
        },
    };
    const fn = handlers[type];
    if (!fn) return raw;
    const localized = fn(raw);
    return localized ?? raw;
}

/** Helper for the simple "{actor} VERB" patterns. */
function _matchActor(message: string, re: RegExp, key: 'notifications.msgFollowedYou' | 'notifications.msgShareLiked' | 'notifications.msgShareCommented' | 'notifications.msgShareReposted'): string | null {
    const found = re.exec(message);
    if (!found) return null;
    const actor = found[1];
    if (!actor) return null;
    return t(key, { actor });
}

/** Helper for the "{actor} VERB {trip}" patterns. */
function _matchActorTrip(message: string, re: RegExp, key: 'notifications.msgTripPublic' | 'notifications.msgTripAccepted' | 'notifications.msgTripDeclined' | 'notifications.msgTripMemberRemoved'): string | null {
    const found = re.exec(message);
    if (!found) return null;
    const [, actor, trip] = found;
    if (!actor || !trip) return null;
    return t(key, { actor, trip });
}

/** Human-readable title fallback when the row didn't ship one.
 *  2026-05-25 (audit): titles now route through t() so notifications
 *  display in the user's chosen locale. */
function notificationDefaultTitle(type: string) {
    switch (type) {
        // Model B — `followed_you` is the live type; the legacy
        // friend_request / accepted_request titles stay for
        // backward-compatible rendering of historical rows.
        case 'followed_you': return t('notifications.titleNewFollower');
        case 'friend_request': return t('notifications.titleNewFollower');
        case 'accepted_request': return t('notifications.titleNewFollower');
        case 'trip_public': return t('notifications.titleTripCompleted');
        case 'trip_invite': return t('notifications.titleTripInvite');
        case 'trip_invite_accepted': return t('notifications.titleTripInviteUpdate');
        case 'trip_invite_declined': return t('notifications.titleTripInviteUpdate');
        case 'trip_member_removed': return t('notifications.titleRemovedFromTrip');
        case 'share_liked': return t('notifications.titleNewLike');
        case 'share_commented': return t('notifications.titleNewComment');
        case 'share_reposted': return t('notifications.titleNewRepost');
        case 'memory_left_on_profile': return t('notifications.titleMemoryLeft');
        case 'alert': return t('notifications.titleAlert');
        default: return t('notifications.titleGeneric');
    }
}

export function renderNotificationDropdown() {
    // Two list containers — mobile copy (#notificationList) + desktop
    // copy (#notificationListDesktop). Both render the same content from
    // STATE.notifications so opening either dropdown shows up-to-date
    // rows regardless of which bell was clicked.
    const lists = [
        document.getElementById('notificationList'),
        document.getElementById('notificationListDesktop'),
    ].filter((el): el is HTMLElement => el !== null);
    if (lists.length === 0) return;

    const notes = STATE.notifications || [];
    if (notes.length === 0) {
        // i18n session 2: localized via t() so the empty-state matches the
        // user's picked language. esc() not needed — t() returns a known
        // string from our own translation tables, never user input.
        const emptyText = t('nav.notificationsEmpty');
        for (const list of lists) {
            list.innerHTML = `<div class="notification-empty">${emptyText}</div>`;
        }
        return;
    }

    // Escape title + message — both are server-composed but include
    // user-controlled strings (trip names, user.name from OAuth, companion
    // names) that could carry markup if a malicious user supplied them.
    //
    // §2.13: was `data-notification-index="${i}"` keyed on array
    // position. A poll landing between render and click could
    // reorder/shrink STATE.notifications and the click would resolve
    // to the WRONG row (or undefined). Switching to the row's stable
    // `id` removes that race entirely; the click handler looks up by
    // id instead of `STATE.notifications[idx]`.
    // R3-Fix #20: aria-label conveys unread state in the accessible
    // name so screen-reader users get told (e.g. "Unread. Ana invited
    // you to Paris.") instead of just the message body. Color + dot
    // are visual-only signals.
    const html = notes.map(n => {
        const title = n.title || notificationDefaultTitle(n.type);
        const message = localizeNotificationMessage(n.type, n.message);
        const unreadPrefix = n.is_read ? '' : 'Unread. ';
        const ariaLabel = `${unreadPrefix}${title}. ${message}`;
        return `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-id="${esc(String(n.id))}" role="button" tabindex="0" aria-label="${esc(ariaLabel)}">
                <div class="notification-item__title" style="--accent: ${notificationAccent(n.type)};">
                    <span class="notification-item__dot" aria-hidden="true"></span>
                    ${esc(title)}
                </div>
                <div class="notification-item__message">${esc(message)}</div>
                <div class="notification-item__time">${new Date(_normaliseServerIso(n.created_at)).toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' })}</div>
            </div>
        `;
    }).join('');
    for (const list of lists) list.innerHTML = html;
}

/** Route a clicked notification to the page that lets the user act on it.
 *  `related_id` is a user_id for friend_* / trip_member_removed,
 *  a trip_id for trip_invite_* / trip_public / settled_up /
 *  settled_up_reverted, and a badge_id for achievement_unlocked.
 *  Falls back to home for unknown types. */
export function handleNotificationClick(notification: { type?: string; related_id?: string | number; message?: string; title?: string; id?: string | number }) {
    // Close BOTH dropdowns — the user might have clicked from either
    // bell, but the navigation moves them away from the navbar so
    // either lingering open dropdown would be visually stale.
    for (const id of ['notificationDropdown', 'notificationDropdownDesktop']) {
        const dropdown = document.getElementById(id);
        if (dropdown) dropdown.style.display = 'none';
    }

    // R5-B5: mark just this notification as read. Pre-fix the only
    // way to clear the bell badge was the global "Mark all read"
    // button which wiped unread rows the user hadn't acted on yet.
    // Fire-and-forget — local state flips optimistically inside
    // markNotificationRead, and a server failure reconciles on the
    // next /api/notifications/list poll.
    //
    // R8-B3: SKIP for trip_invite — the click opens an accept/decline
    // modal. With R7-F4's back-button-closes-modal hook, a user who
    // tapped a trip_invite and swiped back to think about it would
    // see the invite vanish from the bell with no decision made.
    // Defer mark-read until the modal's action handler runs (the
    // accept/decline routes already remove the notification server-
    // side, so the bell catches up on the next poll).
    const isTripInvite = notification.type === 'trip_invite';
    if (!isTripInvite && notification.id !== undefined && notification.id !== null) {
        void markNotificationRead(notification.id);
    }

    const relatedId = notification.related_id ? String(notification.related_id) : null;

    switch (notification.type) {
        // Model B — all three types are "X started following you".
        // Route to the follower's profile so the user can see who they
        // are and optionally follow back. Pre-Model-B, friend_request
        // routed to the Friends page where the user could Accept;
        // there's no Accept dance now, so the profile page (where the
        // Follow-back button lives) is the right destination.
        case 'followed_you':
        case 'friend_request':
        case 'accepted_request':
            if (relatedId) {
                navigate(PAGES.PROFILE, { userId: relatedId });
            } else {
                navigate(PAGES.FRIENDS);
            }
            break;
        case 'trip_public':
            // Audit fix (2026-05-26): `trip_public` notifications carry
            // a TRIP id (post-2026-05-18 backend change), not a user
            // id. The old handler routed it through PAGES.PROFILE as
            // a user_id which 404'd every click. Now we land on the
            // Feed page so the user can find the public trip card the
            // notification was about.
            navigate(PAGES.FEED);
            break;
        case 'trip_invite':
            // Same one-tap decision pattern as the companion-link invite.
            // The accept path's data shows up via the next /api/data poll.
            void openTripInviteResponseModal(notification);
            break;
        case 'trip_invite_accepted':
        case 'trip_invite_declined':
        case 'trip_member_removed':
            // Outcome notifications — land on Home; the trip list will
            // reflect the new state on the next poll.
            navigate(PAGES.HOME);
            break;
        case 'share_liked':
        case 'share_commented':
        case 'share_reposted': {
            // 2026-05-26 (audit NF1): engagement notifications route to
            // the FEED, with the post highlighted via a query param the
            // feed page can scroll-to. Pre-this-fix the default branch
            // dumped them on HOME with no context. `postId` is
            // populated by the server (migration f5a6b7c8d9e0 + the
            // _fire_engagement_notification helper); legacy rows from
            // before the migration may not have it, in which case we
            // fall back to FEED with no highlight (still better than
            // HOME because at least the feed is where the engagement
            // happened).
            const postId = (notification as { postId?: number | null }).postId;
            if (postId) {
                navigate(PAGES.FEED, { highlightPostId: String(postId) });
            } else {
                navigate(PAGES.FEED);
            }
            break;
        }
        case 'memory_left_on_profile':
            // The recipient lands on their OWN profile to see + feature the
            // new memory (related_id is the author, but the destination is
            // the viewer's own Best-of, so no userId → own profile).
            navigate(PAGES.PROFILE);
            break;
        default:
            navigate(PAGES.HOME);
            break;
    }
}
