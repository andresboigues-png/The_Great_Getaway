// src/bootstrap/notifications.ts
//
// Notification UI primitives — badge counter, dropdown renderer, and
// click-to-route handler. Pre-§3.2 these lived inline in main.ts; lifted
// here so main.ts can be a thin boot orchestrator and so nav-chrome.ts
// (the DOM wiring) can import the render/click handlers without dragging
// the whole main.ts import graph.

import { STATE } from '../state.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { PAGES } from '../constants.js';
import { esc } from '../utils.js';
import { openTripInviteResponseModal } from '../modals.js';

export function updateNotificationUI() {
    // Two badges live in the DOM: #notificationBadge in the mobile
    // top-banner bell, #notificationBadgeDesktop on the bell now sitting
    // inside .nav-links (just left of "Home"). Only one is visible at a
    // time — CSS media query hides the other — but both stay in sync so
    // a viewport resize doesn't lose unread state. Same dual-instance
    // pattern as the trip selector / complete + delete buttons.
    const unread = (STATE.notifications || []).filter(n => !n.is_read).length;
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

/** Human-readable title fallback when the row didn't ship one. */
function notificationDefaultTitle(type: string) {
    switch (type) {
        // Model B — `followed_you` is the live type; the legacy
        // friend_request / accepted_request titles stay for
        // backward-compatible rendering of historical rows.
        case 'followed_you': return 'New follower';
        case 'friend_request': return 'New follower';
        case 'accepted_request': return 'New follower';
        case 'trip_public': return 'Trip Completed';
        case 'trip_invite': return 'Trip invitation';
        case 'trip_invite_accepted': return 'Trip invite update';
        case 'trip_invite_declined': return 'Trip invite update';
        case 'trip_member_removed': return 'Removed from trip';
        case 'share_liked': return 'New like';
        case 'share_commented': return 'New comment';
        case 'share_reposted': return 'New repost';
        case 'alert': return 'Alert';
        default: return 'Notification';
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
    const html = notes.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-id="${esc(String(n.id))}" role="button" tabindex="0">
            <div class="notification-item__title" style="--accent: ${notificationAccent(n.type)};">
                <span class="notification-item__dot"></span>
                ${esc(n.title || notificationDefaultTitle(n.type))}
            </div>
            <div class="notification-item__message">${esc(n.message)}</div>
            <div class="notification-item__time">${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
    `).join('');
    for (const list of lists) list.innerHTML = html;
}

/** Route a clicked notification to the page that lets the user act on it.
 *  `related_id` is a user_id for friend_* / trip_public / trip_member_removed
 *  and a trip_id for trip_invite_*; for everything else we fall back to home. */
export function handleNotificationClick(notification: { type?: string; related_id?: string | number; message?: string; title?: string; id?: string | number }) {
    // Close BOTH dropdowns — the user might have clicked from either
    // bell, but the navigation moves them away from the navbar so
    // either lingering open dropdown would be visually stale.
    for (const id of ['notificationDropdown', 'notificationDropdownDesktop']) {
        const dropdown = document.getElementById(id);
        if (dropdown) dropdown.style.display = 'none';
    }

    const relatedUserId = notification.related_id ? String(notification.related_id) : null;

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
        case 'trip_public':
            if (relatedUserId) {
                navigate(PAGES.PROFILE, { userId: relatedUserId });
            } else {
                navigate(PAGES.FRIENDS);
            }
            break;
        case 'trip_invite':
            // Same one-tap decision pattern as the companion-link invite.
            // The accept path's data shows up via the next /api/data poll.
            openTripInviteResponseModal(notification);
            break;
        case 'trip_invite_accepted':
        case 'trip_invite_declined':
        case 'trip_member_removed':
            // Outcome notifications — land on Home; the trip list will
            // reflect the new state on the next poll.
            navigate(PAGES.HOME);
            break;
        default:
            navigate(PAGES.HOME);
            break;
    }
}
