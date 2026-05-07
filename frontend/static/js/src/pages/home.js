// @ts-check
// pages/home.js

import { STATE, emit } from '../state.js';
import { INSPIRATIONAL_PAIRS } from '../constants.js';
import { getMediaForTrip, showLiquidAlert, formatDayDate, q, showConfirmModal, generateId, shortPlaceName, esc } from '../utils.js';
import { upsertDay, uploadMedia, deleteDayOnServer, upsertTrip, shareTripToFeed, fetchShareStatus, unshareFeedPost } from '../api.js';
import { navigate } from '../router.js';
import { showPersTab } from './settings.js';
import { openNewTripModal, openAddDayModal, openEditTripModal, openCompanionPickerModal, openTripMembersModal } from '../modals.js';
import { canEdit, canManageRoster, ROLE_PLANNER, ROLE_BUDGETEER } from '../permissions.js';
import { findTripCompanionByLinkedUser } from '../companions.js';
import { showModal } from '../components/Modal.js';
import { wireRoleButtonKeys } from '../components/Keyboard.js';
import { findMarkedPlace, toggleTodoListMembership } from '../markedPlaces.js';
import {
    getAllTripDocuments, getAllTripPhotos,
    addTripDocument, addTripPhoto,
    removeTripDocument, removeTripPhoto,
    setDocumentDay, setPhotoDay,
    updateTripDocument,
    buildGmailTripSearchUrl,
} from '../tripMedia.js';

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
/** @type {'days' | 'companions' | 'documents' | 'photos'} */
let activeHomeTab = 'days'; // Sub-tab on the home trip view (Path / Companions / Documents / Photos)

// ── Path tab: selected-day state ────────────────────────────────────
// The vertical day-by-day timeline was replaced with a horizontal
// "wheel": Genesis pinned + the user-picked day, navigated via a
// chip strip / prev-next / keyboard / swipe. The selection persists
// per-trip in localStorage so leaving Home and coming back lands the
// user on the same day they were last looking at — important for
// multi-day trips where "where was I?" is a real friction.
//
// Shape: { [tripId]: dayId }. Stored in localStorage as
// 'home_path_selected_day_by_trip'. Cleared lazily on render when
// the cached id no longer matches a day on the trip.
/** @type {Object<string, string>} */
let selectedDayByTrip = {};
try {
    const _raw = localStorage.getItem('home_path_selected_day_by_trip');
    if (_raw) selectedDayByTrip = JSON.parse(_raw) || {};
} catch (_) { selectedDayByTrip = {}; }

/** Persist + remember a day selection. Called on every chip click,
 *  prev/next, keyboard arrow, and swipe gesture. Triggers a partial
 *  repaint of the Path tab via _repaintPathTab if it's been wired
 *  (set by renderHome on mount), then pans the home map to the
 *  selected day's pin so the right side of the screen stays in sync
 *  with the chip strip on the left. */
function setSelectedDay(tripId, dayId) {
    if (!tripId || !dayId) return;
    selectedDayByTrip[tripId] = dayId;
    try {
        localStorage.setItem('home_path_selected_day_by_trip', JSON.stringify(selectedDayByTrip));
    } catch (_) { /* localStorage full or disabled — fine */ }
    if (typeof _repaintPathTab === 'function') _repaintPathTab();
    // Map sync — pan to the selected day's pin (or, for Genesis with
    // no day-pin, the trip's anchor lat/lng). window.activeMap is set
    // by the map-init block when the home map mounts; if the user is
    // on a non-home page or the map hasn't initialised yet, this just
    // no-ops — selection still updates and persists, the next visit
    // to /home will reflect it.
    const map = /** @type {any} */ (window.activeMap);
    if (!map) return;
    const day = (STATE.tripDays || []).find(d => d.id === dayId);
    if (!day) return;
    const lat = typeof day.lat === 'number' ? day.lat : null;
    const lng = typeof day.lng === 'number' ? day.lng : (typeof day.lon === 'number' ? day.lon : null);
    try {
        if (lat != null && lng != null) {
            map.panTo({ lat, lng });
            if (typeof map.getZoom === 'function' && map.getZoom() < 13) map.setZoom(13);
        } else if (day.dayNumber === 0) {
            // Genesis with no day-pin — fall back to the trip's anchor.
            const trip = (STATE.trips || []).find(t => t.id === tripId);
            if (trip && typeof trip.lat === 'number' && typeof trip.lng === 'number') {
                map.panTo({ lat: trip.lat, lng: trip.lng });
            }
        }
    } catch (_) { /* map not ready / api hiccup — fine */ }
}

/** Resolve which day should be the visible "selected" one in the wheel.
 *  Order of preference:
 *    1. Persisted choice (if it's still a real day on this trip)
 *    2. Day whose date matches today (handy mid-trip)
 *    3. First numbered day (dayNumber > 0)
 *    4. Genesis (dayNumber === 0) — last resort, only when no
 *       numbered days exist yet
 *  @param {{id:string} | null} activeTrip
 *  @param {{id:string,dayNumber:number,date?:string}[]} sortedDays — already sorted by dayNumber asc
 *  @returns {string | null}
 */
function resolveSelectedDayId(activeTrip, sortedDays) {
    if (!activeTrip || !sortedDays.length) return null;
    const cached = selectedDayByTrip[activeTrip.id];
    if (cached && sortedDays.some(d => d.id === cached)) return cached;
    const today = new Date().toISOString().slice(0, 10);
    const todayMatch = sortedDays.find(d => d.dayNumber > 0 && d.date === today);
    if (todayMatch) return todayMatch.id;
    const firstNumbered = sortedDays.find(d => d.dayNumber > 0);
    if (firstNumbered) return firstNumbered.id;
    return sortedDays[0].id;
}

/** Set by renderHome → wires a partial-DOM repaint of just the Path
 *  tab content so changing the selected day doesn't need to re-render
 *  the whole Home page (which would tear down the map mid-interaction).
 *  Reset to null when home unmounts. */
/** @type {(() => void) | null} */
let _repaintPathTab = null;
// The "To do list" sub-tab was promoted to a top-level /todo page so
// the to-do list now has its own banner-style surface (see pages/todo.js
// + the navbar entry between Home and Plan with AI). The data still
// lives on `trip.markedPlaces[i].forManual`; the home page's day-detail
// modal still shows the "From your to-do list" block, so day-level
// AM/PM/Eve drops are unchanged.

/** Single source of truth for the home-map POI quick-access pills.
 *  Read by:
 *   - the template above (renders the icon-only / labeled pill row)
 *   - the Places API nearbySearch wiring (maps key → Places type +
 *     marker color)
 *   - the Settings → General tab (renders the per-pill filter UI)
 *
 *  `placesType`: one Google Places API type for nearbySearch.
 *    `null` = pure styles/layer-toggle pill with no markers. None
 *    currently use this; Roads & traffic was the original `null`
 *    pill but now also drops gas-station markers (placesType:
 *    'gas_station') alongside the traffic overlay + road styles.
 *  `extraPlacesTypes`: optional secondary types. When set, a separate
 *    nearbySearch fires for each and the results are merged + deduped.
 *    Used by Pets (vets + pet stores — Places API takes one type per
 *    call, so multi-category pills need multiple round-trips).
 *  `searchStrategy`: how to query the API.
 *    'distance' → rankBy:DISTANCE, no radius, returns 60 CLOSEST.
 *      Right for dense urban categories (restaurants, hotels,
 *      supermarkets) where a wide-radius prominence search would
 *      surface only the most-famous big-name spots and miss small
 *      local 4★+ places.
 *    'wide' → radius:50000 (50 km) + default prominence ranking.
 *      Right for sparse categories (hospitals, parks, churches,
 *      schools, govt, transit, sights) where 60 results comfortably
 *      cover a metro area and you actually WANT prominence — the
 *      "main hospital" and "biggest park" should land first.
 *  `defaultMinRating`: rating floor applied client-side. Restaurants
 *    and Hotels default to 4★; others default to 0. Customisable
 *    per-pill in Settings → General.
 *  `color`: marker fill color so the user can read the pill→pin
 *    visual link at a glance.
 *
 *  Cross-category bleed (hotel surfacing under "Restaurants" because
 *  Google tags it with both) is handled by isPrimaryMatch() below.
 *
 *  @type {{key: string, placesType: string|null, searchStrategy: 'distance'|'wide', icon: string, label: string, color: string, defaultMinRating: number, tooltip: string}[]} */
export const POI_CATEGORIES = [
    { key: 'restaurants', placesType: 'restaurant',         searchStrategy: 'distance', icon: '🍽️', label: 'Restaurants',     color: '#ff9500', defaultMinRating: 4, tooltip: 'Closest restaurants (≤60) to the search center — defaults to 4★+, tweak in Settings → General' },
    { key: 'supermarkets',placesType: 'supermarket',        searchStrategy: 'distance', icon: '🛒', label: 'Supermarkets',    color: '#34c759', defaultMinRating: 0, tooltip: 'Closest supermarkets and grocery stores' },
    { key: 'hotels',      placesType: 'lodging',            searchStrategy: 'distance', icon: '🛏️', label: 'Hotels',          color: '#5856d6', defaultMinRating: 4, tooltip: 'Closest hotels and lodging — defaults to 4★+' },
    // sights / parks / worship: epicenter-aware. People often plan
    // these per-day ("what attractions are near today's pin"), so the
    // user-picked day epicenter is the right anchor.
    { key: 'sights',      placesType: 'tourist_attraction', searchStrategy: 'wide',     icon: '🏖️', label: 'Sights',          color: '#a460ed', defaultMinRating: 0, tooltip: 'Tourist attractions across the wider trip area (50 km)' },
    { key: 'parks',       placesType: 'park',               searchStrategy: 'wide',     icon: '🌳', label: 'Parks',           color: '#1a6b3c', defaultMinRating: 0, tooltip: 'Parks and gardens across the wider trip area' },
    { key: 'worship',     placesType: 'church',             searchStrategy: 'wide',     icon: '⛪', label: 'Worship',         color: '#a460ed', defaultMinRating: 0, tooltip: 'Churches and places of worship across the wider trip area' },

    // useGenesisAlways: sparse, trip-wide-concept categories. There's
    // not many to find, and "where are the hospitals across my whole
    // trip" is the question being asked — locking to a single day
    // pin would just mean missing the obvious ones two
    // neighborhoods over. Always anchored on genesis.
    { key: 'medical',     placesType: 'hospital',           extraPlacesTypes: ['pharmacy'], extraKeywords: ['pharmacy', 'drugstore'], searchStrategy: 'wide', useGenesisAlways: true, icon: '🏥', label: 'Medical',         color: '#ff3b30', defaultMinRating: 0, tooltip: 'Hospitals, doctors, pharmacies, drugstores and clinics across the wider trip area. Vets are excluded — they live on the Pets pill.' },
    { key: 'pets',        placesType: 'veterinary_care',    extraPlacesTypes: ['pet_store'], searchStrategy: 'wide', useGenesisAlways: true, icon: '🐾', label: 'Pets',           color: '#a460ed', defaultMinRating: 0, tooltip: 'Vets and pet stores across the wider trip area' },
    { key: 'schools',     placesType: 'school',             searchStrategy: 'wide', useGenesisAlways: true, icon: '🎓', label: 'Schools',         color: '#0071e3', defaultMinRating: 0, tooltip: 'Schools and universities. Always searches the wider trip area.' },
    { key: 'sports',      placesType: 'stadium',            searchStrategy: 'wide', useGenesisAlways: true, icon: '🏟️', label: 'Sports',          color: '#ff2d55', defaultMinRating: 0, tooltip: 'Stadiums and gyms. Always searches the wider trip area — they\'re landmarks, you want them all.' },
    { key: 'transit',     placesType: 'transit_station',    extraPlacesTypes: ['ferry_terminal'], searchStrategy: 'wide', useGenesisAlways: true, icon: '🚉', label: 'Public transport', color: '#0a3d6b', defaultMinRating: 0, tooltip: 'Train, metro, light rail, smaller commuter stations + ferry terminals. For the dotted ferry-route lines and subway/bus geometry over water and on land, switch the map to Road view via the controls in the top-right corner — those route lines only render on the road map type, not on satellite. Bus stops are excluded because Google\'s API uses the same `bus_station` type for both hub terminals and street-corner stops.' },
    { key: 'traffic',     placesType: 'gas_station',        searchStrategy: 'wide', useGenesisAlways: true, icon: '🛣️', label: 'Roads & traffic', color: '#0a3d6b', defaultMinRating: 0, tooltip: 'Highway / arterial road names + live Google traffic congestion + gas stations across the wider trip area' },
];

/** Returns true if this category claims the place as primarily its
 *  own. The naive "types[0] is the only thing that matters" check was
 *  too strict: real restaurants sometimes carry a less obvious type
 *  first (a takeaway with `meal_takeaway` first then `restaurant`),
 *  and we'd drop them.
 *
 *  Smarter rule: scan `types[]` for the FIRST match (this category)
 *  and the FIRST conflict (a competing category). Include the place
 *  iff the match comes before the conflict — meaning Google ranked
 *  this category's identity higher in the place's profile.
 *
 *  Categories without a rule (parks, medical, etc.) return true —
 *  the nearbySearch type filter alone is good enough for those.
 *  @param {string} categoryKey
 *  @param {string[]} types
 *  @returns {boolean}
 */
/** Pick the best display emoji for a single Place result based on its
 *  Google `types[]` first, falling back to the pill's category icon.
 *  This makes mixed-type pills (medical = hospitals + pharmacies + …,
 *  pets = vets + pet stores) visually decoded at a glance — without
 *  this every result on the medical pill rendered as the generic 🏥
 *  hospital pin and pharmacies were indistinguishable from hospitals
 *  on the map.
 *  @param {{key: string, icon: string}} cat
 *  @param {{types?: string[]}} place
 *  @returns {string}
 */
function pickPlaceIcon(cat, place) {
    const types = Array.isArray(place?.types) ? place.types : [];
    const lowerName = (place?.name || '').toLowerCase();
    if (cat.key === 'medical') {
        // Name takes precedence on the pharmacy hint set so chain
        // drugstores tagged `convenience_store` still get the 💊 pin.
        const pharmacyByName = lowerName && PHARMACY_NAME_HINTS.some(h => lowerName.includes(h));
        if (types.includes('pharmacy') || pharmacyByName) return '💊';
        if (types.includes('hospital'))      return '🏥';
        if (types.includes('doctor'))        return '🩺';
        if (types.includes('dentist'))       return '🦷';
        if (types.includes('physiotherapist')) return '🧑‍⚕️';
    }
    if (cat.key === 'pets') {
        if (types.includes('pet_store'))       return '🐶';
        if (types.includes('veterinary_care')) return '🐾';
    }
    return cat.icon;
}

/** Lowercase substrings that strongly imply a place is a pharmacy /
 *  drugstore even when Google's `types[]` doesn't carry the
 *  `pharmacy` tag. Major chains often arrive with `convenience_store`
 *  or just `store` first (post-Places-API-rewrite quirk), so the
 *  type-only filter would silently drop them. We test
 *  `place.name.toLowerCase()` against this list as a fallback in
 *  isPrimaryMatch('medical', ...) so CVS / Walgreens / Boots / Rite
 *  Aid all pass through. The list is intentionally simple — false
 *  positives ("Pharmacy Square Bistro") are rare and harmless. */
const PHARMACY_NAME_HINTS = [
    'pharmacy', 'drugstore', 'drug store', 'chemist',
    'cvs', 'walgreens', 'rite aid', 'boots', 'apotheke', 'farmacia', 'pharmacie',
];

