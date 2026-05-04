// @ts-check
// pages/home.js

import { STATE, emit } from '../state.js';
import { INSPIRATIONAL_PAIRS } from '../constants.js';
import { getMediaForTrip, showLiquidAlert, formatDayDate, q, showConfirmModal } from '../utils.js';
import { upsertDay, uploadMedia, deleteDayOnServer, upsertTrip } from '../api.js';
import { navigate } from '../router.js';
import { showPersTab } from './settings.js';
import { openNewTripModal, openAddDayModal, openEditTripModal } from '../modals.js';

// Empty-state slideshow timer. Lives in this module; router.js calls
// stopHomeSlideshow() on every navigate so the timer doesn't leak past home.
let _slideshowTimer = null;
export function stopHomeSlideshow() {
    if (_slideshowTimer) {
        clearInterval(_slideshowTimer);
        _slideshowTimer = null;
    }
}
let activeMarkers = {}; // Cache of Leaflet markers by day ID
let editingDayId = null; // ID of the day currently being geolocated/pinned
let activeMapClickListener = null; // Reference to the active map click handler
let openMenuDayId = null; // Track which day's sidebar menu is open

// Per-day card action helpers. The map setTimeout below detects
// activeMapClickListener and wires it on the map; these helpers just mutate
// the module-level state and re-navigate so renderHome runs again.
const toggleDayMenu = (dayId) => {
    openMenuDayId = (openMenuDayId === dayId) ? null : dayId;
    navigate('home', null, true); // Preserve scroll
};

const addDayPin = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    editingDayId = dayId;
    showLiquidAlert("Click on the map to set the location for this day!");

    activeMapClickListener = (e) => {
        day.lat = e.latlng.lat;
        day.lon = e.latlng.lng;
        day.lng = e.latlng.lng;
        activeMapClickListener = null;
        navigate('home', null, true);
    };

    navigate('home', null, true);
};

const editDayPin = (dayId) => {
    editingDayId = dayId;
    navigate('home', null, true);
};

const saveDayPin = async (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    editingDayId = null;
    activeMapClickListener = null;
    emit('state:changed');
    await upsertDay(day);
    showLiquidAlert("Location saved!");
    navigate('home', null, true);
};

const deleteDayPin = async (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    day.lat = null;
    day.lon = null;
    day.lng = null;
    editingDayId = null;
    activeMapClickListener = null;

    emit('state:changed');
    await upsertDay(day);
    navigate('home', null, true);
};

const deleteDay = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    showConfirmModal({
        title: `Delete Day ${day.dayNumber}?`,
        message: "This removes the day and all its journaling, photos, and documents. This can't be undone.",
        confirmText: "Delete Day",
        onConfirm: async () => {
            const tripId = day.tripId;

            STATE.tripDays = STATE.tripDays.filter(d => d.id !== dayId);

            // Renumber remaining days for this trip so dayNumber stays sequential.
            // Sort defensively — render relies on dayNumber order, but the array
            // itself isn't guaranteed to be sorted before this point.
            STATE.tripDays
                .filter(d => d.tripId === tripId)
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .forEach((d, i) => { d.dayNumber = i + 1; });

            if (openMenuDayId === dayId) openMenuDayId = null;
            if (editingDayId === dayId) {
                editingDayId = null;
                activeMapClickListener = null;
            }

            emit('state:changed');
            await deleteDayOnServer(dayId);
            // Persist the renumbered survivors so server stays in sync.
            await Promise.all(
                STATE.tripDays.filter(d => d.tripId === tripId).map(d => upsertDay(d))
            );
            showLiquidAlert("Day deleted");
            navigate('home', null, true);
        }
    });
};

