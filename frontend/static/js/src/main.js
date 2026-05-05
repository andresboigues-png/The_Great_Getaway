// @ts-check
import { STATE, loadState, emit, subscribe } from './state.js';
import { syncWithServer, pullFromServer, fetchNotifications, markNotificationsRead, deleteTrip, archiveTripOnServer, apiUrl } from './api.js';
import { showConfirmModal, esc } from './utils.js';
import { navigate } from './router.js';
import { PAGES } from './constants.js';
import { addCompanion } from './companions.js';

/**
 * Narrow an arbitrary string (from the URL hash or a `data-page` attribute)
 * down to a known PageName, falling back to home for unknown values. Keeps
 * the typed `navigate()` signature honest at the boundary where strings come
 * from outside the app.
 * @param {string} raw
 * @returns {import('./constants.js').PageName}
 */
function resolvePage(raw) {
    const known = /** @type {string[]} */ (Object.values(PAGES));
    return /** @type {import('./constants.js').PageName} */ (
        known.includes(raw) ? raw : PAGES.HOME
    );
}
import { updateUserUI, logout } from './pages/profile.js';
import { openNewTripModal, openCompanionLinkResponseModal, openTripInviteResponseModal } from './modals.js';

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
        case 'companion_link_invite': return '175,82,222';   // purple — invite
        case 'companion_link_accepted': return '52,199,89';  // green — accepted
        case 'companion_link_declined': return '142,142,147'; // grey — neutral close
        case 'trip_invite': return '175,82,222';
        case 'trip_invite_accepted': return '52,199,89';
        case 'trip_invite_declined': return '142,142,147';
        case 'trip_member_removed': return '255,59,48';
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
        case 'companion_link_invite': return 'Companion link request';
        case 'companion_link_accepted': return 'Companion linked';
        case 'companion_link_declined': return 'Companion link declined';
        case 'trip_invite': return 'Trip invitation';
        case 'trip_invite_accepted': return 'Trip invite update';
        case 'trip_invite_declined': return 'Trip invite update';
        case 'trip_member_removed': return 'Removed from trip';
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
            <div class="notification-item__time">${new Date(n.created_at).toLocaleDateString()}</div>
        </div>
    `).join('');
}

/** Route a clicked notification to the page that lets the user act on it.
 *  `related_id` is a user_id for friend_* / trip_public / companion_link_*;
 *  for everything else we fall back to the home page. */
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
        case 'companion_link_invite':
            // Open the accept/decline modal directly from wherever the user
            // happens to be — the response is a one-tap decision and doesn't
            // need a full page navigation.
            openCompanionLinkResponseModal(notification);
            break;
        case 'companion_link_accepted':
        case 'companion_link_declined':
            // Outcome notifications — just route to the personalization
            // companions tab so the user sees the updated state.
            navigate(PAGES.PERSONALIZATION);
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

    // Show/hide management buttons if a trip is selected
    const hasActive = !!STATE.activeTripId;
    if (completeBtn) completeBtn.style.display = hasActive ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = hasActive ? 'flex' : 'none';

    selector.onchange = (e) => {
        STATE.activeTripId = /** @type {HTMLSelectElement} */ (e.target).value;
        emit('state:changed');               // saveState + updateTripSelector via subscriber
        navigate('home');
    };
}

// UI subscribers — kept here (not in state.js) so the data layer doesn't reach
// into the UI. api.js emits 'notifications:changed' from the fetch helpers.
subscribe('state:changed', updateTripSelector);
subscribe('notifications:changed', updateNotificationUI);

function archiveActiveTrip() {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;

    // Archived trips live in the user's collections on the server. Without a
    // logged-in user, the archive would attach to whichever profile signs in
    // next — silently polluting their collection. Block at the boundary.
    if (!STATE.user) {
        showConfirmModal({
            title: "Log In to Archive",
            message: "Archived trips live in your profile's collections, so you need to be logged in to archive a trip.",
            confirmText: "Log In",
            confirmColor: "#0071e3",
            onConfirm: () => navigate('profile')
        });
        return;
    }

    showConfirmModal({
        title: "Archive Trip?",
        message: "This will move the trip to your collections and lock editing.",
        confirmText: "Archive",
        onConfirm: () => {
            trip.isArchived = true;
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
            const isFirstLogin = !STATE.hasLoggedInBefore;
            STATE.user = data.user;
            STATE.hasLoggedInBefore = true;

            // Auto-create a companion for the user on first login
            if (isFirstLogin && data.user?.name) {
                const firstName = data.user.name.split(' ')[0];
                addCompanion(firstName);
            }

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

function initGoogleLogin() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: window.globalGoogleClientId,
            callback: handleGoogleLogin
        });
        const container = document.getElementById("googleBtnContainer");
        if (container) {
            google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill" });
        }
    }
}

// ── INITIALIZATION ──

async function init() {
    loadState();
    
    // Check session
    try {
        const res = await fetch(apiUrl('/api/user-status'));
        const data = await res.json();
        if (data.logged_in) {
            STATE.user = data.user;
            await syncWithServer();
            await pullFromServer();
            fetchNotifications();
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

    const brand = /** @type {HTMLElement | null} */ (document.querySelector('.nav-brand'));
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.onclick = () => navigate('home');
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
        const target = /** @type {HTMLElement | null} */ (e.target);

        // Notification item clicked — route to the page that lets the user
        // act on it. Checked before the outside-click close, since the click
        // is inside the dropdown and we want to dismiss it ourselves.
        const notifItem = /** @type {HTMLElement | null} */ (target?.closest('[data-notification-index]'));
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
