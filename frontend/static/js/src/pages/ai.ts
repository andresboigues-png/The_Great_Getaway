import { STATE, emit } from '../state.js';
import { q, esc, formatDayDate } from '../utils.js';
import { openNewTripModal } from '../modals.js';
import { apiFetch, upsertDay, deleteDayOnServer, upsertTrip } from '../api.js';
import { canEdit, getMyRole, ROLE_BUDGETEER, ROLE_RELAXER } from '../permissions.js';
// removeMarkedPlace + toggleMarkedPlaceForAI moved to /todo. The AI
// page now only READS the to-do list (filtered to the AI-ticked subset)
// and writes back day/time-of-day assignments via setMarkedPlaceAssignment.
import { getMarkedPlaces, setMarkedPlaceAssignment } from '../markedPlaces.js';
import { showModal } from '../components/Modal.js';
import { navigate } from '../router.js';
import { renderSlotBody, flattenSlotForTextarea } from './ai/slots.js';

let googleMap: any = null;
let mapMarkers: any[] = [];

export function renderAI() {
    const div = document.createElement('div');
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);

    // ── EMPTY STATE ──────────────────────────────────────────
    if (!activeTrip) {
        div.innerHTML = `
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
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
    //
    // Source priority:
    //   1. trip.dateFrom / dateTo — authoritative trip-level dates
    //      (set by the edit-trip modal; mirrored from the day range
    //      whenever the user picks them there). Always wins when
    //      present so changing trip dates immediately reflects in
    //      the AI planner.
    //   2. tripDays earliest / latest — fallback for trips that
    //      have days but no top-level dateFrom (legacy data).
    //   3. expenses earliest / latest — last-ditch backup so a
    //      receipts-first trip still surfaces something useful.
    const tripDays = (STATE.tripDays || [])
        .filter(d => d.tripId === STATE.activeTripId && d.dayNumber > 0 && d.date)
        .map(d => d.date)
        .sort();
    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && e.date).sort((a, b) => a.date.localeCompare(b.date));
    const expenseDates = tripExps.map(e => e.date);
    const minDate = activeTrip.dateFrom || tripDays[0] || expenseDates[0] || '';
    const maxDate = activeTrip.dateTo || tripDays[tripDays.length - 1] || expenseDates[expenseDates.length - 1] || '';

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
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${tripCountry}</strong></p>
            </div>

            <!-- Top 2-col: Controls | Map -->
            <div style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls. min-height matches the sticky map (700px) so
                     the Requirements card can flex-grow into the spare space and
                     the Generate button bottom lines up with the map's bottom. -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;min-height:700px;">
                    <!-- AI Engine — Gemini key. Each user brings their
                         own free key so we don't burn the host's quota
                         when shipping to friends/family. The key is
                         persisted on STATE.geminiApiKey (localStorage
                         auto-flush via the saveState subscriber) and
                         sent in the /api/generate_itinerary request
                         body; backend falls back to its own env key
                         when the request body has none, so dev /
                         self-hosted setups still work. -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);flex:0 0 auto;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin:0;">✦ AI Engine — Gemini</h2>
                            <button id="aiKeyHelpBtn" type="button" title="How to get a Gemini API key" aria-label="How to get a Gemini API key"
                                style="background:rgba(155,89,182,0.12); border:1px solid rgba(155,89,182,0.35); color:#9b59b6; width:24px; height:24px; border-radius:50%; cursor:pointer; font-weight:800; font-size:0.78rem; line-height:1; display:inline-flex; align-items:center; justify-content:center; font-family: Georgia, serif; font-style: italic;">i</button>
                        </div>
                        <p style="color:var(--text-secondary);font-size:0.78rem;margin:0 0 10px;">Bring your own free Gemini API key. Stored on this device only.</p>
                        <div style="position:relative;">
                            <input id="aiKeyInput" type="password" placeholder="Paste your Gemini API key…" autocomplete="off" spellcheck="false"
                                value="${esc(STATE.geminiApiKey || '')}"
                                style="width:100%; box-sizing:border-box; padding:10px 42px 10px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:0.85rem; font-family: 'SF Mono', monospace; background:white; color:#002d5b;">
                            <button id="aiKeyToggleBtn" type="button" title="Show / hide key" aria-label="Toggle visibility"
                                style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:0; cursor:pointer; padding:4px 8px; color:rgba(0,0,0,0.5); font-size:0.95rem; line-height:1;">👁</button>
                        </div>
                        <div id="aiKeyStatus" style="margin-top:6px; font-size:0.7rem; font-weight:700; min-height:1em;"></div>
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

            <!-- To-do list panel (full-width below) — surfaces the
                 trip's unified to-do list (places stamped from the home
                 map InfoWindow with "Add to to-do"). Each row is a
                 checkbox bound to the place's forAI flag: ticked = the
                 AI generation request includes this place; unticked =
                 the place stays on the to-do list but isn't sent to
                 Gemini. New places ship pre-ticked so the common case
                 ("yes, consider this place") needs zero clicks. Day
                 and time-of-day dropdowns appear when dates are set
                 above — that's when assignments make sense.
                 Generate (further below) reads forAI from this panel. -->
            <div id="aiTodoListPanel" style="margin-bottom: 32px;"></div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`;

    setTimeout(() => {
        // Zoom helper. Prefers the viewport stored on the trip (set in the
        // create-modal Places picker). Falls back to a Geocoder lookup for
        // legacy trips that pre-date the migration.
        const zoomToLocation = (location: any) => {
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
            geocoder.geocode({ address: query }, (results: any, status: string) => {
                if (status === 'OK' && results[0]) {
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

            const badge = (div.querySelector('#aiZoomBadge') as HTMLElement | null);
            if (badge) badge.onclick = () => {
                const aiTripMapKey = activeTrip.id + '_ai';
                if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) delete STATE.mapViews[aiTripMapKey];
                zoomToLocation(tripCountry);
            };
        }

        let generatedItinerary = savedPlan;

        // renderSlotBody + flattenSlotForTextarea are pure helpers
        // imported from ./ai/slots.ts since the B1 split.

        const renderItineraryOutput = (itinerary: any, numDays: number | string, country: string) => {
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
            const dayDivs: HTMLDivElement[] = [];

            itinerary.forEach((day: any, _i: number) => {
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
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4);">
                                <div class="ai-plan-block" style="--accent: 0,113,227;">
                                    <div class="ai-plan-block__tag">🌅 Morning</div>
                                    <div class="ai-plan-block__title">${esc(day.morning?.activity || '')}</div>
                                    ${renderSlotBody(day.morning)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 255,149,0;">
                                    <div class="ai-plan-block__tag">☀️ Afternoon</div>
                                    <div class="ai-plan-block__title">${esc(day.afternoon?.activity || '')}</div>
                                    ${renderSlotBody(day.afternoon)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 155,89,182;">
                                    <div class="ai-plan-block__tag">🌙 Evening</div>
                                    <div class="ai-plan-block__title">${esc(day.evening?.activity || '')}</div>
                                    ${renderSlotBody(day.evening)}
                                </div>
                            </div>
                            <!-- 💡 Pro Tip block was removed app-wide
                                 (per user) — AI itineraries used to
                                 ship a per-day tip line; no more. -->

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

                const geocodeAndMark = (day: any, i: number) => {
                    let loc = day.mainLocation || day.title || country;
                    if (!day.mainLocation && day.title) {
                        loc = day.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi, '').trim();
                    }

                    geocoder.geocode({ address: loc + ', ' + country }, (results: any, status: string) => {
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
                itinerary.forEach((day: any, i: number) => setTimeout(() => geocodeAndMark(day, i), i * 500));
            }

            const acceptBtn = (document.getElementById('acceptPlanBtn') as HTMLButtonElement | null);
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

                itinerary.forEach((dayInfo: any, idx: number) => {
                    const dayDate = dayInfo.date || (new Date().toISOString().split('T')[0]);
                    const dayId = 'day_' + Date.now() + '_' + idx;
                    /** @type {import('../types').TripDay} */
                    const newDay = {
                        id: dayId, tripId: activeTrip.id, date: dayDate,
                        name: dayInfo.title || `Day ${idx + 1}`, dayNumber: idx + 1,
                        lat: dayInfo.lat, lng: dayInfo.lon,
                        photos: [], tickets: [], notes: '', plan: {
                            morning: flattenSlotForTextarea(dayInfo.morning),
                            afternoon: flattenSlotForTextarea(dayInfo.afternoon),
                            evening: flattenSlotForTextarea(dayInfo.evening)
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

        /** Render the AI-input panel: ONLY items ticked for AI from the
         *  /todo page surface here, each with day + time-of-day dropdowns
         *  the user fills in for this generation. The tick/untick UI
         *  itself lives on /todo (see pages/todo.js); this page is the
         *  scheduling step that follows it.
         *
         *  Three states:
         *    1. No to-do items at all  → CTA to /todo
         *    2. To-do items but none ticked → CTA to /todo to tick some
         *    3. Items ticked → render day/time dropdowns
         *
         *  The Generate flow further down reads `forAI && forManual`
         *  items from the trip's markedPlaces and stitches them into
         *  the Gemini prompt; this panel doesn't need to maintain a
         *  separate "selected" set of its own. Re-rendered after every
         *  user action so day/time changes refresh the dropdowns. */
        const renderTodoListPanel = () => {
            const panel = (div.querySelector('#aiTodoListPanel') as HTMLElement | null);
            if (!panel) return;
            const allTodo = getMarkedPlaces(activeTrip).filter(p => p.forManual);
            const tickedItems = allTodo.filter(p => p.forAI);

            // No to-do items at all — push to /todo (where they get added).
            if (allTodo.length === 0) {
                panel.innerHTML = `
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#9b59b6; font-weight:800; letter-spacing:-0.01em;">No to-do items yet</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">Build a to-do list of places you want the AI to consider — it gets a richer prompt and you get more relevant suggestions.</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">Open To do list 📋</button>
                    </div>
                `;
                (panel.querySelector('#aiGoToTodoBtn') as HTMLButtonElement | null)?.addEventListener('click', () => navigate('todo'));
                return;
            }

            // Items exist but none ticked for AI. Slightly different
            // copy + CTA — the user already has things on the to-do
            // list, they just need to tick which ones the AI should
            // plan around.
            if (tickedItems.length === 0) {
                panel.innerHTML = `
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#9b59b6; font-weight:800; letter-spacing:-0.01em;">${allTodo.length} item${allTodo.length === 1 ? '' : 's'} on your to-do list</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">None ticked for AI consideration yet — head to the <strong>To do list</strong> page to pick which ones you want the AI to plan around.</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">Tick items in To do list 📋</button>
                    </div>
                `;
                (panel.querySelector('#aiGoToTodoBtn') as HTMLButtonElement | null)?.addEventListener('click', () => navigate('todo'));
                return;
            }

            const dateFromEl = (div.querySelector('#aiDateFrom') as HTMLInputElement | null);
            const dateToEl = (div.querySelector('#aiDateTo') as HTMLInputElement | null);
            const datesSet = !!(dateFromEl?.value && dateToEl?.value);
            // Build day options from existing tripDays (numbered) when
            // dates are set. Falls back to no-options message when not.
            const tripDays = (STATE.tripDays || [])
                .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber);
            const dayOpts = (selectedId: string | null | undefined) => `
                <option value="" ${!selectedId ? 'selected' : ''}>Any day</option>
                ${tripDays.map(d => `
                    <option value="${esc(d.id)}" ${d.id === selectedId ? 'selected' : ''}>
                        Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                    </option>
                `).join('')}
            `;
            const timeOpts = (selectedTime: string | null | undefined) => `
                <option value="" ${!selectedTime ? 'selected' : ''}>Any time</option>
                <option value="morning"   ${selectedTime === 'morning'   ? 'selected' : ''}>🌅 Morning</option>
                <option value="afternoon" ${selectedTime === 'afternoon' ? 'selected' : ''}>☀️ Afternoon</option>
                <option value="evening"   ${selectedTime === 'evening'   ? 'selected' : ''}>🌙 Evening</option>
            `;

            const cardsHtml = tickedItems.map(p => `
                <div class="ai-marked-card" data-place-id="${esc(p.placeId)}" style="background:white; border:1.5px solid ${p.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:10px; min-height: 0;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <span style="font-size:1.4rem; line-height:1;">${p.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${esc(p.name)}</div>
                            ${p.address ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${esc(p.address)}</div>` : ''}
                        </div>
                    </div>
                    ${datesSet ? `
                        <div style="display:flex; gap:8px; min-width:0;">
                            <select class="marked-day-select" data-place-id="${esc(p.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${dayOpts(p.dayId)}
                            </select>
                            <select class="marked-time-select" data-place-id="${esc(p.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${timeOpts(p.timeOfDay)}
                            </select>
                        </div>
                    ` : `
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Set Travel Dates above to assign this to a specific day / time of day.</div>
                    `}
                </div>
            `).join('');

            panel.innerHTML = `
                <div class="card glass" style="padding:20px; border-radius:18px; border: 1.5px solid rgba(155, 89, 182, 0.25);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                        <span style="font-size: 1.2rem;">📋</span>
                        <h3 style="margin:0; color:#9b59b6; font-weight:800; letter-spacing:-0.01em;">Ticked for this generation <span style="background:rgba(155,89,182,0.12); color:#9b59b6; font-size:0.7rem; padding:2px 8px; border-radius:999px; margin-left:6px;">${tickedItems.length} item${tickedItems.length === 1 ? '' : 's'}</span></h3>
                        <button id="aiManageTodoBtn" type="button" style="margin-left:auto; background:transparent; border:0; color:var(--accent-blue); font-weight:700; font-size:0.82rem; cursor:pointer; padding:0;">Manage in To do list →</button>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin:0 0 12px; line-height:1.5;">${datesSet ? 'Pick a day and time of day for each — the AI will respect explicit slots when generating the itinerary.' : 'Set the Travel Dates above to assign these to specific days and times of day.'}</p>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                        ${cardsHtml}
                    </div>
                </div>
            `;

            (panel.querySelector('#aiManageTodoBtn') as HTMLButtonElement | null)?.addEventListener('click', () => navigate('todo'));
            // Per-card day/time select changes — write through to the
            // marked place + persist. No more tick/remove handlers
            // here; those live on /todo now.
            panel.querySelectorAll('.marked-day-select, .marked-time-select').forEach(sel => {
                (sel as HTMLSelectElement).onchange = () => {
                    const pid = (sel as HTMLElement).dataset.placeId;
                    if (!pid) return;
                    const card = panel.querySelector(`.ai-marked-card[data-place-id="${pid}"]`);
                    if (!card) return;
                    const daySel = (card.querySelector('.marked-day-select') as HTMLSelectElement | null);
                    const timeSel = (card.querySelector('.marked-time-select') as HTMLSelectElement | null);
                    setMarkedPlaceAssignment(
                        activeTrip,
                        pid,
                        daySel?.value || null,
                        (timeSel?.value as any) || null
                    );
                    emit('state:changed');
                    upsertTrip(activeTrip);
                };
            });
        };
        renderTodoListPanel();

        if (generatedItinerary) renderItineraryOutput(generatedItinerary, savedNumDays, tripCountry);

        const contextInput = (div.querySelector('#aiExtraContext') as HTMLTextAreaElement | null);
        if (contextInput) {
            contextInput.oninput = (e) => {
                activeTrip.aiContext = (e.target as HTMLTextAreaElement).value;
                emit('state:changed');
            };
        }

        // ── Gemini key plumbing ────────────────────────────────────
        // Wire the masked input, the 👁 eye toggle, and the (i) help
        // button. Persistence rides on emit('state:changed') →
        // saveState → localStorage. No dedicated request/network here.
        const keyInput = (div.querySelector('#aiKeyInput') as HTMLInputElement | null);
        const keyToggleBtn = (div.querySelector('#aiKeyToggleBtn') as HTMLButtonElement | null);
        const keyHelpBtn = (div.querySelector('#aiKeyHelpBtn') as HTMLButtonElement | null);
        const keyStatusEl = (div.querySelector('#aiKeyStatus') as HTMLElement | null);

        const renderKeyStatus = () => {
            if (!keyStatusEl) return;
            const v = (STATE.geminiApiKey || '').trim();
            if (!v) {
                keyStatusEl.textContent = 'No key saved — paste one above to enable AI generation.';
                keyStatusEl.style.color = '#ff9500';
                return;
            }
            // Light shape check — Gemini keys start "AIza" and are ~39
            // chars. Don't *block* on shape (Google may rotate format),
            // just hint when something looks off.
            const looksLegit = v.startsWith('AIza') && v.length >= 30;
            keyStatusEl.textContent = looksLegit ? '✓ Key saved on this device.' : '⚠ Saved, but the format looks off (Gemini keys usually start with "AIza"). Click i for help.';
            keyStatusEl.style.color = looksLegit ? '#1a6b3c' : '#ff9500';
        };
        renderKeyStatus();

        if (keyInput) {
            keyInput.addEventListener('input', () => {
                STATE.geminiApiKey = keyInput.value;
                emit('state:changed');
                renderKeyStatus();
            });
        }
        if (keyToggleBtn && keyInput) {
            keyToggleBtn.addEventListener('click', () => {
                const showing = keyInput.type === 'text';
                keyInput.type = showing ? 'password' : 'text';
                keyToggleBtn.textContent = showing ? '👁' : '🙈';
                keyToggleBtn.title = showing ? 'Show key' : 'Hide key';
            });
        }
        if (keyHelpBtn) {
            keyHelpBtn.addEventListener('click', () => {
                const { root: helpRoot, close: closeHelp } = showModal({
                    cardClass: 'card glass',
                    cardStyle: 'width: 520px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto; padding: 28px 32px; border-radius: 28px; background: white;',
                    innerHTML: `
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px;">
                            <h2 style="margin:0; font-size: 1.6rem; color:#9b59b6; font-weight: 800; letter-spacing:-0.02em;">✦ Get a Gemini API key</h2>
                            <button id="aiKeyHelpClose" class="close-x-btn" aria-label="Close">✕</button>
                        </div>
                        <p style="margin:0 0 14px; color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5;">
                            Free for personal use, takes about a minute. The key lives only on your device — pasting it
                            here saves it in this browser, and we send it on each AI generation request alongside the
                            prompt. We don't store it on our servers.
                        </p>
                        <ol style="margin: 0 0 16px 0; padding-left: 22px; color: #002d5b; font-size: 0.92rem; line-height: 1.7;">
                            <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style="color: var(--accent-blue); font-weight: 700;">aistudio.google.com/app/apikey</a> in a new tab.</li>
                            <li>Sign in with a regular Google account if prompted.</li>
                            <li>Click <strong>Create API key</strong>.</li>
                            <li>Pick <em>"Create API key in new project"</em> if you don't already have a Google Cloud project — fastest path.</li>
                            <li>Copy the long string that appears (it starts with <code style="background:rgba(0,0,0,0.05); padding:1px 5px; border-radius:4px; font-size:0.85em;">AIza…</code>).</li>
                            <li>Paste it into the <strong>AI Engine — Gemini</strong> box on this page.</li>
                        </ol>
                        <div style="background: rgba(155,89,182,0.06); border:1px solid rgba(155,89,182,0.18); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong>What's it for?</strong> Each itinerary you generate makes one Gemini API call. The
                            free tier comfortably covers casual personal use; paid tier kicks in only if you go
                            heavy. Your key is yours — clear it any time by emptying the input.
                        </div>
                        <!-- Free-tier limits. Google no longer publishes
                             fixed numbers on the docs page — they're
                             per-account and rotate based on tier /
                             usage / region — so we describe the shape
                             of the limits and link out to the live
                             dashboard rather than make up specifics. -->
                        <div style="margin-top: 12px; background: rgba(52,199,89,0.06); border:1px solid rgba(52,199,89,0.22); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong style="color:#1a6b3c;">How many itineraries can I generate?</strong>
                            <p style="margin:6px 0 0;">
                                Each generated itinerary is one API call. Google doesn't publish one fixed number for the free tier any more — limits depend on your account / region / how recently you signed up, and they rotate. In practice the free tier comfortably covers everyday personal planning; you'd have to be hammering Generate to feel a ceiling.
                            </p>
                            <div style="margin-top:8px;"><strong style="color:#1a6b3c;">There are two buckets that can stop you:</strong>
                                <ul style="margin: 4px 0 0; padding-left: 18px;">
                                    <li><strong>Per-minute</strong> (rolling) — refills automatically every minute. Hit when spam-clicking the button.</li>
                                    <li><strong>Per-day</strong> — resets on a 24-hour window. Hit only with sustained heavy use.</li>
                                </ul>
                            </div>
                            <div style="margin-top:8px;">
                                If a request fails with a "rate limit" / 429-style error, wait a minute and try again; if it persists the daily cap is full — try again tomorrow.
                            </div>
                            <div style="margin-top:8px; font-size: 0.78rem;">
                                See your <strong>actual</strong> numbers (and how much you've used) on Google's
                                <a href="https://aistudio.google.com/rate-limit?timeRange=last-28-days" target="_blank" rel="noreferrer" style="color: var(--accent-blue); font-weight: 700;">rate-limit dashboard</a>.
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                            <button id="aiKeyHelpDone" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">Got it</button>
                        </div>
                    `,
                });
                (helpRoot.querySelector('#aiKeyHelpClose') as HTMLButtonElement | null)?.addEventListener('click', closeHelp);
                (helpRoot.querySelector('#aiKeyHelpDone') as HTMLButtonElement | null)?.addEventListener('click', closeHelp);
            });
        }

        // Re-render the to-do list panel whenever the user types in
        // date inputs — this is what reveals the day/time-of-day
        // dropdowns once dates are set.
        ['#aiDateFrom', '#aiDateTo'].forEach(sel => {
            const el = (div.querySelector(sel) as HTMLInputElement | null);
            if (el) el.addEventListener('change', () => renderTodoListPanel());
        });

        div.querySelector('#generateBtn')?.addEventListener('click', async () => {
            const outputEl = q(div, '#itineraryOutput');
            const dateFrom = (q(div, '#aiDateFrom') as HTMLInputElement).value;
            const dateTo = (q(div, '#aiDateTo') as HTMLInputElement).value;
            const ctxInput = (document.getElementById('aiExtraContext') as HTMLTextAreaElement | null);
            const userContext = ctxInput?.value ?? '';
            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }
            const from = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);

            // Build the to-do-list suffix that gets appended to the
            // user's freeform context so Gemini sees both. Only items
            // with forAI:true (the ticked checkboxes in the panel above)
            // are sent — the user can untick to keep an item on the
            // to-do list while excluding it from this generation.
            // Format chosen to be unambiguous: each place on its own
            // line, with day and time-of-day labels when assigned. The
            // AI is instructed to incorporate these places where it
            // makes sense.
            const markedForAI = getMarkedPlaces(activeTrip).filter(p => p.forAI && p.forManual);
            let markedSuffix = '';
            if (markedForAI.length > 0) {
                const tripDays = (STATE.tripDays || [])
                    .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0);
                const dayNumberOf = (id: string) => tripDays.find(d => d.id === id)?.dayNumber;
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
                        // BYO key from the AI Engine card; backend falls
                        // back to its env var if this is empty.
                        gemini_key: (STATE.geminiApiKey || '').trim(),
                    })
                });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                generatedItinerary = d.itinerary;
                activeTrip.aiPlan = generatedItinerary ?? undefined; emit('state:changed');
                renderItineraryOutput(generatedItinerary, numDays, tripCountry);
                outputEl.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${(e as Error).message}</p></div>`;
            }
        });
    }, 0);

    return div;
}