function isPrimaryMatch(categoryKey, types, name) {
    // Name-based override for the medical pill: any place whose name
    // matches one of the pharmacy hints above is treated as a primary
    // match, regardless of what `types[]` says. This catches chain
    // drugstores that Google sometimes tags primarily as
    // `convenience_store` rather than `pharmacy`.
    if (categoryKey === 'medical' && typeof name === 'string' && name) {
        const lowerName = name.toLowerCase();
        if (PHARMACY_NAME_HINTS.some(h => lowerName.includes(h))) return true;
    }
    if (!Array.isArray(types) || types.length === 0) return true;
    const isRestaurant = (t) => t === 'restaurant' || t.endsWith('_restaurant')
        || t === 'cafe' || t === 'bar'
        || t === 'meal_takeaway' || t === 'meal_delivery';
    const isHotel = (t) => t === 'lodging' || t.endsWith('_hotel')
        || t === 'motel' || t === 'hostel'
        || t === 'bed_and_breakfast' || t === 'guest_house' || t === 'inn'
        || t === 'resort_hotel' || t === 'extended_stay_hotel';
    const isSupermarket = (t) => t === 'supermarket' || t === 'grocery_or_supermarket';
    // Train + metro + light-rail + ferry terminals + the generic
    // `transit_station` (because Google's data quality varies — small
    // commuter stations like the Lisbon-Cascais line CP stops carry
    // *only* `transit_station` in their types[], not the specific
    // `train_station` label). We pair this match with `isBusStop` as
    // the conflict (see below) so bus stops that ALSO carry
    // transit_station don't sneak through.
    const isBigTransit = (t) => t === 'train_station'
        || t === 'subway_station' || t === 'light_rail_station'
        || t === 'ferry_terminal'
        || t === 'transit_station';
    // Conflict for the transit pill — Google uses `bus_station` for
    // both hub terminals AND street-corner stops, indistinguishably.
    // Treating it as a conflict drops generic transit_station entries
    // that are actually bus stops while keeping CP-style commuter
    // train stations (which don't carry bus_station at all).
    const isBusStop = (t) => t === 'bus_station';
    // Human medical only — explicitly excludes veterinary_care.
    // Google's hospital search returns vet clinics too because
    // some carry both 'hospital' and 'veterinary_care' types.
    const isHumanMedical = (t) => t === 'hospital' || t === 'doctor'
        || t === 'pharmacy' || t === 'dentist' || t === 'physiotherapist'
        || t === 'health' || t === 'medical_lab';
    const isPet = (t) => t === 'veterinary_care' || t === 'pet_store';

    /** @type {{match: (t:string)=>boolean, conflict: (t:string)=>boolean} | undefined} */
    const rule = ({
        restaurants:  { match: isRestaurant,    conflict: isHotel },
        hotels:       { match: isHotel,         conflict: isRestaurant },
        supermarkets: { match: isSupermarket,   conflict: () => false },
        transit:      { match: isBigTransit,    conflict: isBusStop },
        medical:      { match: isHumanMedical,  conflict: isPet },
        pets:         { match: isPet,           conflict: isHumanMedical },
    })[categoryKey];
    if (!rule) return true;

    let firstMatch = -1, firstConflict = -1;
    for (let i = 0; i < types.length; i++) {
        if (firstMatch < 0 && rule.match(types[i])) firstMatch = i;
        if (firstConflict < 0 && rule.conflict(types[i])) firstConflict = i;
        if (firstMatch >= 0 && firstConflict >= 0) break;
    }
    if (firstMatch < 0) return false;          // not this category at all
    if (firstConflict < 0) return true;        // matches and nothing else competes
    return firstMatch < firstConflict;         // matches AND outranks the conflict
}

