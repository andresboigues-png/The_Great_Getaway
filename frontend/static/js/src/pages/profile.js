// @ts-check
import { STATE, emit } from '../state.js';
import { syncWithServer, apiUrl, apiFetch, clearAuthToken } from '../api.js';
import { showLiquidAlert, getHomeCurrency, esc } from '../utils.js';
import { CONVERSION_RATES, CURRENCY_SYMBOLS } from '../constants.js';
import { navigate } from '../router.js';
import { viewArchivedDetails } from './collections.js';
import { showModal } from '../components/Modal.js';

export const logout = async () => {
    try {
        // Final push of any unsynced local changes before we wipe local state
        // and invalidate the session. Wrapped separately so a sync failure
        // doesn't block the rest of logout.
        try { await syncWithServer(); }
        catch (e) { console.error('Final sync before logout failed:', e); }

        // The server has no /api/logout endpoint anymore — JWTs are
        // self-contained, so dropping the local token is enough to
        // invalidate the client side. (A real revocation list could
        // come later; not needed for single-user usage.)
        clearAuthToken();

        // Clear everything tied to the logged-out user. Server still holds
        // the authoritative copy — re-login will pull it back via pullFromServer.
        STATE.user = null;
        STATE.activeTripId = null;
        STATE.trips = [];
        STATE.archivedTrips = [];
        STATE.expenses = [];
        STATE.tripDays = [];
        STATE.budgets = [];
        STATE.activities = [];
        STATE.photos = [];
        STATE.notifications = [];
        STATE.savedFormats = [];
        STATE.profilePhoto = null;
        STATE.draftExpense = {
            who: '', categoryId: '', label: '', date: '',
            country: '', value: '', currency: 'EUR', euroValue: ''
        };
        // Kept intentionally:
        // - hasLoggedInBefore (controls "Welcome back" vs "Log in" copy)
        // - categories, excelMapping (defaults shared by anonymous + logged-in)
        // - rateCache (currency rates aren't user-specific)

        emit('state:changed');
        updateUserUI();
        navigate('profile');
    } catch (e) {}
};

/** App-wide login wall — rendered by the router for every route while
 *  `STATE.user` is null. Lifts the previous "Log In" markup out of the
 *  Profile page so the same surface shows up everywhere a logged-out user
 *  tries to land, instead of half the pages working anonymously and the
 *  other half rendering ad-hoc Login-Required cards. */
export function renderLoginWall() {
    const div = document.createElement('div');
    const isReturning = STATE.hasLoggedInBefore;
    div.innerHTML = `
        <div class="login-wall">
            <div class="login-wall__inner">
                <h1 class="login-wall__title" style="background: linear-gradient(135deg, #0071e3 0%, #ff9500 50%, #34c759 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">The Great Getaway</h1>
                <p class="login-wall__subtitle">${isReturning ? 'Welcome back. Sign in to pick up where you left off.' : 'Plan trips, split expenses, and bring friends along — all synced across devices.'}</p>

                <div class="login-wall__features">
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">🗺️</span>
                        <div><strong>Trips &amp; days</strong><span>Plan and journal each day of your journey.</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">💸</span>
                        <div><strong>Shared expenses</strong><span>Split costs and settle up cleanly.</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">👥</span>
                        <div><strong>Friends &amp; companions</strong><span>Invite people to plan along with you.</span></div>
                    </div>
                </div>

                <div class="card glass login-wall__card">
                    <h2 class="login-wall__card-title">${isReturning ? 'Sign back in' : 'Create your account with Google'}</h2>
                    <div id="loginWallBtnContainer" class="login-wall__btn-container"></div>
                    <p class="login-wall__fineprint">Your data is tied to your Google account and synced server-side; signing out clears the local copy.</p>
                </div>
            </div>
        </div>
    `;

    // Google's button renderer needs a real DOM target, so do it after the
    // wall is mounted. Retries briefly if the GIS script hasn't loaded yet.
    // We also (re-)call initialize here to wire the callback in case
    // main.js's initGoogleLogin hadn't reached its own retry yet — calling
    // initialize multiple times is safe (it's a configuration call) and
    // guarantees the button has a working callback the moment it renders.
    const renderButton = () => {
        const target = div.querySelector('#loginWallBtnContainer');
        if (!target) return;
        if (window.google && window.google.accounts && window.globalGoogleClientId) {
            target.innerHTML = '';
            window.google.accounts.id.initialize({
                client_id: window.globalGoogleClientId,
                callback: window.handleGoogleLogin || (() => {}),
            });
            window.google.accounts.id.renderButton(
                target,
                { theme: 'outline', size: 'large', width: 280, shape: 'pill' }
            );
            return;
        }
        // GIS script still loading — try again shortly.
        setTimeout(renderButton, 250);
    };
    setTimeout(renderButton, 0);

    return div;
}

