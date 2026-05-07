import { STATE, loadState, emit, subscribe } from './state.js';
import { syncWithServer, pullFromServer, fetchNotifications, markNotificationsRead, deleteTrip, archiveTripOnServer, apiUrl, apiFetch, setAuthToken, clearAuthToken } from './api.js';
import { showConfirmModal, esc } from './utils.js';
import { navigate } from './router.js';
import { PAGES, EVENTS, type PageName } from './constants.js';
import { canDelete } from './permissions.js';

/**
 * Narrow an arbitrary string (from the URL hash or a `data-page` attribute)
 * down to a known PageName, falling back to home for unknown values. Keeps
 * the typed `navigate()` signature honest at the boundary where strings come
 * from outside the app.
 */
function resolvePage(raw: string): PageName {
    const known: readonly string[] = Object.values(PAGES);
    return (known.includes(raw) ? raw : PAGES.HOME) as PageName;
}
import { updateUserUI, logout } from './pages/profile.js';
import { openNewTripModal, openTripInviteResponseModal } from './modals.js';

// Global Google Client ID is now provided via index.html template from environment variables

// ── UI HELPERS ──

export function updateNotificationUI() {
    const badge = document.getElementById('notificationBadge');
    const unread = (STATE.notifications || []).filter(n => !n.is_read).length;
    if (badge) {
        badge.style.display = unread > 0 ? 'flex' : 'none';
        badge.textContent = unread > 9 ? '9+' : String(unread);
    }
}

/** Pick the accent colour rgb-triple for a notification type. Drives both
 *  the title indicator dot and the box-shadow glow on it. */
function notificationAccent(type) {
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
        case 'friend_request':
        case 'accepted_request':
        default: return '0,113,227';
    }
}