// Per-day card action helpers. The map setTimeout below detects
// activeMapClickListener and wires it on the map; these helpers just mutate
// the module-level state and re-navigate so renderHome runs again.
// (toggleDayMenu was retired with the chip-strip Path layout — there's
//  no per-day expand/collapse state anymore; the selected day always
//  shows its full content alongside Genesis.)

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
    // Genesis is the trip's anchor — pill search, wide-area POIs, and
    // the lazy day-0 sessionStorage flag all key off it. The delete
    // button is already hidden on the genesis card; this guard is
    // belt-and-braces in case some old in-memory STATE / external
    // call site reaches deleteDay with a day-0 id.
    if (Number(day.dayNumber) === 0) {
        showLiquidAlert("Trip Genesis can't be deleted — it anchors the trip.");
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
            // (Trip Genesis) is preserved as-is — it's not part of the
            // sequential numbering.
            STATE.tripDays
                .filter(d => d.tripId === tripId && Number(d.dayNumber) > 0)
                .sort((a, b) => a.dayNumber - b.dayNumber)
                .forEach((d, i) => { d.dayNumber = i + 1; });

            // If the deleted day was someone's last selected day on
            // this trip, drop the cached selection so resolveSelectedDayId
            // re-derives a sensible default on next render.
            if (selectedDayByTrip[tripId] === dayId) {
                delete selectedDayByTrip[tripId];
                try { localStorage.setItem('home_path_selected_day_by_trip', JSON.stringify(selectedDayByTrip)); } catch (_) {}
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
        /** @type {Set<string>} ISO codes seen for this trip. */
        const discoveredCodes = new Set();
        if (activeTrip.countryCode) discoveredCodes.add(activeTrip.countryCode);

        // Pull country codes for already-geocoded day pins out of
        // sessionStorage at render time — saves the wait for the async
        // reverse-geocode loop to repopulate the roster on every reload.
        // Day pins in OTHER countries widen the roster: a Spain-trip
        // with a day pinned in Morocco gets quotes + facts from BOTH
        // countries on the slideshow. The cache writer lives in the
        // map-init block further down; new discoveries also call
        // addDiscoveredCountry below to extend the roster live.
        const tripDaysForRoster = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
        for (const day of tripDaysForRoster) {
            const lat = day.lat, lng = day.lon || day.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number') continue;
            try {
                const cached = sessionStorage.getItem(`tggDayCountry:${lat.toFixed(4)},${lng.toFixed(4)}`);
                if (cached) discoveredCodes.add(cached);
            } catch (_) { /* sessionStorage unavailable */ }
        }

        // Build an INTERLEAVED roster of (image, quote) and (image, fact)
        // pairs for every country in the discovered set. The slideshow
        // timer cycles through them every 6s so the user sees BOTH the
        // travel quote AND the population/capital fact for each country
        // on rotation — no more "facts never appear" because of a
        // single-element pick + a fragile localStorage toggle. Roster
        // is reshuffled each render so reload still rolls a fresh order.
        const refreshSlideshowMedia = () => {
            const data = getMediaForTrip(activeTrip, [...discoveredCodes]);
            const pairs = [];
            for (let i = 0; i < data.images.length; i++) {
                const img = data.images[i];
                const q = data.quotes[i];
                const f = data.facts[i];
                if (q) pairs.push({ img, text: q });
                if (f) pairs.push({ img, text: f });
            }
            // Shuffle so the order doesn't rigidly read country-by-country
            // (Italy quote → Italy fact → France quote → France fact);
            // a mixed shuffle feels like a magazine roster.
            for (let i = pairs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
            }
            displayImages = pairs.map(p => p.img);
            displayQuotes = pairs.map(p => p.text);
            // getMediaForTrip's stub fallback guarantees ≥1 entry for
            // any non-null trip, so pairs is non-empty here. No
            // defensive branch needed.
            if (currentPhotoIdx >= displayImages.length) currentPhotoIdx = 0;
        };
        refreshSlideshowMedia();

        // When the geocoder later discovers a new country for a day pin,
        // cache it so the *next* reload's roster is wider. We deliberately
        // don't refresh the on-screen slideshow mid-session — the
        // existing pairs keep cycling rather than flickering as pins
        // resolve.
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
                <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
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
        stopHomeSlideshow();
        _slideshowTimer = setInterval(showNextImageAndQuote, 6000);
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
            greeting = greetings[Math.floor(Math.random() * greetings.length)];
        }

        div.innerHTML = `
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${greeting}</h1>
                ${activeTrip ? `<p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>` : `<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <!-- Map search banner. Sits ABOVE the map (in normal flow,
                 not floated over it) so the map view is unobstructed.
                 The suggestion dropdown uses position:absolute relative
                 to the wrapper so it can extend down over the map's
                 first row of pixels without pushing layout. -->
            <div id="homeMapSearchWrap" style="position:relative; max-width: 720px; margin: 16px auto 12px; z-index: 5;">
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

            <div class="card glass cover-card cover-card--md">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div class="cover-card__gradient" style="pointer-events: none; z-index: 1;"></div>
                <div class="cover-card__content" style="pointer-events: none; z-index: 2;">
                    <p id="homeQuote" class="cover-card__quote">
                        ${displayQuotes[0] || ''}
                    </p>
                </div>
            </div>

            <!-- POI filter pills — sit BELOW the map so they don't cover
                 anything. Each pill renders with its label by default
                 since the row fits on a single line at typical viewport
                 widths. Pills the user has hidden in Settings → General
                 (poiVisible[key] === false) are filtered out here. -->
            <div id="homeMapPoiToggles" class="map-poi-toggles map-poi-toggles--below">
                ${POI_CATEGORIES
                    .filter(c => STATE.preferences?.poiVisible?.[c.key] !== false)
                    .map(c => `
                        <button type="button" class="map-poi-toggle" data-poi="${c.key}" aria-pressed="false" title="${esc(c.tooltip)}">${c.icon} <span>${esc(c.label)}</span></button>
                    `).join('')}
            </div>
        `;

        // Active trips show only the map, no slideshow + no images. The
        // quote/fact at the top is statically picked at render time from
        // the multi-country roster (random index → on reload you may see
        // a different country's quote). Make sure no leftover timer from a
        // previous no-trip render keeps cycling on top of the map.
        stopHomeSlideshow();

        setTimeout(() => {
            // Share-to-feed button — initial state from server. The
            // button starts in the outline state and flips to filled
            // (purple) if the trip is currently shared. Stamps post_id
            // into a data attribute so the unshare flow has it.
            if (activeTrip) {
                const shareBtn = /** @type {HTMLElement | null} */ (document.getElementById('shareToFeedBtn'));
                if (shareBtn) {
                    fetchShareStatus(activeTrip.id).then(status => {
                        if (!status?.shared) return;
                        shareBtn.dataset.shared = '1';
                        shareBtn.dataset.postId = String(status.post_id);
                        updateShareBtnVisualState(shareBtn, true);
                    });
                }
            }

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
                const buildPoiStyles = (enabledSet) => {
                    /** @type {any[]} */
                    const styles = HIDE_ALL_POI_STYLES.slice();
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
                /** @type {any | null} */
                let _placesService = null;
                const getPlacesService = () => {
                    if (_placesService) return _placesService;
                    if (typeof google === 'undefined' || !google.maps || !google.maps.places) return null;
                    _placesService = new google.maps.places.PlacesService(map);
                    return _placesService;
                };

                /** Markers grouped by pill key so we can clear one
                 *  category without disturbing the others. Each entry is
                 *  an array of google.maps.Marker. */
                /** @type {Record<string, any[]>} */
                const placesMarkers = {};

                /** Cache of nearbySearch results keyed by `${tripId}|${pillKey}`.
                 *  Trip-wide cache because the search is now one big
                 *  query around the genesis pin (50 km radius), not one
                 *  per day pin — re-toggling a pill on the same trip
                 *  doesn't burn another API call. */
                /** @type {Record<string, any[]>} */
                const placesCache = {};

                /** In-flight fetches keyed the same way. Concurrent
                 *  toggles for the same pill resolve to the same
                 *  promise instead of firing duplicate searches —
                 *  fixes the race where rapid on/off/on left orphan
                 *  markers from the first fetch on top of the second.
                 *  @type {Record<string, Promise<any[]>>} */
                const placesPending = {};

                /** Single shared InfoWindow — reused across every Places
                 *  marker so only one bubble is ever open at a time
                 *  (Google Maps standard behavior, less visual chaos). */
                /** @type {any | null} */
                let placesInfoWindow = null;
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
                const buildInfoWindowHtml = (cat, place) => {
                    const safeName = esc(place.name || cat.label);
                    const safeVicinity = esc(place.vicinity || '');
                    const ratingHtml = (typeof place.rating === 'number')
                        ? `<div style="margin-top: 6px; font-size: 13px; color: #444;"><span style="color: #ff9500;">★</span> ${place.rating.toFixed(1)}${place.user_ratings_total ? ` <span style="color: #888;">(${place.user_ratings_total})</span>` : ''}</div>`
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
                                style="flex: 1; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid #9b59b6; background: ${isOnTodo ? '#9b59b6' : 'white'}; color: ${isOnTodo ? 'white' : '#9b59b6'};">
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
                                <span style="font-size: 18px;">${headerIcon}</span>
                                <strong style="font-size: 15px; color: #002d5b; line-height: 1.25;">${safeName}</strong>
                            </div>
                            ${safeVicinity ? `<div style="font-size: 12px; color: #666; line-height: 1.4;">${safeVicinity}</div>` : ''}
                            ${ratingHtml}
                            <a href="${mapsUrl}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: ${cat.color}; color: white; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 700;">View on Google Maps →</a>
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
                const wireInfoWindowMarkButtons = (cat, place) => {
                    const iw = getInfoWindow();
                    const todoBtn = /** @type {HTMLButtonElement | null} */ (
                        document.querySelector(`.gm-style-iw [data-action="toggle-todo"][data-place-id="${place.place_id}"]`)
                    );
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
                const dropPlaceMarker = (cat, place) => {
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
                 *  centered on the genesis pin (day 0). Radius is the
                 *  Places API maximum (50 km) — covers a metro region
                 *  the size of "Sintra ↔ Cascais ↔ Lisbon ↔ Setúbal".
                 *  Cached per (tripId, pillKey) so re-toggling is free.
                 *  We also paginate up to 3 result pages (60 results
                 *  total) when available so the bigger search radius
                 *  doesn't get artificially capped at 20 results.
                 */
                /** Resolve the search center for this trip's pill
                 *  searches. Order of preference:
                 *    1. STATE.preferences.pillEpicenters[tripId] →
                 *       the day the user explicitly chose
                 *       (skipped when `forceGenesis: true` is passed,
                 *        which categories like transit use to always
                 *        cover the trip's full area)
                 *    2. Genesis day (dayNumber === 0)
                 *    3. activeTrip.lat/lng as a defensive last resort
                 *  Cache-key callers also need the resolved dayId
                 *  (or 'genesis') so changing epicenter properly
                 *  cache-misses.
                 *  @param {boolean} [forceGenesis=false] */
                const resolveSearchCenter = (forceGenesis = false) => {
                    const tripId = activeTrip?.id || '';
                    if (!forceGenesis) {
                        const userPickId = STATE.preferences?.pillEpicenters?.[tripId];
                        if (userPickId) {
                            const d = currentTripDays.find(d2 => d2.id === userPickId && d2.lat);
                            if (d) return { center: { lat: d.lat, lng: d.lng || d.lon }, anchorId: d.id };
                        }
                    }
                    const genesis = currentTripDays.find(d => d.dayNumber === 0 && d.lat);
                    if (genesis) return { center: { lat: genesis.lat, lng: genesis.lng || genesis.lon }, anchorId: 'genesis' };
                    if (activeTrip?.lat) return { center: { lat: activeTrip.lat, lng: activeTrip.lng }, anchorId: 'trip' };
                    return { center: null, anchorId: '' };
                };

                /** Per-pill anchor mode: user override (Settings →
                 *  General) wins, else the category's useGenesisAlways
                 *  default. Returns true if this pill should always
                 *  search from genesis (ignoring the day epicenter). */
                const shouldForceGenesis = (cat) => {
                    const userPref = STATE.preferences?.poiAnchoring?.[cat.key];
                    if (userPref === 'genesis') return true;
                    if (userPref === 'epicenter') return false;
                    return !!cat.useGenesisAlways;
                };

                const fetchPlacesForTrip = (cat) => {
                    const tripId = activeTrip?.id || '';
                    const { center, anchorId } = resolveSearchCenter(shouldForceGenesis(cat));
                    // Cache-key includes the anchor + strategy so:
                    //  - changing epicenter cache-misses (refetches)
                    //  - toggling between strategies (if we ever swap
                    //    them per-category) cache-misses
                    const key = `${tripId}|${cat.key}|${anchorId}|${cat.searchStrategy}`;
                    if (placesCache[key]) return Promise.resolve(placesCache[key]);
                    if (placesPending[key]) return placesPending[key];

                    const promise = new Promise((resolve) => {
                        if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
                            resolve([]); return;
                        }
                        const svc = getPlacesService();
                        if (!svc) { resolve([]); return; }
                        /** @type {any[]} */
                        const all = [];

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
                        const sharedHandle = (results, status, pagination) => {
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
                                const deduped = [];
                                for (const p of all) {
                                    if (!p?.place_id || seen.has(p.place_id)) continue;
                                    seen.add(p.place_id);
                                    deduped.push(p);
                                }
                                resolve(deduped);
                            }
                        };
                        const runSearch = (extra) => {
                            const base = cat.searchStrategy === 'distance'
                                ? { location: center, rankBy: google.maps.places.RankBy.DISTANCE }
                                : { location: center, radius: 50000 };
                            svc.nearbySearch({ ...base, ...extra }, sharedHandle);
                        };
                        typesToSearch.forEach(t => runSearch({ type: t }));
                        keywordsToSearch.forEach(kw => runSearch({ keyword: kw }));
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
                const setPlacesPillVisible = async (pillKey, visible) => {
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

                    /** @type {any[]} */
                    const markers = [];
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
                /** @type {Set<string>} */
                const enabledPois = new Set(persistedPills);

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

                // Live traffic overlay — created lazily, attached to the
                // map only while the Roads & traffic pill is on. Lives in
                // the outer scope so the click handler can flip it on/off.
                /** @type {any | null} */
                let trafficLayer = null;
                const setTrafficVisible = (visible) => {
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

                const poiTogglesEl = document.getElementById('homeMapPoiToggles');
                if (poiTogglesEl) {
                    poiTogglesEl.addEventListener('click', (ev) => {
                        const target = /** @type {HTMLElement | null} */ (ev.target);

                        // Regular category pill — flip Places API markers
                        // for that category on/off.
                        const pill = target?.closest('.map-poi-toggle');
                        if (!pill) return;
                        const key = /** @type {HTMLElement} */ (pill).dataset.poi;
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
                    const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('homeMapSearchInput'));
                    const resultsEl   = /** @type {HTMLElement | null} */     (document.getElementById('homeMapSearchResults'));
                    const clearBtn    = /** @type {HTMLButtonElement | null} */ (document.getElementById('homeMapSearchClear'));
                    if (!searchInput || !resultsEl || !clearBtn) return;
                    if (typeof google === 'undefined' || !google.maps?.places?.AutocompleteService) return;

                    const autocomplete = new google.maps.places.AutocompleteService();
                    /** @type {google.maps.Marker | null} */
                    let searchMarker = null;
                    /** @type {ReturnType<typeof setTimeout> | null} */
                    let typingTimer = null;

                    /** Pick the best POI category match for a place — used so
                     *  the InfoWindow matches the colour/icon of the relevant
                     *  pill if the place happens to be a known type. */
                    const guessCategory = (types) => {
                        if (!Array.isArray(types)) return null;
                        for (const cat of POI_CATEGORIES) {
                            if (!cat.placesType) continue;
                            if (types.includes(cat.placesType)) return cat;
                            if (Array.isArray(cat.extraPlacesTypes) && cat.extraPlacesTypes.some(t => types.includes(t))) return cat;
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
                    const formatDistance = (meters) => {
                        if (typeof meters !== 'number' || !isFinite(meters) || meters < 0) return '';
                        if (meters < 1000) return `${Math.round(meters)} m`;
                        const km = meters / 1000;
                        if (km < 100) return `${km.toFixed(1)} km`;
                        return `${Math.round(km)} km`;
                    };

                    const renderPredictions = (preds) => {
                        if (!preds || preds.length === 0) {
                            resultsEl.style.display = 'block';
                            resultsEl.innerHTML = `<div style="padding:14px 18px; color:var(--text-secondary); font-size:0.85rem;">No matches.</div>`;
                            return;
                        }
                        resultsEl.style.display = 'block';
                        resultsEl.innerHTML = preds.slice(0, 6).map(p => {
                            // distance_meters is populated by the
                            // AutocompleteService when the request carried
                            // an `origin` (the trip's genesis pin lat/lng,
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
                    const dropMarker = (place, cat) => {
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

                    const fetchDetails = (placeId) => {
                        const svc = getPlacesService();
                        svc.getDetails({
                            placeId,
                            fields: ['place_id', 'name', 'formatted_address', 'vicinity', 'geometry', 'types', 'rating', 'user_ratings_total', 'icon', 'url'],
                        }, (place, status) => {
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
                            /** @type {google.maps.places.AutocompletionRequest} */
                            const req = { input: q };
                            const bounds = map.getBounds();
                            if (bounds) req.bounds = bounds;
                            // Set `origin` to the trip's genesis pin so
                            // each prediction carries `distance_meters`
                            // from there — the result rows render the
                            // distance as a small chip on the right.
                            // Skipped when the trip has no geo (legacy
                            // text-only trips); predictions still work,
                            // just without the distance chip.
                            if (activeTrip && typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
                                req.origin = { lat: activeTrip.lat, lng: activeTrip.lng };
                            }
                            autocomplete.getPlacePredictions(req, (preds, status) => {
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
                        const row = /** @type {HTMLElement | null} */ (
                            /** @type {HTMLElement | null} */ (e.target)?.closest('.map-search-row')
                        );
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
                        if (!wrap.contains(/** @type {Node} */ (e.target))) hideResults();
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
    // Companions are per-trip now — for the getting-started checklist,
    // count "any trip with any companions" as having companions set up.
    const hasCompanions = STATE.trips.some(t => (t.companions || []).length > 0);
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
        // Companions are per-trip now — the action opens the trip-companion
        // picker on Home (or just navigates Home if there's no active trip
        // yet, since the picker is reachable from the trip header there).
        { text: "Add your travel companions", done: STATE.guideProgress.companions, icon: "👥", action: () => {
            if (activeTrip) openCompanionPickerModal(activeTrip.id);
            else navigate('home');
        } },
        // Personalization page DOM (#persMenu/#persContent/#persCategories)
        // only exists once the page has rendered, so navigate first and
        // switch the tab on the next tick.
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
     *    3) Linked-but-pending companions (⏳ Pending)
     *    4) Unlinked entries (Relaxer — they have no edit rights, like a relaxer)
     *  Click anywhere on the panel routes through the same dispatcher
     *  the pill button uses, so behaviour is one source-of-truth. */
    const buildMemberChipsHtml = () => {
        if (!activeTrip) return '';
        const members = activeTrip.members || [];
        const companions = activeTrip.companions || [];

        /** @type {Array<{name: string, role: string|null, picture?: string|null, isOwner: boolean, isMember: boolean, isPending?: boolean}>} */
        const chips = [];
        const seenMemberIds = new Set();

        // Owner first.
        const owner = members.find(m => m.userId === activeTrip.ownerId);
        if (owner) {
            chips.push({
                name: findTripCompanionByLinkedUser(activeTrip, owner.userId)?.name || owner.name || 'Owner',
                role: owner.role,
                picture: owner.picture,
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
                picture: m.picture,
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

        const renderChip = (/** @type {{name: string, role: string|null, picture?: string|null, isOwner: boolean, isMember: boolean, isPending?: boolean}} */ chip) => {
            // Defensive — historical snapshots could carry malformed entries
            // (e.g. legacy `string[]` companions where `chip.name` would be
            // undefined). Falls back to a neutral glyph rather than crashing
            // the whole page; loadState now normalises on boot too.
            const safeName = chip.name || '·';
            const initial = safeName.charAt(0).toUpperCase() || '·';
            const avatar = chip.picture
                ? `<img class="member-chip__avatar" src="${esc(chip.picture)}" alt="">`
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
                    <!-- Share to feed — any accepted member can share
                         (the backend gates on membership, not ownership).
                         Posts the trip to the caller's friends' feeds as
                         a friend_shared_trip event; idempotent so a
                         re-click on an already-shared trip just hands
                         back the existing post. Visual: icon-btn-circle
                         (vs the Open-in-Maps button next to it which is
                         icon-btn-square) plus a paper-plane icon, so it
                         doesn't read as another open-external-link
                         button. When already shared, JS flips this to a
                         filled purple state via updateShareBtnVisualState. -->
                    <button id="shareToFeedBtn" class="icon-btn-circle" style="--accent: 88, 86, 214;" title="Share this trip to your feed" aria-label="Share to feed">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                    ${!tripIsEditable ? `
                        <span class="trip-role-badge trip-role-badge--relaxer" title="You're a Relaxer on this trip — view-only">👁 Relaxer</span>
                    ` : ''}
                ` : ''}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${tripDays.length} Day${tripDays.length !== 1 ? 's' : ''} of adventure</p>
        </div>

        ${activeTrip ? (() => {
            // Tab badge counters — built once so the JSX (template
            // string) reads less noisy, and so we can reuse the same
            // counts in tab body rendering below. The to-do count
            // moved to the dedicated /todo page header.
            const docsCount = getAllTripDocuments(activeTrip).length;
            const photosCount = getAllTripPhotos(activeTrip).length;
            /** Small chip rendered next to a tab label when count > 0. */
            const badge = (n, color) => n > 0
                ? ` <span style="background:${color.bg}; color:${color.fg}; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${n}</span>`
                : '';
            return `
            <nav class="home-tabnav" role="tablist">
                <button class="home-tabnav__tab${activeHomeTab === 'days' ? ' is-active' : ''}" data-home-tab="days" role="tab">Path</button>
                <button class="home-tabnav__tab${activeHomeTab === 'companions' ? ' is-active' : ''}" data-home-tab="companions" role="tab">Companions</button>
                <button class="home-tabnav__tab${activeHomeTab === 'documents' ? ' is-active' : ''}" data-home-tab="documents" role="tab">Documents${badge(docsCount, { bg: 'rgba(88,86,214,0.15)', fg: '#5856d6' })}</button>
                <button class="home-tabnav__tab${activeHomeTab === 'photos' ? ' is-active' : ''}" data-home-tab="photos" role="tab">Photos${badge(photosCount, { bg: 'rgba(52,199,89,0.15)', fg: '#1a6b3c' })}</button>
            </nav>
            `;
        })() : ''}

        <!-- Companions tab content. Render order matters: this sits ABOVE
             the Days tab in source so the timeline stays the document
             outline anchor; the active-tab CSS swap hides whichever isn't
             active without remounting either. -->
        ${activeTrip ? `
            <div class="home-tab-content${activeHomeTab === 'companions' ? ' is-active' : ''}" data-home-tab="companions">
                <div class="trip-companions-section">
                    <button id="tripCompanionsBtn" class="trip-companions-pill" title="${tripIsManageable ? 'Pick which account companions are on this trip' : 'See who is on this trip'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Companions on this trip</span>
                        <span class="trip-companions-pill__count">${tripIsManageable ? (activeTrip.companions || []).length : (activeTrip.members || []).length}</span>
                    </button>
                    ${memberChipsHtml}
                </div>
            </div>

            <!-- To-do list tab content was removed when /todo became
                 a top-level page — the data and the day-detail modal's
                 "From your to-do list" block both still work. -->

            <!-- Documents tab — trip-wide and day-tagged booking
                 confirmations, hotel vouchers, etc. The list is the
                 UNION of trip.documents (new canonical store) and any
                 legacy day.tickets entries; tripMedia.getAllTripDocuments
                 hides that distinction. Only planners see the add /
                 delete affordances. The Gmail-search button at the
                 top opens Gmail in a new tab with a smart query
                 pre-filled (Path A from the rollout plan). -->
            <div class="home-tab-content${activeHomeTab === 'documents' ? ' is-active' : ''}" data-home-tab="documents">
                ${(() => {
                    const docs = getAllTripDocuments(activeTrip);
                    const genesisDay = (STATE.tripDays || [])
                        .find(d => d.tripId === activeTrip.id && Number(d.dayNumber) === 0);
                    const numberedDays = (STATE.tripDays || [])
                        .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0)
                        .sort((a, b) => a.dayNumber - b.dayNumber);
                    /** Genesis day = trip-wide bucket; numbered days = day-
                     *  specific. dayLabel returns "⭐ Genesis" for Day 0 and
                     *  "Day N" for numbered days; null only for orphans
                     *  (legacy data with no matching tripDay). */
                    const dayLabel = (id) => {
                        if (!id) return null;
                        const day = (STATE.tripDays || []).find(d => d.id === id);
                        if (!day) return null;
                        return Number(day.dayNumber) === 0 ? '⭐ Genesis' : `Day ${day.dayNumber}`;
                    };
                    const isGenesis = (id) => !!id && id === genesisDay?.id;
                    const dayChip = (id) => {
                        if (isGenesis(id)) {
                            // Gold tint matches the Path-tab Genesis theme
                            // (#e8b923 → #8b6e0c) — used to be green pre-recolor.
                            return `<span style="background:rgba(212,160,23,0.14); color:#8b6e0c; padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⭐ Genesis</span>`;
                        }
                        const lbl = dayLabel(id);
                        return lbl
                            ? `<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${esc(lbl)}</span>`
                            : `<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 8px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">Unsorted</span>`;
                    };

                    // Group by dayId. Genesis first (it's day 0, the
                    // trip-wide bucket), then numbered days in order,
                    // then any orphan / unmatched-id rows last.
                    /** @type {Map<string, any[]>} */
                    const groups = new Map();
                    docs.forEach(d => {
                        const key = d.dayId || '__orphan__';
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key).push(d);
                    });
                    const sortedKeys = [...groups.keys()].sort((a, b) => {
                        if (a === '__orphan__') return 1;
                        if (b === '__orphan__') return -1;
                        const da = (STATE.tripDays || []).find(d => d.id === a);
                        const db = (STATE.tripDays || []).find(d => d.id === b);
                        return (da?.dayNumber ?? 999) - (db?.dayNumber ?? 999);
                    });

                    const headerRow = `
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            ${tripIsEditable ? `
                                <button id="addDocBtn" type="button"
                                    style="background:var(--accent-blue); color:white; border:0; padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,113,227,0.22);">
                                    ➕ Add document
                                </button>
                            ` : ''}
                            <button id="searchGmailDocsBtn" type="button"
                                style="background:white; color:#002d5b; border:1px solid rgba(0,0,0,0.1); padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer;">
                                📧 Search Gmail for bookings
                            </button>
                            <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:600;">${docs.length} ${docs.length === 1 ? 'document' : 'documents'}</span>
                        </div>
                    `;

                    if (docs.length === 0) {
                        return `
                            <div style="display:flex; flex-direction:column; gap:14px; flex:1; min-width:0;">
                                ${headerRow}
                                <div class="card glass" style="padding: 28px; border-radius: 18px; border: 1.5px dashed rgba(88,86,214,0.32); background: rgba(88,86,214,0.04); text-align:center;">
                                    <div style="font-size:2rem; margin-bottom:8px;">📎</div>
                                    <h3 style="margin:0 0 6px; color:#5856d6; font-weight:800;">No documents yet</h3>
                                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">Click <strong>📧 Search Gmail for bookings</strong> to find your confirmation emails, then drop the PDFs / links in via <strong>➕ Add document</strong>. Trip-wide docs (passport, multi-day hotel) live on <strong>⭐ Trip Genesis</strong>; day-specific ones (museum ticket) tag to a numbered day.</p>
                                </div>
                            </div>
                        `;
                    }

                    return `
                        <div style="display:flex; flex-direction:column; gap:14px; flex:1; min-width:0;">
                            ${headerRow}
                            ${sortedKeys.map(key => {
                                const items = groups.get(key) || [];
                                const orphan = key === '__orphan__';
                                const isGen = !orphan && isGenesis(key);
                                const groupLabel = orphan
                                    ? 'Unsorted'
                                    : (isGen ? '⭐ Trip Genesis · trip-wide' : (dayLabel(key) || 'Unknown day'));
                                const accent = orphan ? 'rgba(0,0,0,0.45)' : (isGen ? '#8b6e0c' : 'var(--accent-blue)');
                                return `
                                    <div>
                                        <h4 style="margin:0 0 8px; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${accent};">${esc(groupLabel)}</h4>
                                        <div style="display:flex; flex-direction:column; gap:8px;">
                                            ${items.map(d => `
                                                <div class="trip-doc-card" data-doc-id="${esc(d.id)}" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04);">
                                                    <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                                                    <div style="flex:1; min-width:0;">
                                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                                                            <a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" class="trip-doc-link" style="font-weight:800; color:#002d5b; font-size:0.92rem; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.name || 'Document')}</a>
                                                            ${dayChip(d.dayId)}
                                                        </div>
                                                        ${d.url ? `<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(d.url)}</div>` : ''}
                                                    </div>
                                                    ${tripIsEditable ? `
                                                        ${d._source === 'trip' && (genesisDay || numberedDays.length > 0) ? `
                                                            <select class="trip-doc-day-select" data-doc-id="${esc(d.id)}"
                                                                style="padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.75rem; background:white; max-width:160px;">
                                                                ${genesisDay ? `<option value="${esc(genesisDay.id)}" ${d.dayId === genesisDay.id ? 'selected' : ''}>⭐ Genesis</option>` : ''}
                                                                ${numberedDays.map(nd => `
                                                                    <option value="${esc(nd.id)}" ${d.dayId === nd.id ? 'selected' : ''}>Day ${nd.dayNumber}</option>
                                                                `).join('')}
                                                            </select>
                                                        ` : ''}
                                                        <button type="button" class="trip-doc-edit-btn" data-doc-id="${esc(d.id)}" title="Rename / change link" aria-label="Edit ${esc(d.name)}"
                                                            style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.22); color:var(--accent-blue); border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✎</button>
                                                        <button type="button" class="trip-doc-remove-btn" data-doc-id="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}"
                                                            style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                                                    ` : ''}
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                })()}
            </div>

            <!-- Photos tab — same union pattern as Documents but for
                 imagery: trip.photos (canonical) + legacy day.photos.
                 The grid lays out as a masonry-ish auto-fill 140px
                 minimum; clicking a thumbnail opens a lightbox. -->
            <div class="home-tab-content${activeHomeTab === 'photos' ? ' is-active' : ''}" data-home-tab="photos">
                ${(() => {
                    const photos = getAllTripPhotos(activeTrip);
                    const genesisDayForPhotos = (STATE.tripDays || [])
                        .find(d => d.tripId === activeTrip.id && Number(d.dayNumber) === 0);
                    const numberedDaysForPhotos = (STATE.tripDays || [])
                        .filter(d => d.tripId === activeTrip.id && d.dayNumber > 0)
                        .sort((a, b) => a.dayNumber - b.dayNumber);
                    const dayLabel = (id) => {
                        if (!id) return null;
                        const day = (STATE.tripDays || []).find(d => d.id === id);
                        if (!day) return null;
                        return Number(day.dayNumber) === 0 ? '⭐ Genesis' : `Day ${day.dayNumber}`;
                    };
                    const isGenesisPhoto = (id) => !!id && id === genesisDayForPhotos?.id;

                    const headerRow = `
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            ${tripIsEditable ? `
                                <button id="addPhotosBtn" type="button" title="Upload photos from your device"
                                    style="background:#34c759; color:white; border:0; padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow: 0 4px 12px rgba(52,199,89,0.22);">
                                    📤 Upload photos
                                </button>
                                <input id="addPhotosInput" type="file" accept="image/*" multiple style="display:none;">
                                <button id="addPhotoUrlBtn" type="button" title="Paste a link to a Google Drive / Dropbox / hosted image album"
                                    style="background:white; color:#002d5b; border:1px solid rgba(0,0,0,0.1); padding:9px 16px; border-radius:999px; font-weight:800; font-size:0.82rem; cursor:pointer;">
                                    🔗 Add by link
                                </button>
                            ` : ''}
                            <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:600;">${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}</span>
                        </div>
                    `;

                    if (photos.length === 0) {
                        return `
                            <div style="display:flex; flex-direction:column; gap:14px; flex:1; min-width:0;">
                                ${headerRow}
                                <div class="card glass" style="padding: 28px; border-radius: 18px; border: 1.5px dashed rgba(52,199,89,0.32); background: rgba(52,199,89,0.04); text-align:center;">
                                    <div style="font-size:2rem; margin-bottom:8px;">📸</div>
                                    <h3 style="margin:0 0 6px; color:#1a6b3c; font-weight:800;">No photos yet</h3>
                                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">Use <strong>📤 Upload photos</strong> for files on your device, or <strong>🔗 Add by link</strong> for a Drive / Dropbox / iCloud share. New photos go to <strong>⭐ Trip Genesis</strong> (the trip-wide bucket); you can re-tag any of them to a specific day from the dropdown on each card.</p>
                                </div>
                            </div>
                        `;
                    }

                    return `
                        <div style="display:flex; flex-direction:column; gap:14px; flex:1; min-width:0;">
                            ${headerRow}
                            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px;">
                                ${photos.map(p => {
                                    // Direct image vs share-link card.
                                    // We can't render most cross-origin
                                    // share pages as a thumbnail, so we
                                    // detect by URL shape (data: prefix
                                    // or known image extension) and
                                    // fall back to a coloured "open link"
                                    // card for everything else.
                                    const isImage = /^data:image\//i.test(p.src || '')
                                        || /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(p.src || '');
                                    // For trip-level photos AND when the
                                    // user is a planner: render the day
                                    // label as a tiny interactive <select>
                                    // so the user can reassign trip-wide
                                    // ↔ Day N without leaving the grid.
                                    // Legacy day.photos entries (immutable
                                    // — they can't be reassigned without
                                    // losing the legacy index reference)
                                    // and non-planner views fall back to
                                    // the static chip.
                                    const canEditDay = tripIsEditable && p._source === 'trip';
                                    const staticChipFor = (label, bg) => `<div style="position:absolute; top:6px; left:6px; background: ${bg}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px); pointer-events:none;">${esc(label)}</div>`;
                                    // Genesis = gold; numbered days = dark;
                                    // orphan (rare, legacy null dayId post-
                                    // migration) = neutral grey "Unsorted".
                                    const chipBg = isGenesisPhoto(p.dayId)
                                        ? 'rgba(140,110,12,0.85)'
                                        : (p.dayId ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)');
                                    const dayBadge = canEditDay
                                        ? `<select class="trip-photo-day-select" data-photo-id="${esc(p.id)}" title="Move to Trip Genesis or a numbered day"
                                                style="position:absolute; top:6px; left:6px; background: ${chipBg}; color:white; border:0; padding:2px 22px 2px 10px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px); cursor:pointer; appearance:none; -webkit-appearance:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 7px center; background-size: 8px;">
                                                ${genesisDayForPhotos ? `<option value="${esc(genesisDayForPhotos.id)}" ${p.dayId === genesisDayForPhotos.id ? 'selected' : ''}>⭐ Genesis</option>` : ''}
                                                ${numberedDaysForPhotos.map(nd => `<option value="${esc(nd.id)}" ${p.dayId === nd.id ? 'selected' : ''}>Day ${nd.dayNumber}</option>`).join('')}
                                            </select>`
                                        : (isGenesisPhoto(p.dayId)
                                            ? staticChipFor('⭐ Genesis', 'rgba(140,110,12,0.85)')
                                            : (p.dayId
                                                ? staticChipFor(dayLabel(p.dayId) || '', 'rgba(0,0,0,0.55)')
                                                : staticChipFor('Unsorted', 'rgba(0,0,0,0.45)')));
                                    const removeBtn = tripIsEditable
                                        ? `<button type="button" class="trip-photo-remove-btn" data-photo-id="${esc(p.id)}" title="Remove" aria-label="Remove photo"
                                            style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.55); border:0; color:white; width:24px; height:24px; border-radius:50%; cursor:pointer; font-size:0.75rem; line-height:1; backdrop-filter: blur(6px); z-index:1;">✕</button>`
                                        : '';
                                    if (isImage) {
                                        return `
                                            <div class="trip-photo-card" data-photo-id="${esc(p.id)}" data-photo-kind="image" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${esc(p.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); cursor:pointer; border:1px solid rgba(0,0,0,0.06);">
                                                ${dayBadge}
                                                ${removeBtn}
                                            </div>
                                        `;
                                    }
                                    // Link-style card: gradient background,
                                    // 🔗 icon, truncated URL, opens in new
                                    // tab on click.
                                    return `
                                        <div class="trip-photo-card" data-photo-id="${esc(p.id)}" data-photo-kind="link" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: linear-gradient(135deg, #0071e3, #5856d6); box-shadow: 0 4px 12px rgba(0,113,227,0.18); cursor:pointer; border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white;">
                                            ${dayBadge}
                                            ${removeBtn}
                                            <div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div>
                                            <div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${esc(p.src.replace(/^https?:\/\//, ''))}</div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                })()}
            </div>
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

        // ── Path tab: chip-strip + Genesis + selected-day cards ─────
        // The vertical timeline was retired in favour of a horizontal
        // "wheel" — Genesis pinned on the left, the user-picked day
        // on the right, navigated via a numbered chip strip / prev-next
        // buttons / arrow keys / swipe. buildPathTabHtml() returns the
        // string and gets called twice: once on initial render, then
        // again on every selection change to patch just #pathTabInner
        // (so the map and other Home state don't churn).

        /** Build a single day card body — used for both Genesis (small
         *  ~30%) and the selected day (full width). The shape follows
         *  the same hierarchy as the old vertical card: number badge
         *  + title + date/location + secondary badges (pin status,
         *  notes preview if any). Genesis gets the trip-wide doc/photo
         *  count chips it always had.
         *  @param {any} day
         *  @param {{ isGenesis: boolean, isSelected: boolean }} flags
         */
        const buildDayCardBody = (day, { isGenesis, isSelected }) => {
            const badge = isGenesis
                ? `<div style="background: linear-gradient(135deg, #e8b923, #8b6e0c); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
                       <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
                           <path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>
                       </svg>
                   </div>`
                : `<div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
                       <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">Day</span>
                       <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${day.dayNumber}</span>
                   </div>`;
            const title = isGenesis ? 'Trip Genesis' : esc(day.name || `Day ${day.dayNumber}`);
            const subtitleParts = [];
            if (isGenesis) {
                subtitleParts.push(activeTrip && activeTrip.country ? esc(shortPlaceName(activeTrip.country)) : 'Where the trip begins');
                // Trip-wide doc/photo counts on Genesis (its long-standing role).
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
            }
            // Notes preview only on the bigger (selected) card — Genesis
            // is condensed by design, no preview body.
            const notesPreview = (isSelected && day.notes && !isGenesis) ? `
                <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
                    <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 4px; letter-spacing: 0.05em;">Journal preview</div>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(day.notes)}</p>
                </div>
            ` : '';
            return `
                <div style="display:flex; align-items:center; gap:14px;">
                    ${badge}
                    <div style="flex:1; min-width:0;">
                        <h3 style="margin:0; font-size:${isGenesis ? '1.05rem' : '1.25rem'}; font-weight:800; color:#002d5b; letter-spacing:-0.02em; line-height:1.2; ${isGenesis ? 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' : ''}">${title}</h3>
                        <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            ${subtitleParts.map(p => `<span>${p}</span>`).join('<span style="opacity:0.4;">·</span>')}
                        </div>
                    </div>
                </div>
                ${notesPreview}
            `;
        };

        /** Build the vertical options stack that sits under each card.
         *  Each card "owns" its own actions visually — Genesis gets a
         *  slim set (Open + Edit anchor pin + Journaling); a numbered
         *  day gets the full set: Open Full Plan (primary) + Edit Pin
         *  + Set as search center (when applicable) + Journaling +
         *  Delete. When the user is mid pin-edit (editingDayId), the
         *  pin button morphs into Save + ✕ as before. Buttons stretch
         *  the column width via the `.path-options-stack .day-action-btn`
         *  CSS rule. */
        const buildOptionsStack = (day, { isGenesis }) => {
            if (!day || !tripIsEditable) return '';
            const buttons = [];
            // Primary — Open Full Plan opens the day-detail modal (same
            // modal Genesis uses for its trip-wide notes/photos). Custom
            // primary class so it visually outranks the chip-style
            // `.day-action-btn` siblings below it; Genesis variant
            // matches the column's green theme.
            const primaryCls = isGenesis ? 'path-primary-btn path-primary-btn--genesis' : 'path-primary-btn';
            buttons.push(`<button class="${primaryCls} day-detail-btn" data-day-id="${esc(day.id)}">📋 Open Full Plan</button>`);
            if (editingDayId === day.id) {
                // Mid pin-edit: present save + cancel as the next two
                // buttons (the pin row in the old layout did the same
                // — save is wide, cancel is narrow ✕). Stacked here.
                buttons.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${esc(day.id)}">Save pin</button>`);
                buttons.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${esc(day.id)}">Cancel pin edit</button>`);
            } else {
                const pinLabel = day.lat
                    ? (isGenesis ? '📍 Edit anchor pin' : '📍 Edit pin')
                    : (isGenesis ? '📍 Set anchor pin' : '📍 Add pin');
                buttons.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${esc(day.id)}"><span>${pinLabel}</span></button>`);
            }
            // Set as search center — only on pinned non-Genesis days
            // (Genesis is the implicit default epicenter).
            if (!isGenesis && day.lat) {
                const tripId = activeTrip?.id || '';
                const isActive = STATE.preferences?.pillEpicenters?.[tripId] === day.id;
                const cls = isActive ? 'day-action-btn day-action-btn--success day-set-epicenter-btn' : 'day-action-btn day-action-btn--neutral day-set-epicenter-btn';
                const label = isActive ? '🎯 Search center (active)' : '🎯 Set as search center';
                buttons.push(`<button class="${cls}" data-day-id="${esc(day.id)}"><span>${label}</span></button>`);
            }
            if (isGenesis) {
                // Genesis — central hub. Trip checklist (free-form
                // packing/errand tasks) replaces the per-day Journaling
                // button here. Numbered days still get Journaling
                // (notes-focused modal); Genesis's notes/journal still
                // live in the day-detail modal accessed via Open Full Plan.
                buttons.push(`<button class="day-action-btn day-action-btn--neutral path-checklist-btn" data-day-id="${esc(day.id)}"><span>📝 Trip checklist</span></button>`);
            } else {
                // Journaling — separate notes-only modal. Numbered days
                // only; Genesis swaps this for the Trip checklist.
                buttons.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${esc(day.id)}"><span>✍️ Journaling</span></button>`);
            }
            // Delete — only on non-Genesis days. Genesis is structurally
            // permanent (anchors the trip).
            if (!isGenesis) {
                buttons.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${esc(day.id)}"><span>🗑️ Delete day</span></button>`);
            }
            return `<div class="path-options-stack">${buttons.join('')}</div>`;
        };

        /** The top-level Path tab content — chip strip + cards + options.
         *  Pure function of activeTrip + STATE; called on initial render
         *  and on every selection change. */
        const buildPathTabHtml = () => {
            const sortedDays = [...tripDays].sort((a, b) => a.dayNumber - b.dayNumber);
            const genesis = sortedDays.find(d => d.dayNumber === 0) || null;
            const numberedDays = sortedDays.filter(d => d.dayNumber > 0);
            const selectedId = resolveSelectedDayId(activeTrip, sortedDays);
            const selectedDay = sortedDays.find(d => d.id === selectedId) || null;
            // Empty state — no days yet (shouldn't happen since Genesis is
            // stamped on trip create, but defensive).
            if (sortedDays.length === 0) {
                return `<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">No days yet — create some.</div>`;
            }
            const totalDays = numberedDays.length;
            const selectedIsGenesis = selectedDay?.dayNumber === 0;
            const summaryText = selectedIsGenesis
                ? `Trip Genesis · ${totalDays} day${totalDays === 1 ? '' : 's'} planned`
                : (selectedDay
                    ? `Day ${selectedDay.dayNumber} of ${totalDays}`
                    : `${totalDays} day${totalDays === 1 ? '' : 's'} planned`);
            // Chip strip — Genesis chip first, then numbered days, then
            // a `+` chip (only for editable trips) that opens the
            // Add-Day modal. Each chip's `title` carries the day's name
            // + date so hovering surfaces context the chip itself can't
            // fit (per Q3 — numbers visible, titles in tooltip).
            const chipsHtml = sortedDays.map(d => {
                const isSel = d.id === selectedId;
                const isGen = d.dayNumber === 0;
                const cls = `path-chip${isGen ? ' path-chip--genesis' : ''}${isSel ? ' is-selected' : ''}`;
                const tooltip = isGen
                    ? 'Trip Genesis — your trip\'s anchor'
                    : `Day ${d.dayNumber}${d.name ? ' — ' + d.name : ''}${d.date ? ' · ' + (formatDayDate(d.date) || d.date) : ''}`;
                const inner = isGen
                    ? `<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="currentColor"/></svg>`
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
            // Genesis column always renders (when Genesis exists);
            // the selected-day column renders only when the selected
            // day is a numbered day (when Genesis is the selected
            // card, the right column collapses and Genesis stretches
            // to fill).
            const columns = [];
            if (genesis) {
                const genesisIsSelected = selectedDay?.id === genesis.id;
                columns.push(`
                    <div class="path-column path-column--genesis">
                        <div class="path-card path-card--genesis${genesisIsSelected ? ' is-selected' : ''}" data-day-id="${esc(genesis.id)}">
                            ${buildDayCardBody(genesis, { isGenesis: true, isSelected: genesisIsSelected })}
                        </div>
                        ${buildOptionsStack(genesis, { isGenesis: true })}
                    </div>
                `);
            }
            if (selectedDay && selectedDay.dayNumber > 0) {
                columns.push(`
                    <div class="path-column path-column--selected">
                        <div class="path-card path-card--selected" data-day-id="${esc(selectedDay.id)}">
                            ${buildDayCardBody(selectedDay, { isGenesis: false, isSelected: true })}
                        </div>
                        ${buildOptionsStack(selectedDay, { isGenesis: false })}
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
        const pathTabInner = /** @type {HTMLElement | null} */ (daysContainer.querySelector('#pathTabInner'));
        const repaintPath = () => {
            if (!pathTabInner) return;
            pathTabInner.innerHTML = buildPathTabHtml();
            const sel = pathTabInner.querySelector('.path-chip.is-selected');
            if (sel) /** @type {HTMLElement} */ (sel).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        };
        _repaintPathTab = repaintPath;
        repaintPath();

        // Step the selection by ±1 in the sorted-day list. No wrap so
        // the user feels the ends of the list (the disabled prev/next
        // buttons reinforce that boundary).
        const stepSelectedDay = (delta) => {
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
        let swipeStartX = null;
        daysContainer.addEventListener('touchstart', (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            const cardsRow = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest('.path-cards-row') : null);
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
        const onKeyDown = (e) => {
            if (activeHomeTab !== 'days') return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tag = (e.target && e.target.tagName) || '';
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
                    // Single-pin trips (only Genesis, or only the trip
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

            // Home sub-tabs (Path / Companions / Documents / Photos) —
            // toggle the active block via class swap; all tabs stay in
            // the DOM so nothing has to remount on switch (preserves
            // per-day delegated handlers and timeline animation state).
            // The To-do list moved to its own top-level /todo page.
            const tabBtn = /** @type {HTMLElement | null} */ (target.closest('.home-tabnav__tab'));
            const tabKey = tabBtn?.dataset.homeTab;
            if (tabKey === 'days' || tabKey === 'companions' || tabKey === 'documents' || tabKey === 'photos') {
                activeHomeTab = tabKey;
                daysContainer.querySelectorAll('.home-tabnav__tab').forEach(t => {
                    /** @type {HTMLElement} */ (t).classList.toggle('is-active', /** @type {HTMLElement} */ (t).dataset.homeTab === activeHomeTab);
                });
                daysContainer.querySelectorAll('.home-tab-content').forEach(c => {
                    /** @type {HTMLElement} */ (c).classList.toggle('is-active', /** @type {HTMLElement} */ (c).dataset.homeTab === activeHomeTab);
                });
                return;
            }

            // Edit-trip pencil — owner-only, hidden when !manageable.
            if (target.closest('#editTripBtn')) { openEditTripModal(activeTrip); return; }

            // Share-to-feed — toggle. The button stamps its current state
            // into `data-shared` (refreshed by the post-render fetch in
            // fetchShareStatus, see below) so we know whether to open
            // the share modal or the unshare confirm. Filled state means
            // already-shared.
            const shareBtn = /** @type {HTMLElement | null} */ (target.closest('#shareToFeedBtn'));
            if (shareBtn && activeTrip) {
                const alreadyShared = shareBtn.dataset.shared === '1';
                if (alreadyShared) {
                    const postId = Number(shareBtn.dataset.postId || 0);
                    if (!postId) return;
                    showConfirmModal({
                        title: "Unshare this trip?",
                        message: `It'll disappear from your friends' feeds. Any reposts of it will be removed too.`,
                        confirmText: "Unshare",
                        onConfirm: async () => {
                            const result = await unshareFeedPost(postId);
                            if (!result || !result.ok) {
                                showLiquidAlert("Couldn't unshare — try again in a moment.");
                                return;
                            }
                            shareBtn.dataset.shared = '0';
                            shareBtn.dataset.postId = '';
                            updateShareBtnVisualState(shareBtn, false);
                            showLiquidAlert("Removed from your feed.");
                        },
                    });
                    return;
                }
                // Not shared yet — open the share modal with caption input.
                openShareToFeedModal(activeTrip, async (caption) => {
                    const result = await shareTripToFeed(activeTrip.id, caption);
                    if (!result || !result.ok) {
                        showLiquidAlert("Couldn't share — try again in a moment.");
                        return;
                    }
                    const postId = Number(result.body?.post_id) || 0;
                    if (postId) {
                        shareBtn.dataset.shared = '1';
                        shareBtn.dataset.postId = String(postId);
                        updateShareBtnVisualState(shareBtn, true);
                    }
                    if (result.body?.status === 'already_shared') {
                        showLiquidAlert(caption ? "Updated your share." : "Already shared to your feed.");
                    } else {
                        showLiquidAlert("Shared to your feed.");
                    }
                });
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

            // Genesis: Trip checklist option (free-form packing/errand
            // tasks). Distinct from /todo (places list) and from
            // Journaling (notes modal).
            if (target.closest('.path-checklist-btn') && activeTrip) {
                openTripChecklistModal(activeTrip);
                return;
            }

            // (Day-level Photos/Documents buttons were removed
            //  entirely. Both stores live at trip scope now and are
            //  managed from the Documents + Photos tabs on Home.)

            // "Set as search center" — toggle this day as the pill-
            // search epicenter for the active trip. Click an active
            // one again to clear (genesis becomes the default again).
            const epicenterBtn = /** @type {HTMLElement | null} */ (target.closest('.day-set-epicenter-btn'));
            if (epicenterBtn?.dataset.dayId && activeTrip) {
                const dayId = epicenterBtn.dataset.dayId;
                if (!STATE.preferences) STATE.preferences = { mapDefaultPois: ['sights','parks','transit'], poiFilters: {}, pillEpicenters: {} };
                if (!STATE.preferences.pillEpicenters) STATE.preferences.pillEpicenters = {};
                const currentlyActive = STATE.preferences.pillEpicenters[activeTrip.id] === dayId;
                if (currentlyActive) delete STATE.preferences.pillEpicenters[activeTrip.id];
                else STATE.preferences.pillEpicenters[activeTrip.id] = dayId;
                emit('state:changed');
                navigate('home'); // re-render so the button label updates
                return;
            }

            // The shortlist remove handler used to live here; the
            // to-do list moved to /todo so this button no longer
            // renders on home. The /todo page owns its own remove.

            // Documents tab — clicking a doc-link with a .pdf URL
            // intercepts the default <a target="_blank"> behavior and
            // opens the in-app PDF previewer instead. Honour Cmd-click
            // / Ctrl-click / middle-click / right-click so the user
            // can still force a new tab (those events don't reach
            // this handler the same way; the `event.metaKey` /
            // `ctrlKey` check is belt-and-braces). Non-PDF URLs fall
            // through to the anchor's default behavior (new tab).
            const docLink = /** @type {HTMLAnchorElement | null} */ (target.closest('.trip-doc-link'));
            if (docLink && looksLikePdfUrl(docLink.href)) {
                const ev = /** @type {MouseEvent} */ (e);
                if (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey && ev.button !== 1) {
                    ev.preventDefault();
                    const card = docLink.closest('.trip-doc-card');
                    const name = card?.querySelector('a')?.textContent?.trim() || 'Document';
                    openPdfPreview(docLink.href, name);
                    return;
                }
            }
            // Documents tab — Gmail search button (visible to all members).
            if (target.closest('#searchGmailDocsBtn') && activeTrip) {
                const url = buildGmailTripSearchUrl(activeTrip);
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                return;
            }
            // Documents tab — Add document button (planner-only).
            if (target.closest('#addDocBtn') && activeTrip && tripIsEditable) {
                openAddTripDocumentModal(activeTrip);
                return;
            }
            // Documents tab — per-row Edit (rename / change link).
            const docEditBtn = /** @type {HTMLElement | null} */ (target.closest('.trip-doc-edit-btn'));
            if (docEditBtn?.dataset.docId && activeTrip && tripIsEditable) {
                openEditTripDocumentModal(activeTrip, docEditBtn.dataset.docId);
                return;
            }
            // Documents tab — per-row remove.
            const docRemoveBtn = /** @type {HTMLElement | null} */ (target.closest('.trip-doc-remove-btn'));
            if (docRemoveBtn?.dataset.docId && activeTrip && tripIsEditable) {
                const removed = removeTripDocument(activeTrip, docRemoveBtn.dataset.docId);
                if (removed) {
                    emit('state:changed');
                    if (removed === 'trip') upsertTrip(activeTrip);
                    else {
                        // Legacy day.tickets path — find the day and upsert it.
                        const dayId = (docRemoveBtn.dataset.docId || '').split('#')[0];
                        const day = STATE.tripDays.find(d => d.id === dayId);
                        if (day) upsertDay(day);
                    }
                    navigate('home');
                }
                return;
            }
            // Photos tab — Add photos button (planner-only). Triggers
            // the hidden file input which the change listener below
            // handles.
            if (target.closest('#addPhotosBtn') && activeTrip && tripIsEditable) {
                /** @type {HTMLInputElement | null} */
                (div.querySelector('#addPhotosInput'))?.click();
                return;
            }
            // Photos tab — Add by link button (planner-only). Opens a
            // small modal asking for a URL (Google Drive, Dropbox,
            // hosted image, etc.) plus optional day-tie. Same pattern
            // as the document-add modal.
            if (target.closest('#addPhotoUrlBtn') && activeTrip && tripIsEditable) {
                openAddTripPhotoUrlModal(activeTrip);
                return;
            }
            // Photos tab — per-thumbnail remove.
            const photoRemoveBtn = /** @type {HTMLElement | null} */ (target.closest('.trip-photo-remove-btn'));
            if (photoRemoveBtn?.dataset.photoId && activeTrip && tripIsEditable) {
                photoRemoveBtn.dataset.cancel = '1'; // hint to thumbnail click below
                const removed = removeTripPhoto(activeTrip, photoRemoveBtn.dataset.photoId);
                if (removed) {
                    emit('state:changed');
                    if (removed === 'trip') upsertTrip(activeTrip);
                    else {
                        const dayId = (photoRemoveBtn.dataset.photoId || '').split('#')[0];
                        const day = STATE.tripDays.find(d => d.id === dayId);
                        if (day) upsertDay(day);
                    }
                    navigate('home');
                }
                return;
            }
            // Photos tab — thumbnail click. Image-kind cards open
            // the lightbox; link-kind cards open the share URL in a
            // new tab so Drive / Dropbox / iCloud links work.
            // Skip the click if the user actually clicked the day-
            // select dropdown (otherwise opening it would also
            // trigger lightbox / link-open).
            const photoCard = /** @type {HTMLElement | null} */ (target.closest('.trip-photo-card'));
            if (photoCard?.dataset.photoId && activeTrip
                && !target.closest('.trip-photo-remove-btn')
                && !target.closest('.trip-photo-day-select')) {
                const photo = getAllTripPhotos(activeTrip).find(p => p.id === photoCard.dataset.photoId);
                if (photo) {
                    if (photoCard.dataset.photoKind === 'link') {
                        window.open(photo.src, '_blank', 'noopener,noreferrer');
                    } else {
                        openPhotoLightbox(photo.src);
                    }
                }
                return;
            }

            const delDayBtn = /** @type {HTMLElement | null} */ (target.closest('.day-delete-btn'));
            if (delDayBtn?.dataset.dayId) { deleteDay(delDayBtn.dataset.dayId); return; }

            const detailBtn = /** @type {HTMLElement | null} */ (target.closest('.day-detail-btn'));
            if (detailBtn?.dataset.dayId) { openDayDetail(detailBtn.dataset.dayId); return; }

            // ── Path tab navigation handlers (chip-strip layout) ────
            // Add-day chip — opens the standard add-day modal.
            if (target.closest('#pathAddDayChip')) { openAddDayModal(); return; }
            // Prev/next nav buttons — step through sortedDays by ±1.
            if (target.closest('#pathPrevBtn')) { stepSelectedDay(-1); return; }
            if (target.closest('#pathNextBtn')) { stepSelectedDay(+1); return; }
            // Chip click — jump straight to that day.
            const chip = /** @type {HTMLElement | null} */ (target.closest('.path-chip[data-path-chip-day-id]'));
            if (chip?.dataset.pathChipDayId && activeTrip) {
                setSelectedDay(activeTrip.id, chip.dataset.pathChipDayId);
                return;
            }
            // Card body click — selects that card. Genesis card click
            // when a numbered day is currently selected jumps focus to
            // Genesis; clicking the already-selected card is a no-op
            // (use the "Open Full Plan" button to enter the modal —
            // keeps the two interactions cleanly separated).
            const pathCard = /** @type {HTMLElement | null} */ (target.closest('.path-card[data-day-id]'));
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

        // Documents + Photos tabs: per-row dayId reassignment via
        // the inline dropdown. Only available for trip-level entries
        // (legacy day.tickets / day.photos entries can't be moved
        // without re-creating them).
        daysContainer.addEventListener('change', (ev) => {
            const target = /** @type {HTMLElement | null} */ (ev.target);
            if (!target || !activeTrip || !tripIsEditable) return;
            const docSel = /** @type {HTMLSelectElement | null} */ (target.closest('.trip-doc-day-select'));
            if (docSel?.dataset.docId) {
                setDocumentDay(activeTrip, docSel.dataset.docId, docSel.value || null);
                emit('state:changed');
                upsertTrip(activeTrip);
                navigate('home');
                return;
            }
            const photoSel = /** @type {HTMLSelectElement | null} */ (target.closest('.trip-photo-day-select'));
            if (photoSel?.dataset.photoId) {
                setPhotoDay(activeTrip, photoSel.dataset.photoId, photoSel.value || null);
                emit('state:changed');
                upsertTrip(activeTrip);
                navigate('home');
                return;
            }
        });

        // Photos tab: file input change → upload via uploadMedia, then
        // append each result to trip.photos. Multi-select supported;
        // each upload runs serially to avoid clobbering uploadMedia's
        // shared state.
        const photoInput = /** @type {HTMLInputElement | null} */ (div.querySelector('#addPhotosInput'));
        if (photoInput) {
            photoInput.addEventListener('change', async () => {
                const files = Array.from(photoInput.files || []);
                if (files.length === 0 || !activeTrip) return;
                showLiquidAlert(`Uploading ${files.length} photo${files.length === 1 ? '' : 's'}…`);
                // Quick-upload default: Trip Genesis (the trip-wide
                // bucket). User can re-tag any photo to a numbered
                // day from the dropdown chip on its tile.
                const genesisDay = (STATE.tripDays || [])
                    .find(d => d.tripId === activeTrip.id && Number(d.dayNumber) === 0);
                const defaultDayId = genesisDay ? genesisDay.id : null;
                let added = 0;
                for (const file of files) {
                    try {
                        // uploadMedia returns { url, name, ... } (or null)
                        // — NOT a bare URL string. Earlier I treated the
                        // whole object as the src, which silently stored
                        // nothing useful and the photo never appeared.
                        const res = await uploadMedia(file);
                        if (res?.url) {
                            addTripPhoto(activeTrip, { src: res.url, dayId: defaultDayId });
                            added++;
                        }
                    } catch (e) {
                        console.error('Photo upload failed:', e);
                    }
                }
                photoInput.value = ''; // reset so the same file can be picked again
                if (added > 0) {
                    emit('state:changed');
                    await upsertTrip(activeTrip);
                    showLiquidAlert(`${added} photo${added === 1 ? '' : 's'} added.`);
                    navigate('home');
                } else {
                    showLiquidAlert('Upload failed — please try again.');
                }
            });
        }

        // The legacy `#addDayBtn` (vertical-timeline footer) was retired
        // when the Path tab moved to the chip-strip layout — `+ Add Day`
        // now lives on the trailing "+" chip in the strip and is wired
        // through the delegated daysContainer click handler above
        // (#pathAddDayChip → openAddDayModal).
    }

    // Toggle state for Quick Access — hidden by default. Anyone who
    // explicitly opens it (which sets STATE.hideQuickAccess = false)
    // keeps seeing it until they hit Hide; everyone else (undefined or
    // true) sees only the small "Show Quick Access" button.
    const isHidden = STATE.hideQuickAccess !== false;

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
                        <button type="button" class="card-button-reset guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: ${showTick ? 'rgba(52, 199, 89, 0.08)' : 'white'}; border-radius: var(--radius-xl); border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.2)' : 'rgba(0,0,0,0.05)'}; cursor: pointer; position: relative; overflow: hidden;">
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
                        </button>
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

    wireRoleButtonKeys(div);
    return div;
}

// --- Day Interaction Modals (Extracted from Map Logic) ---
const openJournalingModal = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 580px;',
        innerHTML: `
            <h2 style="font-size: var(--font-3xl); margin-bottom: var(--space-2); color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${day.dayNumber} Journaling</h2>
            <p class="text-subtitle">Capture your memories and stories from ${esc(day.name)}</p>
            <textarea id="journalText" class="glass-input-light" style="height: 260px; font-size: 1.05rem; line-height: 1.6; margin-bottom: var(--space-5); resize: vertical; display: block;" placeholder="What happened today? How did you feel?">${esc(day.notes || '')}</textarea>
            <div style="display: flex; gap: var(--space-3);">
                <button id="saveJournalBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Save Story</button>
                <button id="closeJournalBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        `,
    });
    /** @type {HTMLButtonElement} */ (q(root, '#closeJournalBtn')).onclick = () => close();
    /** @type {HTMLButtonElement} */ (q(root, '#saveJournalBtn')).onclick = async () => {
        day.notes = /** @type {HTMLTextAreaElement} */ (q(root, '#journalText')).value;
        emit('state:changed');
        await upsertDay(day);
        showLiquidAlert("Memories saved!");
        close();
        navigate('home', null, true);
    };
};