/** Pop a modal listing the caller's accepted friends — each row is a
 *  click target that closes the modal and navigates to that friend's
 *  public profile page. Mirrors the avatar-+-name+-email row pattern
 *  from the Friends page so the two surfaces feel like one thing.
 *  @param {{id:string,name:string,email:string,picture?:string}[]} friends
 */
function openFriendsListModal(friends) {
    const rowHtml = (f) => {
        const initial = (f.name || f.email || '?').charAt(0).toUpperCase();
        const avatar = f.picture
            ? `<img src="${esc(f.picture)}" alt="" style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
            : `<div style="width:40px; height:40px; border-radius:50%; background: linear-gradient(135deg,#007aff,#5856d6); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1rem; flex-shrink:0;">${esc(initial)}</div>`;
        return `
            <button type="button" class="profile-friend-row" data-user-id="${esc(f.id)}"
                style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:transparent; border:0; border-radius:12px; cursor:pointer; width:100%; text-align:left; transition: background 0.15s;"
                onmouseover="this.style.background='rgba(0,113,227,0.06)'" onmouseout="this.style.background='transparent'">
                ${avatar}
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:#002d5b; font-size:0.95rem; line-height:1.2;">${esc(f.name || 'Friend')}</div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(f.email || '')}</div>
                </div>
            </button>
        `;
    };
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px); max-height: 80vh; overflow:hidden; padding: 24px; border-radius: 24px; background: white; display:flex; flex-direction:column;',
        innerHTML: `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px;">
                <h2 style="margin:0; font-size:1.4rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Your friends <span style="background:rgba(0,113,227,0.1); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.78rem; font-weight:800; margin-left:6px; vertical-align:2px;">${friends.length}</span></h2>
                <button id="friendsListClose" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div style="overflow-y:auto; display:flex; flex-direction:column; gap:4px; min-height:0;">
                ${friends.map(rowHtml).join('')}
            </div>
        `,
    });
    /** @type {HTMLButtonElement | null} */ (root.querySelector('#friendsListClose'))?.addEventListener('click', close);
    root.querySelectorAll('.profile-friend-row').forEach(btn => {
        /** @type {HTMLButtonElement} */ (btn).onclick = () => {
            const id = /** @type {HTMLElement} */ (btn).dataset.userId;
            close();
            if (id) navigate('profile', { userId: id });
        };
    });
}

/** @param {string | null} [targetUserId] */
export function renderProfile(targetUserId = null) {
    const div = document.createElement('div');

    // Helper to determine if we are viewing ourselves
    const isOwnProfile = !targetUserId || (STATE.user && targetUserId === STATE.user.id);

    // Logged-out callers never reach this branch — the router renders the
    // app-wide login wall instead. Kept defensive in case a stale link
    // routes here without a session.
    if (!STATE.user && isOwnProfile) {
        return renderLoginWall();
    }

    const renderData = (user, trips) => {
        const allTrips = trips || [];
        const uniqueCountries = [...new Set(allTrips.map(t => t.country).filter(Boolean))];
        const profilePicSrc = user.picture;
        // Friends list — fetched async after the main render so the
        // initial paint isn't gated on the API call. Stat starts at
        // "—" and gets replaced when /api/friends/list resolves;
        // the modal also reads from this cache so the second click is
        // instant.
        /** @type {{id:string,name:string,email:string,picture?:string}[]} */
        let friendsCache = [];

        div.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">
                ${!isOwnProfile ? `
                    <button class="btn btn-small" id="profileBackToFriendsBtn" style="margin-bottom: 20px; background: rgba(0,0,0,0.05); color: var(--text-primary); border: 1px solid var(--glass-border); padding: 8px 16px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Back to Friends
                    </button>
                ` : ''}

                <!-- Instagram-style Profile Header -->
                <div style="display: flex; align-items: flex-start; gap: 40px; padding: 30px 20px; border-bottom: 1px solid var(--glass-border); margin-bottom: 30px;">
                    <!-- Avatar -->
                    <div style="position: relative; flex-shrink: 0; ${isOwnProfile ? 'cursor: pointer;' : ''} border-radius: 50%;" id="${isOwnProfile ? 'profilePicWrapper' : ''}" title="${isOwnProfile ? 'Change profile photo' : ''}">
                        <div style="padding: 4px; background: linear-gradient(135deg, #4da3ff 0%, var(--accent-blue) 50%, #004080 100%); border-radius: 50%;">
                            <img id="profilePicDisplay" src="${profilePicSrc}" alt="Profile Picture" style="width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--bg-color); object-fit: cover; display: block; transition: opacity 0.2s; background: var(--bg-color);">
                        </div>
                        ${isOwnProfile ? `
                        <div style="position: absolute; inset: 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;" id="profilePicOverlay">
                            <div style="background: rgba(0,0,0,0.6); border-radius: 50%; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            </div>
                        </div>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;">
                        ` : ''}
                    </div>
                    
                    <!-- Info Section -->
                    <div style="flex: 1; padding-top: 10px;">
                        <!-- Name & Actions -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${user.name}</h2>
                            ${isOwnProfile ? `
                                <button id="profileLogoutBtn" class="btn-logout">Log Out</button>
                            ` : ''}
                        </div>
                        
                        <!-- Stats Row. The friends stat is clickable
                             (own profile only) — opens a modal listing
                             every accepted friend, each row navigates
                             to that friend's profile. Number starts as
                             "—" and the post-render fetch fills it in
                             once /api/friends/list resolves. -->
                        <div style="display: flex; gap: 32px; margin-bottom: 24px;">
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${trips.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">public trips</span>
                            </div>
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${uniqueCountries.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">countries</span>
                            </div>
                            ${isOwnProfile ? `
                                <button id="profileFriendsStat" type="button" style="background:none; border:0; padding:0; cursor:pointer; text-align:left; display:inline-flex; align-items:baseline; gap:4px; font-family: inherit;">
                                    <span id="profileFriendsCount" style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">—</span>
                                    <span style="font-size: 1.1rem; color: var(--accent-blue); font-weight: 600; text-decoration: underline; text-decoration-color: rgba(0,113,227,0.25); text-underline-offset: 3px;">friends</span>
                                </button>
                            ` : ''}
                        </div>
                        
                        <!-- Bio & Status -->
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${user.email}</div>
                            
                            <!-- Inline Status -->
                            <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                                ${isOwnProfile ? `
                                    <select id="profileStatus" class="brand-select" style="padding: 2px 24px 2px 10px; font-size: var(--font-base);">
                                        <option value="" disabled ${!user.status ? 'selected' : ''}>Set status...</option>
                                        <option value="Deliberating next trip" ${user.status === 'Deliberating next trip' ? 'selected' : ''}>🤔 Deliberating next trip</option>
                                        <option value="Preparing a trip right now" ${user.status === 'Preparing a trip right now' ? 'selected' : ''}>🎒 Preparing a trip right now</option>
                                        <option value="Exploring the world" ${user.status === 'Exploring the world' ? 'selected' : ''}>🌍 Exploring the world</option>
                                        <option value="Resting at home base" ${user.status === 'Resting at home base' ? 'selected' : ''}>🏠 Resting at home base</option>
                                        <option value="Hunting for flight deals" ${user.status === 'Hunting for flight deals' ? 'selected' : ''}>✈️ Hunting for flight deals</option>
                                    </select>
                                    <div class="brand-select-chevron" style="right: 8px;">▼</div>
                                ` : `
                                    <div style="background: rgba(0, 113, 227, 0.05); color: var(--accent-blue); border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); font-size: var(--font-base); font-weight: 700; display: inline-block;">
                                        ${user.status || 'Active Traveler'}
                                    </div>
                                `}
                            </div>

                            <!-- Bio -->
                            ${isOwnProfile ? `
                                <textarea id="profileBio" class="bio-input" placeholder="Add a bio...">${user.bio || ''}</textarea>

                                <!-- Home currency picker — the currency totals
                                     and insights will be displayed in. -->
                                <div style="margin-top: 14px; max-width: 500px;">
                                    <label for="profileHomeCurrency" style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; letter-spacing: 0.04em;">
                                        Home currency — what you'll see totals and insights in
                                    </label>
                                    <div style="position: relative; display: inline-block;">
                                        <select id="profileHomeCurrency" class="brand-select" style="padding: 6px 28px 6px 12px; font-size: var(--font-sm);">
                                            ${Object.keys(CONVERSION_RATES).map(code => `
                                                <option value="${code}" ${getHomeCurrency() === code ? 'selected' : ''}>${CURRENCY_SYMBOLS[code] || code}  ${code}</option>
                                            `).join('')}
                                        </select>
                                        <div class="brand-select-chevron" style="right: 10px;">▼</div>
                                    </div>
                                </div>

                                <div style="margin-top: 8px;">
                                    <button id="saveProfileBtn" class="btn btn-small" style="background: var(--text-primary); color: var(--bg-color); padding: 6px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; opacity: 0; transition: opacity 0.3s; pointer-events: none;">Save Profile</button>
                                </div>
                            ` : `
                                <p style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5; margin: 4px 0;">${user.bio || 'No bio yet.'}</p>
                            `}
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-primary);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${isOwnProfile ? 'Your footprint' : `${user.name.split(' ')[0]}'s footprint`}
                    </div>
                </div>

                <!-- Footprint Section -->
                <div style="margin-top: 20px;">
                    <p style="color: var(--text-secondary); text-align: center; margin-top: 0; margin-bottom: 24px; font-size: 0.9rem;">
                        ${isOwnProfile ? "Every country you've been to, lit up." : "Explore where " + user.name.split(' ')[0] + " has been."}
                    </p>
                    
                    <div class="card glass" style="padding: 0; overflow: hidden; border-radius: 20px; position: relative; z-index: 1; border: 1px solid var(--glass-border);">
                        <div id="legaciesMap" style="width: 100%; height: 450px;"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Initializing Map and Event Listeners
        setTimeout(() => {
            div.querySelector('#profileBackToFriendsBtn')?.addEventListener('click', () => navigate('friends'));
            div.querySelector('#profileLogoutBtn')?.addEventListener('click', () => logout());

            // ── Friends stat (own profile only) ───────────────────────
            // Async fetch + click-to-open modal listing all accepted
            // friends. The number on the stat starts at "—" and gets
            // replaced when the request resolves; clicking the stat
            // opens a modal that lists each friend, and clicking a
            // friend row navigates to that user's profile.
            if (isOwnProfile && STATE.user) {
                const friendsBtn = /** @type {HTMLElement | null} */ (div.querySelector('#profileFriendsStat'));
                const friendsCountEl = /** @type {HTMLElement | null} */ (div.querySelector('#profileFriendsCount'));
                apiFetch('/api/friends/list')
                    .then(r => r.ok ? r.json() : [])
                    .then(list => {
                        if (!Array.isArray(list)) return;
                        friendsCache = list;
                        if (friendsCountEl) friendsCountEl.textContent = String(list.length);
                    })
                    .catch(() => { /* leave the "—" placeholder */ });
                if (friendsBtn) {
                    friendsBtn.onclick = () => {
                        if (friendsCache.length === 0) {
                            // Either no friends yet, or the fetch is
                            // still in flight. Either way, push the user
                            // to /friends where they can either add
                            // friends or see their list once it loads.
                            navigate('friends');
                            return;
                        }
                        openFriendsListModal(friendsCache);
                    };
                }
            }

            if (isOwnProfile) {
                const statusEl = /** @type {HTMLInputElement | null} */ (div.querySelector('#profileStatus'));
                const bioEl = /** @type {HTMLTextAreaElement | null} */ (div.querySelector('#profileBio'));
                const homeCurrencyEl = /** @type {HTMLSelectElement | null} */ (div.querySelector('#profileHomeCurrency'));
                const saveBtn = /** @type {HTMLButtonElement | null} */ (div.querySelector('#saveProfileBtn'));
                const showSave = () => { if (saveBtn) { saveBtn.style.opacity = '1'; saveBtn.style.pointerEvents = 'auto'; } };
                if (statusEl) statusEl.onchange = showSave;
                if (bioEl) bioEl.oninput = showSave;
                if (homeCurrencyEl) homeCurrencyEl.onchange = showSave;
                if (saveBtn) {
                    saveBtn.onclick = async () => {
                        if (!STATE.user || !statusEl || !bioEl) return;
                        const newStatus = statusEl.value;
                        const newBio = bioEl.value;
                        const newHomeCurrency = homeCurrencyEl ? homeCurrencyEl.value : (STATE.user.homeCurrency || null);
                        try {
                            const res = await apiFetch('/api/profile/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    bio: newBio,
                                    status: newStatus,
                                    homeCurrency: newHomeCurrency,
                                })
                            });
                            if (res.ok) {
                                STATE.user.bio = newBio;
                                STATE.user.status = newStatus;
                                STATE.user.homeCurrency = newHomeCurrency;
                                emit('state:changed'); saveBtn.style.opacity = '0'; saveBtn.style.pointerEvents = 'none';
                                showLiquidAlert("Profile updated!");
                            }
                        } catch(e) {}
                    };
                }

                const input = /** @type {HTMLInputElement | null} */ (div.querySelector('#profilePhotoInput'));
                const wrapper = /** @type {HTMLElement | null} */ (div.querySelector('#profilePicWrapper'));
                // Hover-reveal of #profilePicOverlay is pure CSS now —
                // the JS attachment was the same opacity toggle.
                if (wrapper) wrapper.onclick = () => input && input.click();
                if (input) input.onchange = (e) => {
                    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const result = typeof ev.target?.result === 'string' ? ev.target.result : null;
                        STATE.profilePhoto = result; emit('state:changed');
                        const display = /** @type {HTMLImageElement | null} */ (div.querySelector('#profilePicDisplay'));
                        if (display && result) display.src = result;
                    };
                    reader.readAsDataURL(file);
                };
            }

            // Map logic
            if (typeof google !== 'undefined' && google.maps) {
                const mapContainer = document.getElementById('legaciesMap');
                if (mapContainer) {
                    const map = new google.maps.Map(mapContainer, {
                        center: { lat: 20, lng: 0 }, zoom: 2, minZoom: 2, mapTypeId: 'roadmap', disableDefaultUI: true,
                        restriction: { latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: true },
                        styles: [
                            { "featureType": "all", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
                            { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "visibility": "on" }, { "color": "#e0e0e0" }] },
                            { "featureType": "landscape", "stylers": [{ "color": "#f0f0f5" }] },
                            { "featureType": "water", "stylers": [{ "color": "#ffffff" }] }
                        ]
                    });

                    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
                        .then(res => res.json()).then(data => {
                            map.data.addGeoJson(data);
                            map.data.setStyle(feature => {
                                const countryName = (feature.getProperty('NAME') || feature.getProperty('name') || feature.getProperty('admin') || "").toLowerCase();
                                if (!countryName) return { visible: false };
                                const isMatch = uniqueCountries.some(c => {
                                    if (!c) return false;
                                    let cleanC = c.split(' (')[0].split(' - ')[0].toLowerCase();
                                    if (cleanC === 'usa') cleanC = 'united states';
                                    if (cleanC === 'uk') cleanC = 'united kingdom';
                                    return countryName === cleanC || countryName.includes(cleanC) || cleanC.includes(countryName) || (cleanC === 'united states' && (countryName.includes('america') || countryName === 'usa'));
                                });
                                if (isMatch) {
                                    let hash = 0; for (let i = 0; i < countryName.length; i++) hash = countryName.charCodeAt(i) + ((hash << 5) - hash);
                                    const hue = Math.abs(hash % 360);
                                    return { fillColor: `hsl(${hue}, 70%, 60%)`, fillOpacity: 0.7, strokeColor: '#ffffff', strokeWeight: 0.5, visible: true };
                                }
                                return { fillColor: '#d0d0d5', fillOpacity: 0.2, strokeColor: '#ffffff', strokeWeight: 0.5, visible: true };
                            });
                        });

                    // Place markers for every trip the user has marked public.
                    // (Today the privacy toggle only appears on archived trips, but
                    // the user's stated intent is "public = pin," so we key off
                    // isPublic alone — not archived-AND-public — so the day the
                    // toggle shows up on active trips, pins follow automatically.)
                    const geocoder = new google.maps.Geocoder();
                    const tripsByCountry = {};
                    trips.filter(t => t.isPublic).forEach(t => {
                        const k = t.country || t.name;
                        if (k) {
                            if (!tripsByCountry[k]) tripsByCountry[k] = [];
                            tripsByCountry[k].push(t);
                        }
                    });

                    /** @param {any} pos
                     *  @param {string} countryKey
                     *  @param {any[]} tps */
                    const placeMarker = (pos, countryKey, tps) => {
                        const marker = new google.maps.Marker({
                            position: pos, map: map,
                            icon: { path: google.maps.SymbolPath.CIRCLE, fillOpacity: 1, fillColor: '#ff2d55', strokeColor: 'white', strokeWeight: 2, scale: tps.length > 1 ? 14 : 10 }
                        });

                        const tripList = tps.map(t => `
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                                <span style="font-weight: 600; color: #000;">${t.name}</span>
                                <button class="archived-trip-view-btn" data-trip-id="${t.id}" style="background: #007aff; color: white; border: none; padding: 4px 12px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">View</button>
                            </div>
                        `).join('');

                        // Build InfoWindow content as an HTMLElement so we can attach
                        // a delegated click listener to it (Google Maps renders the
                        // InfoWindow outside `div`, so delegation on `div` won't catch
                        // clicks here).
                        const infoContent = document.createElement('div');
                        infoContent.style.cssText = 'padding: 4px 8px; min-width: 220px; max-width: 300px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;';
                        infoContent.innerHTML = `
                            <div style="font-weight: 800; font-size: 0.7rem; text-transform: uppercase; color: rgba(0,0,0,0.5); letter-spacing: 0.1em; margin-bottom: 6px;">${countryKey} — ${tps.length} trip${tps.length > 1 ? 's' : ''}</div>
                            ${tripList}
                        `;
                        infoContent.addEventListener('click', (e) => {
                            const btn = /** @type {HTMLElement | null} */ (
                                /** @type {HTMLElement | null} */ (e.target)?.closest('.archived-trip-view-btn')
                            );
                            if (btn?.dataset.tripId) viewArchivedDetails(btn.dataset.tripId);
                        });

                        const infoWindow = new google.maps.InfoWindow({ content: infoContent });
                        marker.addListener('click', () => infoWindow.open(map, marker));
                    };

                    const addPins = async () => {
                        for (const [countryKey, tps] of Object.entries(tripsByCountry)) {
                            // Prefer stored coords on any trip in the cluster.
                            // Falls back to Geocoder for legacy trips that
                            // were created before the Places migration.
                            const withCoords = /** @type {any} */ (tps).find(t => typeof t.lat === 'number' && typeof t.lng === 'number');
                            if (withCoords) {
                                placeMarker({ lat: withCoords.lat, lng: withCoords.lng }, countryKey, /** @type {any} */ (tps));
                                continue; // no API call, no throttle needed
                            }
                            geocoder.geocode({ address: countryKey }, (results, status) => {
                                if (status === "OK" && results[0]) {
                                    placeMarker(results[0].geometry.location, countryKey, /** @type {any} */ (tps));
                                }
                            });
                            await new Promise(r => setTimeout(r, 800));
                        }
                    };
                    addPins();
                }
            }
        }, 100);
    };

    if (isOwnProfile) {
        const allTrips = [...(STATE.trips || []), ...(STATE.archivedTrips || [])];
        const now = new Date();
        const completedTrips = allTrips.filter(t => t.isArchived || (t.dateTo && new Date(t.dateTo) < now));
        renderData(STATE.user, completedTrips);
    } else {
        div.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:300px;"><p style="font-weight:700; color:var(--text-secondary); animation: pulse 1.5s infinite;">Fetching profile...</p></div>`;
        fetch(apiUrl(`/api/public-profile/${targetUserId}`))
            .then(res => res.json())
            .then(data => {
                if (data.error) div.innerHTML = `<p style="text-align:center; padding:50px;">User not found.</p>`;
                else renderData(data.user, data.trips);
            })
            .catch(() => { div.innerHTML = `<p style="text-align:center; padding:50px;">Error loading profile.</p>`; });
    }

    return div;
}

