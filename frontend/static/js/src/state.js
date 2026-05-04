// @ts-check
// state.js — Global STATE object and persistence helpers

import { EVENTS } from './constants.js';
import { validateLoadedState } from './schemas.js';

// api.js helpers are imported at call-site, not here.

/** @type {import('./types').AppState} */
export const STATE = {
    trips: [],
    activeTripId: null,
    categories: [
        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
    ],
    expenses: [],
    groups: [], // List of people names
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
    notifications: []
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
const _subscribers = new Map();

/**
 * @param {import('./constants.js').EventName} event
 * @param {(payload?: any) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(event, fn) {
    if (!_subscribers.has(event)) _subscribers.set(event, new Set());
    _subscribers.get(event).add(fn);
    return () => _subscribers.get(event)?.delete(fn);
}

/**
 * @param {import('./constants.js').EventName} event
 * @param {any} [payload]
 */
export function emit(event, payload) {
    _subscribers.get(event)?.forEach(fn => {
        try { fn(payload); }
        catch (e) { console.error(`Subscriber for "${event}" threw:`, e); }
    });
}

// Default subscriber: persistence happens whenever state changes.
subscribe(EVENTS.STATE_CHANGED, saveState);