// ── Trip-level Documents/Photos modals ───────────────────────
// ── Share-to-feed plumbing ──────────────────────────────────────────
// Visual state of the home trip-header Share button is driven by two
// data attributes set after fetchShareStatus resolves on mount:
//   data-shared     '1' → already on the user's feed (filled style)
//                   '0' → not shared yet (outline style)
//   data-post-id    feed_posts.id when shared, used for the Unshare flow

/** Flip the Share button between outline and filled states. Outline
 *  state inherits the standard `.icon-btn-circle` look (subtle purple
 *  tint from --accent: 88,86,214); filled state goes solid-purple with
 *  a white icon so the "already shared" state pops visually. The
 *  same purple anchors the share/repost event accent in the feed,
 *  carrying visual identity across home → feed. */
function updateShareBtnVisualState(btn, shared) {
    if (!btn) return;
    if (shared) {
        btn.style.background = '#5856d6';
        btn.style.color = 'white';
        btn.style.borderColor = '#5856d6';
        btn.title = 'Already shared — click to unshare';
        btn.setAttribute('aria-label', 'Unshare this trip');
    } else {
        // Clear the inline overrides so the .icon-btn-circle base
        // styles (driven by --accent on the element) take back over.
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.title = 'Share this trip to your feed';
        btn.setAttribute('aria-label', 'Share to feed');
    }
}

