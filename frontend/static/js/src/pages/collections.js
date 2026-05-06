// @ts-check
import { STATE, emit } from '../state.js';
import { showConfirmModal, formatHome, esc } from '../utils.js';
import { navigate } from '../router.js';
import { apiUrl } from '../api.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';
import { openDayView } from './home.js';

export function renderCollections() {
    const div = document.createElement('div');
    // Login wall handled at the router boundary.
    const archived = STATE.archivedTrips || [];
    const activeTrips = STATE.trips || [];

    // Per-user-archive UX hint. The most common confusion is "my friend
    // marked this trip complete, why isn't it in my Collections?" —
    // archive is per-user (trip_members.is_archived), so the friend's
    // copy doesn't move when the owner archives theirs. If the user has
    // any active trips, surface a tiny banner that explains how to move
    // one here, and lists what they currently have active.
    const stillActiveHint = activeTrips.length > 0 ? `
        <div style="margin-top: 16px; background: rgba(0,113,227,0.06); border: 1px solid rgba(0,113,227,0.18); border-radius: 16px; padding: 14px 18px; display:flex; gap:12px; align-items:flex-start;">
            <span style="font-size:1.4rem; line-height:1;">💡</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:800; color:#002d5b; margin-bottom:4px;">Looking for a trip a friend already finished?</div>
                <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45;">
                    Trips become "completed" per-person — your friend marking it done doesn't move it for you.
                    You still have ${activeTrips.length === 1 ? 'one trip' : `${activeTrips.length} trips`} active:
                    ${activeTrips.map(t => `<button type="button" class="goto-active-trip-btn" data-trip-id="${esc(t.id)}" style="background: rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color: var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.75rem; font-weight:700; margin: 0 4px 4px 0; cursor:pointer;">${esc(t.name)}</button>`).join('')}
                    Open one and tap <strong>Mark Complete</strong> to move it here.
                </div>
            </div>
        </div>
    ` : '';

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>

        ${stillActiveHint}

        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? archived.map(t => `
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div class="archived-trip-card" data-trip-id="${t.id}" role="button" tabindex="0" aria-label="Open ${t.name} details" style="cursor: pointer; flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${t.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${t.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(t.expenses || []).filter(e => !e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: ${formatHome((t.expenses || []).filter(e => !e.isSettlement).reduce((sum, e) => sum + (e.euroValue || 0), 0), 'EUR')}</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${t.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic ? '#34c759' : 'rgba(0,0,0,0.3)'}; text-shadow: ${t.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${t.isPublic ? 'Public' : 'Not public'}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${t.id}" ${t.isPublic ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: var(--space-2);">
                                <button class="btn-primary restore-trip-btn" data-trip-id="${t.id}" style="padding: var(--space-2) var(--space-4); font-size: var(--font-sm);">Restore</button>
                                <button class="icon-action-btn delete-archived-btn" data-trip-id="${t.id}" style="--accent: 255,59,48;" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('') : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p class="text-muted">Your travel history will appear here once you complete a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `;

    div.querySelector('#collectionsLoginBtn')?.addEventListener('click', () => navigate('profile'));

    // Delegated handlers for the per-trip cards in the archived list.
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;
        const restoreBtn = /** @type {HTMLElement | null} */ (target.closest('.restore-trip-btn'));
        if (restoreBtn?.dataset.tripId) { restoreTrip(restoreBtn.dataset.tripId); return; }
        const delBtn = /** @type {HTMLElement | null} */ (target.closest('.delete-archived-btn'));
        if (delBtn?.dataset.tripId) { deleteArchivedTrip(delBtn.dataset.tripId); return; }
        // Hint banner — clicking an active-trip pill switches to it on Home.
        const gotoBtn = /** @type {HTMLElement | null} */ (target.closest('.goto-active-trip-btn'));
        if (gotoBtn?.dataset.tripId) {
            STATE.activeTripId = gotoBtn.dataset.tripId;
            emit('state:changed');
            navigate('home');
            return;
        }
        const card = /** @type {HTMLElement | null} */ (target.closest('.archived-trip-card'));
        if (card?.dataset.tripId) { viewArchivedDetails(card.dataset.tripId); return; }
    });
    div.addEventListener('change', (e) => {
        const toggle = /** @type {HTMLInputElement | null} */ (
            /** @type {HTMLElement | null} */ (e.target)?.closest('.trip-privacy-toggle')
        );
        if (toggle?.dataset.tripId) toggleTripPrivacy(toggle.dataset.tripId, toggle.checked);
    });
    wireRoleButtonKeys(div);

    return div;
}

