// pages/home.js

import { STATE, emit } from '../state.js';
// INSPIRATIONAL_PAIRS + getMediaForTrip moved with the slideshow
// controller — only home/slideshow.ts references them now.
import { showLiquidAlert, formatDayDate, showConfirmModal, generateId, shortPlaceName, esc } from '../utils.js';
// Share-flow imports (shareTripToFeed / fetchShareStatus /
// unshareFeedPost) used to live here; they moved with the Share
// button to collections.js (renderArchivedTripDetail). The
// share-modal helper itself (openShareToFeedModal) is still defined
// here and re-exported so collections.js can drive it.
//
// setTripActionsHidden powers the new silence/mute toggle button
// in the trip header (where the share button used to live), per
// the user's privacy ask — flips trip.actionsHidden server-side
// + locally so the trip's create/archive/join events stop bleeding
// into friends' Actions feeds.
import { upsertDay, deleteDayOnServer, upsertTrip, setTripActionsHidden } from '../api.js';
import { fetchTimeZone, formatLocalTime, streetViewUrl } from '../googleMapsServices.js';
import { paintWeatherChips, loadAndPaintWeather, type WeatherForecast } from './home/weather.js';
import { renderDayRoutePolyline } from './home/routePolyline.js';
import { POI_CATEGORIES, pickPlaceIcon, isPrimaryMatch } from './home/poiCategories.js';
import { openPdfPreview, looksLikePdfUrl } from './home/lightbox.js';
import { applySilenceBtnVisual, updateShareBtnVisualState, openShareToFeedModal } from './home/shareModal.js';
import { openTripChecklistModal } from './home/tripChecklistModal.js';
import { openJournalingModal } from './home/journalingModal.js';
import { openTripDocumentsModal, openTripPhotosModal } from './home/tripMediaModals.js';
import { openDayView } from './home/dayViewModal.js';
import { openDayDetail as _openDayDetailRaw, type HomeTab } from './home/dayDetailModal.js';
import {
    setSelectedDay,
    resolveSelectedDayId,
    getSelectedDayId,
    clearSelectedDay,
    registerPathSelectionHooks,
} from './home/pathSelection.js';
import { appendGettingStartedGuide } from './home/gettingStartedGuide.js';
import { setupSlideshow, stopHomeSlideshow as _stopSlideshowImpl } from './home/slideshow.js';

// Re-export stopHomeSlideshow so router.ts's existing import
// (`import { stopHomeSlideshow } from './home.js'`) keeps
// working — the router calls it on every navigate to clear
// any leftover timer.
export const stopHomeSlideshow = _stopSlideshowImpl;

// The day-detail modal lives in its own module but mutates
// home.ts's `activeHomeTab` when the user clicks a Anchor
// quick-link (Documents / Photos). We pass a setter so the
// extracted module doesn't need to know about activeHomeTab.
const openDayDetail = (dayId: string) => _openDayDetailRaw(dayId, {
    setActiveHomeTab: (tab: HomeTab) => { activeHomeTab = tab; },
});

// Re-exports so existing external importers don't need to learn
// about the home/* split. settings.ts pulls POI_CATEGORIES;
// collections.ts pulls openDayView + openPdfPreview +
// looksLikePdfUrl + updateShareBtnVisualState +
// openShareToFeedModal.
export { POI_CATEGORIES };
export { openPdfPreview, looksLikePdfUrl };
export { updateShareBtnVisualState, openShareToFeedModal };
export { openDayView };
import { navigate } from '../router.js';
// showPersTab moved with the Getting Started Guide extraction —
// only the guide's "Set your own categories" step calls it.
import { openNewTripModal, openAddDayModal, openEditTripModal, openCompanionPickerModal, openTripMembersModal } from '../modals.js';
import { canEdit, canManageRoster, ROLE_PLANNER, ROLE_BUDGETEER } from '../permissions.js';
import { findTripCompanionByLinkedUser } from '../companions.js';
// showModal moved out with the modal extractions in Phase B1.
// All modal openers in this file delegate to the extracted
// home/* modules now.
import { wireRoleButtonKeys } from '../components/Keyboard.js';
import { findMarkedPlace, toggleTodoListMembership } from '../markedPlaces.js';
import { applyMapTheme } from '../theme.js';
// All tripMedia helpers (getAllTripDocuments, getAllTripPhotos,
// add/remove/set/update/buildGmailTripSearchUrl) moved to
// ./home/tripMediaModals.ts during the Phase B1 split — they
// were only ever used by the doc/photo modal block, which
// itself relocated. No remaining references in this file.

// Slideshow state moved to ./home/slideshow.ts during the
// Phase B1 split. _slideshowTimer + stopHomeSlideshow are
// re-exported at the top of this file so router.ts's existing
// import keeps working without any change.

let activeMarkers: Record<string, any> = {}; // Cache of Leaflet markers by day ID
let editingDayId: string | null = null; // ID of the day currently being geolocated/pinned
let activeMapClickListener: ((e: any) => void) | null = null; // Reference to the active map click handler

// setInterval id for the trip-header local-time clock. The clock
// reads from a cached time-zone offset and updates every 30s so
// the displayed local time stays correct without re-fetching the
// Time Zone API. Cleared on every home render so a stacked
// interval can't leak when the user flips trips, navigates away,
// or just re-renders the page.
let _localTimeClockInterval: ReturnType<typeof setInterval> | null = null;

let activeHomeTab: 'days' | 'companions' | 'documents' | 'photos' = 'days'; // Sub-tab on the home trip view (Path / Companions / Documents / Photos)

// ── Path tab: selected-day state ────────────────────────────────────
// selectedDayByTrip + setSelectedDay + resolveSelectedDayId
// moved to ./home/pathSelection.ts during the Phase B1 split.
// The two render-bound callbacks (_repaintPathTab,
// _onSelectedDayChange) are now wired by registerPathSelectionHooks
// inside renderHome instead of being module-level vars here.
// The "To do list" sub-tab was promoted to a top-level /todo page so
// the to-do list now has its own banner-style surface (see pages/todo.js
// + the navbar entry between Home and Plan with AI). The data still
// lives on `trip.markedPlaces[i].forManual`; the home page's day-detail
// modal still shows the "From your to-do list" block, so day-level
// AM/PM/Eve drops are unchanged.

// POI_CATEGORIES + pickPlaceIcon + isPrimaryMatch + the
// PHARMACY_NAME_HINTS table moved to ./home/poiCategories.ts
// during the Phase B1 home.ts split. They're imported at the
// top of this file and POI_CATEGORIES is re-exported so
// settings.ts (the only external consumer) keeps working.

// Per-day card action helpers. The map setTimeout below detects
// activeMapClickListener and wires it on the map; these helpers just mutate
// the module-level state and re-navigate so renderHome runs again.
// (toggleDayMenu was retired with the chip-strip Path layout — there's
//  no per-day expand/collapse state anymore; the selected day always
//  shows its full content alongside Anchor.)

const addDayPin = (dayId: string) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    editingDayId = dayId;
    showLiquidAlert('Click on the map to set the location for this day!');

    activeMapClickListener = (e: any) => {
        day.lat = e.latlng.lat;
        day.lon = e.latlng.lng;
        day.lng = e.latlng.lng;
        activeMapClickListener = null;
        navigate('home', null, true);
    };

    navigate('home', null, true);
};

const editDayPin = (dayId: string) => {
    editingDayId = dayId;
    navigate('home', null, true);
};

const saveDayPin = async (dayId: string) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;

    editingDayId = null;
    activeMapClickListener = null;
    emit('state:changed');
    await upsertDay(day);
    showLiquidAlert('Location saved!');
    navigate('home', null, true);
};