/** Open the Share-to-feed modal: a textarea for an optional ≤280-char
 *  caption + a Cancel/Share pair. The textarea pre-fills with `seedCaption`
 *  when the user is editing an existing share. The submit callback gets
 *  the cleaned caption string (or empty for "no caption"). */
function openShareToFeedModal(trip, onSubmit, seedCaption = '') {
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); padding: 28px; border-radius: 28px; background: white;',
        innerHTML: `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 14px;">
                <div>
                    <h2 style="margin:0 0 4px; font-size:1.5rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Share to your feed</h2>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">${esc(trip.name)}${trip.country ? ` · ${esc(trip.country)}` : ''}</p>
                </div>
                <button id="shareModalClose" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <label style="display:block; font-size:0.78rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Add a caption (optional)</label>
            <textarea id="shareCaptionInput" maxlength="280" placeholder="e.g. Adding Lisbon for Easter — anyone been?"
                style="width:100%; box-sizing:border-box; min-height: 90px; padding:12px 14px; border:1px solid rgba(0,45,91,0.12); border-radius:14px; font-size:0.95rem; font-family: inherit; color:#002d5b; background:rgba(0,113,227,0.04); resize: vertical; line-height:1.45;">${esc(seedCaption || '')}</textarea>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
                <span id="shareCaptionCount" style="font-size:0.72rem; color:var(--text-secondary); font-weight:700;">${(seedCaption || '').length}/280</span>
                <span style="font-size:0.72rem; color:var(--text-secondary);">Friends can like, comment, repost.</span>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
                <button id="shareModalCancel" class="btn" style="padding: 10px 18px; border-radius: 999px; background:rgba(0,0,0,0.06); color:#002d5b; font-weight:700;">Cancel</button>
                <button id="shareModalSubmit" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">Share</button>
            </div>
        `,
    });
    const textarea = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('#shareCaptionInput'));
    const counter = /** @type {HTMLElement | null} */ (root.querySelector('#shareCaptionCount'));
    if (textarea && counter) {
        textarea.addEventListener('input', () => {
            counter.textContent = `${textarea.value.length}/280`;
        });
        // Defer focus so the modal's open-animation doesn't fight it.
        setTimeout(() => textarea.focus(), 80);
    }
    /** @type {HTMLButtonElement | null} */ (root.querySelector('#shareModalClose'))?.addEventListener('click', close);
    /** @type {HTMLButtonElement | null} */ (root.querySelector('#shareModalCancel'))?.addEventListener('click', close);
    /** @type {HTMLButtonElement | null} */ (root.querySelector('#shareModalSubmit'))?.addEventListener('click', async () => {
        const caption = (textarea?.value || '').trim();
        close();
        await onSubmit(caption);
    });
}