/** Human-readable title fallback when the row didn't ship one. */
function notificationDefaultTitle(type) {
    switch (type) {
        case 'friend_request': return 'Friend Request';
        case 'accepted_request': return 'Request Accepted';
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

function renderNotificationDropdown() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    const notes = STATE.notifications || [];
    if (notes.length === 0) {
        list.innerHTML = '<div class="notification-empty">No new notifications</div>';
        return;
    }

    // Escape title + message — both are server-composed but include
    // user-controlled strings (trip names, user.name from OAuth, companion
    // names) that could carry markup if a malicious user supplied them.
    list.innerHTML = notes.map((n, i) => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-index="${i}" role="button" tabindex="0">
            <div class="notification-item__title" style="--accent: ${notificationAccent(n.type)};">
                <span class="notification-item__dot"></span>
                ${esc(n.title || notificationDefaultTitle(n.type))}
            </div>
            <div class="notification-item__message">${esc(n.message)}</div>
            <div class="notification-item__time">${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
    `).join('');
}

/** Route a clicked notification to the page that lets the user act on it.
 *  `related_id` is a user_id for friend_* / trip_public / trip_member_removed
 *  and a trip_id for trip_invite_*; for everything else we fall back to home. */
function handleNotificationClick(notification) {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.style.display = 'none';

    const relatedUserId = notification.related_id ? String(notification.related_id) : null;

    switch (notification.type) {
        case 'friend_request':
            navigate(PAGES.FRIENDS);
            break;
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

function updateTripSelector() {
    const selector = /** @type {HTMLSelectElement | null} */ (document.getElementById('tripSelector'));
    const completeBtn = document.getElementById('completeTripBtn');
    const deleteBtn = document.getElementById('deleteTripBtn');
    if (!selector) return;

    if (STATE.trips.length === 0) {
        selector.innerHTML = '<option value="">No Active Trips</option>';
        if (completeBtn) completeBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
        return;
    }

    selector.innerHTML = STATE.trips.map(t => `
        <option value="${esc(t.id)}" ${t.id === STATE.activeTripId ? 'selected' : ''}>${esc(t.name)}</option>
    `).join('');

    // Show/hide management buttons. Archive (Complete) is per-user — any
    // member, including Relaxers, can hide their own copy. Delete is the
    // destructive op that wipes everyone's data, so only the trip owner
    // sees the button. Backend already 403s for non-owners; this just
    // keeps the UI honest.
    const hasActive = !!STATE.activeTripId;
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (completeBtn) completeBtn.style.display = hasActive ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = hasActive && canDelete(activeTrip) ? 'flex' : 'none';

    selector.onchange = (e) => {
        const target = e.target as HTMLSelectElement | null;
        if (!target) return;
        STATE.activeTripId = target.value;
        emit(EVENTS.STATE_CHANGED);          // saveState + updateTripSelector via subscriber
        navigate(PAGES.HOME);
    };
}

// UI subscribers — kept here (not in state.js) so the data layer doesn't reach
// into the UI. api.js emits 'notifications:changed' from the fetch helpers.
subscribe('state:changed', updateTripSelector);
// Auth-driven chrome (body.is-signed-out class + sidebar profile slot) is
// re-applied on every state change so login/logout keeps the nav, bell
// and trip selector in sync without each call site remembering to call
// updateUserUI by hand.
subscribe('state:changed', updateUserUI);
subscribe('notifications:changed', updateNotificationUI);

function archiveActiveTrip() {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Login is mandatory at the router boundary, so callers here always
    // have a user. The previous "Log In to Archive" guard is gone.

    // Copy reframe: "Archive" → "Complete". Same data flow underneath
    // (still flips trip_members.is_archived on the server), but the
    // user-facing language is positive — completing a trip is a happy
    // moment, not a filing exercise. Confirm button paints green
    // (#34c759) instead of the default destructive red.
    showConfirmModal({
        title: "Complete this trip?",
        message: "It moves into your Collections as a completed memory. You can revisit it anytime, and reopen it later if you need to.",
        confirmText: "Complete",
        confirmColor: "#34c759",
        onConfirm: () => {
            trip.isArchived = true;
            // Stamp the moment of completion so Collections can sort
            // by "Recently completed" without relying on array-order
            // proxies (which break on cross-device sync). Field is
            // tolerated by the server JSON column even if it doesn't
            // round-trip via a dedicated trips column.
            trip.archivedAt = new Date().toISOString();
            trip.expenses = STATE.expenses.filter(e => e.tripId === trip.id);
            trip.tripDays = STATE.tripDays.filter(d => d.tripId === trip.id);

            STATE.archivedTrips.push(trip);

            // Remove from active state to keep things clean
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);

            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            archiveTripOnServer(trip.id);        // server delta still explicit
            navigate('collections');
        }
    });
}

const deleteActiveTrip = () => {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;
    // Belt-and-braces gate — the button is hidden for non-owners in
    // updateTripSelector, but keep this here so even a stray handler
    // call (devtools, browser back-forward cache, future code path)
    // can't trigger a forbidden delete.
    if (!canDelete(trip)) {
        showConfirmModal({
            title: "Owner only",
            message: "Only the trip's owner can delete it. You can mark your own copy complete from the navbar instead.",
            confirmText: "OK",
            onConfirm: () => {},
        });
        return;
    }

    showConfirmModal({
        title: "Delete Trip?",
        message: `Are you sure you want to delete "${trip.name}" permanently? This will remove all associated expenses and days.`,
        confirmText: "Delete Permanently",
        onConfirm: async () => {
            STATE.trips = STATE.trips.filter(t => t.id !== trip.id);
            STATE.expenses = STATE.expenses.filter(e => e.tripId !== trip.id);
            STATE.tripDays = STATE.tripDays.filter(d => d.tripId !== trip.id);
            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;

            emit('state:changed');               // saveState + updateTripSelector via subscriber
            deleteTrip(trip.id);                 // server delta still explicit
            navigate('home');
        }
    });
};

// ── AUTH ──

async function handleGoogleLogin(response) {
    try {
        const res = await fetch(apiUrl('/api/auth/google'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.status === 'success') {
            // Phase G: store the JWT first so subsequent fetches (sync /
            // pull / notifications below) carry the Authorization header.
            // Without this, those calls would 401 against require_auth and
            // the UI would render as logged-out despite the login succeeding.
            if (data.token) setAuthToken(data.token);
            STATE.user = data.user;
            STATE.hasLoggedInBefore = true;
            // No more auto-self-companion creation — companions are per-trip
            // and the trip owner is implicitly a member of every trip they
            // create (via _ensure_owner_member_row on the server).

            await syncWithServer();
            await pullFromServer();
            // Logout cleared activeTripId; server doesn't store it. Reconcile so the
            // trip selector and the rest of the UI agree on which trip is active.
            if (STATE.trips.length > 0 && !STATE.trips.find(t => t.id === STATE.activeTripId)) {
                STATE.activeTripId = STATE.trips[0].id;
            }
            emit('state:changed');               // saveState via subscriber
            updateUserUI();
            navigate('profile');
        }
    } catch (e) {
        console.error("Google Login Failed:", e);
    }
}

// Expose on window so profile.js's renderButton can wire it as the
// callback when it (re-)initializes the GIS SDK. Both files calling
// initialize is OK — it's just configuration; whichever fires later
// wins, and they pass the same callback.
// @ts-ignore
window.handleGoogleLogin = handleGoogleLogin;

function initGoogleLogin() {
    // The GIS script is loaded `async defer`, so on a cold page-load
    // `google.accounts` often isn't defined yet by the time init() runs.
    // The previous version silently bailed in that case, leaving
    // initialize() never called — when the login wall later rendered the
    // button via renderButton, clicking it did nothing because the
    // callback wasn't wired. After a refresh the SDK was cached and ready
    // immediately, which is why "refresh and it works" was the symptom.
    //
    // Now we poll briefly until the SDK loads, then call initialize once.
    // 250ms x 40 = 10s upper bound — plenty for any realistic load time
    // without spinning forever if the script never arrives.
    let attempts = 0;
    const tryInit = () => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.initialize({
                client_id: window.globalGoogleClientId,
                callback: handleGoogleLogin
            });
            const container = document.getElementById("googleBtnContainer");
            if (container) {
                google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill" });
            }
            return;
        }
        if (++attempts < 40) setTimeout(tryInit, 250);
    };
    tryInit();
}

// ── INITIALIZATION ──

async function init() {
    loadState();
    
    // Check session: apiFetch attaches the stored JWT (if any). The
    // server returns logged_in:true with the user payload when the token
    // is still valid, so we restore STATE.user and pull data; otherwise
    // STATE.user stays null and the router renders the login wall.
    try {
        const res = await apiFetch('/api/user-status');
        const data = await res.json();
        if (data.logged_in) {
            STATE.user = data.user;
            await syncWithServer();
            await pullFromServer();
            fetchNotifications();
        } else {
            // No valid token — make sure we don't show stale STATE.user
            // (cached in localStorage from a previous session whose JWT
            // has now expired or been invalidated).
            STATE.user = null;
            clearAuthToken();
        }
    } catch (e) {}

    // Sanitize Day Numbers for legacy data
    if (STATE.tripDays) {
        const trips = [...new Set(STATE.tripDays.map(d => d.tripId))];
        trips.forEach(tId => {
            const days = STATE.tripDays.filter(d => d.tripId === tId).sort((a, b) => {
                // `!= null` (not `&&`) so Day 0 / Trip Genesis isn't treated
                // as "missing" — its dayNumber is legitimately 0, which is
                // falsy, and the falsy form would silently rewrite it.
                if (a.dayNumber != null && b.dayNumber != null) return a.dayNumber - b.dayNumber;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
            days.forEach((d, idx) => {
                if (d.dayNumber == null) d.dayNumber = idx + 1;
            });
        });
    }

    updateUserUI();
    updateNotificationUI();
    updateTripSelector();
    
    // Determine start page based on hash or default to home
    const startPage = resolvePage(window.location.hash.replace('#', '') || PAGES.HOME);
    navigate(startPage);
    
    initGoogleLogin();

    // Event Listeners for static elements
    const toggleSidebar = () => {
        document.getElementById('sidebar')?.classList.toggle('open');
        document.getElementById('sidebarOverlay')?.classList.toggle('open');
    };

    document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebarClose')?.addEventListener('click', toggleSidebar);

    const brand = document.querySelector('.nav-brand') as HTMLElement | null;
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => navigate(PAGES.HOME);
    }

    const bellBtn = document.getElementById('notificationBellBtn');
    const noteDropdown = document.getElementById('notificationDropdown');

    bellBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (noteDropdown) {
            const isHidden = noteDropdown.style.display === 'none' || !noteDropdown.style.display;
            noteDropdown.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                renderNotificationDropdown();
                markNotificationsRead(); // Mark all as read when opening the list
            }
        }
    });

    document.getElementById('newTripBtn')?.addEventListener('click', () => {
        openNewTripModal();
    });

    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => logout());
    document.getElementById('completeTripBtn')?.addEventListener('click', archiveActiveTrip);
    document.getElementById('deleteTripBtn')?.addEventListener('click', deleteActiveTrip);

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;

        // Notification item clicked — route to the page that lets the user
        // act on it. Checked before the outside-click close, since the click
        // is inside the dropdown and we want to dismiss it ourselves.
        const notifItem = target?.closest('[data-notification-index]') as HTMLElement | null;
        if (notifItem) {
            const idx = parseInt(notifItem.getAttribute('data-notification-index') ?? '', 10);
            const notif = (STATE.notifications || [])[idx];
            if (notif) handleNotificationClick(notif);
            return;
        }

        // Close notification dropdown if clicking outside
        if (noteDropdown && noteDropdown.style.display === 'flex' && !noteDropdown.contains(target) && target !== bellBtn) {
            noteDropdown.style.display = 'none';
        }

        // Navigation listener (delegated)
        const navLink = target?.closest('[data-page]');
        if (navLink) {
            e.preventDefault();
            const page = resolvePage(navLink.getAttribute('data-page') ?? PAGES.HOME);
            navigate(page);
            // Auto-close sidebar
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebarOverlay')?.classList.remove('open');
        }
    });

    setInterval(() => {
        if (STATE.user) {
            syncWithServer();
            fetchNotifications();
        }
    }, 15000);
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// PWA: register the service worker after the page has loaded so it doesn't
// race with first paint. Phase A stub — real caching strategies come in
// Phase L. Only runs in browsers that support SW (essentially all modern
// ones; the feature-check just keeps non-supporting environments quiet).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
            console.warn('[sw] registration failed', err);
        });
    });
}