export function renderArchivedTripDetail(tripId) {
    const trip = STATE.archivedTrips.find(t => t.id === tripId);
    const div = document.createElement('div');
    if (!trip) {
        div.innerHTML = `<p style="padding: 40px; text-align: center;">Trip not found.</p>`;
        return div;
    }

    // ── Trip stats roll-up ───────────────────────────────────────────
    // Counts pull from BOTH the legacy day-level arrays AND the new
    // trip-level stores (trip.photos, trip.documents) added with the
    // Documents/Photos tabs on Home. Archive carries the trip object
    // intact, so trip.photos / trip.documents survive without any
    // migration on this side.
    const expenses = (trip.expenses || []).filter(e => !e.isSettlement);
    const totalSpent = expenses.reduce((sum, e) => sum + (e.euroValue || 0), 0);
    const tripDays = (trip.tripDays || []);
    const dayCount = tripDays.length;
    const tripPhotos = Array.isArray(trip.photos) ? trip.photos : [];
    const tripDocs = Array.isArray(trip.documents) ? trip.documents : [];
    const totalPhotos =
        tripDays.reduce((n, d) => n + ((d.photos || []).length), 0)
        + tripPhotos.length;
    const totalDocs =
        tripDays.reduce((n, d) => n + ((d.tickets || []).length), 0)
        + tripDocs.length;

    // First photo (used as the hero background and a fallback for any
    // day that doesn't carry its own photo). Try the trip-level store
    // first (where new uploads land) and fall back to legacy day photos.
    let firstPhoto = null;
    if (tripPhotos.length > 0) firstPhoto = tripPhotos[0].src;
    if (!firstPhoto) {
        for (const day of tripDays) {
            if (day.photos && day.photos.length > 0) { firstPhoto = day.photos[0]; break; }
        }
    }

    // ── Hero card ────────────────────────────────────────────────────
    // Glass card with a photo background when available, falling back
    // to a clean blue/purple gradient. The "Memories of" caption +
    // 4rem white title in the previous incarnation was a holdover from
    // the old design language; this one matches the rest of the app —
    // gradient-text title, action pills (Restore / Back) in the
    // top-right, and a row of stat chips (Days / Photos / Spent) under
    // the title. Public toggle is a chip in the same row, consistent
    // with how the Collections list card displays it.
    const heroBg = firstPhoto
        ? `background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${esc(firstPhoto)}) center/cover no-repeat;`
        : `background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`;
    const heroTextColor = '#ffffff';
    const heroSecondary = 'rgba(255,255,255,0.85)';
    const chipBg = 'rgba(255,255,255,0.16)';
    const chipBorder = '1px solid rgba(255,255,255,0.25)';

    const statChip = (icon, label, value) => `
        <div style="display:flex; align-items:center; gap:10px; background:${chipBg}; border:${chipBorder}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${icon}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${heroSecondary};">${esc(label)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${heroTextColor};">${esc(value)}</span>
            </div>
        </div>
    `;

    div.innerHTML = `
        <div class="archived-hero" style="position:relative; overflow:hidden; border-radius:36px; padding:48px 52px; ${heroBg} box-shadow: 0 30px 80px rgba(0, 45, 91, 0.25); margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.18);">
            <!-- Subtle inner light wash, lifts the photo bg and keeps
                 readability when the photo is bright. -->
            <div style="position:absolute; inset:0; background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 55%); pointer-events:none;"></div>

            <!-- Action pills float top-right; outline pill (Back) and
                 solid pill (Restore Trip), matching .btn-primary-pill. -->
            <div style="position:absolute; top:24px; right:24px; display:flex; gap:8px; z-index:2;">
                <button id="backToCollectionsBtn" type="button" style="background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">← Back</button>
                <button class="restore-trip-btn" data-trip-id="${esc(trip.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">↺ Restore Trip</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${chipBg}; border:${chipBorder}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${heroTextColor};">Completed memory</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${heroTextColor}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${esc(trip.name)}</h1>
                ${trip.country ? `<div style="margin-top:10px; font-size:1rem; color:${heroSecondary}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${esc(trip.country)}</div>` : ''}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${statChip('🗓️', 'Days', String(dayCount))}
                ${totalPhotos > 0 ? statChip('📸', 'Photos', String(totalPhotos)) : ''}
                ${totalDocs > 0 ? statChip('📎', 'Documents', String(totalDocs)) : ''}
                ${expenses.length > 0 ? statChip('💰', 'Spent', formatHome(totalSpent, 'EUR')) : ''}

                <!-- Public/private toggle, styled as one of the chips. -->
                <div style="display:flex; align-items:center; gap:12px; background:${chipBg}; border:${chipBorder}; padding:8px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <span id="publicLabel-${esc(trip.id)}" style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${trip.isPublic ? '#a4f3b8' : 'rgba(255,255,255,0.7)'};">${trip.isPublic ? 'Public' : 'Private'}</span>
                    <label class="switch" style="transform: scale(0.7); margin: 0;">
                        <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${esc(trip.id)}" ${trip.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">The journey</h2>
            <span style="color: var(--text-secondary); font-size:0.85rem; font-weight:600;">Tap a day to relive what was planned.</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${tripDays.sort((a, b) => a.dayNumber - b.dayNumber).map(day => {
                // Per-day media counts: legacy day-level arrays + any
                // trip-level entries this day was tagged with via the
                // Documents/Photos tabs.
                const dayPhotosFromDay = day.photos || [];
                const dayPhotosFromTrip = tripPhotos.filter(p => p.dayId === day.id);
                const totalDayPhotos = dayPhotosFromDay.length + dayPhotosFromTrip.length;
                const dayDocsFromDay = day.tickets || [];
                const dayDocsFromTrip = tripDocs.filter(d => d.dayId === day.id);
                const totalDayDocs = dayDocsFromDay.length + dayDocsFromTrip.length;
                const isStartingPoint = Number(day.dayNumber) === 0;
                const photoBg = dayPhotosFromDay[0]
                    || dayPhotosFromTrip[0]?.src
                    || (isStartingPoint ? null : firstPhoto);
                const hasBg = !!photoBg;
                return `
                    <div class="archived-day-block" data-day-id="${esc(day.id)}" role="button" tabindex="0" aria-label="View Day ${day.dayNumber}${day.name ? ' — ' + day.name : ''}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${hasBg ? `background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${esc(photoBg)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;` : `background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background: ${isStartingPoint ? 'rgba(52,199,89,0.95)' : 'rgba(0,113,227,0.95)'}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${isStartingPoint ? '⭐ Genesis' : `Day ${day.dayNumber}`}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${hasBg ? '#ffffff' : '#002d5b'}; line-height:1.15; ${hasBg ? 'text-shadow: 0 2px 12px rgba(0,0,0,0.4);' : ''}">${esc(day.name || (isStartingPoint ? 'Trip Genesis' : `Day ${day.dayNumber}`))}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${totalDayPhotos > 0 ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(0,113,227,0.08)'}; color:${hasBg ? '#ffffff' : 'var(--accent-blue)'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${totalDayPhotos}</span>` : ''}
                                ${totalDayDocs > 0 ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(88,86,214,0.08)'}; color:${hasBg ? '#ffffff' : '#5856d6'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${totalDayDocs}</span>` : ''}
                                ${day.notes ? `<span style="background:${hasBg ? 'rgba(255,255,255,0.18)' : 'rgba(255,149,0,0.08)'}; color:${hasBg ? '#ffffff' : '#ff9500'}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📝 Notes</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    div.querySelector('#backToCollectionsBtn')?.addEventListener('click', () => navigate('collections'));
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        const restoreBtn = /** @type {HTMLElement | null} */ (target?.closest('.restore-trip-btn'));
        if (restoreBtn?.dataset.tripId) { restoreTrip(restoreBtn.dataset.tripId); return; }
        // Click a day-block to open its read-only detail view. Days inside
        // an archived trip live on `trip.tripDays`, not in STATE.tripDays
        // (the restore flow at restoreTrip() splats them back into the
        // global list), so we look them up off the trip object directly.
        const dayBlock = /** @type {HTMLElement | null} */ (target?.closest('.archived-day-block'));
        if (dayBlock?.dataset.dayId) {
            const day = (trip.tripDays || []).find(d => d.id === dayBlock.dataset.dayId);
            if (day) openDayView(day);
            return;
        }
    });
    div.addEventListener('change', (e) => {
        const toggle = /** @type {HTMLInputElement | null} */ (
            /** @type {HTMLElement | null} */ (e.target)?.closest('.trip-privacy-toggle')
        );
        if (toggle?.dataset.tripId) toggleTripPrivacy(toggle.dataset.tripId, toggle.checked);
    });

    return div;
}

// Exported because profile.js (archived-trips section) also opens these.
export const viewArchivedDetails = (id) => {
    const content = document.getElementById('app-container');
    if (!content) return;
    content.innerHTML = '';
    content.appendChild(renderArchivedTripDetail(id));
};

const toggleTripPrivacy = async (id, isPublic) => {
    const trip = STATE.archivedTrips.find(t => t.id === id) || STATE.trips.find(t => t.id === id);
    if (!trip) return;
    trip.isPublic = isPublic;
    emit('state:changed');
    
    const label = document.getElementById(`publicLabel-${id}`);
    if (label) {
        label.textContent = isPublic ? 'Public' : 'Not public';
        label.style.color = isPublic ? '#34c759' : 'rgba(0,0,0,0.3)';
        label.style.textShadow = isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none';
    }

    if (STATE.user) {
        try {
            await fetch(apiUrl('/api/trips/privacy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, trip_id: id, is_public: isPublic })
            });
        } catch (e) {}
    }
};

const restoreTrip = (id) => {
    const trip = STATE.archivedTrips.find(t => t.id === id);
    if (!trip) return;
    
    showConfirmModal({
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
            emit('state:changed');
            navigate('home');
        }
    });
};

const deleteArchivedTrip = (id) => {
    showConfirmModal({
        title: "Delete Permanently?",
        message: "This trip and all its memories will be gone forever.",
        confirmText: "Delete",
        onConfirm: async () => {
            STATE.archivedTrips = STATE.archivedTrips.filter(t => t.id !== id);
            emit('state:changed');
            if (STATE.user) {
                try {
                    await fetch(apiUrl('/api/trips/delete'), {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: STATE.user.id, trip_id: id })
                    });
                } catch (e) {}
            }
            navigate('collections');
        }
    });
};