// ── Trip checklist (Genesis option) ─────────────────────────────────
// Free-form to-do list scoped to the whole trip — packing, errands,
// pre-trip tasks. Surfaced as a Genesis option (Genesis is the trip's
// central hub). Stored as `trip.checklist` (array of {id, body, done,
// created_at}); persisted via upsertTrip + the new checklist_json
// column. Distinct from /todo (places-to-visit list) — checklist is
// tasks, /todo is places.
//
// The modal stays open across mutations so the user can rip through
// "add 5 tasks at once" without re-opening; everything is optimistic
// + persisted in the background. Failures are silent for v1 (the
// next sync reconciles).

/** @param {any} trip */
const openTripChecklistModal = (trip) => {
    if (!trip) return;
    if (!Array.isArray(trip.checklist)) trip.checklist = [];

    const editable = canEdit(trip);

    /** Persist + paint. Called after every add/toggle/edit/delete. */
    const persist = () => {
        emit('state:changed');
        upsertTrip(trip);
    };

    const renderItemRow = (item) => {
        const id = esc(item.id);
        const done = !!item.done;
        const editingMarker = item._editing ? ' is-editing' : '';
        const bodyHtml = item._editing
            ? `<input type="text" class="checklist-edit-input" data-item-id="${id}" value="${esc(item.body || '')}" maxlength="200" autocomplete="off"
                style="flex:1; min-width:0; padding:6px 10px; border:1.5px solid var(--accent-blue); border-radius:8px; font-size:0.92rem; font-family:inherit; background:white; color:#002d5b;">`
            : `<button type="button" class="checklist-item-text" data-item-id="${id}" ${editable ? '' : 'disabled'}
                style="flex:1; min-width:0; text-align:left; padding:0; background:transparent; border:0; cursor:${editable ? 'pointer' : 'default'}; font-size:0.92rem; line-height:1.45; color:#002d5b; ${done ? 'color:rgba(0,45,91,0.4); text-decoration:line-through;' : ''}">${esc(item.body || '')}</button>`;
        const actionsHtml = editable
            ? (item._editing
                ? `<button type="button" class="checklist-save-btn" data-item-id="${id}" title="Save" aria-label="Save"
                       style="background:rgba(212,160,23,0.12); border:1px solid rgba(212,160,23,0.32); color:#8b6e0c; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-weight:800; cursor:pointer; flex-shrink:0;">Save</button>`
                : `<button type="button" class="checklist-delete-btn" data-item-id="${id}" title="Delete" aria-label="Delete"
                       style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>`)
            : '';
        return `
            <div class="checklist-row${editingMarker}" data-item-id="${id}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white; border:1px solid rgba(0,45,91,0.06); border-radius:12px;">
                <button type="button" class="checklist-toggle-btn" data-item-id="${id}" ${editable ? '' : 'disabled'} aria-pressed="${done}" title="${done ? 'Mark not done' : 'Mark done'}"
                    style="flex-shrink:0; width:22px; height:22px; border-radius:50%; border:2px solid ${done ? '#8b6e0c' : 'rgba(0,113,227,0.3)'}; background:${done ? 'linear-gradient(135deg, #e8b923, #8b6e0c)' : 'white'}; color:white; cursor:${editable ? 'pointer' : 'default'}; display:inline-flex; align-items:center; justify-content:center; padding:0;">
                    ${done ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                </button>
                ${bodyHtml}
                ${actionsHtml}
            </div>
        `;
    };

    const renderBody = () => {
        const items = trip.checklist;
        const remaining = items.filter(i => !i.done).length;
        const summary = items.length === 0
            ? 'No tasks yet — add the first one below.'
            : `${remaining} of ${items.length} left`;
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 16px;">
                <div>
                    <h2 style="margin:0 0 4px; font-size:1.5rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">📝 Trip checklist</h2>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">${esc(trip.name)} · packing, errands, anything to tick off</p>
                </div>
                <button id="checklistModalClose" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            ${editable ? `
                <form id="checklistAddForm" style="display:flex; gap:8px; margin-bottom:14px;">
                    <input id="checklistAddInput" type="text" placeholder="Add a task — e.g. Charge power bank" maxlength="200" autocomplete="off"
                        style="flex:1; min-width:0; padding:10px 14px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.92rem; font-family:inherit; background:rgba(0,113,227,0.04); color:#002d5b;">
                    <button type="submit" class="btn-primary" style="padding:10px 18px; border-radius:999px; font-size:0.85rem;">Add</button>
                </form>
            ` : ''}
            <div id="checklistRows" style="display:flex; flex-direction:column; gap:8px;">
                ${items.length === 0
                    ? `<div style="font-size:0.85rem; color:var(--text-secondary); padding:20px; text-align:center; background:rgba(212,160,23,0.04); border:1.5px dashed rgba(212,160,23,0.32); border-radius:14px;">No tasks yet — your first one goes above.</div>`
                    : items.map(renderItemRow).join('')}
            </div>
            <div style="margin-top:14px; font-size:0.78rem; color:var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; text-align:center;">${esc(summary)}</div>
        `;
    };

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 540px; max-width: calc(100vw - 32px); max-height: 85vh; overflow:hidden; padding: 26px 28px; border-radius: 28px; background: white; display:flex; flex-direction:column;',
        innerHTML: '',
    });

    /** Re-render the modal contents in place (preserves scroll within
     *  the rows region by re-using the same container). */
    const repaint = () => {
        root.innerHTML = renderBody();
        wire();
    };

    /** Wire all delegated handlers. Re-attached on every repaint. */
    const wire = () => {
        /** @type {HTMLButtonElement | null} */
        const closeBtn = root.querySelector('#checklistModalClose');
        if (closeBtn) closeBtn.onclick = close;

        const form = /** @type {HTMLFormElement | null} */ (root.querySelector('#checklistAddForm'));
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const input = /** @type {HTMLInputElement | null} */ (root.querySelector('#checklistAddInput'));
                const body = (input?.value || '').trim();
                if (!body) return;
                trip.checklist.push({
                    id: generateId(),
                    body: body.slice(0, 200),
                    done: false,
                    created_at: new Date().toISOString(),
                });
                if (input) input.value = '';
                persist();
                repaint();
                // Re-focus input so chains of additions feel natural.
                const refocus = /** @type {HTMLInputElement | null} */ (root.querySelector('#checklistAddInput'));
                if (refocus) refocus.focus();
            };
        }

        // Toggle done.
        root.querySelectorAll('.checklist-toggle-btn').forEach(btn => {
            /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                const id = /** @type {HTMLElement} */ (btn).dataset.itemId;
                const item = trip.checklist.find(i => i.id === id);
                if (!item) return;
                item.done = !item.done;
                persist();
                repaint();
            };
        });
        // Click text → enter inline edit mode.
        root.querySelectorAll('.checklist-item-text').forEach(btn => {
            /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                const id = /** @type {HTMLElement} */ (btn).dataset.itemId;
                const item = trip.checklist.find(i => i.id === id);
                if (!item || !editable) return;
                // Clear any other in-flight edits so only one row is
                // editing at a time (keeps the UI legible).
                trip.checklist.forEach(i => { if (i._editing && i.id !== id) delete i._editing; });
                item._editing = true;
                repaint();
                const input = /** @type {HTMLInputElement | null} */ (root.querySelector(`.checklist-edit-input[data-item-id="${id}"]`));
                if (input) {
                    input.focus();
                    input.select();
                }
            };
        });
        // Save edit (button or Enter key).
        const commitEdit = (id) => {
            const item = trip.checklist.find(i => i.id === id);
            if (!item) return;
            const input = /** @type {HTMLInputElement | null} */ (root.querySelector(`.checklist-edit-input[data-item-id="${id}"]`));
            if (input) {
                const next = input.value.trim().slice(0, 200);
                if (next) item.body = next;  // empty input → silently keep old text
            }
            delete item._editing;
            persist();
            repaint();
        };
        root.querySelectorAll('.checklist-save-btn').forEach(btn => {
            /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                const id = /** @type {HTMLElement} */ (btn).dataset.itemId;
                if (id) commitEdit(id);
            };
        });
        root.querySelectorAll('.checklist-edit-input').forEach(inp => {
            /** @type {HTMLInputElement} */ (inp).onkeydown = (e) => {
                const k = /** @type {KeyboardEvent} */ (e).key;
                if (k === 'Enter') {
                    e.preventDefault();
                    const id = /** @type {HTMLElement} */ (inp).dataset.itemId;
                    if (id) commitEdit(id);
                } else if (k === 'Escape') {
                    e.preventDefault();
                    const id = /** @type {HTMLElement} */ (inp).dataset.itemId;
                    const item = trip.checklist.find(i => i.id === id);
                    if (item) { delete item._editing; repaint(); }
                }
            };
        });
        // Delete.
        root.querySelectorAll('.checklist-delete-btn').forEach(btn => {
            /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                const id = /** @type {HTMLElement} */ (btn).dataset.itemId;
                trip.checklist = trip.checklist.filter(i => i.id !== id);
                persist();
                repaint();
            };
        });
    };

    repaint();
    // Auto-focus the add-input on first open so the user can start
    // typing straight away (the most common gesture when opening the
    // modal is "I want to add a task").
    setTimeout(() => {
        const input = /** @type {HTMLInputElement | null} */ (root.querySelector('#checklistAddInput'));
        if (input) input.focus();
    }, 80);
};

// The Documents and Photos tabs on Home each open a small modal for
// adding new entries. Both stores live on the trip object directly
// (trip.documents, trip.photos); legacy day-level openPhotosModal /
// openDocumentsModal were retired with this commit — see the tab
// views, which present a UNION over trip-level entries and any
// legacy day.tickets / day.photos data so old trips don't disappear.

/** @param {any} trip */
const openAddTripDocumentModal = (trip) => {
    if (!trip) return;
    // Genesis is the trip-wide bucket. New documents default to it;
    // numbered days are alternatives the user can pick. The legacy
    // "Trip-wide" sentinel was retired — Genesis owns that role
    // throughout the app now.
    const genesisDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">Add document</h2>
            <p class="text-subtitle">Booking confirmation, hotel voucher, ticket — link or upload.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Name</label>
                <input type="text" id="newDocName" class="glass-input" placeholder="e.g. Flight to Lisbon — Confirmation 7AB22Q" style="padding: var(--space-3); border-radius: 12px;">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Link or URL</label>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="newDocUrl" class="glass-input" placeholder="https://..." style="flex: 1; padding: var(--space-3); border-radius: 12px;">
                    <label class="btn-primary" style="padding: var(--space-3) var(--space-4); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📤 Upload
                        <input type="file" id="newDocUpload" style="display: none;">
                    </label>
                </div>
                <div id="newDocStatus" style="font-size:0.72rem; color:var(--text-secondary); min-height:1em; font-weight:600;"></div>
                <!-- Path A user-guidance: many booking emails (Airbnb,
                     forwarded itineraries, restaurant confirmations)
                     don't carry an attachment — the booking info is
                     just in the body. The universally-supported fix
                     is browser-native Print → Save as PDF, which
                     captures the entire email exactly as the user
                     sees it (formatting, embedded QR codes, footer
                     details). Surfacing the recipe here so users
                     don't have to learn it elsewhere. -->
                <div style="background: rgba(0,113,227,0.06); border:1px solid rgba(0,113,227,0.18); border-radius: 12px; padding: 12px 14px; font-size:0.78rem; color:#002d5b; line-height:1.55; margin-top:4px;">
                    <strong style="color: var(--accent-blue);">📧 Booking email without an attachment?</strong><br>
                    Open the email in Gmail, hit <strong>Cmd&nbsp;+&nbsp;P</strong> (or Ctrl + P on Windows), pick <strong>Save as PDF</strong> as the destination, then come back here and click <strong>📤 Upload</strong> with that file. Captures the layout exactly — QR codes, dates, prices, all of it.
                </div>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                <select id="newDocDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    ${genesisDay ? `<option value="${esc(genesisDay.id)}" selected>⭐ Trip Genesis (passport, multi-day hotel, return flight…)</option>` : ''}
                    ${numberedDays.map(d => `<option value="${esc(d.id)}">Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newDocCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="newDocSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Add</button>
            </div>
        `,
    });
    const nameEl = /** @type {HTMLInputElement} */ (q(root, '#newDocName'));
    const urlEl = /** @type {HTMLInputElement} */ (q(root, '#newDocUrl'));
    const dayEl = /** @type {HTMLSelectElement} */ (q(root, '#newDocDay'));
    const statusEl = /** @type {HTMLElement} */ (q(root, '#newDocStatus'));
    const fileEl = /** @type {HTMLInputElement} */ (q(root, '#newDocUpload'));
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        statusEl.textContent = '⌛ Uploading…';
        try {
            const res = await uploadMedia(file);
            if (res && res.url) {
                urlEl.value = res.url;
                if (!nameEl.value) nameEl.value = res.name || file.name;
                statusEl.textContent = '✓ Uploaded — click Add to attach.';
            } else {
                statusEl.textContent = '❌ Upload failed.';
            }
        } catch (e) {
            statusEl.textContent = '❌ Upload failed.';
        }
    });
    /** @type {HTMLButtonElement} */ (q(root, '#newDocCancelBtn')).onclick = () => close();
    /** @type {HTMLButtonElement} */ (q(root, '#newDocSaveBtn')).onclick = async () => {
        const name = nameEl.value.trim();
        const url = urlEl.value.trim();
        if (!name || !url) {
            statusEl.textContent = 'Both name and URL are required.';
            return;
        }
        addTripDocument(trip, { name, url, dayId: dayEl.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert('Document added.');
        navigate('home');
    };
};

/** Photo-by-URL modal — for users who keep their photos in a Google
 *  Drive / Dropbox / iCloud share rather than uploading from the
 *  device. Mirrors the document-by-URL modal: name (auto-defaulted
 *  to "Trip photo"), URL input, day-tie dropdown. The src is stored
 *  as-is on trip.photos; we DON'T render the link as an inline image
 *  because cross-origin images often need a thumbnail link, not a
 *  share link. The thumbnail will work for direct image URLs (e.g.
 *  most CDN-served files); for share-page links the photo card will
 *  be empty until the user pastes a direct-image URL. We surface
 *  both options in the help text below the input.
 *
 *  @param {any} trip
 */
/** Edit an existing document — name, URL, optional day-tie. Mirrors
 *  the add modal so the user gets a familiar shape; pre-populates the
 *  fields from the existing entry. Works on both trip-level docs and
 *  legacy day.tickets (the latter via updateTripDocument's id-prefix
 *  detection); the day-tie dropdown only shows for trip-level entries
 *  because legacy ones can't be moved between days without breaking
 *  their index-based id (matches the inline-row dropdown behaviour).
 *
 *  @param {any} trip
 *  @param {string} docId
 */
const openEditTripDocumentModal = (trip, docId) => {
    if (!trip) return;
    const all = getAllTripDocuments(trip);
    const doc = all.find(d => d.id === docId);
    if (!doc) {
        showLiquidAlert('Could not find that document.');
        return;
    }
    const isTripLevel = doc._source === 'trip';
    const genesisDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">Edit document</h2>
            <p class="text-subtitle">${isTripLevel ? 'Rename it, swap the link, or move it to a different day.' : 'Rename it or swap the link. (Legacy per-day entries can\'t be moved between days; delete + re-add to do that.)'}</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Name</label>
                <input type="text" id="editDocName" class="glass-input" value="${esc(doc.name || '')}" style="padding: var(--space-3); border-radius: 12px;">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Link or URL</label>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="editDocUrl" class="glass-input" value="${esc(doc.url || '')}" style="flex: 1; padding: var(--space-3); border-radius: 12px;">
                    <label class="btn-primary" style="padding: var(--space-3) var(--space-4); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📤 Replace
                        <input type="file" id="editDocUpload" style="display: none;">
                    </label>
                </div>
                <div id="editDocStatus" style="font-size:0.72rem; color:var(--text-secondary); min-height:1em; font-weight:600;"></div>
                ${isTripLevel ? `
                    <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                    <select id="editDocDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                        ${genesisDay ? `<option value="${esc(genesisDay.id)}" ${doc.dayId === genesisDay.id ? 'selected' : ''}>⭐ Trip Genesis (trip-wide)</option>` : ''}
                        ${numberedDays.map(d => `<option value="${esc(d.id)}" ${doc.dayId === d.id ? 'selected' : ''}>Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                    </select>
                ` : ''}
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="editDocCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="editDocSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Save changes</button>
            </div>
        `,
    });
    const nameEl = /** @type {HTMLInputElement} */ (q(root, '#editDocName'));
    const urlEl = /** @type {HTMLInputElement} */ (q(root, '#editDocUrl'));
    const dayEl = /** @type {HTMLSelectElement | null} */ (root.querySelector('#editDocDay'));
    const statusEl = /** @type {HTMLElement} */ (q(root, '#editDocStatus'));
    const fileEl = /** @type {HTMLInputElement} */ (q(root, '#editDocUpload'));
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        if (!file) return;
        statusEl.textContent = '⌛ Uploading…';
        try {
            const res = await uploadMedia(file);
            if (res?.url) {
                urlEl.value = res.url;
                statusEl.textContent = '✓ Replaced — click Save to confirm.';
            } else {
                statusEl.textContent = '❌ Upload failed.';
            }
        } catch (e) {
            statusEl.textContent = '❌ Upload failed.';
        }
    });
    /** @type {HTMLButtonElement} */ (q(root, '#editDocCancelBtn')).onclick = () => close();
    /** @type {HTMLButtonElement} */ (q(root, '#editDocSaveBtn')).onclick = async () => {
        const name = nameEl.value.trim();
        const url = urlEl.value.trim();
        if (!name || !url) {
            statusEl.textContent = 'Name and URL are both required.';
            statusEl.style.color = '#ff9500';
            return;
        }
        const patch = { name, url, ...(dayEl ? { dayId: dayEl.value || null } : {}) };
        const source = updateTripDocument(trip, docId, patch);
        if (!source) {
            statusEl.textContent = 'Could not save. Refresh and try again.';
            statusEl.style.color = '#ff3b30';
            return;
        }
        emit('state:changed');
        try {
            if (source === 'trip') {
                await upsertTrip(trip);
            } else {
                // Legacy day.tickets — find the day and upsert.
                const hashIdx = docId.indexOf('#');
                const dayId = hashIdx > 0 ? docId.slice(0, hashIdx) : null;
                const day = dayId ? STATE.tripDays.find(d => d.id === dayId) : null;
                if (day) await upsertDay(day);
            }
            close();
            showLiquidAlert('Document updated.');
            navigate('home');
        } catch (err) {
            statusEl.textContent = `Save failed (${/** @type {Error} */ (err).message}). Try again.`;
            statusEl.style.color = '#ff3b30';
        }
    };
};

const openAddTripPhotoUrlModal = (trip) => {
    if (!trip) return;
    // Genesis is the trip-wide bucket; numbered days are alternatives.
    const genesisDay = (STATE.tripDays || [])
        .find(d => d.tripId === trip.id && Number(d.dayNumber) === 0);
    const numberedDays = (STATE.tripDays || [])
        .filter(d => d.tripId === trip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">Add photo by link</h2>
            <p class="text-subtitle">Paste a link to a hosted image, a Google Drive / Dropbox share, or a photo album page.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Image / album URL</label>
                <input type="text" id="newPhotoUrl" class="glass-input" placeholder="https://..." style="padding: var(--space-3); border-radius: 12px;">
                <div style="font-size:0.72rem; color:var(--text-secondary); line-height:1.45;">
                    <strong>Tip:</strong> for Drive / Dropbox albums, paste the share link — the link will open the album when clicked. Direct image URLs (ending in .jpg / .png / .heic) will render as a thumbnail in the grid.
                </div>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Where does it belong?</label>
                <select id="newPhotoDay" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    ${genesisDay ? `<option value="${esc(genesisDay.id)}" selected>⭐ Trip Genesis</option>` : ''}
                    ${numberedDays.map(d => `<option value="${esc(d.id)}">Day ${d.dayNumber}${d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newPhotoCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="newPhotoSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Add</button>
            </div>
        `,
    });
    const urlEl = /** @type {HTMLInputElement} */ (q(root, '#newPhotoUrl'));
    const dayEl = /** @type {HTMLSelectElement} */ (q(root, '#newPhotoDay'));
    /** @type {HTMLButtonElement} */ (q(root, '#newPhotoCancelBtn')).onclick = () => close();
    /** @type {HTMLButtonElement} */ (q(root, '#newPhotoSaveBtn')).onclick = async () => {
        const url = urlEl.value.trim();
        if (!url) return;
        addTripPhoto(trip, { src: url, dayId: dayEl.value || null });
        emit('state:changed');
        await upsertTrip(trip);
        close();
        showLiquidAlert('Photo link added.');
        navigate('home');
    };
};

/** Lightweight image lightbox — single src, click anywhere to close.
 *  Reuses the showModal infra so Esc + backdrop dismissal "just work". */
const openPhotoLightbox = (src) => {
    if (!src) return;
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'background: transparent; border: 0; padding: 0; max-width: 92vw; max-height: 92vh;',
        innerHTML: `<img src="${esc(src)}" alt="Trip photo" style="display:block; max-width: 92vw; max-height: 92vh; border-radius: 18px; object-fit: contain; box-shadow: 0 30px 80px rgba(0,0,0,0.4);">`,
    });
    root.addEventListener('click', () => close());
};

/** In-app PDF preview. Renders the file in a borderless `<iframe>`
 *  inside a large modal so the user doesn't have to leave GG to read
 *  a booking confirmation. Browser-native PDF viewer handles rendering
 *  + zoom + page nav + download — works on Chrome, Safari, Firefox.
 *
 *  Caveat: cross-origin PDFs (Google Drive share links, some hosts)
 *  may set `X-Frame-Options: DENY` or `Content-Security-Policy:
 *  frame-ancestors none`, blocking the iframe entirely. We can't
 *  reliably detect that ahead of time (the load event fires either
 *  way), so the modal always carries an "Open in new tab ↗" button
 *  as a guaranteed fallback. Same-origin PDFs (anything we host via
 *  /api/upload/...) always work.
 *
 *  @param {string} url
 *  @param {string} [name] — display name in the modal header
 */
export const openPdfPreview = (url, name) => {
    if (!url) return;
    const safeUrl = esc(url);
    const safeName = esc(name || 'Document');
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: min(1100px, 96vw); height: min(880px, 92vh); padding: 0; background: white; border: 1px solid rgba(0,0,0,0.08); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;',
        innerHTML: `
            <!-- Header bar — name + actions. Sticks to the top of
                 the modal card; iframe takes the rest. -->
            <div style="display:flex; align-items:center; gap:12px; padding: 10px 14px 10px 18px; border-bottom: 1px solid rgba(0,0,0,0.07); background: rgba(245,247,250,0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); flex-shrink:0;">
                <span style="font-size:1.1rem; line-height:1; flex-shrink:0;">📎</span>
                <h3 style="flex:1; min-width:0; margin:0; font-size:0.95rem; font-weight:800; color:#002d5b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeName}</h3>
                <a href="${safeUrl}" target="_blank" rel="noreferrer"
                    style="background:rgba(0,113,227,0.08); color:var(--accent-blue); border:1px solid rgba(0,113,227,0.18); padding:6px 12px; border-radius:999px; font-size:0.75rem; font-weight:800; text-decoration:none; display:inline-flex; align-items:center; gap:6px;"
                    title="Open this PDF in a new browser tab">
                    Open in new tab ↗
                </a>
                <button id="closePdfPreviewBtn" type="button" aria-label="Close"
                    style="background:rgba(0,0,0,0.04); border:0; color:rgba(0,0,0,0.55); width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:0.95rem; line-height:1; flex-shrink:0;">✕</button>
            </div>
            <!-- Body — iframe fills the rest. The #toolbar=0 fragment
                 hint asks Chrome to hide its built-in toolbar (cleaner
                 inline view); ignored by Safari/Firefox without harm. -->
            <iframe src="${safeUrl}#toolbar=1&navpanes=0" title="${safeName}"
                style="flex:1; border:0; display:block; background:#f5f7fa; min-height:0;"
                referrerpolicy="no-referrer"></iframe>
        `,
    });
    /** @type {HTMLButtonElement} */ (q(root, '#closePdfPreviewBtn')).onclick = () => close();
};

/** Detect whether a URL points to something we can preview inline
 *  via the browser's native PDF viewer. Conservative — we only flip
 *  the in-app preview for clear PDF signals. Anything else (Drive
 *  share pages, generic links) keeps the existing "open in new tab"
 *  behaviour. */
export const looksLikePdfUrl = (url) => {
    if (!url) return false;
    if (/^data:application\/pdf/i.test(url)) return true;
    // Strip query string + fragment before checking the extension —
    // many CDN URLs append ?token=... or #page=2.
    const cleaned = url.split(/[?#]/)[0];
    return /\.pdf$/i.test(cleaned);
};


/** Read-only modal for viewing a day's plan. Used in two places:
 *  1. Archived trip detail (collections.js) where every day is frozen.
 *  2. Active trips when the current user isn't a planner (relaxers and
 *     budgeteers shouldn't be able to edit the plan).
 *
 *  Takes a `day` object directly (not an id) because archived trips
 *  carry their own nested `tripDays` array — those rows aren't in
 *  STATE.tripDays. The shape is identical otherwise.
 */
export const openDayView = (day) => {
    if (!day) return;
    // Pull this day's photos and documents from BOTH the new trip-
    // level stores (filtered by dayId) AND the legacy day.photos /
    // day.tickets arrays. This keeps archived-trip views consistent
    // with the new tab views, and old archived data continues to
    // surface even if its trip never got the trip.photos/documents
    // backfill on the server side.
    //
    // The trip the day belongs to:
    //   - Active trip: STATE.trips
    //   - Archived trip: nested in STATE.archivedTrips (where this
    //     function gets called from collections.js — the archived
    //     trip carries its own trip.photos/documents post-archive,
    //     so we look there first).
    const trip = (STATE.trips || []).find(t => t.id === day.tripId)
        || (STATE.archivedTrips || []).find(t => t.id === day.tripId);
    /** @type {string[]} */
    const photoSrcs = [
        ...(Array.isArray(day.photos) ? day.photos : []),
        ...((trip?.photos || []).filter(p => p.dayId === day.id).map(p => p.src)),
    ];
    /** @type {{name: string, url: string}[]} */
    const docs = [
        ...(Array.isArray(day.tickets) ? day.tickets : []),
        ...((trip?.documents || []).filter(d => d.dayId === day.id).map(d => ({ name: d.name, url: d.url }))),
    ];
    const renderParagraph = (text) => {
        if (!text || !text.trim()) {
            return `<p style="margin:0; color:var(--text-secondary); font-style:italic;">Nothing planned.</p>`;
        }
        // pre-wrap preserves user's line breaks; esc() defends against XSS.
        return `<p style="margin:0; white-space:pre-wrap; line-height:1.55; color:#002d5b;">${esc(text)}</p>`;
    };
    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 800px; max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);',
        innerHTML: `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-10);">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">Day ${day.dayNumber}</div>
                        ${day.date ? `<div style="color: var(--text-secondary); font-weight: 600; font-size: var(--font-base);">${formatDayDate(day.date) || ''}</div>` : ''}
                        <div style="background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.55); padding: 2px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing:0.05em;">View only</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${esc(day.name || `Day ${day.dayNumber}`)}</h2>
                </div>
                <button id="closeViewBtn" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-10);">
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div class="subcard-soft">
                        <h4 class="text-tag">Morning</h4>
                        ${renderParagraph(day.plan?.morning)}
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 255,149,0;">Afternoon</h4>
                        ${renderParagraph(day.plan?.afternoon)}
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 88,86,214;">Evening</h4>
                        ${renderParagraph(day.plan?.evening)}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div style="background: rgba(0,113,227,0.05); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 class="text-tag">Personal Notes</h4>
                        ${day.notes ? `<p style="margin:0; white-space:pre-wrap; line-height:1.55; color:#002d5b;">${esc(day.notes)}</p>` : `<p style="margin:0; color:var(--text-secondary); font-style:italic;">No notes.</p>`}
                    </div>
                    <!-- Photos + Documents always render. For Trip
                         Genesis these surface the trip-wide bucket
                         (passport, multi-day hotel, return flight…);
                         for numbered days they surface day-specific
                         items. The data union behind photoSrcs / docs
                         pulls trip.photos+documents filtered by this
                         day's id, plus any legacy day.photos/tickets. -->
                    <div style="background: rgba(52,199,89,0.04); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(52,199,89,0.15);">
                        <h4 class="text-tag" style="--accent: 52,199,89;">${Number(day.dayNumber) === 0 ? 'Trip-wide photos' : 'Photos'}${photoSrcs.length > 0 ? ` (${photoSrcs.length})` : ''}</h4>
                        ${photoSrcs.length > 0 ? `
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px;">
                                ${photoSrcs.slice(0, 9).map(src => `<div style="aspect-ratio:1; background-image:url(${esc(src)}); background-size:cover; background-position:center; border-radius:10px;"></div>`).join('')}
                            </div>
                            ${photoSrcs.length > 9 ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:6px;">+${photoSrcs.length - 9} more</div>` : ''}
                        ` : `<p style="margin: 6px 0 0; color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">${Number(day.dayNumber) === 0 ? 'No trip-wide photos yet — add some from the Photos tab.' : 'No photos for this day.'}</p>`}
                    </div>
                    <div style="background: rgba(88,86,214,0.04); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(88,86,214,0.15);">
                        <h4 class="text-tag" style="--accent: 88,86,214;">${Number(day.dayNumber) === 0 ? 'Trip-wide documents' : 'Documents'}${docs.length > 0 ? ` (${docs.length})` : ''}</h4>
                        ${docs.length > 0 ? `
                            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                                ${docs.map(d => `<a href="${esc(d.url || '#')}" target="_blank" rel="noreferrer" style="font-size:0.85rem; color:var(--accent-blue); font-weight:700; text-decoration:none;">📎 ${esc(d.name || 'Document')}</a>`).join('')}
                            </div>
                        ` : `<p style="margin: 6px 0 0; color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">${Number(day.dayNumber) === 0 ? 'No trip-wide docs yet — add passports, hotels, return flights from the Documents tab.' : 'No documents for this day.'}</p>`}
                    </div>
                    <div style="background: #000; padding: var(--space-6); border-radius: 24px; color: white;">
                        <h4 class="text-tag" style="--accent: 52,199,89;">Expert Tip</h4>
                        <p style="margin: 0; font-size: var(--font-md); line-height: 1.5; opacity: 0.9;">${esc(day.tip || "Always keep a portable charger and a small bottle of water in your bag for long exploration days.")}</p>
                    </div>
                </div>
            </div>
        `,
    });
    /** @type {HTMLButtonElement} */ (q(root, '#closeViewBtn')).onclick = () => close();
    // Documents card anchors → PDF preview in-app for .pdf URLs;
    // anything else stays as the default new-tab anchor behavior.
    // Cmd/Ctrl/Shift/middle-click still escape to the browser
    // default. (openDayView is its own modal DOM, separate from
    // the home-page click delegation, so we wire interception here.)
    root.addEventListener('click', (ev) => {
        const target = /** @type {HTMLElement | null} */ (ev.target);
        const a = /** @type {HTMLAnchorElement | null} */ (target?.closest('a[href]'));
        if (!a || !looksLikePdfUrl(a.href)) return;
        const me = /** @type {MouseEvent} */ (ev);
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button === 1) return;
        me.preventDefault();
        openPdfPreview(a.href, a.textContent?.trim().replace(/^📎\s*/, '') || 'Document');
    });
};

