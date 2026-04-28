import { STATE, loadState, emit, subscribe } from './state.js';
import { syncWithServer, pullFromServer, fetchNotifications, markNotificationsRead, upsertTrip, deleteTrip, archiveTripOnServer, upsertExpense, deleteExpenseOnServer, syncCompanions, syncCategories, upsertDay } from './api.js';
import { COUNTRIES, US_STATES } from './constants.js';
import { showLiquidAlert, showConfirmModal, generateId } from './utils.js';
import { navigate } from './router.js';
import { updateUserUI } from './pages/profile.js';

// ── GLOBAL UTILITIES ──
// Only assigned to window if something actually calls them via window.X (typically
// inline HTML handlers like onclick="window.foo()", or module boundaries we haven't
// migrated to direct imports yet).
window.showLiquidAlert = showLiquidAlert;
window.navigate = navigate;
window.upsertDay = upsertDay;

// Global Google Client ID is now provided via index.html template from environment variables

// ── UI HELPERS ──

window.updateNotificationUI = function() {
    const badge = document.getElementById('notificationBadge');
    const unread = (STATE.notifications || []).filter(n => !n.is_read).length;
    if (badge) {
        badge.style.display = unread > 0 ? 'flex' : 'none';
        badge.textContent = unread > 9 ? '9+' : unread;
    }
}

window.renderNotificationDropdown = function() {
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

window.updateTripSelector = function() {
    const selector = document.getElementById('tripSelector');
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
        STATE.activeTripId = e.target.value;
        emit('state:changed');               // saveState + updateTripSelector via subscriber
        navigate('home');
    };
}

// UI subscriber: re-render the trip selector whenever state changes.
// Lives here (not in state.js) so the data layer doesn't reach into the UI.
subscribe('state:changed', () => window.updateTripSelector?.());

window.archiveActiveTrip = function() {
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;

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

window.deleteActiveTrip = () => {
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
                return new Date(a.date) - new Date(b.date);
            });
            days.forEach((d, idx) => {
                if (!d.dayNumber) d.dayNumber = idx + 1;
            });
        });
    }

    updateUserUI();
    window.updateNotificationUI();
    window.updateTripSelector();
    
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

    const brand = document.querySelector('.nav-brand');
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
                window.renderNotificationDropdown();
                markNotificationsRead(); // Mark all as read when opening the list
            }
        }
    });

    document.getElementById('newTripBtn')?.addEventListener('click', () => {
        window.openNewTripModal();
    });

    document.addEventListener('click', (e) => {
        // Close notification dropdown if clicking outside
        if (noteDropdown && noteDropdown.style.display === 'flex' && !noteDropdown.contains(e.target) && e.target !== bellBtn) {
            noteDropdown.style.display = 'none';
        }
        
        // Navigation listener (delegated)
        const navLink = e.target.closest('[data-page]');
        if (navLink) {
            e.preventDefault();
            const page = navLink.getAttribute('data-page');
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

// ── MODAL HELPERS ──

window.openNewTripModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    
    modal.innerHTML = `
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: 24px; width: 100%; position: relative;" id="newTripCountryContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripCountryInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search country..." autocomplete="off">
                        <div id="tripCountryList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${COUNTRIES.map(c => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 24px; width: 100%; position: relative; display: none;" id="newTripStateContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Select State</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripStateInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search state..." autocomplete="off">
                        <div id="tripStateList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${US_STATES.map(s => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${s}">${s}</div>`).join('')}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    const input = modal.querySelector('#tripCountryInput');
    const list = modal.querySelector('#tripCountryList');
    const items = list.querySelectorAll('.dropdown-item');
    input.onfocus = () => { list.style.display = 'block'; };
    input.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        items.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(val) ? 'block' : 'none'; });
        list.style.display = 'block';
    };
    
    const stateContainer = modal.querySelector('#newTripStateContainer');
    const stateInput = modal.querySelector('#tripStateInput');
    const stateList = modal.querySelector('#tripStateList');
    const stateItems = stateList.querySelectorAll('.dropdown-item');

    items.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const countryVal = item.getAttribute('data-value');
            input.value = countryVal;
            list.style.display = 'none';
            
            // Show state selector if USA
            if (countryVal === "United States (USA)") {
                stateContainer.style.display = 'block';
            } else {
                stateContainer.style.display = 'none';
                stateInput.value = '';
            }
        };
    });

    stateInput.onfocus = () => { stateList.style.display = 'block'; };
    stateInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        stateItems.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(val) ? 'block' : 'none'; });
        stateList.style.display = 'block';
    };
    stateItems.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            stateInput.value = item.getAttribute('data-value');
            stateList.style.display = 'none';
        };
    });
    modal.querySelector('#cancelTripBtn').onclick = () => modal.remove();
    modal.querySelector('#newTripForm').onsubmit = (e) => {
        e.preventDefault();
        const id = generateId();
        const name = modal.querySelector('#tripName').value;
        const country = modal.querySelector('#tripCountryInput').value;
        const state = modal.querySelector('#tripStateInput').value;
        
        let finalDestination = country;
        if (country === "United States (USA)" && state) {
            finalDestination = `USA - ${state}`;
        }
        
        const newTrip = { id, name, country: finalDestination, budget: 0, isArchived: false };
        
        STATE.trips.push(newTrip);
        STATE.activeTripId = id;

        emit('state:changed');               // saveState + updateTripSelector via subscriber
        upsertTrip(newTrip);                 // server delta still explicit

        modal.remove();
        navigate('home');
    };
};

