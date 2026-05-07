// state.ts — Global STATE object and persistence helpers

import { EVENTS, type EventName } from './constants.js';
import { validateLoadedState } from './schemas.js';
import { normalizeTripCompanions } from './companions.js';
import type { AppState } from './types';

// api.ts helpers are imported at call-site, not here.

export const STATE: AppState = {
    trips: [],
    activeTripId: null,
    categories: [
        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
    ],
    expenses: [],
    draftExpense: {
        who: '',
        categoryId: '',
        label: '',
        date: '',
        country: '',
        value: '',
        currency: 'EUR',
        euroValue: ''
    },
    insightCurrency: 'EUR',
    rateMode: 'at_trip', // 'at_trip' or 'today'
    rateCache: {}, // { 'YYYY-MM-DD_FROM_TO': rate }
    user: null, // Stores { id, name, email, picture }
    hasLoggedInBefore: false, // Tracks if user has ever signed in
    /** User's personal Gemini API key for the AI planner. Bring-your-own
     *  so we don't burn a shared host key on friends/family rollouts.
     *  Stored on this device only (localStorage), sent in each
     *  /api/generate_itinerary request body; backend falls back to its
     *  GEMINI_API_KEY env var when this is empty (dev / self-hosted). */
    geminiApiKey: '',
    excelMapping: {
        who: 'Who',
        categoryId: 'Category',
        label: 'Label',
        date: 'Date',
        country: 'Country',
        value: 'Value',
        currency: 'Currency',
        euroValue: 'Euro Value'
    },
    activities: [],
    photos: [],
    budgets: [],
    savedFormats: [],    // Array of {id, name, mappings:[{variable,column}]} — max 5
    tripDays: [],        // Array of {id, tripId, name, dayNumber, photos: []}
    archivedTrips: [],   // Array of completed trips
    activeDetailId: null, // Store ID for detail views (e.g. archived trip detail)
    notifications: [],
    /** User preferences.
     *  - `mapDefaultPois` is legacy from when only some pills were
     *    visible by default (now all are; field kept for backward
     *    compat with any existing snapshots).
     *  - `poiFilters` holds per-category filter overrides for the
     *    home-map Places search. Shape: { [pillKey]: { minRating } }.
     *    Empty / missing keys fall back to the category's
     *    defaultMinRating in POI_CATEGORIES (see pages/home.js).
     *  - `pillEpicenters` holds the search center the user picked per
     *    trip. Shape: { [tripId]: dayId }. Falls back to the trip's
     *    genesis day when unset. The user toggles this from the day
     *    actions panel ("Set as search center").
     *  - `poiAnchoring` is the per-pill override of "always use genesis"
     *    vs "use the user-picked day epicenter". Shape:
     *    { [pillKey]: 'epicenter' | 'genesis' }. Empty / missing keys
     *    fall back to the category's useGenesisAlways flag in
     *    POI_CATEGORIES (see pages/home.js). The user customises this
     *    in Settings → General.
     *  - `poiVisible` controls which pills appear in the home pill row.
     *    Shape: { [pillKey]: boolean }. Missing key OR true means
     *    visible; false means hidden. Default {} = every pill visible.
     *  - `enabledPois` persists per-trip which pills the user had
     *    toggled ON. Shape: { [tripId]: string[] }. The home page
     *    restores these on render so toggling Restaurants then
     *    navigating away and back keeps the pill (and its markers)
     *    active. Each restore fires a fresh Places API call since
     *    in-memory cache is per-render. */
    preferences: {
        mapDefaultPois: ['sights', 'parks', 'transit'],
        poiFilters: {},
        pillEpicenters: {},
        poiAnchoring: {},
        poiVisible: {},
        enabledPois: {},
    },
};

