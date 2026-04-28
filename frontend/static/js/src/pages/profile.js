import { STATE, emit } from '../state.js';

window.logout = async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
        STATE.user = null;
        STATE.archivedTrips = [];
        STATE.notifications = [];
        emit('state:changed');
        updateUserUI();
        window.navigate('profile');
    } catch (e) {}
};

export function renderProfile(targetUserId = null) {
    const div = document.createElement('div');
    
    // Helper to determine if we are viewing ourselves
    const isOwnProfile = !targetUserId || (STATE.user && targetUserId === STATE.user.id);

    if (!STATE.user && isOwnProfile) {
        const isReturning = STATE.hasLoggedInBefore;
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #007aff, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Log In</h1>
                <p>${isReturning ? 'Sign in to your account to securely save and sync your trips across all your devices.' : 'Sign in with Google to start syncing your trips and travel memories across all your devices.'}</p>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; min-height: 50vh;">
                <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; max-width: 400px; width: 100%;">
                    <h2 style="margin-bottom: 30px; font-size: 1.5rem; color: var(--accent-blue);">${isReturning ? 'Welcome back' : 'Create your account with Google'}</h2>
                    <div id="profileLoginBtnContainer" style="display: flex; justify-content: center; min-height: 40px;"></div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            if (window.google && window.google.accounts && window.globalGoogleClientId) {
                window.google.accounts.id.renderButton(
                    div.querySelector("#profileLoginBtnContainer"),
                    { theme: "outline", size: "large", width: 280 }
                );
            }
        }, 300);
        return div;
    }

    const renderData = (user, trips) => {
        const allTrips = trips || [];
        const uniqueCountries = [...new Set(allTrips.map(t => t.country).filter(Boolean))];
        const profilePicSrc = user.picture;

        div.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">
                ${!isOwnProfile ? `
                    <button class="btn btn-small" onclick="window.navigate('friends')" style="margin-bottom: 20px; background: rgba(0,0,0,0.05); color: var(--text-primary); border: 1px solid var(--glass-border); padding: 8px 16px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
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
                                <button id="profileLogoutBtn" style="background: transparent; color: var(--text-secondary); font-weight: 600; border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'; this.style.borderColor='var(--glass-border)';" onclick="window.logout()">Log Out</button>
                            ` : ''}
                        </div>
                        
                        <!-- Stats Row -->
                        <div style="display: flex; gap: 32px; margin-bottom: 24px;">
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${trips.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">public trips</span>
                            </div>
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${uniqueCountries.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">countries</span>
                            </div>
                        </div>
                        
                        <!-- Bio & Status -->
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${user.email}</div>
                            
                            <!-- Inline Status -->
                            <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                                ${isOwnProfile ? `
                                    <select id="profileStatus" style="appearance: none; background: rgba(0, 113, 227, 0.08); color: var(--accent-blue); border: 1px solid rgba(0, 113, 227, 0.15); border-radius: 12px; padding: 2px 24px 2px 10px; font-size: 0.8rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                                        <option value="" disabled ${!user.status ? 'selected' : ''}>Set status...</option>
                                        <option value="Deliberating next trip" ${user.status === 'Deliberating next trip' ? 'selected' : ''}>🤔 Deliberating next trip</option>
                                        <option value="Preparing a trip right now" ${user.status === 'Preparing a trip right now' ? 'selected' : ''}>🎒 Preparing a trip right now</option>
                                        <option value="Exploring the world" ${user.status === 'Exploring the world' ? 'selected' : ''}>🌍 Exploring the world</option>
                                        <option value="Resting at home base" ${user.status === 'Resting at home base' ? 'selected' : ''}>🏠 Resting at home base</option>
                                        <option value="Hunting for flight deals" ${user.status === 'Hunting for flight deals' ? 'selected' : ''}>✈️ Hunting for flight deals</option>
                                    </select>
                                    <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--accent-blue); font-size: 0.6rem;">▼</div>
                                ` : `
                                    <div style="background: rgba(0, 113, 227, 0.05); color: var(--accent-blue); border-radius: 12px; padding: 4px 12px; font-size: 0.8rem; font-weight: 700; display: inline-block;">
                                        ${user.status || 'Active Traveler'}
                                    </div>
                                `}
                            </div>

                            <!-- Bio -->
                            ${isOwnProfile ? `
                                <textarea id="profileBio" placeholder="Add a bio..." style="width: 100%; max-width: 500px; min-height: 40px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--text-primary); font-size: 0.95rem; font-family: inherit; line-height: 1.5; resize: none; outline: none; padding: 6px; margin-left: -6px; transition: all 0.2s;" onfocus="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='var(--glass-border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${user.bio || ''}</textarea>
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
            if (isOwnProfile) {
                const statusEl = div.querySelector('#profileStatus');
                const bioEl = div.querySelector('#profileBio');
                const saveBtn = div.querySelector('#saveProfileBtn');
                if (statusEl) statusEl.onchange = () => { saveBtn.style.opacity = '1'; saveBtn.style.pointerEvents = 'auto'; };
                if (bioEl) bioEl.oninput = () => { saveBtn.style.opacity = '1'; saveBtn.style.pointerEvents = 'auto'; };
                if (saveBtn) {
                    saveBtn.onclick = async () => {
                        const newStatus = statusEl.value; const newBio = bioEl.value;
                        try {
                            const res = await fetch('/api/profile/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: STATE.user.id, bio: newBio, status: newStatus })
                            });
                            if (res.ok) {
                                STATE.user.bio = newBio; STATE.user.status = newStatus;
                                emit('state:changed'); saveBtn.style.opacity = '0'; saveBtn.style.pointerEvents = 'none';
                                window.showToast?.("Profile updated!");
                            }
                        } catch(e) {}
                    };
                }
                
                const input = div.querySelector('#profilePhotoInput');
                const wrapper = div.querySelector('#profilePicWrapper');
                if (wrapper) wrapper.onclick = () => input && input.click();
                if (input) input.onchange = (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    const reader = new FileReader(); reader.onload = (ev) => {
                        STATE.profilePhoto = ev.target.result; emit('state:changed');
                        div.querySelector('#profilePicDisplay').src = ev.target.result;
                    }; reader.readAsDataURL(file);
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

                    // Place markers
                    const geocoder = new google.maps.Geocoder();
                    const tripsByCountry = {};
                    trips.forEach(t => { const k = t.country || t.name; if (k) { if (!tripsByCountry[k]) tripsByCountry[k] = []; tripsByCountry[k].push(t); } });
                    
                    const addPins = async () => {
                        for (const [countryKey, tps] of Object.entries(tripsByCountry)) {
                            geocoder.geocode({ address: countryKey }, (results, status) => {
                                if (status === "OK" && results[0]) {
                                    const pos = results[0].geometry.location;
                                    new google.maps.Marker({
                                        position: pos, map: map,
                                        icon: { path: google.maps.SymbolPath.CIRCLE, fillOpacity: 1, fillColor: '#ff2d55', strokeColor: 'white', strokeWeight: 2, scale: tps.length > 1 ? 14 : 10 }
                                    }).addListener('click', () => {
                                        window.showToast?.(`Trip: ${tps[0].name}`);
                                    });
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
        fetch(`/api/public-profile/${targetUserId}`)
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
    const pic = document.getElementById('sidebarProfilePic');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');

    if (STATE.user) {
        if (avatar) { avatar.style.display = 'block'; }
        if (icon) { icon.style.display = 'none'; }
        if (label) { label.textContent = STATE.user.name; }
        if (sub) { sub.style.display = 'block'; sub.textContent = 'Logged in ✓'; }
        if (pic) { pic.src = STATE.user.picture; }
        if (logoutBtn) { logoutBtn.style.display = 'block'; }
    } else {
        if (avatar) { avatar.style.display = 'none'; }
        if (icon) { icon.style.display = 'block'; }
        if (label) { label.textContent = 'Log in'; }
        if (sub) { sub.style.display = 'none'; }
        if (logoutBtn) { logoutBtn.style.display = 'none'; }
    }
}