window.openAddDayModal = () => {
    if (!STATE.activeTripId) {
        window.showLiquidAlert("Please create a trip before adding days.");
        return;
    }

    // Logic: Only require date for the first day, auto-increment for others
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === STATE.activeTripId).sort((a, b) => a.dayNumber - b.dayNumber);
    const nextDayNumber = tripDays.length + 1;
    let suggestedDate = '';

    if (tripDays.length > 0) {
        const lastDay = tripDays[tripDays.length - 1];
        if (lastDay.date) {
            const d = new Date(lastDay.date);
            d.setDate(d.getDate() + 1);
            suggestedDate = d.toISOString().split('T')[0];
        }
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    modal.innerHTML = `
        <div class="card glass" style="width: 400px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;">${nextDayNumber}</div>
                <h2 class="card-title" style="font-size: 1.8rem; margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Day</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Where are you going?</label>
                    <input type="text" id="dayName" class="glass-input" value="Day ${nextDayNumber}" placeholder="e.g. Exploring Rome" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required autofocus>
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Date ${suggestedDate ? '(Auto)' : ''}</label>
                    <input type="date" id="dayDate" class="glass-input" value="${suggestedDate}" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required>
                </div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Confirm</button>
                    <button type="button" id="cancelDayBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(0,0,0,0.05); color: #000000; font-weight: 600; border: none; font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cancelDayBtn').onclick = () => modal.remove();
    modal.querySelector('#addDayForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = generateId();
        const name = modal.querySelector('#dayName').value;
        const date = modal.querySelector('#dayDate').value;
        const newDay = { 
            id, 
            tripId: STATE.activeTripId, 
            name, 
            date, 
            dayNumber: nextDayNumber,
            photos: [], 
            notes: '', 
            plan: { morning:'', afternoon:'', evening:'' } 
        };
        STATE.tripDays.push(newDay);

        emit('state:changed');               // saveState via subscriber
        if (window.upsertDay) await window.upsertDay(newDay);  // server delta still explicit
        modal.remove();
        navigate('home');
    };
};

window.openEditExpenseModal = (id) => {
    const e = STATE.expenses.find(exp => exp.id === id);
    if (!e) return;
    STATE.draftExpense = { ...e };
    STATE.activeTripId = e.tripId;

    emit('state:changed');               // saveState via subscriber
    navigate('expenses');
};

window.deleteExpense = (id) => {
    showConfirmModal({
        title: "Delete Expense?",
        message: "This action cannot be undone.",
        confirmText: "Delete",
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter(e => e.id !== id);

            emit('state:changed');               // saveState via subscriber
            deleteExpenseOnServer(id);           // server delta still explicit
            navigate('expenses');
        }
    });
};

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
