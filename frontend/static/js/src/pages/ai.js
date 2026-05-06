// @ts-check
import { STATE, emit } from '../state.js';
import { q, esc, formatDayDate } from '../utils.js';
import { openNewTripModal } from '../modals.js';
import { apiFetch, upsertDay, deleteDayOnServer, upsertTrip } from '../api.js';
import { canEdit, getMyRole, ROLE_BUDGETEER, ROLE_RELAXER } from '../permissions.js';
import { getMarkedPlaces, removeMarkedPlace, setMarkedPlaceAssignment } from '../markedPlaces.js';

/** @type {any} */
let googleMap = null;
/** @type {any[]} */
let mapMarkers = [];

export function renderAI() {
    const div = document.createElement('div');
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);

    // ── EMPTY STATE ──────────────────────────────────────────
    if (!activeTrip) {
        div.innerHTML = `
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05);">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">Ready for a new adventure?</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">To generate a personalized AI itinerary, you'll need to create a trip first.</p>
                        <button id="aiStartJourneyBtn" class="btn-primary btn-primary--lg" style="max-width: none; width: auto; padding: 16px 36px; font-size: 1.15rem;">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`;
        setTimeout(() => {
            div.querySelector('#aiStartJourneyBtn')?.addEventListener('click', () => openNewTripModal());
            if (typeof google !== 'undefined' && google.maps) {
                new google.maps.Map(document.getElementById('emptyMap'), {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: []
                });
            }
        }, 100);
        return div;
    }

    // ── ACTIVE TRIP STATE ────────────────────────────────────
    const tripCountry = activeTrip.country || '';
    // Prefer the trip's Path days as the source of dates — those reflect
    // the user's intent for "when this trip happens" (entered when
    // creating / editing the trip). Falls back to the date range of
    // logged expenses for older trips that pre-date the dates field, so
    // the inputs auto-fill there too. Final fallback: empty, user picks.
    const tripDays = (STATE.tripDays || [])
        .filter(d => d.tripId === STATE.activeTripId && d.dayNumber > 0 && d.date)
        .map(d => d.date)
        .sort();
    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && e.date).sort((a, b) => a.date.localeCompare(b.date));
    const expenseDates = tripExps.map(e => e.date);
    const minDate = tripDays[0] || expenseDates[0] || '';
    const maxDate = tripDays[tripDays.length - 1] || expenseDates[expenseDates.length - 1] || '';

    const savedPlan = activeTrip.aiPlan || null;
    const savedContext = activeTrip.aiContext || '';
    const savedNumDays = activeTrip.aiNumDays || 1;

    // Phase 4 — generating/accepting plans writes to the trip (aiPlan,
    // tripDays). Relaxers see the saved plan if one exists but can't
    // generate or import a new one.
    const tripIsEditable = canEdit(activeTrip);

    const sf = `font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;

    div.innerHTML = `
        <div style="${sf}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${tripCountry}</strong></p>
            </div>

            <!-- Top 2-col: Controls | Map -->
            <div style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls. min-height matches the sticky map (700px) so
                     the Requirements card can flex-grow into the spare space and
                     the Generate button bottom lines up with the map's bottom. -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;min-height:700px;">
                    <!-- AI Engine badge -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin-bottom:8px;">✦ AI Engine</h2>
                        <p style="color:var(--text-secondary);font-size:0.82rem;margin:0;">Secure server-side Gemini integration.</p>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-blue);margin-bottom:14px;">📅 Travel Dates</h2>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">From</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${minDate}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${maxDate}" style="width:100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box; flex:1 1 auto; min-height:120px;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${savedContext}</textarea>
                    </div>
                    <!-- Generate -->
                    ${tripIsEditable
                        ? `<button id="generateBtn" class="ai-generate-btn" style="width:100%; border-radius: var(--radius-lg);flex:0 0 auto;">✦ Generate My Itinerary</button>`
                        : (() => {
                            // Role-aware copy. Relaxers + Budgeteers
                            // both land here (canEdit returns false
                            // for both — only Planners can edit the
                            // itinerary). Show the right role label
                            // so Budgeteers don't get told they're
                            // a Relaxer.
                            const role = getMyRole(activeTrip);
                            const roleLabel = role === ROLE_BUDGETEER ? 'Budgeteer'
                                : role === ROLE_RELAXER ? 'Relaxer'
                                : 'observer';
                            const note = role === ROLE_BUDGETEER
                                ? "you handle the trip's expenses but the itinerary is up to the Planners."
                                : "generating a new plan is up to the Planners.";
                            return `<div class="card glass" style="padding:16px; border-radius: var(--radius-lg); text-align:center; color: var(--text-secondary); font-size: 0.85rem; flex:0 0 auto;">
                                👁 You're a ${roleLabel} on this trip — ${note}
                            </div>`;
                        })()}
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;z-index:1000;">
                            <span>📍</span> <span>${tripCountry}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Marked Places (full-width below) — places the user
                 stamped from the home map InfoWindow with "Mark for AI".
                 Each card shows the place + day/time-of-day dropdowns
                 (only when dates are entered, since assignments need a
                 day to bind to) + a remove button. The Generate flow
                 below appends these into Gemini's prompt context. -->
            <div id="aiMarkedPlacesPanel" style="margin-bottom: 32px;"></div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`;

    setTimeout(() => {
        // Zoom helper. Prefers the viewport stored on the trip (set in the
        // create-modal Places picker). Falls back to a Geocoder lookup for
        // legacy trips that pre-date the migration.
        const zoomToLocation = (location) => {
            if (!googleMap) return;

            const aiTripMapKey = activeTrip.id + '_ai';
            if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
                const saved = STATE.mapViews[aiTripMapKey];
                googleMap.setCenter({ lat: saved.lat, lng: saved.lng });
                googleMap.setZoom(saved.zoom);
                return;
            }

            if (activeTrip.viewport) {
                const v = activeTrip.viewport;
                googleMap.fitBounds(new google.maps.LatLngBounds(
                    { lat: v.south, lng: v.west },
                    { lat: v.north, lng: v.east },
                ));
                return;
            }

            let query = location.replace(/\(USA\)/g, '').trim();
            const isUSState = query.includes(' - ');
            if (isUSState) {
                query = query.split(' - ')[1] + ', USA';
            }

            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: query }, (results, status) => {
                if (status === "OK" && results[0]) {
                    googleMap.fitBounds(results[0].geometry.viewport);
                }
            });
        };

        // Init Google Map
        if (typeof google !== 'undefined' && google.maps) {
            const mapEl = document.getElementById('aiGoogleMap');
            if (mapEl) {
                googleMap = new google.maps.Map(mapEl, {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    mapTypeId: 'roadmap',
                    disableDefaultUI: true,
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: []
                });
                
                zoomToLocation(tripCountry);

                googleMap.addListener('idle', () => {
                    const aiTripMapKey = activeTrip.id + '_ai';
                    if (!STATE.mapViews) STATE.mapViews = {};
                    const c = googleMap.getCenter();
                    STATE.mapViews[aiTripMapKey] = { lat: c.lat(), lng: c.lng(), zoom: googleMap.getZoom() };
                    emit('state:changed');
                });
            }

            const badge = /** @type {HTMLElement | null} */ (div.querySelector('#aiZoomBadge'));
            if (badge) badge.onclick = () => {
                const aiTripMapKey = activeTrip.id + '_ai';
                if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) delete STATE.mapViews[aiTripMapKey];
                zoomToLocation(tripCountry);
            };
        }

        let generatedItinerary = savedPlan;

        const renderItineraryOutput = (itinerary, numDays, country) => {
            const outputEl = q(div, '#itineraryOutput');
            if (!itinerary || !itinerary.length) {
                outputEl.innerHTML = '';
                return;
            }

            outputEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${sf}">${numDays}-Day ${country} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                ${tripIsEditable ? `<div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>` : ''}`;

            const daysContainer = q(outputEl, '#itineraryDays');
            const dayDivs = [];

            itinerary.forEach((/** @type {any} */ day, /** @type {number} */ _i) => {
                const dayDiv = document.createElement('div');
                dayDiv.className = 'card glass';
                dayDiv.style.cssText = `border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${sf}`;
                dayDiv.innerHTML = `
                    <div style="display:flex;align-items:stretch;">
                        <div class="ai-day-chip">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${day.day}</span>
                        </div>
                        <div style="flex:1;padding:var(--space-6) 28px;">
                            <div style="margin-bottom:var(--space-5);">
                                <h3 style="margin:0 0 var(--space-1);font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:white;">${day.title || 'Day ' + day.day}</h3>
                                <span style="font-size:var(--font-base);color:var(--text-secondary);">${day.date || ''}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4);margin-bottom:${day.tip ? 'var(--space-5)' : '0'};">
                                <div class="ai-plan-block" style="--accent: 0,113,227;">
                                    <div class="ai-plan-block__tag">🌅 Morning</div>
                                    <div class="ai-plan-block__title">${day.morning?.activity || ''}</div>
                                    <div class="ai-plan-block__desc">${day.morning?.description || ''}</div>
                                </div>
                                <div class="ai-plan-block" style="--accent: 255,149,0;">
                                    <div class="ai-plan-block__tag">☀️ Afternoon</div>
                                    <div class="ai-plan-block__title">${day.afternoon?.activity || ''}</div>
                                    <div class="ai-plan-block__desc">${day.afternoon?.description || ''}</div>
                                </div>
                                <div class="ai-plan-block" style="--accent: 155,89,182;">
                                    <div class="ai-plan-block__tag">🌙 Evening</div>
                                    <div class="ai-plan-block__title">${day.evening?.activity || ''}</div>
                                    <div class="ai-plan-block__desc">${day.evening?.description || ''}</div>
                                </div>
                            </div>
                            ${day.tip ? `<div class="pro-tip"><span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);">💡 Pro Tip</span><p style="margin:5px 0 0;font-size:var(--font-sm);color:var(--text-secondary);">${day.tip}</p></div>` : ''}
                        </div>
                    </div>`;
                daysContainer.appendChild(dayDiv);
                dayDivs.push(dayDiv);
            });

            if (googleMap) {
                // Clear old markers
                mapMarkers.forEach(m => m.setMap(null));
                mapMarkers = [];
                
                const bounds = new google.maps.LatLngBounds();
                const geocoder = new google.maps.Geocoder();

                const geocodeAndMark = (day, i) => {
                    let loc = day.mainLocation || day.title || country;
                    if (!day.mainLocation && day.title) {
                        loc = day.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi, '').trim();
                    }
                    
                    geocoder.geocode({ address: loc + ', ' + country }, (results, status) => {
                        if (status === "OK" && results[0]) {
                            const pos = results[0].geometry.location;
                            day.lat = pos.lat(); day.lon = pos.lng();
                            
                            const marker = new google.maps.Marker({
                                position: pos,
                                map: googleMap,
                                label: {
                                    text: String(day.day),
                                    color: 'white',
                                    fontWeight: '800'
                                },
                                icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 16,
                                    fillColor: '#0071e3',
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: 'white'
                                }
                            });
                            
                            marker.addListener('click', () => {
                                dayDivs.forEach(d => { d.style.boxShadow = ''; d.style.borderColor = ''; });
                                const target = dayDivs[i];
                                if (target) {
                                    target.style.boxShadow = '0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)';
                                    target.style.borderColor = 'var(--accent-blue)';
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            });
                            
                            mapMarkers.push(marker);
                            bounds.extend(pos);
                            if (mapMarkers.length > 0) googleMap.fitBounds(bounds);
                        }
                    });
                };
                itinerary.forEach((day, i) => setTimeout(() => geocodeAndMark(day, i), i * 500));
            }

            const acceptBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('acceptPlanBtn'));
            if (acceptBtn) acceptBtn.onclick = () => {
                if (!itinerary) return;
                // Replace existing numbered days (dayNumber > 0) for this
                // trip rather than appending. Without this, the AI plan
                // would stack on top of any auto-scaffolded days the user
                // got from entering dates on New Trip — dayNumbers 1,2,3
                // would all be duplicated. The trip-genesis day (dayNumber=0)
                // is preserved because it's the trip's location anchor.
                const existingNumbered = STATE.tripDays.filter(
                    d => d.tripId === activeTrip.id && d.dayNumber > 0
                );
                STATE.tripDays = STATE.tripDays.filter(
                    d => !(d.tripId === activeTrip.id && d.dayNumber > 0)
                );
                existingNumbered.forEach(d => deleteDayOnServer(d.id));

                itinerary.forEach((/** @type {any} */ dayInfo, /** @type {number} */ idx) => {
                    const dayDate = dayInfo.date || (new Date().toISOString().split('T')[0]);
                    const dayId = 'day_' + Date.now() + '_' + idx;
                    /** @type {import('../types').TripDay} */
                    const newDay = {
                        id: dayId, tripId: activeTrip.id, date: dayDate,
                        name: dayInfo.title || `Day ${idx + 1}`, dayNumber: idx + 1,
                        lat: dayInfo.lat, lng: dayInfo.lon,
                        photos: [], tickets: [], notes: '', plan: {
                            morning: dayInfo.morning ? `${dayInfo.morning.activity}: ${dayInfo.morning.description}` : '',
                            afternoon: dayInfo.afternoon ? `${dayInfo.afternoon.activity}: ${dayInfo.afternoon.description}` : '',
                            evening: dayInfo.evening ? `${dayInfo.evening.activity}: ${dayInfo.evening.description}` : ''
                        }
                    };
                    STATE.tripDays.push(newDay);
                    upsertDay(newDay);
                });
                emit('state:changed');
                acceptBtn.innerHTML = '✓ Plan Accepted! (View in Home)';
                acceptBtn.style.background = '#34c759';
                acceptBtn.disabled = true;
            };
        };

        /** Render the marked-places panel. Re-rendered after every
         *  user action (remove, day change, time-of-day change) since
         *  the panel reflects mutable state on activeTrip.markedPlaces.
         *  When dates are entered in the AI planner, the day dropdown
         *  becomes available — that's when day/time assignments make
         *  sense (per the user's spec). */
        const renderMarkedPlacesPanel = () => {
            const panel = /** @type {HTMLElement | null} */ (div.querySelector('#aiMarkedPlacesPanel'));
            if (!panel) return;
            const marked = getMarkedPlaces(activeTrip).filter(p => p.forAI);
            if (marked.length === 0) {
                panel.innerHTML = `
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(88, 86, 214, 0.35); background: rgba(88, 86, 214, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">🤖</span>
                            <h3 style="margin:0; color:#5856d6; font-weight:800; letter-spacing:-0.01em;">Marked for AI</h3>
                        </div>
                        <p style="margin:0; color: var(--text-secondary); font-size: 0.9rem;">No places marked yet. On the Home map, click any pin and hit <strong>🤖 Mark for AI</strong> to add it here. Once dates are set above, you'll be able to assign each marked place to a specific day and part of the day; the AI will respect those when generating your itinerary.</p>
                    </div>
                `;
                return;
            }

            const dateFromEl = /** @type {HTMLInputElement | null} */ (div.querySelector('#aiDateFrom'));
            const dateToEl = /** @type {HTMLInputElement | null} */ (div.querySelector('#aiDateTo'));
            const datesSet = !!(dateFromEl?.value && dateToEl?.value);
            // Build day options from existing tripDays (numbered) when
            // dates are set. Falls back to no-options message when not.
            const tripDays = (STATE.tripDays || [])
                .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber);
            const dayOpts = (selectedId) => `
                <option value="" ${!selectedId ? 'selected' : ''}>Any day</option>
                ${tripDays.map(d => `
                    <option value="${esc(d.id)}" ${d.id === selectedId ? 'selected' : ''}>
                        Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                    </option>
                `).join('')}
            `;
            const timeOpts = (selectedTime) => `
                <option value="" ${!selectedTime ? 'selected' : ''}>Any time</option>
                <option value="morning"   ${selectedTime === 'morning'   ? 'selected' : ''}>🌅 Morning</option>
                <option value="afternoon" ${selectedTime === 'afternoon' ? 'selected' : ''}>☀️ Afternoon</option>
                <option value="evening"   ${selectedTime === 'evening'   ? 'selected' : ''}>🌙 Evening</option>
            `;

            const cardsHtml = marked.map(p => `
                <div class="ai-marked-card" data-place-id="${esc(p.placeId)}" style="background:white; border:1.5px solid ${p.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:10px; min-height: 0;">
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <span style="font-size:1.4rem; line-height:1;">${p.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${esc(p.name)}</div>
                            ${p.address ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${esc(p.address)}</div>` : ''}
                        </div>
                        <button type="button" class="marked-remove-btn" data-place-id="${esc(p.placeId)}" title="Remove from AI list" aria-label="Remove ${esc(p.name)}"
                            style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                    </div>
                    ${datesSet ? `
                        <div style="display:flex; gap:8px;">
                            <select class="marked-day-select" data-place-id="${esc(p.placeId)}" style="flex:1; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${dayOpts(p.dayId)}
                            </select>
                            <select class="marked-time-select" data-place-id="${esc(p.placeId)}" style="flex:1; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${timeOpts(p.timeOfDay)}
                            </select>
                        </div>
                    ` : `
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Set Travel Dates above to assign this to a specific day / time of day.</div>
                    `}
                </div>
            `).join('');

            panel.innerHTML = `
                <div class="card glass" style="padding:20px; border-radius:18px; border: 1.5px solid rgba(88, 86, 214, 0.25);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                        <span style="font-size: 1.2rem;">🤖</span>
                        <h3 style="margin:0; color:#5856d6; font-weight:800; letter-spacing:-0.01em;">Marked for AI <span style="background:rgba(88,86,214,0.12); color:#5856d6; font-size:0.7rem; padding:2px 8px; border-radius:999px; margin-left:6px;">${marked.length}</span></h3>
                        <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary);">Will be fed into Gemini's prompt when you Generate.</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                        ${cardsHtml}
                    </div>
                </div>
            `;

            // Wire per-card actions: remove + day select + time select.
            // Delegated since the panel re-renders on every change.
            panel.querySelectorAll('.marked-remove-btn').forEach(btn => {
                /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                    const pid = /** @type {HTMLElement} */ (btn).dataset.placeId;
                    if (!pid) return;
                    removeMarkedPlace(activeTrip, pid);
                    emit('state:changed');
                    upsertTrip(activeTrip);
                    renderMarkedPlacesPanel();
                };
            });
            panel.querySelectorAll('.marked-day-select, .marked-time-select').forEach(sel => {
                /** @type {HTMLSelectElement} */ (sel).onchange = () => {
                    const pid = /** @type {HTMLElement} */ (sel).dataset.placeId;
                    if (!pid) return;
                    const card = panel.querySelector(`.ai-marked-card[data-place-id="${pid}"]`);
                    if (!card) return;
                    const daySel = /** @type {HTMLSelectElement | null} */ (card.querySelector('.marked-day-select'));
                    const timeSel = /** @type {HTMLSelectElement | null} */ (card.querySelector('.marked-time-select'));
                    setMarkedPlaceAssignment(
                        activeTrip,
                        pid,
                        daySel?.value || null,
                        /** @type {any} */ (timeSel?.value) || null
                    );
                    emit('state:changed');
                    upsertTrip(activeTrip);
                    // No re-render needed — the dropdowns already show
                    // the new value, and there's no derived UI to update.
                };
            });
        };
        renderMarkedPlacesPanel();

        if (generatedItinerary) renderItineraryOutput(generatedItinerary, savedNumDays, tripCountry);

        const contextInput = /** @type {HTMLTextAreaElement | null} */ (div.querySelector('#aiExtraContext'));
        if (contextInput) {
            contextInput.oninput = (e) => {
                activeTrip.aiContext = /** @type {HTMLTextAreaElement} */ (e.target).value;
                emit('state:changed');
            };
        }

        // Re-render the marked-places panel whenever the user types in
        // date inputs — this is what reveals the day/time-of-day
        // dropdowns once dates are set.
        ['#aiDateFrom', '#aiDateTo'].forEach(sel => {
            const el = /** @type {HTMLInputElement | null} */ (div.querySelector(sel));
            if (el) el.addEventListener('change', () => renderMarkedPlacesPanel());
        });

        div.querySelector('#generateBtn')?.addEventListener('click', async () => {
            const outputEl = q(div, '#itineraryOutput');
            const dateFrom = /** @type {HTMLInputElement} */ (q(div, '#aiDateFrom')).value;
            const dateTo = /** @type {HTMLInputElement} */ (q(div, '#aiDateTo')).value;
            const ctxInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('aiExtraContext'));
            const userContext = ctxInput?.value ?? '';
            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }
            const from = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);

            // Build the marked-places suffix that gets appended to the
            // user's freeform context so Gemini sees both. Format chosen
            // to be unambiguous: each place on its own line, with day
            // and time-of-day labels when assigned. The AI is instructed
            // to incorporate these places where it makes sense.
            const markedForAI = getMarkedPlaces(activeTrip).filter(p => p.forAI);
            let markedSuffix = '';
            if (markedForAI.length > 0) {
                const tripDays = (STATE.tripDays || [])
                    .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0);
                const dayNumberOf = (id) => tripDays.find(d => d.id === id)?.dayNumber;
                const lines = markedForAI.map(p => {
                    const d = p.dayId ? dayNumberOf(p.dayId) : null;
                    const dayPart = d ? `, on Day ${d}` : '';
                    const timePart = p.timeOfDay ? `, ${p.timeOfDay}` : '';
                    const addrPart = p.address ? ` (${p.address})` : '';
                    return `- ${p.name}${addrPart}${dayPart}${timePart}`;
                }).join('\n');
                markedSuffix = `\n\nThe user has marked these specific places to include in the itinerary. Please incorporate them where they fit, respecting any day/time assignments where given:\n${lines}`;
            }
            const context = userContext + markedSuffix;
            activeTrip.aiContext = userContext; activeTrip.aiNumDays = numDays; emit('state:changed');
            outputEl.innerHTML = `<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:white;font-weight:600;">Consulting Gemini AI...</div></div>`;
            outputEl.scrollIntoView({ behavior: 'smooth' });
            try {
                const r = await apiFetch('/api/generate_itinerary', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        destination: tripCountry,
                        numDays, dateFrom, dateTo, context,
                    })
                });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                generatedItinerary = d.itinerary;
                activeTrip.aiPlan = generatedItinerary ?? undefined; emit('state:changed');
                renderItineraryOutput(generatedItinerary, numDays, tripCountry);
                outputEl.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${/** @type {Error} */ (e).message}</p></div>`;
            }
        });
    }, 0);

    return div;
}