export function loadState() {
    const saved = localStorage.getItem('theGreatEscapeState');
    if (saved) {
        // Schema validation at the boundary — corrupt localStorage (manual
        // edits, version mismatch, half-flushed writes) would otherwise leak
        // bad shapes into STATE and crash 5 levels deep. validateLoadedState
        // returns ok=false with a useful message; we log and start fresh.
        let parsed;
        try {
            parsed = JSON.parse(saved);
        } catch (e) {
            console.error('localStorage parse failed — starting with empty state:', e);
            parsed = null;
        }
        if (parsed) {
            const result = validateLoadedState(parsed);
            if (result.ok) {
                Object.assign(STATE, result.value);
            } else {
                console.error('localStorage shape invalid — starting with empty state:', result.error);
            }
        }
    }
    // Ensure new fields exist
    if (!STATE.savedFormats) STATE.savedFormats = [];
    if (!STATE.tripDays) STATE.tripDays = [];
    if (!STATE.archivedTrips) STATE.archivedTrips = [];
    if (!STATE.preferences) STATE.preferences = { mapDefaultPois: ['sights', 'parks', 'transit'], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} };
    if (!Array.isArray(STATE.preferences.mapDefaultPois)) {
        STATE.preferences.mapDefaultPois = ['sights', 'parks', 'transit'];
    }
    if (!STATE.preferences.poiFilters || typeof STATE.preferences.poiFilters !== 'object') {
        STATE.preferences.poiFilters = {};
    }
    if (!STATE.preferences.pillEpicenters || typeof STATE.preferences.pillEpicenters !== 'object') {
        STATE.preferences.pillEpicenters = {};
    }
    if (!STATE.preferences.poiAnchoring || typeof STATE.preferences.poiAnchoring !== 'object') {
        STATE.preferences.poiAnchoring = {};
    }
    if (!STATE.preferences.poiVisible || typeof STATE.preferences.poiVisible !== 'object') {
        STATE.preferences.poiVisible = {};
    }
    if (!STATE.preferences.enabledPois || typeof STATE.preferences.enabledPois !== 'object') {
        STATE.preferences.enabledPois = {};
    }

    // Per-trip companions used to be `string[]` of names. Promote any
    // legacy snapshot in localStorage to the `Companion[]` shape so the
    // home chip builder, picker, settlement balance, etc. can all assume
    // objects with `.name`. Without this an older browser session would
    // crash on `chip.name.charAt(...)` because `chip.name` was undefined
    // (the iterator was reading a bare string instead of an object).
    // Helper: every trip should have a Day-0 / Trip-Genesis row;
    // openNewTripModal stamps one for new trips, but archived legacy
    // data may not. We use it as the canonical "trip-wide" bucket
    // for documents and photos — see the migration below.
    /** @param {string} tripId @param {{id:string,dayNumber:number,tripId?:string}[]} pool */
    const findGenesisId = (tripId, pool) => {
        const g = (pool || []).find(d => d.tripId === tripId && Number(d.dayNumber) === 0);
        return g ? g.id : null;
    };

    for (const trip of STATE.trips || []) {
        trip.companions = normalizeTripCompanions(trip.companions);
        // Backfill so every read site can drop the `(trip.markedPlaces || [])`
        // dance and assume an array. New trips ship with [], but pre-feature
        // localStorage snapshots may not have the field at all.
        if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
        // To-do/AI consolidation migration: the old model had two independent
        // flags (`forManual` = shortlist tab, `forAI` = AI planner list). We
        // collapsed those into a single To-do list (`forManual`) where each
        // entry can additionally be ticked for AI consideration (`forAI`).
        // Items that previously lived ONLY in the AI list (forAI:true,
        // forManual:false) would otherwise vanish from the new To-do tab.
        // Set forManual:true on those so they surface in the to-do list with
        // their AI-tick already on — preserving both surfaces' worth of work.
        for (const p of trip.markedPlaces) {
            if (p && p.forAI && !p.forManual) p.forManual = true;
        }
        // Trip-level Documents and Photos. Each entry has an optional
        // dayId; "trip-wide" means dayId === Trip Genesis (Day 0).
        // Earlier snapshots used dayId: null to mean trip-wide; this
        // migration moves those to dayId: genesisId so the data has a
        // single canonical representation. The Photos / Documents tabs
        // and the Genesis day card both now key off Genesis as the
        // trip-wide bucket.
        if (!Array.isArray(trip.documents)) trip.documents = [];
        if (!Array.isArray(trip.photos)) trip.photos = [];
        // Trip checklist — packing / errands / pre-trip tasks. Surfaced
        // as a Genesis option (Genesis is the trip's central hub).
        // Each item: { id, body, done, created_at }. Always-array
        // shape so read sites can drop the `(trip.checklist || [])` dance.
        if (!Array.isArray(trip.checklist)) trip.checklist = [];
        const genesisId = findGenesisId(trip.id, STATE.tripDays || []);
        if (genesisId) {
            for (const d of trip.documents) {
                if (d && (d.dayId === null || d.dayId === undefined)) d.dayId = genesisId;
            }
            for (const p of trip.photos) {
                if (p && (p.dayId === null || p.dayId === undefined)) p.dayId = genesisId;
            }
        }
    }
    for (const trip of STATE.archivedTrips || []) {
        trip.companions = normalizeTripCompanions(trip.companions);
        if (!Array.isArray(trip.markedPlaces)) trip.markedPlaces = [];
        // Same to-do/AI consolidation migration as live trips above.
        for (const p of trip.markedPlaces) {
            if (p && p.forAI && !p.forManual) p.forManual = true;
        }
        if (!Array.isArray(trip.documents)) trip.documents = [];
        if (!Array.isArray(trip.photos)) trip.photos = [];
        if (!Array.isArray(trip.checklist)) trip.checklist = [];
        // Archived trips carry their tripDays nested on the trip
        // object (see collections.js restoreTrip), so Genesis lookup
        // pulls from there rather than STATE.tripDays.
        const genesisId = findGenesisId(trip.id, trip.tripDays || []);
        if (genesisId) {
            for (const d of trip.documents) {
                if (d && (d.dayId === null || d.dayId === undefined)) d.dayId = genesisId;
            }
            for (const p of trip.photos) {
                if (p && (p.dayId === null || p.dayId === undefined)) p.dayId = genesisId;
            }
        }
    }

    // Backfill: every trip the current user owns should have a self-linked
    // companion entry so the Who-Paid dropdown lists them out of the box,
    // AND a matching owner row in `members` so the picker / chip panel
    // recognise that self-link as accepted (otherwise it shows as ⏳ Pending
    // until the next /api/data poll). openNewTripModal stamps both for
    // new trips going forward; this loop covers older snapshots.
    if (STATE.user?.id) {
        const me = STATE.user;
        const myFirstName = me.name?.split(' ')[0] || 'Me';
        for (const trip of STATE.trips || []) {
            if (trip.ownerId !== me.id) continue;
            if (!trip.companions) trip.companions = [];
            const hasSelfCompanion = trip.companions.some(c => c.linkedUserId === me.id);
            if (!hasSelfCompanion) {
                trip.companions.unshift({ name: myFirstName, linkedUserId: me.id });
            }
            if (!trip.members) trip.members = [];
            const hasSelfMember = trip.members.some(m => m.userId === me.id);
            if (!hasSelfMember) {
                trip.members.unshift({
                    userId: me.id,
                    role: 'planner',
                    archived: false,
                    name: me.name ?? null,
                    picture: me.picture ?? null,
                });
            }
        }
    }
    STATE.tripDays.forEach(d => {
        if (!d.tickets) d.tickets = [];
        if (d.notes === undefined) d.notes = '';
        if (!d.plan) d.plan = { morning: '', afternoon: '', evening: '' };
    });

    // Ensure activeTripId is valid
    if (STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips.find(t => t.id === STATE.activeTripId))) {
        STATE.activeTripId = STATE.trips[0].id;
    }
}

