import { STATE, emit } from '../state.js';
import { openNewTripModal } from '../modals.js';

let googleMap = null;
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
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 40px 80px rgba(0,0,0,0.15), 0 15px 30px rgba(0,113,227,0.15)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05)';">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">Ready for a new adventure?</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">To generate a personalized AI itinerary, you'll need to create a trip first.</p>
                        <button id="aiStartJourneyBtn" class="btn btn-liquid-glass" style="padding:16px 36px;font-size:1.15rem;font-weight:800;background:var(--accent-blue);color:white;border:none;box-shadow:0 15px 30px rgba(0,113,227,0.3); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 40px rgba(0,113,227,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 15px 30px rgba(0,113,227,0.3)';">+ Start Your Journey</button>
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
    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && e.date).sort((a, b) => a.date.localeCompare(b.date));
    const dates = tripExps.map(e => e.date);
    const minDate = dates[0] || '';
    const maxDate = dates[dates.length - 1] || '';

    const savedPlan = activeTrip.aiPlan || null;
    const savedContext = activeTrip.aiContext || '';
    const savedNumDays = activeTrip.aiNumDays || 1;

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

                <!-- Left: Controls -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;">
                    <!-- AI Engine badge -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin-bottom:8px;">✦ AI Engine</h2>
                        <p style="color:var(--text-secondary);font-size:0.82rem;margin:0;">Secure server-side Gemini integration.</p>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;">
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

                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${savedContext}</textarea>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="btn ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; border: none; cursor: pointer;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;color:#001a33;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='var(--glass-bg)'">
                            <span>📍</span> <span>${tripCountry}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`;

    setTimeout(() => {
        // Zoom helper
        const zoomToLocation = (location) => {
            if (!googleMap) return;
            
            const aiTripMapKey = activeTrip.id + '_ai';
            if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
                const saved = STATE.mapViews[aiTripMapKey];
                googleMap.setCenter({ lat: saved.lat, lng: saved.lng });
                googleMap.setZoom(saved.zoom);
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

            const badge = div.querySelector('#aiZoomBadge');
            if (badge) badge.onclick = () => {
                const aiTripMapKey = activeTrip.id + '_ai';
                if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) delete STATE.mapViews[aiTripMapKey];
                zoomToLocation(tripCountry);
            };
        }

        let generatedItinerary = savedPlan;

        const renderItineraryOutput = (itinerary, numDays, country) => {
            const outputEl = div.querySelector('#itineraryOutput');
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
                <div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>`;

            const daysContainer = outputEl.querySelector('#itineraryDays');
            const dayDivs = [];

            itinerary.forEach((day, i) => {
                const dayDiv = document.createElement('div');
                dayDiv.className = 'card glass';
                dayDiv.style.cssText = `border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${sf}`;
                dayDiv.innerHTML = `
                    <div style="display:flex;align-items:stretch;">
                        <div style="width:72px;min-width:72px;background:linear-gradient(180deg,var(--accent-blue),#9b59b6);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 0;gap:4px;">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${day.day}</span>
                        </div>
                        <div style="flex:1;padding:24px 28px;">
                            <div style="margin-bottom:20px;">
                                <h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:white;">${day.title || 'Day ' + day.day}</h3>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">${day.date || ''}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:${day.tip ? '20px' : '0'};">
                                <div style="padding:16px;background:rgba(0,113,227,0.05);border-radius:12px;border:1px solid rgba(0,113,227,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:8px;">🌅 Morning</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.morning?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.morning?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(255,149,0,0.05);border-radius:12px;border:1px solid rgba(255,149,0,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff9500;margin-bottom:8px;">☀️ Afternoon</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.afternoon?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.afternoon?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(155,89,182,0.05);border-radius:12px;border:1px solid rgba(155,89,182,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9b59b6;margin-bottom:8px;">🌙 Evening</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.evening?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.evening?.description || ''}</div>
                                </div>
                            </div>
                            ${day.tip ? `<div style="padding:12px 16px;background:rgba(0,113,227,0.05);border-left:3px solid var(--accent-blue);border-radius:0 10px 10px 0;"><span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);">💡 Pro Tip</span><p style="margin:5px 0 0;font-size:0.85rem;color:var(--text-secondary);">${day.tip}</p></div>` : ''}
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

            document.getElementById('acceptPlanBtn').onclick = () => {
                if (!itinerary) return;
                itinerary.forEach((dayInfo, idx) => {
                    const dayDate = dayInfo.date || (new Date().toISOString().split('T')[0]);
                    const dayId = 'day_' + Date.now() + '_' + idx;
                    STATE.tripDays.push({
                        id: dayId, tripId: activeTrip.id, date: dayDate, name: dayInfo.title || `Day ${idx + 1}`, dayNumber: idx + 1, lat: dayInfo.lat, lon: dayInfo.lon,
                        photos: [], tickets: [], notes: '', plan: {
                            morning: dayInfo.morning ? `${dayInfo.morning.activity}: ${dayInfo.morning.description}` : '',
                            afternoon: dayInfo.afternoon ? `${dayInfo.afternoon.activity}: ${dayInfo.afternoon.description}` : '',
                            evening: dayInfo.evening ? `${dayInfo.evening.activity}: ${dayInfo.evening.description}` : ''
                        }
                    });
                });
                emit('state:changed');
                const btn = document.getElementById('acceptPlanBtn');
                btn.innerHTML = '✓ Plan Accepted! (View in Home)';
                btn.style.background = '#34c759';
                btn.disabled = true;
            };
        };

        if (generatedItinerary) renderItineraryOutput(generatedItinerary, savedNumDays, tripCountry);

        const contextInput = div.querySelector('#aiExtraContext');
        if (contextInput) {
            contextInput.oninput = (e) => {
                activeTrip.aiContext = e.target.value;
                emit('state:changed');
            };
        }

        div.querySelector('#generateBtn').addEventListener('click', async () => {
            const outputEl = div.querySelector('#itineraryOutput');
            const dateFrom = div.querySelector('#aiDateFrom').value;
            const dateTo = div.querySelector('#aiDateTo').value;
            const context = document.getElementById('aiExtraContext').value;
            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }
            const from = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to - from) / 86400000) + 1);
            activeTrip.aiContext = context; activeTrip.aiNumDays = numDays; emit('state:changed');
            outputEl.innerHTML = `<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:white;font-weight:600;">Consulting Gemini AI...</div></div>`;
            outputEl.scrollIntoView({ behavior: 'smooth' });
            try {
                const r = await fetch('/api/generate_itinerary', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ destination: tripCountry, numDays, dateFrom, dateTo, context })
                });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                generatedItinerary = d.itinerary;
                activeTrip.aiPlan = generatedItinerary; emit('state:changed');
                renderItineraryOutput(generatedItinerary, numDays, tripCountry);
                outputEl.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${e.message}</p></div>`;
            }
        });
    }, 0);

    return div;
}
