import { STATE, saveState } from '../state.js';

export function renderCollections() {
    const div = document.createElement('div');

    if (!STATE.user) {
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
                <p>Log in to view and manage your completed trips.</p>
            </div>
            <div class="card glass" style="text-align: center; padding: 60px; margin-top: 24px;">
                <h2 style="margin-bottom: 20px;">Private Collections</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Your completed trips are safely attached to your account. Log in to access your travel history.</p>
                <button class="btn" style="background: var(--accent-blue);" onclick="window.navigate('profile')">Log In Now</button>
            </div>
        `;
        return div;
    }

    const archived = STATE.archivedTrips || [];

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? archived.map(t => `
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div style="cursor: pointer; flex: 1;" onclick="window.viewArchivedDetails('${t.id}')">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${t.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${t.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(t.expenses || []).filter(e => !e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: €${(t.expenses || []).filter(e => !e.isSettlement).reduce((sum, e) => sum + (e.euroValue || 0), 0).toFixed(2)}</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${t.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic ? '#34c759' : 'rgba(0,0,0,0.3)'}; text-shadow: ${t.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${t.isPublic ? 'Public' : 'Not public'}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" ${t.isPublic ? 'checked' : ''} onchange="window.toggleTripPrivacy('${t.id}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-small" onclick="window.restoreTrip('${t.id}')" style="background: var(--accent-blue); padding: 8px 16px; font-weight: 700;">Restore</button>
                                <button class="btn btn-small" onclick="window.deleteArchivedTrip('${t.id}')" style="background: rgba(255,59,48,0.1); color: #ff3b30; border: 1px solid rgba(255,59,48,0.3);" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('') : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p style="color: var(--text-secondary);">Your travel history will appear here once you complete a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `;

    return div;
}

export function renderArchivedTripDetail(tripId) {
    const trip = STATE.archivedTrips.find(t => t.id === tripId);
    const div = document.createElement('div');
    if (!trip) {
        div.innerHTML = `<p style="padding: 40px; text-align: center;">Trip not found.</p>`;
        return div;
    }

    let totalSpent = 0;
    (trip.expenses || []).filter(e => !e.isSettlement).forEach(e => totalSpent += parseFloat(e.euroValue || 0));

    let firstPhoto = null;
    if (trip.tripDays) {
        for (const day of trip.tripDays) {
            if (day.photos && day.photos.length > 0) {
                firstPhoto = day.photos[0];
                break;
            }
        }
    }

    div.innerHTML = `
        <div class="trip-banner" style="${firstPhoto ? `background: linear-gradient(rgba(0,45,91,0.6), rgba(0,45,91,0.8)), url(${firstPhoto}) center/cover no-repeat; border: none;` : `background: rgba(255,255,255,0.9); border: 1.5px solid var(--accent-blue);`}">
            <div style="font-size: 0.9rem; color: ${firstPhoto ? 'rgba(255,255,255,0.7)' : 'rgba(0, 45, 91, 0.5)'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.25em; margin-bottom: 12px;">Memories of</div>
            <h1 class="trip-banner-title" style="font-size: 4rem; margin: 0; letter-spacing: -0.06em; color: ${firstPhoto ? '#ffffff' : 'var(--accent-blue)'}; font-weight: 800; line-height: 0.95;">${trip.name}</h1>
            <div style="display: flex; align-items: center; gap: 32px; margin-top: 20px; color: ${firstPhoto ? 'rgba(255,255,255,0.9)' : '#1a3a5f'}; font-weight: 700;">
                <span style="display: flex; align-items: center; gap: 8px;">${trip.country}</span>
                
                <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(20px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.1);">
                    <span id="publicLabel-${trip.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${trip.isPublic ? '#34c759' : '#a1a1aa'}; text-shadow: ${trip.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${trip.isPublic ? 'Public' : 'Not public'}</span>
                    <label class="switch" style="transform: scale(0.75);">
                        <input type="checkbox" ${trip.isPublic ? 'checked' : ''} onchange="window.toggleTripPrivacy('${trip.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <span style="display: flex; align-items: center; gap: 8px;">${trip.tripDays?.length || 0} Days</span>
                <span style="display: flex; align-items: center; gap: 8px;">€${totalSpent.toFixed(0)} spent</span>
            </div>
            <div style="position: absolute; right: 40px; bottom: 40px; display: flex; gap: 12px;">
                <button class="btn" style="background: #002d5b; color: #ffffff; padding: 12px 24px; border-radius: 16px; font-weight: 800;" onclick="window.restoreTrip('${trip.id}')">Restore Trip</button>
                <button class="btn" style="background: rgba(0,0,0,0.05); color: #002d5b; padding: 12px 24px; border-radius: 16px; font-weight: 800; border: 1px solid rgba(0,0,0,0.1);" onclick="window.navigate('collections')">Back</button>
            </div>
        </div>

        <div class="day-blocks-grid">
            ${(trip.tripDays || []).sort((a, b) => a.dayNumber - b.dayNumber).map(day => {
        const dayPhotos = day.photos || [];
        const dayDocs = day.tickets || [];

        return `
                    <div class="day-block" style="${dayPhotos.length > 0 ? `background: linear-gradient(rgba(0,45,91,0.7), rgba(0,45,91,0.85)), url(${dayPhotos[0]}) center/cover no-repeat; border: none;` : ''}">
                        <div class="day-block-header">
                            <span class="day-block-number" style="color: ${dayPhotos.length > 0 ? '#4da3ff' : '#007aff'};">Day ${day.dayNumber}</span>
                        </div>
                        <h3 class="day-block-name" style="color: ${dayPhotos.length > 0 ? '#ffffff' : 'var(--accent-blue)'}; font-size: 1.6rem; font-weight: 800;">${day.name || `Day ${day.dayNumber}`}</h3>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    return div;
}

window.viewArchivedDetails = (id) => {
    const content = document.getElementById('app-container');
    content.innerHTML = '';
    content.appendChild(renderArchivedTripDetail(id));
};

window.toggleTripPrivacy = async (id, isPublic) => {
    const trip = STATE.archivedTrips.find(t => t.id === id) || STATE.trips.find(t => t.id === id);
    if (!trip) return;
    trip.isPublic = isPublic;
    saveState();
    
    const label = document.getElementById(`publicLabel-${id}`);
    if (label) {
        label.textContent = isPublic ? 'Public' : 'Not public';
        label.style.color = isPublic ? '#34c759' : 'rgba(0,0,0,0.3)';
        label.style.textShadow = isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none';
    }

    if (STATE.user) {
        try {
            await fetch('/api/trips/privacy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, trip_id: id, is_public: isPublic })
            });
        } catch (e) {}
    }
};

window.restoreTrip = (id) => {
    const trip = STATE.archivedTrips.find(t => t.id === id);
    if (!trip) return;
    
    window.showConfirmModal({
        title: "Restore Trip?",
        message: "This will move the trip back to your active list.",
        confirmText: "Restore",
        onConfirm: () => {
            trip.isArchived = false;
            
            // Restore expenses and days to global lists
            if (trip.expenses) {
                STATE.expenses = [...STATE.expenses, ...trip.expenses];
                delete trip.expenses;
            }
            if (trip.tripDays) {
                STATE.tripDays = [...STATE.tripDays, ...trip.tripDays];
                delete trip.tripDays;
            }
            
            STATE.trips.push(trip);
            STATE.archivedTrips = STATE.archivedTrips.filter(t => t.id !== id);
            STATE.activeTripId = id;
            saveState();
            window.navigate('home');
        }
    });
};

window.deleteArchivedTrip = (id) => {
    window.showConfirmModal({
        title: "Delete Permanently?",
        message: "This trip and all its memories will be gone forever.",
        confirmText: "Delete",
        onConfirm: async () => {
            STATE.archivedTrips = STATE.archivedTrips.filter(t => t.id !== id);
            saveState();
            if (STATE.user) {
                try {
                    await fetch('/api/trips/delete', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: STATE.user.id, trip_id: id })
                    });
                } catch (e) {}
            }
            window.navigate('collections');
        }
    });
};