export function saveState() {
    // Ensure all days have tickets array
    if (STATE.tripDays) {
        STATE.tripDays.forEach(d => { if (!d.tickets) d.tickets = []; });
    }
    localStorage.setItem('theGreatEscapeState', JSON.stringify(STATE));
    // Pure persistence — UI updates and server deltas are handled by separate
    // subscribers (see main.js) and explicit call sites.
}

// ── Tiny event bus ─────────────────────────────────────────────────────────────
// emit(EVENTS.STATE_CHANGED) from any mutation site to fan out to subscribers.
// All mutation call sites now use the bus; saveState is no longer called
// directly outside this file. UI subscribers (e.g. updateTripSelector) are
// wired in main.js to keep this layer free of UI concerns.
//
// `event` is typed against the EventName union so typos like 'state:changd'
// fail typecheck. Plain literals matching the values still pass — no need
// to refactor every call site to use the constant.
type Subscriber = (payload?: unknown) => void;
const _subscribers = new Map<EventName, Set<Subscriber>>();

export function subscribe(event: EventName, fn: Subscriber): () => void {
    let bucket = _subscribers.get(event);
    if (!bucket) {
        bucket = new Set();
        _subscribers.set(event, bucket);
    }
    bucket.add(fn);
    return () => _subscribers.get(event)?.delete(fn);
}

export function emit(event: EventName, payload?: unknown): void {
    _subscribers.get(event)?.forEach(fn => {
        try { fn(payload); }
        catch (e) { console.error(`Subscriber for "${event}" threw:`, e); }
    });
}

// Default subscriber: persistence happens whenever state changes.
subscribe(EVENTS.STATE_CHANGED, saveState);
