// @ts-check
import { STATE, loadState, emit, subscribe } from './state.js';
import { syncWithServer, pullFromServer, fetchNotifications, markNotificationsRead, deleteTrip, archiveTripOnServer } from './api.js';
import { showConfirmModal } from './utils.js';
import { navigate } from './router.js';
import { updateUserUI, logout } from './pages/profile.js';
import { openNewTripModal } from './modals.js';

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

function renderNotificationDropdown() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    const notes = STATE.notifications || [];
    if (notes.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.9rem;">No notifications.</div>';
        return;
    }

    list.innerHTML = notes.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px; color:${n.type === 'alert' ? '#ff3b30' : 'var(--accent-blue)'}">${n.title || (n.type === 'friend_request' ? 'Friend Request' : n.type === 'accepted_request' ? 'Request Accepted' : 'Notification')}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${n.message}</div>
            <div style="font-size:0.7rem; color:rgba(0,0,0,0.3); margin-top:8px; font-weight:600;">${new Date(n.created_at).toLocaleDateString()}</div>
        </div>
    `).join('');
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
        <option value="${t.id}" ${t.id === STATE.activeTripId ? 'selected' : ''}>${t.name}</option>
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
        const res = await fetch('/api/auth/google', {
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
                if (!STATE.groups.includes(firstName)) {
                    STATE.groups.push(firstName);
                }
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
        const res = await fetch('/api/user-status');
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
                if (a.dayNumber && b.dayNumber) return a.dayNumber - b.dayNumber;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });
            days.forEach((d, idx) => {
                if (!d.dayNumber) d.dayNumber = idx + 1;
            });
        });
    }

    updateUserUI();
    updateNotificationUI();
    updateTripSelector();
    
    // Determine start page based on hash or default to home
    const startPage = window.location.hash.replace('#', '') || 'home';
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
        // Close notification dropdown if clicking outside
        if (noteDropdown && noteDropdown.style.display === 'flex' && !noteDropdown.contains(target) && target !== bellBtn) {
            noteDropdown.style.display = 'none';
        }

        // Navigation listener (delegated)
        const navLink = target?.closest('[data-page]');
        if (navLink) {
            e.preventDefault();
            const page = navLink.getAttribute('data-page') ?? 'home';
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