const openDayDetail = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    const trip = STATE.trips.find(t => t.id === day.tripId);

    // Permission gate: only planners can edit the plan. Budgeteers and
    // relaxers fall through to the read-only viewer so they can still
    // see what's planned for the day, just can't change it. Without
    // this gate, a relaxer who clicked Open Full Plan got the editable
    // modal with auto-save wired up — they could mutate plan textareas
    // and the writes would even persist (server-side has its own role
    // checks but UX-wise the modal claimed editability it didn't have).
    if (!canEdit(trip)) {
        openDayView(day);
        return;
    }

    // Shortlist section. Pure pool — no per-place day/time metadata.
    // The day-textarea content is the single source of truth for "what
    // is planned for this day"; tag-based metadata used to drift from
    // it (user clicked AM, closed without saving, place stayed tagged
    // but the textarea was empty). Now the AM/PM/Eve buttons just write
    // a line into the matching textarea and immediately persist the
    // day. A live ✓ marker on each button reflects whether the place's
    // name appears in that section's textarea, so the user can see at
    // a glance where each shortlisted place currently lives.
    const allShortlist = (trip?.markedPlaces || []).filter(p => p.forManual);

    const shortlistRowHtml = (p) => `
        <div class="day-shortlist-row" data-place-id="${esc(p.placeId)}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white; border:1px solid ${p.color}40; border-left:3px solid ${p.color}; border-radius:10px;">
            <span style="font-size:1.2rem; line-height:1; flex-shrink:0;">${p.icon}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#002d5b; font-size:0.9rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</div>
                ${p.address ? `<div style="font-size:0.72rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.address)}</div>` : ''}
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="morning" title="Add to Morning"
                    style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color:var(--accent-blue); padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">🌅 AM</button>
                <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="afternoon" title="Add to Afternoon"
                    style="background:rgba(255,149,0,0.08); border:1px solid rgba(255,149,0,0.25); color:#ff9500; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">☀️ PM</button>
                <button type="button" class="day-shortlist-add-btn" data-place-id="${esc(p.placeId)}" data-time="evening" title="Add to Evening"
                    style="background:rgba(88,86,214,0.08); border:1px solid rgba(88,86,214,0.25); color:#5856d6; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">🌙 Eve</button>
            </div>
        </div>
    `;

    const shortlistSectionHtml = allShortlist.length > 0 ? `
        <div style="margin-top: var(--space-10); padding: var(--space-6); background: rgba(155, 89, 182, 0.04); border: 1px solid rgba(155, 89, 182, 0.2); border-radius: 24px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                <span style="font-size: 1.2rem;">📋</span>
                <h4 style="margin:0; color:#9b59b6; font-weight:800; letter-spacing:-0.01em;">From your to-do list</h4>
                <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary);">Click AM / PM / Eve to drop a place into the matching textarea above. ✓ shows where it currently lives.</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${allShortlist.map(shortlistRowHtml).join('')}
            </div>
        </div>
    ` : '';

    // Forward-declared so the modal's `onClose` (fired on Esc /
    // backdrop click) can flush a pending debounced save before the
    // overlay is detached. The actual implementation is assigned a
    // few lines below; TDZ is safe because `onClose` only runs when
    // the user closes the modal, which is always after this fn returns.
    /** @type {(() => void) | null} */
    let flushPendingOnExit = null;

    const { root, close } = showModal({
        cardClass: 'card glass',
        cardStyle: 'width: 800px; max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);',
        innerHTML: `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-10);">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">Day ${day.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: var(--font-base);">${formatDayDate(day.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${esc(day.name)}</h2>
                </div>
                <button id="closeDetailBtn" class="close-x-btn" aria-label="Close">✕</button>
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
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <button id="saveDetailBtn" class="btn-primary" style="width: 100%; padding: var(--space-5); border-radius: var(--radius-xl); font-size: var(--font-xl);">Done</button>
                        <div id="autosaveStatus" style="text-align:center; font-size:0.7rem; color:var(--text-secondary); font-weight:600; min-height:1em;">Changes save automatically</div>
                    </div>
                </div>
            </div>
            ${shortlistSectionHtml}
        `,
        onClose: () => flushPendingOnExit?.(),
    });

    // ── Auto-save plumbing ─────────────────────────────────────────
    // Why: the user used to lose plan edits if they closed the modal
    // without clicking "Save All Changes". Now any input on a plan
    // textarea (or the notes textarea) writes to `day.plan` / `day.notes`
    // immediately and schedules a debounced upsertDay so the server
    // stays in sync without spamming requests on every keystroke.
    const planTextareas = /** @type {NodeListOf<HTMLTextAreaElement>} */
        (root.querySelectorAll('textarea.plan-input'));
    const notesTextarea = /** @type {HTMLTextAreaElement} */
        (q(root, '#detailNotes'));
    const statusEl = /** @type {HTMLElement} */ (q(root, '#autosaveStatus'));

    /** @type {ReturnType<typeof setTimeout> | null} */
    let saveTimer = null;
    let pendingSave = false;

    const flashStatus = (msg, color = 'var(--text-secondary)') => {
        statusEl.textContent = msg;
        statusEl.style.color = color;
    };

    // Pull the current textarea values into `day`. Pure DOM->state read.
    const syncDayFromInputs = () => {
        const morning = /** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="morning"]'))?.value ?? '';
        const afternoon = /** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="afternoon"]'))?.value ?? '';
        const evening = /** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="evening"]'))?.value ?? '';
        day.plan = { morning, afternoon, evening };
        day.notes = notesTextarea?.value ?? '';
    };

    const persistNow = async () => {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        syncDayFromInputs();
        emit('state:changed');
        pendingSave = true;
        flashStatus('Saving…');
        try {
            await upsertDay(day);
            flashStatus('Saved ✓', '#1a6b3c');
            // Decay back to neutral after a beat so the badge isn't
            // permanently green (would imply nothing's pending).
            setTimeout(() => {
                if (statusEl.textContent === 'Saved ✓') flashStatus('Changes save automatically');
            }, 1400);
        } catch (e) {
            console.error('Day auto-save failed:', e);
            flashStatus('Save failed — try again', '#ff3b30');
        } finally {
            pendingSave = false;
        }
    };

    const queueSave = () => {
        syncDayFromInputs();
        emit('state:changed'); // local persistence + UI subscribers
        flashStatus('Editing…');
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, 700);
    };

    // Now that persistNow exists, wire the modal-close flush. Esc /
    // backdrop click → Modal.js calls onClose → we flush. We also
    // capture textarea values into `day` synchronously (before the
    // overlay is detached + before the network round-trip resolves)
    // so a navigate-away mid-save still leaves `day` correct in
    // memory and localStorage.
    flushPendingOnExit = () => {
        if (saveTimer || pendingSave) {
            // Eager DOM read while textareas are still attached.
            syncDayFromInputs();
            emit('state:changed');
            // Fire-and-forget — overlay is being torn down. Server
            // round-trip continues; if it fails we log but UI is gone.
            persistNow().catch(err => console.error('Day flush-on-close failed:', err));
        }
    };

    // ── Live ✓ indicators on shortlist buttons ─────────────────────
    // Refresh after each typing event / each shortlist click so the
    // marker reflects what's actually in the textareas right now.
    // Match by case-insensitive substring of the place name; this is
    // forgiving to user edits ("had dinner at La Brasa" still counts).
    const refreshShortlistButtons = () => {
        const planVals = {
            morning: (/** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="morning"]'))?.value || '').toLowerCase(),
            afternoon: (/** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="afternoon"]'))?.value || '').toLowerCase(),
            evening: (/** @type {HTMLTextAreaElement} */ (root.querySelector('textarea.plan-input[data-time="evening"]'))?.value || '').toLowerCase(),
        };
        root.querySelectorAll('.day-shortlist-add-btn').forEach(b => {
            const btn = /** @type {HTMLButtonElement} */ (b);
            const pid = btn.dataset.placeId;
            const time = /** @type {'morning' | 'afternoon' | 'evening'} */ (btn.dataset.time);
            if (!pid || !time) return;
            const place = allShortlist.find(p => p.placeId === pid);
            if (!place) return;
            const isThere = planVals[time].includes(place.name.toLowerCase());
            // Restore the canonical label, then prefix with ✓ if present.
            const label = time === 'morning' ? '🌅 AM' : time === 'afternoon' ? '☀️ PM' : '🌙 Eve';
            btn.textContent = isThere ? `✓ ${label}` : label;
            btn.style.background = isThere
                ? (time === 'morning' ? 'rgba(0,113,227,0.22)' : time === 'afternoon' ? 'rgba(255,149,0,0.22)' : 'rgba(88,86,214,0.22)')
                : (time === 'morning' ? 'rgba(0,113,227,0.08)' : time === 'afternoon' ? 'rgba(255,149,0,0.08)' : 'rgba(88,86,214,0.08)');
        });
    };

    // Initial paint so reopening a day with prior plans shows ✓ at once.
    refreshShortlistButtons();

    // Wire input events on every editable textarea.
    planTextareas.forEach(ta => {
        ta.addEventListener('input', () => {
            queueSave();
            refreshShortlistButtons();
        });
    });
    notesTextarea?.addEventListener('input', () => { queueSave(); });

    // Wire shortlist "Add to AM/PM/Eve" buttons. Each click appends
    // "- {name}" on a new line to the matching textarea, syncs the
    // day from inputs, and persists immediately (no debounce — the
    // user expects the click to "stick"). Re-render the ✓ markers
    // so the just-clicked button shows ✓ right away.
    root.addEventListener('click', (ev) => {
        const target = /** @type {HTMLElement | null} */ (ev.target);
        const btn = target?.closest('.day-shortlist-add-btn');
        if (!btn) return;
        const pid = /** @type {HTMLElement} */ (btn).dataset.placeId;
        const time = /** @type {HTMLElement} */ (btn).dataset.time;
        if (!pid || !time || !trip) return;
        const place = allShortlist.find(p => p.placeId === pid);
        if (!place) return;
        const ta = /** @type {HTMLTextAreaElement | null} */
            (root.querySelector(`textarea.plan-input[data-time="${time}"]`));
        if (!ta) return;
        const line = `- ${place.name}`;
        // Don't double-add: if the name is already in this section,
        // bail out silently. The visual ✓ already conveys "it's there".
        if (ta.value.toLowerCase().includes(place.name.toLowerCase())) {
            // Tiny shake-feedback so the user knows we noticed the click.
            /** @type {HTMLButtonElement} */ (btn).animate(
                [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
                { duration: 220, easing: 'ease-out' }
            );
            return;
        }
        ta.value = ta.value.trim().length > 0 ? `${ta.value.trim()}\n${line}` : line;
        // Persist now (no debounce wait) — the user's click is an
        // explicit save signal.
        persistNow();
        refreshShortlistButtons();
    });

    /** @type {HTMLButtonElement} */ (q(root, '#closeDetailBtn')).onclick = async () => {
        // Flush any pending debounce so closing-while-typing doesn't drop
        // the last keystroke. persistNow clears the timer + saves.
        if (saveTimer || pendingSave) await persistNow();
        close();
    };
    /** @type {HTMLButtonElement} */ (q(root, '#saveDetailBtn')).onclick = async () => {
        // Manual "Done" button — explicit save + close. Mostly redundant
        // with auto-save but kept as a comfortable Big Button exit.
        await persistNow();
        showLiquidAlert("Itinerary updated!");
        close();
        navigate('home');
    };
};