export function renderHome() {
    const div = document.createElement('div');
    const activeTrip = (STATE.trips && STATE.activeTripId) ? STATE.trips.find(t => t.id === STATE.activeTripId) : null;
    let currentPhotoIdx = 0;

    // Determine data based on activeTrip or default
    let displayImages = [];
    let displayQuotes = [];

    if (!activeTrip) {
        // Shuffled slideshow for when NO trip is selected (Inspirational Quotes ONLY)
        displayImages = INSPIRATIONAL_PAIRS.map(p => p.i);
        displayQuotes = INSPIRATIONAL_PAIRS.map(p => p.q);

        // Shuffle the inspirational content
        const indices = Array.from({ length: displayImages.length }, (_, i) => i);
        indices.sort(() => Math.random() - 0.5);
        displayImages = indices.map(i => displayImages[i]);
        displayQuotes = indices.map(i => displayQuotes[i]);
    } else {
        // STATIC single image and alternate between quote/fact for the ACTIVE trip
        const data = getMediaForTrip(activeTrip);
        
        const showQuote = localStorage.getItem('home_media_toggle') !== 'fact';
        localStorage.setItem('home_media_toggle', showQuote ? 'fact' : 'quote');

        displayImages = [data.images[0]];
        displayQuotes = [showQuote ? data.quotes[0] : data.facts[0]];
    }

    const showNextImageAndQuote = () => {
        if (displayImages.length <= 1) return; // No need to cycle if only 1 image
        currentPhotoIdx = (currentPhotoIdx + 1) % displayImages.length;
        const imgEl = /** @type {HTMLImageElement | null} */ (div.querySelector('#homeHeroImg'));
        const quoteEl = /** @type {HTMLElement | null} */ (div.querySelector('#homeQuote'));
        if (imgEl) {
            imgEl.style.opacity = '0';
            setTimeout(() => {
                imgEl.src = displayImages[currentPhotoIdx];
                imgEl.style.opacity = '1';
            }, 800);
        }
        if (quoteEl) {
            quoteEl.style.opacity = '0';
            setTimeout(() => {
                quoteEl.innerText = displayQuotes[currentPhotoIdx % displayQuotes.length] || "";
                quoteEl.style.opacity = '1';
            }, 800);
        }
    };

    if (!activeTrip) {
        div.innerHTML = `
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 450px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <img id="homeHeroImg" src="${displayImages[0] || ''}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out; max-width: 60%;">
                        ${displayQuotes[0] || ''}
                    </p>
                    <button class="btn" id="homeCreateFirstTripBtn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;">Create Trips</button>
                </div>
            </div>
        `;
        stopHomeSlideshow();
        _slideshowTimer = setInterval(showNextImageAndQuote, 6000);
        div.querySelector('#homeCreateFirstTripBtn')?.addEventListener('click', () => openNewTripModal());
    } else {
        const tripExpenses = (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id);
        const tripDays = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
        const isFresh = tripExpenses.length === 0 && tripDays.length === 0;

        let greeting = "Welcome back, traveler";
        if (isFresh && activeTrip.country) {
            // Show state name only when it's a US state (format: "USA - California")
            const displayCountry = activeTrip.country.includes(' - ')
                ? activeTrip.country.split(' - ')[1]
                : activeTrip.country;
            const firstName = (STATE.user && STATE.user.firstName) ? STATE.user.firstName : "traveler";
            const greetings = [
                `Welcome back, ${firstName}!`,
                `Ready for your ${activeTrip.name} adventure?`,
                `Your ${displayCountry} adventure starts here.`,
                `Time to write your ${displayCountry} story.`
            ];
            greeting = greetings[Math.floor(Math.random() * greetings.length)];
        }

        div.innerHTML = `
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${greeting}</h1>
                ${activeTrip ? `<p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>` : `<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 400px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); pointer-events: none; z-index: 1;"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; pointer-events: none; z-index: 2;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out;">
                        ${displayQuotes[0] || ''}
                    </p>
                </div>
            </div>
        `;

        setTimeout(() => {
            const mapContainer = document.getElementById('homeHeroMap');
            if (mapContainer && typeof google !== 'undefined' && google.maps && activeTrip) {
                // New trips carry placeId + viewport directly; legacy trips
                // only have `country` (sometimes "USA - California"). Build the
                // free-text query for both Nominatim border lookup and the
                // Geocoder fallback in one place.
                const query = activeTrip.country || '';
                const isLegacyUSState = query.includes(' - ');
                const searchQuery = isLegacyUSState ? (query.split(' - ')[1] + ', USA') : query;
                const placeTypes = activeTrip.placeTypes || [];
                // Address-level places (a specific building, address, or POI)
                // have no meaningful admin polygon — skip the blue border for
                // those and just zoom to the location.
                const isAddressLevel = placeTypes.some(t =>
                    t === 'street_address' || t === 'premise' || t === 'point_of_interest' ||
                    t === 'establishment' || t === 'subpremise'
                );

                // Restore saved map view per trip
                const tripMapKey = activeTrip ? activeTrip.id : null;
                const savedMapView = tripMapKey && STATE.mapViews && STATE.mapViews[tripMapKey];

                const mapOptions = {
                    center: savedMapView ? { lat: savedMapView.lat, lng: savedMapView.lng } : { lat: 20, lng: 0 },
                    zoom: savedMapView ? savedMapView.zoom : 2,
                    minZoom: 2,
                    mapTypeId: 'hybrid', 
                    disableDefaultUI: true,
                    gestureHandling: 'greedy',
                    backgroundColor: '#ffffff',
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: []
                };

                const map = new google.maps.Map(mapContainer, mapOptions);
                window.activeMap = map; // Read by external Google Maps callbacks; keep on window.

                // Add pins for accepted Trip Days that have locations
                const currentTripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];
                activeMarkers = {}; // Reset cache
                currentTripDays.forEach(day => {
                    if (day.lat && (day.lon || day.lng)) {
                        const lon = day.lon || day.lng;
                        const isEditing = editingDayId === day.id;
                        
                        const marker = new google.maps.Marker({
                            position: { lat: day.lat, lng: lon },
                            map: map,
                            draggable: isEditing,
                            title: `Day ${day.dayNumber}: ${day.name}`,
                            label: {
                                text: String(day.dayNumber),
                                color: 'white',
                                fontWeight: '800',
                                fontSize: isEditing ? '14px' : '12px'
                            },
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillOpacity: 1,
                                fillColor: isEditing ? '#ff3b30' : '#007aff',
                                strokeColor: 'white',
                                strokeWeight: 2,
                                scale: isEditing ? 18 : 14,
                            }
                        });

                        activeMarkers[day.id] = marker;

                        if (isEditing) {
                            marker.addListener('dragend', () => {
                                const pos = marker.getPosition();
                                day.lat = pos.lat();
                                day.lon = pos.lng();
                                day.lng = pos.lng();
                            });
                        } else {
                            marker.addListener('click', () => {
                                map.panTo(marker.getPosition());
                                map.setZoom(12);
                            });
                        }
                    }
                });

                // Re-attach map click listener if we are in the middle of pinning
                if (activeMapClickListener) {
                    map.addListener('click', (e) => activeMapClickListener({ latlng: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
                    mapContainer.style.cursor = 'crosshair';
                }

                // Save Map View on change
                map.addListener('idle', () => {
                    if (!tripMapKey) return;
                    if (!STATE.mapViews) STATE.mapViews = {};
                    const center = map.getCenter();
                    STATE.mapViews[tripMapKey] = {
                        lat: center.lat(),
                        lng: center.lng(),
                        zoom: map.getZoom()
                    };
                    emit('state:changed');
                });

                // --- BULLETPROOF BORDER & ZOOM ---
                const cleanQuery = searchQuery.trim();

                // 1. Precision Zoom — only run when there's no saved view
                //    for this trip. Otherwise the user's last pan/zoom would
                //    be overridden every time they navigate back to the page.
                //    For trips with a stored viewport: use it directly (zero
                //    API calls). For legacy trips: Geocoder + persist result
                //    so the next render skips the lookup.
                if (!savedMapView) {
                    if (activeTrip.viewport) {
                        const v = activeTrip.viewport;
                        const bounds = new google.maps.LatLngBounds(
                            { lat: v.south, lng: v.west },
                            { lat: v.north, lng: v.east },
                        );
                        google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                            map.fitBounds(bounds);
                        });
                    } else {
                        const geocoder = new google.maps.Geocoder();
                        geocoder.geocode({ address: cleanQuery }, (results, status) => {
                            if (status === "OK" && results[0]) {
                                const bounds = results[0].geometry.viewport;
                                google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                                    map.fitBounds(bounds);
                                });
                                // Backfill: persist the geocoded viewport + center
                                // so this trip stops needing the geocoder on every
                                // render. Only writes once (next load short-circuits).
                                const sw = bounds.getSouthWest();
                                const ne = bounds.getNorthEast();
                                const center = results[0].geometry.location;
                                activeTrip.lat = center.lat();
                                activeTrip.lng = center.lng();
                                activeTrip.viewport = {
                                    south: sw.lat(), west: sw.lng(),
                                    north: ne.lat(), east: ne.lng(),
                                };
                                upsertTrip(activeTrip);
                            }
                        });
                    }
                }

                // 2. Nominatim for the Blue Border. Skipped for address/POI
                //    places — there's no meaningful polygon for "100 Main St."
                if (!isAddressLevel) {
                // Border lookup. Two-stage strategy:
                //   (a) Forward search by name — works for places with a clean
                //       polygon in OSM (countries, big cities, regions).
                //   (b) If forward fails, switch to *reverse* geocoding at the
                //       trip's coordinates with progressively coarser zoom.
                //       This is more reliable than walking comma-separated
                //       address parts: small towns (e.g. "Castro Marim,
                //       Portugal") have a 2-part formatted_address with
                //       nothing between the town and the country, but reverse
                //       at zoom 8 returns the surrounding *region* polygon.
                //
                //   Zoom level → Nominatim feature class:
                //     12  town/borough        10  city/county
                //      8  state/region         6  country
                const applyBorder = (geometry) => {
                    map.data.forEach(f => map.data.remove(f));
                    map.data.addGeoJson({ type: "Feature", geometry, properties: {} });
                    map.data.setStyle({
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        strokeColor: '#007aff',
                        strokeWeight: 2.2,
                        strokeOpacity: 0.9,
                        visible: true,
                        clickable: false,
                    });
                };

                const headers = { 'User-Agent': 'TheGreatGetaway/1.2' };
                (async () => {
                    // Stage A: forward search with the picked place name.
                    try {
                        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=1&polygon_geojson=1`;
                        const data = await fetch(url, { headers }).then(r => r.json());
                        const geom = data && data[0] && data[0].geojson;
                        if (geom && geom.type !== 'Point') {
                            applyBorder(geom);
                            return;
                        }
                    } catch (err) {
                        console.error("Border forward search failed:", err);
                    }

                    // Stage B: reverse geocode at finer-to-coarser zoom levels
                    // until something returns a real polygon. Skip if we lack
                    // coords (legacy trip pre-Places migration that hasn't been
                    // backfilled yet — the geocoder backfill above will fix it
                    // on the next render).
                    const lat = activeTrip.lat, lng = activeTrip.lng;
                    if (typeof lat !== 'number' || typeof lng !== 'number') {
                        console.warn("Border: no coords for reverse fallback on", cleanQuery);
                        return;
                    }
                    for (const zoom of [12, 10, 8, 6]) {
                        try {
                            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=${zoom}&format=json&polygon_geojson=1`;
                            const data = await fetch(url, { headers }).then(r => r.json());
                            const geom = data && data.geojson;
                            if (geom && geom.type !== 'Point') {
                                applyBorder(geom);
                                return;
                            }
                        } catch (err) {
                            console.error(`Border reverse@${zoom} failed:`, err);
                        }
                    }
                    console.warn("Border: no polygon at any zoom for", cleanQuery);
                })();

                // 3. Selective Labels (Overpass) — also gated by isAddressLevel
                //    since a single building has no city labels worth painting.
                fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=1`)
                .then(r => r.json())
                .then(d => {
                    if (d && d[0]) {
                        const result = d[0];
                        const areaId = (result.osm_type === 'relation') ? 3600000000 + parseInt(result.osm_id) : 
                                     (result.osm_type === 'way') ? 2400000000 + parseInt(result.osm_id) : null;

                        if (areaId) {
                            const overpassQuery = `[out:json][timeout:15];area(${areaId})->.searchArea;node["place"~"city|town"](area.searchArea);out center;`;
                            fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`)
                            .then(r => r.json())
                            .then(cityData => {
                                if (cityData && cityData.elements) {
                                    const cities = cityData.elements.sort((a, b) => {
                                        const popA = parseInt((a.tags && a.tags.population) || 0);
                                        const popB = parseInt((b.tags && b.tags.population) || 0);
                                        return popB - popA;
                                    }).slice(0, 15);

                                    cities.forEach(city => {
                                        if (city.lat && city.lon && city.tags && city.tags.name) {
                                            new google.maps.Marker({
                                                position: { lat: city.lat, lng: city.lon },
                                                map: map,
                                                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
                                                label: {
                                                    text: city.tags["name:en"] || city.tags.name,
                                                    color: 'white',
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    className: 'map-city-label'
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    }
                });
                } // end if (!isAddressLevel) — wraps blocks 2 and 3
            }
        }, 100);
    }

    // Shared logic for guide and days
    const tripExpenses = activeTrip ? (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id) : [];
    const tripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];


    // Getting Started Guide Checklist
    const guideContainer = document.createElement('div');
    guideContainer.style.marginTop = '40px';

    if (!STATE.guideProgress) STATE.guideProgress = {};

    const hasLogin = !!STATE.user || window.isGoogleAuthenticated === true;
    const hasTrip = STATE.trips.length > 0;
    const hasCompanions = (STATE.groups || []).length > 0;
    const hasPlan = tripDays.length > 0;
    const hasExpenses = tripExpenses.length > 0;
    const hasBudgets = STATE.budgets && STATE.budgets.length > 0;
    const hasCollections = STATE.archivedTrips && STATE.archivedTrips.length > 0;
    const hasCategories = (STATE.categories || []).length > 3; // Default is 3
    const hasSettlement = STATE.expenses.some(e => e.isSettlement);
    const hasFriends = false;

    if (hasLogin) STATE.guideProgress.login = true;
    if (hasTrip) STATE.guideProgress.trip = true;
    if (hasCompanions) STATE.guideProgress.companions = true;
    if (hasPlan) STATE.guideProgress.plan = true;
    if (hasExpenses) STATE.guideProgress.expenses = true;
    if (hasBudgets) STATE.guideProgress.budgets = true;
    if (hasCollections) STATE.guideProgress.collections = true;
    if (hasCategories) STATE.guideProgress.categories = true;
    if (hasSettlement) STATE.guideProgress.settlement = true;
    if (hasFriends) STATE.guideProgress.friends = true;

    const steps = [
        { text: "Log in to your account", done: STATE.guideProgress.login, icon: "🔐", action: () => navigate('profile') },
        { text: "Create your first trip", done: STATE.guideProgress.trip, icon: "✈️", action: () => openNewTripModal() },
        // Personalization page DOM (#persMenu/#persContent/#persCategories/
        // #persCompanions) only exists once the page has rendered, so navigate
        // first and switch the tab on the next tick.
        { text: "Add your travel companions", done: STATE.guideProgress.companions, icon: "👥", action: () => { navigate('personalization'); setTimeout(() => showPersTab('companions'), 50); } },
        { text: "Set your own categories", done: STATE.guideProgress.categories, icon: "🏷️", action: () => { navigate('personalization'); setTimeout(() => showPersTab('categories'), 50); } },
        { text: 'Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span data-guide-action="open-add-day" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">create it manually</span>)</span>', done: STATE.guideProgress.plan, icon: "✦", action: () => navigate('ai') },
        { text: 'Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span data-guide-action="navigate-expenses" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">Manually</span> or <span data-guide-action="navigate-upload" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">in a batch</span>)</span>', done: STATE.guideProgress.expenses, icon: "💰", action: () => navigate('expenses') },
        { text: "Explore Budgets", done: STATE.guideProgress.budgets, icon: "📊", action: () => navigate('budgets') },
        { text: "Settle your first expenses", done: STATE.guideProgress.settlement, icon: "🤝", action: () => navigate('settlement') },
        { text: "Discover Collections", done: STATE.guideProgress.collections, icon: "📂", action: () => navigate('collections') },
        { text: "Connect with your friends", done: STATE.guideProgress.friends, icon: "📱", action: () => navigate('friends') }
    ];

    const allDone = steps.every(s => s.done) || STATE.guideAllDone;
    if (allDone && !STATE.guideAllDone) {
        STATE.guideAllDone = true;
        emit('state:changed');
    }



    // No interval for active trips - keep it simple and aesthetic


    // Trip Days Section
    const daysContainer = document.createElement('div');
    daysContainer.style.marginTop = '40px';

    tripDays.sort((a, b) => a.dayNumber - b.dayNumber);

    const tripTitle = (activeTrip && activeTrip.name) ? activeTrip.name : 'Your Journey';

    daysContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${tripTitle}</h2>
                ${activeTrip ? `
                    <button id="editTripBtn" title="Edit trip name and location" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border-radius: 10px; border: 1px solid rgba(0,0,0,0.06); background: rgba(0,0,0,0.03); color: #002d5b; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.08)'; this.style.borderColor='rgba(0,113,227,0.2)'; this.style.color='var(--accent-blue)';" onmouseout="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='rgba(0,0,0,0.06)'; this.style.color='#002d5b';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                ` : ''}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${tripDays.length} Day${tripDays.length !== 1 ? 's' : ''} of adventure</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 32px; position: relative; padding-left: 20px;">
            <!-- Subtle Timeline Line -->
            <div style="position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(180deg, var(--accent-blue) 0%, rgba(0,113,227,0.05) 100%); border-radius: 1px; opacity: 0.3;"></div>

            ${tripDays.map(day => {
                const isOpen = openMenuDayId === day.id;
                return `
                <div style="display: flex; align-items: flex-start; gap: ${isOpen ? '24px' : '0'}; position: relative; transition: gap 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
                    <!-- Timeline Dot -->
                    <div style="position: absolute; left: -14px; top: 22px; width: 10px; height: 10px; border-radius: 50%; background: ${isOpen ? 'var(--accent-blue)' : 'white'}; border: 2px solid var(--accent-blue); z-index: 2; box-shadow: 0 0 0 4px white;"></div>

                    <!-- LEFT SPACE MENU — collapses both width AND height to 0 when closed.
                         (Width alone isn't enough: flex column children still stack to their
                         natural height, which would inflate the row and leave a vertical gap.) -->
                    <div style="width: ${isOpen ? '200px' : '0'}; min-width: ${isOpen ? '200px' : '0'}; max-height: ${isOpen ? '500px' : '0'}; opacity: ${isOpen ? 1 : 0}; transform: translateX(${isOpen ? '0' : '-20px'}); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.4s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: ${isOpen ? 'auto' : 'none'}; overflow: hidden; display: flex; flex-direction: column; gap: 8px; padding-top: ${isOpen ? '4px' : '0'};">
                        <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-blue); margin-bottom: 4px; padding-left: 12px;">Actions</div>
                        
                        ${editingDayId === day.id ? `
                            <div style="display: flex; gap: 4px;">
                                <button class="day-pin-save-btn" data-day-id="${day.id}" style="flex: 2; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: #34c759; color: white; font-size: 0.85rem; font-weight: 700; cursor: pointer;">Save Pin</button>
                                <button class="day-pin-delete-btn" data-day-id="${day.id}" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: rgba(255,59,48,0.1); color: #ff3b30; font-size: 0.85rem; font-weight: 700; cursor: pointer;">X</button>
                            </div>
                        ` : `
                            <button class="day-pin-toggle-btn" data-day-id="${day.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,113,227,0.06); color: var(--accent-blue); font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.12)';" onmouseout="this.style.background='rgba(0,113,227,0.06)';">
                                <span>${day.lat ? '📍 Edit Pin Location' : '📍 Add Pin to Map'}</span>
                            </button>
                        `}

                        <button class="day-journaling-btn" data-day-id="${day.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>✍️ Journaling</span>
                        </button>

                        <button class="day-photos-btn" data-day-id="${day.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📸 Add Photos</span>
                        </button>

                        <button class="day-documents-btn" data-day-id="${day.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📄 Documents</span>
                        </button>

                        <button class="day-delete-btn" data-day-id="${day.id}" style="margin-top: 4px; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(255,59,48,0.06); color: #ff3b30; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.12)';" onmouseout="this.style.background='rgba(255,59,48,0.06)';">
                            <span>🗑️ Delete Day</span>
                        </button>
                    </div>

                    <!-- MAIN CARD -->
                    <div class="day-card card glass"
                         data-day-id="${day.id}"
                         style="flex: 1; padding: 20px 28px; border-radius: 28px; border: 1.5px solid ${isOpen ? 'var(--accent-blue)' : 'rgba(0,0,0,0.05)'}; background: ${isOpen ? 'rgba(255,255,255,0.95)' : 'white'}; cursor: pointer; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: ${isOpen ? '0 20px 40px rgba(0,0,0,0.1)' : 'none'};"
                         onmouseover="${!isOpen ? "this.style.transform='translateX(8px)'; this.style.borderColor='rgba(0,113,227,0.2)';" : ""}"
                         onmouseout="${!isOpen ? "this.style.transform='none'; this.style.borderColor='rgba(0,0,0,0.05)';" : ""}">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 20px;">
                                <div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(0,113,227,0.15);">
                                    <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05em; line-height: 1;">Day</span>
                                    <span style="font-size: 1.4rem; font-weight: 800; line-height: 1.1;">${day.dayNumber}</span>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">${day.name}</h3>
                                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                        <span>📅 ${formatDayDate(day.date) || 'Set date'}</span>
                                        ${day.lat ? `<span style="color: var(--accent-blue); opacity: 0.6;">•</span> <span style="color: var(--accent-blue);">📍 Location Set</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; align-items: center; gap: 16px;">
                                ${isOpen ? `
                                    <button class="btn btn-liquid-glass day-detail-btn" data-day-id="${day.id}" style="padding: 8px 16px; font-size: 0.8rem; font-weight: 700; background: var(--accent-blue); color: white; border: none; border-radius: 10px;">Open Full Plan</button>
                                ` : `
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; color: #002d5b; transition: all 0.3s;">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </div>
                                `}
                            </div>
                        </div>

                        ${isOpen && day.notes ? `
                            <div style="margin-top: 20px; padding: 16px; background: rgba(0,0,0,0.02); border-radius: 16px; border-left: 4px solid var(--accent-blue);">
                                <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 8px;">Journaling Preview</div>
                                <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${day.notes}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `}).join('')}
            
            <!-- ADD DAY BUTTON (Vertical Timeline Style) -->
            <div id="addDayBtn" style="margin-top: 8px; display: flex; align-items: center; gap: 24px; cursor: pointer; group" onmouseover="this.querySelector('.add-dot').style.transform='scale(1.3)'; this.querySelector('.add-text').style.color='var(--accent-blue)';" onmouseout="this.querySelector('.add-dot').style.transform='none'; this.querySelector('.add-text').style.color='var(--text-secondary)';">
                <div class="add-dot" style="width: 14px; height: 14px; border-radius: 50%; border: 2px dashed var(--accent-blue); background: transparent; transition: all 0.3s; margin-left: -2px;"></div>
                <div class="add-text" style="font-weight: 700; color: var(--text-secondary); font-size: 1rem; transition: all 0.3s; letter-spacing: -0.01em;">+ Add a new day to your journey</div>
            </div>
        </div>
    `;

    if (activeTrip) {
        div.appendChild(daysContainer);

        // Delegated handler — per-day rows are dynamic; inner action buttons are
        // checked first so the outer card click (toggleDayMenu) only fires when
        // the user clicked the card body itself, not an action button.
        daysContainer.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement | null} */ (e.target);
            if (!target) return;

            // Edit-trip pencil — sits at the top of daysContainer, no per-day data.
            if (target.closest('#editTripBtn')) { openEditTripModal(activeTrip); return; }

            const saveBtn = /** @type {HTMLElement | null} */ (target.closest('.day-pin-save-btn'));
            if (saveBtn?.dataset.dayId) { saveDayPin(saveBtn.dataset.dayId); return; }

            const delPinBtn = /** @type {HTMLElement | null} */ (target.closest('.day-pin-delete-btn'));
            if (delPinBtn?.dataset.dayId) { deleteDayPin(delPinBtn.dataset.dayId); return; }

            const togglePinBtn = /** @type {HTMLElement | null} */ (target.closest('.day-pin-toggle-btn'));
            if (togglePinBtn?.dataset.dayId) {
                const dayId = togglePinBtn.dataset.dayId;
                const day = STATE.tripDays.find(d => d.id === dayId);
                if (day?.lat) editDayPin(dayId);
                else addDayPin(dayId);
                return;
            }

            const journalBtn = /** @type {HTMLElement | null} */ (target.closest('.day-journaling-btn'));
            if (journalBtn?.dataset.dayId) { openJournalingModal(journalBtn.dataset.dayId); return; }

            const photosBtn = /** @type {HTMLElement | null} */ (target.closest('.day-photos-btn'));
            if (photosBtn?.dataset.dayId) { openPhotosModal(photosBtn.dataset.dayId); return; }

            const docsBtn = /** @type {HTMLElement | null} */ (target.closest('.day-documents-btn'));
            if (docsBtn?.dataset.dayId) { openDocumentsModal(docsBtn.dataset.dayId); return; }

            const delDayBtn = /** @type {HTMLElement | null} */ (target.closest('.day-delete-btn'));
            if (delDayBtn?.dataset.dayId) { deleteDay(delDayBtn.dataset.dayId); return; }

            const detailBtn = /** @type {HTMLElement | null} */ (target.closest('.day-detail-btn'));
            if (detailBtn?.dataset.dayId) { openDayDetail(detailBtn.dataset.dayId); return; }

            // Outer card click — only reached if no inner button matched.
            const card = /** @type {HTMLElement | null} */ (target.closest('.day-card'));
            if (card?.dataset.dayId) { toggleDayMenu(card.dataset.dayId); return; }
        });

        setTimeout(() => {
            const addBtn = /** @type {HTMLButtonElement | null} */ (div.querySelector('#addDayBtn'));
            if (addBtn) addBtn.onclick = () => openAddDayModal();
        }, 0);
    }

    // Toggle state for Quick Access (Moved to bottom)
    const isHidden = STATE.hideQuickAccess === true;

    if (isHidden) {
        const showBtnContainer = document.createElement('div');
        showBtnContainer.style.textAlign = 'center';
        showBtnContainer.style.marginTop = '40px';
        showBtnContainer.innerHTML = `
            <button class="btn btn-liquid-glass" style="padding: 10px 24px; border-radius: 980px; font-size: 0.85rem; font-weight: 700; color: #002d5b; border: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.4);" onmouseover="this.style.background='rgba(255,255,255,0.7)';" onmouseout="this.style.background='rgba(255,255,255,0.4)';">
                🧭 Show Quick Access
            </button>
        `;
        const showBtn = /** @type {HTMLButtonElement | null} */ (showBtnContainer.querySelector('button'));
        if (showBtn) showBtn.onclick = () => {
            STATE.hideQuickAccess = false;
            emit('state:changed');
            navigate('home');
        };
        div.appendChild(showBtnContainer);
    } else {
        guideContainer.innerHTML = `
            <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${allDone ? 'rgba(0,0,0,0.05)' : 'rgba(0, 122, 255, 0.15)'}; background: ${allDone ? 'rgba(255,255,255,0.4)' : 'linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))'}; position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: ${allDone ? '#000000' : 'var(--accent-blue)'}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${allDone ? '⚡️' : '🧭'}</div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${allDone ? 'Quick Access' : 'Getting Started Guide'}</h2>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${allDone ? `<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>` : ''}
                        <button id="hideQuickAccessBtn" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); padding: 6px 14px; border-radius: 980px; color: rgba(0,0,0,0.5); cursor: pointer; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='rgba(0,0,0,0.5)'; this.style.borderColor='rgba(0,0,0,0.05)';">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${steps.map((step, i) => {
            const showTick = !allDone && step.done;
            return `
                        <div class="guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: ${showTick ? 'rgba(52, 199, 89, 0.08)' : 'white'}; border-radius: 20px; border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.2)' : 'rgba(0,0,0,0.05)'}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                            ${allDone ? `
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${step.icon}</div>
                            ` : `
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${showTick ? '#34c759' : 'rgba(0,45,91,0.1)'}; display: flex; align-items: center; justify-content: center; color: ${showTick ? '#34c759' : 'rgba(0,0,0,0.4)'}; font-weight: 800; font-size: 0.8rem; background: ${showTick ? 'white' : 'rgba(0,0,0,0.02)'}; flex-shrink: 0;">
                                ${showTick ? '✓' : step.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${!allDone ? `<div style="font-size: 0.75rem; font-weight: 800; color: ${showTick ? '#34c759' : 'rgba(0,45,91,0.4)'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${i + 1}</div>` : ''}
                                <div style="font-size: 1rem; font-weight: 700; color: ${showTick ? 'rgba(0,45,91,0.6)' : '#002d5b'}; text-decoration: ${showTick ? 'line-through' : 'none'};">
                                    ${step.text}
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;

        setTimeout(() => {
            // Delegated handler — inner [data-guide-action] spans are checked
            // first so they don't bubble to the outer card's main action.
            guideContainer.addEventListener('click', (e) => {
                const target = /** @type {HTMLElement | null} */ (e.target);
                if (!target) return;

                const innerAction = /** @type {HTMLElement | null} */ (target.closest('[data-guide-action]'));
                if (innerAction) {
                    const action = innerAction.dataset.guideAction;
                    if (action === 'open-add-day') {
                        // openAddDayModal handles the no-active-trip case itself
                        // with its own alert; no pre-check needed.
                        openAddDayModal();
                    } else if (action === 'navigate-expenses') {
                        navigate('expenses');
                    } else if (action === 'navigate-upload') {
                        navigate('upload');
                    }
                    return;
                }

                const card = /** @type {HTMLElement | null} */ (target.closest('.guide-step-card'));
                if (card?.dataset.index) {
                    const idx = Number(card.dataset.index);
                    steps[idx]?.action();
                }
            });
            const hBtn = /** @type {HTMLButtonElement | null} */ (guideContainer.querySelector('#hideQuickAccessBtn'));
            if (hBtn) hBtn.onclick = (e) => {
                e.stopPropagation();
                STATE.hideQuickAccess = true;
                emit('state:changed');
                navigate('home');
            };
        }, 0);

        div.appendChild(guideContainer);
    }

    return div;
}

// --- Day Interaction Modals (Extracted from Map Logic) ---
const openJournalingModal = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    modal.innerHTML = `
        <div class="card glass" style="width: 580px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.9); box-shadow: 0 40px 100px rgba(0,0,0,0.2);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${day.dayNumber} Journaling</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Capture your memories and stories from ${day.name}</p>
            <textarea id="journalText" class="glass-input" style="width: 100%; height: 240px; padding: 20px; border-radius: 20px; font-size: 1.05rem; line-height: 1.6; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05);" placeholder="What happened today? How did you feel?">${day.notes || ''}</textarea>
            <div style="display: flex; gap: 12px;">
                <button id="saveJournalBtn" class="btn" style="flex: 2; padding: 16px; border-radius: 16px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1rem; border: none;">Save Story</button>
                <button id="closeJournalBtn" class="btn" style="flex: 1; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    /** @type {HTMLButtonElement} */ (q(modal, '#closeJournalBtn')).onclick = () => modal.remove();
    /** @type {HTMLButtonElement} */ (q(modal, '#saveJournalBtn')).onclick = async () => {
        day.notes = /** @type {HTMLTextAreaElement} */ (q(modal, '#journalText')).value;
        emit('state:changed');
        await upsertDay(day);
        showLiquidAlert("Memories saved!");
        modal.remove();
        navigate('home', null, true);
    };
};

const openPhotosModal = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    if (!day.photos) day.photos = [];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    modal.innerHTML = `
        <div class="card glass" style="width: 500px; padding: 32px; border-radius: 40px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Photo Gallery</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Add images that define your Day ${day.dayNumber}</p>
            <div id="photoList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; max-height: 300px; overflow-y: auto; padding: 4px;">
                ${day.photos.length === 0 ? '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No photos added yet.</p>' : 
                    day.photos.map((p, idx) => `
                        <div style="position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                            <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;">
                            <button class="remove-photo-btn" data-day-id="${dayId}" data-photo-idx="${idx}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,59,48,0.8); color: white; border: none; font-size: 0.7rem; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join('')
                }
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                <label class="btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; background: rgba(0,113,227,0.1); color: var(--accent-blue); cursor: pointer; border: 1px dashed var(--accent-blue); transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.1)';" id="uploadLabel">
                    <span id="uploadStatusText">📤 Upload Photo</span>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                </label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                    <span style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">OR</span>
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="photoUrl" class="glass-input" placeholder="Paste image URL here..." style="flex: 1; padding: 14px; border-radius: 14px; font-size: 0.9rem;">
                    <button id="addPhotoBtn" class="btn" style="padding: 14px 20px; border-radius: 14px; background: var(--accent-blue); color: white; font-weight: 700;">Add</button>
                </div>
            </div>
            <button id="closePhotosBtn" class="btn" style="width: 100%; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Done</button>
        </div>
    `;
    document.body.appendChild(modal);
    const fileInput = /** @type {HTMLInputElement} */ (q(modal, '#photoUpload'));
    fileInput.onchange = async (e) => {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
        if (!file) return;
        const status = q(modal, '#uploadStatusText');
        status.textContent = "⌛ Uploading...";
        const res = await uploadMedia(file);
        if (res && res.url) {
            day.photos.push(res.url);
            emit('state:changed');
            await upsertDay(day);
            modal.remove();
            openPhotosModal(dayId);
        } else {
            status.textContent = "❌ Failed. Try again.";
        }
    };
    /** @param {string} dId @param {number} idx */
    const removePhoto = async (dId, idx) => {
        day.photos.splice(idx, 1);
        emit('state:changed');
        await upsertDay(day);
        modal.remove();
        openPhotosModal(dId);
    };
    // Delegated handler for the per-photo "✕" buttons in the gallery grid.
    modal.addEventListener('click', (e) => {
        const removeBtn = /** @type {HTMLElement | null} */ (
            /** @type {HTMLElement | null} */ (e.target)?.closest('.remove-photo-btn')
        );
        if (removeBtn?.dataset.dayId && removeBtn.dataset.photoIdx) {
            removePhoto(removeBtn.dataset.dayId, parseInt(removeBtn.dataset.photoIdx, 10));
        }
    });
    /** @type {HTMLButtonElement} */ (q(modal, '#addPhotoBtn')).onclick = async () => {
        const url = /** @type {HTMLInputElement} */ (q(modal, '#photoUrl')).value;
        if (url) {
            day.photos.push(url);
            emit('state:changed');
            await upsertDay(day);
            modal.remove();
            openPhotosModal(dayId);
        }
    };
    /** @type {HTMLButtonElement} */ (q(modal, '#closePhotosBtn')).onclick = () => {
        modal.remove();
        navigate('home', null, true);
    };
};

const openDocumentsModal = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    if (!day.documents) day.documents = [];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    modal.innerHTML = `
        <div class="card glass" style="width: 460px; padding: 32px; border-radius: 40px; background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Documents</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Tickets, bookings, and important info</p>
            <div id="docList" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; max-height: 250px; overflow-y: auto;">
                ${day.documents.length === 0 ? '<p style="text-align: center; color: var(--text-secondary); padding: 32px;">No documents linked.</p>' : 
                    day.documents.map((d, idx) => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                                <span style="font-size: 1.2rem;">📄</span>
                                <a href="${d.url}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.name}</a>
                            </div>
                            <button class="remove-doc-btn" data-day-id="${dayId}" data-doc-idx="${idx}" style="background: none; border: none; color: #ff3b30; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join('')
                }
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                <label class="btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; background: rgba(0,113,227,0.1); color: var(--accent-blue); cursor: pointer; border: 1px dashed var(--accent-blue); transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.1)';" id="uploadDocLabel">
                    <span id="uploadDocStatusText">📤 Upload Document</span>
                    <input type="file" id="docUpload" style="display: none;">
                </label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 800;">OR</span>
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                </div>
                <input type="text" id="docName" class="glass-input" placeholder="Document Name (e.g. Flight Ticket)" style="padding: 12px; border-radius: 12px;">
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="docUrl" class="glass-input" placeholder="Link to document (Google Drive, URL...)" style="flex: 1; padding: 12px; border-radius: 12px;">
                    <button id="addDocBtn" class="btn" style="padding: 12px 20px; border-radius: 12px; background: var(--accent-blue); color: white; font-weight: 700;">Add</button>
                </div>
            </div>
            <button id="closeDocsBtn" class="btn" style="width: 100%; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    // day.documents is initialized to [] above this block; capture into a
    // local non-undefined ref so the closures below see the narrowed type.
    const docs = day.documents;
    const docInput = /** @type {HTMLInputElement} */ (q(modal, '#docUpload'));
    docInput.onchange = async (e) => {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
        if (!file) return;
        const status = q(modal, '#uploadDocStatusText');
        status.textContent = "⌛ Uploading...";
        const res = await uploadMedia(file);
        if (res && res.url) {
            docs.push({ name: res.name || file.name, url: res.url });
            emit('state:changed');
            await upsertDay(day);
            modal.remove();
            openDocumentsModal(dayId);
        } else {
            status.textContent = "❌ Failed. Try again.";
        }
    };
    /** @param {string} dId @param {number} idx */
    const removeDoc = async (dId, idx) => {
        docs.splice(idx, 1);
        emit('state:changed');
        await upsertDay(day);
        modal.remove();
        openDocumentsModal(dId);
    };
    // Delegated handler for the per-doc "✕" buttons.
    modal.addEventListener('click', (e) => {
        const removeBtn = /** @type {HTMLElement | null} */ (
            /** @type {HTMLElement | null} */ (e.target)?.closest('.remove-doc-btn')
        );
        if (removeBtn?.dataset.dayId && removeBtn.dataset.docIdx) {
            removeDoc(removeBtn.dataset.dayId, parseInt(removeBtn.dataset.docIdx, 10));
        }
    });
    /** @type {HTMLButtonElement} */ (q(modal, '#addDocBtn')).onclick = async () => {
        const name = /** @type {HTMLInputElement} */ (q(modal, '#docName')).value;
        const url = /** @type {HTMLInputElement} */ (q(modal, '#docUrl')).value;
        if (name && url) {
            docs.push({ name, url });
            emit('state:changed');
            await upsertDay(day);
            modal.remove();
            openDocumentsModal(dayId);
        }
    };
    /** @type {HTMLButtonElement} */ (q(modal, '#closeDocsBtn')).onclick = () => modal.remove();
};

const openDayDetail = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    modal.innerHTML = `
        <div class="card glass" style="width: 800px; max-height: 90vh; overflow-y: auto; padding: 48px; border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="background: var(--accent-blue); color: white; padding: 4px 12px; border-radius: 8px; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">Day ${day.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: 0.9rem;">${formatDayDate(day.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${day.name}</h2>
                </div>
                <button id="closeDetailBtn" style="background: rgba(0,0,0,0.05); border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Morning</h4>
                        <textarea class="glass-input plan-input" data-time="morning" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Morning plans...">${day.plan?.morning || ''}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #ff9500;">Afternoon</h4>
                        <textarea class="glass-input plan-input" data-time="afternoon" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Afternoon plans...">${day.plan?.afternoon || ''}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #5856d6;">Evening</h4>
                        <textarea class="glass-input plan-input" data-time="evening" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Evening plans...">${day.plan?.evening || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="flex: 1; background: rgba(0,113,227,0.05); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Personal Notes</h4>
                        <textarea id="detailNotes" style="width: 100%; height: 200px; background: transparent; border: none; font-size: 1rem; color: #002d5b; resize: none;" placeholder="Private thoughts about this day...">${day.notes || ''}</textarea>
                    </div>
                    <div style="background: #000000; padding: 24px; border-radius: 24px; color: white;">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #34c759;">Expert Tip</h4>
                        <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; opacity: 0.9;">${day.tip || "Always keep a portable charger and a small bottle of water in your bag for long exploration days."}</p>
                    </div>
                    <button id="saveDetailBtn" class="btn" style="width: 100%; padding: 20px; border-radius: 20px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1.1rem; border: none; box-shadow: 0 15px 30px rgba(0,113,227,0.2);">Save All Changes</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    /** @type {HTMLButtonElement} */ (q(modal, '#closeDetailBtn')).onclick = () => modal.remove();
    /** @type {HTMLButtonElement} */ (q(modal, '#saveDetailBtn')).onclick = async () => {
        const morning = /** @type {HTMLTextAreaElement} */ (q(modal, '[data-time="morning"]')).value;
        const afternoon = /** @type {HTMLTextAreaElement} */ (q(modal, '[data-time="afternoon"]')).value;
        const evening = /** @type {HTMLTextAreaElement} */ (q(modal, '[data-time="evening"]')).value;
        const notes = /** @type {HTMLTextAreaElement} */ (q(modal, '#detailNotes')).value;
        day.plan = { morning, afternoon, evening };
        day.notes = notes;
        emit('state:changed');
        await upsertDay(day);
        showLiquidAlert("Itinerary updated!");
        modal.remove();
        navigate('home');
    };
};