const deleteDayPin = async (dayId: string) => {
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

const deleteDay = (dayId: string) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    // Anchor is the trip's anchor — pill search, wide-area POIs, and
    // the lazy day-0 sessionStorage flag all key off it. The delete
    // button is already hidden on the anchor card; this guard is
    // belt-and-braces in case some old in-memory STATE / external
    // call site reaches deleteDay with a day-0 id.
    if (Number(day.dayNumber) === 0) {
        showLiquidAlert("Trip Anchor can't be deleted — it anchors the trip.");
        return;
    }

    showConfirmModal({
        title: `Delete Day ${day.dayNumber}?`,
        message: "This removes the day and all its journaling, photos, and documents. This can't be undone.",
        confirmText: 'Delete Day',
        onConfirm: async () => {
            const tripId = day.tripId;

            STATE.tripDays = STATE.tripDays.filter(d => d.id !== dayId);

            // Renumber remaining numbered days starting from 1. Day 0
            // (Trip Anchor) is preserved as-is — it's not part of the
            // sequential numbering.
            STATE.tripDays
                .filter(d => d.tripId === tripId && Number(d.dayNumber) > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .forEach((d, i) => { d.dayNumber = i + 1; });

            // If the deleted day was someone's last selected day on
            // this trip, drop the cached selection so resolveSelectedDayId
            // re-derives a sensible default on next render.
            if (getSelectedDayId(tripId) === dayId) {
                clearSelectedDay(tripId);
            }
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
            showLiquidAlert('Day deleted');
            navigate('home', null, true);
        }
    });
};

export function renderHome() {
    const div = document.createElement('div');
    const activeTrip = (STATE.trips && STATE.activeTripId) ? STATE.trips.find(t => t.id === STATE.activeTripId) : null;

    // Slideshow controller — owns the roster + 6s cycle + the
    // addDiscoveredCountry callback the map's reverse-geocode
    // loop calls when it finds a new ISO country. See
    // ./home/slideshow.ts for the controller's full surface.
    const slideshow = setupSlideshow(activeTrip);
    const displayImages = slideshow.images;
    const displayQuotes = slideshow.quotes;

    if (!activeTrip) {
        div.innerHTML = `
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="display: inline-block; background: var(--gradient-title); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>

            <div class="card glass cover-card cover-card--lg">
                <img id="homeHeroImg" src="${displayImages[0] || ''}" alt="" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div class="cover-card__gradient"></div>
                <div class="cover-card__content" style="display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" class="cover-card__quote" style="max-width: 60%;">
                        ${displayQuotes[0] || ''}
                    </p>
                    <button class="btn" id="homeCreateFirstTripBtn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;">Create Trips</button>
                </div>
            </div>
        `;
        slideshow.start(div);
        div.querySelector('#homeCreateFirstTripBtn')?.addEventListener('click', () => openNewTripModal());
    } else {
        const tripExpenses = (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id);
        const tripDays = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
        const isFresh = tripExpenses.length === 0 && tripDays.length === 0;

        let greeting = "Welcome back, traveler";
        if (isFresh && activeTrip.country) {
            // Compact display: drop postal-code prefixes AND extra
            // comma-separated location chunks. Google returns localized
            // formatted_address most-specific → least-specific, so the
            // first token (city/town) is what reads cleanly in a header.
            // E.g. "Atlanta, Geórgia, Estados Unidos" → "Atlanta",
            //      "USA - California" → "California",
            //      "8950 Castro Marim, Portugal" → "Castro Marim".
            const displayCountry = shortPlaceName(activeTrip.country);
            const firstName = (STATE.user && STATE.user.firstName) ? STATE.user.firstName : "traveler";
            const greetings = [
                `Welcome back, ${firstName}!`,
                `Ready for your ${activeTrip.name} adventure?`,
                `Your ${displayCountry} adventure starts here.`,
                `Time to write your ${displayCountry} story.`
            ];
            greeting = greetings[Math.floor(Math.random() * greetings.length)] ?? greeting;
        }

        div.innerHTML = `
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="display: inline-block; background: var(--gradient-title); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${greeting}</h1>
                ${activeTrip ? `<p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>` : `<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <!-- "Discover places nearby" toggle — compact pill that
                 sits ABOVE the search bar (used to live below the map
                 next to a heavy "Discover…" bar). Clicking it
                 reveals the POI category pills as a FLOATING overlay
                 panel on top of the map (see #homeMapPoiToggles
                 inside .cover-card below). Compass icon swap from the
                 old magnifying glass — discovery, not search. -->
            <div style="display:flex; justify-content:center; margin: 12px auto 8px; max-width: 720px;">
                <button type="button" id="homePoiToggleBtn" class="map-poi-toggle-bar" aria-expanded="false" aria-controls="homeMapPoiToggles">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    <span class="map-poi-toggle-bar__label">Discover places nearby</span>
                    <svg class="map-poi-toggle-bar__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>

            <!-- Map search banner. Sits ABOVE the map (in normal flow,
                 not floated over it) so the map view is unobstructed.
                 The suggestion dropdown uses position:absolute relative
                 to the wrapper so it can extend down over the map's
                 first row of pixels without pushing layout. -->
            <div id="homeMapSearchWrap" style="position:relative; max-width: 720px; margin: 4px auto 12px; z-index: 5;">
                <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.94); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:10px 16px; box-shadow: 0 8px 24px rgba(0,45,91,0.10);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#002d5b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">
                        <circle cx="11" cy="11" r="7"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                    </svg>
                    <input id="homeMapSearchInput" type="search" autocomplete="off" placeholder="Search any place on the map…"
                        style="flex:1; min-width:0; border:0; outline:0; background:transparent; padding:6px 0; font-size:0.95rem; color:#002d5b; font-weight:600;">
                    <button id="homeMapSearchClear" type="button" title="Clear" aria-label="Clear search"
                        style="display:none; background:rgba(0,0,0,0.05); border:0; color:rgba(0,0,0,0.5); width:24px; height:24px; border-radius:999px; cursor:pointer; font-size:0.8rem; line-height:1; flex-shrink:0;">✕</button>
                </div>
                <!-- Dropdown is absolutely positioned so it overlays the
                     map slightly when results are open, but doesn't shift
                     the map down on every keystroke. -->
                <div id="homeMapSearchResults"
                    style="display:none; position:absolute; top:calc(100% + 6px); left:0; right:0; background:rgba(255,255,255,0.98); backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%); border:1px solid rgba(0,0,0,0.08); border-radius:18px; box-shadow: 0 18px 44px rgba(0,45,91,0.18); overflow:hidden; max-height:320px; overflow-y:auto;">
                </div>
            </div>

            <!-- POI category pills — IN-FLOW panel that slots in
                 between the search bar and the map (was an overlay
                 over the map; the user said pills shouldn't eat
                 map space). Hidden by default; visibility is
                 toggled by #homePoiToggleBtn above the search bar.
                 The container ALWAYS exists in the DOM (the pill
                 click handler at line ~1264 listens here); the
                 .is-visible class controls display. The user's
                 preference persists in localStorage so the choice
                 sticks across reloads. Settings → General hides
                 individual pills via poiVisible[key] === false;
                 that filtering happens here too. -->
            <div id="homeMapPoiToggles" class="map-poi-toggles map-poi-toggles--inline${(() => {
                let visible = false;
                try { visible = localStorage.getItem('home_pills_visible') === '1'; } catch (_) {}
                return visible ? ' is-visible' : '';
            })()}" aria-hidden="true">
                ${POI_CATEGORIES
                    .filter(c => STATE.preferences?.poiVisible?.[c.key] !== false)
                    .map(c => `
                        <button type="button" class="map-poi-toggle" data-poi="${c.key}" aria-pressed="false" title="${esc(c.tooltip)}">${c.icon} <span>${esc(c.label)}</span></button>
                    `).join('')}
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

        // Local-time chip wiring. One Time Zone API call per render
        // (cached by coords inside googleMapsServices), then a 30s
        // setInterval keeps the displayed clock fresh without
        // refetching. Clear any prior interval first so re-renders
        // don't stack tickers — same hygiene as the route-line rAF.
        if (_localTimeClockInterval !== null) {
            clearInterval(_localTimeClockInterval);
            _localTimeClockInterval = null;
        }
        if (activeTrip && typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            fetchTimeZone(activeTrip.lat, activeTrip.lng).then(tz => {
                if (!tz) return;
                const chip = document.getElementById('homeTripLocalTimeChip');
                if (!chip) return;
                const paint = () => {
                    const { time, offsetLabel } = formatLocalTime(tz);
                    chip.innerHTML = `<span class="trip-local-time-chip__icon">🕐</span>`
                        + `<span class="trip-local-time-chip__time">${time}</span>`
                        + `<span class="trip-local-time-chip__offset">${offsetLabel}</span>`;
                    chip.style.display = 'inline-flex';
                };
                paint();
                _localTimeClockInterval = setInterval(paint, 30 * 1000);
            });
        }

        setTimeout(() => {
            // (Share-button bootstrap moved out — the share entry
            // point lives on the public-trip detail page in
            // Collections now, and that page does its own share
            // status fetch on mount.)

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

                /** Default styles: hide all POI labels, transit labels,
                 *  AND road labels. The map shows only the satellite
                 *  imagery + administrative labels (cities, neighborhoods,
                 *  geographic areas). Pills bring back what the user
                 *  actually wants — POIs via Places API markers, road
                 *  names via the Roads & traffic pill. */
                const HIDE_ALL_POI_STYLES = [
                    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                ];
                const buildPoiStyles = (enabledSet: Set<string>) => {
                                        const styles: any[] = HIDE_ALL_POI_STYLES.slice();
                    if (enabledSet.has('traffic')) {
                        // Highway / arterial road labels visible only when
                        // Roads & traffic is on, so the user sees major
                        // routes the way Google's built-in Traffic view
                        // does. Local streets stay hidden to keep the
                        // satellite view from getting noisy.
                        styles.push(
                            { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'on' }] },
                            { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#0a3d6b' }, { weight: 2 }] },
                            { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 4 }] },
                            { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'on' }] },
                        );
                    }
                    if (enabledSet.has('transit')) {
                        // Re-enable transit *route geometry* (the dotted
                        // ferry crossings drawn over water + subway/bus
                        // line geometry). Our base styles hide all
                        // `transit` to keep the satellite view clean.
                        // These overrides only render on `roadmap` map
                        // type — silently no-op on hybrid/satellite.
                        //
                        // Colour: saturated cyan (#00e5ff) with a
                        // chunky weight so ferry routes pop and stay
                        // legible at zoomed-out levels (Google fades
                        // transit lines to nothing at low zoom by
                        // default; weight is the only lever the style
                        // API gives us to keep them visible). Google's
                        // style API can't filter by transit mode so
                        // this colours ALL transit lines (train,
                        // metro, ferry, bus) the same — uniform
                        // neon-blue treatment, which is what the user
                        // asked for. geometry.stroke is the saturated
                        // core stroke, geometry.fill is a paler tint
                        // that gives a soft "glow" feel against
                        // darker line backgrounds (no blur primitive
                        // is available in the style API).
                        styles.push(
                            { featureType: 'transit.line', elementType: 'geometry', stylers: [{ visibility: 'on' }] },
                            { featureType: 'transit.line', elementType: 'geometry.stroke', stylers: [{ color: '#00e5ff' }, { weight: 6 }] },
                            { featureType: 'transit.line', elementType: 'geometry.fill', stylers: [{ color: '#5ad8ff' }, { weight: 6 }] },
                            { featureType: 'transit.line', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                            { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
                        );
                    }
                    return styles;
                };

                // ── Places API: per-pill Nearby Search around day pins ──
                // The whole point of the pills now: when a user toggles
                // a category, we run nearbySearch around each day pin
                // and drop precise markers. No more guessing what
                // Google's default labels include.

                /** Lazy PlacesService — `loading=async` on the Maps
                 *  script means google.maps.places might not be defined
                 *  by the time this code runs. Construct on first use
                 *  instead of at module init so a slow places-library
                 *  load doesn't take the whole map down with it. */
                                let _placesService: any | null = null;
                const getPlacesService = () => {
                    if (_placesService) return _placesService;
                    if (typeof google === 'undefined' || !google.maps || !google.maps.places) return null;
                    _placesService = new google.maps.places.PlacesService(map);
                    return _placesService;
                };

                /** Markers grouped by pill key so we can clear one
                 *  category without disturbing the others. Each entry is
                 *  an array of google.maps.Marker. */
                                const placesMarkers: Record<string, any[]> = {};

                /** Cache of nearbySearch results keyed by `${tripId}|${pillKey}`.
                 *  Trip-wide cache because the search is now one big
                 *  query around the anchor pin (50 km radius), not one
                 *  per day pin — re-toggling a pill on the same trip
                 *  doesn't burn another API call. */
                                const placesCache: Record<string, any[]> = {};

                /** In-flight fetches keyed the same way. Concurrent
                 *  toggles for the same pill resolve to the same
                 *  promise instead of firing duplicate searches —
                 *  fixes the race where rapid on/off/on left orphan
                 *  markers from the first fetch on top of the second.
                 *  Sparse — keys are only present while a fetch is in
                 *  flight (deleted in the .finally below), so reads
                 *  must treat missing keys explicitly. */
                const placesPending: Record<string, Promise<any[]> | undefined> = {};

                /** Single shared InfoWindow — reused across every Places
                 *  marker so only one bubble is ever open at a time
                 *  (Google Maps standard behavior, less visual chaos). */
                                let placesInfoWindow: any | null = null;
                const getInfoWindow = () => {
                    if (placesInfoWindow) return placesInfoWindow;
                    placesInfoWindow = new google.maps.InfoWindow();
                    return placesInfoWindow;
                };

                /** Build the HTML shown inside the InfoWindow when a
                 *  user clicks a Places marker. Uses what's already in
                 *  the nearbySearch result (name / vicinity / rating)
                 *  so we don't need a paid Place Details follow-up call.
                 *  The "View on Google Maps" link uses the place_id URL
                 *  scheme so it lands directly on the place's full page
                 *  (with photos, hours, reviews, directions, etc.). */
                const tripIsEditable = canEdit(activeTrip);
                const buildInfoWindowHtml = (cat: any, place: any) => {
                    const safeName = esc(place.name || cat.label);
                    const safeVicinity = esc(place.vicinity || '');
                    const ratingHtml = (typeof place.rating === 'number')
                        ? `<div style="margin-top: 6px; font-size: 0.8125rem; color: #444;"><span style="color: #ff9500;">★</span> ${place.rating.toFixed(1)}${place.user_ratings_total ? ` <span style="color: #888;">(${place.user_ratings_total})</span>` : ''}</div>`
                        : '';
                    const mapsUrl = place.place_id
                        ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}`;
                    // Add-to-to-do button — planner-only. Single button (the
                    // old "Mark for AI" + "Shortlist" pair was collapsed when
                    // we merged the two lists into one). Adding stamps the
                    // place into the trip's To-do list AND pre-ticks it for
                    // AI consideration; the user can untick in the AI panel
                    // for places they want to slot manually only.
                    const marked = findMarkedPlace(activeTrip, place.place_id);
                    const isOnTodo = !!marked?.forManual;
                    const markBtnsHtml = tripIsEditable && place.place_id ? `
                        <div style="display: flex; gap: 6px; margin-top: 10px;">
                            <button type="button" data-action="toggle-todo" data-place-id="${esc(place.place_id)}"
                                style="flex: 1; padding: 7px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; border: 1.5px solid #9b59b6; background: ${isOnTodo ? '#9b59b6' : 'white'}; color: ${isOnTodo ? 'white' : '#9b59b6'};">
                                ${isOnTodo ? '✓ On your to-do list' : '📋 Add to to-do list'}
                            </button>
                        </div>
                    ` : '';
                    // Same per-place icon picker the marker uses, so the
                    // InfoWindow header matches what the user clicked
                    // (a 💊 pill click opens an InfoWindow headed with 💊).
                    const headerIcon = pickPlaceIcon(cat, place);
                    return `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; min-width: 240px; max-width: 280px; padding: 4px 2px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="font-size: 1.125rem;">${headerIcon}</span>
                                <strong style="font-size: 0.9375rem; color: #002d5b; line-height: 1.25;">${safeName}</strong>
                            </div>
                            ${safeVicinity ? `<div style="font-size: 0.75rem; color: #666; line-height: 1.4;">${safeVicinity}</div>` : ''}
                            ${ratingHtml}
                            <a href="${mapsUrl}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: ${cat.color}; color: white; text-decoration: none; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">View on Google Maps →</a>
                            ${markBtnsHtml}
                        </div>
                    `;
                };

                /** Wire click handler on the InfoWindow's single
                 *  "Add to to-do" button. Called on every open + after
                 *  every content refresh (which we trigger on click so
                 *  the button label flips between "Add" and "✓ On your
                 *  to-do list"). Google's InfoWindow domready event
                 *  fires when the DOM is available, including after
                 *  setContent — so the re-attach below survives rebuilds. */
                const wireInfoWindowMarkButtons = (cat: any, place: any) => {
                    const iw = getInfoWindow();
                    const todoBtn = document.querySelector(
                        `.gm-style-iw [data-action="toggle-todo"][data-place-id="${place.place_id}"]`,
                    ) as HTMLButtonElement | null;
                    if (!todoBtn) return; // iw not in DOM yet, will retry on next domready
                    const refresh = () => {
                        iw.setContent(buildInfoWindowHtml(cat, place));
                        google.maps.event.addListenerOnce(iw, 'domready', () => {
                            wireInfoWindowMarkButtons(cat, place);
                        });
                    };
                    todoBtn.onclick = () => {
                        toggleTodoListMembership(activeTrip, place, cat);
                        emit('state:changed');
                        upsertTrip(activeTrip);
                        refresh();
                        // The to-do list is its own /todo page now —
                        // no in-home badge to patch. The InfoWindow's
                        // own button label flips to "✓ On your to-do list"
                        // via refresh(), which is the immediate feedback
                        // the user needs at the click site. Visiting /todo
                        // shows the updated list.
                    };
                };

                /** Drop a marker for one Places result. Color comes from
                 *  the pill's POI_CATEGORIES entry; the icon emoji shows
                 *  inside a white circle. Sized at 44px so it reads as
                 *  a real "this is a thing" marker rather than a tiny
                 *  decoration — the user wanted the toggled info to
                 *  stand out. The colored ring + outer drop-shadow help
                 *  the marker pop against the satellite imagery.
                 *  Click → pans + zooms to the place AND opens an
                 *  InfoWindow with name / address / rating + a Google
                 *  Maps link for the full info page. */
                const dropPlaceMarker = (cat: any, place: any) => {
                    const loc = place.geometry?.location;
                    if (!loc) return null;
                    // Pick a per-place icon when the pill spans multiple
                    // Google types (medical → 🏥/💊/🩺/🦷, pets → 🐶/🐾).
                    // Falls back to the pill's category icon for everything
                    // else, so single-type pills look the way they always did.
                    const markerIcon = pickPlaceIcon(cat, place);
                    const svg = 'data:image/svg+xml;utf8,'
                        + `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">`
                        + `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">`
                        +   `<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>`
                        + `</filter></defs>`
                        + `<circle cx="22" cy="22" r="18" fill="white" stroke="${encodeURIComponent(cat.color)}" stroke-width="3.5" filter="url(%23s)"/>`
                        + `<text x="22" y="29" text-anchor="middle" font-size="20">${markerIcon}</text>`
                        + '</svg>';
                    const marker = new google.maps.Marker({
                        map,
                        position: loc,
                        title: place.name || cat.label,
                        icon: { url: svg, scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) },
                        zIndex: 1, // below the day pins (which use default zIndex)
                    });
                    marker.addListener('click', () => {
                        const iw = getInfoWindow();
                        iw.setContent(buildInfoWindowHtml(cat, place));
                        // domready fires AFTER the InfoWindow's DOM is
                        // mounted (or remounted, if setContent runs
                        // again). Each mount wires up the mark buttons.
                        // Using addListenerOnce so we don't accumulate
                        // handlers when the user re-clicks the marker.
                        google.maps.event.addListenerOnce(iw, 'domready', () => {
                            wireInfoWindowMarkButtons(cat, place);
                        });
                        iw.open({ map, anchor: marker });
                        // Pan + zoom to the place. 17 ≈ "see the building";
                        // tighter than the trip overview but loose enough
                        // to keep neighborhood context visible.
                        map.panTo(loc);
                        if (map.getZoom() < 17) map.setZoom(17);
                    });
                    return marker;
                };

                /** Run a single trip-wide nearbySearch for one category,
                 *  centered on the anchor pin (day 0). Radius is the
                 *  Places API maximum (50 km) — covers a metro region
                 *  the size of "Sintra ↔ Cascais ↔ Lisbon ↔ Setúbal".
                 *  Cached per (tripId, pillKey) so re-toggling is free.
                 *  We also paginate up to 3 result pages (60 results
                 *  total) when available so the bigger search radius
                 *  doesn't get artificially capped at 20 results.
                 */
                /** Resolve the search center for this trip's pill
                 *  searches. Order of preference:
                 *    1. The day currently selected on the wheel
                 *       (resolved via resolveSelectedDayId). This
                 *       is the "follow the wheel" behavior — when
                 *       the user is browsing Day 3, pills search
                 *       around Day 3's pin. If the selected day
                 *       has no pin yet, fall through.
                 *    2. Anchor day (dayNumber === 0) with a pin.
                 *    3. activeTrip.lat/lng as a defensive last
                 *       resort (Anchor without an explicit pin
                 *       still sits at the trip's anchor).
                 *  Skipped paths fall to the next; categories that
                 *  set `forceAnchor: true` (like transit) skip
                 *  step 1 entirely and always anchor to Anchor so
                 *  they cover the trip's full area.
                 *  Cache-key callers also need the resolved dayId
                 *  (or 'anchor' / 'trip') so changing epicenter
                 *  properly cache-misses.
                 *  @param {boolean} [forceAnchor=false] */
                const resolveSearchCenter = (forceAnchor = false) => {
                    if (!forceAnchor && activeTrip) {
                        // Read selection FRESH each call — wheel
                        // chip clicks don't trigger a full home
                        // re-render, so currentTripDays is stale
                        // for selection purposes. Reading from
                        // STATE.tripDays + selectedDayByTrip
                        // catches the live selection.
                        const sortedDays = [...(STATE.tripDays || [])]
                            .filter(d => d.tripId === activeTrip.id)
                            .sort((a, b) => a.dayNumber - b.dayNumber);
                        const selectedId = resolveSelectedDayId(activeTrip, sortedDays);
                        if (selectedId) {
                            const sel = sortedDays.find(d => d.id === selectedId);
                            if (sel && sel.lat != null) {
                                return {
                                    center: { lat: sel.lat, lng: sel.lng || sel.lon },
                                    anchorId: sel.id,
                                };
                            }
                        }
                    }
                    const anchor = currentTripDays.find(d => d.dayNumber === 0 && d.lat);
                    if (anchor) return { center: { lat: anchor.lat, lng: anchor.lng || anchor.lon }, anchorId: 'anchor' };
                    if (activeTrip?.lat) return { center: { lat: activeTrip.lat, lng: activeTrip.lng }, anchorId: 'trip' };
                    return { center: null, anchorId: '' };
                };

                /** Per-pill anchor mode: user override (Settings →
                 *  General) wins, else the category's useAnchorAlways
                 *  default. Returns true if this pill should always
                 *  search from anchor (ignoring the day epicenter). */
                const shouldForceAnchor = (cat: any) => {
                    const userPref = STATE.preferences?.poiAnchoring?.[cat.key];
                    if (userPref === 'anchor') return true;
                    if (userPref === 'epicenter') return false;
                    return !!cat.useAnchorAlways;
                };

                const fetchPlacesForTrip = (cat: any): Promise<any[]> => {
                    const tripId = activeTrip?.id || '';
                    const { center, anchorId } = resolveSearchCenter(shouldForceAnchor(cat));
                    // Cache-key includes the anchor + strategy so:
                    //  - changing epicenter cache-misses (refetches)
                    //  - toggling between strategies (if we ever swap
                    //    them per-category) cache-misses
                    const key = `${tripId}|${cat.key}|${anchorId}|${cat.searchStrategy}`;
                    if (placesCache[key]) return Promise.resolve(placesCache[key]);
                    if (placesPending[key]) return placesPending[key];

                    const promise = new Promise<any[]>((resolve) => {
                        if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
                            resolve([]); return;
                        }
                        const svc = getPlacesService();
                        if (!svc) { resolve([]); return; }
                                                const all: any[] = [];

                        // Two strategies, picked per-category:
                        //   distance → closest 60. Right for dense
                        //     urban categories where prominence ranking
                        //     would surface only big-name spots and miss
                        //     small local 4★+ ones (e.g. restaurants).
                        //   wide → 50 km radius + prominence. Right for
                        //     sparse categories (hospitals, parks,
                        //     stadiums) where 60 results comfortably
                        //     cover a metro and prominence is what you
                        //     want — "main hospital" should land first.
                        // Note: rankBy: DISTANCE is incompatible with
                        // `radius`. The API rejects both together.
                        //
                        // Multi-source pill searches. Two parallel families:
                        //   - cat.extraPlacesTypes: extra Places API types
                        //     (e.g. ['pharmacy'] alongside the primary
                        //     'hospital' for medical)
                        //   - cat.extraKeywords: free-text keyword searches
                        //     (e.g. ['pharmacy', 'drugstore'] to catch
                        //     name-tagged places like CVS / Walgreens that
                        //     Google's `type: 'pharmacy'` legacy filter
                        //     sometimes misses since the Places API rewrite)
                        // Places API takes a single `type` (or single
                        // `keyword`) per call so each entry below is its
                        // own round-trip; we pool + dedupe at the end.
                        const typesToSearch = [cat.placesType, ...(cat.extraPlacesTypes || [])];
                        const keywordsToSearch = cat.extraKeywords || [];
                        let pendingSearches = typesToSearch.length + keywordsToSearch.length;
                        const sharedHandle = (results: any, status: string, pagination: any) => {
                            const ok = status === google.maps.places.PlacesServiceStatus.OK
                                || status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
                            if (ok && Array.isArray(results)) all.push(...results);
                            // Surface non-OK statuses (other than the
                            // expected ZERO_RESULTS) in DevTools so a
                            // silent "API key denied" / "INVALID_REQUEST"
                            // doesn't leave the user staring at an empty
                            // map without a clue.
                            if (!ok) {
                                console.warn(`[POI ${cat.key}] Places search status=${status}`);
                            }
                            if (pagination && pagination.hasNextPage && all.length < 60) {
                                setTimeout(() => pagination.nextPage(), 200);
                            } else if (--pendingSearches === 0) {
                                // Dedupe by place_id — the same place
                                // can come back from multiple parallel
                                // queries (CVS via type='pharmacy' AND
                                // keyword='pharmacy'), and twin markers
                                // would clutter the map.
                                const seen = new Set();
                                const deduped: any[] = [];
                                for (const p of all) {
                                    if (!p?.place_id || seen.has(p.place_id)) continue;
                                    seen.add(p.place_id);
                                    deduped.push(p);
                                }
                                resolve(deduped);
                            }
                        };
                        const runSearch = (extra: Record<string, any>) => {
                            const base = cat.searchStrategy === 'distance'
                                ? { location: center, rankBy: google.maps.places.RankBy.DISTANCE }
                                : { location: center, radius: 50000 };
                            svc.nearbySearch({ ...base, ...extra }, sharedHandle);
                        };
                        typesToSearch.forEach((t: string) => runSearch({ type: t }));
                        keywordsToSearch.forEach((kw: string) => runSearch({ keyword: kw }));
                    });
                    placesPending[key] = promise;
                    promise.then(list => {
                        placesCache[key] = list;
                        delete placesPending[key];
                    });
                    return promise;
                };

                /** Toggle markers for one pill key on/off.
                 *  No-op for categories without a placesType (e.g. the
                 *  "Roads & traffic" pill, which is a pure styles+layer
                 *  toggle handled in the click handler).
                 *
                 *  Always clears any existing markers up front (covers
                 *  off-toggles AND the "user clicked again before async
                 *  resolved" path). After the fetch completes, only
                 *  adds markers if the pill is STILL enabled — fixes
                 *  the race where rapid on/off left orphans on the map. */
                const setPlacesPillVisible = async (pillKey: string, visible: boolean) => {
                    const cat = POI_CATEGORIES.find(c => c.key === pillKey);
                    if (!cat || !cat.placesType) return;

                    // Clear unconditionally so the off path AND the
                    // "rapidly toggled on twice" path both reset cleanly.
                    (placesMarkers[pillKey] || []).forEach(m => m.setMap(null));
                    placesMarkers[pillKey] = [];

                    if (!visible) return;

                    const results = await fetchPlacesForTrip(cat);

                    // Re-check after the await — the user may have
                    // toggled the pill back off while we were waiting.
                    if (!enabledPois.has(pillKey)) return;

                    // Resolve the user's filter for this pill.
                    // Falls back to POI_CATEGORIES.defaultMinRating
                    // (4 for restaurants/hotels, 0 elsewhere) when the
                    // user hasn't customised. Places without a rating
                    // get a defensive 0, so they fail any non-zero floor.
                    const userFilter = STATE.preferences?.poiFilters?.[pillKey] || {};
                    const minRating = typeof userFilter.minRating === 'number'
                        ? userFilter.minRating
                        : cat.defaultMinRating;

                                        const markers: any[] = [];
                    const seen = new Set();
                    results.forEach(place => {
                        const pid = place.place_id;
                        if (pid && seen.has(pid)) return;
                        if (pid) seen.add(pid);
                        // Primary-type check: keep only places whose
                        // first-listed type genuinely matches this
                        // category. Hotels-with-restaurants stay under
                        // Hotels (types[0]='lodging' or '*_hotel'),
                        // restaurants-inside-hotels stay under
                        // Restaurants (types[0]='restaurant' or
                        // '*_restaurant'). Categories without a matcher
                        // (parks, medical, worship, etc.) keep every
                        // result Google's nearbySearch returns.
                        if (!isPrimaryMatch(cat.key, place.types, place.name)) return;
                        const rating = typeof place.rating === 'number' ? place.rating : 0;
                        if (rating < minRating) return;
                        const m = dropPlaceMarker(cat, place);
                        if (m) markers.push(m);
                    });
                    placesMarkers[pillKey] = markers;
                };

                /** Per-trip pill toggles persist via STATE.preferences.
                 *  enabledPois[tripId] so navigating away and back, or
                 *  refreshing the browser, restores the pills + their
                 *  markers. The Set here is the in-render mirror; we
                 *  sync to STATE on every toggle and seed from STATE on
                 *  init below. */
                const tripIdForPills = activeTrip?.id || '';
                const persistedPills = (STATE.preferences?.enabledPois?.[tripIdForPills] || [])
                    .filter(k => POI_CATEGORIES.some(c => c.key === k));
                                const enabledPois: Set<string> = new Set(persistedPills);

                const mapOptions = {
                    center: savedMapView ? { lat: savedMapView.lat, lng: savedMapView.lng } : { lat: 20, lng: 0 },
                    zoom: savedMapView ? savedMapView.zoom : 2,
                    minZoom: 2,
                    // hybrid = satellite imagery + roads/labels overlay.
                    // The label overlay is vector-rendered, so the POI
                    // styles below DO apply to the labels (restaurant
                    // names, attraction names, etc.). Satellite imagery
                    // itself is baked and unaffected, which is fine — the
                    // user's "decluttered map" goal is about hiding
                    // labels, not landmarks visible from space.
                    mapTypeId: 'hybrid',
                    disableDefaultUI: true,
                    keyboardShortcuts: false,
                    gestureHandling: 'greedy',
                    backgroundColor: '#ffffff',
                    styles: buildPoiStyles(enabledPois),
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                };

                const map = new google.maps.Map(mapContainer, mapOptions);
                window.activeMap = map; // Read by external Google Maps callbacks; keep on window.
                // Phase D2: merge dark map style on top of the POI
                // styles when the user is in dark mode. Page-level POI
                // styles win over the dark base because applyMapTheme
                // spreads dark first, base second.
                applyMapTheme(map, buildPoiStyles(enabledPois));

                // Live traffic overlay — created lazily, attached to the
                // map only while the Roads & traffic pill is on. Lives in
                // the outer scope so the click handler can flip it on/off.
                                let trafficLayer: any | null = null;
                const setTrafficVisible = (visible: boolean) => {
                    if (visible) {
                        if (!trafficLayer) trafficLayer = new google.maps.TrafficLayer();
                        trafficLayer.setMap(map);
                    } else if (trafficLayer) {
                        trafficLayer.setMap(null);
                    }
                };

                // (Earlier revisions of the Public transport pill auto-
                // swapped the map from hybrid → roadmap so Google's
                // dotted `transit.line.geometry` would render — those
                // styles only paint on roadmap. The auto-swap turned out
                // to be jarring: any user who'd left the pill enabled
                // got their satellite view yanked away on every refresh.
                // We've reverted to keeping the user's chosen map type.
                // The transit.line.geometry style override is still set
                // when the pill is on (see buildPoiStyles below) — it
                // silently no-ops on hybrid but renders correctly when
                // the user manually switches to roadmap via the map's
                // built-in mapTypeControl. The pill's job is now just
                // station markers; lines are an opt-in roadmap feature.

                // Wire the POI filter pills via delegation on the row.
                /** Persist the current enabledPois Set to STATE.preferences
                 *  so it survives navigation / refresh. Called after every
                 *  toggle. The list is sorted in POI_CATEGORIES order so
                 *  the persisted layout matches the on-screen pill order. */
                const persistEnabledPois = () => {
                    if (!STATE.preferences) return;
                    if (!STATE.preferences.enabledPois) STATE.preferences.enabledPois = {};
                    const tripId = activeTrip?.id || '';
                    if (!tripId) return;
                    STATE.preferences.enabledPois[tripId] = POI_CATEGORIES
                        .filter(c => enabledPois.has(c.key))
                        .map(c => c.key);
                    emit('state:changed');
                };

                // POI overlay show/hide toggle. The toggle button
                // sits ABOVE the search bar; the pills overlay sits
                // INSIDE the cover-card (absolute over the map). Both
                // are decoupled — `.is-expanded` on the button drives
                // its own pressed/chevron state; `.is-visible` on the
                // pills container drives whether the panel renders.
                // Visibility persists in localStorage so the user's
                // preference (hidden by default — pills are off until
                // they ask) sticks across reloads.
                const poiToggleBar = (document.getElementById('homePoiToggleBtn') as HTMLButtonElement | null);
                const poiOverlay = (document.getElementById('homeMapPoiToggles') as HTMLElement | null);
                if (poiToggleBar && poiOverlay) {
                    // Sync initial state (the inline render decides
                    // visibility from localStorage; mirror it here).
                    const startVisible = poiOverlay.classList.contains('is-visible');
                    poiToggleBar.classList.toggle('is-expanded', startVisible);
                    poiToggleBar.setAttribute('aria-expanded', startVisible ? 'true' : 'false');
                    poiOverlay.setAttribute('aria-hidden', startVisible ? 'false' : 'true');
                    poiToggleBar.addEventListener('click', () => {
                        const willShow = !poiOverlay.classList.contains('is-visible');
                        poiOverlay.classList.toggle('is-visible', willShow);
                        poiOverlay.setAttribute('aria-hidden', willShow ? 'false' : 'true');
                        poiToggleBar.classList.toggle('is-expanded', willShow);
                        poiToggleBar.setAttribute('aria-expanded', willShow ? 'true' : 'false');
                        try { localStorage.setItem('home_pills_visible', willShow ? '1' : '0'); } catch (_) {}
                    });
                }

                const poiTogglesEl = document.getElementById('homeMapPoiToggles');
                if (poiTogglesEl) {
                    poiTogglesEl.addEventListener('click', (ev) => {
                        const target = (ev.target as HTMLElement | null);

                        // Regular category pill — flip Places API markers
                        // for that category on/off.
                        const pill = target?.closest('.map-poi-toggle');
                        if (!pill) return;
                        const key = (pill as HTMLElement).dataset.poi;
                        if (!key) return;
                        const willBeOn = !enabledPois.has(key);
                        if (willBeOn) enabledPois.add(key);
                        else enabledPois.delete(key);
                        // Refresh styles (only "Roads & traffic" changes
                        // this layer — the highway label tweaks happen
                        // here).
                        map.setOptions({ styles: buildPoiStyles(enabledPois) });
                        // Roads & traffic pill: live congestion overlay.
                        if (key === 'traffic') setTrafficVisible(willBeOn);
                        // Places API markers (categories with placesType).
                        // Async; pill state flips immediately so the UI
                        // feels responsive even before search returns.
                        setPlacesPillVisible(key, willBeOn);
                        pill.classList.toggle('is-on', willBeOn);
                        pill.setAttribute('aria-pressed', String(willBeOn));
                        persistEnabledPois();
                    });
                }

                // Restore previously-active pills from preferences.
                // Each one fires a fresh Places API call (cache is
                // per-render and starts empty). Pill UI state is set
                // synchronously so the row reads correctly while the
                // markers stream in. Map styles + traffic overlay also
                // get restored if traffic was on.
                if (enabledPois.size > 0) {
                    map.setOptions({ styles: buildPoiStyles(enabledPois) });
                    if (enabledPois.has('traffic')) setTrafficVisible(true);
                    enabledPois.forEach(key => {
                        const pill = poiTogglesEl?.querySelector(`.map-poi-toggle[data-poi="${key}"]`);
                        if (pill) {
                            pill.classList.add('is-on');
                            pill.setAttribute('aria-pressed', 'true');
                        }
                        setPlacesPillVisible(key, true);
                    });
                }

                // Wire selection-change → re-fetch active pills.
                // When the user clicks Day 3 on the wheel, any
                // currently-active POI pill should re-fetch around
                // Day 3's pin (the search center moves with the
                // wheel). We do this by hiding then re-showing
                // each active pill, which clears its old markers
                // and runs a fresh nearbySearch via the standard
                // setPlacesPillVisible flow. Cache hits per
                // (tripId, pillKey, anchorId) keep the second
                // toggle of the same day instant.
                registerPathSelectionHooks({
                    onSelectedDayChange: () => {
                        if (enabledPois.size === 0) return;
                        enabledPois.forEach(key => {
                            // Skip categories that always anchor
                            // to Anchor (transit etc.) — their
                            // results don't depend on the selected
                            // day.
                            const cat = POI_CATEGORIES.find(c => c.key === key);
                            if (cat && shouldForceAnchor(cat)) return;
                            setPlacesPillVisible(key, false);
                            setPlacesPillVisible(key, true);
                        });
                    },
                });

                // ── Map search banner ──────────────────────────────────
                // Free-form search of the Google Places database for the
                // home map. The user types, AutocompleteService returns
                // structured predictions, click a row and PlacesService
                // .getDetails fetches the place's geometry + types.
                // Result lands as a custom marker that uses the same
                // InfoWindow flow (with the Add-to-to-do button) as the
                // POI pills, so anything found here can be added to the
                // trip's to-do list (and pre-ticked for AI) with one tap.
                //
                // The "category" displayed in the InfoWindow is faked
                // from the place's types[] (best-effort match against
                // POI_CATEGORIES, falling back to a generic 📍 pin).
                (() => {
                    const searchInput = (document.getElementById('homeMapSearchInput') as HTMLInputElement | null);
                    const resultsEl   = (document.getElementById('homeMapSearchResults') as HTMLElement | null);
                    const clearBtn    = (document.getElementById('homeMapSearchClear') as HTMLButtonElement | null);
                    if (!searchInput || !resultsEl || !clearBtn) return;
                    if (typeof google === 'undefined' || !google.maps?.places?.AutocompleteService) return;

                    const autocomplete = new google.maps.places.AutocompleteService();
                                        let searchMarker: google.maps.Marker | null = null;
                                        let typingTimer: ReturnType<typeof setTimeout> | null = null;

                    /** Pick the best POI category match for a place — used so
                     *  the InfoWindow matches the colour/icon of the relevant
                     *  pill if the place happens to be a known type. */
                    const guessCategory = (types: string[] | undefined) => {
                        if (!Array.isArray(types)) return null;
                        for (const cat of POI_CATEGORIES) {
                            if (!cat.placesType) continue;
                            if (types.includes(cat.placesType)) return cat;
                            if (Array.isArray(cat.extraPlacesTypes) && cat.extraPlacesTypes.some((t: string) => types.includes(t))) return cat;
                        }
                        return null;
                    };
                    const fallbackCat = { key: 'search', icon: '📍', color: '#0071e3', label: 'Search result' };

                    const hideResults = () => {
                        resultsEl.style.display = 'none';
                        resultsEl.innerHTML = '';
                    };

                    /** Format a metres count as a compact distance. <1km
                     *  in metres ("850 m"), 1–100km in km with one decimal
                     *  ("12.4 km"), >100km in km no decimal ("245 km"). */
                    const formatDistance = (meters: number | null | undefined) => {
                        if (typeof meters !== 'number' || !isFinite(meters) || meters < 0) return '';
                        if (meters < 1000) return `${Math.round(meters)} m`;
                        const km = meters / 1000;
                        if (km < 100) return `${km.toFixed(1)} km`;
                        return `${Math.round(km)} km`;
                    };

                    const renderPredictions = (preds: any[] | null | undefined) => {
                        if (!preds || preds.length === 0) {
                            resultsEl.style.display = 'block';
                            resultsEl.innerHTML = `<div style="padding:14px 18px; color:var(--text-secondary); font-size:0.85rem;">No matches.</div>`;
                            return;
                        }
                        resultsEl.style.display = 'block';
                        resultsEl.innerHTML = preds.slice(0, 6).map((p: any) => {
                            // distance_meters is populated by the
                            // AutocompleteService when the request carried
                            // an `origin` (the trip's anchor pin lat/lng,
                            // see the request builder below). Falls back
                            // to empty string for predictions that don't
                            // expose it (e.g. very generic queries) so the
                            // row still renders cleanly.
                            const distHtml = typeof p.distance_meters === 'number'
                                ? `<span style="flex-shrink:0; font-size:0.72rem; color:var(--text-secondary); font-weight:700; margin-left:8px; padding:2px 8px; background:rgba(0,113,227,0.07); border-radius:999px; align-self:center;">${esc(formatDistance(p.distance_meters))}</span>`
                                : '';
                            return `
                            <button type="button" class="map-search-row" data-place-id="${esc(p.place_id)}"
                                style="width:100%; text-align:left; padding:11px 16px; background:transparent; border:0; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:10px; align-items:flex-start; cursor:pointer;">
                                <span style="font-size:1rem; line-height:1.2; flex-shrink:0;">📍</span>
                                <div style="flex:1; min-width:0;">
                                    <div style="font-weight:700; color:#002d5b; font-size:0.88rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.structured_formatting?.main_text || p.description || '')}</div>
                                    ${p.structured_formatting?.secondary_text ? `<div style="font-size:0.74rem; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.structured_formatting.secondary_text)}</div>` : ''}
                                </div>
                                ${distHtml}
                            </button>
                        `;}).join('');
                    };

                    /** Make-or-update the marker that represents the
                     *  user's current search hit. Uses the same icon
                     *  shape as POI markers (colour-fill SVG) so it
                     *  reads as a search-pin rather than something
                     *  arbitrary. */
                    const dropMarker = (place: any, cat: any) => {
                        const loc = place?.geometry?.location;
                        if (!loc) return;
                        const color = cat.color || '#0071e3';
                        const icon = {
                            path: 'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z',
                            fillColor: color,
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                            scale: 1.6,
                            anchor: new google.maps.Point(12, 22),
                        };
                        if (searchMarker) searchMarker.setMap(null);
                        searchMarker = new google.maps.Marker({
                            position: loc,
                            map,
                            icon,
                            title: place.name || '',
                            zIndex: 9999,
                        });
                        // Recenter + zoom in. Don't use fitBounds — we want
                        // a graceful glide, not a viewport jump.
                        map.panTo(loc);
                        if (map.getZoom() < 14) map.setZoom(15);

                        // Open the same InfoWindow the POI pills use, so
                        // the Add-to-to-do button appears.
                        const iw = getInfoWindow();
                        iw.setContent(buildInfoWindowHtml(cat, place));
                        google.maps.event.addListenerOnce(iw, 'domready', () => {
                            wireInfoWindowMarkButtons(cat, place);
                        });
                        iw.open({ map, anchor: searchMarker });
                    };

                    const fetchDetails = (placeId: string) => {
                        const svc = getPlacesService();
                        svc.getDetails({
                            placeId,
                            fields: ['place_id', 'name', 'formatted_address', 'vicinity', 'geometry', 'types', 'rating', 'user_ratings_total', 'icon', 'url'],
                        }, (place: any, status: string) => {
                            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
                            const cat = guessCategory(place.types) || fallbackCat;
                            dropMarker(place, cat);
                        });
                    };

                    searchInput.addEventListener('input', () => {
                        const q = searchInput.value.trim();
                        clearBtn.style.display = q ? 'inline-flex' : 'none';
                        if (typingTimer) clearTimeout(typingTimer);
                        if (!q) { hideResults(); return; }
                        // Debounce 220ms — Autocomplete is cheap but a
                        // request per keystroke is wasteful and noisy
                        // visually as predictions fight to render.
                        typingTimer = setTimeout(() => {
                            // Bias predictions toward the current viewport
                            // so "lisbon" while looking at Berlin doesn't
                            // surface unrelated Lisbons; falls back to
                            // global if no map bounds yet.
                                                        const req: google.maps.places.AutocompletionRequest = { input: q };
                            const bounds = map.getBounds();
                            if (bounds) req.bounds = bounds;
                            // Set `origin` to the trip's anchor pin so
                            // each prediction carries `distance_meters`
                            // from there — the result rows render the
                            // distance as a small chip on the right.
                            // Skipped when the trip has no geo (legacy
                            // text-only trips); predictions still work,
                            // just without the distance chip.
                            if (activeTrip && typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
                                req.origin = { lat: activeTrip.lat, lng: activeTrip.lng };
                            }
                            autocomplete.getPlacePredictions(req, (preds: any, status: string) => {
                                if (status !== google.maps.places.PlacesServiceStatus.OK) {
                                    if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                                        renderPredictions([]);
                                    } else {
                                        hideResults();
                                    }
                                    return;
                                }
                                renderPredictions(preds || []);
                            });
                        }, 220);
                    });

                    resultsEl.addEventListener('click', (e) => {
                        const target = e.target as HTMLElement | null;
                        const row = target?.closest('.map-search-row') as HTMLElement | null;
                        if (!row?.dataset.placeId) return;
                        const placeId = row.dataset.placeId;
                        searchInput.value = row.querySelector('div')?.textContent?.trim() || searchInput.value;
                        hideResults();
                        fetchDetails(placeId);
                    });

                    clearBtn.addEventListener('click', () => {
                        searchInput.value = '';
                        clearBtn.style.display = 'none';
                        hideResults();
                        if (searchMarker) { searchMarker.setMap(null); searchMarker = null; }
                        const iw = getInfoWindow();
                        try { iw.close(); } catch (_) {}
                        searchInput.focus();
                    });

                    // Click outside the search wrapper closes the
                    // suggestions but keeps the input value (so the
                    // user can refine).
                    document.addEventListener('click', (e) => {
                        const wrap = document.getElementById('homeMapSearchWrap');
                        if (!wrap) return;
                        if (!wrap.contains((e.target as Node))) hideResults();
                    });
                })();

                // Add pins for accepted Trip Days that have locations
                const currentTripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];
                activeMarkers = {}; // Reset cache
                currentTripDays.forEach(day => {
                    if (day.lat && (day.lon || day.lng)) {
                        const lon = day.lon || day.lng;
                        const isEditing = editingDayId === day.id;
                        const isStartingPoint = day.dayNumber === 0;

                        // Anchor: gold-plated circle with a white star
                        // inside, shipped as one SVG data-URL — no text
                        // label, no font fallback, the glyph is part of
                        // the image so it never glitches on re-render.
                        // Recoloured from green (%2334c759) to
                        // %23c89a18 to match the rest of the Anchor
                        // theme (chip, badge, primary button, card glow).
                        // Numbered days: blue circle with the day number
                        // as a label.
                        const GENESIS_SVG = 'data:image/svg+xml;utf8,'
                            + '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'
                            + '<circle cx="24" cy="24" r="21" fill="%23c89a18" stroke="white" stroke-width="3"/>'
                            + '<path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>'
                            + '</svg>';
                        const marker = new google.maps.Marker({
                            position: { lat: day.lat, lng: lon },
                            map: map,
                            draggable: isEditing,
                            title: isStartingPoint
                                ? 'Trip Anchor'
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
                            zIndex: isStartingPoint ? 1 : 100, // numbered days draw above the anchor star
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
                                if (typeof map.getZoom === 'function' && map.getZoom() < 13) map.setZoom(13);
                                // Open a shared InfoWindow with a
                                // Street View thumb. Single shared
                                // window so opening another pin
                                // closes the previous one (Google
                                // Maps standard pattern).
                                openDayPinInfoWindow(marker, day);
                            });
                        }
                    }
                });

                /** Single shared InfoWindow for day pins — opens
                 *  with a Street View Static thumbnail of the
                 *  pinned spot + the day's number / name. The
                 *  thumbnail URL is built lazily (no network round
                 *  trip until the InfoWindow opens), and Google
                 *  serves a "no imagery available" placeholder
                 *  when there's no street-view coverage so we
                 *  don't need to pre-probe. The user gets a tiny
                 *  visual sense of WHAT's at this pin without
                 *  leaving the map. */
                                let dayPinInfoWindow: any | null = null;
                const openDayPinInfoWindow = (marker: any, day: any) => {
                    if (!dayPinInfoWindow) dayPinInfoWindow = new google.maps.InfoWindow();
                    const lat = day.lat;
                    const lng = day.lng || day.lon;
                    const url = streetViewUrl({ lat, lng }, { width: 280, height: 160, fov: 90 });
                    const isStartingPoint = day.dayNumber === 0;
                    const headerLabel = isStartingPoint
                        ? '⚓ Trip Anchor'
                        : `Day ${day.dayNumber}`;
                    const dayNameHtml = day.name && !isStartingPoint
                        ? `<div style="font-size:0.78rem; color:rgba(0,45,91,0.6); margin-top:2px;">${esc(day.name)}</div>`
                        : '';
                    const dateHtml = day.date && !isStartingPoint
                        ? `<div style="font-size:0.7rem; color:var(--accent-blue); font-weight:700; margin-top:2px;">📅 ${esc(formatDayDate(day.date) || day.date)}</div>`
                        : '';
                    const imgHtml = url
                        ? `<img src="${esc(url)}" alt="Street view of ${esc(headerLabel)}"
                            referrerpolicy="no-referrer"
                            style="display:block; width:100%; height:160px; object-fit:cover; border-radius:10px; margin-bottom:10px; background:rgba(0,0,0,0.05);">`
                        : '';
                    const html = `
                        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; min-width:240px; max-width:300px; padding:4px 4px 6px;">
                            ${imgHtml}
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(headerLabel)}</div>
                            ${dayNameHtml}
                            ${dateHtml}
                        </div>
                    `;
                    dayPinInfoWindow.setContent(html);
                    dayPinInfoWindow.open({ map, anchor: marker });
                };

                // Day-to-day route line — connects consecutive
                // numbered day pins (Day 1 → Day 2 → … → Day N) so
                // the trip's journey reads at a glance on the map.
                // Anchor (dayNumber === 0) is filtered out inside
                // the helper. The function paints a neon three-stack
                // polyline (halo / glow / core), upgrades to road-
                // following via fetchDayRoutePath when the API
                // resolves, and runs a 1.6s breathe rAF loop. It
                // also cancels any prior pulse so re-renders don't
                // stack timers.
                renderDayRoutePolyline(map, currentTripDays, activeTrip);

                // Re-attach map click listener if we are in the middle of pinning
                if (activeMapClickListener) {
                    const cb = activeMapClickListener;
                    map.addListener('click', (e: any) => cb({ latlng: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
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
                        geocoder.geocode({ address: cleanQuery }, (results: any, status: string) => {
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
                                        const _g: any = google;
                    const DAY_CACHE_PREFIX = 'tggDayCountry:';
                    const cachedCountryFor = async (lat: number, lng: number) => {
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
                                const cc = (r.address_components || []).find((c: any) => (c.types || []).includes('country'));
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
                            if (code) slideshow.addDiscoveredCountry(code);
                        }
                    })();
                }
            }
        }, 100);
    }

    // Shared logic for guide and days
    const tripExpenses = activeTrip ? (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id) : [];
    const tripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];

    // Getting Started Guide moved to ./home/gettingStartedGuide.ts
    // during the Phase B1 home.ts split. The append call lives at the
    // end of renderHome, just before wireRoleButtonKeys.



    // No interval for active trips - keep it simple and aesthetic


    // Trip Days Section
    const daysContainer = document.createElement('div');
    daysContainer.style.marginTop = '40px';

    // Day 0 / Trip Anchor: every trip with a known location auto-gets a
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
                name: 'Trip Anchor',
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
     *    3) Linked-but-pending companions (⏳ Pending)
     *    4) Unlinked entries (Relaxer — they have no edit rights, like a relaxer)
     *  Click anywhere on the panel routes through the same dispatcher
     *  the pill button uses, so behaviour is one source-of-truth. */
    const buildMemberChipsHtml = () => {
        if (!activeTrip) return '';
        const members = activeTrip.members || [];
        const companions = activeTrip.companions || [];

                const chips: Array<{name: string, role: string|null, picture?: string|null, isOwner: boolean, isMember: boolean, isPending?: boolean}> = [];
        const seenMemberIds = new Set();

        // Owner first.
        const owner = members.find(m => m.userId === activeTrip.ownerId);
        if (owner) {
            chips.push({
                name: findTripCompanionByLinkedUser(activeTrip, owner.userId)?.name || owner.name || 'Owner',
                role: owner.role,
                picture: owner.picture ?? null,
                isOwner: true,
                isMember: true,
            });
            seenMemberIds.add(owner.userId);
        }
        // Other accepted members.
        for (const m of members) {
            if (seenMemberIds.has(m.userId)) continue;
            seenMemberIds.add(m.userId);
            chips.push({
                name: findTripCompanionByLinkedUser(activeTrip, m.userId)?.name || m.name || m.userId,
                role: m.role,
                picture: m.picture ?? null,
                isOwner: false,
                isMember: true,
            });
        }
        // Companions on the trip — skip the ones we already chip'd above
        // via the members loop. Pending = linked but not yet accepted.
        for (const c of companions) {
            if (c.linkedUserId && seenMemberIds.has(c.linkedUserId)) continue;
            chips.push({
                name: c.name,
                role: null,
                isOwner: false,
                isMember: false,
                isPending: !!c.linkedUserId, // linked but not in trip.members yet
            });
        }

        if (chips.length === 0) return '';

        const renderChip = (chip: { name: string; role: string | null; picture?: string | null; isOwner: boolean; isMember: boolean; isPending?: boolean }) => {
            // Defensive — historical snapshots could carry malformed entries
            // (e.g. legacy `string[]` companions where `chip.name` would be
            // undefined). Falls back to a neutral glyph rather than crashing
            // the whole page; loadState now normalises on boot too.
            const safeName = chip.name || '·';
            const initial = safeName.charAt(0).toUpperCase() || '·';
            const avatar = chip.picture
                ? `<img class="member-chip__avatar" src="${esc(chip.picture)}" alt="" referrerpolicy="no-referrer">`
                : `<span class="member-chip__initial">${esc(initial)}</span>`;
            let badge;
            if (chip.isOwner) {
                badge = `<span class="member-chip__role member-chip__role--owner">👑 Owner</span>`;
            } else if (chip.isMember) {
                // Real accepted member — badge reflects their actual role.
                const label = chip.role === ROLE_PLANNER ? 'Planner'
                    : chip.role === ROLE_BUDGETEER ? 'Budgeteer'
                    : 'Relaxer';
                const variant = chip.role === ROLE_PLANNER ? 'planner'
                    : chip.role === ROLE_BUDGETEER ? 'budgeteer'
                    : 'relaxer';
                badge = `<span class="member-chip__role member-chip__role--${variant}">${label}</span>`;
            } else if (chip.isPending) {
                badge = `<span class="member-chip__role member-chip__role--companion">⏳ Pending</span>`;
            } else {
                // Unlinked entry — no real account behind it, so they
                // can't edit. Render as Relaxer so every chip on the panel
                // carries a consistent role label rather than the
                // tautological "Companion" tag.
                badge = `<span class="member-chip__role member-chip__role--relaxer">Relaxer</span>`;
            }
            return `<div class="member-chip ${chip.isOwner ? 'member-chip--owner' : ''}">${avatar}<span class="member-chip__name">${esc(safeName)}</span>${badge}</div>`;
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
                    ${(() => {
                        // "Open in Google Maps" — visible to everyone
                        // (relaxers included; opening a link is read-only).
                        // Prefer place_id when we have one — it lands on
                        // the canonical Place page in Google Maps with
                        // photos, hours, reviews, directions all queued
                        // up. Falls back to lat/lng search, then to a
                        // text search of the trip's country/city, so
                        // there's always a working URL.
                        let href = '';
                        if (activeTrip.placeId) {
                            href = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(activeTrip.placeId)}`;
                        } else if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
                            href = `https://www.google.com/maps/search/?api=1&query=${activeTrip.lat},${activeTrip.lng}`;
                        } else if (activeTrip.country) {
                            href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTrip.country)}`;
                        }
                        if (!href) return '';
                        return `
                            <a href="${href}" target="_blank" rel="noopener" class="icon-btn-square" title="Open this trip's location in Google Maps" aria-label="Open in Google Maps">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </a>
                        `;
                    })()}
                    <!-- Share-to-feed used to live here; moved to the
                         public-trip detail page (collections / profile)
                         so only Public-flagged trips are shareable.
                         This slot now hosts the Silence Actions
                         toggle (owner-only) — flips trip.actionsHidden
                         so create / archive / join events for THIS
                         trip stop appearing in friends' Actions feeds.
                         Pure privacy escape hatch; doesn't affect
                         already-shared posts (those have their own
                         unshare control). -->
                    ${tripIsManageable ? `
                        <button id="silenceTripBtn" class="icon-btn-circle" data-silenced="${activeTrip.actionsHidden ? '1' : '0'}"
                            style="--accent: ${activeTrip.actionsHidden ? '255,59,48' : '127,140,156'};${activeTrip.actionsHidden ? ' background:#ff3b30; color:white; border-color:#ff3b30;' : ''}"
                            title="${activeTrip.actionsHidden ? 'Trip actions are silenced — click to make them visible in friends\' Actions feeds' : 'Silence trip actions — hide create / archive / join events from friends\' Actions feeds'}"
                            aria-label="${activeTrip.actionsHidden ? 'Unsilence trip actions' : 'Silence trip actions'}"
                            aria-pressed="${activeTrip.actionsHidden ? 'true' : 'false'}">
                            ${activeTrip.actionsHidden ? `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                    <path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path>
                                    <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path>
                                    <path d="M18 8a6 6 0 0 0-9.33-5"></path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            ` : `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                            `}
                        </button>
                    ` : ''}
                    ${!tripIsEditable ? `
                        <span class="trip-role-badge trip-role-badge--relaxer" title="You're a Relaxer on this trip — view-only">👁 Relaxer</span>
                    ` : ''}
                ` : ''}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <span>${tripDays.length} Day${tripDays.length !== 1 ? 's' : ''} of adventure</span>
                <!-- Local-time chip — populated async by the
                     fetchTimeZone hook below when the trip has a
                     lat/lng (almost all do). Hidden until the data
                     lands; updates every 30s while the user is on
                     the page so the clock stays correct. -->
                <span id="homeTripLocalTimeChip" class="trip-local-time-chip" style="display:none;"></span>
            </p>
        </div>

        ${activeTrip ? `
            <!-- Trip tab nav. Used to be a horizontal underline tab
                 row reusing .home-tabnav (feed.js style); with only
                 two tabs that read sparse + the underline visually
                 echoed the day-wheel timeline below. Now a centered
                 segmented-capsule toggle (.trip-tabnav) — a single
                 glass pill with two interior pills, the active one
                 carrying the blue→purple gradient that matches the
                 Day badges. Each tab gets a small icon so the
                 segmented control reads as more than just two words.
                 The Documents and Photos panels still render below
                 (gated by activeHomeTab) but are reached from
                 Anchor options modals now. -->
            <div class="trip-tabnav-wrap">
                <nav class="trip-tabnav" role="tablist" aria-label="Trip view">
                    <button class="trip-tabnav__tab${activeHomeTab === 'days' ? ' is-active' : ''}" data-home-tab="days" role="tab" aria-selected="${activeHomeTab === 'days' ? 'true' : 'false'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span>Path</span>
                    </button>
                    <button class="trip-tabnav__tab${activeHomeTab === 'companions' ? ' is-active' : ''}" data-home-tab="companions" role="tab" aria-selected="${activeHomeTab === 'companions' ? 'true' : 'false'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Companions</span>
                    </button>
                </nav>
            </div>
        ` : ''}

        <!-- Companions tab content. Render order matters: this sits ABOVE
             the Days tab in source so the timeline stays the document
             outline anchor; the active-tab CSS swap hides whichever isn't
             active without remounting either. -->
        ${activeTrip ? `
            <div class="home-tab-content${activeHomeTab === 'companions' ? ' is-active' : ''}" data-home-tab="companions">
                ${(() => {
                    const companionCount = tripIsManageable
                        ? (activeTrip.companions || []).length
                        : (activeTrip.members || []).length;
                    const ctaLabel = tripIsManageable
                        ? (companionCount > 0 ? '✏️ Edit travel companions' : '➕ Add travel companions')
                        : '👁 See trip members';
                    const ctaTitle = tripIsManageable
                        ? 'Pick which account companions are on this trip'
                        : 'See who is on this trip';
                    return `
                        <!-- Companions panel — was a small blue pill +
                             chip row below. Promoted to a full glass
                             card with a gradient header strip + an
                             explicit primary CTA button so the section
                             reads as a first-class part of the trip
                             header (same hierarchy as Path / Anchor
                             cards). -->
                        <div class="trip-companions-card">
                            <div class="trip-companions-card__header">
                                <div class="trip-companions-card__icon">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="9" cy="7" r="4"></circle>
                                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                    </svg>
                                </div>
                                <div class="trip-companions-card__heading">
                                    <h3 class="trip-companions-card__title">Travel companions</h3>
                                    <p class="trip-companions-card__subtitle">${companionCount} ${companionCount === 1 ? 'person' : 'people'} on this trip</p>
                                </div>
                                <span class="trip-companions-card__count">${companionCount}</span>
                            </div>

                            <div class="trip-companions-card__chips">
                                ${memberChipsHtml || `
                                    <div class="trip-companions-card__empty">
                                        ${tripIsManageable
                                            ? 'No companions added yet. Tap the button below to invite friends or add unlinked names.'
                                            : 'You are the only one on this trip so far.'}
                                    </div>
                                `}
                            </div>

                            <button id="tripCompanionsBtn" class="trip-companions-card__cta" title="${esc(ctaTitle)}">
                                ${esc(ctaLabel)}
                            </button>
                        </div>
                    `;
                })()}
            </div>

            <!-- To-do list tab content was removed when /todo became
                 a top-level page — the data and the day-detail modal's
                 "From your to-do list" block both still work. -->

            <!-- Documents + Photos tabs USED to live here as inline
                 panels gated by activeHomeTab swaps. Both moved to
                 popup modals (openTripDocumentsModal /
                 openTripPhotosModal) opened from Anchor options —
                 see those functions for the actual rendering. The
                 inline panels became dead weight after the move
                 (still reachable only via direct activeHomeTab=
                 documents / photos, which nothing now sets) so we
                 deleted them entirely. -->
        ` : ''}

        <div class="home-tab-content${activeHomeTab === 'days' ? ' is-active' : ''}" data-home-tab="days" style="display: flex; flex-direction: column; gap: 4px;">
            <!-- The Path tab content is built dynamically by buildPathTabHtml()
                 below so chip-click / prev / next / keyboard nav can patch
                 just this inner wrapper without a full Home re-render
                 (which would tear down the map and other heavy state). -->
            <div id="pathTabInner"></div>
        </div>
    `;

    if (activeTrip) {
        div.appendChild(daysContainer);

        // ── Path tab: chip-strip + Anchor + selected-day cards ─────
        // The vertical timeline was retired in favour of a horizontal
        // "wheel" — Anchor pinned on the left, the user-picked day
        // on the right, navigated via a numbered chip strip / prev-next
        // buttons / arrow keys / swipe. buildPathTabHtml() returns the
        // string and gets called twice: once on initial render, then
        // again on every selection change to patch just #pathTabInner
        // (so the map and other Home state don't churn).

        /** Build a single day card body — used for both Anchor (small
         *  ~30%) and the selected day (full width). The shape follows
         *  the same hierarchy as the old vertical card: number badge
         *  + title + date/location + secondary badges (pin status,
         *  notes preview if any). Anchor gets the trip-wide doc/photo
         *  count chips it always had.
         *  @param {any} day
         *  @param {{ isAnchor: boolean, isSelected: boolean }} flags
         */
        const buildDayCardBody = (day: any, { isAnchor, isSelected }: { isAnchor: boolean; isSelected: boolean }) => {
            const badge = isAnchor
                ? `<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
                       <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
                           <path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>
                       </svg>
                   </div>`
                : `<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
                       <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">Day</span>
                       <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${day.dayNumber}</span>
                   </div>`;
            const title = isAnchor ? 'Trip Anchor' : esc(day.name || `Day ${day.dayNumber}`);
            const subtitleParts: string[] = [];
            if (isAnchor) {
                subtitleParts.push(activeTrip && activeTrip.country ? esc(shortPlaceName(activeTrip.country)) : 'Where the trip begins');
                // Trip-wide doc/photo counts on Anchor (its long-standing role).
                const docs = (activeTrip.documents || []).filter(d => d.dayId === day.id);
                const photos = (activeTrip.photos || []).filter(p => p.dayId === day.id);
                const totalDocs = docs.length + (day.tickets || []).length;
                const totalPhotos = photos.length + (day.photos || []).length;
                if (totalPhotos) subtitleParts.push(`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📸 ${totalPhotos}</span>`);
                if (totalDocs) subtitleParts.push(`<span style="background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📎 ${totalDocs}</span>`);
            } else {
                subtitleParts.push(`📅 ${formatDayDate(day.date) || 'Set date'}`);
                if (day.lat) subtitleParts.push(`<span style="color: var(--accent-blue);">📍 Location set</span>`);
                else subtitleParts.push(`<span class="day-card__pin-hint">📌 Pin this day</span>`);
                // Weather slot — populated async by applyWeatherChips()
                // after the trip's forecast lands. Empty by default
                // so days that have no forecast (past dates, beyond
                // the API's 10-day window) just don't show a chip.
                if (day.date) {
                    subtitleParts.push(`<span class="day-card__weather" data-weather-date="${esc(day.date)}"></span>`);
                }
            }
            // Notes preview only on the bigger (selected) card — Anchor
            // is condensed by design, no preview body.
            const notesPreview = (isSelected && day.notes && !isAnchor) ? `
                <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
                    <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 4px; letter-spacing: 0.05em;">Journal preview</div>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(day.notes)}</p>
                </div>
            ` : '';
            return `
                <div style="display:flex; align-items:center; gap:14px;">
                    ${badge}
                    <div style="flex:1; min-width:0;">
                        <h3 style="margin:0; font-size:${isAnchor ? '1.05rem' : '1.25rem'}; font-weight:800; color:#002d5b; letter-spacing:-0.02em; line-height:1.2; ${isAnchor ? 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' : ''}">${title}</h3>
                        <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            ${subtitleParts.map(p => `<span>${p}</span>`).join('<span style="opacity:0.4;">·</span>')}
                        </div>
                    </div>
                </div>
                ${notesPreview}
            `;
        };

        /** Build the vertical options stack that sits under each card.
         *  Each card "owns" its own actions visually — Anchor gets a
         *  slim set (Trip checklist primary + Edit anchor pin +
         *  Documents + Photos); a numbered day gets Open Full Plan
         *  (primary) + Edit Pin + Journaling + Delete. When the user
         *  is mid pin-edit (editingDayId), the pin button morphs into
         *  Save + ✕ as before. Buttons stretch the column width via
         *  the `.path-options-stack .day-action-btn` CSS rule.
         *
         *  The day-level "Set as search center" toggle that used to
         *  sit on pinned numbered days was removed (per user). The
         *  read-side logic at line ~994 still honours any
         *  pillEpicenters value already in storage; the entry point
         *  to set/clear it will move into the pin-edit options in a
         *  future pass. */
        const buildOptionsStack = (day: any, { isAnchor }: { isAnchor: boolean }) => {
            if (!day || !tripIsEditable) return '';
            const buttons: string[] = [];
            // Primary button — different identity per day type.
            // Anchor: Trip checklist takes the gold-gradient primary
            // slot (per user). The "Open Full Plan" entry was dropped
            // from Anchor entirely — Anchor is the trip's hub, not
            // a calendar day, so a "full day plan" CTA didn't fit.
            // Numbered days: Open Full Plan stays the primary action.
            if (isAnchor) {
                buttons.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${esc(day.id)}">📝 Trip checklist</button>`);
            } else {
                buttons.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${esc(day.id)}">📋 Open Full Plan</button>`);
            }
            if (editingDayId === day.id) {
                // Mid pin-edit: present save + cancel as the next two
                // buttons (the pin row in the old layout did the same
                // — save is wide, cancel is narrow ✕). Stacked here.
                buttons.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${esc(day.id)}">Save pin</button>`);
                buttons.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${esc(day.id)}">Cancel pin edit</button>`);
            } else {
                const pinLabel = day.lat
                    ? (isAnchor ? '📍 Edit anchor pin' : '📍 Edit pin')
                    : (isAnchor ? '📍 Set anchor pin' : '📍 Add pin');
                buttons.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${esc(day.id)}"><span>${pinLabel}</span></button>`);
            }
            if (isAnchor) {
                // Documents + Photos used to be top-level trip tabs;
                // moved here (per user) so the trip tab nav stays
                // focused on Path / Companions and the trip-wide
                // media live where they conceptually belong — under
                // the Anchor hub. Clicking either swaps the
                // home-tab content surface; the panels themselves
                // get a "Back to Path" header so the user can
                // return without a tab to click.
                buttons.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${esc(day.id)}"><span>📎 Documents</span></button>`);
                buttons.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${esc(day.id)}"><span>📸 Photos</span></button>`);
            } else {
                // Numbered-day-only options.
                // (The "🎯 Set as search center" toggle lived here
                //  before — removed per user. The pillEpicenters
                //  state + the POI-search read-side logic stay
                //  intact; the entry point will move into the pin-
                //  edit options in a future pass. For now there's
                //  no way to flip a numbered day's epicenter from
                //  the UI; existing values keep working.)
                // Journaling — separate notes-only modal. Numbered
                // days only; Anchor swaps this for the Trip checklist
                // (now its primary button at the top).
                buttons.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${esc(day.id)}"><span>✍️ Journaling</span></button>`);
                // Delete — only on non-Anchor days. Anchor is
                // structurally permanent (anchors the trip).
                buttons.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${esc(day.id)}"><span>🗑️ Delete day</span></button>`);
            }
            return `<div class="path-options-stack">${buttons.join('')}</div>`;
        };

        /** The top-level Path tab content — chip strip + cards + options.
         *  Pure function of activeTrip + STATE; called on initial render
         *  and on every selection change. */
        const buildPathTabHtml = () => {
            const sortedDays = [...tripDays].sort((a, b) => a.dayNumber - b.dayNumber);
            const anchor = sortedDays.find(d => d.dayNumber === 0) || null;
            const numberedDays = sortedDays.filter(d => d.dayNumber > 0);
            const selectedId = resolveSelectedDayId(activeTrip, sortedDays);
            const selectedDay = sortedDays.find(d => d.id === selectedId) || null;
            // Empty state — no days yet (shouldn't happen since Anchor is
            // stamped on trip create, but defensive).
            if (sortedDays.length === 0) {
                return `<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">No days yet — create some.</div>`;
            }
            const totalDays = numberedDays.length;
            const selectedIsAnchor = selectedDay?.dayNumber === 0;
            const summaryText = selectedIsAnchor
                ? `Trip Anchor · ${totalDays} day${totalDays === 1 ? '' : 's'} planned`
                : (selectedDay
                    ? `Day ${selectedDay.dayNumber} of ${totalDays}`
                    : `${totalDays} day${totalDays === 1 ? '' : 's'} planned`);
            // Today's local date in YYYY-MM-DD — used to flag the day
            // chip that matches the user's actual calendar today so it
            // visually "stands" out from the rest of the wheel. Built
            // once per render, not per chip.
            const todayStr = (() => {
                const t = new Date();
                const y = t.getFullYear();
                const m = String(t.getMonth() + 1).padStart(2, '0');
                const dd = String(t.getDate()).padStart(2, '0');
                return `${y}-${m}-${dd}`;
            })();
            // Chip strip — Anchor chip first, then numbered days, then
            // a `+` chip (only for editable trips) that opens the
            // Add-Day modal. Each chip's `title` carries the day's name
            // + date so hovering surfaces context the chip itself can't
            // fit (per Q3 — numbers visible, titles in tooltip). Chips
            // matching today's date get `path-chip--today` so the
            // user sees where they "are" on the timeline at a glance —
            // selected stays the highest emphasis (it's where the user
            // explicitly is) but today is bumped above the resting
            // size so it pops even when the user is browsing other days.
            const chipsHtml = sortedDays.map(d => {
                const isSel = d.id === selectedId;
                const isGen = d.dayNumber === 0;
                const isToday = !isGen && d.date === todayStr;
                const cls = `path-chip${isGen ? ' path-chip--anchor' : ''}${isToday ? ' path-chip--today' : ''}${isSel ? ' is-selected' : ''}`;
                const tooltip = isGen
                    ? 'Trip Anchor — your trip\'s anchor'
                    : `${isToday ? 'Today · ' : ''}Day ${d.dayNumber}${d.name ? ' — ' + d.name : ''}${d.date ? ' · ' + (formatDayDate(d.date) || d.date) : ''}`;
                const inner = isGen
                    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>`
                    : String(d.dayNumber);
                return `<button type="button" class="${cls}" data-path-chip-day-id="${esc(d.id)}" title="${esc(tooltip)}" aria-label="${esc(tooltip)}" aria-pressed="${isSel}">${inner}</button>`;
            }).join('');
            const addChip = tripIsEditable
                ? `<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="Add a new day" aria-label="Add a new day">+</button>`
                : '';
            // Prev/Next nav — disabled at the ends of the list. Step
            // through sortedDays by index, no wrap-around.
            const idx = sortedDays.findIndex(d => d.id === selectedId);
            const prevDisabled = idx <= 0;
            const nextDisabled = idx < 0 || idx >= sortedDays.length - 1;
            // Cards row — two columns side-by-side, each "owning"
            // its own card + vertical options stack so there's no
            // ambiguity about which actions apply to which card.
            // Anchor column always renders (when Anchor exists);
            // the selected-day column renders only when the selected
            // day is a numbered day (when Anchor is the selected
            // card, the right column collapses and Anchor stretches
            // to fill).
            const columns: string[] = [];
            if (anchor) {
                const anchorIsSelected = selectedDay?.id === anchor.id;
                columns.push(`
                    <div class="path-column path-column--anchor">
                        <div class="path-card path-card--anchor${anchorIsSelected ? ' is-selected' : ''}" data-day-id="${esc(anchor.id)}">
                            ${buildDayCardBody(anchor, { isAnchor: true, isSelected: anchorIsSelected })}
                        </div>
                        ${buildOptionsStack(anchor, { isAnchor: true })}
                    </div>
                `);
            }
            if (selectedDay && selectedDay.dayNumber > 0) {
                columns.push(`
                    <div class="path-column path-column--selected">
                        <div class="path-card path-card--selected" data-day-id="${esc(selectedDay.id)}">
                            ${buildDayCardBody(selectedDay, { isAnchor: false, isSelected: true })}
                        </div>
                        ${buildOptionsStack(selectedDay, { isAnchor: false })}
                    </div>
                `);
            }
            return `
                <div class="path-strip">
                    <button type="button" class="path-nav-btn" id="pathPrevBtn" title="Previous day" aria-label="Previous day" ${prevDisabled ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div class="path-chips" role="tablist" aria-label="Trip days">
                        ${chipsHtml}
                        ${addChip}
                    </div>
                    <button type="button" class="path-nav-btn" id="pathNextBtn" title="Next day" aria-label="Next day" ${nextDisabled ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
                <div class="path-summary">${esc(summaryText)}</div>
                <div class="path-cards-row">${columns.join('')}</div>
            `;
        };

        /** Repaint #pathTabInner in place. Called on chip click,
         *  prev/next, keyboard arrow, swipe — anything that changes
         *  the selected day. After the swap, scroll the selected chip
         *  into view so off-screen chips don't strand the user. */
        const pathTabInner = (daysContainer.querySelector('#pathTabInner') as HTMLElement | null);
        // Weather forecast state. Declared BEFORE repaintPath because
        // the closure below calls paintWeatherChips with this
        // reference, and `let` (TDZ in strict-mode modules) would
        // throw if accessed before its declaration runs. The forecast
        // arrives async and gets assigned in the .then() below; the
        // initial repaint just paints empty chip slots, then the
        // post-fetch repaint fills them in.
        let _weatherForecast: WeatherForecast = null;

        const repaintPath = () => {
            if (!pathTabInner) return;
            pathTabInner.innerHTML = buildPathTabHtml();
            const sel = pathTabInner.querySelector('.path-chip.is-selected');
            if (sel) (sel as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            // Re-paint weather chips after every Path-tab repaint
            // (chip clicks rebuild the day cards, so the chip slot
            // elements are fresh and need re-population from the
            // cached forecast).
            paintWeatherChips(_weatherForecast, pathTabInner);
        };
        registerPathSelectionHooks({ repaintPathTab: repaintPath });
        repaintPath();

        if (activeTrip && typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            loadAndPaintWeather(activeTrip.lat, activeTrip.lng, pathTabInner).then((forecast) => {
                _weatherForecast = forecast;
            });
        }

        // Step the selection by ±1 in the sorted-day list. No wrap so
        // the user feels the ends of the list (the disabled prev/next
        // buttons reinforce that boundary).
        const stepSelectedDay = (delta: number) => {
            const sortedDays = [...(STATE.tripDays || [])
                .filter(d => d.tripId === activeTrip.id)]
                .sort((a, b) => a.dayNumber - b.dayNumber);
            const currentId = resolveSelectedDayId(activeTrip, sortedDays);
            const idx = sortedDays.findIndex(d => d.id === currentId);
            const next = sortedDays[idx + delta];
            if (next) setSelectedDay(activeTrip.id, next.id);
        };

        // Swipe support on the cards row — left swipe = next day, right
        // swipe = prev day. 40px threshold so accidental taps don't
        // change selection. Touch-only — desktop has the chip strip,
        // prev/next, and arrow keys.
        let swipeStartX: number | null = null;
        daysContainer.addEventListener('touchstart', (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            const cardsRow = (e.target instanceof Element ? e.target.closest('.path-cards-row') : null as HTMLElement | null);
            if (!cardsRow) return;
            swipeStartX = t.clientX;
        }, { passive: true });
        daysContainer.addEventListener('touchend', (e) => {
            if (swipeStartX == null) return;
            const t = e.changedTouches?.[0];
            const startX = swipeStartX;
            swipeStartX = null;
            if (!t) return;
            const dx = t.clientX - startX;
            if (Math.abs(dx) < 40) return;
            stepSelectedDay(dx < 0 ? +1 : -1);
        }, { passive: true });

        // Keyboard arrows when the Path tab is the active tab. Filter
        // out events from inputs/textareas so typing in modal forms
        // doesn't accidentally swap days.
        const onKeyDown = (e: KeyboardEvent) => {
            if (activeHomeTab !== 'days') return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tag = ((e.target as HTMLElement | null)?.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            stepSelectedDay(e.key === 'ArrowLeft' ? -1 : +1);
        };
        document.addEventListener('keydown', onKeyDown);
        // Cleanup hook — removed by stopHomeSlideshow path on navigate-away.
        // No formal lifecycle here, but the listener guards on activeHomeTab
        // and the active trip so a stale listener after navigation is
        // harmless until the next renderHome replaces the closure.

        // Delegated handler — per-day rows are dynamic; inner action buttons are
        // checked first so the outer card click (toggleDayMenu) only fires when
        // the user clicked the card body itself, not an action button.
        // Dispatcher is async because the silence-trip handler awaits
        // setTripActionsHidden — addEventListener ignores the returned
        // promise, so this is just sugar that keeps await available.
        daysContainer.addEventListener('click', async (e) => {
            const target = (e.target as HTMLElement | null);
            if (!target) return;

            // Reset map view — clicking the trip name fits the map to all
            // current border polygons. Useful when the user has panned the
            // map away and wants to return to the canonical view of the
            // trip's full footprint (covers multi-region polygons too).
            if (target.closest('#resetMapViewBtn')) {
                const map = (window.activeMap as any);
                if (!map || !activeTrip) return;
                                const _g: any = google;
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
                    // Single-pin trips (only Anchor, or only the trip
                    // header lat/lng) produce a near-zero-span bounds.
                    // fitBounds on that hits the max-zoom ceiling and
                    // shows a street-corner view — way too tight for
                    // "show me the whole trip" intent. Detect the
                    // collapse and fall back to the saved viewport
                    // (city-level) when available, else a sensible
                    // neighborhood zoom.
                    const ne = bounds.getNorthEast();
                    const sw = bounds.getSouthWest();
                    const latSpan = Math.abs(ne.lat() - sw.lat());
                    const lngSpan = Math.abs(ne.lng() - sw.lng());
                    const isEffectivelyPoint = latSpan < 0.001 && lngSpan < 0.001;
                    if (isEffectivelyPoint && activeTrip.viewport) {
                        const v = activeTrip.viewport;
                        map.fitBounds(new _g.maps.LatLngBounds(
                            { lat: v.south, lng: v.west },
                            { lat: v.north, lng: v.east },
                        ));
                    } else if (isEffectivelyPoint) {
                        map.setCenter(ne);
                        map.setZoom(12);
                    } else {
                        map.fitBounds(bounds, 80);
                    }
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

            // Home sub-tabs (Path / Companions) — toggle the active
            // block via class swap; all tabs stay in the DOM so
            // nothing has to remount on switch (preserves per-day
            // delegated handlers and timeline animation state). The
            // To-do list moved to its own top-level /todo page;
            // Documents + Photos moved to Anchor options (clicked
            // via .path-documents-btn / .path-photos-btn below) and
            // are reached via the same activeHomeTab swap. Selector
            // is .trip-tabnav__tab (the segmented-capsule design);
            // .home-tabnav still exists but is feed.js's tabs.
            const setActiveHomeTab = (key: 'days' | 'companions' | 'documents' | 'photos') => {
                activeHomeTab = key;
                daysContainer.querySelectorAll('.trip-tabnav__tab').forEach(t => {
                    const el = (t as HTMLElement);
                    const isActive = el.dataset.homeTab === activeHomeTab;
                    el.classList.toggle('is-active', isActive);
                    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                daysContainer.querySelectorAll('.home-tab-content').forEach(c => {
                    (c as HTMLElement).classList.toggle('is-active', (c as HTMLElement).dataset.homeTab === activeHomeTab);
                });
            };
            const tabBtn = (target.closest('.trip-tabnav__tab') as HTMLElement | null);
            const tabKey = tabBtn?.dataset.homeTab;
            if (tabKey === 'days' || tabKey === 'companions') {
                setActiveHomeTab(tabKey);
                return;
            }
            // Anchor options → open the Documents / Photos popup
            // modals. Used to do an in-page tab swap (which left
            // users on a "weird" content view instead of a popup);
            // now opens proper modals via openTripDocumentsModal /
            // openTripPhotosModal so the experience reads as
            // "click → popup", consistent with Trip checklist.
            if (target.closest('.path-documents-btn') && activeTrip) { openTripDocumentsModal(activeTrip); return; }
            if (target.closest('.path-photos-btn') && activeTrip) { openTripPhotosModal(activeTrip); return; }

            // Edit-trip pencil — owner-only, hidden when !manageable.
            if (target.closest('#editTripBtn')) { openEditTripModal(activeTrip); return; }

            // (Share-to-feed click handler moved to collections.js —
            // the button only renders on public-trip detail pages
            // now, see renderArchivedTripDetail.)

            // Silence-trip toggle — owner-only privacy control. Flips
            // trip.actionsHidden on the server + locally and patches
            // the button's visual state without a full re-render so
            // the click feels instant. Failed network = revert the
            // visual flip + toast so the user knows nothing changed.
            const silenceBtn = (target.closest('#silenceTripBtn') as HTMLElement | null);
            if (silenceBtn && activeTrip) {
                const wasSilenced = silenceBtn.dataset.silenced === '1';
                const willSilence = !wasSilenced;
                // Optimistic local + visual flip.
                activeTrip.actionsHidden = willSilence;
                applySilenceBtnVisual(silenceBtn, willSilence);
                emit('state:changed');
                const result = await setTripActionsHidden(activeTrip.id, willSilence);
                if (!result || !result.ok) {
                    // Roll back on failure (403 = relaxer/non-owner; 5xx
                    // = transient). Either way, revert the optimistic
                    // flip so the button doesn't lie about server state.
                    activeTrip.actionsHidden = wasSilenced;
                    applySilenceBtnVisual(silenceBtn, wasSilenced);
                    emit('state:changed');
                    showLiquidAlert(result?.status === 403
                        ? "Only the trip owner can silence trip actions."
                        : "Couldn't update — try again in a moment.");
                    return;
                }
                showLiquidAlert(willSilence
                    ? "Trip actions silenced — hidden from friends' feeds."
                    : "Trip actions visible again.");
                return;
            }

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

            const saveBtn = (target.closest('.day-pin-save-btn') as HTMLElement | null);
            if (saveBtn?.dataset.dayId) { saveDayPin(saveBtn.dataset.dayId); return; }

            const delPinBtn = (target.closest('.day-pin-delete-btn') as HTMLElement | null);
            if (delPinBtn?.dataset.dayId) { deleteDayPin(delPinBtn.dataset.dayId); return; }

            const togglePinBtn = (target.closest('.day-pin-toggle-btn') as HTMLElement | null);
            if (togglePinBtn?.dataset.dayId) {
                const dayId = togglePinBtn.dataset.dayId;
                const day = STATE.tripDays.find(d => d.id === dayId);
                if (day?.lat) editDayPin(dayId);
                else addDayPin(dayId);
                return;
            }

            const journalBtn = (target.closest('.day-journaling-btn') as HTMLElement | null);
            if (journalBtn?.dataset.dayId) { openJournalingModal(journalBtn.dataset.dayId); return; }

            // Anchor: Trip checklist option (free-form packing/errand
            // tasks). Distinct from /todo (places list) and from
            // Journaling (notes modal).
            if (target.closest('.path-checklist-btn') && activeTrip) {
                openTripChecklistModal(activeTrip);
                return;
            }

            // (Day-level Photos/Documents buttons were removed
            //  entirely. Both stores live at trip scope now and are
            //  managed from the Documents + Photos tabs on Home.)

            // ("Set as search center" toggle handler used to live
            //  here. Removed with the day-level button — see
            //  buildOptionsStack. The pillEpicenters state itself
            //  is preserved and read-side (see line ~994) still
            //  honours any existing values; the entry point will
            //  move into the pin-edit options in a future pass.)

            // The shortlist remove handler used to live here; the
            // to-do list moved to /todo so this button no longer
            // renders on home. The /todo page owns its own remove.

            // (Documents + Photos handlers moved out — they
            //  now live inside openTripDocumentsModal /
            //  openTripPhotosModal, scoped to the modal root.)

            const delDayBtn = (target.closest('.day-delete-btn') as HTMLElement | null);
            if (delDayBtn?.dataset.dayId) { deleteDay(delDayBtn.dataset.dayId); return; }

            const detailBtn = (target.closest('.day-detail-btn') as HTMLElement | null);
            if (detailBtn?.dataset.dayId) { openDayDetail(detailBtn.dataset.dayId); return; }

            // ── Path tab navigation handlers (chip-strip layout) ────
            // Add-day chip — opens the standard add-day modal.
            if (target.closest('#pathAddDayChip')) { openAddDayModal(); return; }
            // Prev/next nav buttons — step through sortedDays by ±1.
            if (target.closest('#pathPrevBtn')) { stepSelectedDay(-1); return; }
            if (target.closest('#pathNextBtn')) { stepSelectedDay(+1); return; }
            // Chip click — jump straight to that day.
            const chip = (target.closest('.path-chip[data-path-chip-day-id]') as HTMLElement | null);
            if (chip?.dataset.pathChipDayId && activeTrip) {
                setSelectedDay(activeTrip.id, chip.dataset.pathChipDayId);
                return;
            }
            // Card body click — selects that card. Anchor card click
            // when a numbered day is currently selected jumps focus to
            // Anchor; clicking the already-selected card is a no-op
            // (use the "Open Full Plan" button to enter the modal —
            // keeps the two interactions cleanly separated).
            const pathCard = (target.closest('.path-card[data-day-id]') as HTMLElement | null);
            if (pathCard?.dataset.dayId && activeTrip) {
                setSelectedDay(activeTrip.id, pathCard.dataset.dayId);
                return;
            }
        });

        // (Shortlist day/time dropdowns were removed — the manual flow
        // now relies entirely on the day-textarea content as the source
        // of truth. Assignment-as-metadata caused tag/textarea drift
        // when the user closed the modal without saving. The AI flow's
        // dropdowns live in the AI panel and are still authoritative
        // for that path because the prompt needs explicit assignments.)

        // (Documents + Photos day-select change handler moved
        //  to the modal openers — see openTripDocumentsModal /
        //  openTripPhotosModal.)

        // (addPhotosInput file-upload change listener moved
        //  to openTripPhotosModal — wired inside the modal
        //  via wireFileInput() so it reattaches after each
        //  body repaint.)

        // The legacy `#addDayBtn` (vertical-timeline footer) was retired
        // when the Path tab moved to the chip-strip layout — `+ Add Day`
        // now lives on the trailing "+" chip in the strip and is wired
        // through the delegated daysContainer click handler above
        // (#pathAddDayChip → openAddDayModal).
    }

    appendGettingStartedGuide({ parent: div, activeTrip, tripDays, tripExpenses });

    wireRoleButtonKeys(div);
    return div;
}

// openJournalingModal moved to ./home/journalingModal.ts during
// the Phase B1 home.ts split. Local-only single-call-site
// helper, imported at the top of this file.

// applySilenceBtnVisual + updateShareBtnVisualState +
// openShareToFeedModal moved to ./home/shareModal.ts during
// the Phase B1 home.ts split. Imported at the top of this
// file; the two exported pieces (updateShareBtnVisualState,
// openShareToFeedModal) are re-exported so collections.ts's
// existing import keeps working.

// openTripChecklistModal moved to ./home/tripChecklistModal.ts
// during the Phase B1 home.ts split. Local-only helper (used in
// 3 places inside this file), no external consumers — imported
// at the top.

// openTripDocumentsModal + openTripPhotosModal +
// openAddTripDocumentModal + openEditTripDocumentModal +
// openAddTripPhotoUrlModal moved to ./home/tripMediaModals.ts
// during the Phase B1 home.ts split. The two list-view openers
// (Documents, Photos) are imported at the top of this file; the
// three sub-modals are pulled in transitively by the list-view
// openers and don't need direct imports here.

// openPhotoLightbox + openPdfPreview + looksLikePdfUrl moved
// to ./home/lightbox.ts during the Phase B1 home.ts split.
// Imported at the top of this file; openPdfPreview +
// looksLikePdfUrl are re-exported so collections.ts's existing
// import keeps working.

// openDayView (read-only day-plan modal) moved to
// ./home/dayViewModal.ts during the Phase B1 split. Re-exported
// at the top of this file so collections.ts's existing import
// keeps working.




