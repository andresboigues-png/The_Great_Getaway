// @ts-check
// pages/home.js

import { STATE, emit } from '../state.js';
import { INSPIRATIONAL_PAIRS } from '../constants.js';
import { getMediaForTrip, showLiquidAlert, formatDayDate, q, showConfirmModal, generateId, cleanPlaceName, esc } from '../utils.js';
import { upsertDay, uploadMedia, deleteDayOnServer, upsertTrip } from '../api.js';
import { navigate } from '../router.js';
import { showPersTab } from './settings.js';
import { openNewTripModal, openAddDayModal, openEditTripModal, openCompanionPickerModal, openTripMembersModal } from '../modals.js';
import { canEdit, canManageRoster, ROLE_PLANNER } from '../permissions.js';
import { findCompanion, findCompanionByLinkedUser } from '../companions.js';

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
    const isStartingPoint = Number(day.dayNumber) === 0;

    showConfirmModal({
        title: isStartingPoint ? 'Remove Trip Genesis?' : `Delete Day ${day.dayNumber}?`,
        message: "This removes the day and all its journaling, photos, and documents. This can't be undone.",
        confirmText: isStartingPoint ? 'Remove' : 'Delete Day',
        onConfirm: async () => {
            const tripId = day.tripId;

            STATE.tripDays = STATE.tripDays.filter(d => d.id !== dayId);

            // Renumber remaining numbered days starting from 1. Day 0
            // (Trip Genesis) is preserved as-is — it's not part of the
            // sequential numbering.
            STATE.tripDays
                .filter(d => d.tripId === tripId && Number(d.dayNumber) > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .forEach((d, i) => { d.dayNumber = i + 1; });

            if (openMenuDayId === dayId) openMenuDayId = null;
            if (editingDayId === dayId) {
                editingDayId = null;
                activeMapClickListener = null;
            }

            // Clear the per-trip Day-0 flag when the user removes Genesis,
            // so a subsequent home render can lazy-recreate it cleanly.
            if (isStartingPoint) {
                try { sessionStorage.removeItem(`tggDay0Created:${tripId}`); } catch (_) {}
            }

            emit('state:changed');
            await deleteDayOnServer(dayId);
            // Persist the renumbered survivors so server stays in sync.
            await Promise.all(
                STATE.tripDays.filter(d => d.tripId === tripId).map(d => upsertDay(d))
            );
            showLiquidAlert(isStartingPoint ? 'Trip Genesis removed' : 'Day deleted');
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

    /** The border IIFE (further down in this same render) calls
     *  addDiscoveredCountry() each time a new ISO country code surfaces
     *  from Nominatim. Quotes/facts/images for that country then join the
     *  slideshow roster on its next tick. Default no-op so the no-trip
     *  branch doesn't have to special-case it. */
    /** @type {(cc: string | null | undefined) => void} */
    let addDiscoveredCountry = () => {};

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
        const showQuote = localStorage.getItem('home_media_toggle') !== 'fact';
        localStorage.setItem('home_media_toggle', showQuote ? 'fact' : 'quote');

        /** @type {Set<string>} ISO codes seen for this trip. */
        const discoveredCodes = new Set();
        if (activeTrip.countryCode) discoveredCodes.add(activeTrip.countryCode);

        // Pull country codes for already-geocoded day pins out of
        // sessionStorage at render time — saves the wait for the async
        // reverse-geocode loop to repopulate the roster on every reload.
        // (cache writer lives in the map-init block below.)
        const tripDaysForRoster = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
        for (const day of tripDaysForRoster) {
            const lat = day.lat, lng = day.lon || day.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number') continue;
            try {
                const cached = sessionStorage.getItem(`tggDayCountry:${lat.toFixed(4)},${lng.toFixed(4)}`);
                if (cached) discoveredCodes.add(cached);
            } catch (_) { /* sessionStorage unavailable */ }
        }

        const refreshSlideshowMedia = () => {
            const data = getMediaForTrip(activeTrip, [...discoveredCodes]);
            // Random pick from the country roster — on reload you might see
            // Italy's "la dolce vita" or Portugal's population fact, etc.
            // No timer cycles this; reload to roll again.
            const pool = showQuote ? data.quotes : data.facts;
            const idx = pool.length > 0 ? Math.floor(Math.random() * pool.length) : 0;
            displayQuotes = [pool[idx] || ''];
            displayImages = data.images.length > idx ? [data.images[idx]] : (data.images[0] ? [data.images[0]] : []);
            if (currentPhotoIdx >= displayImages.length) currentPhotoIdx = 0;
        };
        refreshSlideshowMedia();

        // When the geocoder later discovers a new country for a day pin,
        // cache it so the *next* reload's roster is wider. We deliberately
        // don't refresh the on-screen quote mid-session — the user wanted
        // quotes to change on reload, not flicker as pins resolve.
        addDiscoveredCountry = (cc) => {
            if (!cc) return;
            const up = cc.toUpperCase();
            discoveredCodes.add(up);
        };
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
                <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass cover-card cover-card--lg">
                <img id="homeHeroImg" src="${displayImages[0] || ''}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div class="cover-card__gradient"></div>
                <div class="cover-card__content" style="display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" class="cover-card__quote" style="max-width: 60%;">
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
            // Show state name for US states ("USA - California" → "California");
            // strip postal-code prefixes ("8950 Castro Marim, Portugal" → "Castro Marim, Portugal")
            // before they leak into greetings/headers.
            const displayCountry = cleanPlaceName(
                activeTrip.country.includes(' - ')
                    ? activeTrip.country.split(' - ')[1]
                    : activeTrip.country
            );
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
                <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">${greeting}</h1>
                ${activeTrip ? `<p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>` : `<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <div class="card glass cover-card cover-card--md">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div class="cover-card__gradient" style="pointer-events: none; z-index: 1;"></div>
                <div class="cover-card__content" style="pointer-events: none; z-index: 2;">
                    <p id="homeQuote" class="cover-card__quote">
                        ${displayQuotes[0] || ''}
                    </p>
                </div>
            </div>
        `;

        // Active trips show only the map, no slideshow + no images. The
        // quote/fact at the top is statically picked at render time from
        // the multi-country roster (random index → on reload you may see
        // a different country's quote). Make sure no leftover timer from a
        // previous no-trip render keeps cycling on top of the map.
        stopHomeSlideshow();

        setTimeout(() => {
            const mapContainer = document.getElementById('homeHeroMap');
            if (mapContainer && typeof google !== 'undefined' && google.maps && activeTrip) {
                // Legacy trips only have `country` (sometimes "USA - California"
                // pre-Places-migration). Build a free-text query for the
                // Geocoder backfill that runs when viewport is missing.
                const query = activeTrip.country || '';
                const isLegacyUSState = query.includes(' - ');
                const searchQuery = isLegacyUSState ? (query.split(' - ')[1] + ', USA') : query;

                // Restore saved map view per trip
                const tripMapKey = activeTrip ? activeTrip.id : null;
                const savedMapView = tripMapKey && STATE.mapViews && STATE.mapViews[tripMapKey];

                const mapOptions = {
                    center: savedMapView ? { lat: savedMapView.lat, lng: savedMapView.lng } : { lat: 20, lng: 0 },
                    zoom: savedMapView ? savedMapView.zoom : 2,
                    minZoom: 2,
                    // hybrid = satellite imagery + roads/labels overlay. The
                    // POI-hiding `styles` below are ignored on satellite/hybrid
                    // (Google bakes them into the imagery), but the few labels
                    // hybrid does show stay readable, which is why hybrid > pure
                    // satellite for this trip-map use case.
                    mapTypeId: 'hybrid',
                    disableDefaultUI: true,
                    keyboardShortcuts: false,
                    gestureHandling: 'greedy',
                    backgroundColor: '#ffffff',
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
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
                        const isStartingPoint = day.dayNumber === 0;

                        // Genesis: green circle with a white star inside,
                        // shipped as one SVG data-URL — no text label, no
                        // font fallback, the glyph is part of the image so
                        // it never glitches on re-render.
                        // Numbered days: blue circle with the day number as a
                        // label.
                        const GENESIS_SVG = 'data:image/svg+xml;utf8,'
                            + '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'
                            + '<circle cx="24" cy="24" r="21" fill="%2334c759" stroke="white" stroke-width="3"/>'
                            + '<path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>'
                            + '</svg>';
                        const marker = new google.maps.Marker({
                            position: { lat: day.lat, lng: lon },
                            map: map,
                            draggable: isEditing,
                            title: isStartingPoint
                                ? 'Trip Genesis'
                                : `Day ${day.dayNumber}: ${day.name}`,
                            label: isStartingPoint
                                ? undefined
                                : {
                                    text: String(day.dayNumber),
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: isEditing ? '16px' : '14px',
                                },
                            icon: isStartingPoint
                                ? {
                                    url: GENESIS_SVG,
                                    scaledSize: new google.maps.Size(48, 48),
                                    anchor: new google.maps.Point(24, 24),
                                }
                                : {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    fillOpacity: 1,
                                    fillColor: isEditing ? '#ff3b30' : '#007aff',
                                    strokeColor: 'white',
                                    strokeWeight: 3,
                                    scale: isEditing ? 22 : 18,
                                },
                            zIndex: isStartingPoint ? 1 : 100, // numbered days draw above the genesis star
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

                // Slideshow country detection for day pins. We dropped the
                // blue-border drawing entirely (was unreliable across services),
                // so the only thing left worth doing here is widening the
                // home-page slideshow's country roster: reverse-geocode each
                // day pin once, pull the country code, feed addDiscoveredCountry.
                // Cached in sessionStorage so trip navigations don't re-bill
                // the Geocoder quota.
                if (currentTripDays.some(d => typeof d.lat === 'number')) {
                    /** @type {any} */
                    const _g = google;
                    const DAY_CACHE_PREFIX = 'tggDayCountry:';
                    const cachedCountryFor = async (lat, lng) => {
                        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
                        try {
                            const hit = sessionStorage.getItem(DAY_CACHE_PREFIX + key);
                            if (hit) return hit;
                        } catch (_) { /* unavailable */ }
                        try {
                            const geocoder = new _g.maps.Geocoder();
                            const resp = await geocoder.geocode({ location: { lat, lng } });
                            const results = (resp && resp.results) || [];
                            for (const r of results) {
                                const cc = (r.address_components || []).find(c => (c.types || []).includes('country'));
                                if (cc && cc.short_name) {
                                    const code = cc.short_name.toUpperCase();
                                    try { sessionStorage.setItem(DAY_CACHE_PREFIX + key, code); } catch (_) {}
                                    return code;
                                }
                            }
                        } catch (_) { /* ignore — no slideshow widening for this pin */ }
                        return '';
                    };
                    (async () => {
                        for (const day of currentTripDays) {
                            const pinLat = day.lat, pinLng = day.lon || day.lng;
                            if (typeof pinLat !== 'number' || typeof pinLng !== 'number') continue;
                            const code = await cachedCountryFor(pinLat, pinLng);
                            if (code) addDiscoveredCountry(code);
                        }
                    })();
                }
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
        { text: 'Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span data-guide-action="open-add-day" class="link-underline">create it manually</span>)</span>', done: STATE.guideProgress.plan, icon: "✦", action: () => navigate('ai') },
        { text: 'Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span data-guide-action="navigate-expenses" class="link-underline">Manually</span> or <span data-guide-action="navigate-upload" class="link-underline">in a batch</span>)</span>', done: STATE.guideProgress.expenses, icon: "💰", action: () => navigate('expenses') },
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

    // Day 0 / Trip Genesis: every trip with a known location auto-gets a
    // dayNumber:0 entry. We render it as a regular TripDay so the existing
    // pin / journaling / photos / documents / delete actions all work for
    // free — no special-case storage.
    //
    // Idempotency: track creation in sessionStorage too, not just by checking
    // tripDays. The pure tripDays check was racing with pullFromServer —
    // upsertDay's network round-trip hadn't completed by the time the next
    // render's pullFromServer overwrote STATE.tripDays from the backend, so
    // a fresh day-0 got created on every reload. The sessionStorage flag is
    // set synchronously and survives reloads within the session.
    if (activeTrip) {
        // Dedup any existing duplicates first — keeps oldest by id, deletes
        // the rest from STATE + backend. Self-heals trips that accumulated
        // duplicates from earlier buggy versions.
        const existingDay0s = tripDays.filter(d => Number(d.dayNumber) === 0);
        if (existingDay0s.length > 1) {
            for (const dup of existingDay0s.slice(1)) {
                STATE.tripDays = STATE.tripDays.filter(d => d.id !== dup.id);
                deleteDayOnServer(dup.id);
            }
            tripDays.length = 0;
            tripDays.push(...STATE.tripDays.filter(d => d.tripId === activeTrip.id));
        }

        const day0FlagKey = `tggDay0Created:${activeTrip.id}`;
        const flagSet = (() => {
            try { return sessionStorage.getItem(day0FlagKey) === '1'; }
            catch (_) { return false; }
        })();
        const hasDay0 = tripDays.some(d => Number(d.dayNumber) === 0);

        // If we have one already, just remember it for this session.
        if (hasDay0 && !flagSet) {
            try { sessionStorage.setItem(day0FlagKey, '1'); } catch (_) {}
        }

        // Create only when both signals say "missing" — no day-0 in state
        // AND we haven't already created one this session.
        if (!hasDay0
            && !flagSet
            && typeof activeTrip.lat === 'number'
            && typeof activeTrip.lng === 'number') {
            /** @type {import('../types').TripDay} */
            const day0 = {
                id: generateId(),
                tripId: activeTrip.id,
                name: 'Trip Genesis',
                date: '',
                dayNumber: 0,
                lat: activeTrip.lat,
                lng: activeTrip.lng,
                photos: [],
                notes: '',
                plan: { morning: '', afternoon: '', evening: '' },
                tickets: [],
                documents: [],
            };
            STATE.tripDays.push(day0);
            tripDays.push(day0);
            try { sessionStorage.setItem(day0FlagKey, '1'); } catch (_) {}
            upsertDay(day0);
            emit('state:changed');
        }
    }

    tripDays.sort((a, b) => a.dayNumber - b.dayNumber);

    const tripTitle = (activeTrip && activeTrip.name) ? activeTrip.name : 'Your Journey';
    // Phase 3 — role gating. The trip owner gets full edit controls; other
    // Planners can edit content (expenses/days) but can't reshape the
    // roster; Relaxers see the trip read-only.
    const tripIsManageable = canManageRoster(activeTrip);
    const tripIsEditable = canEdit(activeTrip);

    /** Inline panel below the trip header — a horizontal chip per
     *  participant with their role badge. Source order:
     *    1) Owner first (👑 Owner)
     *    2) Other accepted members (Planner / Relaxer pill)
     *    3) Unlinked companions still in trip.companions (Companion pill)
     *  Click anywhere on the panel routes through the same dispatcher
     *  the pill button uses, so behaviour is one source-of-truth. */
    const buildMemberChipsHtml = () => {
        if (!activeTrip) return '';
        const members = activeTrip.members || [];
        const companions = activeTrip.companions || [];

        /** @type {Array<{name: string, role: string|null, picture?: string|null, isOwner: boolean, isMember: boolean}>} */
        const chips = [];
        const seenMemberIds = new Set();

        const owner = members.find(m => m.userId === activeTrip.ownerId);
        if (owner) {
            chips.push({
                name: findCompanionByLinkedUser(owner.userId)?.name || owner.name || 'Owner',
                role: owner.role,
                picture: owner.picture,
                isOwner: true,
                isMember: true,
            });
            seenMemberIds.add(owner.userId);
        }
        for (const m of members) {
            if (seenMemberIds.has(m.userId)) continue;
            seenMemberIds.add(m.userId);
            chips.push({
                name: findCompanionByLinkedUser(m.userId)?.name || m.name || m.userId,
                role: m.role,
                picture: m.picture,
                isOwner: false,
                isMember: true,
            });
        }
        for (const name of companions) {
            const c = findCompanion(name);
            if (c?.linkedUserId && seenMemberIds.has(c.linkedUserId)) continue;
            chips.push({ name, role: null, isOwner: false, isMember: false });
        }

        if (chips.length === 0) return '';

        const renderChip = (/** @type {{name: string, role: string|null, picture?: string|null, isOwner: boolean, isMember: boolean}} */ chip) => {
            const initial = chip.name.charAt(0).toUpperCase() || '·';
            const avatar = chip.picture
                ? `<img class="member-chip__avatar" src="${esc(chip.picture)}" alt="">`
                : `<span class="member-chip__initial">${esc(initial)}</span>`;
            let badge;
            if (chip.isOwner) {
                badge = `<span class="member-chip__role member-chip__role--owner">👑 Owner</span>`;
            } else if (chip.isMember) {
                const label = chip.role === ROLE_PLANNER ? 'Planner' : 'Relaxer';
                const variant = chip.role === ROLE_PLANNER ? 'planner' : 'relaxer';
                badge = `<span class="member-chip__role member-chip__role--${variant}">${label}</span>`;
            } else {
                badge = `<span class="member-chip__role member-chip__role--companion">Companion</span>`;
            }
            return `<div class="member-chip ${chip.isOwner ? 'member-chip--owner' : ''}">${avatar}<span class="member-chip__name">${esc(chip.name)}</span>${badge}</div>`;
        };

        return `<div id="tripMembersPanel" class="trip-members-panel" title="${tripIsManageable ? 'Manage trip companions' : 'See who\'s on this trip'}">${chips.map(renderChip).join('')}</div>`;
    };
    const memberChipsHtml = buildMemberChipsHtml();

    daysContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${activeTrip ? `
                    <button id="resetMapViewBtn" title="Reset the map view to show the whole trip">
                        <h2 style="font-size: var(--font-3xl); letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${esc(tripTitle)}</h2>
                    </button>
                ` : `
                    <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${esc(tripTitle)}</h2>
                `}
                ${activeTrip ? `
                    ${tripIsManageable ? `
                        <button id="editTripBtn" class="icon-btn-square" title="Edit trip name and location">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                    ` : ''}
                    <button id="tripCompanionsBtn" class="trip-companions-pill" title="${tripIsManageable ? 'Pick which account companions are on this trip' : 'See who is on this trip'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>${tripIsManageable ? 'Companions' : 'Members'}</span>
                        <span class="trip-companions-pill__count">${tripIsManageable ? (activeTrip.companions || []).length : (activeTrip.members || []).length}</span>
                    </button>
                    ${!tripIsEditable ? `
                        <span class="trip-role-badge trip-role-badge--relaxer" title="You're a Relaxer on this trip — view-only">👁 Relaxer</span>
                    ` : ''}
                ` : ''}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${tripDays.length} Day${tripDays.length !== 1 ? 's' : ''} of adventure</p>
            ${memberChipsHtml}
        </div>

        <div style="display: flex; flex-direction: column; gap: 32px; position: relative; padding-left: 20px;">
            <!-- Subtle Timeline Line -->
            <div style="position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(180deg, var(--accent-blue) 0%, rgba(0,113,227,0.05) 100%); border-radius: 1px; opacity: 0.3;"></div>

            ${tripDays.map(day => {
                const isOpen = openMenuDayId === day.id;
                const isStartingPoint = day.dayNumber === 0;
                return `
                <div class="day-row${isOpen ? ' is-open' : ''}">
                    <!-- Timeline Dot — Starting Point uses a green dot to distinguish from numbered days -->
                    <div style="position: absolute; left: -14px; top: 22px; width: 10px; height: 10px; border-radius: 50%; background: ${isOpen ? (isStartingPoint ? '#34c759' : 'var(--accent-blue)') : 'white'}; border: 2px solid ${isStartingPoint ? '#34c759' : 'var(--accent-blue)'}; z-index: 2; box-shadow: 0 0 0 4px white;"></div>

                    <!-- LEFT SPACE MENU — only rendered for users with edit
                         rights. Relaxers see the day cards as read-only,
                         no actions panel beside them. -->
                    ${tripIsEditable ? `
                    <div class="day-actions-panel${isOpen ? ' is-open' : ''}">
                        <div class="day-actions-label">Actions</div>

                        ${editingDayId === day.id ? `
                            <div style="display: flex; gap: var(--space-1);">
                                <button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${day.id}" style="flex: 2; justify-content: center;">Save Pin</button>
                                <button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${day.id}" style="flex: 1; justify-content: center;">X</button>
                            </div>
                        ` : `
                            <button class="day-action-btn day-action-btn--brand day-pin-toggle-btn" data-day-id="${day.id}">
                                <span>${day.lat ? '📍 Edit Pin Location' : '📍 Add Pin to Map'}</span>
                            </button>
                        `}

                        <button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${day.id}">
                            <span>✍️ Journaling</span>
                        </button>

                        <button class="day-action-btn day-action-btn--neutral day-photos-btn" data-day-id="${day.id}">
                            <span>📸 Add Photos</span>
                        </button>

                        <button class="day-action-btn day-action-btn--neutral day-documents-btn" data-day-id="${day.id}">
                            <span>📄 Documents</span>
                        </button>

                        <button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${day.id}" style="margin-top: var(--space-1);">
                            <span>🗑️ Delete Day</span>
                        </button>
                    </div>
                    ` : ''}

                    <!-- MAIN CARD -->
                    <div class="day-card card glass${isOpen ? ' is-open' : ''}"
                         data-day-id="${day.id}"
                         style="flex: 1; padding: 20px 28px; border-radius: 28px; border: 1.5px solid ${isOpen ? 'var(--accent-blue)' : 'rgba(0,0,0,0.05)'}; background: ${isOpen ? 'rgba(255,255,255,0.95)' : 'white'}; cursor: pointer; box-shadow: ${isOpen ? '0 20px 40px rgba(0,0,0,0.1)' : 'none'};">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 20px;">
                                ${isStartingPoint ? `
                                    <div style="background: linear-gradient(135deg, #34c759, #30b350); color: white; width: 54px; height: 54px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(52,199,89,0.18);">
                                        <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
                                            <path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>
                                        </svg>
                                    </div>
                                ` : `
                                    <div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(0,113,227,0.15);">
                                        <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05em; line-height: 1;">Day</span>
                                        <span style="font-size: 1.4rem; font-weight: 800; line-height: 1.1;">${day.dayNumber}</span>
                                    </div>
                                `}
                                <div style="display: flex; flex-direction: column;">
                                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">${isStartingPoint ? 'Trip Genesis' : esc(day.name)}</h3>
                                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                        ${isStartingPoint
                                            ? `<span>${activeTrip && activeTrip.country ? cleanPlaceName(activeTrip.country) : 'Where the trip begins'}</span>`
                                            : `<span>📅 ${formatDayDate(day.date) || 'Set date'}</span>`}
                                        ${day.lat && !isStartingPoint ? `<span style="color: var(--accent-blue); opacity: 0.6;">•</span> <span style="color: var(--accent-blue);">📍 Location Set</span>` : ''}
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
                                <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(day.notes)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `}).join('')}
            
            <!-- ADD DAY BUTTON — hidden for non-planners (relaxers can't
                 mutate the day list). -->
            ${tripIsEditable ? `
            <div id="addDayBtn">
                <div class="add-dot" style="width: 14px; height: 14px; border-radius: 50%; border: 2px dashed var(--accent-blue); background: transparent; margin-left: -2px;"></div>
                <div class="add-text" style="font-weight: 700; color: var(--text-secondary); font-size: var(--font-lg); letter-spacing: -0.01em;">+ Add a new day to your journey</div>
            </div>
            ` : ''}
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

            // Reset map view — clicking the trip name fits the map to all
            // current border polygons. Useful when the user has panned the
            // map away and wants to return to the canonical view of the
            // trip's full footprint (covers multi-region polygons too).
            if (target.closest('#resetMapViewBtn')) {
                const map = /** @type {any} */ (window.activeMap);
                if (!map || !activeTrip) return;
                /** @type {any} */
                const _g = google;
                // Boundaries are now rendered server-side via FeatureLayer
                // (data-driven styling) — they're not on map.data, so we
                // can't compute bounds from drawn features. Fit to the
                // union of every pin (trip + day pins), padded a bit so
                // the trip's region polygon reads comfortably around them.
                const bounds = new _g.maps.LatLngBounds();
                if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
                    bounds.extend({ lat: activeTrip.lat, lng: activeTrip.lng });
                }
                const tripDaysHere = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
                for (const day of tripDaysHere) {
                    if (typeof day.lat === 'number') {
                        bounds.extend({ lat: day.lat, lng: day.lon || day.lng });
                    }
                }
                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, 80);
                } else if (activeTrip.viewport) {
                    const v = activeTrip.viewport;
                    map.fitBounds(new _g.maps.LatLngBounds(
                        { lat: v.south, lng: v.west },
                        { lat: v.north, lng: v.east },
                    ));
                }
                // map's idle listener persists the new view to STATE.mapViews.
                return;
            }

            // Edit-trip pencil — owner-only, hidden when !manageable.
            if (target.closest('#editTripBtn')) { openEditTripModal(activeTrip); return; }

            // Companions / Members button OR the inline member-chip panel —
            // both route through the same dispatcher: owner picks roster,
            // others see a read-only members list.
            if (target.closest('#tripCompanionsBtn') || target.closest('#tripMembersPanel')) {
                if (canManageRoster(activeTrip)) {
                    openCompanionPickerModal(activeTrip.id);
                } else {
                    openTripMembersModal(activeTrip.id);
                }
                return;
            }

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
            <button class="btn-glass-light">
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
                        <button id="hideQuickAccessBtn" class="pill-btn-warn-hover">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${steps.map((step, i) => {
            const showTick = !allDone && step.done;
            return `
                        <div class="guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: ${showTick ? 'rgba(52, 199, 89, 0.08)' : 'white'}; border-radius: var(--radius-xl); border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.2)' : 'rgba(0,0,0,0.05)'}; cursor: pointer; position: relative; overflow: hidden;">
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
        <div class="card-glass-modal-light" style="width: 580px;">
            <h2 style="font-size: var(--font-3xl); margin-bottom: var(--space-2); color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${day.dayNumber} Journaling</h2>
            <p class="text-subtitle">Capture your memories and stories from ${esc(day.name)}</p>
            <textarea id="journalText" class="glass-input-light" style="height: 260px; font-size: 1.05rem; line-height: 1.6; margin-bottom: var(--space-5); resize: vertical; display: block;" placeholder="What happened today? How did you feel?">${esc(day.notes || '')}</textarea>
            <div style="display: flex; gap: var(--space-3);">
                <button id="saveJournalBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Save Story</button>
                <button id="closeJournalBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
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
        <div class="card-glass-modal-light" style="width: 500px;">
            <h2 class="h2-display">Photo Gallery</h2>
            <p class="text-subtitle">Add images that define your Day ${day.dayNumber}</p>
            <div id="photoList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-6); max-height: 300px; overflow-y: auto; padding: var(--space-1);">
                ${day.photos.length === 0 ? '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: var(--space-10);">No photos added yet.</p>' :
                    day.photos.map((p, idx) => `
                        <div style="position: relative; aspect-ratio: 1; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                            <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;">
                            <button class="remove-photo-btn" data-day-id="${dayId}" data-photo-idx="${idx}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,59,48,0.8); color: white; border: none; font-size: var(--font-2xs); font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join('')
                }
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-6);">
                <label class="upload-dropzone" id="uploadLabel">
                    <span id="uploadStatusText">📤 Upload Photo</span>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                </label>
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                    <div class="divider-h"></div>
                    <span style="font-size: var(--font-2xs); color: var(--text-secondary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">OR</span>
                    <div class="divider-h"></div>
                </div>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="photoUrl" class="glass-input" placeholder="Paste image URL here..." style="flex: 1; padding: var(--space-3); border-radius: 14px; font-size: var(--font-base);">
                    <button id="addPhotoBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                </div>
            </div>
            <button id="closePhotosBtn" class="btn-neutral" style="width: 100%; border-radius: var(--radius-lg);">Done</button>
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
        <div class="card-glass-modal-light" style="width: 460px;">
            <h2 class="h2-display">Documents</h2>
            <p class="text-subtitle">Tickets, bookings, and important info</p>
            <div id="docList" style="display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-6); max-height: 250px; overflow-y: auto;">
                ${day.documents.length === 0 ? '<p style="text-align: center; color: var(--text-secondary); padding: var(--space-8);">No documents linked.</p>' :
                    day.documents.map((d, idx) => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); background: white; border-radius: var(--radius-md); border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: var(--space-2); overflow: hidden;">
                                <span style="font-size: 1.2rem;">📄</span>
                                <a href="${d.url}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.name}</a>
                            </div>
                            <button class="remove-doc-btn" data-day-id="${dayId}" data-doc-idx="${idx}" style="background: none; border: none; color: #ff3b30; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join('')
                }
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-6);">
                <label class="upload-dropzone" id="uploadDocLabel">
                    <span id="uploadDocStatusText">📤 Upload Document</span>
                    <input type="file" id="docUpload" style="display: none;">
                </label>
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                    <div class="divider-h"></div>
                    <span style="font-size: var(--font-xs); color: var(--text-secondary); font-weight: 800;">OR</span>
                    <div class="divider-h"></div>
                </div>
                <input type="text" id="docName" class="glass-input" placeholder="Document Name (e.g. Flight Ticket)" style="padding: var(--space-3); border-radius: var(--radius-md);">
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="docUrl" class="glass-input" placeholder="Link to document (Google Drive, URL...)" style="flex: 1; padding: var(--space-3); border-radius: var(--radius-md);">
                    <button id="addDocBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                </div>
            </div>
            <button id="closeDocsBtn" class="btn-neutral" style="width: 100%; border-radius: var(--radius-lg);">Close</button>
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
        <div class="card glass" style="width: 800px; max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-10);">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">Day ${day.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: var(--font-base);">${formatDayDate(day.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${esc(day.name)}</h2>
                </div>
                <button id="closeDetailBtn" class="close-x-btn">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-10);">
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div class="subcard-soft">
                        <h4 class="text-tag">Morning</h4>
                        <textarea class="plain-textarea plan-input" data-time="morning" placeholder="Morning plans...">${day.plan?.morning || ''}</textarea>
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 255,149,0;">Afternoon</h4>
                        <textarea class="plain-textarea plan-input" data-time="afternoon" placeholder="Afternoon plans...">${day.plan?.afternoon || ''}</textarea>
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 88,86,214;">Evening</h4>
                        <textarea class="plain-textarea plan-input" data-time="evening" placeholder="Evening plans...">${day.plan?.evening || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div style="flex: 1; background: rgba(0,113,227,0.05); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 class="text-tag">Personal Notes</h4>
                        <textarea id="detailNotes" class="plain-textarea plain-textarea--no-resize" style="height: 200px;" placeholder="Private thoughts about this day...">${esc(day.notes || '')}</textarea>
                    </div>
                    <div style="background: #000; padding: var(--space-6); border-radius: 24px; color: white;">
                        <h4 class="text-tag" style="--accent: 52,199,89;">Expert Tip</h4>
                        <p style="margin: 0; font-size: var(--font-md); line-height: 1.5; opacity: 0.9;">${esc(day.tip || "Always keep a portable charger and a small bottle of water in your bag for long exploration days.")}</p>
                    </div>
                    <button id="saveDetailBtn" class="btn-primary" style="width: 100%; padding: var(--space-5); border-radius: var(--radius-xl); font-size: var(--font-xl);">Save All Changes</button>
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