export function updateUserUI() {
    const avatar = document.getElementById('sidebarProfileAvatar');
    const icon = document.getElementById('sidebarProfileIcon');
    const label = document.getElementById('sidebarProfileLabel');
    const sub = document.getElementById('sidebarProfileSub');
    const pic = /** @type {HTMLImageElement | null} */ (document.getElementById('sidebarProfilePic'));
    const logoutBtn = document.getElementById('sidebarLogoutBtn');

    // App-wide signed-out body class — drives the CSS that hides the
    // nav links, trip selector, notification bell, and sidebar trigger
    // while the login wall is showing. Single switch beats sprinkling
    // display:none updates across every chrome element.
    document.body.classList.toggle('is-signed-out', !STATE.user);

    if (STATE.user) {
        if (avatar) { avatar.style.display = 'block'; }
        if (icon) { icon.style.display = 'none'; }
        if (label) { label.textContent = STATE.user.name; }
        if (sub) { sub.style.display = 'block'; sub.textContent = 'Logged in ✓'; }
        if (pic) { pic.src = STATE.user.picture ?? ''; }
        if (logoutBtn) { logoutBtn.style.display = 'block'; }
    } else {
        if (avatar) { avatar.style.display = 'none'; }
        if (icon) { icon.style.display = 'block'; }
        if (label) { label.textContent = 'Log in'; }
        if (sub) { sub.style.display = 'none'; }
        if (logoutBtn) { logoutBtn.style.display = 'none'; }
    }
}
